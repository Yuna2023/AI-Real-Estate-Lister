
import os
import requests
import json
import time
import argparse

# Configuration
FIREBASE_PROJECT_ID = "ai-property-hub-2fcea"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"
FUNCTIONS_URL = f"https://us-central1-{FIREBASE_PROJECT_ID}.cloudfunctions.net/apiScrapeBatch"

def run_verification(urls):
    print(f"\n🚀 Starting Verification for {len(urls)} URLs...")
    
    # 1. Trigger Scrape (simulating frontend call)
    # Note: Accessing cloud functions directly might need auth or open policy. 
    # For this test script, assuming we check the *result* in Firestore manually triggered or via local emulation if available.
    # Since we can't easily auth against Cloud Functions from here without a token, 
    # we will just check the Firestore data assuming the user triggers the scrape or we use the 'debug_ghost_data.py' approach to read.
    
    # Actually, better approach: Poll Firestore for these URLs to see if they exist and are valid.
    # This script assumes the scraping has been triggered (or we trigger it if we had a key).
    # Let's focus on "Checking Data Integrity" of existing docs.
    
    print("Fetching listings from Firestore...")
    resp = requests.get(f"{FIRESTORE_URL}/listings")
    if resp.status_code != 200:
        print("Error fetching listings.")
        return

    data = resp.json()
    documents = data.get('documents', [])
    
    results = []
    
    for doc in documents:
        fields = doc.get('fields', {})
        url = fields.get('url', {}).get('stringValue', '')
        
        # Check if this is one of our target URLs (fuzzy match)
        target_found = False
        for t_url in urls:
            if t_url.lower() in url.lower():
                target_found = True
                break
        
        if not target_found and len(urls) > 0:
            continue

        # Validation Logic
        address = fields.get('address', {}).get('stringValue')
        price = fields.get('price', {}).get('stringValue')
        desc = fields.get('description', {}).get('stringValue')
        price_usd = float(fields.get('price_usd', {}).get('doubleValue', 0))
        
        status = "✅ PASS"
        issues = []
        
        if not address or address == "未提供地址":
            status = "❌ FAIL"
            issues.append("Missing Address")
            
        if not price or price == "未提供":
            status = "❌ FAIL"
            issues.append("Missing Price")
            
        if not desc or desc == "尚無描述":
            # Check Luxury Exception
            if price_usd > 2000000:
                issues.append("Desc Skipped (Luxury - OK)")
            else:
                status = "❌ FAIL"
                issues.append("Missing Description (<$2M)")

        print(f"\n[{status}] {url}")
        print(f"  Price: {price} (${price_usd})")
        print(f"  Address: {address}")
        print(f"  Description: {desc[:50]}..." if desc else "  Description: None")
        if issues:
            print(f"  ⚠️ Issues: {', '.join(issues)}")

if __name__ == "__main__":
    # Test URLs (including the reported problematic one if known, or general testing)
    test_urls = [
        # You can add specific URLs here to filter logic
    ]
    run_verification(test_urls)
