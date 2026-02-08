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
const { logger } = require("firebase-functions");

// ========================================
// Markdown 預處理 (含 cchanghomes.com 專屬規則)
// ========================================
const preprocessMarkdown = (markdown) => {
  let cleaned = markdown;

  // 1. 移除所有 <img> 標籤
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
    // cchanghomes.com 專屬規則
    /Schedule a Showing[\s\S]*?(?=##|$)/gi,
    /Request More Info[\s\S]*?(?=##|$)/gi,
    /Contact Agent[\s\S]*?(?=##|$)/gi,
    /Save Property[\s\S]*?(?=##|$)/gi,
    /Share Listing[\s\S]*?(?=##|$)/gi,
    /Featured Listings[\s\S]*?(?=##|$)/gi,
  ];
  removePatterns.forEach(pattern => { cleaned = cleaned.replace(pattern, ''); });

  // 6. 移除多餘空白和換行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  return cleaned.slice(0, 7000); // 提高至 7000 字元以支援豪宅頁面
};

// ========================================
// Fallback 正則解析 (當 Gemini 失敗時使用)
// ========================================
const extractWithRegex = (markdown) => {
  console.log('[Regex Fallback] Attempting regex extraction...');

  const result = {
    price: null,
    address: null,
    region: null,
    beds: null,
    baths: null,
    sqft: null,
    yearBuilt: null,
    lotSizeSqft: null,
    lotSizeAcres: null,
    daysOnMarket: null,
    armls: null,
    description: null,
    images: [],
    priceStatus: 'normal',
    priceDropAmount: null,
    originalPrice: null
  };

  // 價格提取
  const pricePatterns = [
    /\$\s*([\d,]+(?:\.\d{2})?)/,
    /Price[:\s]*\$?([\d,]+)/i,
    /List Price[:\s]*\$?([\d,]+)/i
  ];
  for (const pattern of pricePatterns) {
    const match = markdown.match(pattern);
    if (match) {
      result.price = '$' + match[1].replace(/,/g, '').replace(/(\d)(?=(\d{3})+$)/g, '$1,');
      break;
    }
  }

  // 地址提取 (Arizona 格式)
  const addressPatterns = [
    /(\d+\s+[\w\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Way|Ct|Court|Cir|Circle)[,\s]+[\w\s]+,\s*AZ\s*\d{5})/i,
    /(\d+\s+[\w\s]+,\s*[\w\s]+,\s*AZ\s*\d{5})/i
  ];
  for (const pattern of addressPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      result.address = match[1].trim();
      const cityMatch = result.address.match(/,\s*([\w\s]+),\s*AZ/i);
      if (cityMatch) result.region = cityMatch[1].trim();
      break;
    }
  }

  // 房型提取
  const bedsMatch = markdown.match(/(\d+)\s*(?:beds?|bedrooms?|bd)/i);
  if (bedsMatch) result.beds = bedsMatch[1];

  const bathsMatch = markdown.match(/(\d+(?:\.\d+)?)\s*(?:baths?|bathrooms?|ba)/i);
  if (bathsMatch) result.baths = bathsMatch[1];

  // 面積提取
  const sqftMatch = markdown.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|square feet)/i);
  if (sqftMatch) result.sqft = sqftMatch[1].replace(/,/g, '');

  // 建年
  const yearMatch = markdown.match(/(?:built|year built|constructed)[:\s]*(\d{4})/i);
  if (yearMatch) result.yearBuilt = yearMatch[1];

  // 建地 (多種格式 + Acres 自動換算)
  const lotPatterns = [
    /Lot\s*Siz[e]?[:\s]*([\d.]+)\s*acres?/i,
    /Lot\s*Size[:\s]*([\d.]+)\s*acres?/i,
    /([\d.]+)\s*acres?\s*lot/i,
    /([\d.]+)\s*acres?/i
  ];
  for (const pattern of lotPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      result.lotSizeAcres = match[1];
      result.lotSizeSqft = Math.round(parseFloat(match[1]) * 43560).toString();
      break;
    }
  }
  // 如果直接有 sqft 格式
  if (!result.lotSizeSqft) {
    const lotSqftMatch = markdown.match(/lot[:\s]*([\d,]+)\s*(?:sq\.?\s*ft|sqft)/i);
    if (lotSqftMatch) result.lotSizeSqft = lotSqftMatch[1].replace(/,/g, '');
  }

  // MLS/ARMLS (多種格式，含 MLS® ID)
  const armlsPatterns = [
    /MLS[\u00ae®]?\s*ID[:\s]*(\d+)/i,
    /MLS[\u00ae®]?[#:\s]*(\d+)/i,
    /ARMLS[#:\s]*(\d+)/i,
    /Listing\s*ID[:\s]*(\d+)/i,
    /Property\s*ID[:\s]*(\d+)/i,
    /#(\d{7,})/
  ];
  for (const pattern of armlsPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      result.armls = match[1];
      break;
    }
  }

  // 圖片 URL
  const imgMatches = markdown.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)/gi);
  if (imgMatches) result.images = [...new Set(imgMatches)].slice(0, 5);

  console.log('[Regex Fallback] Extracted:', JSON.stringify(result));
  return result;
};

