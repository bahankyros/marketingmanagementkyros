import { type ChangeEvent, type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import * as Papa from 'papaparse';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  CircleDashed,
  ReceiptText,
  Star,
  TrendingUp,
  Truck,
  Upload
} from 'lucide-react';
import {
  Bar,
  BarChart,
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
import { subscribeToTable } from '../lib/supabaseData';

type GrabDailySalesRow = {
  id: string;
  date: string;
  country: string;
  city: string;
  merchant: string;
  grabService: string;
  grossSales: number;
  netSales: number;
  transactions: number;
  averageTransactionAmount: number;
  averageRating: number;
};

type GrabDailySalesInsert = {
  date: string;
  country: string;
  city: string;
  merchant: string;
  grab_service: string;
  gross_sales: number;
  net_sales: number;
  transactions: number;
  average_transaction_amount: number;
  average_rating: number;
};

type UploadFeedback = {
  tone: 'success' | 'error';
  message: string;
} | null;

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const CSV_COLUMN_CANDIDATES = {
  date: ['Date', 'Business Date', 'Transaction Date', 'Order Date', 'Sales Date'],
  country: ['Country', 'Market'],
  city: ['City', 'Area', 'Location City'],
  merchant: ['Merchant', 'Merchant Name', 'Store', 'Store Name', 'Outlet', 'Outlet Name'],
  grabService: ['Grab Service', 'Grab Service Type', 'Service', 'Service Type', 'Vertical'],
  grossSales: ['Gross Sales (RM)', 'Gross Sales', 'Gross Sales MYR', 'Gross Sales Amount', 'Total Gross Sales'],
  netSales: ['Net Sales (RM)', 'Net Sales', 'Net Sales MYR', 'Net Sales Amount', 'Total Net Sales'],
  transactions: ['Transactions', 'Transaction Count', 'Orders', 'Order Count', 'Completed Orders'],
  averageTransactionAmount: [
    'Average Transaction Amount',
    'Average Transaction Amount (RM)',
    'Avg Transaction Amount',
    'Average Basket Size',
    'Average Order Value',
    'AOV'
  ],
  averageRating: ['Average Rating', 'Avg Rating', 'Rating', 'Merchant Rating']
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 }).format(value);
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

function parseCleanNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== 'string') return 0;

  const trimmed = value.trim();
  const isNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const parsed = Number(trimmed.replace(/[^\d.-]/g, ''));

  if (!Number.isFinite(parsed)) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

function parseTransactionCount(value: unknown) {
  return Math.max(Math.round(parseCleanNumber(value)), 0);
}

