import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleDashed,
  DollarSign,
  Filter,
  PieChart,
  TrendingUp,
  Truck
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

type Platform = 'GrabFood' | 'Foodpanda' | 'ShopeeFood';
type PlatformFilter = 'All Platforms' | Platform;
type PromoStatus = 'Planning' | 'Running' | 'Completed' | 'Paused';

type DeliveryPromoRecord = {
  id: string;
  monthKey: string;
  platform: Platform;
  promoName: string;
  spend: number;
  revenue: number;
  status: PromoStatus;
};

type PlatformSummary = {
  platform: Platform;
  spend: number;
  revenue: number;
  roi: number;
};

const PLATFORMS: Platform[] = ['GrabFood', 'Foodpanda', 'ShopeeFood'];
const PLATFORM_FILTERS: PlatformFilter[] = ['All Platforms', ...PLATFORMS];

const platformStyles: Record<Platform, { dot: string; text: string; bg: string; bar: string }> = {
  GrabFood: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    bar: 'bg-emerald-500'
  },
  Foodpanda: {
    dot: 'bg-pink-500',
    text: 'text-pink-700',
    bg: 'bg-pink-50',
    bar: 'bg-pink-500'
  },
  ShopeeFood: {
    dot: 'bg-orange-500',
    text: 'text-orange-700',
    bg: 'bg-orange-50',
    bar: 'bg-orange-500'
  }
};

const MOCK_PROMOS: DeliveryPromoRecord[] = [
  { id: 'nov-grab-1', monthKey: '2025-11', platform: 'GrabFood', promoName: '11.11 Combo Push', spend: 4200, revenue: 23800, status: 'Completed' },
  { id: 'nov-foodpanda-1', monthKey: '2025-11', platform: 'Foodpanda', promoName: 'Weekend Value Meals', spend: 3600, revenue: 19600, status: 'Completed' },
  { id: 'nov-shopee-1', monthKey: '2025-11', platform: 'ShopeeFood', promoName: 'New User Delivery Deal', spend: 2900, revenue: 14200, status: 'Completed' },
  { id: 'dec-grab-1', monthKey: '2025-12', platform: 'GrabFood', promoName: 'Year End Feast', spend: 5300, revenue: 30100, status: 'Completed' },
  { id: 'dec-foodpanda-1', monthKey: '2025-12', platform: 'Foodpanda', promoName: 'Holiday Lunch Boost', spend: 4100, revenue: 22100, status: 'Completed' },
  { id: 'dec-shopee-1', monthKey: '2025-12', platform: 'ShopeeFood', promoName: 'Free Delivery Stack', spend: 3400, revenue: 18100, status: 'Completed' },
  { id: 'jan-grab-1', monthKey: '2026-01', platform: 'GrabFood', promoName: 'New Year Meal Sets', spend: 4700, revenue: 26400, status: 'Completed' },
  { id: 'jan-foodpanda-1', monthKey: '2026-01', platform: 'Foodpanda', promoName: 'Weekday Office Lunch', spend: 3900, revenue: 21300, status: 'Completed' },
  { id: 'jan-shopee-1', monthKey: '2026-01', platform: 'ShopeeFood', promoName: 'Shopee Coins Bundle', spend: 3200, revenue: 15900, status: 'Completed' },
  { id: 'feb-grab-1', monthKey: '2026-02', platform: 'GrabFood', promoName: 'Family Sharing Deals', spend: 4900, revenue: 28700, status: 'Completed' },
  { id: 'feb-foodpanda-1', monthKey: '2026-02', platform: 'Foodpanda', promoName: 'Payday Voucher Burst', spend: 4400, revenue: 24900, status: 'Completed' },
  { id: 'feb-shopee-1', monthKey: '2026-02', platform: 'ShopeeFood', promoName: 'Snack Hour Push', spend: 3000, revenue: 15400, status: 'Completed' },
  { id: 'mar-grab-1', monthKey: '2026-03', platform: 'GrabFood', promoName: 'Ramadan Dinner Slots', spend: 6100, revenue: 37400, status: 'Completed' },
  { id: 'mar-foodpanda-1', monthKey: '2026-03', platform: 'Foodpanda', promoName: 'Iftar Bundle Promo', spend: 5600, revenue: 31900, status: 'Completed' },
  { id: 'mar-shopee-1', monthKey: '2026-03', platform: 'ShopeeFood', promoName: 'Sahur Saver', spend: 3700, revenue: 20100, status: 'Completed' },
  { id: 'apr-grab-1', monthKey: '2026-04', platform: 'GrabFood', promoName: 'Raya Combo Sets', spend: 6800, revenue: 42100, status: 'Running' },
  { id: 'apr-grab-2', monthKey: '2026-04', platform: 'GrabFood', promoName: 'Lunch Hour Top-Up', spend: 2400, revenue: 13200, status: 'Running' },
  { id: 'apr-foodpanda-1', monthKey: '2026-04', platform: 'Foodpanda', promoName: 'Panda Picks Bundle', spend: 5200, revenue: 29700, status: 'Running' },
  { id: 'apr-foodpanda-2', monthKey: '2026-04', platform: 'Foodpanda', promoName: 'Outlet Hero Voucher', spend: 1700, revenue: 8400, status: 'Planning' },
  { id: 'apr-shopee-1', monthKey: '2026-04', platform: 'ShopeeFood', promoName: 'ShopeeFood Mega Day', spend: 4100, revenue: 22600, status: 'Running' },
  { id: 'apr-shopee-2', monthKey: '2026-04', platform: 'ShopeeFood', promoName: 'Weekend Flash Delivery', spend: 1500, revenue: 6100, status: 'Paused' }
];

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-MY', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0
  }).format(value);
}

