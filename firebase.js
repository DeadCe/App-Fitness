// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // ✅ Ajout

const firebaseConfig = {
  apiKey: "AIzaSyC8D7iKIwbqZkgkFAi4ReClpPnVU0wowT0",
  authDomain: "appfitness-27aa9.firebaseapp.com",
  projectId: "appfitness-27aa9",
  storageBucket: "appfitness-27aa9.appspot.com",
  messagingSenderId: "738350887721",
  appId: "1:738350887721:web:f4c0a4d01d138145573d38"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);

// Auth, Firestore et Storage
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app); // ✅ Export du Storage
