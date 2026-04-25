import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from './supabase';

type UserRole = 'admin' | 'supervisor' | 'finance';
type UserStatus = 'active' | 'invited' | 'suspended';
type AccessState = UserStatus | 'not_provisioned';
const ACCOUNT_NOT_PROVISIONED_MESSAGE = 'Account not provisioned. Please contact an admin.';

export type AuthUser = SupabaseUser & {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
};

interface UserData {
  id: string;
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

type UserProfileRow = {
  id: string;
  auth_user_id: string | null;
  email: string;
  display_name: string | null;
  role: string;
  outlet_id: string | null;
  outlet_name: string | null;
  status: string | null;
  photo_url: string | null;
};

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

function normalizeUserData(currentUser: AuthUser, profile: UserProfileRow): UserData | null {
  if (!isUserRole(profile.role)) {
    return null;
  }

  const outletId = getMetadataString(profile.outlet_id);
  const outletName = getMetadataString(profile.outlet_name);

  return {
    id: profile.id,
    auth_uid: profile.auth_user_id || currentUser.id,
    email: profile.email || currentUser.email || '',
    display_name: profile.display_name || currentUser.displayName || currentUser.email || '',
    role: profile.role,
    outlet_id: outletId,
    outlet_name: outletName,
    status: isUserStatus(profile.status) ? profile.status : 'active',
    photo_url: profile.photo_url || currentUser.photoURL || '',
    outlet: outletName,
  };
}

async function fetchUserProfile(currentUser: SupabaseUser): Promise<UserProfileRow | null> {
  const profileColumns = 'id, auth_user_id, email, display_name, role, outlet_id, outlet_name, status, photo_url';
  const { data: authProfile, error: authProfileError } = await supabase
    .from('users')
    .select(profileColumns)
    .eq('auth_user_id', currentUser.id)
    .maybeSingle();

  if (authProfileError) {
    throw authProfileError;
  }

  if (authProfile) {
    return authProfile as UserProfileRow;
  }

  const emailKey = normalizeEmailKey(currentUser.email);
  if (!emailKey) {
    return null;
  }

  const { data: emailProfile, error: emailProfileError } = await supabase
    .from('users')
    .select(profileColumns)
    .eq('email', emailKey)
    .maybeSingle();

  if (emailProfileError) {
    throw emailProfileError;
  }

  if (!emailProfile) {
    return null;
  }

  const provisionalProfile = emailProfile as UserProfileRow;
  if (!provisionalProfile.auth_user_id) {
    const { data: claimedProfile, error: claimError } = await supabase
      .from('users')
      .update({
        auth_user_id: currentUser.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', provisionalProfile.id)
      .select(profileColumns)
      .single();

    if (claimError) {
      console.error('Error claiming Supabase user profile:', claimError);
      return provisionalProfile;
    }

    return claimedProfile as UserProfileRow;
  }

  return provisionalProfile;
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

function getAccessNotice(accessState: AccessState | null) {
  if (accessState === 'not_provisioned') {
    return ACCOUNT_NOT_PROVISIONED_MESSAGE;
  }

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
    let requestToken = 0;

    const applySessionUser = async (sessionUser: SupabaseUser | null | undefined) => {
      const activeRequest = requestToken + 1;
      requestToken = activeRequest;

      if (!isMounted) {
        return;
      }

      setLoading(true);

      if (!sessionUser) {
        setUser(null);
        setUserData(null);
        setAccessState(null);
        setAuthNotice(null);
        setLoading(false);
        return;
      }

      const nextUser = toAuthUser(sessionUser);
      let nextUserData: UserData | null = null;
      let nextAccessState: AccessState = 'not_provisioned';

      try {
        const profile = await fetchUserProfile(sessionUser);
        nextUserData = profile ? normalizeUserData(nextUser, profile) : null;
        nextAccessState = nextUserData?.status ?? 'not_provisioned';
      } catch (error) {
        console.error('Error loading Supabase user profile:', error);
      }

      if (!isMounted || activeRequest !== requestToken) {
        return;
      }

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
        void applySessionUser(data.session?.user);
      })
      .catch((error) => {
        console.error('Error loading Supabase session:', error);
        void applySessionUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySessionUser(session?.user);
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
