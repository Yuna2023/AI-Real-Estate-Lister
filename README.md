
# AI 房源中台系統 (AI Real Estate Hub)

> **⚠️ 重要規範：沒有經過我的同意，不得更改任何檔案**

## 快速開始 (部署流程)

### 1. 環境準備
- 確保 Firebase 專案已升級至 **Blaze** 方案。
- 在本地安裝 Firebase CLI: `npm install -g firebase-tools`。

### 2. 設定雲端金鑰 (Secrets)
請在 Terminal 執行以下指令，系統會提示您輸入對應的金鑰值：
```bash
# 設定房源抓取金鑰 (必填)
firebase functions:secrets:set FIRECRAWL_API_KEY

# 設定 LINE OA 金鑰 (選填，若要測試 LINE 功能需設定)
firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
firebase functions:secrets:set LINE_CHANNEL_SECRET
```

### 3. 設定前端連接
編輯 `services/firebase.ts`，將您的 **Firebase Web Config** 貼入該檔案中。

### 4. 執行部署
```bash
firebase deploy --only functions,firestore,hosting
```

## 系統規格
- **前端**: React 19 + Tailwind CSS。
- **後端**: Firebase Functions (Scrape Proxy + LINE Webhook)。
- **資料庫**: Firestore (即時監聽數據)。

## 注意事項
- 抓取圖片邏輯：若房源圖片 > 3 張，系統會自動隨機選取 5 張存入雲端。
- LINE 解析：支援「3房」、「70萬」等中文自然語言解析搜尋。