function toIsoDate(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : String(value || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const [, first, second, yearPart] = slashMatch;
    const year = yearPart.length === 2 ? `20${yearPart}` : yearPart;
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    const day = firstNumber > 12 ? first : secondNumber > 12 ? second : first;
    const month = firstNumber > 12 ? second : secondNumber > 12 ? first : second;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return '';

  return parsedDate.toISOString().slice(0, 10);
}

function getDayName(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat('en-MY', { weekday: 'long' }).format(date);
}

function normalizeGrabDailySales(row: any): GrabDailySalesRow {
  return {
    id: typeof row.id === 'string' ? row.id : `${row.date || 'unknown'}-${row.merchant || Math.random()}`,
    date: typeof row.date === 'string' ? row.date : '',
    country: typeof row.country === 'string' ? row.country : '',
    city: typeof row.city === 'string' ? row.city : '',
    merchant: typeof row.merchant === 'string' ? row.merchant : '',
    grabService: typeof row.grab_service === 'string' ? row.grab_service : '',
    grossSales: Number(row.gross_sales || 0),
    netSales: Number(row.net_sales || 0),
    transactions: Number(row.transactions || 0),
    averageTransactionAmount: Number(row.average_transaction_amount || 0),
    averageRating: Number(row.average_rating || 0)
  };
}

function parseGrabDailyCsv(file: File) {
  return new Promise<GrabDailySalesInsert[]>((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = (result.meta.fields || []).filter(Boolean);
        const columnMap = {
          date: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.date),
          country: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.country),
          city: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.city),
          merchant: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.merchant),
          grabService: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.grabService),
          grossSales: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.grossSales),
          netSales: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.netSales),
          transactions: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.transactions),
          averageTransactionAmount: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.averageTransactionAmount),
          averageRating: findCsvColumn(headers, CSV_COLUMN_CANDIDATES.averageRating)
        };
        const missingColumns = Object.entries(columnMap)
          .filter(([, column]) => !column)
          .map(([field]) => field);

        if (missingColumns.length > 0) {
          reject(new Error(`CSV is missing required Grab column(s): ${missingColumns.join(', ')}.`));
          return;
        }

        const parsedRows = result.data
          .map((row) => {
            const date = toIsoDate(row[columnMap.date]);

            return {
              date,
              country: String(row[columnMap.country] || '').trim(),
              city: String(row[columnMap.city] || '').trim(),
              merchant: String(row[columnMap.merchant] || '').trim(),
              grab_service: String(row[columnMap.grabService] || '').trim(),
              gross_sales: parseCleanNumber(row[columnMap.grossSales]),
              net_sales: parseCleanNumber(row[columnMap.netSales]),
              transactions: parseTransactionCount(row[columnMap.transactions]),
              average_transaction_amount: parseCleanNumber(row[columnMap.averageTransactionAmount]),
              average_rating: parseCleanNumber(row[columnMap.averageRating])
            };
          })
          .filter((row) => row.date && row.merchant);

        if (parsedRows.length === 0) {
          reject(new Error('No valid Grab daily sales rows found in the uploaded CSV.'));
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

function buildDailyTrend(rows: GrabDailySalesRow[]) {
  const dailyMap = new Map<string, { date: string; grossSales: number; netSales: number }>();

  rows.forEach((row) => {
    const current = dailyMap.get(row.date) || { date: row.date, grossSales: 0, netSales: 0 };
    current.grossSales += row.grossSales;
    current.netSales += row.netSales;
    dailyMap.set(row.date, current);
  });

  return Array.from(dailyMap.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function buildWeekdayHeatmap(rows: GrabDailySalesRow[]) {
  const dayMap = new Map(DAY_ORDER.map((day) => [day, 0]));

  rows.forEach((row) => {
    const day = getDayName(row.date);
    if (!dayMap.has(day)) return;
    dayMap.set(day, (dayMap.get(day) || 0) + row.transactions);
  });

  return DAY_ORDER.map((day) => ({
    day,
    transactions: dayMap.get(day) || 0
  }));
}

export function DeliveryPromos() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<GrabDailySalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<UploadFeedback>(null);

  const loadDailySales = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('grab_daily_sales')
      .select('*')
      .order('date', { ascending: true });

    if (error) {
      console.error('Error loading Grab daily sales:', error);
      setFeedback({ tone: 'error', message: 'Failed to load Grab daily sales data.' });
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data || []).map(normalizeGrabDailySales));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDailySales();

    const unsubscribe = subscribeToTable('grab-daily-sales-page', 'grab_daily_sales', () => {
      void loadDailySales();
    });

    return () => unsubscribe();
  }, [loadDailySales]);

  const totals = useMemo(() => {
    const grossSales = rows.reduce((sum, row) => sum + row.grossSales, 0);
    const netSales = rows.reduce((sum, row) => sum + row.netSales, 0);
    const transactions = rows.reduce((sum, row) => sum + row.transactions, 0);
    const ratedRows = rows.filter((row) => row.averageRating > 0);
    const averageRating = ratedRows.length > 0
      ? ratedRows.reduce((sum, row) => sum + row.averageRating, 0) / ratedRows.length
      : 0;

    return {
      grossSales,
      netSales,
      transactions,
      averageRating
    };
  }, [rows]);

  const dailyTrend = useMemo(() => buildDailyTrend(rows), [rows]);
  const weekdayHeatmap = useMemo(() => buildWeekdayHeatmap(rows), [rows]);
  const recentRows = useMemo(
    () => [...rows].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 8),
    [rows]
  );

  const handleFiles = async (fileList: FileList | File[]) => {
    const file = fileList[0];
    if (!file) return;

    setUploading(true);
    setFeedback(null);

    try {
      const cleanedRows = await parseGrabDailyCsv(file);
      const { error } = await supabase
        .from('grab_daily_sales')
        .insert(cleanedRows);

      if (error) throw error;

      setFeedback({
        tone: 'success',
        message: `Imported ${cleanedRows.length} Grab daily sales row${cleanedRows.length === 1 ? '' : 's'}.`
      });
      await loadDailySales();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import Grab daily sales CSV.';
      console.error('Error importing Grab daily sales CSV:', error);
      setFeedback({ tone: 'error', message });
    } finally {
      setUploading(false);
      setIsDragging(false);
    }
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    await handleFiles(files);
    event.target.value = '';
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    await handleFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2px] text-orange-700">
            <Truck className="h-3.5 w-3.5" />
            Grab Daily Sales
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Delivery Transaction Dashboard</h1>
          <p className="mt-1 text-neutral-500">
            Import Grab exports and track daily gross sales, net sales, transaction volume, and ratings.
          </p>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-5 text-center transition-colors lg:min-w-80 ${
            isDragging
              ? 'border-orange-400 bg-orange-50 text-orange-700'
              : 'border-neutral-200 bg-white text-neutral-600 hover:border-orange-300 hover:bg-orange-50/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileInputChange}
            className="hidden"
          />
          {uploading ? <CircleDashed className="mb-2 h-6 w-6 animate-spin" /> : <Upload className="mb-2 h-6 w-6" />}
          <span className="text-sm font-bold">{uploading ? 'Uploading Grab CSV...' : 'Upload Grab CSV'}</span>
          <span className="mt-1 text-xs text-neutral-500">Drop file here or click to browse</span>
        </label>
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

      <motion.section
        className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2px] text-neutral-500">Total Gross Sales</p>
              <p className="mt-2 text-3xl font-bold text-neutral-900">{formatCurrency(totals.grossSales)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2px] text-neutral-500">Total Net Sales</p>
              <p className="mt-2 text-3xl font-bold text-neutral-900">{formatCurrency(totals.netSales)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <ReceiptText className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2px] text-neutral-500">Total Transactions</p>
              <p className="mt-2 text-3xl font-bold text-neutral-900">{formatNumber(totals.transactions)}</p>
            </div>
            <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
              <BarChart3 className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2px] text-neutral-500">Average Rating</p>
              <p className="mt-2 text-3xl font-bold text-neutral-900">{totals.averageRating.toFixed(2)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
              <Star className="h-6 w-6" />
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
      >
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Daily Sales Trend
            </h2>
            <p className="mt-1 text-sm text-neutral-500">Gross sales and net sales by transaction date.</p>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600">
            {loading ? 'Loading...' : `${dailyTrend.length} days`}
          </span>
        </div>

        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyTrend} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="date" tick={{ fill: '#737373', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: '#737373', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `RM${Number(value) / 1000}k`}
              />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrency(value), name === 'grossSales' ? 'Gross Sales' : 'Net Sales']}
                labelStyle={{ color: '#171717', fontWeight: 700 }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e5e5e5',
                  boxShadow: '0 10px 30px rgb(15 23 42 / 0.08)'
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="grossSales" name="Gross Sales" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="netSales" name="Net Sales" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      <motion.section
        className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
            <BarChart3 className="h-5 w-5 text-orange-500" />
            Busiest-Day Heatmap
          </h2>
          <p className="mt-1 text-sm text-neutral-500">Transactions grouped by day of week.</p>
        </div>

        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayHeatmap} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="day" tick={{ fill: '#737373', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#737373', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: number) => [formatNumber(value), 'Transactions']}
                labelStyle={{ color: '#171717', fontWeight: 700 }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e5e5e5',
                  boxShadow: '0 10px 30px rgb(15 23 42 / 0.08)'
                }}
              />
              <Bar dataKey="transactions" name="Transactions" fill="#f97316" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      <motion.section
        className="rounded-2xl border border-neutral-100 bg-white shadow-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.15 }}
      >
        <div className="flex flex-col gap-2 border-b border-neutral-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Recent Imported Rows</h2>
            <p className="mt-1 text-sm text-neutral-500">Latest Grab daily sales records from Supabase.</p>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600">
            {rows.length} total rows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50 text-sm text-neutral-500">
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Merchant</th>
                <th className="px-6 py-4 font-semibold">City</th>
                <th className="px-6 py-4 font-semibold">Service</th>
                <th className="px-6 py-4 text-right font-semibold">Gross Sales</th>
                <th className="px-6 py-4 text-right font-semibold">Net Sales</th>
                <th className="px-6 py-4 text-right font-semibold">Transactions</th>
                <th className="px-6 py-4 text-right font-semibold">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-neutral-500">
                    Loading Grab daily sales...
                  </td>
                </tr>
              ) : recentRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-neutral-500">
                    No Grab daily sales rows found. Upload a CSV to begin.
                  </td>
                </tr>
              ) : (
                recentRows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-neutral-50">
                    <td className="px-6 py-4 font-medium text-neutral-900">{row.date}</td>
                    <td className="px-6 py-4 text-neutral-700">{row.merchant}</td>
                    <td className="px-6 py-4 text-neutral-700">{row.city || row.country}</td>
                    <td className="px-6 py-4 text-neutral-700">{row.grabService}</td>
                    <td className="px-6 py-4 text-right font-medium text-neutral-900">{formatCurrency(row.grossSales)}</td>
                    <td className="px-6 py-4 text-right font-medium text-neutral-900">{formatCurrency(row.netSales)}</td>
                    <td className="px-6 py-4 text-right font-medium text-neutral-700">{formatNumber(row.transactions)}</td>
                    <td className="px-6 py-4 text-right font-medium text-neutral-700">{row.averageRating.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.section>
    </div>
  );
}
