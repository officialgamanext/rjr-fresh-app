import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// @ts-ignore - getReactNativePersistence is not correctly exported in types but exists in runtime for React Native
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBpPEg0AGVSjjtnhJA-PbwdEuK1WmNssTg",
  authDomain: "rjr-fresh-admin-panel.firebaseapp.com",
  projectId: "rjr-fresh-admin-panel",
  storageBucket: "rjr-fresh-admin-panel.firebasestorage.app",
  messagingSenderId: "929014666237",
  appId: "1:929014666237:web:d9a38f1d9d25db6641bf94",
  measurementId: "G-3L5W785QMG"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// Initialize Auth with persistence
let auth: any;
if (getApps().length > 0) {
  try {
    auth = getAuth(app);
  } catch (e) {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  }
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

export { db, auth };
