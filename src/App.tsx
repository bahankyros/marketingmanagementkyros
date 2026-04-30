import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
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
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="campaigns" element={<Campaigns />} />
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
                <RoleGuard allowedRoles={['admin', 'supervisor', 'pic']}>
                  <Mascots />
                </RoleGuard>
              }
            />
            <Route path="social" element={<SocialMedia />} />
            <Route
              path="blog"
              element={
                <RoleGuard allowedRoles={['admin']}>
                  <BlogOutreach />
                </RoleGuard>
              }
            />
            <Route
              path="blog-outreach"
              element={
                <RoleGuard allowedRoles={['admin']}>
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
            <Route path="ads" element={<PaidAds />} />
            <Route path="delivery" element={<DeliveryPromos />} />
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
                <RoleGuard allowedRoles={['admin', 'supervisor']}>
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
                <RoleGuard allowedRoles={['admin']}>
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
      </BrowserRouter>
    </AuthProvider>
  );
}
