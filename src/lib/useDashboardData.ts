import { useState, useEffect } from 'react';
import type { AuthUser } from './AuthContext';
import { supabase } from './supabase';
import { subscribeToTable } from './supabaseData';

type UserRole = 'admin' | 'supervisor' | 'finance' | 'pic';

type DashboardAccess = {
  settings: boolean;
  outlets: boolean;
  campaigns: boolean;
  partnerships: boolean;
  events: boolean;
  mallDisplays: boolean;
  social: boolean;
  paidAds: boolean;
  adHoc: boolean;
  mascots: boolean;
  blogs: boolean;
  promos: boolean;
};

const DEFAULT_SETTINGS = {
  partnershipTarget: 30,
  displaySlotsTarget: 18,
  eventsTarget: 2,
  kebabTarget: 50,
  mascotTarget: 4,
  blogTarget: 10,
  socialTarget: 15,
  adBudget: 5000,
  totalMarketingBudget: 50000
};

function buildDashboardAccess(userRole: UserRole | null | undefined): DashboardAccess {
  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor' || userRole === 'pic';
  const isFinance = userRole === 'finance';
  const canReadOperational = isAdmin || isSupervisor || isFinance;

  return {
    settings: isAdmin || isSupervisor,
    outlets: isAdmin,
    campaigns: canReadOperational,
    partnerships: isAdmin,
    events: canReadOperational,
    mallDisplays: canReadOperational,
    social: canReadOperational,
    paidAds: canReadOperational,
    adHoc: isAdmin,
    mascots: isAdmin,
    blogs: isAdmin,
    promos: canReadOperational
  };
}

function createInitialDashboardData(access: DashboardAccess) {
  return {
    access,
    campaigns: { list: [] as any[], activeCount: 0, budgetUsed: 0 },
    partnerships: { activeCount: 0, distributed: 0, redeemed: 0 },
    events: { joined: 0, awaiting: 0, sales: 0, mapped: [] as any[] },
    mallDisplays: { activeCount: 0, pending: 0, mapped: [] as any[] },
    social: { published: 0 },
    paidAds: { spend: 0, list: [] as any[] },
    adHoc: { list: [] as any[], overdue: 0, designs: 0, emergencies: 0 },
    mascots: { appearances: 0 },
    blogs: { published: 0 },
    promos: { sales: 0, spend: 0, list: [] as any[] },
    settings: { ...DEFAULT_SETTINGS },
    outlets: [] as any[]
  };
}

function normalizeSettings(row: any) {
  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    partnershipTarget: Number(row.partnership_target ?? DEFAULT_SETTINGS.partnershipTarget),
    displaySlotsTarget: Number(row.display_slots_target ?? DEFAULT_SETTINGS.displaySlotsTarget),
    eventsTarget: Number(row.events_target ?? DEFAULT_SETTINGS.eventsTarget),
    kebabTarget: Number(row.kebab_target ?? DEFAULT_SETTINGS.kebabTarget),
    mascotTarget: Number(row.mascot_target ?? DEFAULT_SETTINGS.mascotTarget),
    blogTarget: Number(row.blog_target ?? DEFAULT_SETTINGS.blogTarget),
    socialTarget: Number(row.social_target ?? DEFAULT_SETTINGS.socialTarget),
    adBudget: Number(row.ad_budget ?? DEFAULT_SETTINGS.adBudget),
    totalMarketingBudget: Number(row.total_marketing_budget ?? DEFAULT_SETTINGS.totalMarketingBudget)
  };
}

