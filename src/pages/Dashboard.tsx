import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, AlertCircle, Megaphone, Target, DollarSign, Activity, AlertTriangle,
  Handshake, MonitorPlay, Calendar, Gift, Smile, BookOpen, Share2, PieChart,
  Store, Star, ArrowDownRight, Clock, MapPin, CheckSquare, ChevronRight, XCircle,
  BarChart2, Image, LayoutList, CheckCircle2, Circle
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { useDashboardData } from '../lib/useDashboardData';
import { CardSkeleton } from '../components/Skeleton';

type PicRequestTask = {
  id: string;
  title: string;
  description: string;
  status: string;
  outletId: string;
  dueAt: Date | null;
  createdAt: Date | null;
  creatorName: string;
  creatorOutlet: string;
};

function parseDashboardDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizePicRequestTask(row: any): PicRequestTask {
  const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator;
  const creatorName = typeof creator?.display_name === 'string' && creator.display_name.trim()
    ? creator.display_name.trim()
    : (typeof creator?.email === 'string' ? creator.email.trim() : 'PIC');

  return {
    id: typeof row.id === 'string' ? row.id : '',
    title: typeof row.title === 'string' ? row.title : '',
    description: typeof row.description === 'string' ? row.description : '',
    status: typeof row.status === 'string' ? row.status : 'assigned',
    outletId: typeof row.outlet_id === 'string' ? row.outlet_id : '',
    dueAt: parseDashboardDate(row.due_at),
    createdAt: parseDashboardDate(row.created_at),
    creatorName,
    creatorOutlet: typeof creator?.outlet_name === 'string' && creator.outlet_name.trim()
      ? creator.outlet_name.trim()
      : ''
  };
}

function RestrictedAccessPanel({
  title,
  message
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="bg-white border border-dashed border-neutral-200 rounded-2xl p-8 text-center">
      <AlertTriangle className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
      <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
      <p className="text-sm text-neutral-500 mt-1">{message}</p>
    </div>
  );
}

