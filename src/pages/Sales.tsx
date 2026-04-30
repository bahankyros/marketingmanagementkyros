import React, { useEffect, useState } from 'react';
import { Calendar, Download, DollarSign, Save, Upload } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { subscribeToTable, toNullableUuid } from '../lib/supabaseData';

const SALES_IMPORT_HEADERS = [
  'month_key',
  'outlet_id',
  'outlet_name',
  'total_sales',
  'grab_gross_order_value',
  'grab_commission_fees',
  'grab_ad_spend',
  'foodpanda_gross_order_value',
  'foodpanda_commission_fees',
  'foodpanda_ad_spend'
] as const;

type SalesImportFeedback = {
  tone: 'success' | 'error';
  message: string;
};

type SalesImportPreview = {
  fileName: string;
  rowCount: number;
  monthKeys: string[];
};

type ParsedSalesImportRow = {
  month_key: string;
  outlet_id: string;
  outlet_name: string;
  total_sales: number;
  grab_gross_order_value: number;
  grab_commission_fees: number;
  grab_ad_spend: number;
  foodpanda_gross_order_value: number;
  foodpanda_commission_fees: number;
  foodpanda_ad_spend: number;
};

type BudgetHistoryRecord = {
  id: string;
  month_key: string;
  sales_rollup_total: number;
  marketing_budget_total: number;
  budget_rate: number;
  locked: boolean;
};

type OutletOption = {
  id: string;
  name: string;
};

const budgetCurrencyFormatter = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeSalesMonthKey = (value: string, rowNumber: number) => {
  const normalizedMonthKey = value.trim();
  if (!/^\d{4}-\d{2}$/.test(normalizedMonthKey)) {
    throw new Error(`Invalid month_key on row ${rowNumber}. Expected YYYY-MM.`);
  }

  return normalizedMonthKey;
};

const normalizeSalesNumber = (value: string, fieldName: string, rowNumber: number) => {
  const normalizedValue = value.replace(/,/g, '').trim();
  if (!normalizedValue) {
    throw new Error(`Missing ${fieldName} on row ${rowNumber}.`);
  }

  const parsedValue = Number(normalizedValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`Invalid ${fieldName} on row ${rowNumber}.`);
  }

  return roundCurrency(parsedValue);
};

const parseSalesCsvRow = (rawRow: string) => {
  const parsedCells: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < rawRow.length; index += 1) {
    const currentChar = rawRow[index];
    const nextChar = rawRow[index + 1];

    if (currentChar === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (currentChar === ',' && !inQuotes) {
      parsedCells.push(currentCell.trim());
      currentCell = '';
    } else {
      currentCell += currentChar;
    }
  }

  parsedCells.push(currentCell.trim());
  return parsedCells;
};

