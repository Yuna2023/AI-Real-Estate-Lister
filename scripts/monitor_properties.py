#!/usr/bin/env python3
"""
房源監控自動化腳本
用於 GitHub Actions / Cron Job 自動檢查價格變動並發送通知
"""

import os
import requests
import json
from datetime import datetime

# ========================================
# 環境變數（需在 GitHub Actions 設定）
# ========================================
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "ai-property-hub-2fcea")
FIREBASE_API_KEY = os.getenv("FIREBASE_API_KEY")
FIRESTORE_API_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"

# 通知 Webhook（LINE Notify / Slack / Discord）
NOTIFY_WEBHOOK = os.getenv("NOTIFY_WEBHOOK")

def fetch_listings():
    """從 Firestore 獲取所有房源"""
    try:
        url = f"{FIRESTORE_API_URL}/listings"
        response = requests.get(url)
        response.raise_for_status()
        
        data = response.json()
        listings = []
        
        if 'documents' in data:
            for doc in data['documents']:
                doc_id = doc['name'].split('/')[-1]
                fields = doc.get('fields', {})
                
                # 解析 Firestore 欄位
                listing = {
                    'id': doc_id,
                    'address': fields.get('address', {}).get('stringValue', 'N/A'),
                    'price_usd': float(fields.get('price_usd', {}).get('doubleValue', 0)),
                    'price': fields.get('price', {}).get('stringValue', 'N/A'),
                    'url': fields.get('url', {}).get('stringValue', ''),
                    'listing_status': fields.get('listing_status', {}).get('stringValue', 'listed'),
                }
                listings.append(listing)
        
        print(f"✅ 獲取 {len(listings)} 筆房源")
        return listings
    
    except Exception as e:
        print(f"❌ 獲取房源失敗: {e}")
        return []

def check_price_drops(listings):
    """檢查價格變動（需搭配歷史紀錄）"""
    price_drops = []
    
    # TODO: 實作歷史價格比對邏輯
    # 建議：將上次價格存在 last_price_usd 欄位
    
    for listing in listings:
        # 範例：假設有 last_price_usd 欄位
        # if listing['price_usd'] < listing.get('last_price_usd', float('inf')):
        #     price_drops.append(listing)
        pass
    
    return price_drops

def send_notification(listings):
    """發送通知（LINE / Slack / Discord）"""
    if not NOTIFY_WEBHOOK:
        print("⚠️  未設定通知 Webhook，跳過通知")
        return
    
    if not listings:
        print("✅ 無價格變動，不發送通知")
        return
    
    # LINE Notify 範例
    message = f"🏠 房源降價通知 ({len(listings)} 筆)\\n\\n"
    for listing in listings[:5]:  # 最多顯示 5 筆
        message += f"📍 {listing['address']}\\n"
        message += f"💰 {listing['price']}\\n"
        message += f"🔗 {listing['url']}\\n\\n"
    
    try:
        headers = {"Authorization": f"Bearer {NOTIFY_WEBHOOK}"}
        data = {"message": message}
        response = requests.post("https://notify-api.line.me/api/notify", headers=headers, data=data)
        response.raise_for_status()
        print(f"✅ 通知已發送: {len(listings)} 筆降價房源")
    except Exception as e:
        print(f"❌ 通知發送失敗: {e}")

def main():
    """主程式"""
    print(f"[{datetime.now()}] 🚀 開始執行房源監控...")
    
    # 1. 獲取房源
    listings = fetch_listings()
    
    # 2. 檢查價格變動
    price_drops = check_price_drops(listings)
    
    # 3. 發送通知
    send_notification(price_drops)
    
    print(f"[{datetime.now()}] ✅ 監控完成")

if __name__ == "__main__":
    main()
