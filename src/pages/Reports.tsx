import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Download, FileText, Database, ShieldAlert, Ticket, TrendingUp, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { subscribeToTable } from '../lib/supabaseData';
import { useAuth } from '../lib/AuthContext';

const REPORT_EXPORT_LIMIT = 5000;

const REPORT_SELECTS = {
  campaigns: 'id, name, objective, status, type, owner_user_id, start_date, end_date, budget, asset_url, created_at, updated_at',
  events: 'id, event_name, organizer, outlet_id, outlet_name, type, campaign_id, decision_status, assigned_pic, actual_attendance, sales_generated, vouchers_distributed, vouchers_redeemed, notes, photos, start_at, end_at, proposed_date, submitter_user_id, created_at, updated_at',
  partnerships: 'id, company_name, industry, contact_person, position, phone, email, lead_source, stage, voucher_type, vouchers_allocated, vouchers_redeemed, revenue_generated, cost_per_redemption, target_date, last_contacted_date, campaign_id, owner_user_id, notes, created_at, updated_at',
  mall_displays: 'id, outlet_id, outlet_name, slot_code, design_status, approval_status, current_status, location_description, campaign_id, installation_date, mall_pic_name, mall_pic_contact, remarks, proof_text, proof_image_url, proof_image_path, photo_proof_url, created_at, updated_at',
  paid_ads: 'id, platform, campaign_name, objective, campaign_id, spend, reach, results, result_type, engagement, owner_user_id, created_at, updated_at',
  delivery_promos: 'id, platform, promo_type, campaign_id, start_date, end_date, spend, sales, funding, status, pic_user_id, created_at, updated_at',
  social_posts: 'id, platform, content_type, campaign_id, outlet_id, outlet_name, publish_date, status, reach, engagement, clicks, author_user_id, created_at, updated_at'
} as const;

type ReportTable = keyof typeof REPORT_SELECTS;

