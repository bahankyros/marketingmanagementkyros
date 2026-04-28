import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import * as Papa from 'papaparse';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleDashed,
  DollarSign,
  Filter,
  PieChart,
  TrendingUp,
  Truck,
  Upload
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
import { supabase } from '../lib/supabase';
import { nowIso, subscribeToTable } from '../lib/supabaseData';

type Platform = 'GrabFood' | 'Foodpanda' | 'ShopeeFood';
type PlatformFilter = 'All Platforms' | Platform;
type PromoStatus = 'Planning' | 'Running' | 'Completed' | 'Paused';

type DeliveryCampaignRecord = {
  id: string;
  monthYear: string;
  platform: Platform;
  campaignName: string;
  spend: number;
  revenue: number;
  status: PromoStatus;
};

type ParsedGrabCampaign = {
  campaignName: string;
  spend: number;
  sales: number;
};

type PlatformSummary = {
  platform: Platform;
  spend: number;
  revenue: number;
  roi: number;
};

type UploadFeedback = {
  tone: 'success' | 'error';
  message: string;
} | null;

const PLATFORMS: Platform[] = ['GrabFood', 'Foodpanda', 'ShopeeFood'];
const PLATFORM_FILTERS: PlatformFilter[] = ['All Platforms', ...PLATFORMS];

const CSV_COLUMN_CANDIDATES = {
  campaignName: [
    'Campaign Name',
    'Campaign',
    'Campaign Title',
    'Promo Name',
    'Promotion Name',
    'Ad Name',
    'Name'
  ],
  spend: [
    'Spend',
    'Ad Spend',
    'Amount Spent',
    'Cost',
    'Spend (RM)',
    'Marketing Spend'
  ],
  sales: [
    'Sales',
    'Revenue',
    'Sales Generated',
    'Gross Sales',
    'Sales Value',
    'Order Revenue',
    'Conversion Value'
  ]
};

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

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthOptions(count: number) {
  const now = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

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
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

function normalizePlatform(value: unknown): Platform {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (normalized === 'foodpanda') return 'Foodpanda';
  if (normalized === 'shopeefood' || normalized === 'shopee food') return 'ShopeeFood';
  return 'GrabFood';
}

function normalizeStatus(value: unknown): PromoStatus {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (normalized === 'planning') return 'Planning';
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'ended') return 'Completed';
  if (normalized === 'paused') return 'Paused';
  return 'Running';
}

function normalizeCampaign(row: any): DeliveryCampaignRecord {
  return {
    id: typeof row.id === 'string' ? row.id : `${row.month_year || 'unknown'}-${row.campaign_name || Math.random()}`,
    monthYear: typeof row.month_year === 'string' ? row.month_year : '',
    platform: normalizePlatform(row.platform),
    campaignName: typeof row.campaign_name === 'string' ? row.campaign_name : '',
    spend: Number(row.spend || 0),
    revenue: Number(row.sales ?? row.revenue ?? 0),
    status: normalizeStatus(row.status)
  };
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findCsvColumn(headers: string[], candidates: string[]) {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header)
  }));

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeHeader(candidate);
    const exactMatch = normalizedHeaders.find((header) => header.normalized === normalizedCandidate);
    if (exactMatch) return exactMatch.original;
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeHeader(candidate);
    const looseMatch = normalizedHeaders.find((header) => header.normalized.includes(normalizedCandidate));
    if (looseMatch) return looseMatch.original;
  }

  return '';
}

function parseMoney(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(value, 0) : 0;
  }

  if (typeof value !== 'string') return 0;

  const trimmed = value.trim();
  const isNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const parsed = Number(trimmed.replace(/[^\d.-]/g, ''));

  if (!Number.isFinite(parsed)) return 0;
  return Math.max(isNegative ? -parsed : parsed, 0);
}

