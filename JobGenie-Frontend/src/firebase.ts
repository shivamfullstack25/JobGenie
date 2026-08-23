// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC1T2Z-48ix1WllDzgQ66Lf3c5U4VD-dLY",
  authDomain: "jobgenie-d95c7.firebaseapp.com",
  projectId: "jobgenie-d95c7",
  storageBucket: "jobgenie-d95c7.firebasestorage.app",
  messagingSenderId: "337983907175",
  appId: "1:337983907175:web:6a04a5ad9b21495e247bc2",
  measurementId: "G-FJ630WCK2Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const analytics = getAnalytics(app);

export default app;