const REPORT_CARDS: Array<{
  name: string;
  col: ReportTable;
  file: string;
  desc: string;
  color: string;
  bg: string;
}> = [
  { name: 'Campaign Data', col: 'campaigns', file: 'campaigns', desc: 'All physical and digital campaigns, budgets, and status logs', color: 'text-rose-600', bg: 'bg-rose-50' },
  { name: 'Events Data', col: 'events', file: 'events', desc: 'Roll-up of sales, event data, and execution notes', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { name: 'Partnership ROI', col: 'partnerships', file: 'partnerships', desc: 'Corporate lead pipeline, voucher distribution, and redemption counts', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { name: 'Paid Ads Matrix', col: 'paid_ads', file: 'paid_ads', desc: 'Full month spend tracking vs ROAS extraction', color: 'text-violet-600', bg: 'bg-violet-50' },
  { name: 'Social Post Log', col: 'social_posts', file: 'social_posts', desc: 'Extracted view of all planned content and published links', color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' }
];

const MASTER_COLLECTIONS: ReportTable[] = ['campaigns', 'events', 'partnerships', 'mall_displays', 'paid_ads', 'delivery_promos'];

type ReportsFeedback = {
  tone: 'success' | 'error';
  message: string;
};

function fromReportTable(table: ReportTable) {
  return (supabase as any).from(table);
}

export function Reports() {
  const { userData } = useAuth();
  const role = userData?.role;
  const canUseReports = role === 'admin' || role === 'finance';
  const canExportMaster = role === 'admin';
  const [downloading, setDownloading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ReportsFeedback | null>(null);
  
  const [voucherData, setVoucherData] = useState({
    totalPushed: 0,
    totalClaimed: 0,
    totalSpend: 0,
    redemptionRate: 0,
    costPerRedemption: 0
  });

  useEffect(() => {
    if (!canUseReports) return;

    const fetchVoucherData = async () => {
      const [partnershipsResult, eventsResult, promosResult] = await Promise.all([
        supabase.from('partnerships').select('vouchers_allocated, vouchers_redeemed'),
        supabase.from('events').select('vouchers_distributed, vouchers_redeemed'),
        supabase.from('delivery_promos').select('spend')
      ]);

      const firstError = partnershipsResult.error || eventsResult.error || promosResult.error;
      if (firstError) {
        console.error('Voucher report aggregation error:', firstError);
        return;
      }

      const partnershipTotals = (partnershipsResult.data || []).reduce((totals, item: any) => ({
        pushed: totals.pushed + Number(item.vouchers_allocated || 0),
        claimed: totals.claimed + Number(item.vouchers_redeemed || 0)
      }), { pushed: 0, claimed: 0 });

      const eventTotals = (eventsResult.data || []).reduce((totals, item: any) => ({
        pushed: totals.pushed + Number(item.vouchers_distributed || 0),
        claimed: totals.claimed + Number(item.vouchers_redeemed || 0)
      }), { pushed: 0, claimed: 0 });

      const promoSpend = (promosResult.data || []).reduce(
        (sum, item: any) => sum + Number(item.spend || 0),
        0
      );

      setVoucherData(recalcVouchers(partnershipTotals, eventTotals, promoSpend));
    };

    void fetchVoucherData();
    const unsubPartnerships = subscribeToTable('reports-partnerships', 'partnerships', () => {
      void fetchVoucherData();
    });
    const unsubEvents = subscribeToTable('reports-events', 'events', () => {
      void fetchVoucherData();
    });
    const unsubPromos = subscribeToTable('reports-delivery-promos', 'delivery_promos', () => {
      void fetchVoucherData();
    });

    return () => {
      unsubPartnerships();
      unsubEvents();
      unsubPromos();
    };
  }, [canUseReports]);

  const recalcVouchers = (
    partnerships: { pushed: number; claimed: number },
    events: { pushed: number; claimed: number },
    spend: number
  ) => {
    const totalPushed = partnerships.pushed + events.pushed;
    const totalClaimed = partnerships.claimed + events.claimed;
    
    // In our simplified math, "spend" is attached to promos and partnerships if they had direct costs,
    // For now we just use promo spend against total claims or any specific spend track.
    
    return {
      totalPushed,
      totalClaimed,
      totalSpend: spend,
      redemptionRate: totalPushed > 0 ? ((totalClaimed / totalPushed) * 100) : 0,
      costPerRedemption: totalClaimed > 0 ? (spend / totalClaimed) : 0
    };
  };

  const downloadCSV = (filename: string, headers: string[], data: any[]) => {
    const csvRows = [];
    csvRows.push(headers.join(','));
    
    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header];
        if (val === undefined || val === null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async (collectionName: ReportTable, filename: string, customMapping?: (docs: any[]) => any[]) => {
    if (!canUseReports) {
      setFeedback({ tone: 'error', message: 'You do not have access to reports.' });
      return;
    }

    try {
      setDownloading(filename);
      const { data, error } = await fromReportTable(collectionName)
        .select(REPORT_SELECTS[collectionName])
        .order('created_at', { ascending: false })
        .limit(REPORT_EXPORT_LIMIT);

      if (error) throw error;

      const rawData = data || [];
      
      const processData = customMapping ? customMapping(rawData) : rawData;
      
      if (processData.length === 0) {
        setFeedback({ tone: 'error', message: 'No data found to export.' });
        return;
      }
      
      // Auto-extract keys from the first object
      let headers = Object.keys(processData[0]).filter(k => k !== 'createdAt' && k !== 'updatedAt');
      downloadCSV(filename, headers, processData);
      setFeedback({ tone: 'success', message: `${filename}.csv generated with ${processData.length} row${processData.length === 1 ? '' : 's'}.` });
    } catch (error) {
      console.error(`Export error for ${filename}:`, error);
      setFeedback({ tone: 'error', message: 'Failed to generate export.' });
    } finally {
      setDownloading(null);
    }
  };

  const exportMaster = async () => {
    if (!canExportMaster) {
      setFeedback({ tone: 'error', message: 'Master extract is admin-only.' });
      return;
    }

    setDownloading('master');
    try {
      let allData: any[] = [];
      
      for (const col of MASTER_COLLECTIONS) {
        const { data, error } = await fromReportTable(col)
          .select(REPORT_SELECTS[col])
          .order('created_at', { ascending: false })
          .limit(REPORT_EXPORT_LIMIT);

        if (error) throw error;

        (data || []).forEach((row: any) => {
          allData.push({
            _sourceCollection: col,
            _id: row.id,
            ...row
          });
        });
      }
      
      if (allData.length > 0) {
        // Collect all possible headers across heterogeneous data
        const headerSet = new Set<string>();
        allData.forEach(item => Object.keys(item).forEach(k => {
           if(k !== 'createdAt' && k !== 'updatedAt') headerSet.add(k);
        }));
        downloadCSV('master_snapshot', Array.from(headerSet), allData);
        setFeedback({ tone: 'success', message: `Master snapshot generated with ${allData.length} row${allData.length === 1 ? '' : 's'}.` });
      } else {
        setFeedback({ tone: 'error', message: 'Database is empty.' });
      }
    } catch (error) {
      console.error("Master export failed:", error);
      setFeedback({ tone: 'error', message: 'Master export failed.' });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Reports & Export</h1>
        <p className="text-neutral-500 mt-1">Export raw master data to CSV for external analysis or finance review.</p>
      </header>

      {feedback && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          feedback.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Global Voucher Engine Analytics */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden mb-6">
        <div className="bg-indigo-50 border-b border-indigo-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div>
             <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
               <Ticket className="w-5 h-5" /> Global Voucher Calculation Engine
             </h2>
             <p className="text-sm text-indigo-700 mt-1">Real-time aggregate of physical and digital voucher redemptions</p>
           </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
           <div>
             <p className="text-xs font-semibold uppercase text-neutral-500 mb-1 tracking-wider">Total Pushed</p>
             <p className="text-2xl font-bold text-neutral-900">{voucherData.totalPushed.toLocaleString()}</p>
             <p className="text-xs text-neutral-400 mt-1">Events + Partnerships</p>
           </div>
           <div>
             <p className="text-xs font-semibold uppercase text-neutral-500 mb-1 tracking-wider">Total Claimed</p>
             <p className="text-2xl font-bold text-emerald-600">{voucherData.totalClaimed.toLocaleString()}</p>
             <p className="text-xs text-neutral-400 mt-1">Across all tracking</p>
           </div>
           <div>
             <p className="text-xs font-semibold uppercase text-neutral-500 mb-1 tracking-wider">Global Redemption Rate</p>
             <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-indigo-600">{voucherData.redemptionRate.toFixed(1)}%</p>
                <TrendingUp className="w-5 h-5 text-indigo-400" />
             </div>
           </div>
           <div>
             <p className="text-xs font-semibold uppercase text-neutral-500 mb-1 tracking-wider">Avg Cost Per Redemption</p>
             <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-amber-600">RM {voucherData.costPerRedemption.toFixed(2)}</p>
                <DollarSign className="w-5 h-5 text-amber-400" />
             </div>
           </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Core Export Blocks */}
        {REPORT_CARDS.map(report => (
          <div key={report.name} className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 flex flex-col justify-between group">
             <div>
               <div className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center ${report.bg} ${report.color}`}>
                  <FileText className="w-6 h-6" />
               </div>
               <h3 className="text-lg font-bold text-neutral-900 mb-2">{report.name}</h3>
               <p className="text-sm text-neutral-500 mb-6">{report.desc}</p>
             </div>
             <button 
               onClick={() => handleExport(report.col, report.file)}
               disabled={downloading !== null}
               className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors border ${
                 downloading === report.file 
                 ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-wait' 
                 : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
               }`}
             >
               {downloading === report.file ? <span className="animate-pulse">Parsing...</span> : <><Download className="w-4 h-4" /> Download CSV</>}
             </button>
          </div>
        ))}

        {/* Master Extract */}
        <div className="bg-neutral-900 p-6 rounded-2xl shadow-sm border border-neutral-800 flex flex-col justify-between text-white col-span-1 md:col-span-2 lg:col-span-1">
           <div>
             <div className="w-12 h-12 rounded-xl bg-neutral-800 border border-neutral-700 mb-4 flex items-center justify-center text-neutral-300">
                <Database className="w-6 h-6" />
             </div>
             <h3 className="text-lg font-bold mb-2">Master Database Extract</h3>
             <p className="text-sm text-neutral-400 mb-6">Complete snapshot of the entire operations dashboard architecture. Due to heterogenous collection schemas, headers will be merged.</p>
           </div>
           <div>
             <div className="flex items-center gap-2 text-xs font-semibold text-amber-500 bg-amber-500/10 p-3 rounded-lg mb-4">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                Available to Marketing Manager & Admin Roles Only
             </div>
             <button 
               onClick={exportMaster}
               disabled={downloading !== null || !canExportMaster}
               className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold transition-colors ${
                 downloading === 'master' 
                 ? 'bg-neutral-800 text-neutral-500 cursor-wait'
                 : !canExportMaster
                 ? 'bg-neutral-700 text-neutral-400 cursor-not-allowed'
                 : 'bg-white hover:bg-neutral-100 text-neutral-900'
               }`}
             >
               {downloading === 'master' ? <span className="animate-pulse">Building Archive...</span> : <><Download className="w-4 h-4" /> Request Master Extract</>}
             </button>
           </div>
        </div>

      </motion.div>
    </div>
  );
}
