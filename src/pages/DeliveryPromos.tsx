import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Truck, Plus, CheckCircle2, CircleDashed, TrendingUp, DollarSign, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useCampaigns } from '../lib/useCampaigns';
import { supabase } from '../lib/supabase';
import { nowIso, subscribeToTable, toNullableDate, toNullableUuid, toNumber } from '../lib/supabaseData';

function normalizeDeliveryPromo(row: any) {
  return {
    id: row.id,
    platform: row.platform || 'GrabFood',
    promoType: row.promo_type || '',
    campaignId: row.campaign_id || '',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    spend: toNumber(row.spend),
    sales: toNumber(row.sales),
    funding: row.funding || 'Self-funded',
    status: row.status || 'Proposed',
    picId: row.pic_user_id || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function DeliveryPromos() {
  const { user, userData } = useAuth();
  const { campaigns } = useCampaigns();
  const role = userData?.role;
  const canManagePromos = role === 'admin' || role === 'supervisor';
  
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editingPromo, setEditingPromo] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({
    platform: 'GrabFood',
    promoType: '',
    campaignId: '',
    startDate: '',
    endDate: '',
    spend: '',
    sales: '',
    funding: 'Self-funded',
    status: 'Proposed'
  });

  useEffect(() => {
    if (!user) return;
    const fetchPromos = async () => {
      const { data, error } = await supabase
        .from('delivery_promos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching promos:", error);
        setLoading(false);
        return;
      }

      setPromos((data || []).map(normalizeDeliveryPromo));
      setLoading(false);
    };

    void fetchPromos();
    const unsubscribe = subscribeToTable('delivery-promos-page', 'delivery_promos', () => {
      void fetchPromos();
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData || !canManagePromos) return;
    try {
      const timestamp = nowIso();
      const { error } = await supabase
        .from('delivery_promos')
        .insert({
          platform: formData.platform,
          promo_type: formData.promoType.trim(),
          campaign_id: toNullableUuid(formData.campaignId),
          start_date: toNullableDate(formData.startDate),
          end_date: toNullableDate(formData.endDate),
          spend: Number(formData.spend) || 0,
          sales: Number(formData.sales) || 0,
          funding: formData.funding,
          status: formData.status,
          pic_user_id: userData.id,
          created_at: timestamp,
          updated_at: timestamp
        });

      if (error) throw error;

      setIsCreating(false);
      setFormData({ platform: 'GrabFood', promoType: '', campaignId: '', startDate: '', endDate: '', spend: '', sales: '', funding: 'Self-funded', status: 'Proposed' });
    } catch (error) {
      console.error("Error creating promo:", error);
      alert("Failed to create delivery promo track.");
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPromo || !canManagePromos) return;
    try {
      const { error } = await supabase
        .from('delivery_promos')
        .update({
          platform: editingPromo.platform || 'GrabFood',
          promo_type: editingPromo.promoType || '',
          campaign_id: toNullableUuid(editingPromo.campaignId),
          start_date: toNullableDate(editingPromo.startDate),
          end_date: toNullableDate(editingPromo.endDate),
          spend: Number(editingPromo.spend) || 0,
          sales: Number(editingPromo.sales) || 0,
          funding: editingPromo.funding || 'Self-funded',
          status: editingPromo.status || 'Proposed',
          updated_at: nowIso()
        })
        .eq('id', editingPromo.id);

      if (error) throw error;

      setEditingPromo(null);
    } catch (error) {
      console.error("Error updating promo:", error);
      alert("Failed to update delivery promo.");
    }
  };

  const totalSales = promos.reduce((sum, p) => sum + (Number(p.sales) || 0), 0);
  const totalSpend = promos.reduce((sum, p) => sum + (Number(p.spend) || 0), 0);
  const avgRoi = totalSpend > 0 ? (((totalSales - totalSpend) / totalSpend) * 100).toFixed(0) : 0;

  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Delivery Platform Marketing</h1>
          <p className="text-neutral-500 mt-1">Track promos and ROAS across GrabFood, Foodpanda & ShopeeFood</p>
        </div>
        {canManagePromos && (
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
            <Plus size={20} /> Propose Promo
          </button>
        )}
      </header>

      {/* Overview Cards */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 flex items-center justify-between">
            <div>
               <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-1">Total Sales Generated</p>
               <p className="text-2xl font-bold text-neutral-900">RM {totalSales.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
         </div>
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 flex items-center justify-between">
            <div>
               <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-1">Total Spend</p>
               <p className="text-2xl font-bold text-neutral-900">RM {totalSpend.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
         </div>
         <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-6 rounded-2xl border border-orange-200 flex flex-col justify-center">
            <p className="text-sm font-semibold text-orange-600 uppercase tracking-wider mb-1">Average Promo ROI</p>
            <p className="text-3xl font-extrabold text-orange-600">{avgRoi}%</p>
         </div>
      </motion.div>

      {/* List */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
             <p className="text-neutral-500">Loading tracking data...</p>
          ) : promos.length === 0 ? (
             <div className="col-span-full border border-dashed border-neutral-200 rounded-2xl p-12 text-center bg-white">
               <Truck className="mx-auto w-12 h-12 text-orange-200 mb-4" />
               <p className="text-lg font-medium text-neutral-900">No promos tracked</p>
               {canManagePromos ? (
                 <button onClick={() => setIsCreating(true)} className="text-orange-600 mt-2 font-medium hover:text-orange-700">Log the first campaign</button>
               ) : (
                 <p className="text-sm text-neutral-500 mt-2">Admins and supervisors can manage delivery promos.</p>
               )}
             </div>
          ) : (
             promos.map(promo => {
               const pSpend = Number(promo.spend) || 0;
               const pSales = Number(promo.sales) || 0;
               const pRoi = pSpend > 0 ? (((pSales - pSpend) / pSpend) * 100).toFixed(0) : 0;
               
               return (
               <div
                 key={promo.id}
                 onClick={() => {
                   if (canManagePromos) {
                     setEditingPromo(promo);
                   }
                 }}
                 className={`bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 relative group flex flex-col justify-between transition-shadow ${
                   canManagePromos ? 'cursor-pointer hover:shadow-md' : ''
                 }`}
               >
                  <div>
                     <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="text-xs font-bold px-2 py-1 bg-neutral-100 text-neutral-600 rounded mr-2 uppercase tracking-wider">{promo.platform}</span>
                          <span className="text-[10px] font-bold px-2 py-1 border border-neutral-200 text-neutral-500 rounded">{promo.funding}</span>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${
                          promo.status === 'Running' ? 'bg-emerald-100 text-emerald-700' :
                          promo.status === 'Ended' || promo.status === 'Evaluated' ? 'bg-neutral-100 text-neutral-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {promo.status === 'Running' ? <CheckCircle2 className="w-3 h-3" /> : <CircleDashed className="w-3 h-3" />}
                          {promo.status}
                        </span>
                     </div>

                     <h3 className="text-lg font-bold text-neutral-900 mb-1">{promo.promoType}</h3>
                     {promo.campaignId && <p className="text-xs font-medium text-orange-600 mb-2">Campaign: {promo.campaignId}</p>}
                     <p className="text-xs text-neutral-500 mb-4">Dates: {promo.startDate || 'TBD'} to {promo.endDate || 'TBD'}</p>
                  </div>

                  <div className="bg-neutral-50 p-3 rounded-xl flex justify-between items-center text-sm border border-neutral-100">
                    <div>
                      <p className="text-neutral-500 text-xs">Spend vs Sales</p>
                      <p className="font-semibold text-neutral-900">RM {pSpend.toLocaleString()} / <span className="text-emerald-600">RM {pSales.toLocaleString()}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="text-neutral-500 text-xs">ROI</p>
                      <p className={`font-bold ${Number(pRoi) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pRoi}%</p>
                    </div>
                  </div>
               </div>
             )})
          )}
        </div>
      </motion.div>

      {/* Slide-out Create Panel */}
      <AnimatePresence>
        {isCreating && canManagePromos && (
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
                  <h3 className="font-bold text-neutral-900 text-lg">Propose Delivery Action</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">New Promo Setup</p>
                </div>
                <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="promo-create-form" onSubmit={handleCreateSubmit} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Platform</label>
                      <select value={formData.platform} onChange={e=>setFormData({...formData, platform: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                        {['GrabFood', 'Foodpanda', 'ShopeeFood', 'Other'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Funding</label>
                      <select value={formData.funding} onChange={e=>setFormData({...formData, funding: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                        {['Platform-funded', 'Self-funded', 'Co-funded'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Promo Type / Name *</label>
                    <input required type="text" placeholder="e.g. Free Delivery, 20% Off" value={formData.promoType} onChange={e=>setFormData({...formData, promoType: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Campaign Tie-in</label>
                    <select value={formData.campaignId} onChange={e=>setFormData({...formData, campaignId: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
                      <option value="">None / Standalone</option>
                      {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Start Date</label>
                      <input type="date" value={formData.startDate} onChange={e=>setFormData({...formData, startDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">End Date</label>
                      <input type="date" value={formData.endDate} onChange={e=>setFormData({...formData, endDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
                    </div>
                  </div>
                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setIsCreating(false)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="promo-create-form" className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg shadow-sm transition-colors">Submit</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Slide-out Edit Panel */}
      <AnimatePresence>
        {editingPromo && canManagePromos && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPromo(null)}
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
                  <h3 className="font-bold text-neutral-900 text-lg">Update Promo Config</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">{editingPromo.promoType}</p>
                </div>
                <button onClick={() => setEditingPromo(null)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="promo-update-form" onSubmit={handleUpdateSubmit} className="space-y-6">
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Status</label>
                      <select value={editingPromo.status} onChange={e=>setEditingPromo({...editingPromo, status: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                        {['Proposed', 'Submitted', 'Running', 'Ended', 'Evaluated'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-4 pt-4 border-t border-neutral-100">
                    <h4 className="font-semibold text-neutral-900 border-b border-neutral-100 pb-2">Financials & Returns (ROAS)</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Committed Spend (RM)</label>
                        <input type="number" value={editingPromo.spend} onChange={e=>setEditingPromo({...editingPromo, spend: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Sales Generated (RM)</label>
                        <input type="number" value={editingPromo.sales} onChange={e=>setEditingPromo({...editingPromo, sales: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                      </div>
                    </div>
                    
                    <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200/60 mt-2">
                       <p className="text-xs text-neutral-500 uppercase font-semibold mb-1">Calculated Return on Ad Spend (ROAS)</p>
                       <p className="text-2xl font-bold text-neutral-900">
                          {Number(editingPromo.spend) > 0 
                             ? (((Number(editingPromo.sales) - Number(editingPromo.spend)) / Number(editingPromo.spend)) * 100).toFixed(0) + '%' 
                             : 'No spend data'}
                       </p>
                    </div>
                  </div>
                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setEditingPromo(null)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="promo-update-form" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm transition-colors">Save Updates</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
