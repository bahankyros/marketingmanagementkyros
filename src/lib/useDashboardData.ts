import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from './firebase';
import type { AuthUser } from './AuthContext';

type UserRole = 'admin' | 'supervisor' | 'finance';

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
  const isSupervisor = userRole === 'supervisor';
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
      subscribe: (settle: () => void) => () => void
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

      unsubscribers.push(subscribe(settle));
    };

    registerStream(access.settings, (settle) =>
      onSnapshot(doc(db, 'settings', 'globals'), (snap) => {
        if (snap.exists()) {
          setData((prev) => ({ ...prev, settings: snap.data() as any }));
        }
        settle();
      }, (error) => {
        console.error('Settings snapshot error:', error);
        settle();
      })
    );

    registerStream(access.outlets, (settle) =>
      onSnapshot(collection(db, 'outlets'), (snap) => {
        const list = snap.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
        setData((prev) => ({ ...prev, outlets: list }));
        settle();
      }, (error) => {
        console.error('Outlets snapshot error:', error);
        settle();
      })
    );

    registerStream(access.campaigns, (settle) =>
      onSnapshot(collection(db, 'campaigns'), (snap) => {
        let activeCount = 0;
        let budgetUsed = 0;
        const list: any[] = [];
        snap.forEach((itemDoc) => {
          const campaign = { id: itemDoc.id, ...itemDoc.data() } as any;
          list.push(campaign);
          if (campaign.status === 'Active') activeCount++;
          if (campaign.budget) budgetUsed += Number(campaign.budget);
        });
        setData((prev) => ({ ...prev, campaigns: { list, activeCount, budgetUsed } }));
        settle();
      }, (error) => {
        console.error('Campaigns snapshot error:', error);
        settle();
      })
    );

    registerStream(access.partnerships, (settle) =>
      onSnapshot(collection(db, 'partnerships'), (snap) => {
        let activeCount = 0;
        let distributed = 0;
        let redeemed = 0;
        snap.forEach((itemDoc) => {
          const partnership = itemDoc.data();
          if (partnership.partnershipStage === 'Active' || partnership.stage === 'Active') activeCount++;
          distributed += Number(partnership.vouchersAllocated || 0);
          redeemed += Number(partnership.vouchersRedeemed || 0);
        });
        setData((prev) => ({ ...prev, partnerships: { activeCount, distributed, redeemed } }));
        settle();
      }, (error) => {
        console.error('Partnerships snapshot error:', error);
        settle();
      })
    );

    registerStream(access.events, (settle) =>
      onSnapshot(collection(db, 'events'), (snap) => {
        let joined = 0;
        let awaiting = 0;
        let sales = 0;
        const mapped: any[] = [];
        snap.forEach((itemDoc) => {
          const event = itemDoc.data();
          if (event.decisionStatus === 'Approved' || event.decisionStatus === 'Completed') joined++;
          if (event.decisionStatus === 'Reviewing') awaiting++;
          sales += Number(event.salesGenerated || 0);
          mapped.push({ outlet: event.outlet, status: event.decisionStatus, sales: Number(event.salesGenerated || 0) });
        });
        setData((prev) => ({ ...prev, events: { joined, awaiting, sales, mapped } }));
        settle();
      }, (error) => {
        console.error('Events snapshot error:', error);
        settle();
      })
    );

    registerStream(access.mallDisplays, (settle) =>
      onSnapshot(collection(db, 'mall_displays'), (snap) => {
        let activeCount = 0;
        let pending = 0;
        const mapped: any[] = [];
        snap.forEach((itemDoc) => {
          const display = itemDoc.data();
          if (display.approvalStatus === 'Approved' || display.currentStatus === 'Installed' || display.status === 'Approved' || display.designStatus === 'Approved') activeCount++;
          if (display.approvalStatus === 'Pending' || display.approvalStatus === 'Pending approval') pending++;
          mapped.push({ outlet: display.outlet, pending: display.approvalStatus === 'Pending' || display.approvalStatus === 'Pending approval' });
        });
        setData((prev) => ({ ...prev, mallDisplays: { activeCount, pending, mapped } }));
        settle();
      }, (error) => {
        console.error('Mall displays snapshot error:', error);
        settle();
      })
    );

    registerStream(access.social, (settle) =>
      onSnapshot(collection(db, 'social_posts'), (snap) => {
        let published = 0;
        snap.forEach((itemDoc) => {
          const post = itemDoc.data();
          if (post.productionStatus === 'Published' || post.status === 'Published') published++;
        });
        setData((prev) => ({ ...prev, social: { published } }));
        settle();
      }, (error) => {
        console.error('Social posts snapshot error:', error);
        settle();
      })
    );

    registerStream(access.paidAds, (settle) =>
      onSnapshot(collection(db, 'paid_ads'), (snap) => {
        let spend = 0;
        const list: any[] = [];
        snap.forEach((itemDoc) => {
          const ad = itemDoc.data();
          spend += Number(ad.spend || 0);
          list.push(ad);
        });
        setData((prev) => ({ ...prev, paidAds: { spend, list } }));
        settle();
      }, (error) => {
        console.error('Paid ads snapshot error:', error);
        settle();
      })
    );

    registerStream(access.adHoc, (settle) =>
      onSnapshot(collection(db, 'ad_hoc_tasks'), (snap) => {
        let overdue = 0;
        let designs = 0;
        let emergencies = 0;
        const list: any[] = [];
        const today = new Date().toISOString().split('T')[0];

        snap.forEach((itemDoc) => {
          const task = { id: itemDoc.id, ...itemDoc.data() } as any;
          list.push(task);
          const isOverdue = task.status !== 'Solved' && task.dueDate && task.dueDate < today;
          if (task.status === 'Overdue' || isOverdue) overdue++;
          if (task.status !== 'Solved' && (task.category === 'Design Needs' || task.category === 'Missing Assets')) designs++;
          if (task.status !== 'Solved' && (task.priority === 'Emergency' || task.category === 'Emergency Issues')) emergencies++;
        });

        setData((prev) => ({ ...prev, adHoc: { list, overdue, designs, emergencies } }));
        settle();
      }, (error) => {
        console.error('Ad hoc tasks snapshot error:', error);
        settle();
      })
    );

    registerStream(access.mascots, (settle) =>
      onSnapshot(collection(db, 'mascot_schedule'), (snap) => {
        let appearances = 0;
        snap.forEach((itemDoc) => {
          const scheduleItem = itemDoc.data();
          if (scheduleItem.status === 'Completed' || scheduleItem.status === 'Approved') appearances++;
        });
        setData((prev) => ({ ...prev, mascots: { appearances } }));
        settle();
      }, (error) => {
        console.error('Mascot schedule snapshot error:', error);
        settle();
      })
    );

    registerStream(access.blogs, (settle) =>
      onSnapshot(collection(db, 'blog_outreach'), (snap) => {
        let published = 0;
        snap.forEach((itemDoc) => {
          if (itemDoc.data().outreachStatus === 'Published') published++;
        });
        setData((prev) => ({ ...prev, blogs: { published } }));
        settle();
      }, (error) => {
        console.error('Blog outreach snapshot error:', error);
        settle();
      })
    );

    registerStream(access.promos, (settle) =>
      onSnapshot(collection(db, 'delivery_promos'), (snap) => {
        let sales = 0;
        let spend = 0;
        const list: any[] = [];
        snap.forEach((itemDoc) => {
          const promo = itemDoc.data();
          sales += Number(promo.salesGenerated || 0);
          spend += Number(promo.spend || 0);
          list.push(promo);
        });
        setData((prev) => ({ ...prev, promos: { sales, spend, list } }));
        settle();
      }, (error) => {
        console.error('Delivery promos snapshot error:', error);
        settle();
      })
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user, userRole]);

  return { ...data, loading };
}
