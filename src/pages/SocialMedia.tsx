import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Share2, Plus, Calendar, BarChart2, CheckCircle2, CircleDashed, X } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { useCampaigns } from '../lib/useCampaigns';

export function SocialMedia() {
  const { user, userData } = useAuth();
  const { campaigns } = useCampaigns();
  const role = userData?.role;
  const canManageSocial = role === 'admin' || role === 'supervisor';
  
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);

  const [formData, setFormData] = useState({
    platform: 'Instagram',
    contentType: 'Reel',
    campaignId: '',
    outlet: 'All Outlets',
    publishDate: '',
    status: 'Brief',
    reach: '',
    engagement: '',
    clicks: ''
  });

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'social_posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canManageSocial) return;
    try {
      await addDoc(collection(db, 'social_posts'), {
        ...formData,
        authorId: user.uid,
        reach: Number(formData.reach) || 0,
        engagement: Number(formData.engagement) || 0,
        clicks: Number(formData.clicks) || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsCreating(false);
      setFormData({ platform: 'Instagram', contentType: 'Reel', campaignId: '', outlet: 'All Outlets', publishDate: '', status: 'Brief', reach: '', engagement: '', clicks: '' });
    } catch (error) {
      console.error("Error creating post:", error);
      alert("Failed to create post.");
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost || !canManageSocial) return;
    try {
      const pRef = doc(db, 'social_posts', editingPost.id);
      await updateDoc(pRef, {
        ...editingPost,
        reach: Number(editingPost.reach) || 0,
        engagement: Number(editingPost.engagement) || 0,
        clicks: Number(editingPost.clicks) || 0,
        updatedAt: serverTimestamp()
      });
      setEditingPost(null);
    } catch (error) {
      console.error("Error updating post:", error);
      alert("Failed to update post.");
    }
  };

  const publishedCount = posts.filter(p => p.status === 'Published').length;
  const monthlyTarget = 15;
  const progressPct = Math.min((publishedCount / monthlyTarget) * 100, 100);

  // Compute best format based on highest average engagement
  const formatStats: Record<string, { totalEng: number, count: number }> = {};
  posts.filter(p => p.status === 'Published').forEach(p => {
    if (!formatStats[p.contentType]) formatStats[p.contentType] = { totalEng: 0, count: 0 };
    formatStats[p.contentType].totalEng += Number(p.engagement) || 0;
    formatStats[p.contentType].count += 1;
  });
  
  let bestFormat = 'None';
  let highestAvg = -1;
  Object.keys(formatStats).forEach(format => {
    const avg = formatStats[format].totalEng / formatStats[format].count;
    if (avg > highestAvg) {
      highestAvg = avg;
      bestFormat = format;
    }
  });

  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Social Media Planner</h1>
          <p className="text-neutral-500 mt-1">Manage content pipeline, schedules, and post performance</p>
        </div>
        {canManageSocial && (
          <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-fuchsia-500 hover:bg-fuchsia-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
            <Plus size={20} /> Plan Content
          </button>
        )}
      </header>

      {/* KPI Header section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 md:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-neutral-900">Monthly KPI Tracker</h3>
            <span className="text-xl font-bold">{publishedCount} <span className="text-sm font-medium text-neutral-400">/ {monthlyTarget} Published</span></span>
          </div>
          <div className="w-full bg-neutral-100 rounded-full h-2 mb-2">
            <div className="h-2 rounded-full bg-fuchsia-500 transition-all duration-500" style={{ width: `${progressPct}%` }}></div>
          </div>
          <p className="text-sm text-neutral-500">Target is {monthlyTarget} high-quality content pieces per month.</p>
        </div>
        <div className="bg-fuchsia-50 p-6 rounded-2xl border border-fuchsia-100 flex flex-col justify-center">
           <div className="flex items-center gap-3 text-fuchsia-600 mb-2">
              <BarChart2 className="w-5 h-5" />
              <span className="font-semibold">Best Format</span>
           </div>
           <p className="text-2xl font-bold text-fuchsia-900">{bestFormat}</p>
           <p className="text-sm text-fuchsia-700 mt-1">Highest avg. engagement</p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/50 border-b border-neutral-100 text-sm text-neutral-500">
                  <th className="font-medium px-6 py-4">Publish Date</th>
                  <th className="font-medium px-6 py-4">Platform & Format</th>
                  <th className="font-medium px-6 py-4">Campaign / Outlet</th>
                  <th className="font-medium px-6 py-4">Status</th>
                  <th className="font-medium px-6 py-4 text-right">Reach</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-neutral-500">Loading posts...</td></tr>
                ) : posts.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-neutral-500">{canManageSocial ? 'No content planned yet. Click "Plan Content" to start.' : 'No content planned yet.'}</td></tr>
                ) : (
                  posts.map(post => (
                    <tr
                      key={post.id}
                      onClick={() => {
                        if (canManageSocial) {
                          setEditingPost(post);
                        }
                      }}
                      className={`hover:bg-neutral-50 transition-colors ${canManageSocial ? 'cursor-pointer group' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                          <Calendar className="w-4 h-4 text-neutral-400" />
                          {post.publishDate || 'TBD'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-neutral-900">{post.platform}</p>
                        <p className="text-xs text-neutral-500">{post.contentType}</p>
                      </td>
                      <td className="px-6 py-4">
                        {post.campaignId ? <p className="text-sm text-fuchsia-700 font-medium">Link: {post.campaignId}</p> : <p className="text-sm text-neutral-400">Always On</p>}
                        <p className="text-xs text-neutral-500 mt-0.5">{post.outlet}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          post.status === 'Published' ? 'bg-emerald-100 text-emerald-700' :
                          post.status === 'Scheduled' ? 'bg-indigo-100 text-indigo-700' :
                          'bg-neutral-100 text-neutral-700'
                        }`}>
                          {post.status === 'Published' ? <CheckCircle2 className="w-3 h-3" /> : <CircleDashed className="w-3 h-3" />}
                          {post.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-neutral-600">
                         {post.status === 'Published' ? Number(post.reach || 0).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      {/* Slide-out Create Panel */}
      <AnimatePresence>
        {isCreating && canManageSocial && (
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
                  <h3 className="font-bold text-neutral-900 text-lg">Plan New Content</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">Social Pipeline</p>
                </div>
                <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="post-create-form" onSubmit={handleCreateSubmit} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Platform *</label>
                      <select value={formData.platform} onChange={e=>setFormData({...formData, platform: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-fuchsia-500">
                        {['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Other'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Content Type *</label>
                      <select value={formData.contentType} onChange={e=>setFormData({...formData, contentType: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-fuchsia-500">
                        {['Reel', 'Story', 'Static', 'UGC', 'Promo', 'Educational'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Campaign Tie-in</label>
                    <select value={formData.campaignId} onChange={e=>setFormData({...formData, campaignId: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-fuchsia-500">
                      <option value="">Always On / No Campaign</option>
                      {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Outlet Focus</label>
                       <input type="text" placeholder="All Outlets" value={formData.outlet} onChange={e=>setFormData({...formData, outlet: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-fuchsia-500" />
                     </div>
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Initial Status</label>
                       <select value={formData.status} onChange={e=>setFormData({...formData, status: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-fuchsia-500">
                         {['Brief', 'Draft', 'Editing', 'Scheduled', 'Published'].map(opt => <option key={opt}>{opt}</option>)}
                       </select>
                     </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Planned Publish Date</label>
                    <input type="date" value={formData.publishDate} onChange={e=>setFormData({...formData, publishDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-fuchsia-500" />
                  </div>
                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setIsCreating(false)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="post-create-form" className="px-5 py-2 bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-medium rounded-lg shadow-sm transition-colors">Save to Planner</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Slide-out Edit Panel */}
      <AnimatePresence>
        {editingPost && canManageSocial && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPost(null)}
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
                  <h3 className="font-bold text-neutral-900 text-lg">Update Content Config</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">{editingPost.platform} {editingPost.contentType}</p>
                </div>
                <button onClick={() => setEditingPost(null)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="post-update-form" onSubmit={handleUpdateSubmit} className="space-y-6">
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Production Status</label>
                        <select value={editingPost.status} onChange={e=>setEditingPost({...editingPost, status: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                           {['Brief', 'Draft', 'Editing', 'Scheduled', 'Published'].map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                     </div>
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Actual Publish Date</label>
                       <input type="date" value={editingPost.publishDate} onChange={e=>setEditingPost({...editingPost, publishDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                     </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-neutral-100">
                     <h4 className="font-semibold text-neutral-900 border-b border-neutral-100 pb-2">Post Performance</h4>
                     <p className="text-xs text-neutral-500 mb-2">Update these metrics after the post goes live.</p>

                     <div className="space-y-3">
                        <div className="space-y-1">
                           <label className="text-sm font-medium text-neutral-700">Reach (Total Views)</label>
                           <input type="number" value={editingPost.reach} onChange={e=>setEditingPost({...editingPost, reach: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                              <label className="text-sm font-medium text-neutral-700">Engagement</label>
                              <input type="number" value={editingPost.engagement} onChange={e=>setEditingPost({...editingPost, engagement: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                           </div>
                           <div className="space-y-1">
                              <label className="text-sm font-medium text-neutral-700">Link Clicks</label>
                              <input type="number" value={editingPost.clicks} onChange={e=>setEditingPost({...editingPost, clicks: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                           </div>
                        </div>
                     </div>
                  </div>

                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingPost(null)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="post-update-form" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm transition-colors">Save Updates</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
