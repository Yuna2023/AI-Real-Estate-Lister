
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export const scrapeProperty = async (url: string) => {
  if (!functions) {
    throw new Error("雲端功能尚未就緒。");
  }
  
  const apiScrapeProperty = httpsCallable(functions, 'apiScrapeProperty');
  try {
    const result = await apiScrapeProperty({ url });
    return result.data;
  } catch (error: any) {
    console.error("Cloud Function error:", error);
    throw new Error(error.message || "擷取失敗，請確認網址是否正確。");
  }
};
