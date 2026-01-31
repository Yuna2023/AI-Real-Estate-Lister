
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBEiKDugFQ7MLkzh0bnsv0ZZpo5DoY83Os",
  authDomain: "ai-property-hub-2fcea.firebaseapp.com",
  projectId: "ai-property-hub-2fcea",
  storageBucket: "ai-property-hub-2fcea.firebasestorage.app",
  messagingSenderId: "653973358082",
  appId: "1:653973358082:web:3af39b289e7d0ae437c91b",
  measurementId: "G-QFWEWHS4W5"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const functions = getFunctions(app);
