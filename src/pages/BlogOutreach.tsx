import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Plus, Globe, ExternalLink, PenSquare, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { nowIso, subscribeToTable, toNullableDate, toNullableUuid, toNumber } from '../lib/supabaseData';

function normalizeBlogOutreach(row: any) {
  return {
    id: row.id,
    domain: row.domain || '',
    targetDate: row.target_date || '',
    keywords: row.keywords || '',
    expectedReach: toNumber(row.expected_reach),
    link: row.link || '',
    status: row.status || 'Not Contacted',
    picId: row.pic_user_id || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

type OutreachFeedback = {
  tone: 'success' | 'error';
  message: string;
};

export function BlogOutreach() {
  const { user, userData } = useAuth();
  const role = userData?.role;
  const canManageOutreach = role === 'admin' || role === 'finance';
  const currentAppUserId = toNullableUuid(userData?.id);
  
  const [outreach, setOutreach] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<OutreachFeedback | null>(null);
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingBlog, setEditingBlog] = useState<any>(null);

  const [formData, setFormData] = useState({
    domain: '',
    targetDate: '',
    keywords: '',
    expectedReach: '',
    link: '',
    status: 'Not Contacted'
  });

  useEffect(() => {
    if (!user || !canManageOutreach || !currentAppUserId) {
      setOutreach([]);
      setLoading(false);
      return;
    }

    const fetchOutreach = async () => {
      setLoading(true);
      let request = supabase
        .from('blog_outreach')
        .select('id, domain, target_date, keywords, expected_reach, link, status, pic_user_id, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (role === 'finance') {
        request = request.eq('pic_user_id', currentAppUserId);
      }

      const { data, error } = await request;

      if (error) {
        console.error("Error fetching outreach:", error);
        setFeedback({ tone: 'error', message: 'Failed to load outreach targets.' });
        setLoading(false);
        return;
      }

      setOutreach((data || []).map(normalizeBlogOutreach));
      setLoading(false);
    };

    void fetchOutreach();
    const unsubscribe = subscribeToTable('blog-outreach-page', 'blog_outreach', () => {
      void fetchOutreach();
    });

    return () => unsubscribe();
  }, [user, canManageOutreach, currentAppUserId, role]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canManageOutreach || !currentAppUserId) {
      setFeedback({ tone: 'error', message: 'Active finance/admin profile is required.' });
      return;
    }

    const domain = formData.domain.trim();
    if (!domain) {
      setFeedback({ tone: 'error', message: 'Domain is required.' });
      return;
    }

    try {
      const timestamp = nowIso();
      const { error } = await supabase
        .from('blog_outreach')
        .insert({
          domain,
          target_date: toNullableDate(formData.targetDate),
          keywords: formData.keywords.trim(),
          expected_reach: toNumber(formData.expectedReach),
          link: formData.link.trim(),
          status: formData.status,
          pic_user_id: currentAppUserId,
          created_at: timestamp,
          updated_at: timestamp
        });

      if (error) throw error;

      setIsCreating(false);
      setFormData({ domain: '', targetDate: '', keywords: '', expectedReach: '', link: '', status: 'Not Contacted' });
      setFeedback({ tone: 'success', message: 'Outreach target saved.' });
    } catch (error) {
      console.error("Error creating outreach:", error);
      setFeedback({ tone: 'error', message: 'Failed to track new blog outreach.' });
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const outreachId = toNullableUuid(editingBlog?.id);
    if (!editingBlog || !canManageOutreach || !currentAppUserId || !outreachId) {
      setFeedback({ tone: 'error', message: 'A valid outreach record and active profile are required.' });
      return;
    }

    try {
      let request = supabase
        .from('blog_outreach')
        .update({
          domain: editingBlog.domain || '',
          target_date: toNullableDate(editingBlog.targetDate),
          keywords: editingBlog.keywords || '',
          expected_reach: toNumber(editingBlog.expectedReach),
          link: editingBlog.link || '',
          status: editingBlog.status || 'Not Contacted',
          updated_at: nowIso()
        })
        .eq('id', outreachId);

      if (role === 'finance') {
        request = request.eq('pic_user_id', currentAppUserId);
      }

      const { error } = await request;

      if (error) throw error;

      setEditingBlog(null);
      setFeedback({ tone: 'success', message: 'Outreach target updated.' });
    } catch (error) {
      console.error("Error updating outreach:", error);
      setFeedback({ tone: 'error', message: 'Failed to update outreach.' });
    }
  };

  const publishedCount = outreach.filter(o => o.status === 'Published').length;
  const targetCount = 10;
  
  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Blog Outreach</h1>
          <p className="text-neutral-500 mt-1">Track blog features, SEO keywords, and PR contacts</p>
        </div>
        {canManageOutreach && (
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
            <Plus size={20} /> Add Target
          </button>
        )}
      </header>

      {feedback && (
        <div className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm font-medium ${
          feedback.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}>
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} className="shrink-0 opacity-70 transition-opacity hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Target Tracker */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-100 rounded-2xl p-6 flex items-center justify-between shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-cyan-900 mb-1">Annual Goal Progress</h2>
          <p className="text-sm text-cyan-700">Get featured on {targetCount} high-quality blogs by Dec 31st</p>
        </div>
        <div className="flex items-end gap-2">
           <span className="text-4xl font-extrabold text-cyan-600">{publishedCount}</span>
           <span className="text-lg font-medium text-cyan-500 mb-1">/ {targetCount}</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
             <p className="text-neutral-500">Loading targets...</p>
          ) : outreach.length === 0 ? (
             <div className="col-span-full border border-dashed border-neutral-200 rounded-2xl p-12 text-center bg-white">
               <BookOpen className="mx-auto w-12 h-12 text-cyan-200 mb-4" />
               <p className="text-lg font-medium text-neutral-900">No blogs targeted yet</p>
               {canManageOutreach ? (
                 <button onClick={() => setIsCreating(true)} className="text-cyan-600 mt-2 font-medium hover:text-cyan-700">Add your first PR target</button>
               ) : (
                 <p className="text-sm text-neutral-500 mt-2">Admins and finance users can manage outreach targets.</p>
               )}
             </div>
          ) : (
             outreach.map(blog => (
               <div
                 key={blog.id}
                 onClick={() => {
                   if (canManageOutreach) {
                     setEditingBlog(blog);
                   }
                 }}
                 className={`bg-white p-5 rounded-2xl shadow-sm border border-neutral-100 transition-all group relative flex flex-col justify-between ${
                   canManageOutreach ? 'cursor-pointer hover:shadow-md' : ''
                 }`}
               >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                       <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                         <Globe className="w-4 h-4 text-cyan-500" />
                         {blog.domain}
                       </h3>
                       <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${
                         blog.status === 'Published' ? 'bg-emerald-100 text-emerald-700' :
                         blog.status === 'Negotiating' || blog.status === 'Drafting' ? 'bg-amber-100 text-amber-700' :
                         blog.status === 'Contacted' ? 'bg-blue-100 text-blue-700' :
                         'bg-neutral-100 text-neutral-500'
                       }`}>
                         {blog.status}
                       </span>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div>
                        <p className="text-xs font-semibold text-neutral-400 uppercase">Target Keywords</p>
                        <p className="text-sm font-medium text-neutral-800">{blog.keywords || 'N/A'}</p>
                      </div>
                      <div className="flex justify-between">
                         <div>
                            <p className="text-xs font-semibold text-neutral-400 uppercase">Traffic/Reach</p>
                            <p className="text-sm font-medium text-neutral-800">{Number(blog.expectedReach || 0).toLocaleString()}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-xs font-semibold text-neutral-400 uppercase">Target Date</p>
                            <p className="text-sm font-medium text-neutral-800">{blog.targetDate || 'TBD'}</p>
                         </div>
                      </div>
                    </div>
                  </div>

                  {blog.status === 'Published' && blog.link && (
                     <a href={blog.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="w-full flex items-center justify-center gap-2 py-2 mt-2 bg-cyan-50 border border-cyan-100 rounded-lg text-sm font-medium text-cyan-700 hover:bg-cyan-100 transition-colors">
                        <ExternalLink className="w-4 h-4" /> View Article
                     </a>
                  )}
               </div>
             ))
          )}
        </div>
      </motion.div>

      {/* Slide-out Create Panel */}
      <AnimatePresence>
        {isCreating && canManageOutreach && (
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
                  <h3 className="font-bold text-neutral-900 text-lg">Add Blog Outreach Target</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">PR & SEO Tracker</p>
                </div>
                <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="blog-create-form" onSubmit={handleCreateSubmit} className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Domain / Blog URL *</label>
                    <input required type="text" placeholder="e.g. foodiesmalaysia.com" value={formData.domain} onChange={e=>setFormData({...formData, domain: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Target Keywords for SEO</label>
                    <input type="text" placeholder="e.g. Best Kebab in KL" value={formData.keywords} onChange={e=>setFormData({...formData, keywords: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Expected Reach</label>
                      <input type="number" placeholder="50000" value={formData.expectedReach} onChange={e=>setFormData({...formData, expectedReach: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Outreach Status</label>
                      <select value={formData.status} onChange={e=>setFormData({...formData, status: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500">
                        {['Not Contacted', 'Contacted', 'Negotiating', 'Drafting', 'Published'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1 pt-2 border-t border-neutral-100">
                    <label className="text-sm font-medium text-neutral-700">Target Publication Date</label>
                    <input type="date" value={formData.targetDate} onChange={e=>setFormData({...formData, targetDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500" />
                  </div>
                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setIsCreating(false)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="blog-create-form" className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg shadow-sm transition-colors">Save Target</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Slide-out Edit Panel */}
      <AnimatePresence>
        {editingBlog && canManageOutreach && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingBlog(null)}
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
                  <h3 className="font-bold text-neutral-900 text-lg">Update Outreach</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">{editingBlog.domain}</p>
                </div>
                <button onClick={() => setEditingBlog(null)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="blog-update-form" onSubmit={handleUpdateSubmit} className="space-y-6">
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Status</label>
                        <select value={editingBlog.status} onChange={e=>setEditingBlog({...editingBlog, status: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-medium">
                           {['Not Contacted', 'Contacted', 'Negotiating', 'Drafting', 'Published'].map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                     </div>
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Actual Pub Date</label>
                       <input type="date" value={editingBlog.targetDate} onChange={e=>setEditingBlog({...editingBlog, targetDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                     </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Published Article Link</label>
                    <input type="url" placeholder="https://" value={editingBlog.link || ''} onChange={e=>setEditingBlog({...editingBlog, link: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>

                  <div className="space-y-4 pt-4 border-t border-neutral-100">
                     <h4 className="font-semibold text-neutral-900 border-b border-neutral-100 pb-2">SEO Strategy</h4>
                     
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Target Keywords</label>
                        <input type="text" value={editingBlog.keywords} onChange={e=>setEditingBlog({...editingBlog, keywords: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                     </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Estimated Reach Volume</label>
                        <input type="number" value={editingBlog.expectedReach} onChange={e=>setEditingBlog({...editingBlog, expectedReach: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                     </div>
                  </div>

                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingBlog(null)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="blog-update-form" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm transition-colors">Save Updates</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
