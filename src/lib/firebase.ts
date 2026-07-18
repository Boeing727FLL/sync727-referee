import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyAsc-XfaV276Ap2wtqLe-RyV4RROLLPyLE",
  authDomain: "sync-727-1f91f.firebaseapp.com",
  databaseURL: "https://sync-727-1f91f-default-rtdb.firebaseio.com",
  projectId: "sync-727-1f91f",
  storageBucket: "sync-727-1f91f.firebasestorage.app",
  messagingSenderId: "796625427827",
  appId: "1:796625427827:web:2dec83a04acd3de6f83906"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});
export const rtdb = getDatabase(app);
export const storage = getStorage(app);

export let messaging: any = null;
isSupported().then((supported) => {
  if (supported) {
    messaging = getMessaging(app);
  }
}).catch(console.warn);

export const googleProvider = new GoogleAuthProvider();

// Add Drive scope
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.setCustomParameters({
  prompt: 'consent'
});