// ========================================
// 單一階段完整解析 (含模型 Fallback + 正則 Fallback)
// ========================================
const extractPropertyData = async (markdown, geminiApiKey, onStatus = null) => {
  const processedMarkdown = preprocessMarkdown(markdown);
  console.log('[Gemini] Processed markdown length:', processedMarkdown.length);

  const genAI = new GoogleGenerativeAI(geminiApiKey);

  // 模型 Fallback 順序：gemini-2.5-flash → gemini-flash (動態別名)
  const modelCandidates = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash",
    "gemini-flash"
  ];

  // 定義 Response Schema (移除 required 限制，強化描述)
  const propertySchema = {
    type: "object",
    properties: {
      price: { type: "string", nullable: true, description: "Listing price with $ symbol (e.g., '$599,000')" },
      address: { type: "string", nullable: true, description: "Full street address including city, state and zip" },
      region: { type: "string", nullable: true, description: "City name only (e.g., 'Peoria', 'Phoenix', 'Glendale')" },
      beds: { type: "string", nullable: true, description: "Number of bedrooms as a number" },
      baths: { type: "string", nullable: true, description: "Number of bathrooms as a number" },
      sqft: { type: "string", nullable: true, description: "Interior living area in square feet" },
      yearBuilt: { type: "string", nullable: true, description: "Year the property was built (4 digits)" },
      lotSizeSqft: { type: "string", nullable: true, description: "Lot size in sqft. Look in 'Exterior Features' for 'Lot Siz'. If in acres, convert: 1 acre = 43560 sqft" },
      lotSizeAcres: { type: "string", nullable: true, description: "Lot size in acres if available" },
      daysOnMarket: { type: "string", nullable: true, description: "Days on market" },
      armls: { type: "string", nullable: true, description: "MLS/ARMLS listing number. May appear as 'ARMLS#', 'MLS#', 'Listing ID', or 'Property ID'" },
      description: { type: "string", nullable: true, description: "Property description summary under 150 words" },
      images: { type: "array", items: { type: "string" }, description: "Property photo URLs (first 5 only)" },
      priceStatus: { type: "string", enum: ["price_drop", "normal", "sold", "pending"], nullable: true },
      priceDropAmount: { type: "string", nullable: true, description: "Price reduction amount if applicable" },
      originalPrice: { type: "string", nullable: true, description: "Original price before reduction" }
    }
  };

  const prompt = `Extract property details from this real estate listing. Return all available fields as JSON. If a field is not found, return null for that field.

IMPORTANT FIELD LOCATIONS:
- Lot Size: Look in "Exterior Features" section for "Lot Siz" or "Lot Size". Often in acres (convert: 1 acre = 43560 sqft)
- ARMLS/MLS: Look for "ARMLS#", "MLS#", "Listing ID", or "Property ID"
- Year Built: Usually in property details or overview section
- Description: The main property description paragraph

${processedMarkdown}`;

  // 嘗試每個模型
  for (const modelName of modelCandidates) {
    console.log(`[Gemini] Trying model: ${modelName}`);
    if (onStatus) onStatus(`使用 ${modelName} 解析中...`);

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: propertySchema,
          maxOutputTokens: 2000
        },
        systemInstruction: "You are a real estate data extractor. Extract property information accurately. Return valid JSON only. Description should be under 150 words. Return only the first 5 image URLs found."
      });

      const result = await model.generateContent(prompt);
      let rawText = result.response.text();

      rawText = rawText.trim();
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```(?:json)?/, '').replace(/```$/, '');
      }

      const parsed = JSON.parse(rawText);
      console.log(`[Gemini] ${modelName} succeeded!`);

      // Gemini 成功但關鍵欄位缺失時，用正則補抓
      if (!parsed.lotSizeSqft || !parsed.armls || !parsed.price || !parsed.address) {
        console.log('[Gemini] Some fields missing, merging with regex fallback...');
        const regexData = extractWithRegex(markdown);
        // 只補充 Gemini 沒抓到的欄位
        if (!parsed.price && regexData.price) parsed.price = regexData.price;
        if (!parsed.address && regexData.address) parsed.address = regexData.address;
        if (!parsed.region && regexData.region) parsed.region = regexData.region;
        if (!parsed.beds && regexData.beds) parsed.beds = regexData.beds;
        if (!parsed.baths && regexData.baths) parsed.baths = regexData.baths;
        if (!parsed.sqft && regexData.sqft) parsed.sqft = regexData.sqft;
        if (!parsed.yearBuilt && regexData.yearBuilt) parsed.yearBuilt = regexData.yearBuilt;
        if (!parsed.lotSizeSqft && regexData.lotSizeSqft) parsed.lotSizeSqft = regexData.lotSizeSqft;
        if (!parsed.lotSizeAcres && regexData.lotSizeAcres) parsed.lotSizeAcres = regexData.lotSizeAcres;
        if (!parsed.armls && regexData.armls) parsed.armls = regexData.armls;
        if ((!parsed.images || parsed.images.length === 0) && regexData.images.length > 0) parsed.images = regexData.images;
        console.log('[Gemini] Merged result:', JSON.stringify(parsed));
      }

      if (onStatus) onStatus('解析完成');
      return parsed;

    } catch (error) {
      console.error(`[Gemini] ${modelName} failed:`, error.message);

      // 模型不存在或已淘汰，嘗試下一個
      if (error.message?.includes('not found') ||
        error.message?.includes('deprecated') ||
        error.message?.includes('404') ||
        error.message?.includes('does not exist')) {
        console.log(`[Gemini] Model ${modelName} unavailable, trying next...`);
        if (onStatus) onStatus(`${modelName} 已淘汰，切換備用模型...`);
        continue;
      }

      // 速率限制，等待後重試
      if (error.message?.includes('429') || error.message?.includes('503')) {
        console.log('[Gemini] Rate limit, waiting 5s...');
        if (onStatus) onStatus('伺服器忙碌，等待重試...');
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  // 所有模型都失敗，使用正則 Fallback
  console.log('[Gemini] All models failed, using regex fallback...');
  if (onStatus) onStatus('AI 解析失敗，使用備用提取...');

  const regexResult = extractWithRegex(markdown);

  if (!regexResult.price && !regexResult.address) {
    throw new Error('所有解析方式皆失敗。請確認網頁內容是否正確。若問題持續，請聯繫開發者更新模型設定。');
  }

  return regexResult;
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

  const data = await extractPropertyData(markdown, geminiApiKey);

  // 檢查是否為已售出/下架的房源
  if (!data.price && !data.address) {
    throw new HttpsError('failed-precondition', '此房源可能已售出或下架，無法抓取資料');
  }

  const priceUsd = data.price ? parseFloat(data.price.replace(/[^0-9.]/g, '')) : 0;

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

    price: data.price || null,
    price_usd: priceUsd,
    address: data.address || null,
    region: data.region || null,
    beds: data.beds || null,
    baths: data.baths || null,
    sqft: data.sqft || null,
    // sqftPing removed - frontend will calculate

    sqftLot: lotSqft,
    lotSizeAcres: data.lotSizeAcres || null,
    // sqftLotPing removed - frontend will calculate
    // 豪宅 ($2M+) 跳過描述拓取
    description: priceUsd > 2000000
      ? '房屋描述過長無法正常抓取，請手動補充'
      : (data.description || null),
    descriptionZh: null,
    yearBuilt: data.yearBuilt || null,
    daysOnMarket: data.daysOnMarket || null,
    armls: data.armls || null,
    priceStatus: data.priceStatus || 'normal',
    priceDropAmount: data.priceDropAmount || null,
    originalPrice: data.originalPrice || null,

    images: processImages(data.images),

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
// API: 批次抓取
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
  const batchId = `batch_${Date.now()}`;
  const statusRef = db.collection('batch_status').doc(batchId);

  await statusRef.set({
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 Days TTL
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

  // 批次處理 (加入 500ms 間隔以避免速率限制)
  const processWithDelay = async (url, index) => {
    // 加入間隔避免 Gemini 速率限制
    if (index > 0) {
      await new Promise(r => setTimeout(r, 500));
    }
    try {
      await updateItemStatus(index, 'scraping', `正在抓取第 ${index + 1} 筆...`);

      const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 30000 })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Firecrawl error');

      const markdown = data.data?.markdown;
      if (!markdown || markdown.length < 100) throw new Error("Markdown 內容不足");

      await updateItemStatus(index, 'parsing', `正在解析第 ${index + 1} 筆...`);

      const extractData = await extractPropertyData(markdown, geminiApiKey);

      // 檢查是否為已售出/下架的房源
      if (!extractData.price && !extractData.address) {
        throw new Error('此房源可能已售出或下架');
      }

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
        // sqftPing removed - frontend will calculate

        sqftLot: lotSqft,
        lotSizeAcres: extractData.lotSizeAcres || null,
        // sqftLotPing removed - frontend will calculate
        // 豪宅 ($2M+) 跳過描述拓取
        description: priceUsd > 2000000
          ? '房屋描述過長無法正常抓取，請手動補充'
          : (extractData.description || null),
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

      return { url, success: true, id: docRef.id };

    } catch (err) {
      logger.error(`Batch item failed: ${url}`, { error: err.message, batchId });
      await updateItemStatus(index, 'error', `✗ ${err.message}`);
      return { url, success: false, error: err.message };
    }
  };

  const processingPromises = urls.map((url, index) => processWithDelay(url, index));
  const results = await Promise.all(processingPromises);

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
// API: 計算距離
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
// API: 翻譯描述
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
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
