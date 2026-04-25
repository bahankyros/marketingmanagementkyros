import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from './supabase';

type UserRole = 'admin' | 'supervisor' | 'finance';
type UserStatus = 'active' | 'invited' | 'suspended';
type AccessState = UserStatus | 'not_provisioned';

export type AuthUser = SupabaseUser & {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
};

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
  user: AuthUser | null;
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

function normalizeEmailKey(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function getMetadataString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function toAuthUser(currentUser: SupabaseUser): AuthUser {
  const displayName = getMetadataString(
    currentUser.user_metadata?.display_name,
    currentUser.user_metadata?.full_name,
    currentUser.user_metadata?.name
  );
  const photoURL = getMetadataString(
    currentUser.user_metadata?.photo_url,
    currentUser.user_metadata?.avatar_url,
    currentUser.user_metadata?.picture
  );

  return {
    ...currentUser,
    uid: currentUser.id,
    displayName: displayName || null,
    photoURL: photoURL || null,
  };
}

function buildUserData(currentUser: AuthUser): UserData | null {
  const metadataRole = currentUser.app_metadata?.role ?? currentUser.user_metadata?.role;
  if (!isUserRole(metadataRole)) {
    return null;
  }

  const metadataStatus = currentUser.app_metadata?.status ?? currentUser.user_metadata?.status;
  const outletId = getMetadataString(currentUser.user_metadata?.outlet_id, currentUser.user_metadata?.outlet);
  const outletName = getMetadataString(currentUser.user_metadata?.outlet_name, currentUser.user_metadata?.outlet);

  return {
    auth_uid: currentUser.id,
    email: currentUser.email || '',
    display_name: currentUser.displayName || currentUser.email || '',
    role: metadataRole,
    outlet_id: outletId,
    outlet_name: outletName,
    status: isUserStatus(metadataStatus) ? metadataStatus : 'active',
    photo_url: currentUser.photoURL || '',
    outlet: outletName,
  };
}

function toAuthError(error: any) {
  const message = typeof error?.message === 'string' ? error.message : 'Authentication failed. Please try again.';
  const normalizedMessage = message.toLowerCase();
  let code = 'auth/supabase-error';

  if (normalizedMessage.includes('invalid login credentials')) {
    code = 'auth/invalid-credential';
  } else if (normalizedMessage.includes('email not confirmed')) {
    code = 'auth/email-not-confirmed';
  } else if (normalizedMessage.includes('already registered') || normalizedMessage.includes('already exists')) {
    code = 'auth/email-already-in-use';
  } else if (normalizedMessage.includes('password')) {
    code = 'auth/weak-password';
  } else if (error?.status === 429 || normalizedMessage.includes('rate limit')) {
    code = 'auth/too-many-requests';
  } else if (normalizedMessage.includes('failed to fetch') || normalizedMessage.includes('network')) {
    code = 'auth/network-request-failed';
  }

  const authError = new Error(message) as Error & { code: string };
  authError.code = code;
  return authError;
}

function getAccessNotice(accessState: UserStatus | null) {
  if (accessState === 'invited') {
    return 'Your account is pending activation. Contact an admin if this should already be live.';
  }

  if (accessState === 'suspended') {
    return 'Your account has been suspended. Contact an admin for access support.';
  }

  return null;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessState, setAccessState] = useState<AccessState | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const applySessionUser = (sessionUser: SupabaseUser | null | undefined) => {
      if (!isMounted) {
        return;
      }

      if (!sessionUser) {
        setUser(null);
        setUserData(null);
        setAccessState(null);
        setAuthNotice(null);
        setLoading(false);
        return;
      }

      const nextUser = toAuthUser(sessionUser);
      const nextUserData = buildUserData(nextUser);
      const nextAccessState = nextUserData?.status ?? 'active';

      setUser(nextUser);
      setUserData(nextUserData);
      setAccessState(nextAccessState);
      setAuthNotice(getAccessNotice(nextAccessState));
      setLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading Supabase session:', error);
        }
        applySessionUser(data.session?.user);
      })
      .catch((error) => {
        console.error('Error loading Supabase session:', error);
        applySessionUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySessionUser(session?.user);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setAuthNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmailKey(email),
      password,
    });

    if (error) {
      throw toAuthError(error);
    }
  };

  const signUp = async (email: string, password: string) => {
    setAuthNotice(null);
    const { error } = await supabase.auth.signUp({
      email: normalizeEmailKey(email),
      password,
    });

    if (error) {
      throw toAuthError(error);
    }
  };

  const resetPassword = async (email: string) => {
    setAuthNotice(null);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmailKey(email));

    if (error) {
      throw toAuthError(error);
    }
  };

  const logOut = async () => {
    setAuthNotice(null);
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw toAuthError(error);
    }
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
