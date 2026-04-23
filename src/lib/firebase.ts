import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = typeof window !== 'undefined' 
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const storage = getStorage(app);

/**
 * Interface for reporting Firestore permission errors in a structured way.
 */
export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
    emailVerified: boolean;
    isAnonymous: boolean;
  }
}

/**
 * Structured error handler for Firestore permission issues.
 */
export function handleFirestoreError(error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null): never {
  if (error?.code === 'permission-denied') {
    const user = auth.currentUser;
    const errorInfo: FirestoreErrorInfo = {
      error: error.message,
      operationType,
      path,
      authInfo: {
        userId: user?.uid || null,
        email: user?.email || null,
        emailVerified: user?.emailVerified || false,
        isAnonymous: user?.isAnonymous || false,
      }
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw error;
}

// CRITICAL: Validate connection to Firestore
import { doc, getDocFromServer } from 'firebase/firestore';
async function testConnection() {
  try {
    // Attempt to fetch a non-existent doc from server to verify connection/config
    await getDocFromServer(doc(db, 'system', 'connection_test'));
    console.log("Firestore connection verified.");
  } catch (error: any) {
    if (error.message?.includes('offline')) {
      console.error("Firestore is offline. Check configuration.");
    }
  }
}
testConnection();
