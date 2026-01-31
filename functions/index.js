
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();
const db = admin.firestore();

/**
 * 產生隨機編號 (REF-XXXXX)
 */
const generateDisplayId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `REF-${result}`;
};

/**
 * 圖片處理邏輯：
 * < 3 張：全取
 * >= 3 張：隨機取 5 張
 */
const processImages = (images) => {
  if (!images || !Array.isArray(images) || images.length === 0) {
    return ["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&q=80&w=800"];
  }
  if (images.length < 3) {
    return images;
  }
  // 隨機打亂並取 5 張
  const shuffled = [...images].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 5);
};

const { onCall, HttpsError } = require("firebase-functions/v2/https");

/**
 * 使用 Gemini 從 Markdown 內容提取房源結構化資料
 * 成本: 約 3000-8000 input tokens + 500-1000 output tokens (免費額度內)
 */
const extractPropertyDataWithGemini = async (markdown, geminiApiKey) => {
  const genAI = new GoogleGenerativeAI(geminiApiKey);

  // 使用 Gemini 2.5 Flash
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    // 啟用結構化輸出模式 (JSON Mode)
    generationConfig: { responseMimeType: "application/json" }
  });

  const prompt = `You are a real estate data extraction assistant. Extract property information from the following markdown content of a real estate listing page.

Return ONLY a valid JSON object with these fields (use null if not found):
{
  "price": "string - the listing price (e.g., '$850,000')",
  "address": "string - full property address",
  "beds": "string - number of bedrooms",
  "baths": "string - number of bathrooms", 
  "sqft": "string - interior square footage",
  "sqftLot": "string - lot size in square feet",
  "yearBuilt": "string - year the property was built",
  "daysOnMarket": "string - days on market",
  "armls": "string - MLS or ARMLS listing number",
  "description": "string - property description (max 500 chars)",
  "images": ["array of image URLs - only property photos, not logos or icons"]
}

IMPORTANT: Return ONLY the JSON object, no markdown formatting, no code blocks, no explanation.

Markdown content:
${markdown}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    console.log("Gemini extracted data:", JSON.stringify(parsed));
    return parsed;
  } catch (error) {
    console.error("Gemini parsing error:", error);
    throw new Error(`Gemini 解析失敗: ${error.message}`);
  }
};

exports.apiScrapeProperty = onCall({
  secrets: ["FIRECRAWL_API_KEY", "GEMINI_API_KEY"],
  timeoutSeconds: 120, // 減少到 120 秒，因為不需要輪詢了
  cors: true,
  region: "us-central1"
}, async (request) => {
  const { url } = request.data;
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!firecrawlApiKey) {
    throw new HttpsError('failed-precondition', '尚未設定 FIRECRAWL_API_KEY。');
  }
  if (!geminiApiKey) {
    throw new HttpsError('failed-precondition', '尚未設定 GEMINI_API_KEY。');
  }

  try {
    // Step 1: 使用 Firecrawl /scrape API 取得 Markdown (消耗 1 credit)
    console.log(`Scraping URL with Firecrawl: ${url}`);

    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: url,
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 15000 // 縮短至 15 秒
      })
    });

    const scrapeResult = await scrapeResponse.json();
    console.log(`Firecrawl Response Status: ${scrapeResponse.status}`);

    if (!scrapeResult.success) {
      const errorMsg = scrapeResult.error || "Firecrawl 無法擷取頁面";
      throw new Error(`Firecrawl 擷取失敗: ${errorMsg}`);
    }

    const markdown = scrapeResult.data?.markdown;
    if (!markdown || markdown.length < 100) {
      throw new Error("Firecrawl 回傳的內容太少，可能無法解析");
    }

    console.log(`Markdown received, length: ${markdown.length} chars`);

    // Step 2: 使用 Gemini 解析 Markdown 成結構化資料 (免費額度內)
    console.log("Parsing markdown with Gemini...");
    const extracted = await extractPropertyDataWithGemini(markdown, geminiApiKey);

    // Step 3: 組裝資料並儲存到 Firestore
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];

    const propertyData = {
      url,
      displayId: generateDisplayId(),
      createdAt: formattedDate,
      price: extracted.price || null,
      address: extracted.address || null,
      beds: extracted.beds || null,
      baths: extracted.baths || null,
      sqft: extracted.sqft || null,
      sqftLot: extracted.sqftLot || null,
      description: extracted.description || null,
      yearBuilt: extracted.yearBuilt || null,
      daysOnMarket: extracted.daysOnMarket || null,
      armls: extracted.armls || null,
      images: processImages(extracted.images),
      lastUpdated: Date.now()
    };

    const docRef = await db.collection("listings").add(propertyData);
    console.log(`Property saved with ID: ${docRef.id}`);

    return { ...propertyData, id: docRef.id };
  } catch (error) {
    console.error("Scrape Error:", error);
    throw new HttpsError('internal', error.message);
  }
});
