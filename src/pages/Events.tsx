import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImageIcon,
  MapPin,
  Plus,
  Upload,
  X
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { createPrivateStorageUrl, extractStorageObjectPath } from '../lib/privateStorage';
import { supabase } from '../lib/supabase';
import { useCampaigns } from '../lib/useCampaigns';

type EventDecisionStatus = 'Proposed' | 'Reviewing' | 'Approved' | 'Rejected' | 'Completed';

type EventRecord = {
  id: string;
  eventName: string;
  organizer: string;
  outletId: string;
  outlet: string;
  type: string;
  campaignId: string;
  decisionStatus: EventDecisionStatus;
  assignedPic: string;
  actualAttendance: number;
  salesGenerated: number;
  vouchersDistributed: number;
  vouchersRedeemed: number;
  notes: string;
  photos: string;
  startAt: Date;
  endAt: Date;
  proposedDate: string;
  submitterId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type EventEditorState = {
  id: string | null;
  eventName: string;
  organizer: string;
  outletId: string;
  outlet: string;
  type: string;
  campaignId: string;
  decisionStatus: EventDecisionStatus;
  assignedPic: string;
  actualAttendance: string;
  salesGenerated: string;
  vouchersDistributed: string;
  vouchersRedeemed: string;
  notes: string;
  photos: string;
  startAt: string;
  endAt: string;
  submitterId: string;
};

type LinkedTaskStatus = 'assigned' | 'in_progress' | 'proof_submitted' | 'approved' | 'rejected' | 'completed';

type LinkedTaskRecord = {
  id: string;
  title: string;
  event_id: string;
  outlet_id: string;
  assignedToUid: string;
  status: LinkedTaskStatus;
  dueAt: Date | null;
};

type EventHistoryActionType = 'created' | 'updated';

type EventHistoryLogRecord = {
  id: string;
  eventId: string;
  actorUserId: string;
  actionType: string;
  description: string;
  createdAt: Date | null;
};

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

type OutletOption = {
  id: string;
  name: string;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDateTimeLocal(value: Date | string | null | undefined) {
  if (!value) return '';

  const date = value instanceof Date
    ? value
    : new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function parseEventDate(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.includes('T') ? value : `${value}T10:00`;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function toNullableUuid(value: string) {
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function createDefaultEventDate(baseDate?: Date) {
  const seed = baseDate ? new Date(baseDate) : new Date();
  seed.setHours(10, 0, 0, 0);

  const end = new Date(seed);
  end.setHours(end.getHours() + 2);

  return {
    startAt: toDateTimeLocal(seed),
    endAt: toDateTimeLocal(end)
  };
}

function buildEmptyEditor(baseDate?: Date, defaultOutlet?: OutletOption): EventEditorState {
  const dates = createDefaultEventDate(baseDate);

  return {
    id: null,
    eventName: '',
    organizer: '',
    outletId: defaultOutlet?.id || '',
    outlet: defaultOutlet?.name || '',
    type: 'Internal',
    campaignId: '',
    decisionStatus: 'Proposed',
    assignedPic: '',
    actualAttendance: '',
    salesGenerated: '',
    vouchersDistributed: '',
    vouchersRedeemed: '',
    notes: '',
    photos: '',
    startAt: dates.startAt,
    endAt: dates.endAt,
    submitterId: ''
  };
}

function buildEditorFromEvent(event: EventRecord): EventEditorState {
  return {
    id: event.id,
    eventName: event.eventName,
    organizer: event.organizer,
    outletId: event.outletId,
    outlet: event.outlet,
    type: event.type,
    campaignId: event.campaignId,
    decisionStatus: event.decisionStatus,
    assignedPic: event.assignedPic,
    actualAttendance: event.actualAttendance ? event.actualAttendance.toString() : '',
    salesGenerated: event.salesGenerated ? event.salesGenerated.toString() : '',
    vouchersDistributed: event.vouchersDistributed ? event.vouchersDistributed.toString() : '',
    vouchersRedeemed: event.vouchersRedeemed ? event.vouchersRedeemed.toString() : '',
    notes: event.notes,
    photos: event.photos,
    startAt: toDateTimeLocal(event.startAt),
    endAt: toDateTimeLocal(event.endAt),
    submitterId: event.submitterId
  };
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
         left.getMonth() === right.getMonth() &&
         left.getDate() === right.getDate();
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function normalizeEvent(raw: any): EventRecord {
  const fallbackStart = parseEventDate(raw.start_at) || parseEventDate(raw.proposed_date) || new Date();
  const fallbackEnd = parseEventDate(raw.end_at) || new Date(fallbackStart.getTime() + 2 * 60 * 60 * 1000);

  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    eventName: typeof raw.event_name === 'string' ? raw.event_name : '',
    organizer: typeof raw.organizer === 'string' ? raw.organizer : '',
    outletId: typeof raw.outlet_id === 'string' ? raw.outlet_id : '',
    outlet: typeof raw.outlet_name === 'string' ? raw.outlet_name : '',
    type: typeof raw.type === 'string' ? raw.type : 'Internal',
    campaignId: typeof raw.campaign_id === 'string' ? raw.campaign_id : '',
    decisionStatus: (raw.decision_status as EventDecisionStatus) || 'Proposed',
    assignedPic: typeof raw.assigned_pic === 'string' ? raw.assigned_pic : '',
    actualAttendance: Number(raw.actual_attendance) || 0,
    salesGenerated: Number(raw.sales_generated) || 0,
    vouchersDistributed: Number(raw.vouchers_distributed) || 0,
    vouchersRedeemed: Number(raw.vouchers_redeemed) || 0,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    photos: typeof raw.photos === 'string' ? raw.photos : '',
    startAt: fallbackStart,
    endAt: fallbackEnd,
    proposedDate: typeof raw.proposed_date === 'string' && raw.proposed_date
      ? raw.proposed_date
      : formatDateInput(fallbackStart),
    submitterId: typeof raw.submitter_user_id === 'string' ? raw.submitter_user_id : '',
    createdAt: parseEventDate(raw.created_at),
    updatedAt: parseEventDate(raw.updated_at)
  };
}

function normalizeLinkedTask(row: any): LinkedTaskRecord {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    title: typeof row.title === 'string' ? row.title : '',
    event_id: typeof row.event_id === 'string' ? row.event_id : '',
    outlet_id: typeof row.outlet_id === 'string' ? row.outlet_id : '',
    assignedToUid: typeof row.assigned_to_user_id === 'string' ? row.assigned_to_user_id : '',
    status: (row.status as LinkedTaskStatus) || 'assigned',
    dueAt: parseEventDate(row.due_at)
  };
}

function normalizeEventHistoryLog(row: any): EventHistoryLogRecord {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    eventId: typeof row.event_id === 'string' ? row.event_id : '',
    actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : '',
    actionType: typeof row.action_type === 'string' ? row.action_type : '',
    description: typeof row.description === 'string' ? row.description : '',
    createdAt: parseEventDate(row.created_at)
  };
}

function formatHistoryTime(date: Date | null) {
  if (!date) return 'Time not recorded';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function linkedTaskStatusTone(status: LinkedTaskStatus) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'approved':
      return 'bg-blue-100 text-blue-700';
    case 'rejected':
      return 'bg-rose-100 text-rose-700';
    case 'proof_submitted':
      return 'bg-amber-100 text-amber-700';
    case 'in_progress':
      return 'bg-indigo-100 text-indigo-700';
    default:
      return 'bg-neutral-100 text-neutral-700';
  }
}

export function Events() {
  const { user, userData } = useAuth();
  const { campaigns } = useCampaigns();
  const role = userData?.role;
  const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
  const isAdmin = normalizedRole === 'admin';
  const isOutletScopedEventUser = normalizedRole === 'supervisor' || normalizedRole === 'pic';
  const canManageEvents = isAdmin || isOutletScopedEventUser;
  const canViewEvents = isAdmin || isOutletScopedEventUser;
  const canSeeLinkedTasks = isAdmin || isOutletScopedEventUser;

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTaskRecord[]>([]);
  const [historyLogs, setHistoryLogs] = useState<EventHistoryLogRecord[]>([]);
  const [historyLogError, setHistoryLogError] = useState('');
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [editorState, setEditorState] = useState<EventEditorState | null>(null);
  const [eventPhotoUrl, setEventPhotoUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    const photoSource = editorState?.photos || '';
    if (!photoSource) {
      setEventPhotoUrl('');
      return;
    }

    let isMounted = true;
    setEventPhotoUrl('');

    createPrivateStorageUrl('event-proofs', photoSource)
      .then((url) => {
        if (isMounted) {
          setEventPhotoUrl(url);
        }
      })
      .catch((error) => {
        console.error('Error creating event proof signed URL:', error);
        if (isMounted) {
          setEventPhotoUrl(/^https?:\/\//i.test(photoSource) ? photoSource : '');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [editorState?.photos]);

  useEffect(() => {
    if (!user || !canViewEvents) {
      setOutlets([]);
      return;
    }

    if (isOutletScopedEventUser && !userData?.outlet_id) {
      setOutlets([]);
      return;
    }

    let isMounted = true;
    const scopedOutletId = userData?.outlet_id || '';

    const loadOutlets = async () => {
      let request = supabase
        .from('outlets')
        .select('id, name')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (isOutletScopedEventUser) {
        request = request.eq('id', scopedOutletId);
      }

      const { data, error } = await request;

      if (!isMounted) return;

      if (error) {
        console.error('Error loading event outlets:', error);
        setOutlets([]);
        return;
      }

      const normalizedOutlets = (data || [])
        .map((outlet) => {
          const outletName = typeof outlet.name === 'string' ? outlet.name.trim() : '';
          return outlet.id && outletName ? { id: outlet.id, name: outletName } : null;
        })
        .filter((outlet): outlet is OutletOption => outlet !== null);

      setOutlets(normalizedOutlets);
    };

    void loadOutlets();

    const channel = supabase
      .channel('core-ops-event-outlets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outlets' }, () => {
        void loadOutlets();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, userData?.outlet_id, canViewEvents, isOutletScopedEventUser]);

  useEffect(() => {
    if (!user || !canViewEvents) {
      setEvents([]);
      setLoading(false);
      return;
    }

    if (isOutletScopedEventUser && !userData?.outlet_id) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const scopedOutletId = userData?.outlet_id || '';
    let isMounted = true;

    const loadEvents = async () => {
      setLoading(true);

      let request = supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      if (isOutletScopedEventUser) {
        request = request.eq('outlet_id', scopedOutletId);
      }

      const { data, error } = await request;

      if (!isMounted) return;

      if (error) {
        console.error('Error fetching events:', error);
        setLoading(false);
        return;
      }

      const mapped = (data || [])
        .map(normalizeEvent)
        .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());

      setEvents(mapped);
      setLoading(false);
    };

    void loadEvents();

    const channel = supabase
      .channel('core-ops-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        void loadEvents();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, userData?.outlet_id, canViewEvents, isOutletScopedEventUser]);

  useEffect(() => {
    if (!user || !canSeeLinkedTasks) {
      setLinkedTasks([]);
      return;
    }

    if (isOutletScopedEventUser && !userData?.outlet_id) {
      setLinkedTasks([]);
      return;
    }

    const scopedOutletId = userData?.outlet_id || '';
    let isMounted = true;

    const loadLinkedTasks = async () => {
      let request = supabase
        .from('tasks')
        .select('id, title, event_id, outlet_id, assigned_to_user_id, status, due_at, created_at')
        .order('created_at', { ascending: false });

      if (isOutletScopedEventUser) {
        request = request.eq('outlet_id', scopedOutletId);
      }

      const { data, error } = await request;

      if (!isMounted) return;

      if (error) {
        console.error('Error fetching linked tasks:', error);
        setLinkedTasks([]);
        return;
      }

      setLinkedTasks((data || []).map(normalizeLinkedTask));
    };

    void loadLinkedTasks();

    const channel = supabase
      .channel('core-ops-event-linked-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        void loadLinkedTasks();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, userData?.outlet_id, isOutletScopedEventUser, canSeeLinkedTasks]);

  useEffect(() => {
    const selectedEventId = editorState?.id || '';

    if (!user || !canViewEvents || !selectedEventId) {
      setHistoryLogs([]);
      setHistoryLogError('');
      return;
    }

    let isMounted = true;

    const loadHistoryLogs = async () => {
      const { data, error } = await supabase
        .from('event_history_logs')
        .select('id, event_id, actor_user_id, action_type, description, created_at')
        .eq('event_id', selectedEventId)
        .order('created_at', { ascending: false })
        .limit(25);

      if (!isMounted) return;

      if (error) {
        console.error('Error fetching event history logs:', error);
        setHistoryLogError('Activity log failed to load. Check event_history_logs RLS.');
        setHistoryLogs([]);
        return;
      }

      setHistoryLogError('');
      setHistoryLogs((data || []).map(normalizeEventHistoryLog));
    };

    void loadHistoryLogs();

    const channel = supabase
      .channel(`core-ops-event-history-${selectedEventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_history_logs', filter: `event_id=eq.${selectedEventId}` },
        () => {
          void loadHistoryLogs();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, canViewEvents, editorState?.id]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());

    return Array.from({ length: 42 }).map((_, index) => {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + index);
      return cellDate;
    });
  }, [currentMonth]);

  const assignedOutlet = useMemo<OutletOption | undefined>(() => {
    if (!userData?.outlet_id) return undefined;

    const loadedOutlet = outlets.find((outlet) => outlet.id === userData.outlet_id);
    if (loadedOutlet) return loadedOutlet;

    return {
      id: userData.outlet_id,
      name: userData.outlet_name || userData.outlet || userData.outlet_id
    };
  }, [outlets, userData?.outlet, userData?.outlet_id, userData?.outlet_name]);

  const defaultOutletForNewEvent = isOutletScopedEventUser ? assignedOutlet : outlets[0];

  const eventsForCurrentMonth = useMemo(
    () => events.filter((event) => (
      event.startAt.getFullYear() === currentMonth.getFullYear() &&
      event.startAt.getMonth() === currentMonth.getMonth()
    )),
    [events, currentMonth]
  );

  const linkedTaskCountByEventId = useMemo(() => {
    const taskCountMap = new Map<string, number>();

    linkedTasks.forEach((task) => {
      if (!task.event_id) return;
      taskCountMap.set(task.event_id, (taskCountMap.get(task.event_id) || 0) + 1);
    });

    return taskCountMap;
  }, [linkedTasks]);

  const linkedTasksForEditor = useMemo(() => {
    if (!editorState?.id || !canSeeLinkedTasks) return [];
    return linkedTasks
      .filter((task) => task.event_id === editorState.id)
      .sort((left, right) => {
        const leftTime = left.dueAt?.getTime() || 0;
        const rightTime = right.dueAt?.getTime() || 0;
        return leftTime - rightTime;
      });
  }, [editorState?.id, linkedTasks, canSeeLinkedTasks]);

  const writeEventHistoryLog = async (
    eventId: string,
    actionType: EventHistoryActionType,
    eventName: string
  ) => {
    const safeEventId = toNullableUuid(eventId);
    const currentAppUserId = toNullableUuid(userData?.id || '');

    if (!safeEventId || !currentAppUserId) {
      return;
    }

    const actorLabel = isAdmin ? 'Admin' : 'PIC';
    const verb = actionType === 'created' ? 'added' : 'updated';
    const description = `${actorLabel} ${verb} event ${eventName.trim()}`;

    const { error } = await supabase.from('event_history_logs').insert({
      event_id: safeEventId,
      actor_user_id: currentAppUserId,
      action_type: actionType,
      description,
      created_at: nowIso()
    });

    if (error) throw error;
  };

  const openCreateEvent = (baseDate?: Date) => {
    if (!canManageEvents) return;
    if (!defaultOutletForNewEvent?.id) {
      setFeedback({ tone: 'error', message: 'An assigned outlet is required before creating an event.' });
      return;
    }

    setFeedback(null);
    setEditorState(buildEmptyEditor(baseDate, defaultOutletForNewEvent));
  };

  const openExistingEvent = (event: EventRecord) => {
    setFeedback(null);
    setEditorState(buildEditorFromEvent(event));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editorState?.id || !canManageEvents) return;

    setIsUploading(true);
    try {
      const fullPath = `events/${editorState.id}/proofs/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('event-proofs')
        .upload(fullPath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const signedUrl = await createPrivateStorageUrl('event-proofs', fullPath);
      setEventPhotoUrl(signedUrl);
      setEditorState((current) => current ? { ...current, photos: fullPath } : current);
    } catch (error) {
      console.error('Error uploading file:', error);
      setFeedback({ tone: 'error', message: 'Photo upload failed.' });
    } finally {
      event.target.value = '';
      setIsUploading(false);
    }
  };

  const handleSaveEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editorState || !canManageEvents || !userData?.id) return;

    const startDate = new Date(editorState.startAt);
    const endDate = new Date(editorState.endAt);
    const currentAppUserId = toNullableUuid(userData.id);
    const selectedOutletId = isOutletScopedEventUser ? userData.outlet_id : editorState.outletId;
    const outletId = toNullableUuid(selectedOutletId || '');

    if (
      !editorState.eventName.trim() ||
      !editorState.organizer.trim() ||
      !outletId ||
      !currentAppUserId ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      setFeedback({ tone: 'error', message: 'Name, organizer, outlet, and valid times are required.' });
      return;
    }

    const selectedOutlet = outlets.find((outlet) => outlet.id === outletId) || assignedOutlet || null;
    const outletName = selectedOutlet?.name || editorState.outlet.trim();
    if (!outletName) {
      setFeedback({ tone: 'error', message: 'A valid outlet is required.' });
      return;
    }

    const payload = {
      event_name: editorState.eventName.trim(),
      organizer: editorState.organizer.trim(),
      outlet_id: outletId,
      outlet_name: outletName,
      type: editorState.type.trim() || 'Internal',
      campaign_id: toNullableUuid(editorState.campaignId),
      decision_status: isAdmin ? editorState.decisionStatus : editorState.id ? editorState.decisionStatus : 'Proposed',
      assigned_pic: editorState.assignedPic.trim(),
      actual_attendance: Number(editorState.actualAttendance) || 0,
      sales_generated: Number(editorState.salesGenerated) || 0,
      vouchers_distributed: Number(editorState.vouchersDistributed) || 0,
      vouchers_redeemed: Number(editorState.vouchersRedeemed) || 0,
      notes: editorState.notes.trim(),
      photos: extractStorageObjectPath('event-proofs', editorState.photos) || editorState.photos,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      proposed_date: formatDateInput(startDate),
      updated_at: nowIso()
    };

    setSubmitting(true);
    try {
      let savedEventId = editorState.id || '';
      let actionType: EventHistoryActionType = 'updated';

      if (editorState.id) {
        const { error } = await supabase
          .from('events')
          .update(payload)
          .eq('id', editorState.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('events')
          .insert({
            ...payload,
            submitter_user_id: currentAppUserId,
            created_at: nowIso()
          })
          .select('id')
          .single();

        if (error) throw error;
        savedEventId = typeof data?.id === 'string' ? data.id : '';
        actionType = 'created';
      }

      let historyError: unknown = null;
      if (savedEventId) {
        try {
          await writeEventHistoryLog(savedEventId, actionType, payload.event_name);
          setHistoryLogError('');
        } catch (error) {
          historyError = error;
          console.error('Error writing event history log:', error);
          setHistoryLogError('Activity log failed to save. Check event_history_logs RLS.');
        }
      }

      setEditorState(null);
      setFeedback(historyError
        ? { tone: 'error', message: 'Event saved, but the activity log failed. Check event_history_logs RLS.' }
        : { tone: 'success', message: 'Event saved.' });
    } catch (error) {
      console.error('Error saving event:', error);
      setFeedback({ tone: 'error', message: 'Event save failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Event Calendar</h1>
          <p className="mt-1 text-neutral-500">Plan outlet activity on a live calendar.</p>
        </div>
        {canManageEvents ? (
          <button
            type="button"
            onClick={() => openCreateEvent(selectedDate)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-emerald-600"
          >
            <Plus size={18} />
            New Event
          </button>
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-500">
            View only
          </div>
        )}
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

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_0.9fr]"
      >
        <section className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-emerald-500" />
                {currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Admins can manage events. PICs can submit outlet activity.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                className="rounded-lg border border-neutral-200 p-2 text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setCurrentMonth(startOfMonth(today));
                  setSelectedDate(today);
                }}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                className="rounded-lg border border-neutral-200 p-2 text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-neutral-500">Loading calendar...</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-7 gap-2">
                {WEEKDAY_LABELS.map((day) => (
                  <div key={day} className="px-2 py-1 text-xs font-bold uppercase tracking-wider text-neutral-400">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day) => {
                  const dayEvents = events.filter((evt) => isSameDay(evt.startAt, day));
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const isSelected = isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={`${day.toISOString()}-${dayEvents.length}`}
                      type="button"
                      onClick={() => {
                        setSelectedDate(day);
                        if (canManageEvents && dayEvents.length === 0 && isCurrentMonth) {
                          return;
                        }
                      }}
                      className={`min-h-[132px] rounded-2xl border p-3 text-left transition-colors ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-neutral-100 bg-white hover:bg-neutral-50'
                      } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className={`text-sm font-bold ${isToday ? 'text-emerald-600' : 'text-neutral-900'}`}>
                          {day.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                            {dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {dayEvents.slice(0, 2).map((evt) => (
                          <div
                            key={evt.id}
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              openExistingEvent(evt);
                            }}
                            className="rounded-xl border border-neutral-200 bg-white px-2.5 py-2 text-xs shadow-sm"
                          >
                            <p className="font-semibold text-neutral-900 truncate">{evt.eventName}</p>
                            <p className="mt-1 text-neutral-500 truncate">
                              {evt.startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <p className="text-[11px] font-medium text-neutral-500">+{dayEvents.length - 2} more</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-neutral-900">
                Events this month
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                {currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} scheduled activity.
              </p>
            </div>
            {canManageEvents && (
              <button
                type="button"
                onClick={() => openCreateEvent(selectedDate)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                New Event
              </button>
            )}
          </div>

          <div className="space-y-4">
            {eventsForCurrentMonth.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center">
                <Calendar className="mx-auto h-10 w-10 text-neutral-300 mb-4" />
                <p className="text-sm font-medium text-neutral-900">No events this month</p>
                <p className="mt-2 text-sm text-neutral-500">
                  {canManageEvents
                    ? 'Use New Event to create outlet activity with start and end times.'
                    : 'Admins and PICs can add event records to this calendar.'}
                </p>
              </div>
            ) : (
              eventsForCurrentMonth.map((evt) => (
                <button
                  key={evt.id}
                  type="button"
                  onClick={() => openExistingEvent(evt)}
                  className="w-full rounded-2xl border border-neutral-100 p-4 text-left transition-colors hover:bg-neutral-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-neutral-900">{evt.eventName}</p>
                      <p className="mt-1 text-sm text-neutral-500">{evt.organizer || 'No organizer recorded'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      evt.decisionStatus === 'Approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : evt.decisionStatus === 'Reviewing'
                          ? 'bg-blue-100 text-blue-700'
                          : evt.decisionStatus === 'Rejected'
                            ? 'bg-rose-100 text-rose-700'
                            : evt.decisionStatus === 'Completed'
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-amber-100 text-amber-700'
                    }`}>
                      {evt.decisionStatus}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-neutral-500">
                    <p className="flex items-center gap-2">
                      <Clock3 className="w-4 h-4" />
                      {evt.startAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - {evt.startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to {evt.endAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {evt.outlet}
                    </p>
                    <p className="flex items-center gap-2">
                      <Building className="w-4 h-4" />
                      {evt.type}
                    </p>
                    {canSeeLinkedTasks && (
                      <p className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        {linkedTaskCountByEventId.get(evt.id) || 0} linked task{linkedTaskCountByEventId.get(evt.id) === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </motion.div>

      <AnimatePresence>
        {editorState && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditorState(null)}
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
                  <h3 className="font-bold text-neutral-900 text-lg">
                    {editorState.id ? (canManageEvents ? 'Edit Event' : 'Event Details') : 'New Event'}
                  </h3>
                  <p className="text-sm text-neutral-500 font-mono mt-0.5">
                    {editorState.eventName || 'Event record'}
                  </p>
                </div>
                <button onClick={() => setEditorState(null)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <form id="event-form" onSubmit={handleSaveEvent} className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Name</label>
                    <input
                      type="text"
                      value={editorState.eventName}
                      onChange={e => setEditorState({ ...editorState, eventName: e.target.value })}
                      disabled={!canManageEvents}
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Organizer</label>
                      <select
                        value={editorState.organizer}
                        onChange={e => setEditorState({ ...editorState, organizer: e.target.value })}
                        disabled={!canManageEvents}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      >
                        <option value="">Select source</option>
                        <option value="Mall Management">Mall Management</option>
                        <option value="Partner">Partner</option>
                        <option value="Delivery Platform">Delivery Platform</option>
                        <option value="External Organizer">External Organizer</option>
                        <option value="Internal">Internal</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Outlet</label>
                      <select
                        value={editorState.outletId}
                        onChange={e => {
                          const selectedOutlet = outlets.find((outlet) => outlet.id === e.target.value) || null;
                          setEditorState({
                            ...editorState,
                            outletId: e.target.value,
                            outlet: selectedOutlet?.name || ''
                          });
                        }}
                        disabled={!canManageEvents || isOutletScopedEventUser}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      >
                        <option value="">Select outlet</option>
                        {editorState.outletId && !outlets.some((outlet) => outlet.id === editorState.outletId) && (
                          <option value={editorState.outletId}>
                            {editorState.outlet || userData?.outlet_name || editorState.outletId}
                          </option>
                        )}
                        {outlets.map((outlet) => (
                          <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Start</label>
                      <input
                        type="datetime-local"
                        value={editorState.startAt}
                        onChange={e => setEditorState({ ...editorState, startAt: e.target.value })}
                        disabled={!canManageEvents}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">End</label>
                      <input
                        type="datetime-local"
                        value={editorState.endAt}
                        onChange={e => setEditorState({ ...editorState, endAt: e.target.value })}
                        disabled={!canManageEvents}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Type</label>
                      <input
                        type="text"
                        value={editorState.type}
                        onChange={e => setEditorState({ ...editorState, type: e.target.value })}
                        disabled={!canManageEvents}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Campaign</label>
                      <select
                        value={editorState.campaignId}
                        onChange={e => setEditorState({ ...editorState, campaignId: e.target.value })}
                        disabled={!canManageEvents}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      >
                        <option value="">None / standalone</option>
                        {campaigns.map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Status</label>
                    <select
                      value={editorState.decisionStatus}
                      onChange={e => setEditorState({ ...editorState, decisionStatus: e.target.value as EventDecisionStatus })}
                      disabled={!isAdmin}
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                    >
                      <option value="Proposed">Proposed</option>
                      <option value="Reviewing">Reviewing</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Assigned PIC</label>
                    <input
                      type="text"
                      value={editorState.assignedPic}
                      onChange={e => setEditorState({ ...editorState, assignedPic: e.target.value })}
                      disabled={!canManageEvents}
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Attendance</label>
                      <input
                        type="number"
                        value={editorState.actualAttendance}
                        onChange={e => setEditorState({ ...editorState, actualAttendance: e.target.value })}
                        disabled={!canManageEvents}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Sales</label>
                      <input
                        type="number"
                        value={editorState.salesGenerated}
                        onChange={e => setEditorState({ ...editorState, salesGenerated: e.target.value })}
                        disabled={!canManageEvents}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Vouchers Sent</label>
                      <input
                        type="number"
                        value={editorState.vouchersDistributed}
                        onChange={e => setEditorState({ ...editorState, vouchersDistributed: e.target.value })}
                        disabled={!canManageEvents}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Vouchers Used</label>
                      <input
                        type="number"
                        value={editorState.vouchersRedeemed}
                        onChange={e => setEditorState({ ...editorState, vouchersRedeemed: e.target.value })}
                        disabled={!canManageEvents}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Notes</label>
                    <textarea
                      rows={4}
                      value={editorState.notes}
                      onChange={e => setEditorState({ ...editorState, notes: e.target.value })}
                      disabled={!canManageEvents}
                      className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none disabled:bg-neutral-100 disabled:text-neutral-500"
                    />
                  </div>

                  {editorState.id && canSeeLinkedTasks && (
                    <div className="space-y-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">Linked Tasks</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          Tasks linked through <span className="font-mono">tasks.event_id</span>.
                        </p>
                      </div>

                      {linkedTasksForEditor.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-4 text-sm text-neutral-500">
                          No linked tasks yet.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {linkedTasksForEditor.map((task) => (
                            <div key={task.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-neutral-900">{task.title}</p>
                                  <p className="mt-1 text-sm text-neutral-500">
                                    {task.dueAt ? `Due ${task.dueAt.toLocaleString()}` : 'No due date'}
                                  </p>
                                </div>
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${linkedTaskStatusTone(task.status)}`}>
                                  {task.status.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {editorState.id && (
                    <div className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">Recent Activity</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          Latest changes for this event.
                        </p>
                      </div>

                      {historyLogError ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
                          {historyLogError}
                        </div>
                      ) : historyLogs.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
                          No activity recorded yet.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {historyLogs.map((log) => (
                            <div key={log.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-medium text-neutral-900">{log.description || 'Activity recorded'}</p>
                                <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-700">
                                  {log.actionType || 'activity'}
                                </span>
                              </div>
                              <p className="mt-2 text-xs font-medium text-neutral-500">
                                {formatHistoryTime(log.createdAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 pt-2 border-t border-neutral-100">
                    <label className="text-sm font-medium text-neutral-700">Proof photo</label>
                    <div className="flex items-center gap-4">
                      {eventPhotoUrl ? (
                        <a href={eventPhotoUrl} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-xl border border-neutral-200 overflow-hidden block">
                          <img src={eventPhotoUrl} alt="Proof" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </a>
                      ) : (
                        <div className="w-16 h-16 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center text-neutral-400">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}
                      <div className="flex-1">
                        {canManageEvents && editorState.id ? (
                          <>
                            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="event-photo-upload" disabled={isUploading} />
                            <label htmlFor="event-photo-upload" className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg text-sm font-medium transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed bg-neutral-100' : 'bg-white hover:bg-neutral-50 text-neutral-700'}`}>
                              <Upload className="w-4 h-4" />
                            {isUploading ? 'Uploading...' : 'Upload photo'}
                            </label>
                          </>
                        ) : (
                          <p className="text-sm text-neutral-500">
                            {canManageEvents ? 'Save the event before uploading proof.' : 'Admin only.'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setEditorState(null)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">
                  {canManageEvents ? 'Cancel' : 'Close'}
                </button>
                {canManageEvents && (
                  <button
                    type="submit"
                    form="event-form"
                    disabled={submitting || isUploading}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> {submitting ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
