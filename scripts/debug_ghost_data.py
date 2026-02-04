
import os
import requests
import json
from collections import Counter

# Configuration from services/firebase.ts
FIREBASE_PROJECT_ID = "ai-property-hub-2fcea"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"

def get_field(fields, key, type_key='stringValue'):
    return fields.get(key, {}).get(type_key)

def fetch_collection(collection_name):
    print(f"\n--- Fetching {collection_name} ---")
    url = f"{FIRESTORE_URL}/{collection_name}"
    response = requests.get(url)
    if response.status_code != 200:
        print(f"Error fetching {collection_name}: {response.text}")
        return []
    
    data = response.json()
    documents = data.get('documents', [])
    print(f"Found {len(documents)} documents.")
    return documents

def analyze_listings():
    docs = fetch_collection('listings')
    if not docs:
        return

    urls = []
    print("\n--- Listing Details ---")
    print(f"{'ID':<15} | {'Distance (TSMC)':<15} | {'Price':<10} | {'Address':<30} | {'URL'}")
    print("-" * 100)
    
    for doc in docs:
        doc_id = doc['name'].split('/')[-1]
        fields = doc.get('fields', {})
        
        url = get_field(fields, 'url')
        address = get_field(fields, 'address', 'stringValue') or "N/A"
        price = get_field(fields, 'price', 'stringValue') or "N/A"
        
        # Distance might be integer or double
        dist = fields.get('tsmc_distance_miles', {})
        dist_val = dist.get('integerValue') or dist.get('doubleValue') or "NULL"
        
        print(f"{doc_id:<15} | {str(dist_val):<15} | {price:<10} | {address[:30]:<30} | {url}")
        if url:
            urls.append(url)

    # Check duplicates
    print("\n--- Duplicate Check ---")
    url_counts = Counter(urls)
    duplicates = {u: c for u, c in url_counts.items() if c > 1}
    if duplicates:
        print(f"Found {len(duplicates)} duplicate URLs:")
        for u, c in duplicates.items():
            print(f"  ({c} times): {u}")
    else:
        print("No duplicate URLs found.")

def analyze_batch_status():
    docs = fetch_collection('batch_status')
    if not docs:
        return

    print("\n--- Batch Status Details ---")
    for doc in docs:
        doc_id = doc['name'].split('/')[-1]
        fields = doc.get('fields', {})
        status = get_field(fields, 'currentStatus')
        total = fields.get('total', {}).get('integerValue', 0)
        completed = fields.get('completed', {}).get('integerValue', 0)
        date = fields.get('startedAt', {}).get('timestampValue', 'N/A')
        print(f"Batch ID: {doc_id} | Date: {date} | Status: {status} | Progress: {completed}/{total}")

if __name__ == "__main__":
    analyze_listings()
    analyze_batch_status()
