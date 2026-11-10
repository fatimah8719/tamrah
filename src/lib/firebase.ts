/**
 * Firebase (project tamra-b69e2). These are public web-app settings, not secrets:
 * access is controlled by the Realtime Database rules in ../firebase/database.rules.json.
 * Firebase is imported lazily so server-side rendering never loads it.
 */
import type { FirebaseApp } from "firebase/app";

export const firebaseConfig = {
  apiKey: "AIzaSyCPl3Yb9kMShW-PGCY0qph2n3JW8qZN_R4",
  authDomain: "tamra-b69e2.firebaseapp.com",
  databaseURL: "https://tamra-b69e2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tamra-b69e2",
  storageBucket: "tamra-b69e2.firebasestorage.app",
  messagingSenderId: "605316684841",
  appId: "1:605316684841:web:90eee0a6019a8817439038",
};

let app: Promise<FirebaseApp> | null = null;

export function firebaseApp(): Promise<FirebaseApp> {
  app ??= import("firebase/app").then(({ getApps, initializeApp }) =>
    getApps()[0] ?? initializeApp(firebaseConfig),
  );
  return app;
}

export async function firebaseAuth() {
  const [{ getAuth }, a] = await Promise.all([import("firebase/auth"), firebaseApp()]);
  return getAuth(a);
}

export async function firebaseDb() {
  const [{ getDatabase }, a] = await Promise.all([import("firebase/database"), firebaseApp()]);
  return getDatabase(a);
}
