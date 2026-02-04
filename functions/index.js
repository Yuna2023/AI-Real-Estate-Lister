const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();
const db = admin.firestore();

const generateDisplayId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `REF-${result}`;
};

const processImages = (images) => {
  if (!images || !Array.isArray(images) || images.length === 0) {
    return ["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&q=80&w=800"];
  }
  if (images.length < 3) return images;
  return [...images].sort(() => 0.5 - Math.random()).slice(0, 5);
};

const { onCall, HttpsError } = require("firebase-functions/v2/https");

// ========================================
// Markdown 預處理
// ========================================
const preprocessMarkdown = (markdown) => {
  let cleaned = markdown;

  // 1. 移除所有 <img> 標籤（圖片對解析無用，且佔用大量 tokens）
  cleaned = cleaned.replace(/<img[^>]*>/gi, '');

  // 2. 移除 <a> 標籤的 href，只保留文字內容
  cleaned = cleaned.replace(/<a\s+[^>]*href="[^"]*"[^>]*>(.*?)<\/a>/gi, '$1');

  // 3. 移除所有 CSS class 和 style 屬性
  cleaned = cleaned.replace(/\s*class="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s*style="[^"]*"/gi, '');

  // 4. 移除 HTML 註解
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/gi, '');

  // 5. 移除無用區塊（導航、廣告、相關房源等）
  const removePatterns = [
    /Similar homes[\s\S]*?(?=##|$)/gi,
    /Mortgage calculator[\s\S]*?(?=##|$)/gi,
    /Home values[\s\S]*?(?=##|$)/gi,
    /Neighborhood[\s\S]*?(?=##|$)/gi,
    /Recently sold[\s\S]*?(?=##|$)/gi,
    /Payment calculator[\s\S]*?(?=##|$)/gi,
    /Schools[\s\S]*?(?=##|$)/gi,
    /What locals say[\s\S]*?(?=##|$)/gi,
    /Share this home[\s\S]*?(?=##|$)/gi,
    /<footer>[\s\S]*?<\/footer>/gi,
    /<nav>[\s\S]*?<\/nav>/gi,
    /<header>[\s\S]*?<\/header>/gi,
  ];
  removePatterns.forEach(pattern => { cleaned = cleaned.replace(pattern, ''); });

  // 6. 移除多餘空白和換行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  return cleaned.slice(0, 3500); // 保留 3500 字元以確保包含足夠資訊
};

// ========================================
// 單一階段完整解析 (含自動降級 + 增強重試)
// ========================================
const extractPropertyData = async (markdown, geminiApiKey, onStatus = null) => {
  const processedMarkdown = preprocessMarkdown(markdown);
  console.log('[Gemini] Processed markdown length:', processedMarkdown.length);

  const genAI = new GoogleGenerativeAI(geminiApiKey);

  // 使用環境變數或預設別名
  const modelName = process.env.GEMINI_MODEL || "gemini-flash-latest";
  console.log(`[Gemini] Using model: ${modelName}`);

  // 定義完整 Response Schema
  const propertySchema = {
    type: "object",
    properties: {
      price: { type: "string", description: "Price with currency symbol" },
      address: { type: "string", description: "Full street address" },
      region: { type: "string", description: "City name" },
      beds: { type: "string", description: "Number of bedrooms" },
      baths: { type: "string", description: "Number of bathrooms" },
      sqft: { type: "string", description: "Interior sqft" },
      yearBuilt: { type: "string", nullable: true, description: "Year built" },
      lotSizeSqft: { type: "string", nullable: true, description: "Lot size in sqft" },
      lotSizeAcres: { type: "string", nullable: true, description: "Lot size in acres" },
      daysOnMarket: { type: "string", nullable: true, description: "Days on market" },
      armls: { type: "string", nullable: true, description: "MLS number" },
      description: { type: "string", nullable: true, description: "Property summary" },
      images: { type: "array", items: { type: "string" }, description: "Image URLs" },
      priceStatus: { type: "string", enum: ["price_drop", "normal", "sold", "pending"] },
      priceDropAmount: { type: "string", nullable: true, description: "Price drop amount" },
      originalPrice: { type: "string", nullable: true, description: "Original price" }
    },
    required: ["price", "address", "region", "beds", "baths", "sqft", "images", "description"]
  };

  // 模式設定：標準模式 vs 精簡模式
  const modes = [
    {
      name: "standard",
      tokens: 2000,
      instruction: "Extract property details. Return valid JSON only. Description MUST be under 150 words. Images: return only the FIRST 3 image URLs found."
    },
    {
      name: "compact",
      tokens: 1500,
      instruction: "COMPACT MODE: Return minimal JSON. Description MAX 80 words. Images: only FIRST 2 URLs. Keep all values SHORT."
    }
  ];

  const prompt = `Extract property details from listing:\n\n${processedMarkdown}`;
  const maxRetriesPerMode = 2; // 每個模式最多重試 2 次

  // 嘗試標準模式，失敗則降級
  for (const mode of modes) {
    for (let attempt = 1; attempt <= maxRetriesPerMode; attempt++) {
      const statusMsg = attempt === 1
        ? `${mode.name} 模式解析中...`
        : `${mode.name} 模式重試 (${attempt}/${maxRetriesPerMode})...`;

      if (onStatus) onStatus(statusMsg);
      console.log(`[Gemini] ${statusMsg} (maxTokens: ${mode.tokens})`);

      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: propertySchema,
          maxOutputTokens: mode.tokens
        },
        systemInstruction: mode.instruction
      });

      try {
        const result = await model.generateContent(prompt);
        let rawText = result.response.text();

        // 安全處理：移除可能的 Markdown code block
        rawText = rawText.trim();
        if (rawText.startsWith('```')) {
          rawText = rawText.replace(/^```(?:json)?/, '').replace(/```$/, '');
        }

        const parsed = JSON.parse(rawText);
        console.log(`[Gemini] ${mode.name} mode succeeded!`);
        if (onStatus) onStatus('解析完成');
        return parsed;

      } catch (error) {
        console.error(`[Gemini] ${mode.name} mode attempt ${attempt} failed:`, error.message);

        // 如果是 429/503 等伺服器錯誤，等待 5 秒後重試
        if (error.message?.includes('429') || error.message?.includes('503')) {
          if (onStatus) onStatus('伺服器忙碌，等待重試...');
          console.log('[Gemini] Rate limit hit, waiting 5 seconds...');
          await new Promise(r => setTimeout(r, 5000));
          continue; // 繼續同一模式的下一次嘗試
        }

        // JSON 解析錯誤，不重試同一模式，直接跳到下一個模式
        if (error.message?.includes('JSON') || error.message?.includes('Unterminated')) {
          console.log('[Gemini] JSON parsing error, skipping to next mode...');
          break; // 跳出內層迴圈，進入下一個模式
        }

        // 其他錯誤，繼續重試
        if (attempt < maxRetriesPerMode) {
          if (onStatus) onStatus(`重試中 (${attempt + 1}/${maxRetriesPerMode})...`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    // 如果已經是最後一個模式且失敗，拋出錯誤
    if (mode.name === 'compact') {
      throw new Error('Gemini 解析失敗 (已嘗試所有模式)');
    }

    // 否則降級到下一個模式
    if (onStatus) onStatus('降級到精簡模式...');
    console.log('[Gemini] Falling back to compact mode...');
  }
};

// ========================================
// 計算距離
// ========================================
const calculateDistancesInternal = async (origin, apiKey) => {
  if (!origin || !apiKey) return { distances: {}, durations: {} };

  const destinations = [
    "5088 W Innovation Cir, Phoenix, AZ 85083",
    "4500 S Dobson Rd, Chandler, AZ 85248",
    "3400 E Sky Harbor Blvd, Phoenix, AZ 85034",
    "16901 N 79th Ave, Peoria, AZ 85382"
  ];

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destinations.join('|'))}&units=imperial&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.rows?.[0]?.elements) {
      return { distances: {}, durations: {} };
    }

    const elements = data.rows[0].elements;
    const parseMiles = (el) => (el.status === 'OK' && el.distance) ? parseFloat(el.distance.text.replace(/[^0-9.]/g, '')) || null : null;
    const parseMinutes = (el) => {
      if (el.status !== 'OK' || !el.duration) return null;
      const text = el.duration.text;
      let total = 0;
      const h = text.match(/(\d+)\s*hour/);
      const m = text.match(/(\d+)\s*min/);
      if (h) total += parseInt(h[1]) * 60;
      if (m) total += parseInt(m[1]);
      return total || null;
    };

    return {
      distances: { tsmc: parseMiles(elements[0]), intel: parseMiles(elements[1]), airport: parseMiles(elements[2]), costco: parseMiles(elements[3]) },
      durations: { tsmc: parseMinutes(elements[0]), intel: parseMinutes(elements[1]), airport: parseMinutes(elements[2]), costco: parseMinutes(elements[3]) }
    };
  } catch (e) {
    console.error("Distance error:", e);
    return { distances: {}, durations: {} };
  }
};

// ========================================
// API: 單一房源抓取
// ========================================
// ========================================
// API: 單一房源抓取
// ========================================
exports.apiScrapeProperty = onCall({
  secrets: ["FIRECRAWL_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL"],
  timeoutSeconds: 60,
  cors: true,
  region: "us-central1"
}, async (request) => {
  const { url } = request.data;
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!url) throw new HttpsError('invalid-argument', '請提供 URL');

  // Firecrawl
  const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 30000 })
  });
  const scrapeData = await resp.json();
  if (!scrapeData.success) throw new HttpsError('internal', scrapeData.error || 'Firecrawl 失敗');

  const markdown = scrapeData.data?.markdown;
  if (!markdown || markdown.length < 100) throw new HttpsError('internal', 'Markdown 內容不足');

  // 單一階段完整解析
  const data = await extractPropertyData(markdown, geminiApiKey);

  // 數值處理
  const priceUsd = data.price ? parseFloat(data.price.replace(/[^0-9.]/g, '')) : 0;
  const sqftToPin = (val) => val ? (parseFloat(val) / 35.58).toFixed(1) : null;

  const calculateLotSqft = (acres, sqft) => {
    if (sqft) return sqft.replace(/[^0-9.]/g, '');
    if (acres) return Math.round(parseFloat(acres.replace(/[^0-9.]/g, '')) * 43560).toString();
    return null;
  };
  const lotSqft = calculateLotSqft(data.lotSizeAcres, data.lotSizeSqft);

  const propertyData = {
    url: url.trim().replace(/\/$/, "").toLowerCase(),
    displayId: generateDisplayId(),
    createdAt: new Date().toISOString().split('T')[0],

    // 核心資訊
    price: data.price || null,
    price_usd: priceUsd,
    address: data.address || null,
    region: data.region || null,
    beds: data.beds || null,
    baths: data.baths || null,
    sqft: data.sqft || null,
    sqftPing: sqftToPin(data.sqft),

    // 詳細資訊 (直接填充)
    sqftLot: lotSqft,
    sqftLotPing: sqftToPin(lotSqft),
    description: data.description || null,
    descriptionZh: null, // 按需翻譯
    yearBuilt: data.yearBuilt || null,
    daysOnMarket: data.daysOnMarket || null,
    armls: data.armls || null,
    priceStatus: data.priceStatus || 'normal',
    priceDropAmount: data.priceDropAmount || null,
    originalPrice: data.originalPrice || null,

    // 多圖處理
    images: processImages(data.images),

    // 距離欄位 (需另行計算)
    tsmc_distance_miles: null,
    tsmc_duration_minutes: null,
    intel_distance_miles: null,
    intel_duration_minutes: null,
    airport_distance_miles: null,
    airport_duration_minutes: null,
    costco_distance_miles: null,
    costco_duration_minutes: null,
    distanceCalculated: false,

    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    listing_status: 'pre_listed',
    edit_status: 'draft', // 一次完成，直接進入 draft
    tags: data.region ? [data.region] : [],
    price_drop: data.priceStatus === 'price_drop',
    school_district: "一般",
    road_frontage: false,
    orientation: false
  };

  const docRef = await db.collection("listings").add(propertyData);

  return { ...propertyData, id: docRef.id };
});

// ========================================
// API: 批次抓取 (並行獨立處理 + 即時狀態)
// ========================================
exports.apiScrapeBatch = onCall({
  secrets: ["FIRECRAWL_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL"],
  timeoutSeconds: 300,
  cors: true,
  region: "us-central1"
}, async (request) => {
  const { urls } = request.data;
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    throw new HttpsError('invalid-argument', '請提供 URL 陣列');
  }

  const totalCount = urls.length;

  // 建立批次任務狀態文件
  const batchId = `batch_${Date.now()}`;
  const statusRef = db.collection('batch_status').doc(batchId);

  await statusRef.set({
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    total: totalCount,
    completed: 0,
    failed: 0,
    currentStatus: '開始處理...',
    items: urls.map((url, i) => ({
      index: i + 1,
      url,
      status: 'pending',
      message: '等待中'
    }))
  });

  console.log(`[Batch] 開始處理 ${totalCount} 筆，狀態追蹤: ${batchId}`);

  // 更新單一項目狀態的輔助函數
  const updateItemStatus = async (index, status, message) => {
    const doc = await statusRef.get();
    const items = doc.data().items;
    items[index] = { ...items[index], status, message };

    const completed = items.filter(i => i.status === 'success').length;
    const failed = items.filter(i => i.status === 'error').length;

    await statusRef.update({
      items,
      completed,
      failed,
      currentStatus: `處理中 (${completed + failed}/${totalCount})...`
    });
  };

  // 並行處理流水線
  const processingPromises = urls.map(async (url, index) => {
    try {
      // 1. Firecrawl 抓取
      await updateItemStatus(index, 'scraping', `正在抓取第 ${index + 1} 筆...`);
      console.log(`[Batch] 抓取中 (${index + 1}/${totalCount}): ${url}`);

      const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 30000 })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Firecrawl error');

      const markdown = data.data?.markdown;
      if (!markdown || markdown.length < 100) throw new Error("Markdown 內容不足");

      // 2. Gemini 完整解析 (含狀態回調)
      await updateItemStatus(index, 'parsing', `正在解析第 ${index + 1} 筆...`);

      const onGeminiStatus = async (msg) => {
        await updateItemStatus(index, 'parsing', `第 ${index + 1} 筆: ${msg}`);
      };

      const extractData = await extractPropertyData(markdown, geminiApiKey, onGeminiStatus);

      // 3. 資料處理與寫入
      await updateItemStatus(index, 'saving', `正在儲存第 ${index + 1} 筆...`);

      const priceUsd = extractData.price ? parseFloat(extractData.price.replace(/[^0-9.]/g, '')) : 0;
      const sqftToPin = (val) => val ? (parseFloat(val) / 35.58).toFixed(1) : null;

      const calculateLotSqft = (acres, sqft) => {
        if (sqft) return sqft.replace(/[^0-9.]/g, '');
        if (acres) return Math.round(parseFloat(acres.replace(/[^0-9.]/g, '')) * 43560).toString();
        return null;
      };
      const lotSqft = calculateLotSqft(extractData.lotSizeAcres, extractData.lotSizeSqft);

      const propertyData = {
        url: url.trim().replace(/\/$/, "").toLowerCase(),
        displayId: generateDisplayId(),
        createdAt: new Date().toISOString().split('T')[0],

        price: extractData.price || null,
        price_usd: priceUsd,
        address: extractData.address || null,
        region: extractData.region || null,
        beds: extractData.beds || null,
        baths: extractData.baths || null,
        sqft: extractData.sqft || null,
        sqftPing: sqftToPin(extractData.sqft),

        sqftLot: lotSqft,
        sqftLotPing: sqftToPin(lotSqft),
        description: extractData.description || null,
        descriptionZh: null,
        yearBuilt: extractData.yearBuilt || null,
        daysOnMarket: extractData.daysOnMarket || null,
        armls: extractData.armls || null,
        priceStatus: extractData.priceStatus || 'normal',
        priceDropAmount: extractData.priceDropAmount || null,
        originalPrice: extractData.originalPrice || null,

        images: processImages(extractData.images),

        tsmc_distance_miles: null,
        tsmc_duration_minutes: null,
        intel_distance_miles: null,
        intel_duration_minutes: null,
        airport_distance_miles: null,
        airport_duration_minutes: null,
        costco_distance_miles: null,
        costco_duration_minutes: null,
        distanceCalculated: false,

        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        listing_status: 'pre_listed',
        edit_status: 'draft',
        tags: extractData.region ? [extractData.region] : [],
        price_drop: extractData.priceStatus === 'price_drop',
        school_district: "一般",
        road_frontage: false,
        orientation: false
      };

      const docRef = await db.collection('listings').add(propertyData);
      await updateItemStatus(index, 'success', `✓ 完成`);
      console.log(`[Batch] 完成寫入 (${index + 1}/${totalCount}): ${docRef.id}`);

      return { url, success: true, id: docRef.id };

    } catch (err) {
      await updateItemStatus(index, 'error', `✗ ${err.message}`);
      console.error(`[Batch] 失敗 (${index + 1}/${totalCount}, ${url}):`, err.message);
      return { url, success: false, error: err.message };
    }
  });

  // 等待所有並行任務完成
  const results = await Promise.all(processingPromises);

  // 更新最終狀態
  await statusRef.update({
    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    currentStatus: '處理完成',
    completed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  });

  return {
    success: true,
    batchId,
    processed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results
  };
});

