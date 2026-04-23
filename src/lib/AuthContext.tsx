import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  User,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { auth, db } from './firebase';
import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';

type UserRole = 'admin' | 'supervisor' | 'finance';
type UserStatus = 'active' | 'invited' | 'suspended';
type AccessState = UserStatus | 'not_provisioned';
const ACCOUNT_NOT_PROVISIONED_MESSAGE = 'Account not provisioned. Please contact an admin.';

interface UserData {
  auth_uid: string;
  email: string;
  display_name: string;
  role: UserRole;
  outlet_id: string;
  outlet_name: string;
  status: UserStatus;
  photo_url: string;
  outlet?: string;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  accessState: AccessState | null;
  authNotice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logOut: () => Promise<void>;
  clearAuthNotice: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  accessState: null,
  authNotice: null,
  signIn: async () => {},
  signUp: async () => {},
  resetPassword: async () => {},
  logOut: async () => {},
  clearAuthNotice: () => {},
});

export const useAuth = () => useContext(AuthContext);

function isUserRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'supervisor' || value === 'finance';
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === 'active' || value === 'invited' || value === 'suspended';
}

function normalizeUserData(currentUser: User, rawData: any): UserData | null {
  if (!isUserRole(rawData?.role)) {
    return null;
  }

  const legacyOutlet = typeof rawData?.outlet === 'string' ? rawData.outlet.trim() : '';
  const outletId = typeof rawData?.outlet_id === 'string' && rawData.outlet_id.trim()
    ? rawData.outlet_id.trim()
    : legacyOutlet;
  const outletName = typeof rawData?.outlet_name === 'string' && rawData.outlet_name.trim()
    ? rawData.outlet_name.trim()
    : legacyOutlet;

  return {
    auth_uid: currentUser.uid,
    email: typeof rawData?.email === 'string' && rawData.email.trim()
      ? rawData.email.trim()
      : currentUser.email || '',
    display_name: typeof rawData?.display_name === 'string' && rawData.display_name.trim()
      ? rawData.display_name.trim()
      : currentUser.displayName || '',
    role: rawData.role,
    outlet_id: outletId,
    outlet_name: outletName,
    status: isUserStatus(rawData?.status) ? rawData.status : 'active',
    photo_url: typeof rawData?.photo_url === 'string' && rawData.photo_url.trim()
      ? rawData.photo_url.trim()
      : currentUser.photoURL || '',
    outlet: outletName
  };
}

function normalizeEmailKey(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function claimProvisionedUserProfile(currentUser: User) {
  const emailKey = normalizeEmailKey(currentUser.email);
  if (!emailKey) {
    return false;
  }

  const provisionalDocRef = doc(db, 'users', emailKey);
  const claimedDocRef = doc(db, 'users', currentUser.uid);
  const provisionalSnapshot = await getDoc(provisionalDocRef);

  if (!provisionalSnapshot.exists()) {
    return false;
  }

  const provisionalData = provisionalSnapshot.data();
  if (!isUserRole(provisionalData?.role) || typeof provisionalData?.auth_uid !== 'string') {
    return false;
  }

  await setDoc(claimedDocRef, {
    ...provisionalData,
    auth_uid: currentUser.uid
  });

  await deleteDoc(provisionalDocRef);
  return true;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeUidDoc: (() => void) | null = null;
    let unsubscribeEmailDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (unsubscribeUidDoc) {
        unsubscribeUidDoc();
        unsubscribeUidDoc = null;
      }

      if (unsubscribeEmailDoc) {
        unsubscribeEmailDoc();
        unsubscribeEmailDoc = null;
      }

      setUser(currentUser);
      if (currentUser) {
        setLoading(true);
        const emailKey = normalizeEmailKey(currentUser.email);
        let uidProfile: UserData | null = null;
        let emailProfile: UserData | null = null;
        let uidLoaded = false;
        let emailLoaded = !emailKey;

        const applyResolvedProfile = () => {
          if (!uidLoaded || !emailLoaded) {
            return;
          }

          const resolvedProfile = uidProfile || emailProfile;
          setUserData(resolvedProfile);
          if (!resolvedProfile) {
            setAccessState('not_provisioned');
            if (!authNotice) {
              setAuthNotice(ACCOUNT_NOT_PROVISIONED_MESSAGE);
            }
          } else {
            setAccessState(resolvedProfile.status);
            if (resolvedProfile.status === 'active') {
              setAuthNotice(null);
            } else if (resolvedProfile.status === 'invited') {
              setAuthNotice('Your account is pending activation. Contact an admin if this should already be live.');
            } else {
              setAuthNotice('Your account has been suspended. Contact an admin for access support.');
            }
          }
          setLoading(false);
        };

        const uidDocRef = doc(db, 'users', currentUser.uid);
        unsubscribeUidDoc = onSnapshot(uidDocRef, (userSnap) => {
          uidProfile = userSnap.exists()
            ? normalizeUserData(currentUser, userSnap.data())
            : null;
          uidLoaded = true;
          applyResolvedProfile();
        }, (error) => {
          console.error('Error listening to UID user profile:', error);
          uidProfile = null;
          uidLoaded = true;
          applyResolvedProfile();
        });

        if (emailKey) {
          const emailDocRef = doc(db, 'users', emailKey);
          unsubscribeEmailDoc = onSnapshot(emailDocRef, (userSnap) => {
            emailProfile = userSnap.exists()
              ? normalizeUserData(currentUser, userSnap.data())
              : null;
            emailLoaded = true;
            applyResolvedProfile();
          }, (error) => {
            console.error('Error listening to email user profile:', error);
            emailProfile = null;
            emailLoaded = true;
            applyResolvedProfile();
          });
        } else {
          emailLoaded = true;
          applyResolvedProfile();
        }
      } else {
        setUserData(null);
        setAccessState(null);
        setLoading(false);
      }
    });

    return () => {
      if (unsubscribeUidDoc) {
        unsubscribeUidDoc();
      }
      if (unsubscribeEmailDoc) {
        unsubscribeEmailDoc();
      }
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setAuthNotice(null);
    await signInWithEmailAndPassword(auth, normalizeEmailKey(email), password);
  };

  const signUp = async (email: string, password: string) => {
    setAuthNotice(null);
    const userCredential = await createUserWithEmailAndPassword(auth, normalizeEmailKey(email), password);
    const wasClaimed = await claimProvisionedUserProfile(userCredential.user);

    if (!wasClaimed) {
      setAuthNotice(ACCOUNT_NOT_PROVISIONED_MESSAGE);
      await signOut(auth);
      const provisionError = new Error(ACCOUNT_NOT_PROVISIONED_MESSAGE) as Error & { code: string };
      provisionError.code = 'auth/account-not-provisioned';
      throw provisionError;
    }
  };

  const resetPassword = async (email: string) => {
    setAuthNotice(null);
    await sendPasswordResetEmail(auth, normalizeEmailKey(email));
  };

  const logOut = async () => {
    setAuthNotice(null);
    await signOut(auth);
  };

  const clearAuthNotice = () => {
    setAuthNotice(null);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, accessState, authNotice, signIn, signUp, resetPassword, logOut, clearAuthNotice }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
