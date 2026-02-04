
import os
import requests
import json
import time

# Configuration
FIREBASE_PROJECT_ID = "ai-property-hub-2fcea"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"

def delete_collection(collection_name):
    print(f"\n--- Cleaning {collection_name} ---")
    deleted_count = 0
    
    while True:
        # Fetch documents
        url = f"{FIRESTORE_URL}/{collection_name}"
        response = requests.get(url)
        
        if response.status_code != 200:
            print(f"Error fetching {collection_name}: {response.text}")
            break
            
        data = response.json()
        documents = data.get('documents', [])
        
        if not documents:
            print("No more documents found.")
            break
            
        print(f"Found {len(documents)} documents. Deleting...")
        
        for doc in documents:
            doc_name = doc['name'] # Full path: projects/.../documents/collection/doc_id
            # doc_name is already the full path required for delete
            # REST API delete url: https://firestore.googleapis.com/v1/{name}
            del_url = f"https://firestore.googleapis.com/v1/{doc_name}"
            
            del_resp = requests.delete(del_url)
            if del_resp.status_code == 200:
                print(f"Deleted: {doc_name.split('/')[-1]}")
                deleted_count += 1
            else:
                print(f"Failed to delete {doc_name}: {del_resp.text}")
                
        # API doesn't support batch delete easily, so loop is fine for small datasets
        # Check if we need to paginate (though get returns 20 or so by default, loop handles it)

    print(f"Total deleted from {collection_name}: {deleted_count}")

if __name__ == "__main__":
    confirm = input("⚠️  WARNING: This will delete ALL data in 'listings' and 'batch_status'. Type 'yes' to proceed: ")
    if confirm.lower() == 'yes':
        delete_collection('listings')
        delete_collection('batch_status')
        print("\n✅ Database cleanup complete.")
    else:
        print("Operation cancelled.")