// ========================================
// API: 計算距離（按需）
// ========================================
exports.apiCalculateDistances = onCall({
  secrets: ["GOOGLE_MAPS_API_KEY"],
  timeoutSeconds: 30,
  cors: true,
  region: "us-central1"
}, async (request) => {
  const { listingId, address } = request.data;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!listingId || !address) {
    throw new HttpsError('invalid-argument', '請提供 listingId 和 address');
  }

  const { distances, durations } = await calculateDistancesInternal(address, apiKey);

  const updateData = {
    tsmc_distance_miles: distances.tsmc || null,
    tsmc_duration_minutes: durations.tsmc || null,
    intel_distance_miles: distances.intel || null,
    intel_duration_minutes: durations.intel || null,
    airport_distance_miles: distances.airport || null,
    airport_duration_minutes: durations.airport || null,
    costco_distance_miles: distances.costco || null,
    costco_duration_minutes: durations.costco || null,
    distanceCalculated: true,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('listings').doc(listingId).update(updateData);
  return { success: true, distances, durations };
});

// ========================================
// API: 翻譯描述（按需）
// ========================================
exports.apiTranslateDescription = onCall({
  secrets: ["GEMINI_API_KEY"],
  timeoutSeconds: 30,
  cors: true,
  region: "us-central1"
}, async (request) => {
  const { listingId, text } = request.data;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!listingId || !text) {
    throw new HttpsError('invalid-argument', '請提供 listingId 和 text');
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `將以下英文房地產描述翻譯成繁體中文，保持專業語調：\n\n${text}\n\n只回傳翻譯結果。`;

  try {
    const result = await model.generateContent(prompt);
    const translatedText = result.response.text().trim();

    await db.collection('listings').doc(listingId).update({
      descriptionZh: translatedText,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, translatedText };
  } catch (err) {
    throw new HttpsError('internal', `翻譯失敗: ${err.message}`);
  }
});