export function Sales() {
  const { user, userData } = useAuth();
  const canManageSales = userData?.role === 'admin';

  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [salesImportFeedback, setSalesImportFeedback] = useState<SalesImportFeedback | null>(null);
  const [salesImportPreview, setSalesImportPreview] = useState<SalesImportPreview | null>(null);
  const [parsedSalesImportRows, setParsedSalesImportRows] = useState<ParsedSalesImportRow[]>([]);
  const [isValidatingSalesImport, setIsValidatingSalesImport] = useState(false);
  const [isImportingSales, setIsImportingSales] = useState(false);
  const [budgetHistory, setBudgetHistory] = useState<BudgetHistoryRecord[]>([]);
  const [loadingBudgetHistory, setLoadingBudgetHistory] = useState(true);

  useEffect(() => {
    if (!user || !canManageSales) {
      setOutlets([]);
      return;
    }

    const fetchOutlets = async () => {
      const { data, error } = await supabase
        .from('outlets')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching outlets for sales import:', error);
        setSalesImportFeedback({
          tone: 'error',
          message: 'Failed to load outlets.'
        });
        return;
      }

      const nextOutlets = (data || [])
        .map((outlet) => {
          const outletName = typeof outlet.name === 'string' ? outlet.name.trim() : '';
          if (!outletName) {
            return null;
          }

          return {
            id: outlet.id,
            name: outletName
          } satisfies OutletOption;
        })
        .filter((outlet): outlet is OutletOption => outlet !== null);

      setOutlets(nextOutlets);
    };

    void fetchOutlets();
    const unsubscribe = subscribeToTable('sales-outlets', 'outlets', () => {
      void fetchOutlets();
    });

    return () => unsubscribe();
  }, [user, canManageSales]);

  useEffect(() => {
    if (!user || !canManageSales) {
      setBudgetHistory([]);
      setLoadingBudgetHistory(false);
      return;
    }

    setLoadingBudgetHistory(true);
    const fetchBudgetHistory = async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('id, month_key, sales_rollup_total, marketing_budget_total, budget_rate, locked')
        .order('month_key', { ascending: false })
        .limit(12);

      if (error) {
        console.error('Error fetching budget history:', error);
        setSalesImportFeedback({
          tone: 'error',
          message: 'Failed to load history.'
        });
        setLoadingBudgetHistory(false);
        return;
      }

      const normalizedBudgetHistory = (data || [])
        .map((budgetData) => {
          return {
            id: budgetData.id,
            month_key: typeof budgetData.month_key === 'string' ? budgetData.month_key : budgetData.id,
            sales_rollup_total: typeof budgetData.sales_rollup_total === 'number' ? budgetData.sales_rollup_total : 0,
            marketing_budget_total: typeof budgetData.marketing_budget_total === 'number' ? budgetData.marketing_budget_total : 0,
            budget_rate: typeof budgetData.budget_rate === 'number' ? budgetData.budget_rate : 0.02,
            locked: budgetData.locked === true
          } satisfies BudgetHistoryRecord;
        })
        .sort((left, right) => right.month_key.localeCompare(left.month_key));

      setBudgetHistory(normalizedBudgetHistory);
      setLoadingBudgetHistory(false);
    };

    void fetchBudgetHistory();
    const unsubscribe = subscribeToTable('sales-budgets', 'budgets', () => {
      void fetchBudgetHistory();
    });

    return () => unsubscribe();
  }, [user, canManageSales]);

  const handleDownloadSalesTemplate = () => {
    const csvContent = `${SALES_IMPORT_HEADERS.join(',')}\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'sales-import-template.csv';
    link.click();

    URL.revokeObjectURL(url);
  };

  const handleSalesImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !canManageSales) return;

    setIsValidatingSalesImport(true);
    setSalesImportFeedback(null);
    setSalesImportPreview(null);
    setParsedSalesImportRows([]);

    try {
      const csvText = (await file.text()).replace(/^\uFEFF/, '');
      const [headerLine = '', ...rows] = csvText.split(/\r?\n/);
      const parsedHeaders = parseSalesCsvRow(headerLine);
      const expectedHeaders = [...SALES_IMPORT_HEADERS];

      const hasExactHeaders =
        parsedHeaders.length === expectedHeaders.length &&
        parsedHeaders.every((header, index) => header === expectedHeaders[index]);

      if (!hasExactHeaders) {
        throw new Error(`Invalid CSV headers. Expected: ${expectedHeaders.join(', ')}`);
      }

      const normalizedRows = rows.filter((row) => row.trim().length > 0);
      if (normalizedRows.length === 0) {
        throw new Error('The CSV file does not contain any data rows.');
      }

      const parsedRows = normalizedRows.map((row, index) => {
        const rowNumber = index + 2;
        const cells = parseSalesCsvRow(row);
        if (cells.length !== SALES_IMPORT_HEADERS.length) {
          throw new Error(`Invalid column count on row ${rowNumber}.`);
        }

        const [
          rawMonthKey,
          rawOutletId,
          rawOutletName,
          rawTotalSales,
          rawGrabGrossOrderValue,
          rawGrabCommissionFees,
          rawGrabAdSpend,
          rawFoodpandaGrossOrderValue,
          rawFoodpandaCommissionFees,
          rawFoodpandaAdSpend
        ] = cells;

        const outletId = rawOutletId.trim();
        if (!outletId) {
          throw new Error(`Missing outlet_id on row ${rowNumber}.`);
        }

        const matchedOutlet = outlets.find((outlet) => outlet.id === outletId) || null;
        if (!matchedOutlet) {
          throw new Error(`Unknown outlet_id on row ${rowNumber}.`);
        }

        if (!rawOutletName.trim()) {
          throw new Error(`Missing outlet_name on row ${rowNumber}.`);
        }

        return {
          month_key: normalizeSalesMonthKey(rawMonthKey, rowNumber),
          outlet_id: outletId,
          outlet_name: matchedOutlet.name,
          total_sales: normalizeSalesNumber(rawTotalSales, 'total_sales', rowNumber),
          grab_gross_order_value: normalizeSalesNumber(rawGrabGrossOrderValue, 'grab_gross_order_value', rowNumber),
          grab_commission_fees: normalizeSalesNumber(rawGrabCommissionFees, 'grab_commission_fees', rowNumber),
          grab_ad_spend: normalizeSalesNumber(rawGrabAdSpend, 'grab_ad_spend', rowNumber),
          foodpanda_gross_order_value: normalizeSalesNumber(rawFoodpandaGrossOrderValue, 'foodpanda_gross_order_value', rowNumber),
          foodpanda_commission_fees: normalizeSalesNumber(rawFoodpandaCommissionFees, 'foodpanda_commission_fees', rowNumber),
          foodpanda_ad_spend: normalizeSalesNumber(rawFoodpandaAdSpend, 'foodpanda_ad_spend', rowNumber)
        };
      });

      const monthKeys = [...new Set(parsedRows.map((row) => row.month_key))].sort();

      setParsedSalesImportRows(parsedRows);
      setSalesImportPreview({
        fileName: file.name,
        rowCount: parsedRows.length,
        monthKeys
      });
      setSalesImportFeedback({
        tone: 'success',
        message: `CSV checked. ${parsedRows.length} row${parsedRows.length === 1 ? '' : 's'} ready.`
      });
    } catch (error) {
      setSalesImportFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to parse this CSV file.'
      });
    } finally {
      event.target.value = '';
      setIsValidatingSalesImport(false);
    }
  };

  const handleCommitSalesImport = async () => {
    if (!user || !userData || !canManageSales || !salesImportPreview || parsedSalesImportRows.length === 0) return;

    const currentAppUserId = toNullableUuid(userData.id);
    if (!currentAppUserId) {
      setSalesImportFeedback({
        tone: 'error',
        message: 'Active admin profile is required before importing sales.'
      });
      return;
    }

    setIsImportingSales(true);
    setSalesImportFeedback(null);

    try {
      const csvBatchId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sales-import-${Date.now()}`;
      const salesDocMap = new Map<string, ParsedSalesImportRow>();
      const monthlyRollupMap = new Map<string, number>();

      parsedSalesImportRows.forEach((row) => {
        const salesDocId = `${row.month_key}__${row.outlet_id}`;
        const existingSalesDoc = salesDocMap.get(salesDocId);

        if (existingSalesDoc) {
          salesDocMap.set(salesDocId, {
            ...existingSalesDoc,
            total_sales: roundCurrency(existingSalesDoc.total_sales + row.total_sales),
            grab_gross_order_value: roundCurrency(existingSalesDoc.grab_gross_order_value + row.grab_gross_order_value),
            grab_commission_fees: roundCurrency(existingSalesDoc.grab_commission_fees + row.grab_commission_fees),
            grab_ad_spend: roundCurrency(existingSalesDoc.grab_ad_spend + row.grab_ad_spend),
            foodpanda_gross_order_value: roundCurrency(existingSalesDoc.foodpanda_gross_order_value + row.foodpanda_gross_order_value),
            foodpanda_commission_fees: roundCurrency(existingSalesDoc.foodpanda_commission_fees + row.foodpanda_commission_fees),
            foodpanda_ad_spend: roundCurrency(existingSalesDoc.foodpanda_ad_spend + row.foodpanda_ad_spend)
          });
        } else {
          salesDocMap.set(salesDocId, { ...row });
        }

        const currentMonthSales = monthlyRollupMap.get(row.month_key) || 0;
        monthlyRollupMap.set(row.month_key, roundCurrency(currentMonthSales + row.total_sales));
      });

      const salesPayload = Array.from(salesDocMap.values()).map((salesRow) => ({
          month_key: salesRow.month_key,
          outlet_id: salesRow.outlet_id,
          outlet_name: salesRow.outlet_name,
          total_sales: salesRow.total_sales,
          grab_gross_order_value: salesRow.grab_gross_order_value,
          grab_commission_fees: salesRow.grab_commission_fees,
          grab_ad_spend: salesRow.grab_ad_spend,
          foodpanda_gross_order_value: salesRow.foodpanda_gross_order_value,
          foodpanda_commission_fees: salesRow.foodpanda_commission_fees,
          foodpanda_ad_spend: salesRow.foodpanda_ad_spend
      }));

      const { data: importResult, error: importError } = await supabase.rpc('import_sales_budget', {
        p_sales_rows: salesPayload,
        p_source_file_name: salesImportPreview.fileName,
        p_source_batch_id: csvBatchId
      });

      if (importError) throw importError;

      const importSummary = Array.isArray(importResult) ? importResult[0] : null;
      const importedSalesCount = Number(importSummary?.sales_count ?? salesDocMap.size);
      const importedBudgetCount = Number(importSummary?.budget_count ?? monthlyRollupMap.size);

      setParsedSalesImportRows([]);
      setSalesImportPreview(null);
      setSalesImportFeedback({
        tone: 'success',
        message: `Import complete. ${importedSalesCount} sales doc${importedSalesCount === 1 ? '' : 's'}, ${importedBudgetCount} budget doc${importedBudgetCount === 1 ? '' : 's'}.`
      });
    } catch (error) {
      console.error('Error importing sales data:', error);
      setSalesImportFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to import sales data.'
      });
    } finally {
      setIsImportingSales(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Sales & Budget</h1>
        <p className="text-neutral-500 mt-2">
          Import sales, lock budgets, and review history.
        </p>
      </div>

      {salesImportFeedback && (
        <div className={`rounded-xl border px-4 py-3 ${
          salesImportFeedback.tone === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <p className="text-sm font-medium">{salesImportFeedback.message}</p>
        </div>
      )}

      <section className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-500" />
              Import Sales
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Download the CSV template and validate before import.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleDownloadSalesTemplate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-xl hover:bg-neutral-100 transition-colors"
            >
              <Download size={16} />
              Download Template
            </button>

            <label className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors ${
              isValidatingSalesImport
                ? 'bg-emerald-300 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
            }`}>
              <Upload size={16} />
              {isValidatingSalesImport ? 'Validating...' : 'Upload CSV'}
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleSalesImportFileChange}
                disabled={isValidatingSalesImport}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-8">
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-6">
            <h3 className="font-bold text-neutral-900">Required CSV Headers</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Headers must match this order.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {SALES_IMPORT_HEADERS.map((header) => (
                <span
                  key={header}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border border-neutral-200 text-neutral-600"
                >
                  {header}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-6">
            <h3 className="font-bold text-neutral-900">Validation</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Checks the file before import.
            </p>

            {salesImportPreview ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-white border border-neutral-200 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">File</p>
                  <p className="text-sm font-medium text-neutral-900 mt-1">{salesImportPreview.fileName}</p>
                </div>
                <div className="rounded-xl bg-white border border-neutral-200 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Rows</p>
                  <p className="text-sm font-medium text-neutral-900 mt-1">{salesImportPreview.rowCount}</p>
                </div>
                <div className="rounded-xl bg-white border border-neutral-200 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Months</p>
                  <p className="text-sm font-medium text-neutral-900 mt-1">{salesImportPreview.monthKeys.join(', ')}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-sm text-neutral-500">
                No file checked yet.
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleCommitSalesImport}
                disabled={!salesImportPreview || parsedSalesImportRows.length === 0 || isValidatingSalesImport || isImportingSales}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 border border-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:bg-emerald-300 disabled:border-emerald-300 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                {isImportingSales ? 'Importing...' : 'Import CSV'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-emerald-500" />
              Sales vs Budget
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Last 12 locked months.
            </p>
          </div>
          <div className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-full">
            {budgetHistory.length} Months
          </div>
        </div>

        {loadingBudgetHistory ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-500">
            Loading history...
          </div>
        ) : budgetHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center">
            <DollarSign className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-base font-semibold text-neutral-900">No history yet</p>
            <p className="text-sm text-neutral-500 mt-1">
              Import sales to start tracking budget history.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-100 overflow-hidden">
            <div className="grid grid-cols-[1.1fr_1fr_1fr_0.7fr_0.8fr] gap-4 px-5 py-3 bg-neutral-50 border-b border-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <span>Month</span>
              <span>Sales</span>
              <span>Budget</span>
              <span>Rate</span>
              <span>Status</span>
            </div>

            <div className="divide-y divide-neutral-100">
              {budgetHistory.map((budgetRecord) => (
                <div
                  key={budgetRecord.id}
                  className="grid grid-cols-[1.1fr_1fr_1fr_0.7fr_0.8fr] gap-4 px-5 py-4 items-center text-sm"
                >
                  <div>
                    <p className="font-semibold text-neutral-900">{budgetRecord.month_key}</p>
                    <p className="text-xs text-neutral-400 mt-1">Locked month</p>
                  </div>
                  <p className="font-medium text-neutral-900">
                    {budgetCurrencyFormatter.format(budgetRecord.sales_rollup_total)}
                  </p>
                  <p className="font-medium text-emerald-700">
                    {budgetCurrencyFormatter.format(budgetRecord.marketing_budget_total)}
                  </p>
                  <p className="text-neutral-600">{(budgetRecord.budget_rate * 100).toFixed(0)}%</p>
                  <div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      budgetRecord.locked
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {budgetRecord.locked ? 'Locked' : 'Draft'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
