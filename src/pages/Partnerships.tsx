import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Handshake, Plus, Building, Target, Percent, Phone, ArrowUpRight, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useCampaigns } from '../lib/useCampaigns';
import { supabase } from '../lib/supabase';
import { nowIso, subscribeToTable, toNullableDate, toNullableUuid, toNumber } from '../lib/supabaseData';

function normalizePartnership(row: any) {
  return {
    id: row.id,
    companyName: row.company_name || '',
    industry: row.industry || '',
    contactPerson: row.contact_person || '',
    position: row.position || '',
    phone: row.phone || '',
    email: row.email || '',
    leadSource: row.lead_source || '',
    stage: row.stage || 'Prospect',
    voucherType: row.voucher_type || 'Digital',
    vouchersAllocated: toNumber(row.vouchers_allocated),
    vouchersRedeemed: toNumber(row.vouchers_redeemed),
    revenueGenerated: toNumber(row.revenue_generated),
    costPerRedemption: toNumber(row.cost_per_redemption),
    targetDate: row.target_date || '',
    lastContactedDate: row.last_contacted_date || '',
    campaignId: row.campaign_id || '',
    ownerId: row.owner_user_id || '',
    notes: row.notes || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function Partnerships() {
  const { user, userData } = useAuth();
  const { campaigns } = useCampaigns();
  const role = userData?.role;
  const canManagePartnerships = role === 'admin';
  
  const [partnerships, setPartnerships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingPartnership, setEditingPartnership] = useState<any>(null);

  const [formData, setFormData] = useState({
    companyName: '',
    industry: '',
    contactPerson: '',
    position: '',
    phone: '',
    email: '',
    leadSource: '',
    stage: 'Prospect',
    voucherType: 'Digital',
    vouchersAllocated: '',
    targetDate: '',
    campaignId: '',
    notes: ''
  });

  useEffect(() => {
    if (!user) return;
    const fetchPartnerships = async () => {
      const { data, error } = await supabase
        .from('partnerships')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching partnerships:", error);
        setLoading(false);
        return;
      }

      setPartnerships((data || []).map(normalizePartnership));
      setLoading(false);
    };

    void fetchPartnerships();
    const unsubscribe = subscribeToTable('partnerships-page', 'partnerships', () => {
      void fetchPartnerships();
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData || !canManagePartnerships) return;
    try {
      const timestamp = nowIso();
      const { error } = await supabase
        .from('partnerships')
        .insert({
          company_name: formData.companyName.trim(),
          industry: formData.industry.trim(),
          contact_person: formData.contactPerson.trim(),
          position: formData.position.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          lead_source: formData.leadSource.trim(),
          stage: formData.stage,
          voucher_type: formData.voucherType,
          vouchers_allocated: Number(formData.vouchersAllocated) || 0,
          vouchers_redeemed: 0,
          revenue_generated: 0,
          cost_per_redemption: 0,
          target_date: toNullableDate(formData.targetDate),
          last_contacted_date: new Date().toISOString().split('T')[0],
          campaign_id: toNullableUuid(formData.campaignId),
          owner_user_id: userData.id,
          notes: formData.notes.trim(),
          created_at: timestamp,
          updated_at: timestamp
        });

      if (error) throw error;

      setIsCreating(false);
      setFormData({ companyName: '', industry: '', contactPerson: '', position: '', phone: '', email: '', leadSource: '', stage: 'Prospect', voucherType: 'Digital', vouchersAllocated: '', targetDate: '', campaignId: '', notes: '' });
    } catch (error) {
       console.error("Error creating partnership:", error);
       alert("Partnership save failed.");
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartnership || !canManagePartnerships) return;
    try {
      const { error } = await supabase
        .from('partnerships')
        .update({
          company_name: editingPartnership.companyName || '',
          industry: editingPartnership.industry || '',
          contact_person: editingPartnership.contactPerson || '',
          position: editingPartnership.position || '',
          phone: editingPartnership.phone || '',
          email: editingPartnership.email || '',
          lead_source: editingPartnership.leadSource || '',
          stage: editingPartnership.stage || 'Prospect',
          voucher_type: editingPartnership.voucherType || 'Digital',
          vouchers_allocated: Number(editingPartnership.vouchersAllocated) || 0,
          vouchers_redeemed: Number(editingPartnership.vouchersRedeemed) || 0,
          revenue_generated: Number(editingPartnership.revenueGenerated) || 0,
          cost_per_redemption: Number(editingPartnership.costPerRedemption) || 0,
          target_date: toNullableDate(editingPartnership.targetDate),
          last_contacted_date: toNullableDate(editingPartnership.lastContactedDate),
          campaign_id: toNullableUuid(editingPartnership.campaignId),
          notes: editingPartnership.notes || '',
          updated_at: nowIso()
        })
        .eq('id', editingPartnership.id);

      if (error) throw error;

      setEditingPartnership(null);
    } catch (error) {
      console.error("Error updating partnership:", error);
      alert("Partnership update failed.");
    }
  };

  const activePartners = partnerships.filter(p => p.stage === 'Active').length;
  const targetPartners = 30;
  const totalAllocated = partnerships.reduce((sum, p) => sum + (Number(p.vouchersAllocated) || 0), 0);
  const totalRedeemed = partnerships.reduce((sum, p) => sum + (Number(p.vouchersRedeemed) || 0), 0);
  const avgRedemption = totalAllocated > 0 ? ((totalRedeemed / totalAllocated) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Partnerships</h1>
          <p className="text-neutral-500 mt-1">Track partners, leads, and voucher results.</p>
        </div>
        {canManagePartnerships && (
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
            <Plus size={20} /> New Partner
          </button>
        )}
      </header>

      {/* KPI Overview */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
             <Target className="w-6 h-6" />
           </div>
           <div>
             <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">Active</p>
             <p className="text-2xl font-bold text-neutral-900">{activePartners} <span className="text-sm font-medium text-neutral-400">/ {targetPartners} target</span></p>
           </div>
         </div>
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
             <Percent className="w-6 h-6" />
           </div>
           <div>
             <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">Avg. Redemption</p>
             <p className="text-2xl font-bold text-neutral-900">{avgRedemption}%</p>
           </div>
         </div>
         <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
             <Handshake className="w-6 h-6" />
           </div>
           <div>
             <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">Pipeline</p>
             <p className="text-2xl font-bold text-neutral-900">{partnerships.length} <span className="text-sm font-medium text-neutral-400">Leads</span></p>
           </div>
         </div>
      </motion.div>

      {/* List View */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
             <p className="text-neutral-500">Loading pipeline...</p>
          ) : partnerships.length === 0 ? (
             <div className="col-span-full border border-dashed border-neutral-200 rounded-2xl p-12 text-center bg-white">
               <Building className="mx-auto w-12 h-12 text-indigo-200 mb-4" />
               <p className="text-lg font-medium text-neutral-900">No partners yet</p>
               {canManagePartnerships ? (
                 <button onClick={() => setIsCreating(true)} className="text-indigo-600 mt-2 font-medium hover:text-indigo-700">Add first lead</button>
               ) : (
                 <p className="text-sm text-neutral-500 mt-2">Only admins can manage partnership records.</p>
               )}
             </div>
          ) : (
             partnerships.map((p) => {
               let badgeColors = 'bg-neutral-100 text-neutral-600';
               if (p.stage === 'Active') badgeColors = 'bg-emerald-100 text-emerald-700';
               if (p.stage === 'Negotiation') badgeColors = 'bg-amber-100 text-amber-700';
               if (p.stage === 'Contacted' || p.stage === 'Meeting') badgeColors = 'bg-blue-100 text-blue-700';

               const vpAllocated = Number(p.vouchersAllocated) || 0;
               const vpRedeemed = Number(p.vouchersRedeemed) || 0;
               const pRedemptionRate = vpAllocated > 0 ? ((vpRedeemed / vpAllocated) * 100).toFixed(1) : '0.0';

               return (
                 <div
                   key={p.id}
                   onClick={() => {
                     if (canManagePartnerships) {
                       setEditingPartnership(p);
                     }
                   }}
                   className={`bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 transition-all group flex flex-col justify-between ${
                     canManagePartnerships ? 'cursor-pointer hover:shadow-md' : ''
                   }`}
                 >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                         <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${badgeColors}`}>
                            {p.stage}
                         </span>
                         <span className="text-xs font-semibold text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100">
                            {p.voucherType}
                         </span>
                      </div>
                      <h3 className="text-lg font-bold text-neutral-900 mb-1">{p.companyName}</h3>
                      <p className="text-sm text-neutral-500 mb-4">{p.industry}</p>
                      {p.campaignId && <p className="text-xs font-medium text-indigo-600 mb-2 truncate">Campaign: {p.campaignId}</p>}
                    </div>

                    <div className="pt-4 border-t border-neutral-100 space-y-2 mt-2">
                      <div className="flex items-center justify-between text-sm">
                         <span className="text-neutral-500 flex items-center gap-1.5"><Phone className="w-4 h-4"/> {p.contactPerson || 'N/A'}</span>
                         <span className="font-medium text-neutral-900 text-xs truncate max-w-[120px]">{p.phone || p.email || ''}</span>
                      </div>
                      <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-100 mt-2">
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="text-neutral-500">Voucher Redemptions</span>
                          <span className="font-bold text-neutral-900">{vpRedeemed} / {vpAllocated}</span>
                        </div>
                        <div className="w-full bg-neutral-200 rounded-full h-1.5">
                          <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min(Number(pRedemptionRate), 100)}%` }}></div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] mt-2">
                           <span className="text-neutral-500">Rate: <strong className="text-neutral-900">{pRedemptionRate}%</strong></span>
                           <span className="text-emerald-600 font-semibold">+${Number(p.revenueGenerated || 0).toLocaleString()} Rev</span>
                        </div>
                      </div>
                    </div>
                 </div>
               )
             })
          )}
        </div>
      </motion.div>

      {/* Slide-out Create Panel */}
      <AnimatePresence>
        {isCreating && canManagePartnerships && (
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
                  <h3 className="font-bold text-neutral-900 text-lg">Add Partner</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">Lead tracker</p>
                </div>
                <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="partnership-create-form" onSubmit={handleCreateSubmit} className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Company *</label>
                    <input required type="text" value={formData.companyName} onChange={e=>setFormData({...formData, companyName: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Industry</label>
                      <input type="text" placeholder="e.g. Telco" value={formData.industry} onChange={e=>setFormData({...formData, industry: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Stage</label>
                      <select value={formData.stage} onChange={e=>setFormData({...formData, stage: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
                        {['Prospect', 'Contacted', 'Meeting', 'Negotiation', 'Active', 'Rejected'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100">
                    <h4 className="font-semibold text-neutral-900 mb-3 text-sm">Contact</h4>
                    <div className="space-y-3">
                      <input type="text" placeholder="Contact name" value={formData.contactPerson} onChange={e=>setFormData({...formData, contactPerson: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" placeholder="Phone" value={formData.phone} onChange={e=>setFormData({...formData, phone: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
                        <input type="email" placeholder="Email" value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100">
                    <h4 className="font-semibold text-neutral-900 mb-3 text-sm">Voucher plan</h4>
                    <div className="space-y-1 mb-3">
                      <label className="text-sm font-medium text-neutral-700">Campaign</label>
                      <select value={formData.campaignId} onChange={e=>setFormData({...formData, campaignId: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">None / standalone</option>
                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Voucher Type</label>
                        <select value={formData.voucherType} onChange={e=>setFormData({...formData, voucherType: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
                          <option>Physical</option>
                          <option>Digital</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Allocated</label>
                        <input type="number" value={formData.vouchersAllocated} onChange={e=>setFormData({...formData, vouchersAllocated: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>
                  </div>
                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setIsCreating(false)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="partnership-create-form" className="px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg shadow-sm transition-colors">Save Lead</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Slide-out Edit Panel */}
      <AnimatePresence>
        {editingPartnership && canManagePartnerships && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPartnership(null)}
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
                  <h3 className="font-bold text-neutral-900 text-lg">Edit Partner</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">{editingPartnership.companyName}</p>
                </div>
                <button onClick={() => setEditingPartnership(null)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="partnership-update-form" onSubmit={handleUpdateSubmit} className="space-y-6">
                  
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Stage</label>
                    <select value={editingPartnership.stage} onChange={e=>setEditingPartnership({...editingPartnership, stage: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                      {['Prospect', 'Contacted', 'Meeting', 'Negotiation', 'Active', 'Rejected'].map(opt => <option key={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                     <label className="text-sm font-medium text-neutral-700">Campaign</label>
                     <select value={editingPartnership.campaignId || ''} onChange={e=>setEditingPartnership({...editingPartnership, campaignId: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                        <option value="">None / standalone</option>
                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                     </select>
                  </div>
                  
                  <div className="space-y-4 pt-4 border-t border-neutral-100">
                    <h4 className="font-semibold text-neutral-900 border-b border-neutral-100 pb-2">Voucher results</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Allocated</label>
                        <input type="number" value={editingPartnership.vouchersAllocated} onChange={e=>setEditingPartnership({...editingPartnership, vouchersAllocated: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Redeemed</label>
                        <input type="number" value={editingPartnership.vouchersRedeemed} onChange={e=>setEditingPartnership({...editingPartnership, vouchersRedeemed: e.target.value})} className="w-full p-2 bg-amber-50 border border-amber-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-2">
                       <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Revenue ($)</label>
                        <input type="number" value={editingPartnership.revenueGenerated || 0} onChange={e=>setEditingPartnership({...editingPartnership, revenueGenerated: e.target.value})} className="w-full p-2 bg-emerald-50 border border-emerald-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-700 font-bold" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Cost/Redemption ($)</label>
                        <input type="number" value={editingPartnership.costPerRedemption || 0} onChange={e=>setEditingPartnership({...editingPartnership, costPerRedemption: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100">
                    <label className="text-sm font-medium text-neutral-700">Last Contacted Date</label>
                    <input type="date" value={editingPartnership.lastContactedDate || ''} onChange={e=>setEditingPartnership({...editingPartnership, lastContactedDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none mt-1 focus:ring-2 focus:ring-emerald-500" />
                  </div>

                  <div className="pt-2">
                    <label className="text-sm font-medium text-neutral-700">Notes</label>
                    <textarea rows={3} value={editingPartnership.notes || ''} onChange={e=>setEditingPartnership({...editingPartnership, notes: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none mt-1 focus:ring-2 focus:ring-emerald-500" placeholder="E.g. requested physical vouchers..." />
                  </div>

                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingPartnership(null)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="partnership-update-form" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm transition-colors">Save Updates</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
