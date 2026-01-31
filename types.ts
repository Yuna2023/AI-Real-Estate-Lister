
export interface PropertyListing {
  id: string;          // Firestore document ID
  displayId: string;   // Generated e.g., REF-A1B2C
  createdAt: string;   // YYYY-MM-DD
  url: string;
  daysOnMarket: string | null;
  yearBuilt: string | null;
  price: string | null;
  beds: string | null;
  baths: string | null;
  sqft: string | null;
  sqftLot: string | null;
  address: string | null;
  armls: string | null;
  description: string | null;
  images: string[];
  lastUpdated: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
