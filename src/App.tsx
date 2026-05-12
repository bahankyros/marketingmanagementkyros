import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { supabase } from './lib/supabase';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { UpdatePassword } from './pages/UpdatePassword';
import { Campaigns } from './pages/Campaigns';
import { Events } from './pages/Events';
import { MallDisplays } from './pages/MallDisplays';
import { Mascots } from './pages/Mascots';
import { SocialMedia } from './pages/SocialMedia';
import { BlogOutreach } from './pages/BlogOutreach';
import { Partnerships } from './pages/Partnerships';
import { PaidAds } from './pages/PaidAds';
import { DeliveryPromos } from './pages/DeliveryPromos';
import { AdHocTasks } from './pages/AdHocTasks';
import { Reports } from './pages/Reports';
import { Sales } from './pages/Sales';
import { Settings } from './pages/Settings';
import { Vouchers } from './pages/Vouchers';
import { Tasks } from './pages/Tasks';
import { Inbox } from './pages/Inbox';

type UserRole = 'admin' | 'supervisor' | 'finance' | 'pic';

const ALL_ACTIVE_ROLES: UserRole[] = ['admin', 'supervisor', 'finance', 'pic'];

function hasRecoveryHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return false;

  const hashParams = new URLSearchParams(hash);
  return hashParams.get('type') === 'recovery' && Boolean(hashParams.get('access_token'));
}

function getHashErrorMessage() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;

  const hashParams = new URLSearchParams(hash);
  const errorDescription = hashParams.get('error_description');
  if (!errorDescription) return null;

  return `${errorDescription}. Request a new reset link.`;
}

function clearUrlHash() {
  window.history.replaceState(
    window.history.state,
    document.title,
    `${window.location.pathname}${window.location.search}`
  );
}

const PasswordRecoveryListener = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const hashErrorMessage = getHashErrorMessage();
    if (hashErrorMessage) {
      clearUrlHash();
      navigate('/forgot-password', {
        replace: true,
        state: { authError: hashErrorMessage }
      });
      return;
    }

    if (hasRecoveryHash()) {
      navigate('/update-password', { replace: true });
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/update-password', { replace: true });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  return null;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, accessState } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (accessState !== 'active') return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RoleGuard = ({
  children,
  allowedRoles
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) => {
  const { user, userData, loading, accessState } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (accessState !== 'active') return <Navigate to="/login" replace />;
  if (!userData || !allowedRoles.includes(userData.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <BrowserRouter>
      <PasswordRecoveryListener />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<Login initialMode="reset" />} />
          <Route path="/update-password" element={<UpdatePassword />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route
              index
              element={
                <RoleGuard allowedRoles={ALL_ACTIVE_ROLES}>
                  <Dashboard />
                </RoleGuard>
              }
            />
            <Route
              path="dashboard"
              element={
                <RoleGuard allowedRoles={ALL_ACTIVE_ROLES}>
                  <Dashboard />
                </RoleGuard>
              }
            />
            <Route
              path="campaigns"
              element={
                <RoleGuard allowedRoles={ALL_ACTIVE_ROLES}>
                  <Campaigns />
                </RoleGuard>
              }
            />
            <Route
              path="events"
              element={
                <RoleGuard allowedRoles={['admin', 'supervisor', 'pic']}>
                  <Events />
                </RoleGuard>
              }
            />
            <Route
              path="mall-displays"
              element={
                <RoleGuard allowedRoles={['admin', 'supervisor', 'pic']}>
                  <MallDisplays />
                </RoleGuard>
              }
            />
            <Route
              path="mascots"
              element={
                <RoleGuard allowedRoles={['admin', 'supervisor', 'finance', 'pic']}>
                  <Mascots />
                </RoleGuard>
              }
            />
            <Route
              path="social"
              element={
                <RoleGuard allowedRoles={['admin', 'supervisor', 'finance', 'pic']}>
                  <SocialMedia />
                </RoleGuard>
              }
            />
            <Route
              path="blog"
              element={
                <RoleGuard allowedRoles={['admin', 'finance']}>
                  <BlogOutreach />
                </RoleGuard>
              }
            />
            <Route
              path="blog-outreach"
              element={
                <RoleGuard allowedRoles={['admin', 'finance']}>
                  <BlogOutreach />
                </RoleGuard>
              }
            />
            <Route
              path="partnerships"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <Partnerships />
                </RoleGuard>
              }
            />
            <Route
              path="ads"
              element={
                <RoleGuard allowedRoles={['admin', 'finance']}>
                  <PaidAds />
                </RoleGuard>
              }
            />
            <Route
              path="delivery"
              element={
                <RoleGuard allowedRoles={['admin', 'supervisor', 'pic']}>
                  <DeliveryPromos />
                </RoleGuard>
              }
            />
            <Route
              path="vouchers"
              element={
                <RoleGuard allowedRoles={['admin', 'supervisor', 'pic']}>
                  <Vouchers />
                </RoleGuard>
              }
            />
            <Route
              path="sales"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <Sales />
                </RoleGuard>
              }
            />
            <Route
              path="inbox"
              element={
                <RoleGuard allowedRoles={['admin', 'supervisor', 'pic']}>
                  <Inbox />
                </RoleGuard>
              }
            />
            <Route
              path="tasks"
              element={
                <RoleGuard allowedRoles={['admin', 'supervisor', 'pic']}>
                  <Tasks />
                </RoleGuard>
              }
            />
            <Route
              path="ad-hoc"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <AdHocTasks />
                </RoleGuard>
              }
            />
            <Route
              path="reports"
              element={
                <RoleGuard allowedRoles={['admin', 'finance']}>
                  <Reports />
                </RoleGuard>
              }
            />
            <Route
              path="settings"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <Settings />
                </RoleGuard>
              }
            />
            {/* Additional routes will be added here */}
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