function calculateRoi(revenue: number, spend: number) {
  return spend > 0 ? ((revenue - spend) / spend) * 100 : 0;
}

function getSixMonthKeys(selectedMonth: string) {
  const [year, month] = selectedMonth.split('-').map(Number);
  const cursor = new Date(year, month - 1, 1);

  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - (5 - index), 1);
    const normalizedMonth = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${normalizedMonth}`;
  });
}

function getStatusTone(status: PromoStatus) {
  switch (status) {
    case 'Running':
      return 'bg-emerald-100 text-emerald-700';
    case 'Completed':
      return 'bg-neutral-100 text-neutral-700';
    case 'Paused':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-amber-100 text-amber-700';
  }
}

function summarizeByPlatform(records: DeliveryPromoRecord[]): PlatformSummary[] {
  return PLATFORMS.map((platform) => {
    const platformRecords = records.filter((record) => record.platform === platform);
    const spend = platformRecords.reduce((sum, record) => sum + record.spend, 0);
    const revenue = platformRecords.reduce((sum, record) => sum + record.revenue, 0);

    return {
      platform,
      spend,
      revenue,
      roi: calculateRoi(revenue, spend)
    };
  });
}

function PlatformBreakdown({
  summaries,
  metric
}: {
  summaries: PlatformSummary[];
  metric: 'revenue' | 'spend' | 'roi';
}) {
  const maxValue = Math.max(...summaries.map((summary) => Math.max(summary[metric], 0)), 1);

  return (
    <div className="mt-5 space-y-3">
      {summaries.map((summary) => {
        const style = platformStyles[summary.platform];
        const value = summary[metric];
        const width = metric === 'roi'
          ? Math.min(Math.max(value, 0), 700) / 7
          : (value / maxValue) * 100;
        const formattedValue = metric === 'roi' ? `${value.toFixed(0)}%` : formatCurrency(value);

        return (
          <div key={summary.platform}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-neutral-500">
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                {summary.platform}
              </span>
              <span>{formattedValue}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.min(width, 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DeliveryPromos() {
  const monthOptions = useMemo(
    () => Array.from(new Set(MOCK_PROMOS.map((promo) => promo.monthKey))).sort(),
    []
  );
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[monthOptions.length - 1]);
  const [activePlatform, setActivePlatform] = useState<PlatformFilter>('All Platforms');

  const selectedMonthPromos = useMemo(
    () => MOCK_PROMOS.filter((promo) => promo.monthKey === selectedMonth),
    [selectedMonth]
  );

  const visiblePromos = useMemo(
    () => selectedMonthPromos.filter((promo) => activePlatform === 'All Platforms' || promo.platform === activePlatform),
    [activePlatform, selectedMonthPromos]
  );

  const platformSummaries = useMemo(
    () => summarizeByPlatform(selectedMonthPromos),
    [selectedMonthPromos]
  );

  const totals = useMemo(() => {
    const spend = selectedMonthPromos.reduce((sum, promo) => sum + promo.spend, 0);
    const revenue = selectedMonthPromos.reduce((sum, promo) => sum + promo.revenue, 0);

    return {
      spend,
      revenue,
      roi: calculateRoi(revenue, spend)
    };
  }, [selectedMonthPromos]);

  const chartData = useMemo(() => {
    return getSixMonthKeys(selectedMonth).map((monthKey) => {
      const monthRecords = MOCK_PROMOS.filter((promo) => {
        return promo.monthKey === monthKey && (activePlatform === 'All Platforms' || promo.platform === activePlatform);
      });
      const spend = monthRecords.reduce((sum, promo) => sum + promo.spend, 0);
      const revenue = monthRecords.reduce((sum, promo) => sum + promo.revenue, 0);

      return {
        month: formatMonthLabel(monthKey),
        spend,
        revenue
      };
    });
  }, [activePlatform, selectedMonth]);

  const filteredTotals = useMemo(() => {
    const spend = visiblePromos.reduce((sum, promo) => sum + promo.spend, 0);
    const revenue = visiblePromos.reduce((sum, promo) => sum + promo.revenue, 0);

    return {
      spend,
      revenue,
      roi: calculateRoi(revenue, spend)
    };
  }, [visiblePromos]);

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2px] text-orange-700">
            <Truck className="h-3.5 w-3.5" />
            Delivery Platform Marketing
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Delivery Marketing Dashboard</h1>
          <p className="mt-1 text-neutral-500">
            Mock performance view for GrabFood, Foodpanda, and ShopeeFood before Supabase wiring.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label htmlFor="delivery-month" className="flex items-center gap-2 text-sm font-semibold text-neutral-600">
            <Calendar className="h-4 w-4 text-orange-500" />
            Month
          </label>
          <select
            id="delivery-month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="min-w-48 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 outline-none transition-colors focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          >
            {monthOptions.map((monthKey) => (
              <option key={monthKey} value={monthKey}>
                {formatMonthLabel(monthKey)}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="flex flex-wrap gap-2">
        {PLATFORM_FILTERS.map((platform) => (
          <button
            key={platform}
            type="button"
            onClick={() => setActivePlatform(platform)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              activePlatform === platform
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
            }`}
          >
            {platform === 'All Platforms' ? (
              <Filter className="h-4 w-4" />
            ) : (
              <span className={`h-2.5 w-2.5 rounded-full ${platformStyles[platform].dot}`} />
            )}
            {platform}
          </button>
        ))}
      </section>

      <motion.section
        className="grid grid-cols-1 gap-5 xl:grid-cols-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2px] text-neutral-500">Total Revenue</p>
              <p className="mt-2 text-3xl font-bold text-neutral-900">{formatCurrency(totals.revenue)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
          <PlatformBreakdown summaries={platformSummaries} metric="revenue" />
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2px] text-neutral-500">Total Spend</p>
              <p className="mt-2 text-3xl font-bold text-neutral-900">{formatCurrency(totals.spend)}</p>
            </div>
            <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
              <DollarSign className="h-6 w-6" />
            </div>
          </div>
          <PlatformBreakdown summaries={platformSummaries} metric="spend" />
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2px] text-neutral-500">Average ROI</p>
              <p className={`mt-2 text-3xl font-bold ${totals.roi >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totals.roi.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <PieChart className="h-6 w-6" />
            </div>
          </div>
          <PlatformBreakdown summaries={platformSummaries} metric="roi" />
        </div>
      </motion.section>

      <motion.section
        className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.4fr)]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
      >
        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
                <BarChart3 className="h-5 w-5 text-orange-500" />
                Sales vs Spend
              </h2>
              <p className="mt-1 text-sm text-neutral-500">Six-month trend ending {formatMonthLabel(selectedMonth)}.</p>
            </div>
            <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-600">
              {activePlatform}
            </div>
          </div>

          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="month" tick={{ fill: '#737373', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#737373', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `RM${Number(value) / 1000}k`}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Revenue' : 'Spend']}
                  labelStyle={{ color: '#171717', fontWeight: 700 }}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e5e5e5',
                    boxShadow: '0 10px 30px rgb(15 23 42 / 0.08)'
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="spend"
                  name="Spend"
                  stroke="#f97316"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-neutral-900 p-6 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-3 text-orange-300">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2px] text-neutral-300">Selected View</p>
              <h3 className="text-xl font-bold">{activePlatform}</h3>
            </div>
          </div>

          <div className="mt-8 space-y-5">
            <div>
              <p className="text-sm text-neutral-400">Revenue</p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(filteredTotals.revenue)}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-400">Spend</p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(filteredTotals.spend)}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-400">ROI</p>
              <p className={`mt-1 text-2xl font-bold ${filteredTotals.roi >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {filteredTotals.roi.toFixed(0)}%
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="rounded-2xl border border-neutral-100 bg-white shadow-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        <div className="flex flex-col gap-2 border-b border-neutral-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Active Promo Table</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {formatMonthLabel(selectedMonth)} campaign log filtered by {activePlatform.toLowerCase()}.
            </p>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600">
            {visiblePromos.length} campaigns
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-sm text-neutral-500">
                <th className="px-6 py-4 font-semibold">Platform</th>
                <th className="px-6 py-4 font-semibold">Promo Name</th>
                <th className="px-6 py-4 text-right font-semibold">Spend (RM)</th>
                <th className="px-6 py-4 text-right font-semibold">Revenue (RM)</th>
                <th className="px-6 py-4 text-right font-semibold">ROI (%)</th>
                <th className="px-6 py-4 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visiblePromos.map((promo) => {
                const roi = calculateRoi(promo.revenue, promo.spend);
                const style = platformStyles[promo.platform];

                return (
                  <tr key={promo.id} className="transition-colors hover:bg-neutral-50">
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${style.bg} ${style.text}`}>
                        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                        {promo.platform}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-neutral-900">{promo.promoName}</p>
                      <p className="mt-1 text-xs text-neutral-500">{formatMonthLabel(promo.monthKey)}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-neutral-700">{formatCurrency(promo.spend)}</td>
                    <td className="px-6 py-4 text-right font-medium text-neutral-900">{formatCurrency(promo.revenue)}</td>
                    <td className={`px-6 py-4 text-right font-bold ${roi >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {roi.toFixed(0)}%
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${getStatusTone(promo.status)}`}>
                        {promo.status === 'Running' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
                        {promo.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.section>
    </div>
  );
}
