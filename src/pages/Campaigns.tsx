import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Search, Filter, Calendar, Target, DollarSign,
  Megaphone, Smartphone, ChevronRight, CheckCircle2, Circle, ArrowLeft, CheckSquare, Clock, ImageIcon, Upload, Pencil, Trash2, X, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { createPrivateStorageUrl } from '../lib/privateStorage';
import { supabase } from '../lib/supabase';
import { normalizeCampaign, nowIso, subscribeToTable, toNullableDate, toNullableUuid } from '../lib/supabaseData';

const DIGITAL_CHECKLIST = [
  'Campaign brief ready', 'Offer confirmed', 'Artwork drafted', 'Copy approved', 
  'Budget approved', 'Paid ads setup', 'Social media scheduled', 
  'Delivery platform submission', 'Tracking link prepared', 'Reporting sheet ready'
];

const PHYSICAL_CHECKLIST = [
  'Campaign approved', 'Design prepared', 'Mall approval submitted', 'Material printed', 
  'Logistics arranged', 'Outlet notified', 'PIC assigned', 'Setup date confirmed', 
  'Execution completed', 'Proof photos uploaded', 'Post-campaign report submitted'
];

const CHECKLIST_TEMPLATE_TYPES = ['Digital', 'Physical', 'Hybrid'] as const;

type CampaignFeedback = {
  tone: 'success' | 'error';
  message: string;
};

type ChecklistTemplateType = typeof CHECKLIST_TEMPLATE_TYPES[number];

type CampaignChecklistTemplate = {
  id: string;
  name: string;
  type: ChecklistTemplateType;
  category: string;
  tasks: string[];
};

type CampaignEditFormState = {
  name: string;
  objective: string;
  startDate: string;
  endDate: string;
  budget: string;
  status: string;
};

type CampaignExecutionFlow = 'digital' | 'nonDigital';

type CampaignDisplayMeta = {
  typeLabel: string;
  flow: CampaignExecutionFlow;
  flowLabel: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconContainerClass: string;
  iconClass: string;
  typeBadgeClass: string;
};

const RULE_COMPLIANT_CAMPAIGN_TYPES = new Set([
  'Brand',
  'Promo',
  'Opening',
  'Seasonal',
  'Sampling',
  'Partnership',
  'Digital',
  'Event'
]);

function normalizeCampaignType(campaign: any) {
  const rawType = typeof campaign?.type === 'string' ? campaign.type : '';
  if (RULE_COMPLIANT_CAMPAIGN_TYPES.has(rawType)) {
    return rawType;
  }

  const legacyType = typeof campaign?.campaignType === 'string' ? campaign.campaignType.toLowerCase() : '';
  if (legacyType === 'digital') {
    return 'Digital';
  }

  if (legacyType === 'physical') {
    return 'Promo';
  }

  return 'Promo';
}

function getCampaignExecutionFlow(campaign: any): CampaignExecutionFlow {
  return normalizeCampaignType(campaign) === 'Digital' ? 'digital' : 'nonDigital';
}

function getCampaignDisplayMeta(campaign: any): CampaignDisplayMeta {
  const normalizedType = normalizeCampaignType(campaign);
  const flow = getCampaignExecutionFlow(campaign);

  switch (normalizedType) {
    case 'Digital':
      return {
        typeLabel: normalizedType,
        flow,
        flowLabel: 'Digital workflow',
        Icon: Smartphone,
        iconContainerClass: 'bg-indigo-50',
        iconClass: 'text-indigo-600',
        typeBadgeClass: 'bg-indigo-100 text-indigo-700'
      };
    case 'Event':
      return {
        typeLabel: normalizedType,
        flow,
        flowLabel: 'Non-Digital workflow',
        Icon: Calendar,
        iconContainerClass: 'bg-emerald-50',
        iconClass: 'text-emerald-600',
        typeBadgeClass: 'bg-emerald-100 text-emerald-700'
      };
    case 'Partnership':
      return {
        typeLabel: normalizedType,
        flow,
        flowLabel: 'Non-Digital workflow',
        Icon: Target,
        iconContainerClass: 'bg-cyan-50',
        iconClass: 'text-cyan-600',
        typeBadgeClass: 'bg-cyan-100 text-cyan-700'
      };
    default:
      return {
        typeLabel: normalizedType,
        flow,
        flowLabel: 'Non-Digital workflow',
        Icon: Megaphone,
        iconContainerClass: 'bg-amber-50',
        iconClass: 'text-amber-600',
        typeBadgeClass: 'bg-amber-100 text-amber-700'
      };
  }
}

function buildCampaignEditFormState(campaign: any): CampaignEditFormState {
  const budgetValue = campaign?.budget;
  const hasBudget = budgetValue !== undefined && budgetValue !== null && budgetValue !== '';

  return {
    name: typeof campaign?.name === 'string' ? campaign.name : '',
    objective: typeof campaign?.objective === 'string' ? campaign.objective : '',
    startDate: typeof campaign?.startDate === 'string' ? campaign.startDate : '',
    endDate: typeof campaign?.endDate === 'string' ? campaign.endDate : '',
    budget: hasBudget ? String(budgetValue) : '',
    status: typeof campaign?.status === 'string' ? campaign.status : 'Planning'
  };
}

