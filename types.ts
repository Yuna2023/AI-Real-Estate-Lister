
export type EditStatus = 'draft' | 'boss_edited' | 'my_reviewed' | 'pending_detail';
export type ListingStatus = 'pre_listed' | 'listed' | 'sold' | 'cancelled' | 'rented';
export type ListingType = 'for_sale' | 'for_rent' | 'both';
export type SchoolDistrict = '優秀學區' | '一般';
export type PriceStatus = 'normal' | 'price_drop' | 'sold' | 'pending';

export interface PropertyListing {
  id: string;          // Firestore document ID
  displayId: string;   // Generated e.g., REF-A1B2C
  createdAt: string;   // YYYY-MM-DD
  url: string;

  // Basic Info
  price: string | null;            // Original string price for display
  price_usd: number | null;        // Numeric price for filtering
  address: string | null;
  region: string | null;
  beds: string | null;
  baths: string | null;
  sqft: string | null;
  sqftLot: string | null;
  yearBuilt: string | null;
  daysOnMarket: string | null;
  armls: string | null;
  description: string | null;
  images: string[];

  // Status & Workflow
  edit_status: EditStatus;
  listing_status: ListingStatus;
  listing_type: ListingType;
  price_drop: boolean;

  // Price Status (from scraping)
  priceStatus: PriceStatus;
  priceDropAmount: string | null;
  originalPrice: string | null;

  // Analytics & Tags
  tags: string[];                  // ["Peoria", "TSMC近", "學區房"]
  tsmc_distance_miles: number | null;
  intel_distance_miles: number | null;
  airport_distance_miles: number | null;
  costco_distance_miles: number | null;

  // Driving duration (minutes)
  tsmc_duration_minutes: number | null;
  intel_duration_minutes: number | null;
  airport_duration_minutes: number | null;
  costco_duration_minutes: number | null;

  // Distance calculation status
  distanceCalculated: boolean;

  // 坪數換算 (1坪 = 35.58 sqft)
  sqftPing: string | null;
  sqftLotPing: string | null;

  // 翻譯後描述
  descriptionZh: string | null;

  // Features
  school_district: SchoolDistrict;
  road_frontage: boolean;          // true = 有路衝
  orientation: boolean;            // true = 坐北朝南

  lastUpdated: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
