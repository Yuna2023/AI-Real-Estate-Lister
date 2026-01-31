
import { PropertyListing } from "../types";

const getFirecrawlKey = () => {
  try {
    return process.env.FIRECRAWL_API_KEY || "";
  } catch (e) {
    return "";
  }
};

export const extractPropertyData = async (url: string): Promise<PropertyListing> => {
  const apiKey = getFirecrawlKey();
  if (!apiKey) {
    throw new Error("Firecrawl API Key 未設定。");
  }

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/extract', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        urls: [url],
        prompt: "Extract real estate details. Focus on main property images only.",
        schema: {
          type: "object",
          properties: {
            daysOnMarket: { type: "string" },
            yearBuilt: { type: "string" },
            price: { type: "string" },
            address: { type: "string" },
            images: { type: "array", items: { type: "string" } }
          },
          required: ["address"]
        }
      })
    });

    const result = await response.json();
    const data = result.data?.[0] || {};

    // Fix: Removed invalid properties (price_val, beds_val, sqft_val, agent) and 
    // added missing required properties (displayId, createdAt) to satisfy the PropertyListing interface.
    return {
      id: Math.random().toString(36).substr(2, 9),
      displayId: `REF-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      createdAt: new Date().toISOString().split('T')[0],
      url,
      daysOnMarket: data.daysOnMarket || "1",
      yearBuilt: data.yearBuilt || "未知",
      price: data.price || "未提供",
      beds: "0",
      baths: "0",
      sqft: "0",
      sqftLot: "0",
      address: data.address || "未提供地址",
      armls: "N/A",
      description: "尚無描述",
      images: data.images?.length > 0 ? data.images : ["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&q=80&w=800"],
      lastUpdated: Date.now()
    };
  } catch (error) {
    throw error;
  }
};
