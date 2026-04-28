import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DollarSign, Plus, Megaphone, TrendingUp, MousePointerClick, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useCampaigns } from '../lib/useCampaigns';
import { supabase } from '../lib/supabase';
import { nowIso, subscribeToTable, toNullableUuid, toNumber } from '../lib/supabaseData';

function normalizePaidAd(row: any) {
  return {
    id: row.id,
    platform: row.platform || 'Meta',
    campaignName: row.campaign_name || '',
    objective: row.objective || 'Traffic',
    campaignId: row.campaign_id || '',
    spend: toNumber(row.spend),
    reach: toNumber(row.reach),
    results: toNumber(row.results),
    resultType: row.result_type || 'Video View',
    engagement: toNumber(row.engagement),
    ownerId: row.owner_user_id || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function PaidAds() {
  const { user, userData } = useAuth();
  const { campaigns } = useCampaigns();
  const role = userData?.role;
  const canManageAds = role === 'admin' || role === 'finance';
  
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingAd, setEditingAd] = useState<any>(null);

  const [formData, setFormData] = useState({
    platform: 'Meta',
    campaignName: '',
    objective: 'Traffic',
    campaignId: '',
    spend: '',
    reach: '',
    results: '',
    resultType: 'Video View',
    engagement: ''
  });

  useEffect(() => {
    if (!user) return;
    const fetchAds = async () => {
      const { data, error } = await supabase
        .from('paid_ads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching paid ads:", error);
        setLoading(false);
        return;
      }

      setAds((data || []).map(normalizePaidAd));
      setLoading(false);
    };

    void fetchAds();
    const unsubscribe = subscribeToTable('paid-ads-page', 'paid_ads', () => {
      void fetchAds();
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData || !canManageAds) return;
    try {
      const timestamp = nowIso();
      const { error } = await supabase
        .from('paid_ads')
        .insert({
          platform: formData.platform,
          campaign_name: formData.campaignName.trim(),
          objective: formData.objective,
          campaign_id: toNullableUuid(formData.campaignId),
          spend: Number(formData.spend) || 0,
          reach: Number(formData.reach) || 0,
          results: Number(formData.results) || 0,
          result_type: formData.resultType,
          engagement: Number(formData.engagement) || 0,
          owner_user_id: userData.id,
          created_at: timestamp,
          updated_at: timestamp
        });

      if (error) throw error;

      setIsCreating(false);
      setFormData({ platform: 'Meta', campaignName: '', objective: 'Traffic', campaignId: '', spend: '', reach: '', results: '', resultType: 'Video View', engagement: '' });
    } catch (error) {
       console.error("Error logging ad data:", error);
       alert("Failed to track ad spend.");
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAd || !canManageAds) return;
    try {
      const { error } = await supabase
        .from('paid_ads')
        .update({
          platform: editingAd.platform || 'Meta',
          campaign_name: editingAd.campaignName || '',
          objective: editingAd.objective || 'Traffic',
          campaign_id: toNullableUuid(editingAd.campaignId),
          spend: Number(editingAd.spend) || 0,
          reach: Number(editingAd.reach) || 0,
          results: Number(editingAd.results) || 0,
          result_type: editingAd.resultType || 'Video View',
          engagement: Number(editingAd.engagement) || 0,
          updated_at: nowIso()
        })
        .eq('id', editingAd.id);

      if (error) throw error;

      setEditingAd(null);
    } catch (error) {
      console.error("Error updating ad data:", error);
      alert("Failed to update ad data.");
    }
  };

  const monthlyBudget = 5000;
  const totalSpend = ads.reduce((sum, ad) => sum + (Number(ad.spend) || 0), 0);
  const spendPct = Math.min((totalSpend / monthlyBudget) * 100, 100);

  // Global Platform Health calculation
  const metaAds = ads.filter(a => a.platform === 'Meta');
  const tiktokAds = ads.filter(a => a.platform === 'TikTok');
  
  const metaSpend = metaAds.reduce((sum, a) => sum + (Number(a.spend) || 0), 0);
  const metaResults = metaAds.reduce((sum, a) => sum + (Number(a.results) || 0), 0);
  const metaCpa = metaResults > 0 ? 'RM ' + (metaSpend / metaResults).toFixed(2) : 'N/A';

  const tiktokSpend = tiktokAds.reduce((sum, a) => sum + (Number(a.spend) || 0), 0);
  const tiktokResults = tiktokAds.reduce((sum, a) => sum + (Number(a.results) || 0), 0);
  const tiktokCpa = tiktokResults > 0 ? 'RM ' + (tiktokSpend / tiktokResults).toFixed(2) : 'N/A';


  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Paid Ads Tracker</h1>
          <p className="text-neutral-500 mt-1">Monitor ROAS, CPA, CPC, and monthly digital spending</p>
        </div>
        {canManageAds && (
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
            <Plus size={20} /> Log Ad Data
          </button>
        )}
      </header>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100">
           <div className="flex justify-between items-center mb-4">
              <div>
                 <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">Total Monthly Spend</p>
                 <p className="text-2xl font-bold text-neutral-900 mt-1">RM {totalSpend.toLocaleString()} <span className="text-sm font-medium text-neutral-400">/ RM {monthlyBudget}</span></p>
              </div>
              <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center text-violet-600 shrink-0">
                <DollarSign className="w-6 h-6" />
              </div>
           </div>
           <div className="w-full bg-neutral-100 rounded-full h-2 mb-2">
             <div className={`h-2 rounded-full transition-all duration-500 ${spendPct > 90 ? 'bg-rose-500' : 'bg-violet-500'}`} style={{ width: `${spendPct}%` }}></div>
           </div>
         </div>

         <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100">
           <div className="flex justify-between items-center">
              <div>
                 <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">Overall Platform Health</p>
                 <div className="flex gap-4 mt-3">
                   <div>
                     <p className="text-xs text-neutral-400 mb-1">Meta Avg CPA</p>
                     <p className="font-bold text-lg text-emerald-600">{metaCpa}</p>
                   </div>
                   <div>
                     <p className="text-xs text-neutral-400 mb-1">TikTok Avg CPA</p>
                     <p className="font-bold text-lg text-emerald-600">{tiktokCpa}</p>
                   </div>
                 </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <TrendingUp className="w-6 h-6" />
              </div>
           </div>
         </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/50 border-b border-neutral-100 text-sm text-neutral-500">
                  <th className="font-medium px-6 py-4">Campaign Name</th>
                  <th className="font-medium px-6 py-4">Platform</th>
                  <th className="font-medium px-6 py-4">Objective</th>
                  <th className="font-medium px-6 py-4 text-right">Spend</th>
                  <th className="font-medium px-6 py-4 text-right">Cost per Result</th>
                  <th className="font-medium px-6 py-4 text-right">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-neutral-500">Loading metrics...</td></tr>
                ) : ads.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-neutral-500">{canManageAds ? 'No ad data logged. Click "Log Ad Data" to start.' : 'No ad data logged.'}</td></tr>
                ) : (
                  ads.map(ad => {
                    const cpr = (ad.spend && ad.results) ? (ad.spend / ad.results).toFixed(2) : '0.00';
                    return (
                      <tr
                        key={ad.id}
                        onClick={() => {
                          if (canManageAds) {
                            setEditingAd(ad);
                          }
                        }}
                        className={`hover:bg-neutral-50 transition-colors ${canManageAds ? 'cursor-pointer group' : ''}`}
                      >
                        <td className="px-6 py-4">
                           <p className="font-bold text-neutral-900">{ad.campaignName}</p>
                           {ad.campaignId && <p className="text-xs text-violet-600 font-medium">Link: {ad.campaignId}</p>}
                        </td>
                        <td className="px-6 py-4">
                           <span className="text-xs font-semibold px-2 py-1 bg-neutral-100 text-neutral-600 rounded">
                              {ad.platform}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-neutral-700">{ad.objective}</td>
                        <td className="px-6 py-4 text-right font-medium text-neutral-900">RM {Number(ad.spend || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right">
                           <p className="text-sm font-bold text-neutral-700">RM {cpr}</p>
                           <p className="text-[10px] text-neutral-400 capitalize">{ad.results} {ad.resultType || 'Results'}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <span className="font-bold text-neutral-900">
                             {Number(ad.engagement || 0).toLocaleString()}
                           </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {/* Slide-out Create Panel */}
      <AnimatePresence>
        {isCreating && canManageAds && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreating(false)}
              className="fixed inset-0 bg-neutral-900/30 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 border-l border-neutral-200 flex flex-col"
            >
              <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
                <div>
                  <h3 className="font-bold text-neutral-900 text-lg">Log New Ad Data</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">Campaign Setup</p>
                </div>
                <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="ad-create-form" onSubmit={handleCreateSubmit} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Platform *</label>
                      <select value={formData.platform} onChange={e=>setFormData({...formData, platform: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500">
                        {['Meta', 'TikTok', 'Google', 'X', 'Other'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Objective</label>
                      <select value={formData.objective} onChange={e=>setFormData({...formData, objective: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500">
                        {['Traffic', 'Engagement', 'Leads', 'Sales / Conversions'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Ad Set / Campaign Name *</label>
                    <input required type="text" value={formData.campaignName} onChange={e=>setFormData({...formData, campaignName: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Internal Campaign Tie-in</label>
                    <select value={formData.campaignId} onChange={e=>setFormData({...formData, campaignId: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500">
                      <option value="">None / Standalone Ad</option>
                      {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="pt-4 border-t border-neutral-100">
                     <h4 className="font-semibold text-neutral-900 mb-3 text-sm">Current Performance (RM)</h4>
                     <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                         <label className="text-sm font-medium text-neutral-700">Spend</label>
                         <input type="number" required value={formData.spend} onChange={e=>setFormData({...formData, spend: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" />
                       </div>
                       <div className="space-y-1">
                         <label className="text-sm font-medium text-neutral-700">Reach</label>
                         <input type="number" value={formData.reach} onChange={e=>setFormData({...formData, reach: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" />
                       </div>
                     </div>
                     <div className="grid grid-cols-2 gap-4 mt-3">
                       <div className="space-y-1">
                         <label className="text-sm font-medium text-neutral-700">Result Vol.</label>
                         <input type="number" value={formData.results} onChange={e=>setFormData({...formData, results: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" />
                       </div>
                       <div className="space-y-1">
                         <label className="text-sm font-medium text-neutral-700">Result Type</label>
                         <select value={formData.resultType} onChange={e=>setFormData({...formData, resultType: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500">
                           <option value="Video View">Video View</option>
                           <option value="Like">Like</option>
                           <option value="Comment">Comment</option>
                           <option value="Share">Share</option>
                         </select>
                       </div>
                     </div>
                     <div className="space-y-1 mt-3">
                        <label className="text-sm font-medium text-neutral-700">Engagement</label>
                        <input type="number" value={formData.engagement} onChange={e=>setFormData({...formData, engagement: e.target.value})} className="w-full p-2 bg-emerald-50 border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                     </div>
                  </div>
                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setIsCreating(false)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="ad-create-form" className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg shadow-sm transition-colors">Save Performance</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Slide-out Edit Panel */}
      <AnimatePresence>
        {editingAd && canManageAds && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingAd(null)}
              className="fixed inset-0 bg-neutral-900/30 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 border-l border-neutral-200 flex flex-col"
            >
              <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
                <div>
                  <h3 className="font-bold text-neutral-900 text-lg">Update Performance</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">{editingAd.campaignName}</p>
                </div>
                <button onClick={() => setEditingAd(null)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="ad-update-form" onSubmit={handleUpdateSubmit} className="space-y-6">
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Spend (RM)</label>
                        <input type="number" required value={editingAd.spend} onChange={e=>setEditingAd({...editingAd, spend: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500 font-bold" />
                     </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Reach</label>
                        <input type="number" value={editingAd.reach} onChange={e=>setEditingAd({...editingAd, reach: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" />
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Result Vol.</label>
                        <input type="number" value={editingAd.results} onChange={e=>setEditingAd({...editingAd, results: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" />
                     </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Result Type</label>
                        <select value={editingAd.resultType} onChange={e=>setEditingAd({...editingAd, resultType: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-500">
                           <option value="Video View">Video View</option>
                           <option value="Like">Like</option>
                           <option value="Comment">Comment</option>
                           <option value="Share">Share</option>
                        </select>
                     </div>
                  </div>

                  <div className="space-y-1">
                     <label className="text-sm font-medium text-neutral-700">Engagement</label>
                     <input type="number" value={editingAd.engagement} onChange={e=>setEditingAd({...editingAd, engagement: e.target.value})} className="w-full p-2 bg-emerald-50 border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-700" />
                  </div>

                  <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                     <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-neutral-500 uppercase">Computed Metrics</span>
                     </div>
                     <div className="grid grid-cols-1 gap-4">
                        <div>
                           <p className="text-xs text-neutral-500 mb-0.5">Cost per Result (CPA/CPC)</p>
                           <p className="text-lg font-bold text-neutral-900">
                              {(Number(editingAd.spend) && Number(editingAd.results)) 
                                 ? 'RM ' + (Number(editingAd.spend) / Number(editingAd.results)).toFixed(2)
                                 : 'N/A'
                              }
                           </p>
                        </div>
                     </div>
                  </div>

                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingAd(null)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="ad-update-form" className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-lg shadow-sm transition-colors">Save Performance</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