export function Dashboard() {
  const { user, userData } = useAuth();
  const userRole = userData?.role;
  const isAdminDashboard = userRole === 'admin';
  const isSupervisorDashboard = userRole === 'supervisor' || userRole === 'pic';
  const dbData = useDashboardData(user, userRole);
  const access = dbData.access;
  const [picRequestTasks, setPicRequestTasks] = useState<PicRequestTask[]>([]);
  const [picRequestError, setPicRequestError] = useState('');

  useEffect(() => {
    if (!user || !isAdminDashboard) {
      setPicRequestTasks([]);
      setPicRequestError('');
      return;
    }

    let isMounted = true;

    const loadPicRequestTasks = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          description,
          status,
          outlet_id,
          due_at,
          created_at,
          assigned_by_user_id,
          creator:users!tasks_assigned_by_user_id_fkey!inner(role, display_name, email, outlet_name)
        `)
        .eq('creator.role', 'pic')
        .not('status', 'in', '("approved","rejected","completed")')
        .order('created_at', { ascending: false })
        .limit(12);

      if (!isMounted) return;

      if (error) {
        console.error('Error loading PIC request tasks:', error);
        setPicRequestError('Failed to load PIC requests.');
        setPicRequestTasks([]);
        return;
      }

      setPicRequestError('');
      setPicRequestTasks((data || []).map(normalizePicRequestTask));
    };

    void loadPicRequestTasks();

    const channel = supabase
      .channel('admin-dashboard-pic-task-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        void loadPicRequestTasks();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, isAdminDashboard]);
  
  if (dbData.loading) {
    return (
      <div className="space-y-8 pb-12">
        <header>
          <div className="h-9 w-48 bg-neutral-100 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-72 bg-neutral-100 rounded-lg animate-pulse" />
        </header>
        <section className="space-y-6">
          <div className="h-6 w-48 bg-neutral-100 rounded-lg animate-pulse mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </section>
      </div>
    );
  }

  const outletData = access.outlets ? dbData.outlets.map(out => {
    const eventsForOutlet = dbData.events.mapped.filter(e => e.outlet === out.name);
    const displaysForOutlet = dbData.mallDisplays.mapped.filter(d => d.outlet === out.name);
    
    const additionalSales = eventsForOutlet.reduce((acc, curr) => acc + (curr.sales || 0), 0);
    const totalSales = Number(out.baseSales || 0) + additionalSales;
    
    const pendingDisplays = displaysForOutlet.filter(d => d.pending).length;
    const events = eventsForOutlet.filter(e => e.status === 'Approved' || e.status === 'Reviewing').length;
    const activities = displaysForOutlet.length + events;
    
    let status = 'Steady';
    let statusColor = 'text-blue-600';
    let statusBg = 'bg-blue-100';
    
    if (pendingDisplays > 0) { status = 'Pending Displays'; statusColor = 'text-amber-600'; statusBg = 'bg-amber-100'; }
    else if (events > 0) { status = 'Upcoming Event'; statusColor = 'text-indigo-600'; statusBg = 'bg-indigo-100'; }
    else if (activities > 3) { status = 'Top Performer'; statusColor = 'text-emerald-600'; statusBg = 'bg-emerald-100'; }
    else if (activities === 0) { status = 'Needs Attention'; statusColor = 'text-rose-600'; statusBg = 'bg-rose-100'; }

    return { name: out.name, sales: totalSales, activities, events, pendingDisplays, status, statusColor, statusBg };
  }) : [];

  // Fallback if no outlets are defined
  const finalOutletData = outletData.length > 0 ? outletData : access.outlets
    ? [{ name: 'No Outlets Configured', sales: 0, activities: 0, events: 0, pendingDisplays: 0, status: 'N/A', statusColor: 'text-neutral-400', statusBg: 'bg-neutral-100' }]
    : [];

  const lowestPerforming = finalOutletData.length > 0
    ? finalOutletData.reduce((prev, current) => (prev.sales < current.sales) ? prev : current, finalOutletData[0])
    : null;
  const pendingDisplaysTotal = dbData.mallDisplays.pending;
  const upcomingEventsTotal = dbData.events.joined;

  // -- Executive Data Synthesis --
  const totalSales = finalOutletData.reduce((acc, o) => acc + o.sales, 0) + dbData.promos.sales;
  const budgetAvailable = access.settings ? dbData.settings.totalMarketingBudget : 0;
  const totalBudgetUsed = dbData.campaigns.budgetUsed + dbData.paidAds.spend + dbData.promos.spend;
  const canViewKpiScore = userRole === 'admin';
  
  const rawKpiScore = canViewKpiScore
    ? Math.min(
        100,
        ((dbData.partnerships.activeCount / dbData.settings.partnershipTarget) * 12.5) +
        ((dbData.mallDisplays.activeCount / dbData.settings.displaySlotsTarget) * 12.5) +
        ((dbData.events.joined / dbData.settings.eventsTarget) * 12.5) +
        ((dbData.mascots.appearances / dbData.settings.mascotTarget) * 12.5) +
        ((dbData.blogs.published / dbData.settings.blogTarget) * 12.5) +
        ((dbData.social.published / dbData.settings.socialTarget) * 12.5) +
        25
      )
    : 0;

  const alerts: any[] = [];
  if (access.adHoc) {
    dbData.adHoc.list.filter(t => t.priority === 'Emergency' && t.status !== 'Solved').forEach((t, i) => {
      alerts.push({ id: `em-${i}`, type: 'danger', message: `Emergency: ${t.title}` });
    });
  }
  dbData.mallDisplays.mapped.filter(d => d.pending).forEach((d, i) => {
    alerts.push({ id: `md-${i}`, type: 'warning', message: `${d.outlet} display pending approval` });
  });

  const execData = {
    lastMonthSales: totalSales,
    salesGrowth: 8.4, // Static projection
    budgetAvailable,
    budgetUsed: totalBudgetUsed,
    kpiScore: canViewKpiScore ? Math.round(rawKpiScore) : null,
    activeCampaigns: dbData.campaigns.activeCount,
    alerts
  };

  const budgetPct = execData.budgetAvailable > 0 ? (execData.budgetUsed / execData.budgetAvailable) * 100 : 0;

  // -- KPI Data Synthesis --
  const kpiData = [
    { id: 'partnerships', label: 'Partnerships', current: dbData.partnerships.activeCount, target: dbData.settings.partnershipTarget, icon: Handshake, color: 'text-indigo-500', bg: 'bg-indigo-500', lightBg: 'bg-indigo-50', visible: access.partnerships },
    { id: 'displays', label: 'Active Displays', current: dbData.mallDisplays.activeCount, target: dbData.settings.displaySlotsTarget, icon: MonitorPlay, color: 'text-blue-500', bg: 'bg-blue-500', lightBg: 'bg-blue-50', visible: true },
    { id: 'events', label: 'Events Joined', current: dbData.events.joined, target: dbData.settings.eventsTarget, icon: Calendar, color: 'text-emerald-500', bg: 'bg-emerald-500', lightBg: 'bg-emerald-50', visible: true },
    { id: 'kebab', label: 'Kebab Campaign', current: dbData.partnerships.redeemed, target: dbData.settings.kebabTarget, icon: Gift, color: 'text-amber-500', bg: 'bg-amber-500', lightBg: 'bg-amber-50', visible: access.partnerships },
    { id: 'mascot', label: 'Mascot Appearances', current: dbData.mascots.appearances, target: dbData.settings.mascotTarget, icon: Smile, color: 'text-rose-500', bg: 'bg-rose-500', lightBg: 'bg-rose-50', visible: access.mascots },
    { id: 'blog', label: 'Blog Features', current: dbData.blogs.published, target: dbData.settings.blogTarget, icon: BookOpen, color: 'text-cyan-500', bg: 'bg-cyan-500', lightBg: 'bg-cyan-50', visible: access.blogs },
    { id: 'social', label: 'Social Content', current: dbData.social.published, target: dbData.settings.socialTarget, icon: Share2, color: 'text-fuchsia-500', bg: 'bg-fuchsia-500', lightBg: 'bg-fuchsia-50', visible: true },
    { id: 'ads', label: 'Ads Spend', current: dbData.paidAds.spend, target: dbData.settings.adBudget, prefix: 'RM ', icon: DollarSign, color: 'text-violet-500', bg: 'bg-violet-500', lightBg: 'bg-violet-50', visible: true },
  ].filter((kpi) => kpi.visible);

  // -- Action Center Synthesis --
  const actionItems = [
    { id: 'a1', title: 'Overdue Tasks', count: dbData.adHoc.overdue, type: 'danger', visible: access.adHoc },
    { id: 'a2', title: 'Pending Reviews', count: pendingDisplaysTotal + dbData.events.awaiting, type: 'warning', visible: true },
    { id: 'a3', title: 'Designs Needed', count: dbData.adHoc.designs, type: 'info', visible: access.adHoc },
    { id: 'a4', title: 'Emergencies', count: dbData.adHoc.emergencies, type: 'success', visible: access.adHoc },
    { id: 'a6', title: 'Event Reviews', count: dbData.events.awaiting, type: 'warning', visible: true }
  ].filter((action) => action.visible);

  // -- Campaign Performance Synthesis --
  const cList = [...dbData.campaigns.list];
  const activeAndDone = cList.filter(c => c.status !== 'Planning' && c.status !== 'Cancelled');
  const topCamp = activeAndDone.length > 0 ? activeAndDone[0] : { name: 'No Active Campaigns', type: 'N/A' };
  const botCamp = activeAndDone.length > 1 ? activeAndDone[activeAndDone.length - 1] : { name: 'No Underperforming', type: 'N/A' };

  const voucherTotal = dbData.partnerships.distributed;
  const voucherRedeemed = dbData.partnerships.redeemed;
  const voucherRate = voucherTotal > 0 ? ((voucherRedeemed / voucherTotal) * 100).toFixed(1) : '0.0';

  const promoRoas = dbData.promos.spend > 0 ? (((dbData.promos.sales - dbData.promos.spend) / dbData.promos.spend) * 100).toFixed(0) : '0';

  const campaignData = {
    top: { name: topCamp.name, roi: topCamp.type, leads: 'N/A' },
    bottom: { name: botCamp.name, roi: botCamp.type, leads: 'N/A' },
    voucherSummary: access.partnerships ? `${voucherRedeemed} claimed / ${voucherTotal} distributed (${voucherRate}% rate)` : 'Restricted access',
    deliveryPromoRoi: `${promoRoas}% ROAS`,
    paidAdsTrend: 'Tracking active'
  };

  // -- Creative Production Synthesis --
  const creativeData = access.adHoc
    ? dbData.adHoc.list
        .filter(t => t.status !== 'Solved' && (t.category === 'Design Needs' || t.category === 'Missing Assets'))
        .slice(0, 4)
        .map(t => ({ id: t.id, task: t.title, status: t.status }))
    : [];

  if (access.adHoc && creativeData.length === 0) {
    creativeData.push({ id: 'none', task: 'No pending design requests', status: 'All clear' });
  }

  // -- Ad Hoc Tasks Synthesis --
  const adhocData = access.adHoc
    ? [...dbData.adHoc.list]
        .filter(t => t.status !== 'Solved')
        .slice(0, 5)
        .map(t => ({ id: t.id, task: t.title, state: t.status.toLowerCase().replace(' ', '-') }))
    : [];

  if (access.adHoc && adhocData.length === 0) {
    adhocData.push({ id: 'none', task: 'No pending action items', state: 'solved' });
  }

  if (isSupervisorDashboard) {
    const supervisorCards = [
      {
        id: 'reviews',
        label: 'Pending Reviews',
        value: pendingDisplaysTotal + dbData.events.awaiting,
        helper: 'Displays and events waiting for follow-up.',
        icon: AlertCircle,
        iconClass: 'text-amber-600',
        bgClass: 'bg-amber-50'
      },
      {
        id: 'events',
        label: 'Upcoming Events',
        value: upcomingEventsTotal,
        helper: 'Approved or reviewing calendar items.',
        icon: Calendar,
        iconClass: 'text-emerald-600',
        bgClass: 'bg-emerald-50'
      },
      {
        id: 'displays',
        label: 'Active Displays',
        value: dbData.mallDisplays.activeCount,
        helper: 'Mall display slots currently active.',
        icon: MonitorPlay,
        iconClass: 'text-blue-600',
        bgClass: 'bg-blue-50'
      },
      {
        id: 'campaigns',
        label: 'Active Campaigns',
        value: execData.activeCampaigns,
        helper: 'Campaigns currently in motion.',
        icon: Megaphone,
        iconClass: 'text-rose-600',
        bgClass: 'bg-rose-50'
      }
    ];

    const supervisorKpis = kpiData.filter((kpi) => kpi.id === 'displays' || kpi.id === 'events');

    return (
      <div className="space-y-8 pb-12">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Supervisor Dashboard</h1>
          <p className="text-neutral-500 mt-1">
            Outlet operations view{userData?.outlet_name ? ` for ${userData.outlet_name}` : ''}.
          </p>
        </header>

        <motion.section
          className="space-y-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-rose-500" />
              Today
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {supervisorCards.map((card) => {
              const Icon = card.icon;

              return (
                <div key={card.id} className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex flex-col justify-between">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <p className="text-sm font-medium text-neutral-500">{card.label}</p>
                      <h3 className="text-2xl font-bold text-neutral-900 mt-1">{card.value}</h3>
                    </div>
                    <div className={`p-2 rounded-lg ${card.bgClass}`}>
                      <Icon className={`w-5 h-5 ${card.iconClass}`} />
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-neutral-500">{card.helper}</p>
                </div>
              );
            })}
          </div>
        </motion.section>

        <motion.section
          className="space-y-6 pt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-fuchsia-500" />
              Action Queue
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {actionItems.map((action) => {
              let colorClasses = '';
              let IconClass = ChevronRight;

              switch (action.type) {
                case 'danger':
                  colorClasses = action.count > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-neutral-50 border-neutral-200 text-neutral-500';
                  IconClass = action.count > 0 ? XCircle : CheckSquare;
                  break;
                case 'warning':
                  colorClasses = action.count > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-neutral-50 border-neutral-200 text-neutral-500';
                  IconClass = action.count > 0 ? AlertCircle : CheckSquare;
                  break;
                case 'info':
                  colorClasses = action.count > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-neutral-50 border-neutral-200 text-neutral-500';
                  IconClass = action.count > 0 ? Clock : CheckSquare;
                  break;
                case 'success':
                  colorClasses = action.count > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-neutral-50 border-neutral-200 text-neutral-500';
                  IconClass = action.count > 0 ? AlertTriangle : CheckSquare;
                  break;
              }

              return (
                <button
                  key={action.id}
                  className={`relative overflow-hidden p-5 rounded-2xl shadow-sm border transition-all text-left flex flex-col justify-between group ${
                    action.count > 0 ? `hover:-translate-y-1 hover:shadow-md ${colorClasses}` : 'opacity-70 bg-neutral-50 border-neutral-100 hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex justify-between items-start w-full mb-4">
                    <div className={`p-2 rounded-lg bg-white/60 shadow-sm ${action.count > 0 ? '' : 'grayscale'}`}>
                      <IconClass className="w-5 h-5" />
                    </div>
                    <span className={`text-2xl font-bold ${action.count > 0 ? '' : 'text-neutral-400'}`}>
                      {action.count}
                    </span>
                  </div>

                  <p className={`font-semibold tracking-tight ${action.count > 0 ? '' : 'text-neutral-500'}`}>
                    {action.title}
                  </p>
                </button>
              );
            })}
          </div>
        </motion.section>

        <motion.section
          className="space-y-6 pt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
              <PieChart className="h-5 w-5 text-indigo-500" />
              Outlet KPIs
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {supervisorKpis.map((kpi) => {
              const pct = Math.min((kpi.current / kpi.target) * 100, 100);

              return (
                <div key={kpi.id} className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 hover:border-neutral-200 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2 rounded-lg ${kpi.lightBg}`}>
                      <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-neutral-900 tracking-tight">
                        {kpi.current.toLocaleString()} <span className="text-sm text-neutral-400 font-medium tracking-normal">/ {kpi.target.toLocaleString()}</span>
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-neutral-700 mb-2">{kpi.label}</p>
                    <div className="w-full bg-neutral-100 rounded-full h-1.5 mb-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${kpi.bg} transition-all duration-1000 ease-out`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-xs text-neutral-500 font-medium">
                      <span>Progress</span>
                      <span>{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      </div>
    );
  }

  if (!isAdminDashboard) {
    return (
      <div className="space-y-8 pb-12">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Dashboard</h1>
          <p className="text-neutral-500 mt-1">No dashboard view is configured for this role yet.</p>
        </header>
        <RestrictedAccessPanel
          title="Dashboard Restricted"
          message="Admin, supervisor, and PIC dashboards are the active role-based views."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Admin Dashboard</h1>
        <p className="text-neutral-500 mt-1">
          Admin command view for the full marketing operation.
        </p>
      </header>
      
      {/* SECTION A. EXECUTIVE SUMMARY */}
      <motion.section 
        className="space-y-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-rose-500" />
            Overview
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Last Month Sales */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-neutral-500">Monthly Sales</p>
                <h3 className="text-2xl font-bold text-neutral-900 mt-1">
                  RM {execData.lastMonthSales.toLocaleString()}
                </h3>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
              <TrendingUp className="w-4 h-4" />
              <span>+{execData.salesGrowth}%</span>
              <span className="text-neutral-400 font-normal ml-1">{access.outlets ? 'vs last month' : 'partial'}</span>
            </div>
          </div>

          {/* Budget */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex flex-col justify-between">
            {access.settings ? (
              <>
                <div className="flex justify-between items-start">
                  <div className="w-full">
                    <div className="flex justify-between items-center w-full">
                      <p className="text-sm font-medium text-neutral-500">Budget Used</p>
                      <p className="text-xs font-semibold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-full">
                        RM {execData.budgetUsed.toLocaleString()} / RM {execData.budgetAvailable.toLocaleString()}
                      </p>
                    </div>
                    <h3 className="text-2xl font-bold text-neutral-900 mt-1">
                      {budgetPct.toFixed(1)}%
                    </h3>
                  </div>
                </div>
                <div className="mt-4 w-full bg-neutral-100 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${budgetPct > 85 ? 'bg-rose-500' : 'bg-neutral-900'}`} 
                    style={{ width: `${Math.min(budgetPct, 100)}%` }}
                  ></div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500">Budget Used</p>
                  <h3 className="text-lg font-bold text-neutral-400 mt-1">Restricted</h3>
                </div>
                <p className="mt-4 text-sm text-neutral-500">Budget access is restricted.</p>
              </div>
            )}
          </div>

          {/* KPI Score */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex flex-col justify-between">
            {execData.kpiScore !== null ? (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-neutral-500">KPI Score</p>
                    <h3 className="text-2xl font-bold text-neutral-900 mt-1">
                      {execData.kpiScore}<span className="text-lg text-neutral-400 font-medium">/100</span>
                    </h3>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Target className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-neutral-500">Based on 6 live metrics.</p>
              </>
            ) : (
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500">KPI Score</p>
                  <h3 className="text-lg font-bold text-neutral-400 mt-1">Restricted</h3>
                </div>
                <p className="mt-4 text-sm text-neutral-500">This score uses admin-only data.</p>
              </div>
            )}
          </div>

          {/* Active Campaigns */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-neutral-500">Active Campaigns</p>
                <h3 className="text-2xl font-bold text-neutral-900 mt-1">
                  {execData.activeCampaigns}
                </h3>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg">
                <Megaphone className="w-5 h-5 text-amber-600" />
              </div>
            </div>
            <p className="mt-4 text-sm text-neutral-500">3 start next week</p>
          </div>
        </div>

        {/* High-priority alerts */}
        <div className="bg-white border border-rose-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-rose-50/50 px-5 py-4 border-b border-rose-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
              <h3 className="font-semibold text-rose-900">Priority Alerts</h3>
            </div>
            <span className="text-xs font-semibold bg-rose-100 text-rose-700 px-2 py-1 rounded-full">
              {execData.alerts.length} Need Action
            </span>
          </div>
          <div className="divide-y divide-neutral-100">
            {execData.alerts.map(alert => (
              <div key={alert.id} className="p-4 px-5 flex items-start justify-between hover:bg-neutral-50 transition-colors group">
                <div className="flex items-start gap-4">
                  {alert.type === 'danger' ? (
                    <div className="p-1.5 bg-rose-100 text-rose-600 rounded mt-0.5">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="p-1.5 bg-amber-100 text-amber-600 rounded mt-0.5">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{alert.message}</p>
                    <button className="text-xs font-semibold text-rose-600 hover:text-rose-700 mt-1 transition-colors">
                      Review
                    </button>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="text-neutral-400 hover:text-neutral-600 p-2">
                    <span className="sr-only">Dismiss</span>
                    &times;
                  </button>
                </div>
              </div>
            ))}
            {execData.alerts.length === 0 && (
              <div className="p-6 text-center text-sm text-neutral-500">
                No priority alerts.
              </div>
            )}
          </div>
        </div>
      </motion.section>

      <motion.section
        className="space-y-6 pt-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-fuchsia-500" />
            Action Required: PIC Requests
          </h2>
          <span className="rounded-full bg-fuchsia-50 px-3 py-1 text-sm font-semibold text-fuchsia-700">
            {picRequestTasks.length}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-sm">
          {picRequestError ? (
            <div className="p-6 text-sm font-medium text-rose-600">{picRequestError}</div>
          ) : picRequestTasks.length === 0 ? (
            <div className="p-6 text-sm text-neutral-500">No PIC requests waiting for admin action.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-100 bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Request</th>
                    <th className="px-5 py-3 font-medium">PIC</th>
                    <th className="px-5 py-3 font-medium">Due</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {picRequestTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-neutral-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-neutral-900">{task.title}</p>
                        <p className="mt-1 max-w-xl text-neutral-500">{task.description || 'No description provided.'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-neutral-900">{task.creatorName}</p>
                        <p className="mt-1 text-neutral-500">{task.creatorOutlet || task.outletId}</p>
                      </td>
                      <td className="px-5 py-4 text-neutral-600">
                        {task.dueAt ? task.dueAt.toLocaleString() : 'No due date'}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-700">
                          {task.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.section>

      {/* SECTION B. KPI PROGRESS TRACKER */}
      <motion.section 
        className="space-y-6 pt-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <PieChart className="h-5 w-5 text-indigo-500" />
            KPI Tracker
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiData.map((kpi) => {
            const pct = Math.min((kpi.current / kpi.target) * 100, 100);
            return (
              <div key={kpi.id} className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 hover:border-neutral-200 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-2 rounded-lg ${kpi.lightBg}`}>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-neutral-900 tracking-tight">
                      {kpi.prefix}{kpi.current.toLocaleString()} <span className="text-sm text-neutral-400 font-medium tracking-normal">/ {kpi.prefix}{kpi.target.toLocaleString()}</span>
                    </p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-neutral-700 mb-2">{kpi.label}</p>
                  <div className="w-full bg-neutral-100 rounded-full h-1.5 mb-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${kpi.bg} transition-all duration-1000 ease-out`} 
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs text-neutral-500 font-medium">
                    <span>Progress</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* SECTION C. OUTLET PERFORMANCE */}
      <motion.section 
        className="space-y-6 pt-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <Store className="h-5 w-5 text-teal-500" />
            Outlet Performance
          </h2>
        </div>

        {access.outlets ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Table */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50/50 border-b border-neutral-100 text-sm text-neutral-500">
                      <th className="font-medium px-6 py-4">Outlet</th>
                      <th className="font-medium px-6 py-4 text-right">Sales</th>
                      <th className="font-medium px-6 py-4 text-center">Activity</th>
                      <th className="font-medium px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {finalOutletData.map((outlet, index) => (
                      <tr key={index} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-neutral-900 flex items-center gap-3">
                          <MapPin className="w-4 h-4 text-neutral-400" />
                          {outlet.name}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-neutral-700">
                          RM {outlet.sales.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center bg-neutral-100 text-neutral-700 rounded-full w-7 h-7 text-xs font-semibold">
                            {outlet.activities}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${outlet.statusColor} ${outlet.statusBg}`}>
                            {outlet.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Insights Sub-Grid */}
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-rose-100 flex flex-col justify-between h-[120px]">
                 <div className="flex justify-between items-start">
                   <div>
                     <p className="text-xs font-semibold text-rose-500 uppercase tracking-wider">Lowest Outlet</p>
                     <h3 className="text-xl font-bold text-neutral-900">{lowestPerforming?.name || 'N/A'}</h3>
                   </div>
                   <ArrowDownRight className="text-rose-500 w-5 h-5" />
                 </div>
                 <p className="text-sm text-neutral-500">RM {lowestPerforming?.sales.toLocaleString() || '0'} this cycle. Needs action.</p>
              </div>
              
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                     <Clock className="w-5 h-5" />
                   </div>
                   <div>
                     <p className="text-sm font-medium text-neutral-500">Display Approvals</p>
                     <p className="text-lg font-bold text-neutral-900">{pendingDisplaysTotal}</p>
                   </div>
                 </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                     <Star className="w-5 h-5" />
                   </div>
                   <div>
                     <p className="text-sm font-medium text-neutral-500">Upcoming Events</p>
                     <p className="text-lg font-bold text-neutral-900">{upcomingEventsTotal}</p>
                   </div>
                 </div>
              </div>
            </div>
          </div>
        ) : (
          <RestrictedAccessPanel
            title="Outlet Performance Restricted"
            message="Outlet sales and outlet-level performance are available to admin users only in Phase 1.5."
          />
        )}
      </motion.section>

      {/* SECTION D. ACTION CENTER */}
      <motion.section 
        className="space-y-6 pt-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-fuchsia-500" />
            Action Queue
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {actionItems.map((action) => {
            let colorClasses = '';
            let IconClass = ChevronRight;

            switch (action.type) {
              case 'danger':
                colorClasses = action.count > 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-neutral-50 border-neutral-200 text-neutral-500';
                IconClass = action.count > 0 ? XCircle : CheckSquare;
                break;
              case 'warning':
                colorClasses = action.count > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-neutral-50 border-neutral-200 text-neutral-500';
                IconClass = action.count > 0 ? AlertCircle : CheckSquare;
                break;
              case 'info':
                colorClasses = action.count > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-neutral-50 border-neutral-200 text-neutral-500';
                IconClass = action.count > 0 ? Clock : CheckSquare;
                break;
              case 'success':
                colorClasses = action.count > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-neutral-50 border-neutral-200 text-neutral-500';
                IconClass = action.count > 0 ? AlertTriangle : CheckSquare;
                break;
            }

            return (
              <button 
                key={action.id} 
                className={`relative overflow-hidden p-5 rounded-2xl shadow-sm border transition-all text-left flex flex-col justify-between group 
                  ${action.count > 0 ? `hover:-translate-y-1 hover:shadow-md ${colorClasses}` : 'opacity-70 bg-neutral-50 border-neutral-100 hover:bg-neutral-100'}`}
              >
                <div className="flex justify-between items-start w-full mb-4">
                  <div className={`p-2 rounded-lg bg-white/60 shadow-sm ${action.count > 0 ? '' : 'grayscale'}`}>
                    <IconClass className="w-5 h-5" />
                  </div>
                  <span className={`text-2xl font-bold ${action.count > 0 ? '' : 'text-neutral-400'}`}>
                    {action.count}
                  </span>
                </div>
                
                <p className={`font-semibold tracking-tight ${action.count > 0 ? '' : 'text-neutral-500'}`}>
                  {action.title}
                </p>
                
                {action.count > 0 && (
                  <div className="absolute bottom-4 right-4 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </motion.section>

      {/* THREE-COLUMN GRID for Sections E, F, G */}
      <motion.div 
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        
        {/* SECTION E: CAMPAIGN PERFORMANCE */}
        <section className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-6">
            <BarChart2 className="w-5 h-5 text-indigo-500" />
            <h2 className="font-semibold text-neutral-900">Campaigns</h2>
          </div>
          
          <div className="space-y-5 flex-grow">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Top Campaign</p>
              <h3 className="font-bold text-neutral-900">{campaignData.top.name}</h3>
              <p className="text-sm text-neutral-600 mt-1">{campaignData.top.roi} ROI • {campaignData.top.leads} Leads</p>
            </div>
            
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-1">Underperforming</p>
              <h3 className="font-bold text-neutral-900">{campaignData.bottom.name}</h3>
              <p className="text-sm text-neutral-600 mt-1">{campaignData.bottom.roi} ROI • {campaignData.bottom.leads} Leads</p>
            </div>

            <ul className="space-y-3 pt-2 text-sm text-neutral-600">
              <li className="flex justify-between items-center pb-2 border-b border-neutral-100">
                <span>Vouchers</span>
                <span className="font-medium text-neutral-900">{campaignData.voucherSummary}</span>
              </li>
              <li className="flex justify-between items-center pb-2 border-b border-neutral-100">
                <span>Delivery Promo</span>
                <span className="font-medium text-neutral-900">{campaignData.deliveryPromoRoi}</span>
              </li>
              <li className="flex justify-between items-center">
                <span>Paid Ads Trend</span>
                <span className="font-medium text-emerald-600">{campaignData.paidAdsTrend}</span>
              </li>
            </ul>
          </div>
        </section>

        {/* SECTION F: CREATIVE PRODUCTION */}
        <section className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-6">
            <Image className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-neutral-900">Creatives</h2>
          </div>

          {access.adHoc ? (
            <div className="space-y-0 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-neutral-200 before:to-transparent flex-grow">
              {creativeData.map((item, idx) => (
                 <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group pb-6 last:pb-0">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-neutral-200 text-neutral-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                      <span className="text-[10px] font-bold">{idx + 1}</span>
                    </div>
                    <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] p-4 rounded-xl border border-neutral-100 bg-neutral-50/50 shadow-sm">
                      <h3 className="font-medium text-sm text-neutral-900 mb-1">{item.task}</h3>
                      <span className="text-xs font-medium px-2 py-0.5 bg-white border border-neutral-200 rounded-md text-neutral-500">{item.status}</span>
                    </div>
                 </div>
              ))}
            </div>
          ) : (
            <RestrictedAccessPanel
              title="Creative Queue Restricted"
              message="Creative requests come from Ad Hoc Tasks, which are admin-only in this phase."
            />
          )}
        </section>

        {/* SECTION G: AD HOC TASKS */}
        <section className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-6">
            <LayoutList className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-neutral-900">Ad Hoc</h2>
          </div>

          {access.adHoc ? (
            <div className="space-y-3 flex-grow">
              {adhocData.map(task => {
                let Icon = Circle;
                let iconColor = 'text-neutral-400';
                let bgColor = 'bg-neutral-50';
                
                if (task.state === 'solved') {
                  Icon = CheckCircle2;
                  iconColor = 'text-emerald-500';
                } else if (task.state === 'overdue') {
                  iconColor = 'text-rose-500';
                  bgColor = 'bg-rose-50/50 border-rose-100';
                } else if (task.state === 'in-progress') {
                  iconColor = 'text-blue-500';
                }

                return (
                  <div key={task.id} className={`p-4 rounded-xl border border-neutral-100 flex items-start gap-3 ${bgColor}`}>
                    <Icon className={`w-5 h-5 shrink-0 ${iconColor} mt-0.5`} />
                    <div className="w-full">
                      <p className={`text-sm font-medium ${task.state === 'solved' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                        {task.task}
                      </p>
                      <p className="text-xs uppercase tracking-wider font-semibold text-neutral-400 mt-1">
                        {task.state.replace('-', ' ')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <RestrictedAccessPanel
              title="Ad Hoc Queue Restricted"
              message="Task backlog, emergencies, and design requests are available to admin users only."
            />
          )}
        </section>

      </motion.div>
    </div>
  );
}
