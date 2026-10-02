/**
 * Firebase client initialization (public config only).
 * Secrets (Paystack, Admin SDK) must NEVER live here.
 */

import { initializeApp, getApps, getApp, deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Avoid re-initializing on hot reload
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

/**
 * Create an Auth user WITHOUT switching the current browser session.
 * Uses a temporary secondary Firebase app instance.
 */
export async function createAuthUserWithoutSessionSwitch(
  email: string,
  password: string
): Promise<string> {
  const secondaryName = `Secondary-${Date.now()}`;
  let secondary: FirebaseApp | null = null;
  try {
    secondary = initializeApp(firebaseConfig, secondaryName);
    const secondaryAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password
    );
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    return uid;
  } finally {
    if (secondary) {
      try {
        await deleteApp(secondary);
      } catch {
        /* ignore */
      }
    }
  }
}

export default app;
