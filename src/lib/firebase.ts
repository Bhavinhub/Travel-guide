/**
 * Firebase (Cloud Firestore) storage for quote requests.
 * Enabled only when the VITE_FIREBASE_* web config is present at build time — the web config
 * identifies the project and is public by design; access is enforced by firestore.rules,
 * which allow visitors to *create* a request but never to read, change or delete one.
 * The SDK is loaded on demand so it costs nothing until someone submits the form.
 */
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseEnabled = !!(cfg.apiKey && cfg.projectId);

/** Store a quote request (already RSA/AES-sealed when a public key is configured). */
export async function saveQuoteRequest(body: unknown, encrypted: boolean): Promise<boolean> {
  if (!firebaseEnabled) return false;
  const [{ initializeApp, getApps }, fs] = await Promise.all([import('firebase/app'), import('firebase/firestore/lite')]);
  const app = getApps()[0] ?? initializeApp(cfg);
  const db = fs.getFirestore(app);
  await fs.addDoc(fs.collection(db, 'quoteRequests'), {
    v: 1,
    encrypted,
    payload: JSON.stringify(body),
    createdAt: fs.serverTimestamp(),
  });
  return true;
}