function parseGrabCsv(file: File) {
  return new Promise<ParsedGrabCampaign[]>((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = (result.meta.fields || []).filter(Boolean);
        const campaignNameColumn = findCsvColumn(headers, CSV_COLUMN_CANDIDATES.campaignName);
        const spendColumn = findCsvColumn(headers, CSV_COLUMN_CANDIDATES.spend);
        const salesColumn = findCsvColumn(headers, CSV_COLUMN_CANDIDATES.sales);

        if (!campaignNameColumn || !spendColumn || !salesColumn) {
          reject(new Error('CSV must include Campaign Name, Spend, and Sales or Revenue columns.'));
          return;
        }

        const parsedRows = result.data
          .map((row) => ({
            campaignName: String(row[campaignNameColumn] || '').trim(),
            spend: parseMoney(row[spendColumn]),
            sales: parseMoney(row[salesColumn])
          }))
          .filter((row) => row.campaignName);

        if (parsedRows.length === 0) {
          reject(new Error('No campaign rows found in the uploaded CSV.'));
          return;
        }

        resolve(parsedRows);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

function summarizeByPlatform(records: DeliveryCampaignRecord[]): PlatformSummary[] {
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const monthOptions = useMemo(() => buildMonthOptions(12), []);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey);
  const [activePlatform, setActivePlatform] = useState<PlatformFilter>('All Platforms');
  const [campaigns, setCampaigns] = useState<DeliveryCampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<UploadFeedback>(null);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    const monthKeys = getSixMonthKeys(selectedMonth);
    const { data, error } = await supabase
      .from('delivery_campaigns')
      .select('*')
      .in('month_year', monthKeys)
      .order('month_year', { ascending: true });

    if (error) {
      console.error('Error loading delivery campaigns:', error);
      setFeedback({ tone: 'error', message: 'Failed to load delivery campaign data.' });
      setCampaigns([]);
      setLoading(false);
      return;
    }

    setCampaigns((data || []).map(normalizeCampaign));
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    void loadCampaigns();

    const unsubscribe = subscribeToTable('delivery-campaigns-page', 'delivery_campaigns', () => {
      void loadCampaigns();
    });

    return () => unsubscribe();
  }, [loadCampaigns]);

  const selectedMonthCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.monthYear === selectedMonth),
    [campaigns, selectedMonth]
  );

  const visibleCampaigns = useMemo(
    () => selectedMonthCampaigns.filter((campaign) => activePlatform === 'All Platforms' || campaign.platform === activePlatform),
    [activePlatform, selectedMonthCampaigns]
  );

  const platformSummaries = useMemo(
    () => summarizeByPlatform(selectedMonthCampaigns),
    [selectedMonthCampaigns]
  );

  const totals = useMemo(() => {
    const spend = selectedMonthCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
    const revenue = selectedMonthCampaigns.reduce((sum, campaign) => sum + campaign.revenue, 0);

    return {
      spend,
      revenue,
      roi: calculateRoi(revenue, spend)
    };
  }, [selectedMonthCampaigns]);

  const chartData = useMemo(() => {
    return getSixMonthKeys(selectedMonth).map((monthKey) => {
      const monthRecords = campaigns.filter((campaign) => {
        return campaign.monthYear === monthKey && (activePlatform === 'All Platforms' || campaign.platform === activePlatform);
      });
      const spend = monthRecords.reduce((sum, campaign) => sum + campaign.spend, 0);
      const revenue = monthRecords.reduce((sum, campaign) => sum + campaign.revenue, 0);

      return {
        month: formatMonthLabel(monthKey),
        spend,
        revenue
      };
    });
  }, [activePlatform, campaigns, selectedMonth]);

  const filteredTotals = useMemo(() => {
    const spend = visibleCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
    const revenue = visibleCampaigns.reduce((sum, campaign) => sum + campaign.revenue, 0);

    return {
      spend,
      revenue,
      roi: calculateRoi(revenue, spend)
    };
  }, [visibleCampaigns]);

  const handleCsvUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setFeedback(null);

    try {
      const parsedRows = await parseGrabCsv(file);
      const timestamp = nowIso();
      const payload = parsedRows.map((row) => ({
        platform: 'GrabFood',
        campaign_name: row.campaignName,
        spend: row.spend,
        sales: row.sales,
        month_year: selectedMonth,
        status: 'Running',
        created_at: timestamp,
        updated_at: timestamp
      }));

      const { error } = await supabase
        .from('delivery_campaigns')
        .insert(payload);

      if (error) throw error;

      setFeedback({
        tone: 'success',
        message: `Imported ${payload.length} GrabFood campaign${payload.length === 1 ? '' : 's'} for ${formatMonthLabel(selectedMonth)}.`
      });
      await loadCampaigns();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import Grab CSV.';
      console.error('Error importing Grab delivery CSV:', error);
      setFeedback({ tone: 'error', message });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

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
            Live campaign performance for GrabFood, Foodpanda, and ShopeeFood.
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? <CircleDashed className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading...' : 'Upload Grab Data (CSV)'}
          </button>
        </div>
      </header>

      {feedback && (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${
          feedback.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}>
          {feedback.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
          <span>{feedback.message}</span>
        </div>
      )}

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
            {visibleCampaigns.length} campaigns
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
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                    Loading delivery campaigns...
                  </td>
                </tr>
              ) : visibleCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                    No delivery campaigns found for this filter.
                  </td>
                </tr>
              ) : (
                visibleCampaigns.map((campaign) => {
                  const roi = calculateRoi(campaign.revenue, campaign.spend);
                  const style = platformStyles[campaign.platform];

                  return (
                    <tr key={campaign.id} className="transition-colors hover:bg-neutral-50">
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${style.bg} ${style.text}`}>
                          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                          {campaign.platform}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-neutral-900">{campaign.campaignName}</p>
                        <p className="mt-1 text-xs text-neutral-500">{formatMonthLabel(campaign.monthYear)}</p>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-neutral-700">{formatCurrency(campaign.spend)}</td>
                      <td className="px-6 py-4 text-right font-medium text-neutral-900">{formatCurrency(campaign.revenue)}</td>
                      <td className={`px-6 py-4 text-right font-bold ${roi >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {roi.toFixed(0)}%
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${getStatusTone(campaign.status)}`}>
                          {campaign.status === 'Running' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
                          {campaign.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.section>
    </div>
  );
}
