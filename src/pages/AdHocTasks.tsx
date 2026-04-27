import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutList, Plus, AlertCircle, CheckCircle2, Circle, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { nowIso, subscribeToTable, toNullableDate } from '../lib/supabaseData';

function normalizeAdHocTask(row: any) {
  return {
    id: row.id,
    title: row.title || '',
    category: row.category || 'Design Needs',
    status: row.status || 'Open',
    priority: row.priority || 'Normal',
    dueDate: row.due_date || '',
    notes: row.notes || '',
    creatorId: row.creator_user_id || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function AdHocTasks() {
  const { user, userData } = useAuth();
  
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  const [formData, setFormData] = useState({
    title: '',
    category: 'Design Needs',
    status: 'Open',
    priority: 'Normal',
    dueDate: '',
    notes: ''
  });

  useEffect(() => {
    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from('ad_hoc_tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching tasks:", error);
        setLoading(false);
        return;
      }

      setTasks((data || []).map(normalizeAdHocTask));
      setLoading(false);
    };

    void fetchTasks();
    const unsubscribe = subscribeToTable('ad-hoc-tasks-page', 'ad_hoc_tasks', () => {
      void fetchTasks();
    });

    return () => unsubscribe();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData) return;
    try {
      const timestamp = nowIso();
      const { error } = await supabase
        .from('ad_hoc_tasks')
        .insert({
          title: formData.title.trim(),
          category: formData.category,
          status: formData.status,
          priority: formData.priority,
          due_date: toNullableDate(formData.dueDate),
          notes: formData.notes.trim(),
          creator_user_id: userData.id,
          created_at: timestamp,
          updated_at: timestamp
        });

      if (error) throw error;

      setIsCreating(false);
      setFormData({ title: '', category: 'Design Needs', status: 'Open', priority: 'Normal', dueDate: '', notes: '' });
    } catch (error) {
      console.error("Error creating task:", error);
      alert("Failed to track task.");
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    try {
      const { error } = await supabase
        .from('ad_hoc_tasks')
        .update({
          title: editingTask.title || '',
          category: editingTask.category || 'Design Needs',
          status: editingTask.status || 'Open',
          priority: editingTask.priority || 'Normal',
          due_date: toNullableDate(editingTask.dueDate),
          notes: editingTask.notes || '',
          updated_at: nowIso()
        })
        .eq('id', editingTask.id);

      if (error) throw error;

      setEditingTask(null);
    } catch (error) {
      console.error("Error updating task:", error);
      alert("Failed to update task.");
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'Solved': return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'In Progress': return <Circle className="w-5 h-5 text-blue-500 fill-blue-500/20" />;
      case 'Overdue': return <AlertCircle className="w-5 h-5 text-rose-500" />;
      default: return <Circle className="w-5 h-5 text-neutral-300" />;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Ad Hoc Tasks</h1>
          <p className="text-neutral-500 mt-1">Manage secondary requests, missing assets, and approvals</p>
        </div>
        <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
          <Plus size={20} /> New Request
        </button>
      </header>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-6 overflow-hidden">
        <div className="space-y-4">
          {loading ? (
             <p className="text-neutral-500">Loading requests...</p>
          ) : tasks.length === 0 ? (
             <div className="border border-dashed border-neutral-200 rounded-xl p-12 text-center bg-neutral-50">
               <LayoutList className="mx-auto w-10 h-10 text-neutral-300 mb-4" />
               <p className="text-lg font-medium text-neutral-900">No ad hoc requests</p>
               <button onClick={() => setIsCreating(true)} className="text-neutral-600 mt-2 font-medium hover:text-neutral-900">Create a task</button>
             </div>
          ) : (
             tasks.map(task => {
               // Auto-check if overdue simply based on date
               const todayStr = new Date().toISOString().split('T')[0];
               const isOverdue = task.status !== 'Solved' && task.dueDate && task.dueDate < todayStr;
               const finalStatus = isOverdue ? 'Overdue' : task.status;

               return (
               <div key={task.id} onClick={() => setEditingTask(task)} className="flex items-start md:items-center justify-between p-4 border border-neutral-100 rounded-xl hover:bg-neutral-50 transition-colors gap-4 cursor-pointer group">
                  <div className="flex items-start gap-4">
                     <div className="mt-0.5 md:mt-0">{getStatusIcon(finalStatus)}</div>
                     <div>
                       <h3 className={`font-semibold text-neutral-900 group-hover:text-neutral-900 transition-colors ${task.status === 'Solved' ? 'line-through text-neutral-400 font-medium group-hover:text-neutral-500' : ''}`}>{task.title}</h3>
                       <div className="flex flex-wrap items-center gap-2 mt-1">
                         <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 bg-white border border-neutral-200 px-2 py-0.5 rounded shadow-sm">{task.category}</span>
                         <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-sm ${
                            task.priority === 'High' || task.priority === 'Emergency' ? 'bg-rose-100 text-rose-700' : 'bg-neutral-100 text-neutral-600'
                         }`}>{task.priority}</span>
                         {task.dueDate && <span className={`text-xs font-medium ${isOverdue ? 'text-rose-600' : 'text-neutral-500'}`}>Due: {task.dueDate}</span>}
                       </div>
                     </div>
                  </div>
                  <div>
                     <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                       task.status === 'Solved' ? 'bg-emerald-100 text-emerald-700' :
                       isOverdue ? 'bg-rose-100 text-rose-700' :
                       task.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                       'bg-neutral-100 text-neutral-700'
                     }`}>
                       {task.status === 'Solved' ? 'Solved' : isOverdue ? 'Overdue' : task.status}
                     </span>
                  </div>
               </div>
             )})
          )}
        </div>
      </motion.div>

      {/* Slide-out Create Panel */}
      <AnimatePresence>
        {isCreating && (
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
                  <h3 className="font-bold text-neutral-900 text-lg">Create Request</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">Ad Hoc Task</p>
                </div>
                <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="task-create-form" onSubmit={handleCreateSubmit} className="space-y-5">
                  <div className="space-y-1">
                     <label className="text-sm font-medium text-neutral-700">Request Title *</label>
                     <input required type="text" value={formData.title} onChange={e=>setFormData({...formData, title: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Category</label>
                      <select value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900">
                        {['Design Needs', 'Missing Assets', 'Pending Approvals', 'Emergency Issues', 'Mascot Conflicts', 'Other'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Priority Level</label>
                      <select value={formData.priority} onChange={e=>setFormData({...formData, priority: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900">
                        {['Low', 'Normal', 'High', 'Emergency'].map(opt => <option key={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Due Date</label>
                       <input type="date" value={formData.dueDate} onChange={e=>setFormData({...formData, dueDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900" />
                     </div>
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Status</label>
                       <select value={formData.status} onChange={e=>setFormData({...formData, status: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900">
                         {['Open', 'In Progress', 'Solved'].map(opt => <option key={opt}>{opt}</option>)}
                       </select>
                     </div>
                  </div>

                  <div className="space-y-1 pt-2 border-t border-neutral-100">
                    <label className="text-sm font-medium text-neutral-700">Notes / Details</label>
                    <textarea rows={4} value={formData.notes} onChange={e=>setFormData({...formData, notes: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900" placeholder="Provide extra context here..." />
                  </div>
                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setIsCreating(false)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="task-create-form" className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-lg shadow-sm transition-colors">Save Task</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Slide-out Edit Panel */}
      <AnimatePresence>
        {editingTask && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingTask(null)}
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
                  <h3 className="font-bold text-neutral-900 text-lg">Update Action Status</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5 truncate max-w-[200px]">{editingTask.title}</p>
                </div>
                <button onClick={() => setEditingTask(null)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                <form id="task-update-form" onSubmit={handleUpdateSubmit} className="space-y-6">
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Status</label>
                       <select value={editingTask.status} onChange={e=>setEditingTask({...editingTask, status: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold">
                         {['Open', 'In Progress', 'Solved'].map(opt => <option key={opt}>{opt}</option>)}
                       </select>
                     </div>
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Priority</label>
                       <select value={editingTask.priority} onChange={e=>setEditingTask({...editingTask, priority: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                         {['Low', 'Normal', 'High', 'Emergency'].map(opt => <option key={opt}>{opt}</option>)}
                       </select>
                     </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-neutral-100">
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Due Date</label>
                       <input type="date" value={editingTask.dueDate} onChange={e=>setEditingTask({...editingTask, dueDate: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                     </div>
                     <div className="space-y-1">
                       <label className="text-sm font-medium text-neutral-700">Category</label>
                       <select value={editingTask.category} onChange={e=>setEditingTask({...editingTask, category: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                         {['Design Needs', 'Missing Assets', 'Pending Approvals', 'Emergency Issues', 'Mascot Conflicts', 'Other'].map(opt => <option key={opt}>{opt}</option>)}
                       </select>
                     </div>
                  </div>

                  <div className="space-y-1 pt-4 border-t border-neutral-100">
                    <label className="text-sm font-medium text-neutral-700">Notes / Details</label>
                    <textarea rows={4} value={editingTask.notes || ''} onChange={e=>setEditingTask({...editingTask, notes: e.target.value})} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>

                </form>
              </div>
              
              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingTask(null)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" form="task-update-form" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm transition-colors">Save Updates</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
