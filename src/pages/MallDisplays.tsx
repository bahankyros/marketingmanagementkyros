import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MonitorPlay, Target, ImageIcon, CheckCircle, Clock, X, Upload } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { createPrivateStorageUrl, extractStorageObjectPath } from '../lib/privateStorage';
import { useCampaigns } from '../lib/useCampaigns';
import { supabase } from '../lib/supabase';
import { nowIso, subscribeToTable, toNullableDate, toNullableUuid } from '../lib/supabaseData';

type MasterOutlet = {
  id: string;
  name: string;
};

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

const LEGACY_OUTLET_NAMES = ['Mytown', 'Centrepoint', 'Sogo', 'Empire', 'Setia City Mall', 'Eco Grandeur'];
const SLOTS_PER_OUTLET = 3;

function normalizeMallDisplay(row: any, masterOutlets: MasterOutlet[]) {
  const resolvedOutlet = masterOutlets.find((outlet) => outlet.id === row.outlet_id)
    || masterOutlets.find((outlet) => outlet.name === row.outlet_name)
    || null;
  const outletName = resolvedOutlet?.name || row.outlet_name || '';
  const proofImageUrl = row.proof_image_url || row.photo_proof_url || '';
  const proofImagePath = row.proof_image_path || extractStorageObjectPath('mall-display-proofs', proofImageUrl);

  return {
    id: row.id,
    slotCode: row.slot_code || '',
    outlet_id: row.outlet_id || '',
    outlet_name: outletName,
    outlet: outletName,
    designStatus: row.design_status || 'Not started',
    approvalStatus: row.approval_status || 'Not Submitted',
    currentStatus: row.current_status || 'Draft',
    locationDescription: row.location_description || '',
    campaignId: row.campaign_id || '',
    installationDate: row.installation_date || '',
    mallPicName: row.mall_pic_name || '',
    mallPicContact: row.mall_pic_contact || '',
    remarks: row.remarks || '',
    proofText: row.proof_text || '',
    proofImageUrl,
    proofImagePath,
    photoProof: proofImagePath || proofImageUrl,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function MallDisplays() {
  const { userData } = useAuth();
  const { campaigns } = useCampaigns();
  const [displays, setDisplays] = useState<any[]>([]);
  const [masterOutlets, setMasterOutlets] = useState<MasterOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlot, setEditingSlot] = useState<any>(null);
  const [editingSlotProofUrl, setEditingSlotProofUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const role = userData?.role;
  const isAdmin = role === 'admin';
  const isOutletScopedUser = role === 'supervisor' || role === 'pic';
  const canAccessDisplays = isAdmin || isOutletScopedUser;

  const outletGroups = masterOutlets.length > 0
    ? masterOutlets
    : isAdmin
      ? LEGACY_OUTLET_NAMES.map((name) => ({ id: name, name }))
      : [];

  useEffect(() => {
    const proofSource = editingSlot?.proofImagePath || editingSlot?.photoProof || editingSlot?.proofImageUrl || '';
    if (!proofSource) {
      setEditingSlotProofUrl('');
      return;
    }

    let isMounted = true;
    setEditingSlotProofUrl('');

    createPrivateStorageUrl('mall-display-proofs', proofSource)
      .then((url) => {
        if (isMounted) {
          setEditingSlotProofUrl(url);
        }
      })
      .catch((error) => {
        console.error('Error creating mall display proof signed URL:', error);
        if (isMounted) {
          setEditingSlotProofUrl(/^https?:\/\//i.test(proofSource) ? proofSource : '');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [editingSlot?.proofImagePath, editingSlot?.photoProof, editingSlot?.proofImageUrl]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingSlot || (!isAdmin && !isOutletScopedUser) || (editingSlot.isEmpty && !isAdmin)) return;
    
    setIsUploading(true);
    try {
      const filePath = `${editingSlot.slotCode}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage
        .from('mall-display-proofs')
        .upload(filePath, file);

      if (error) throw error;

      const signedUrl = await createPrivateStorageUrl('mall-display-proofs', filePath);

      setEditingSlotProofUrl(signedUrl);
      setEditingSlot({
        ...editingSlot,
        photoProof: filePath,
        proofImageUrl: '',
        proofImagePath: filePath
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      setFeedback({ tone: 'error', message: 'Photo upload failed.' });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };
  
  // Stats calculation
  const totalSlots = outletGroups.length * SLOTS_PER_OUTLET;
  const activeCount = displays.filter(d => d.currentStatus === 'Installed').length;
  const pendingCount = displays.filter(d => d.approvalStatus === 'Pending').length;
  const designNeededCount = displays.filter(d => (!d.designStatus || d.designStatus === 'Not started' || d.designStatus === 'Needs Design')).length;
  const replaceCount = displays.filter(d => d.currentStatus === 'Expired').length;

  useEffect(() => {
    if (!canAccessDisplays) {
      setMasterOutlets([]);
      return;
    }

    if (isOutletScopedUser && !userData?.outlet_id) {
      setMasterOutlets([]);
      return;
    }

    const fetchOutlets = async () => {
      let request = supabase
        .from('outlets')
        .select('id, name')
        .order('name', { ascending: true });

      if (isOutletScopedUser) {
        request = request.eq('id', userData?.outlet_id || '');
      }

      const { data, error } = await request;

      if (error) {
        console.error('Error fetching outlets for displays:', error);
        return;
      }

      const normalizedOutlets = (data || [])
        .map((outlet) => (
          typeof outlet.name === 'string' && outlet.name.trim()
            ? { id: outlet.id, name: outlet.name.trim() }
            : null
        ))
        .filter((outlet): outlet is MasterOutlet => outlet !== null);

      setMasterOutlets(normalizedOutlets);
    };

    void fetchOutlets();
    const unsubscribeOutlets = subscribeToTable('mall-display-outlets', 'outlets', () => {
      void fetchOutlets();
    });

    return () => {
      unsubscribeOutlets();
    };
  }, [canAccessDisplays, isOutletScopedUser, userData?.outlet_id]);

  useEffect(() => {
    if (!canAccessDisplays) {
      setDisplays([]);
      setLoading(false);
      return;
    }

    if (isOutletScopedUser && !userData?.outlet_id) {
      setDisplays([]);
      setLoading(false);
      return;
    }

    const fetchDisplays = async () => {
      setLoading(true);
      let request = supabase
        .from('mall_displays')
        .select('*')
        .order('slot_code', { ascending: true });

      if (isOutletScopedUser) {
        request = request.eq('outlet_id', userData?.outlet_id || '');
      }

      const { data, error } = await request;

      if (error) {
        console.error("Error fetching mall displays:", error);
        setLoading(false);
        return;
      }

      setDisplays((data || []).map((display) => normalizeMallDisplay(display, masterOutlets)));
      setLoading(false);
    };

    void fetchDisplays();
    const unsubscribeDisplays = subscribeToTable('mall-displays-page', 'mall_displays', () => {
      void fetchDisplays();
    });

    return () => unsubscribeDisplays();
  }, [masterOutlets, canAccessDisplays, isOutletScopedUser, userData?.outlet_id]);

  const buildAdminSlotPayload = (slot: any) => {
    const outletId = toNullableUuid(slot.outlet_id);
    if (!outletId) {
      throw new Error('This display slot needs a Supabase outlet before it can be saved.');
    }
    const proofImagePath = slot.proofImagePath || extractStorageObjectPath('mall-display-proofs', slot.photoProof || slot.proofImageUrl);

    return {
      outlet_id: outletId,
      outlet_name: slot.outlet_name || slot.outlet || '',
      slot_code: slot.slotCode,
      design_status: slot.designStatus || 'Not started',
      approval_status: slot.approvalStatus || 'Not Submitted',
      current_status: slot.currentStatus || 'Draft',
      location_description: slot.locationDescription || '',
      campaign_id: toNullableUuid(slot.campaignId),
      installation_date: toNullableDate(slot.installationDate),
      mall_pic_name: slot.mallPicName || '',
      mall_pic_contact: slot.mallPicContact || '',
      remarks: slot.remarks || '',
      proof_text: slot.proofText || '',
      proof_image_url: '',
      proof_image_path: proofImagePath || '',
      photo_proof_url: proofImagePath || '',
      updated_at: nowIso()
    };
  };

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot) return;

    const isNewSlot = Boolean(editingSlot.isEmpty);
    const canOutletScopedEdit = isOutletScopedUser && !isNewSlot;

    if (!isAdmin && !canOutletScopedEdit) {
      setFeedback({ tone: 'error', message: 'You do not have permission to save this slot.' });
      return;
    }

    try {
      if (isNewSlot) {
        const createPayload = buildAdminSlotPayload(editingSlot);
        const { error } = await supabase
          .from('mall_displays')
          .insert({
          ...createPayload,
          created_at: nowIso()
        });

        if (error) throw error;
      } else if (isAdmin) {
        const adminPayload = buildAdminSlotPayload(editingSlot);
        const request = supabase
          .from('mall_displays')
          .update(adminPayload);
        const { error } = editingSlot.id
          ? await request.eq('id', editingSlot.id)
          : await request.eq('slot_code', editingSlot.slotCode);

        if (error) throw error;
      } else {
        const proofImagePath = editingSlot.proofImagePath || extractStorageObjectPath('mall-display-proofs', editingSlot.photoProof || editingSlot.proofImageUrl);
        const supervisorPayload: Record<string, any> = {
          current_status: editingSlot.currentStatus || 'Draft',
          proof_image_url: '',
          proof_image_path: proofImagePath || '',
          photo_proof_url: proofImagePath || '',
          updated_at: nowIso()
        };

        let request = supabase
          .from('mall_displays')
          .update(supervisorPayload);
        request = editingSlot.id
          ? request.eq('id', editingSlot.id)
          : request.eq('slot_code', editingSlot.slotCode);
        request = request.eq('outlet_id', userData?.outlet_id || '');

        const { error } = await request;

        if (error) throw error;
      }

      setEditingSlot(null);
      setFeedback({ tone: 'success', message: 'Display slot saved.' });
    } catch (error) {
      console.error("Error saving slot:", error);
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Display update failed.' });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Mall Displays</h1>
        <p className="text-neutral-500 mt-1">Manage display slots across key outlets.</p>
      </header>

      {feedback && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          feedback.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}>
          {feedback.message}
        </div>
      )}

      {isOutletScopedUser && !userData?.outlet_id && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your profile is missing an assigned outlet. An admin must assign your outlet before you can manage display proofs.
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        
        {/* Summary stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm flex items-center justify-between">
             <span className="text-sm font-medium text-neutral-500">Active</span>
             <span className="text-lg font-bold text-neutral-900">{activeCount}/{totalSlots}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm flex items-center justify-between">
             <span className="text-sm font-medium text-neutral-500">Pending</span>
             <span className="text-lg font-bold text-neutral-900">{pendingCount}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm flex items-center justify-between">
             <span className="text-sm font-medium text-neutral-500">Need Design</span>
             <span className="text-lg font-bold text-neutral-900">{designNeededCount}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm flex items-center justify-between">
             <span className="text-sm font-medium text-neutral-500">Expired</span>
             <span className="text-lg font-bold text-neutral-900">{replaceCount}</span>
          </div>
        </div>

        {outletGroups.map(outlet => {
          // Filter matching real DB items, but mock exactly 3 empty slots if 0 exist.
          const activeDisplays = displays.filter(d =>
            (d.outlet_id && d.outlet_id === outlet.id) ||
            d.outlet_name === outlet.name ||
            d.outlet === outlet.name
          );
          // Fills the rest of the 3 slots with scaffold
          const slots = Array.from({ length: SLOTS_PER_OUTLET }).map((_, idx) => {
            const code = `${outlet.name.substring(0, 3).toUpperCase()}-0${idx + 1}`;
            const existing = activeDisplays.find(d => d.slotCode === code);
            return existing || {
              slotCode: code,
              outlet_id: outlet.id,
              outlet_name: outlet.name,
              outlet: outlet.name,
              isEmpty: true
            };
          });

          return (
            <div key={outlet.id} className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
              <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
                <h2 className="font-semibold text-neutral-900 flex items-center gap-2"><MonitorPlay className="w-5 h-5 text-blue-500" /> {outlet.name}</h2>
              </div>
              <div className="divide-y divide-neutral-100">
                {slots.map((slot: any) => (
                   <div key={slot.slotCode} className="p-4 px-6 flex flex-col md:flex-row md:items-center justify-between hover:bg-neutral-50 transition-colors gap-4">
                      
                      <div className="flex items-center gap-4 min-w-[200px]">
                        <div className="bg-blue-50 text-blue-700 font-mono text-xs font-bold px-2 py-1 rounded">
                          {slot.slotCode}
                        </div>
                        {slot.isEmpty ? (
                          <span className="text-sm text-neutral-400 italic">Empty slot</span>
                        ) : (
                          <span className="text-sm font-medium text-neutral-900">{slot.campaignId || 'Linked campaign'}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-sm">
                          <p className="text-neutral-500 text-xs">Design</p>
                          <p className="font-medium flex items-center gap-1.5"><ImageIcon className="w-3 h-3 text-neutral-400" /> {slot.designStatus || 'Needs Design'}</p>
                        </div>
                        <div className="text-sm min-w-[120px]">
                          <p className="text-neutral-500 text-xs">Approval</p>
                          <p className="font-medium flex items-center gap-1.5"><CheckCircle className={`w-3 h-3 ${slot.approvalStatus === 'Approved' ? 'text-emerald-500' : 'text-amber-500'}`} /> {slot.approvalStatus || 'Not Submitted'}</p>
                        </div>
                        <div className="text-sm">
                          {(() => {
                            const canOpenSlot = isAdmin || (isOutletScopedUser && !slot.isEmpty);
                            return (
                          <button
                            onClick={() => setEditingSlot({
                              ...slot,
                              outlet_id: slot.outlet_id || outlet.id,
                              outlet_name: slot.outlet_name || outlet.name,
                              outlet: slot.outlet_name || outlet.name,
                              photoProof: slot.photoProof || slot.photoProofUrl || ''
                            })}
                            disabled={!canOpenSlot}
                            className={`px-3 py-1.5 border text-xs font-medium rounded-lg transition-colors ${
                              !canOpenSlot
                                ? 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed'
                                : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                            }`}
                          >
                            {!canOpenSlot ? 'Locked' : 'Edit'}
                          </button>
                            );
                          })()}
                        </div>
                      </div>

                   </div>
                ))}
              </div>
            </div>
          );
        })}

      </motion.div>

      {/* Slide-out Panel */}
      <AnimatePresence>
        {editingSlot && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingSlot(null)}
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
                  <h3 className="font-bold text-neutral-900 text-lg">Edit Slot</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">{editingSlot.slotCode} - {editingSlot.outlet_name || editingSlot.outlet}</p>
                  {!isAdmin && isOutletScopedUser && !editingSlot.isEmpty && (
                    <p className="text-xs text-neutral-400 mt-1">Outlet teams can update status and proof only.</p>
                  )}
                </div>
                <button onClick={() => setEditingSlot(null)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="slot-form" onSubmit={handleSaveSlot} className="space-y-5">
                  {isAdmin && (
                    <>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Mall location</label>
                        <input type="text" placeholder="e.g. Next to North Entrance escalator" value={editingSlot.locationDescription || ''} onChange={e => setEditingSlot({...editingSlot, locationDescription: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Campaign</label>
                        <select value={editingSlot.campaignId || ''} onChange={e => setEditingSlot({...editingSlot, campaignId: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">None</option>
                          {campaigns.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">Design</label>
                          <select value={editingSlot.designStatus || 'Not started'} onChange={e => setEditingSlot({...editingSlot, designStatus: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="Not started">Not started</option>
                            <option value="In design">In design</option>
                            <option value="Ready">Ready</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">Approval</label>
                          <select value={editingSlot.approvalStatus || 'Not Submitted'} onChange={e => setEditingSlot({...editingSlot, approvalStatus: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="Not Submitted">Not Submitted</option>
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Slot status</label>
                      <select value={editingSlot.currentStatus || 'Draft'} onChange={e => setEditingSlot({...editingSlot, currentStatus: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="Draft">Draft</option>
                        <option value="Installed">Installed</option>
                        <option value="Expired">Expired</option>
                      </select>
                    </div>
                    {isAdmin && (
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Installation Date</label>
                        <input type="date" value={editingSlot.installationDate || ''} onChange={e => setEditingSlot({...editingSlot, installationDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="pt-4 border-t border-neutral-100">
                      <h4 className="font-medium text-neutral-900 mb-3">Mall contact</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">PIC name</label>
                          <input type="text" value={editingSlot.mallPicName || ''} onChange={e => setEditingSlot({...editingSlot, mallPicName: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">PIC contact</label>
                          <input type="text" value={editingSlot.mallPicContact || ''} onChange={e => setEditingSlot({...editingSlot, mallPicContact: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-neutral-100">
                     <h4 className="font-medium text-neutral-900 mb-2">Proof photo</h4>
                     <div className="flex items-center gap-4">
                         {editingSlotProofUrl ? (
                            <a href={editingSlotProofUrl} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-xl border border-neutral-200 overflow-hidden block">
                              <img src={editingSlotProofUrl} alt="Proof" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </a>
                         ) : (
                            <div className="w-16 h-16 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center text-neutral-400">
                              <ImageIcon className="w-6 h-6" />
                           </div>
                        )}
                        <div className="flex-1">
                           <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="photo-upload" disabled={isUploading} />
                           <label htmlFor="photo-upload" className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg text-sm font-medium transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed bg-neutral-100' : 'bg-white hover:bg-neutral-50 text-neutral-700'}`}>
                              <Upload className="w-4 h-4" />
                              {isUploading ? 'Uploading...' : 'Upload photo'}
                           </label>
                        </div>
                     </div>
                  </div>
                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setEditingSlot(null)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">
                  Cancel
                </button>
                 <button type="submit" form="slot-form" disabled={!isAdmin && (editingSlot?.isEmpty || !isOutletScopedUser)} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2">
                   <CheckCircle className="w-4 h-4" /> Save
                 </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