function isChecklistTemplateType(value: unknown): value is ChecklistTemplateType {
  return typeof value === 'string' && CHECKLIST_TEMPLATE_TYPES.includes(value as ChecklistTemplateType);
}

function sanitizeChecklistTasks(tasks: unknown): string[] {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks.flatMap((task) => {
    if (typeof task !== 'string') {
      return [];
    }

    const trimmedTask = task.trim();
    return trimmedTask ? [trimmedTask] : [];
  });
}

function normalizeChecklistTemplate(template: any): CampaignChecklistTemplate | null {
  const name = typeof template?.name === 'string' ? template.name.trim() : '';
  const category = typeof template?.category === 'string' ? template.category.trim() : '';
  const tasks = sanitizeChecklistTasks(template?.tasks);

  if (!name || !category || !isChecklistTemplateType(template?.type) || tasks.length === 0) {
    return null;
  }

  return {
    id: String(template.id),
    name,
    type: template.type,
    category,
    tasks
  };
}

function normalizeChecklistItem(row: any) {
  return {
    id: row.id,
    task: row.task || '',
    completed: row.completed === true,
    order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function isChecklistTemplateCompatible(formType: 'digital' | 'physical', templateType: ChecklistTemplateType) {
  if (formType === 'digital') {
    return templateType === 'Digital' || templateType === 'Hybrid';
  }

  return templateType === 'Physical' || templateType === 'Hybrid';
}

export function Campaigns() {
  const { user, userData } = useAuth();
  const userRole = userData?.role;
  const isAdmin = userRole === 'admin';
  const canManageCampaigns = isAdmin;
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<CampaignFeedback | null>(null);

  // Detail View State
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [campaignAssetUrl, setCampaignAssetUrl] = useState('');
  const [editingCampaign, setEditingCampaign] = useState<CampaignEditFormState | null>(null);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingCampaign, setIsDeletingCampaign] = useState(false);
  const [checklistTemplates, setChecklistTemplates] = useState<CampaignChecklistTemplate[]>([]);
  const [loadingChecklistTemplates, setLoadingChecklistTemplates] = useState(false);
  const [selectedChecklistTemplateId, setSelectedChecklistTemplateId] = useState('');

  const currentAppUserId = toNullableUuid(userData?.id);

  useEffect(() => {
    const assetSource = selectedCampaign?.assetUrl || '';
    if (!assetSource) {
      setCampaignAssetUrl('');
      return;
    }

    let isMounted = true;
    setCampaignAssetUrl('');

    createPrivateStorageUrl('campaign-assets', assetSource)
      .then((url) => {
        if (isMounted) {
          setCampaignAssetUrl(url);
        }
      })
      .catch((error) => {
        console.error('Error creating campaign asset signed URL:', error);
        if (isMounted) {
          setCampaignAssetUrl(/^https?:\/\//i.test(assetSource) ? assetSource : '');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCampaign?.assetUrl]);

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCampaign || !canManageCampaigns) return;

    const campaignId = toNullableUuid(selectedCampaign.id);
    if (!campaignId) {
      setFeedback({ tone: 'error', message: 'This campaign is missing a valid ID and cannot accept uploads.' });
      e.target.value = '';
      return;
    }
    
    setIsUploading(true);
    try {
      const filePath = `${campaignId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('campaign-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const signedUrl = await createPrivateStorageUrl('campaign-assets', filePath);

      const { error } = await supabase
        .from('campaigns')
        .update({ asset_url: filePath, updated_at: nowIso() })
        .eq('id', campaignId);

      if (error) throw error;
      
      setCampaignAssetUrl(signedUrl);
      setSelectedCampaign({ ...selectedCampaign, assetUrl: filePath });
      setCampaigns(prev => prev.map(camp => camp.id === campaignId ? { ...camp, assetUrl: filePath } : camp));
      setFeedback({ tone: 'success', message: 'Campaign asset uploaded successfully.' });
    } catch (error) {
      console.error("Error uploading file:", error);
      setFeedback({ tone: 'error', message: 'Failed to upload the campaign asset. Please try again.' });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // New Campaign Form State
  const [formType, setFormType] = useState<'digital' | 'physical'>('digital');
  const [formData, setFormData] = useState({
    name: '',
    objective: '',
    startDate: '',
    endDate: '',
    budget: '',
    status: 'Planning'
  });

  // Fetch all campaigns
  useEffect(() => {
    if (!user || !userData) {
      setCampaigns([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const fetchCampaigns = async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching campaigns:", error);
        setLoading(false);
        return;
      }

      setCampaigns((data || []).map(normalizeCampaign));
      setLoading(false);
    };

    void fetchCampaigns();
    const unsubscribe = subscribeToTable('campaigns-page', 'campaigns', () => {
      void fetchCampaigns();
    });

    return () => unsubscribe();
  }, [user, userData]);

  // Fetch checklist when a campaign is selected
  useEffect(() => {
    const campaignId = toNullableUuid(selectedCampaign?.id);
    if (view !== 'detail' || !campaignId || !user || !userData) {
      setChecklist([]);
      return;
    }

    const fetchChecklist = async () => {
      const { data, error } = await supabase
        .from('campaign_checklist_items')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error("Error fetching checklist:", error);
        setChecklist([]);
        return;
      }

      setChecklist((data || []).map(normalizeChecklistItem));
    };

    void fetchChecklist();
    const unsubscribe = subscribeToTable(`campaign-checklist-${campaignId}`, 'campaign_checklist_items', () => {
      void fetchChecklist();
    });

    return () => unsubscribe();
  }, [view, selectedCampaign, user, userData]);

  useEffect(() => {
    if (!user || !canManageCampaigns) {
      setChecklistTemplates([]);
      setSelectedChecklistTemplateId('');
      setLoadingChecklistTemplates(false);
      return;
    }

    if (view !== 'new') {
      setLoadingChecklistTemplates(false);
      return;
    }

    setLoadingChecklistTemplates(true);
    const fetchTemplates = async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('id, name, type, category, checklist_template_items(task, sort_order)')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error("Error fetching checklist templates:", error);
        setLoadingChecklistTemplates(false);
        setFeedback({
          tone: 'error',
          message: 'Checklist templates could not be loaded right now. The default campaign checklist is still available.'
        });
        return;
      }

      const nextTemplates = (data || []).flatMap((template: any) => {
        const tasks = Array.isArray(template.checklist_template_items)
          ? [...template.checklist_template_items]
              .sort((left: any, right: any) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
              .map((item: any) => item.task)
          : [];
        const normalizedTemplate = normalizeChecklistTemplate({ ...template, tasks });
        return normalizedTemplate ? [normalizedTemplate] : [];
      });

      setChecklistTemplates(nextTemplates);
      setLoadingChecklistTemplates(false);
    };

    void fetchTemplates();
    const unsubscribeTemplates = subscribeToTable('campaign-checklist-templates', 'checklist_templates', () => {
      void fetchTemplates();
    });
    const unsubscribeTemplateItems = subscribeToTable('campaign-checklist-template-items', 'checklist_template_items', () => {
      void fetchTemplates();
    });

    return () => {
      unsubscribeTemplates();
      unsubscribeTemplateItems();
    };
  }, [view, user, canManageCampaigns]);

  useEffect(() => {
    if (!selectedChecklistTemplateId) {
      return;
    }

    const selectedTemplate = checklistTemplates.find(template => template.id === selectedChecklistTemplateId);
    if (!selectedTemplate || !isChecklistTemplateCompatible(formType, selectedTemplate.type)) {
      setSelectedChecklistTemplateId('');
    }
  }, [formType, checklistTemplates, selectedChecklistTemplateId]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData || !canManageCampaigns) return;

    if (!currentAppUserId) {
      setFeedback({ tone: 'error', message: 'Your user profile is not ready. Please refresh and try again.' });
      return;
    }

    const name = formData.name.trim();
    const objective = formData.objective.trim();
    if (!name || !objective) {
      setFeedback({ tone: 'error', message: 'Campaign name and objective are required before saving.' });
      return;
    }

    const normalizedBudget = formData.budget.trim() === '' ? 0 : Number(formData.budget);
    if (Number.isNaN(normalizedBudget)) {
      setFeedback({ tone: 'error', message: 'Budget must be a valid number.' });
      return;
    }

    const selectedTemplate = checklistTemplates.find(template => template.id === selectedChecklistTemplateId);
    const items = selectedTemplate?.tasks.length
      ? selectedTemplate.tasks
      : formType === 'digital'
        ? DIGITAL_CHECKLIST
        : PHYSICAL_CHECKLIST;

    try {
      const timestamp = nowIso();
      const { data: campaignRow, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          name,
          objective,
          status: formData.status,
          type: formType === 'digital' ? 'Digital' : 'Promo',
          owner_user_id: currentAppUserId,
          start_date: toNullableDate(formData.startDate),
          end_date: toNullableDate(formData.endDate),
          budget: normalizedBudget,
          created_at: timestamp,
          updated_at: timestamp
        })
        .select('*')
        .single();

      if (campaignError) throw campaignError;

      const campaignId = toNullableUuid(campaignRow?.id);
      if (!campaignId) {
        throw new Error('Campaign was created without a valid ID.');
      }

      const checklistPayload = items.map((taskName, index) => ({
        campaign_id: campaignId,
        task: taskName,
        completed: false,
        sort_order: index,
        created_at: timestamp,
        updated_at: timestamp
      }));

      const { error: checklistError } = await supabase
        .from('campaign_checklist_items')
        .insert(checklistPayload);

      if (checklistError) throw checklistError;

      setView('list');
      setFormData({ name: '', objective: '', startDate: '', endDate: '', budget: '', status: 'Planning' });
      setSelectedChecklistTemplateId('');
      setFeedback({ tone: 'success', message: 'Campaign created successfully.' });
    } catch (error) {
      console.error("Error creating campaign:", error);
      setFeedback({ tone: 'error', message: 'Failed to create campaign. Please verify your permissions and try again.' });
    }
  };

  const handleOpenEditCampaign = () => {
    if (!selectedCampaign || !canManageCampaigns) return;
    setEditingCampaign(buildCampaignEditFormState(selectedCampaign));
  };

  const handleEditCampaignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData || !selectedCampaign || !editingCampaign || !canManageCampaigns) return;

    const campaignId = toNullableUuid(selectedCampaign.id);
    if (!campaignId) {
      setFeedback({ tone: 'error', message: 'This campaign is missing a valid ID and cannot be updated.' });
      return;
    }

    const name = editingCampaign.name.trim();
    const objective = editingCampaign.objective.trim();
    if (!name || !objective) {
      setFeedback({ tone: 'error', message: 'Campaign name and objective are required before saving.' });
      return;
    }

    const normalizedBudget = editingCampaign.budget.trim() === '' ? 0 : Number(editingCampaign.budget);
    if (Number.isNaN(normalizedBudget)) {
      setFeedback({ tone: 'error', message: 'Budget must be a valid number.' });
      return;
    }

    const ownerId = toNullableUuid(selectedCampaign.ownerId) || currentAppUserId;
    if (!ownerId) {
      setFeedback({ tone: 'error', message: 'This campaign is missing a valid owner profile and cannot be updated.' });
      return;
    }

    const normalizedType = normalizeCampaignType(selectedCampaign);
    const updatePayload = {
      name,
      objective,
      status: editingCampaign.status,
      type: normalizedType,
      owner_user_id: ownerId,
      updated_at: nowIso(),
      start_date: toNullableDate(editingCampaign.startDate),
      end_date: toNullableDate(editingCampaign.endDate),
      budget: normalizedBudget
    };

    setIsSavingCampaign(true);
    try {
      const { error } = await supabase
        .from('campaigns')
        .update(updatePayload)
        .eq('id', campaignId);

      if (error) throw error;

      const nextCampaign = {
        ...selectedCampaign,
        name,
        objective,
        status: editingCampaign.status,
        type: normalizedType,
        ownerId,
        startDate: editingCampaign.startDate || '',
        endDate: editingCampaign.endDate || '',
        budget: normalizedBudget
      };

      setSelectedCampaign(nextCampaign);
      setCampaigns(prev => prev.map(camp => camp.id === campaignId ? { ...camp, ...nextCampaign } : camp));
      setEditingCampaign(null);
      setFeedback({ tone: 'success', message: 'Campaign updated successfully.' });
    } catch (error) {
      console.error("Error updating campaign:", error);
      setFeedback({ tone: 'error', message: 'Failed to update this campaign. Please try again.' });
    } finally {
      setIsSavingCampaign(false);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!user) {
      setFeedback({ tone: 'error', message: 'You must be signed in to delete a campaign.' });
      return;
    }

    if (!isAdmin) {
      setFeedback({ tone: 'error', message: 'Only admin users can delete campaigns.' });
      return;
    }

    const campaignId = toNullableUuid(selectedCampaign?.id);
    if (!campaignId) {
      setFeedback({ tone: 'error', message: 'This campaign is missing its document ID and cannot be deleted safely.' });
      return;
    }

    setIsDeletingCampaign(true);
    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      setCampaigns(prev => prev.filter(camp => camp.id !== campaignId));
      setChecklist([]);
      setSelectedCampaign(null);
      setEditingCampaign(null);
      setIsDeleteModalOpen(false);
      setView('list');
      setFeedback({ tone: 'success', message: 'Campaign deleted successfully.' });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      const errorCode = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';

      setFeedback({
        tone: 'error',
        message: errorCode === '42501'
          ? 'Delete was blocked by Supabase row-level security. Confirm this user has the admin role.'
          : 'Failed to delete this campaign. Please try again.'
      });
    } finally {
      setIsDeletingCampaign(false);
    }
  };

  const toggleChecklistItem = async (itemId: string, currentStatus: boolean) => {
    if (!selectedCampaign || !canManageCampaigns) return;

    const campaignId = toNullableUuid(selectedCampaign.id);
    const checklistItemId = toNullableUuid(itemId);
    if (!campaignId || !checklistItemId) {
      setFeedback({ tone: 'error', message: 'This checklist item cannot be updated because its campaign link is invalid.' });
      return;
    }

    try {
      const { error } = await supabase
        .from('campaign_checklist_items')
        .update({ completed: !currentStatus, updated_at: nowIso() })
        .eq('id', checklistItemId)
        .eq('campaign_id', campaignId);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating checklist item:", error);
      setFeedback({ tone: 'error', message: 'Failed to update the checklist item. Please try again.' });
    }
  };

  const handleViewCampaign = (camp: any) => {
    setEditingCampaign(null);
    setIsDeleteModalOpen(false);
    setSelectedCampaign(camp);
    setView('detail');
  };

  const selectedCampaignFlow = selectedCampaign ? getCampaignExecutionFlow(selectedCampaign) : 'nonDigital';
  const selectedCampaignMeta = selectedCampaign ? getCampaignDisplayMeta(selectedCampaign) : null;
  const selectedCampaignBudget = selectedCampaign && selectedCampaign.budget !== undefined && selectedCampaign.budget !== null && selectedCampaign.budget !== ''
    ? Number(selectedCampaign.budget)
    : 0;
  const compatibleChecklistTemplates = checklistTemplates.filter(template => isChecklistTemplateCompatible(formType, template.type));
  const selectedChecklistTemplate = compatibleChecklistTemplates.find(template => template.id === selectedChecklistTemplateId) ?? null;
  const generatedChecklistItems = selectedChecklistTemplate?.tasks.length
    ? selectedChecklistTemplate.tasks
    : formType === 'digital'
      ? DIGITAL_CHECKLIST
      : PHYSICAL_CHECKLIST;
  const campaignTypeLabel = formType === 'digital' ? 'Digital' : 'Non-Digital';

  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            {view === 'detail' ? 'Campaign Details' : 'Campaigns'}
          </h1>
          <p className="text-neutral-500 mt-1">
            {view === 'detail' ? selectedCampaign?.name : 'Manage digital and non-digital marketing campaigns'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {view === 'list' && canManageCampaigns && (
            <button 
              onClick={() => setView('new')}
              className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
            >
              <Plus size={20} />
              New Campaign
            </button>
          )}

          {view === 'detail' && selectedCampaign && userRole === 'admin' && (
            <>
              <button
                type="button"
                onClick={handleOpenEditCampaign}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edit Campaign
              </button>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 rounded-lg text-sm font-medium text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Campaign
              </button>
            </>
          )}
          
          {(view === 'new' || view === 'detail') && (
            <button 
              onClick={() => { setView('list'); setSelectedCampaign(null); setEditingCampaign(null); setIsDeleteModalOpen(false); }}
              className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 font-medium px-4 py-2"
            >
              <ArrowLeft size={18} /> Cancel
            </button>
          )}
        </div>
      </header>

      {feedback && (
        <div className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-4 ${
          feedback.tone === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <p className="text-sm font-medium">{feedback.message}</p>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className={`transition-colors ${
              feedback.tone === 'success'
                ? 'text-emerald-500 hover:text-emerald-700'
                : 'text-rose-500 hover:text-rose-700'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* LIST VIEW */}
      {view === 'list' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Filters Bar */}
          <div className="flex flex-wrap gap-4 bg-white p-2 rounded-xl shadow-sm border border-neutral-100">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-5 h-5" />
              <input type="text" placeholder="Search campaigns..." className="w-full pl-10 pr-4 py-2 bg-neutral-50 border-none rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-sm text-neutral-900" />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-neutral-50 hover:bg-neutral-100 rounded-lg text-sm font-medium text-neutral-600 transition-colors">
              <Filter size={16} /> Filter Status
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <p className="text-neutral-500 p-4">Loading campaigns...</p>
            ) : campaigns.length === 0 ? (
              <div className="col-span-full bg-white rounded-2xl border border-neutral-200 border-dashed p-12 text-center">
                <Megaphone className="mx-auto h-12 w-12 text-neutral-300 mb-4" />
                <h3 className="text-lg font-medium text-neutral-900">No campaigns yet</h3>
                <p className="text-neutral-500 mt-1">Get started by creating a new digital or non-digital campaign.</p>
                {canManageCampaigns ? (
                  <button onClick={() => setView('new')} className="mt-6 inline-flex items-center gap-2 text-rose-600 font-medium hover:text-rose-700">
                    <Plus size={18} /> Create your first campaign
                  </button>
                ) : (
                  <p className="mt-6 text-sm font-medium text-neutral-500">
                    Campaign creation is restricted to admins.
                  </p>
                )}
              </div>
            ) : (
              campaigns.map((camp) => {
                const campaignMeta = getCampaignDisplayMeta(camp);

                return (
                  <button 
                    key={camp.id} 
                    onClick={() => handleViewCampaign(camp)}
                    className="bg-white text-left rounded-2xl shadow-sm border border-neutral-100 p-5 hover:shadow-md transition-shadow group relative overflow-hidden"
                  >
                    <div className={`absolute top-0 left-0 w-1 h-full ${camp.status === 'Active' ? 'bg-emerald-500' : camp.status === 'Completed' ? 'bg-indigo-500' : 'bg-amber-500'}`} />
                    
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                         <div className={`p-2 rounded-lg ${campaignMeta.iconContainerClass}`}>
                           <campaignMeta.Icon className={`w-4 h-4 ${campaignMeta.iconClass}`} />
                         </div>
                         <span className={`text-xs font-semibold px-2 py-1 rounded-full ${campaignMeta.typeBadgeClass}`}>
                           {campaignMeta.typeLabel}
                         </span>
                         <span className="text-xs font-semibold px-2 py-1 bg-neutral-100 text-neutral-600 rounded-full">
                           {camp.status}
                         </span>
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-neutral-900 mb-1 leading-tight">{camp.name}</h3>
                    <p className="text-sm text-neutral-500 line-clamp-2 mb-4 h-10">{camp.objective}</p>

                    <div className="space-y-2 pt-4 border-t border-neutral-100">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-neutral-500"><Calendar className="w-4 h-4" /> Duration</span>
                        <span className="font-medium text-neutral-900">{camp.startDate || '-'} to {camp.endDate || '-'}</span>
                      </div>
                    </div>
                    
                    <div className="absolute bottom-5 right-5 w-8 h-8 flex items-center justify-center bg-neutral-50 text-neutral-400 rounded-full group-hover:bg-rose-50 group-hover:text-rose-600 transition-colors">
                      <ChevronRight size={18} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      )}

      {/* NEW CAMPAIGN FORM VIEW */}
      {view === 'new' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
          <div className="flex border-b border-neutral-100">
             <button 
               className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition-colors ${formType === 'digital' ? 'bg-indigo-50/50 text-indigo-600 border-b-2 border-indigo-600' : 'text-neutral-500 hover:bg-neutral-50'}`}
               onClick={() => setFormType('digital')}
             >
               <Smartphone className="w-5 h-5" /> Digital Campaign Flow
             </button>
             <button 
               className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition-colors ${formType === 'physical' ? 'bg-amber-50/50 text-amber-600 border-b-2 border-amber-600' : 'text-neutral-500 hover:bg-neutral-50'}`}
               onClick={() => setFormType('physical')}
             >
               <Megaphone className="w-5 h-5" /> Non-Digital Campaign Flow
             </button>
          </div>

          <form onSubmit={handleCreateSubmit} className="p-8 space-y-8">
             <div>
                <h3 className="text-lg font-bold text-neutral-900 mb-4 border-b border-neutral-100 pb-2">Basic Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Campaign Name <span className="text-rose-500">*</span></label>
                      <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 transition-all text-neutral-900" placeholder="e.g. Raya Mega Sale" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Objective <span className="text-rose-500">*</span></label>
                      <input required type="text" value={formData.objective} onChange={e => setFormData({...formData, objective: e.target.value})} className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 transition-all text-neutral-900" placeholder="What are we trying to achieve?" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Start Date</label>
                      <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 transition-all text-neutral-900" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">End Date</label>
                      <input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 transition-all text-neutral-900" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Budget (RM)</label>
                      <input type="number" value={formData.budget} onChange={e => setFormData({...formData, budget: e.target.value})} className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 transition-all text-neutral-900" placeholder="e.g. 5000" />
                   </div>
                   <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Initial Status</label>
                      <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 transition-all text-neutral-900">
                         <option value="Planning">Planning</option>
                         <option value="Active">Active</option>
                         <option value="Completed">Completed</option>
                         <option value="Cancelled">Cancelled</option>
                      </select>
                   </div>
                </div>
             </div>

             <div>
               <div className="flex items-center justify-between gap-4 mb-4 border-b border-neutral-100 pb-2">
                 <div>
                   <h3 className="text-lg font-bold text-neutral-900">Checklist Import</h3>
                   <p className="text-sm text-neutral-500 mt-1">Choose a saved template or keep the default checklist for this campaign type.</p>
                 </div>
                 <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-600">
                   {compatibleChecklistTemplates.length} Compatible Templates
                 </div>
               </div>

               <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 space-y-5">
                 <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5">
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-neutral-700">Template Source</label>
                     <select
                       value={selectedChecklistTemplateId}
                       onChange={e => setSelectedChecklistTemplateId(e.target.value)}
                       disabled={loadingChecklistTemplates}
                       className="w-full p-2.5 bg-white border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 transition-all text-neutral-900 disabled:bg-neutral-100"
                     >
                       <option value="">Use default {campaignTypeLabel.toLowerCase()} checklist</option>
                       {compatibleChecklistTemplates.map((template) => (
                         <option key={template.id} value={template.id}>
                           {template.name} ({template.type})
                         </option>
                       ))}
                     </select>
                     <p className="text-xs text-neutral-500 leading-relaxed">
                       {loadingChecklistTemplates
                         ? 'Loading saved checklist templates...'
                         : selectedChecklistTemplate
                           ? `Importing "${selectedChecklistTemplate.name}" will seed ${selectedChecklistTemplate.tasks.length} tasks into the new campaign.`
                           : `No saved template selected. The default ${campaignTypeLabel.toLowerCase()} checklist will be generated instead.`}
                     </p>
                   </div>

                   <div className="rounded-xl border border-white/80 bg-white p-4 shadow-sm">
                     <div className="flex flex-wrap gap-2 mb-3">
                       <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                         formType === 'digital'
                           ? 'bg-indigo-100 text-indigo-700'
                           : 'bg-amber-100 text-amber-700'
                       }`}>
                         {selectedChecklistTemplate ? selectedChecklistTemplate.type : campaignTypeLabel}
                       </span>
                       {selectedChecklistTemplate && (
                         <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600">
                           {selectedChecklistTemplate.category}
                         </span>
                       )}
                       <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                         {generatedChecklistItems.length} Tasks
                       </span>
                     </div>
                     <p className="text-sm font-semibold text-neutral-900">
                       {selectedChecklistTemplate ? selectedChecklistTemplate.name : `${campaignTypeLabel} Default Checklist`}
                     </p>
                     <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                       {selectedChecklistTemplate
                         ? 'This template will replace the built-in starter checklist for the new campaign.'
                         : 'This campaign will use the built-in starter checklist if you do not choose a saved template.'}
                     </p>
                   </div>
                 </div>

                 <div className="rounded-xl border border-neutral-200 bg-white p-4">
                   <div className="flex items-center justify-between gap-4 mb-3">
                     <p className="text-sm font-medium text-neutral-800">Checklist Preview</p>
                     {selectedChecklistTemplate && (
                       <button
                         type="button"
                         onClick={() => setSelectedChecklistTemplateId('')}
                         className="text-xs font-medium text-neutral-500 hover:text-neutral-800 transition-colors"
                       >
                         Revert to Default
                       </button>
                     )}
                   </div>
                   <div className="space-y-2">
                     {generatedChecklistItems.slice(0, 4).map((task, index) => (
                       <div key={`${selectedChecklistTemplate?.id || formType}-preview-${index}`} className="flex items-start gap-3 text-sm text-neutral-600">
                         <div className="w-6 h-6 rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-500 flex items-center justify-center shrink-0 mt-0.5">
                           {index + 1}
                         </div>
                         <p className="leading-6">{task}</p>
                       </div>
                     ))}
                     {generatedChecklistItems.length > 4 && (
                       <p className="text-xs font-medium text-neutral-400 pl-9">
                         +{generatedChecklistItems.length - 4} more tasks will be created
                       </p>
                     )}
                     {!loadingChecklistTemplates && compatibleChecklistTemplates.length === 0 && (
                       <p className="text-xs text-neutral-400 pt-2">
                         No saved templates match the {campaignTypeLabel.toLowerCase()} campaign flow yet.
                       </p>
                     )}
                   </div>
                 </div>
               </div>
             </div>

            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-4">
               <CheckSquare className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
               <p className="text-sm text-emerald-800 leading-relaxed">
                 <strong>Automatic Sub-collection Generation:</strong> Saving will automatically generate the <em>Work Checklist</em> for this campaign using {selectedChecklistTemplate ? `"${selectedChecklistTemplate.name}"` : `the default ${campaignTypeLabel.toLowerCase()} starter template`} with {generatedChecklistItems.length} tasks. You can manage tasks in the Campaign Detail view.
               </p>
             </div>

             <div className="flex justify-end gap-3 pt-6 border-t border-neutral-100">
                <button type="submit" className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-medium rounded-lg transition-colors shadow-sm flex items-center gap-2">
                  <CheckCircle2 size={18} />
                  Save Campaign
                </button>
             </div>
          </form>
        </motion.div>
      )}

      {/* CAMPAIGN DETAIL VIEW */}
      {view === 'detail' && selectedCampaign && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Core Info */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-6">
               <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${selectedCampaignMeta?.iconContainerClass || 'bg-neutral-100'}`}>
                    {selectedCampaignMeta ? (
                      <selectedCampaignMeta.Icon className={`w-5 h-5 ${selectedCampaignMeta.iconClass}`} />
                    ) : (
                      <Megaphone className="w-5 h-5 text-neutral-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-900 leading-tight">{selectedCampaignMeta?.typeLabel || 'Campaign Type'}</h3>
                    <p className="text-xs text-neutral-500 uppercase font-semibold">{selectedCampaignMeta?.flowLabel || (selectedCampaignFlow === 'digital' ? 'Digital workflow' : 'Non-Digital workflow')}</p>
                  </div>
               </div>

               <div className="space-y-4 pt-4 border-t border-neutral-100">
                  <div>
                    <p className="text-xs text-neutral-500 font-semibold uppercase mb-1">Objective</p>
                    <p className="text-sm font-medium text-neutral-900">{selectedCampaign.objective}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-neutral-500 font-semibold uppercase mb-1">Start Date</p>
                      <p className="text-sm font-medium text-neutral-900 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-neutral-400"/>{selectedCampaign.startDate || 'TBD'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 font-semibold uppercase mb-1">End Date</p>
                      <p className="text-sm font-medium text-neutral-900 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-neutral-400"/>{selectedCampaign.endDate || 'TBD'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 font-semibold uppercase mb-1">Allocated Budget</p>
                    <p className="text-lg font-bold text-rose-600">RM {selectedCampaignBudget.toLocaleString()}</p>
                  </div>
               </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-6">
                <h3 className="font-bold text-neutral-900 leading-tight mb-4 flex items-center gap-2">
                   <ImageIcon className="w-5 h-5 text-neutral-400" />
                   Campaign Assets
                </h3>
                <div className="space-y-4">
                   <div className="flex items-center gap-4">
                      {campaignAssetUrl ? (
                         <a href={campaignAssetUrl} target="_blank" rel="noreferrer" className="w-20 h-20 rounded-xl border border-neutral-200 overflow-hidden block shrink-0">
                            <img src={campaignAssetUrl} alt="Asset" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                         </a>
                      ) : (
                         <div className="w-20 h-20 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center text-neutral-400 shrink-0">
                            <ImageIcon className="w-6 h-6" />
                         </div>
                      )}
                      <div className="flex-1">
                         <p className="text-sm font-medium text-neutral-900 mb-1">Key Visual / Bunting</p>
                         <p className="text-xs text-neutral-500 mb-2">Upload the primary artwork for this campaign.</p>
                         {canManageCampaigns ? (
                           <>
                             <input type="file" accept="image/*" onChange={handleAssetUpload} className="hidden" id="campaign-asset-upload" disabled={isUploading} />
                             <label htmlFor="campaign-asset-upload" className={`cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-neutral-200 rounded-lg text-xs font-medium transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed bg-neutral-100' : 'bg-white hover:bg-neutral-50 text-neutral-700'}`}>
                                <Upload className="w-3.5 h-3.5" />
                                {isUploading ? 'Uploading...' : 'Upload File'}
                             </label>
                           </>
                         ) : (
                           <p className="text-xs font-medium text-neutral-400">Admin only</p>
                         )}
                      </div>
                   </div>
                 </div>
            </div>

            {/* Quick KPI placeholders */}
            <div className="bg-neutral-900 rounded-2xl shadow-sm border border-neutral-800 p-6 text-white text-center">
               <Target className="w-8 h-8 text-rose-500 mx-auto mb-3" />
               <p className="font-semibold text-lg mb-1">Live Tracking Analytics</p>
               <p className="text-sm text-neutral-400">ROI data will populate here once the campaign hits active execution.</p>
            </div>
          </div>

          {/* Right Column: Nested Work Checklist */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden flex flex-col h-full">
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
                 <div>
                   <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                     <CheckSquare className="w-5 h-5 text-neutral-400" />
                     Work Checklist
                   </h2>
                   <p className="text-sm text-neutral-500 mt-0.5">Sub-tasks required for deployment</p>
                 </div>
                 <div className="text-sm font-bold px-3 py-1 bg-white border border-neutral-200 rounded-lg text-neutral-600 shadow-sm">
                   {checklist.filter(i => i.completed).length} / {checklist.length} Done
                 </div>
              </div>

              <div className="divide-y divide-neutral-100 p-2 flex-grow overflow-auto max-h-[500px]">
                 {checklist.length === 0 ? (
                    <div className="p-8 text-center text-neutral-500">
                      Loading checklist tasks...
                    </div>
                 ) : (
                    checklist.map(item => (
                      <button 
                         key={item.id}
                         onClick={() => toggleChecklistItem(item.id, item.completed)}
                         disabled={!canManageCampaigns}
                         className={`w-full flex items-center gap-3 p-4 text-left transition-colors rounded-xl group ${canManageCampaigns ? 'hover:bg-neutral-50' : 'cursor-default'} ${item.completed ? 'opacity-60' : ''}`}
                       >
                        <div className="shrink-0">
                          {item.completed ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                          ) : (
                            <Circle className="w-6 h-6 text-neutral-300 group-hover:text-rose-400 transition-colors" />
                          )}
                        </div>
                        <div className="flex-grow">
                           <span className={`text-sm font-medium ${item.completed ? 'line-through text-neutral-500' : 'text-neutral-900'}`}>
                             {item.task}
                           </span>
                        </div>
                      </button>
                    ))
                 )}
              </div>
            </div>
          </div>

        </motion.div>
      )}

      <AnimatePresence>
        {editingCampaign && selectedCampaign && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isSavingCampaign) {
                  setEditingCampaign(null);
                }
              }}
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
                  <h3 className="font-bold text-neutral-900 text-lg">Edit Campaign</h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">{selectedCampaign.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors"
                  disabled={isSavingCampaign}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <form id="campaign-edit-form" onSubmit={handleEditCampaignSubmit} className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Campaign Name *</label>
                    <input
                      required
                      type="text"
                      value={editingCampaign.name}
                      onChange={e => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Objective *</label>
                    <textarea
                      required
                      rows={4}
                      value={editingCampaign.objective}
                      onChange={e => setEditingCampaign({ ...editingCampaign, objective: e.target.value })}
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Start Date</label>
                      <input
                        type="date"
                        value={editingCampaign.startDate}
                        onChange={e => setEditingCampaign({ ...editingCampaign, startDate: e.target.value })}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">End Date</label>
                      <input
                        type="date"
                        value={editingCampaign.endDate}
                        onChange={e => setEditingCampaign({ ...editingCampaign, endDate: e.target.value })}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Budget (RM)</label>
                      <input
                        type="number"
                        min="0"
                        value={editingCampaign.budget}
                        onChange={e => setEditingCampaign({ ...editingCampaign, budget: e.target.value })}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Status</label>
                      <select
                        value={editingCampaign.status}
                        onChange={e => setEditingCampaign({ ...editingCampaign, status: e.target.value })}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="Planning">Planning</option>
                        <option value="Active">Active</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors"
                  disabled={isSavingCampaign}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="campaign-edit-form"
                  disabled={isSavingCampaign}
                  className="px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSavingCampaign ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteModalOpen && selectedCampaign && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isDeletingCampaign) {
                  setIsDeleteModalOpen(false);
                }
              }}
              className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 p-6">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-neutral-900">Delete Campaign</h3>
                <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
                  This will permanently remove <span className="font-semibold text-neutral-800">{selectedCampaign.name}</span> and its checklist items from Supabase. This action cannot be undone.
                </p>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-100 rounded-lg transition-colors"
                    disabled={isDeletingCampaign}
                  >
                    Keep Campaign
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCampaign}
                    disabled={isDeletingCampaign}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isDeletingCampaign ? 'Deleting...' : 'Delete Permanently'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