export function useDashboardData(user: AuthUser | null, userRole: UserRole | null | undefined) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(() => createInitialDashboardData(buildDashboardAccess(userRole)));

  useEffect(() => {
    const access = buildDashboardAccess(userRole);
    setData(createInitialDashboardData(access));

    if (!user || !userRole) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const totalStreams = [
      access.settings,
      access.outlets,
      access.campaigns,
      access.partnerships,
      access.events,
      access.mallDisplays,
      access.social,
      access.paidAds,
      access.adHoc,
      access.mascots,
      access.blogs,
      access.promos
    ].filter(Boolean).length;

    if (totalStreams === 0) {
      setLoading(false);
      return;
    }

    let settledStreams = 0;
    const unsubscribers: Array<() => void> = [];

    const registerStream = (
      enabled: boolean,
      streamName: string,
      tables: string[],
      load: () => Promise<void>
    ) => {
      if (!enabled) {
        return;
      }

      let hasSettled = false;
      const settle = () => {
        if (hasSettled) {
          return;
        }

        hasSettled = true;
        settledStreams += 1;
        if (settledStreams >= totalStreams) {
          setLoading(false);
        }
      };

      const run = async () => {
        try {
          await load();
        } catch (error) {
          console.error(`${streamName} dashboard query error:`, error);
        } finally {
          settle();
        }
      };

      void run();
      tables.forEach((table) => {
        unsubscribers.push(subscribeToTable(`dashboard-${streamName}-${table}`, table, () => {
          void run();
        }));
      });
    };

    registerStream(access.settings, 'settings', ['settings'], async () => {
      const { data: settingsRow, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'globals')
        .maybeSingle();

      if (error) throw error;
      setData((prev) => ({ ...prev, settings: normalizeSettings(settingsRow) }));
    });

    registerStream(access.outlets, 'outlets', ['outlets'], async () => {
      const { data: outlets, error } = await supabase
        .from('outlets')
        .select('*');

      if (error) throw error;
      setData((prev) => ({ ...prev, outlets: outlets || [] }));
    });

    registerStream(access.campaigns, 'campaigns', ['campaigns'], async () => {
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('*');

      if (error) throw error;

      let activeCount = 0;
      let budgetUsed = 0;
      const list = campaigns || [];
      list.forEach((campaign: any) => {
        if (campaign.status === 'Active') activeCount++;
        budgetUsed += Number(campaign.budget || 0);
      });

      setData((prev) => ({ ...prev, campaigns: { list, activeCount, budgetUsed } }));
    });

    registerStream(access.partnerships, 'partnerships', ['partnerships'], async () => {
      const { data: partnerships, error } = await supabase
        .from('partnerships')
        .select('*');

      if (error) throw error;

      let activeCount = 0;
      let distributed = 0;
      let redeemed = 0;
      (partnerships || []).forEach((partnership: any) => {
        if (partnership.stage === 'Active') activeCount++;
        distributed += Number(partnership.vouchers_allocated || 0);
        redeemed += Number(partnership.vouchers_redeemed || 0);
      });

      setData((prev) => ({ ...prev, partnerships: { activeCount, distributed, redeemed } }));
    });

    registerStream(access.events, 'events', ['events'], async () => {
      const { data: events, error } = await supabase
        .from('events')
        .select('*');

      if (error) throw error;

      let joined = 0;
      let awaiting = 0;
      let sales = 0;
      const mapped: any[] = [];

      (events || []).forEach((event: any) => {
        if (event.decision_status === 'Approved' || event.decision_status === 'Completed') joined++;
        if (event.decision_status === 'Reviewing') awaiting++;
        sales += Number(event.sales_generated || 0);
        mapped.push({
          outlet: event.outlet_name || '',
          status: event.decision_status,
          sales: Number(event.sales_generated || 0)
        });
      });

      setData((prev) => ({ ...prev, events: { joined, awaiting, sales, mapped } }));
    });

    registerStream(access.mallDisplays, 'mall-displays', ['mall_displays'], async () => {
      const { data: displays, error } = await supabase
        .from('mall_displays')
        .select('*');

      if (error) throw error;

      let activeCount = 0;
      let pending = 0;
      const mapped: any[] = [];

      (displays || []).forEach((display: any) => {
        if (display.approval_status === 'Approved' || display.current_status === 'Installed' || display.design_status === 'Approved') activeCount++;
        if (display.approval_status === 'Pending' || display.approval_status === 'Pending approval') pending++;
        mapped.push({
          outlet: display.outlet_name || '',
          pending: display.approval_status === 'Pending' || display.approval_status === 'Pending approval'
        });
      });

      setData((prev) => ({ ...prev, mallDisplays: { activeCount, pending, mapped } }));
    });

    registerStream(access.social, 'social', ['social_posts'], async () => {
      const { data: posts, error } = await supabase
        .from('social_posts')
        .select('*');

      if (error) throw error;

      const published = (posts || []).filter((post: any) => post.status === 'Published').length;
      setData((prev) => ({ ...prev, social: { published } }));
    });

    registerStream(access.paidAds, 'paid-ads', ['paid_ads'], async () => {
      const { data: ads, error } = await supabase
        .from('paid_ads')
        .select('*');

      if (error) throw error;

      let spend = 0;
      const list = ads || [];
      list.forEach((ad: any) => {
        spend += Number(ad.spend || 0);
      });

      setData((prev) => ({ ...prev, paidAds: { spend, list } }));
    });

    registerStream(access.adHoc, 'ad-hoc', ['ad_hoc_tasks'], async () => {
      const { data: tasks, error } = await supabase
        .from('ad_hoc_tasks')
        .select('*');

      if (error) throw error;

      let overdue = 0;
      let designs = 0;
      let emergencies = 0;
      const list = tasks || [];
      const today = new Date().toISOString().split('T')[0];

      list.forEach((task: any) => {
        const dueDate = task.due_date || task.dueDate;
        const isOverdue = task.status !== 'Solved' && dueDate && dueDate < today;
        if (task.status === 'Overdue' || isOverdue) overdue++;
        if (task.status !== 'Solved' && (task.category === 'Design Needs' || task.category === 'Missing Assets')) designs++;
        if (task.status !== 'Solved' && (task.priority === 'Emergency' || task.category === 'Emergency Issues')) emergencies++;
      });

      setData((prev) => ({ ...prev, adHoc: { list, overdue, designs, emergencies } }));
    });

    registerStream(access.mascots, 'mascots', ['mascot_schedule'], async () => {
      const { data: schedule, error } = await supabase
        .from('mascot_schedule')
        .select('*');

      if (error) throw error;

      const appearances = (schedule || []).filter((scheduleItem: any) =>
        scheduleItem.status === 'Completed' || scheduleItem.status === 'Approved'
      ).length;

      setData((prev) => ({ ...prev, mascots: { appearances } }));
    });

    registerStream(access.blogs, 'blogs', ['blog_outreach'], async () => {
      const { data: outreach, error } = await supabase
        .from('blog_outreach')
        .select('*');

      if (error) throw error;

      const published = (outreach || []).filter((item: any) => item.status === 'Published').length;
      setData((prev) => ({ ...prev, blogs: { published } }));
    });

    registerStream(access.promos, 'promos', ['delivery_promos'], async () => {
      const { data: promos, error } = await supabase
        .from('delivery_promos')
        .select('*');

      if (error) throw error;

      let sales = 0;
      let spend = 0;
      const list = promos || [];
      list.forEach((promo: any) => {
        sales += Number(promo.sales || 0);
        spend += Number(promo.spend || 0);
      });

      setData((prev) => ({ ...prev, promos: { sales, spend, list } }));
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user, userRole]);

  return { ...data, loading };
}
