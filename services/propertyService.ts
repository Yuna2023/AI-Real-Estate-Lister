
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
      price_usd: null,
      beds: "0",
      baths: "0",
      sqft: "0",
      sqftLot: "0",
      sqftPing: null,
      sqftLotPing: null,
      address: data.address || "未提供地址",
      region: null,
      armls: "N/A",
      description: "尚無描述",
      descriptionZh: null,
      images: data.images?.length > 0 ? data.images : ["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&q=80&w=800"],

      // Status & Workflow
      edit_status: "draft",
      listing_status: "pre_listed",
      listing_type: "for_sale",
      price_drop: false,

      // Tags & Distances
      tags: [],
      tsmc_distance_miles: null,
      intel_distance_miles: null,
      airport_distance_miles: null,
      costco_distance_miles: null,
      tsmc_duration_minutes: null,
      intel_duration_minutes: null,
      airport_duration_minutes: null,
      costco_duration_minutes: null,

      // Features
      school_district: "一般",
      road_frontage: false,
      orientation: false,

      lastUpdated: Date.now()
    };
  } catch (error) {
    throw error;
  }
};
