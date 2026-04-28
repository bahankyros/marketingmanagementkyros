import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Megaphone, Handshake, MonitorPlay, Calendar, Smile, BookOpen, Truck,
  CheckSquare, BarChart, Settings, LogOut, Ticket, Bell, TrendingUp, Menu, X
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

const navItems: Array<{
  path: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  allowedRoles?: Array<'admin' | 'supervisor' | 'finance' | 'pic'>;
}> = [
  { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { path: '/campaigns', label: 'Campaigns', icon: <Megaphone size={20} /> },
  { path: '/partnerships', label: 'Partnerships', icon: <Handshake size={20} />, adminOnly: true },
  { path: '/mall-displays', label: 'Displays', icon: <MonitorPlay size={20} /> },
  { path: '/events', label: 'Calendar', icon: <Calendar size={20} /> },
  { path: '/inbox', label: 'Inbox', icon: <Bell size={20} />, allowedRoles: ['admin', 'supervisor'] },
  { path: '/mascots', label: 'Mascot', icon: <Smile size={20} />, allowedRoles: ['admin', 'supervisor', 'pic'] },
  { path: '/blog', label: 'Blog', icon: <BookOpen size={20} />, adminOnly: true },
  { path: '/delivery', label: 'Delivery', icon: <Truck size={20} /> },
  { path: '/vouchers', label: 'Vouchers', icon: <Ticket size={20} /> },
  { path: '/tasks', label: 'Tasks', icon: <CheckSquare size={20} />, allowedRoles: ['admin', 'supervisor'] },
  { path: '/sales', label: 'Sales', icon: <TrendingUp size={20} />, adminOnly: true },
  { path: '/reports', label: 'Reports', icon: <BarChart size={20} />, adminOnly: true },
  { path: '/settings', label: 'Settings', icon: <Settings size={20} />, adminOnly: true },
];

export function Sidebar({
  mobileOpen,
  onClose
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const { userData, logOut } = useAuth();
  const userRole = userData?.role;
  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly) {
      return userRole === 'admin';
    }

    if (item.allowedRoles) {
      return userRole ? item.allowedRoles.includes(userRole) : false;
    }

    return true;
  });
  const orderedNavItems = userRole === 'admin'
    ? [
        ...visibleNavItems.filter((item) => item.path === '/inbox'),
        ...visibleNavItems.filter((item) => item.path !== '/inbox')
      ]
    : visibleNavItems;

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-[#000000]/30 transition-opacity lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[#c4c7c5] bg-[#ffffff] text-[#000000] transition-transform duration-200 ease-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-[#c4c7c5] px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#444746]">Kyros Marketing Management</p>
              <h1 className="mt-2 text-[22px] font-semibold leading-7 text-[#000000]">
                Marketing Control Centre
              </h1>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="border border-[#c4c7c5] p-2 text-[#444746] transition-colors hover:bg-[#f3f3f3] hover:text-[#000000] lg:hidden"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-1">
            {orderedNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 border px-3 py-3 text-[14px] font-medium leading-5 tracking-[0.1px] transition-colors ${
                    isActive
                      ? 'border-[#000000] bg-[#000000] text-[#ffffff]'
                      : 'border-transparent bg-transparent text-[#444746] hover:border-[#c4c7c5] hover:bg-[#f3f3f3] hover:text-[#000000]'
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="mt-auto border-t border-[#c4c7c5] px-4 py-4">
          <div className="flex items-center justify-between gap-4 border border-[#c4c7c5] bg-[#f3f3f3] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium leading-4 tracking-[0.5px] text-[#000000]">{userData?.email}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.5px] text-[#444746]">{userData?.role}</p>
            </div>
            <button 
              onClick={logOut}
              className="border border-[#747775] p-2 text-[#444746] transition-colors hover:bg-[#000000] hover:text-[#ffffff]"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);
  
  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#000000] [font-family:Inter,system-ui,sans-serif]">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-[#c4c7c5] bg-[#f9f9f9]/95 backdrop-blur-sm lg:hidden">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-[#444746]">Kyros Marketing Management</p>
              <h2 className="text-[16px] font-semibold leading-6 tracking-[0.15px] text-[#000000]">Marketing Control Centre</h2>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="border border-[#747775] bg-[#ffffff] p-2 text-[#000000] transition-colors hover:bg-[#f3f3f3]"
            >
              <Menu size={18} />
            </button>
          </div>
        </header>

        <main className="overflow-hidden px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1400px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
