import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileImage,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Upload,
  UserRound,
  X
} from 'lucide-react';
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';

type TaskType = 'mall_display' | 'voucher_follow_up' | 'general';
type TaskStatus = 'assigned' | 'in_progress' | 'proof_submitted' | 'approved' | 'rejected' | 'completed';

type TaskRecord = {
  id: string;
  title: string;
  description: string;
  outlet_id: string;
  assignedByUid: string;
  assignedToUid: string;
  taskType: TaskType;
  event_id: string;
  status: TaskStatus;
  dueAt: Timestamp | null;
  proofText: string;
  proofImageUrl: string;
  proofImagePath: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

type SupervisorOption = {
  uid: string;
  displayName: string;
  email: string;
  outletId: string;
  outletName: string;
};

type EventOption = {
  id: string;
  eventName: string;
  outlet: string;
  startAt: Date | null;
  endAt: Date | null;
};

type TaskCreateFormState = {
  title: string;
  description: string;
  taskType: TaskType;
  assignedToUid: string;
  outletId: string;
  outletName: string;
  eventId: string;
  dueAt: string;
};

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

type UploadState =
  | { status: 'idle'; url: string; path: string; error: string | null }
  | { status: 'uploading'; url: string; path: string; error: string | null }
  | { status: 'uploaded'; url: string; path: string; error: string | null }
  | { status: 'error'; url: string; path: string; error: string | null };

function toDateTimeLocal(value: Timestamp | Date | string | null | undefined) {
  if (!value) return '';

  const date = value instanceof Timestamp
    ? value.toDate()
    : value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function parseEventDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function eventMatchesOutlet(event: EventOption, outletId: string, outletName: string) {
  const normalizedEventOutlet = event.outlet.trim().toLowerCase();
  if (!normalizedEventOutlet) return false;

  return [outletId, outletName]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .some((value) => value === normalizedEventOutlet);
}

function formatEventOptionLabel(event: EventOption) {
  const timeLabel = event.startAt
    ? event.startAt.toLocaleString([], {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'No schedule';

  return `${event.eventName} (${timeLabel})`;
}

function buildDefaultCreateForm() {
  return {
    title: '',
    description: '',
    taskType: 'general' as TaskType,
    assignedToUid: '',
    outletId: '',
    outletName: '',
    eventId: '',
    dueAt: ''
  };
}

function buildUploadState(url = '', path = ''): UploadState {
  return url && path
    ? { status: 'uploaded', url, path, error: null }
    : { status: 'idle', url: '', path: '', error: null };
}

function statusTone(status: TaskStatus) {
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

export function Tasks() {
  const { user, userData } = useAuth();
  const role = userData?.role;
  const isAdmin = role === 'admin';
  const isSupervisor = role === 'supervisor';

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [createForm, setCreateForm] = useState<TaskCreateFormState>(buildDefaultCreateForm());
  const [supervisorStatus, setSupervisorStatus] = useState<'in_progress' | 'proof_submitted'>('in_progress');
  const [proofTextDraft, setProofTextDraft] = useState('');
  const [adminReviewStatus, setAdminReviewStatus] = useState<'approved' | 'rejected' | 'completed'>('approved');
  const [proofUpload, setProofUpload] = useState<UploadState>(buildUploadState());
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !userData) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const tasksQuery = isAdmin
      ? query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'tasks'), where('assignedToUid', '==', user.uid));

    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const normalized = snapshot.docs
        .map((taskDoc) => {
          const taskData = taskDoc.data();
          return {
            id: taskDoc.id,
            title: typeof taskData.title === 'string' ? taskData.title : '',
            description: typeof taskData.description === 'string' ? taskData.description : '',
            outlet_id: typeof taskData.outlet_id === 'string' ? taskData.outlet_id : '',
            assignedByUid: typeof taskData.assignedByUid === 'string' ? taskData.assignedByUid : '',
            assignedToUid: typeof taskData.assignedToUid === 'string' ? taskData.assignedToUid : '',
            taskType: taskData.taskType as TaskType,
            event_id: typeof taskData.event_id === 'string' ? taskData.event_id : '',
            status: taskData.status as TaskStatus,
            dueAt: taskData.dueAt instanceof Timestamp ? taskData.dueAt : null,
            proofText: typeof taskData.proofText === 'string' ? taskData.proofText : '',
            proofImageUrl: typeof taskData.proofImageUrl === 'string' ? taskData.proofImageUrl : '',
            proofImagePath: typeof taskData.proofImagePath === 'string' ? taskData.proofImagePath : '',
            createdAt: taskData.createdAt instanceof Timestamp ? taskData.createdAt : null,
            updatedAt: taskData.updatedAt instanceof Timestamp ? taskData.updatedAt : null
          };
        })
        .sort((left, right) => {
          const leftTime = left.createdAt?.toMillis() || 0;
          const rightTime = right.createdAt?.toMillis() || 0;
          return rightTime - leftTime;
        });

      setTasks(normalized);
      setLoading(false);
    }, (error) => {
      console.error('Error loading tasks:', error);
      setFeedback({ tone: 'error', message: 'Failed to load tasks.' });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, userData, isAdmin]);

  useEffect(() => {
    if (!user || !userData) {
      setEvents([]);
      return;
    }

    const unsubscribe = onSnapshot(query(collection(db, 'events'), orderBy('createdAt', 'desc')), (snapshot) => {
      const normalized = snapshot.docs
        .map((eventDoc) => {
          const eventData = eventDoc.data();
          return {
            id: eventDoc.id,
            eventName: typeof eventData.eventName === 'string' ? eventData.eventName : '',
            outlet: typeof eventData.outlet === 'string' ? eventData.outlet : '',
            startAt: parseEventDate(eventData.startAt) || parseEventDate(eventData.proposedDate),
            endAt: parseEventDate(eventData.endAt)
          } satisfies EventOption;
        })
        .filter((event) => event.eventName.trim())
        .sort((left, right) => {
          const leftTime = left.startAt?.getTime() || 0;
          const rightTime = right.startAt?.getTime() || 0;
          return leftTime - rightTime;
        });

      setEvents(normalized);
    }, (error) => {
      console.error('Error loading events for task linking:', error);
      setFeedback({ tone: 'error', message: 'Failed to load linked events.' });
    });

    return () => unsubscribe();
  }, [user, userData]);

  useEffect(() => {
    if (!user || !isAdmin) {
      setSupervisors([]);
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const normalized = snapshot.docs
        .map((userDoc) => {
          const profile = userDoc.data();
          const authUid = typeof profile.auth_uid === 'string' ? profile.auth_uid.trim() : '';
          const outletId = typeof profile.outlet_id === 'string' ? profile.outlet_id.trim() : '';
          const outletName = typeof profile.outlet_name === 'string' ? profile.outlet_name.trim() : '';
          const displayName = typeof profile.display_name === 'string' && profile.display_name.trim()
            ? profile.display_name.trim()
            : (typeof profile.email === 'string' ? profile.email.trim() : userDoc.id);

          if (
            profile.role !== 'supervisor' ||
            profile.status !== 'active' ||
            !authUid ||
            !outletId
          ) {
            return null;
          }

          return {
            uid: authUid,
            displayName,
            email: typeof profile.email === 'string' ? profile.email.trim() : '',
            outletId,
            outletName: outletName || outletId
          };
        })
        .filter((supervisor): supervisor is SupervisorOption => supervisor !== null)
        .sort((left, right) => left.displayName.localeCompare(right.displayName));

      setSupervisors(normalized);
    }, (error) => {
      console.error('Error loading supervisors:', error);
      setFeedback({ tone: 'error', message: 'Failed to load supervisors.' });
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  const supervisorMap = useMemo(
    () => new Map(supervisors.map((supervisor) => [supervisor.uid, supervisor])),
    [supervisors]
  );

  const eventsMap = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events]
  );

  const availableEventsForCreate = useMemo(
    () => events.filter((event) => eventMatchesOutlet(event, createForm.outletId, createForm.outletName)),
    [events, createForm.outletId, createForm.outletName]
  );

  const outletLabelForTask = (task: TaskRecord) => {
    if (isSupervisor && userData?.outlet_id === task.outlet_id) {
      return userData.outlet_name || task.outlet_id;
    }

    return supervisorMap.get(task.assignedToUid)?.outletName || task.outlet_id;
  };

  const assigneeLabelForTask = (task: TaskRecord) => {
    const supervisor = supervisorMap.get(task.assignedToUid);
    return supervisor ? supervisor.displayName : task.assignedToUid;
  };

  const openTaskPanel = (task: TaskRecord) => {
    setSelectedTask(task);
    setSupervisorStatus(task.status === 'proof_submitted' ? 'proof_submitted' : 'in_progress');
    setProofTextDraft(task.proofText);
    setAdminReviewStatus(task.status === 'rejected' ? 'rejected' : task.status === 'completed' ? 'completed' : 'approved');
    setProofUpload(buildUploadState(task.proofImageUrl, task.proofImagePath));
    setFeedback(null);
  };

  const handleCreateAssigneeChange = (nextUid: string) => {
    const supervisor = supervisorMap.get(nextUid);
    setCreateForm((current) => ({
      ...current,
      assignedToUid: nextUid,
      outletId: supervisor?.outletId || '',
      outletName: supervisor?.outletName || '',
      eventId: ''
    }));
  };

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || !user) return;

    const dueDate = new Date(createForm.dueAt);
    const linkedEvent = createForm.eventId ? eventsMap.get(createForm.eventId) || null : null;
    if (!createForm.title.trim() || !createForm.assignedToUid || !createForm.outletId || Number.isNaN(dueDate.getTime())) {
      setFeedback({ tone: 'error', message: 'Title, supervisor, outlet, and due date are required.' });
      return;
    }

    if (createForm.eventId && (!linkedEvent || !eventMatchesOutlet(linkedEvent, createForm.outletId, createForm.outletName))) {
      setFeedback({ tone: 'error', message: 'Pick a linked event for the same outlet.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await addDoc(collection(db, 'tasks'), {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        outlet_id: createForm.outletId,
        assignedByUid: user.uid,
        assignedToUid: createForm.assignedToUid,
        taskType: createForm.taskType,
        event_id: createForm.eventId,
        status: 'assigned',
        dueAt: Timestamp.fromDate(dueDate),
        proofText: '',
        proofImageUrl: '',
        proofImagePath: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setIsCreateOpen(false);
      setCreateForm(buildDefaultCreateForm());
      setFeedback({ tone: 'success', message: 'Task assigned.' });
    } catch (error) {
      console.error('Error creating task:', error);
      setFeedback({ tone: 'error', message: 'Failed to assign task.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleProofUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedTask) return;

    setProofUpload((current) => ({ ...current, status: 'uploading', error: null }));
    try {
      const fullPath = `tasks/${selectedTask.id}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, fullPath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setProofUpload({ status: 'uploaded', url, path: fullPath, error: null });
    } catch (error) {
      console.error('Error uploading task proof:', error);
      setProofUpload({ status: 'error', url: '', path: '', error: 'Proof upload failed.' });
    } finally {
      event.target.value = '';
    }
  };

  const handleSupervisorSave = async () => {
    if (!selectedTask) return;
    if (supervisorStatus === 'proof_submitted' && !proofTextDraft.trim()) {
      setFeedback({ tone: 'error', message: 'Add proof details before submitting.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await updateDoc(doc(db, 'tasks', selectedTask.id), {
        status: supervisorStatus,
        proofText: proofTextDraft.trim(),
        proofImageUrl: proofUpload.url || selectedTask.proofImageUrl || '',
        proofImagePath: proofUpload.path || selectedTask.proofImagePath || '',
        updatedAt: serverTimestamp()
      });

      setSelectedTask(null);
      setFeedback({
        tone: 'success',
        message: supervisorStatus === 'proof_submitted'
          ? 'Proof sent for review.'
          : 'Task marked in progress.'
      });
    } catch (error) {
      console.error('Error updating task progress:', error);
      setFeedback({ tone: 'error', message: 'Failed to update progress.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminReview = async () => {
    if (!selectedTask) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      await updateDoc(doc(db, 'tasks', selectedTask.id), {
        title: selectedTask.title,
        description: selectedTask.description,
        outlet_id: selectedTask.outlet_id,
        assignedByUid: selectedTask.assignedByUid,
        assignedToUid: selectedTask.assignedToUid,
        taskType: selectedTask.taskType,
        event_id: selectedTask.event_id,
        status: adminReviewStatus,
        dueAt: selectedTask.dueAt,
        proofText: selectedTask.proofText,
        proofImageUrl: selectedTask.proofImageUrl,
        proofImagePath: selectedTask.proofImagePath,
        createdAt: selectedTask.createdAt,
        updatedAt: serverTimestamp()
      });

      setSelectedTask(null);
      setFeedback({ tone: 'success', message: `Task marked ${adminReviewStatus.replace('_', ' ')}.` });
    } catch (error) {
      console.error('Error reviewing task:', error);
      setFeedback({ tone: 'error', message: 'Failed to save review.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Tasks</h1>
          <p className="mt-1 text-neutral-500">Assign work, collect proof, and review completion.</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setCreateForm(buildDefaultCreateForm());
              setFeedback(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            <Plus size={18} />
            Assign Task
          </button>
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
        className="grid grid-cols-1 gap-6 md:grid-cols-3"
      >
        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Total Tasks</p>
              <p className="text-2xl font-bold text-neutral-900">{tasks.length}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">Tasks shown for your role.</p>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <LoaderCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Awaiting Review</p>
              <p className="text-2xl font-bold text-neutral-900">
                {tasks.filter((task) => task.status === 'proof_submitted').length}
              </p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">Proof-submitted tasks waiting for an admin decision.</p>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Completed</p>
              <p className="text-2xl font-bold text-neutral-900">
                {tasks.filter((task) => task.status === 'completed').length}
              </p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">Tasks fully closed after review and operational completion.</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm"
      >
        {loading ? (
          <p className="text-neutral-500">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-12 text-center">
            <ClipboardList className="mx-auto mb-4 h-10 w-10 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-900">No tasks found</p>
            <p className="mt-2 text-sm text-neutral-500">
              {isAdmin
                ? 'Assign the first supervisor task to start the workflow.'
                : 'Assigned tasks will appear here once an admin creates them.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => openTaskPanel(task)}
                className="cursor-pointer rounded-2xl border border-neutral-100 p-5 transition-colors hover:bg-neutral-50"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${statusTone(task.status)}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
                        {task.taskType.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-neutral-900">{task.title}</h3>
                    <p className="text-sm text-neutral-500">{task.description || 'No additional task details provided.'}</p>
                    {task.event_id && eventsMap.get(task.event_id) && (
                      <p className="flex items-center gap-2 text-sm text-indigo-600">
                        <CalendarClock className="h-4 w-4" />
                        <span>{eventsMap.get(task.event_id)?.eventName}</span>
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-sm text-neutral-500 md:min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4" />
                      <span>{assigneeLabelForTask(task)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      <span>{outletLabelForTask(task)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4" />
                      <span>{task.dueAt ? task.dueAt.toDate().toLocaleString() : 'No due date'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {isCreateOpen && isAdmin && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateOpen(false)}
              className="fixed inset-0 z-40 bg-neutral-900/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-6 py-4">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">Assign Task</h3>
                  <p className="mt-0.5 text-sm text-neutral-500">Create a task with the required fields.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <form id="task-create-form" onSubmit={handleCreateTask} className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Title</label>
                    <input
                      type="text"
                      value={createForm.title}
                      onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Description</label>
                    <textarea
                      rows={4}
                      value={createForm.description}
                      onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Task Type</label>
                      <select
                        value={createForm.taskType}
                        onChange={(event) => setCreateForm((current) => ({ ...current, taskType: event.target.value as TaskType }))}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-neutral-900"
                      >
                        <option value="general">General</option>
                        <option value="mall_display">Mall Display</option>
                        <option value="voucher_follow_up">Voucher Follow Up</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Due At</label>
                      <input
                        type="datetime-local"
                        value={createForm.dueAt}
                        onChange={(event) => setCreateForm((current) => ({ ...current, dueAt: event.target.value }))}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-neutral-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Supervisor</label>
                    <select
                      value={createForm.assignedToUid}
                      onChange={(event) => handleCreateAssigneeChange(event.target.value)}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="">Select supervisor</option>
                      {supervisors.map((supervisor) => (
                        <option key={supervisor.uid} value={supervisor.uid}>
                          {supervisor.displayName} ({supervisor.outletName})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Outlet</label>
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700">
                      {createForm.outletName || 'Select a supervisor first'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Linked Event</label>
                    <select
                      value={createForm.eventId}
                      onChange={(event) => setCreateForm((current) => ({ ...current, eventId: event.target.value }))}
                      disabled={!createForm.outletId}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-400"
                    >
                      <option value="">No linked event</option>
                      {availableEventsForCreate.map((calendarEvent) => (
                        <option key={calendarEvent.id} value={calendarEvent.id}>
                          {formatEventOptionLabel(calendarEvent)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-neutral-500">
                      Only events for this outlet appear here.
                    </p>
                  </div>
                </form>
              </div>

              <div className="flex justify-end gap-3 border-t border-neutral-100 bg-neutral-50 p-4">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-lg px-5 py-2 font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="task-create-form"
                  disabled={submitting}
                  className="rounded-lg bg-neutral-900 px-5 py-2 font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                >
                  {submitting ? 'Assigning...' : 'Assign Task'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedTask && (
          (() => {
            const linkedEvent = selectedTask.event_id ? eventsMap.get(selectedTask.event_id) || null : null;
            const selectableEvents = events.filter((event) =>
              eventMatchesOutlet(event, selectedTask.outlet_id, outletLabelForTask(selectedTask))
            );

            return (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTask(null)}
              className="fixed inset-0 z-40 bg-neutral-900/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-6 py-4">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">{selectedTask.title}</h3>
                  <p className="mt-0.5 text-sm text-neutral-500">
                    {selectedTask.taskType.replace('_', ' ')} • {selectedTask.status.replace('_', ' ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-900">Description</p>
                  <p className="mt-2 text-sm text-neutral-500">{selectedTask.description || 'No details added.'}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm text-neutral-500">
                  <div className="rounded-xl border border-neutral-100 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Assigned To</p>
                    <p className="mt-2 font-medium text-neutral-900">{assigneeLabelForTask(selectedTask)}</p>
                  </div>
                  <div className="rounded-xl border border-neutral-100 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Outlet</p>
                    <p className="mt-2 font-medium text-neutral-900">{outletLabelForTask(selectedTask)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-100 p-4">
                  <p className="text-sm font-medium text-neutral-900">Linked Event</p>
                  {linkedEvent ? (
                    <div className="mt-3 space-y-1 text-sm text-neutral-500">
                      <p className="font-medium text-neutral-900">{linkedEvent.eventName}</p>
                      <p>{linkedEvent.outlet || outletLabelForTask(selectedTask)}</p>
                      <p>
                        {linkedEvent.startAt
                          ? linkedEvent.startAt.toLocaleString()
                          : 'No schedule'}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-neutral-500">No linked event yet.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-neutral-100 p-4">
                  <p className="text-sm font-medium text-neutral-900">Proof</p>
                  <p className="mt-2 text-sm text-neutral-500">{selectedTask.proofText || 'No proof yet.'}</p>
                  {selectedTask.proofImageUrl && (
                    <a
                      href={selectedTask.proofImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      <FileImage className="h-4 w-4" />
                      View proof image
                    </a>
                  )}
                </div>

                {isSupervisor && selectedTask.assignedToUid === user?.uid && (
                  <div className="space-y-5 rounded-2xl border border-neutral-100 p-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Progress Status</label>
                      <select
                        value={supervisorStatus}
                        onChange={(event) => setSupervisorStatus(event.target.value as 'in_progress' | 'proof_submitted')}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="in_progress">In Progress</option>
                        <option value="proof_submitted">Proof Submitted</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Proof Text</label>
                      <textarea
                        rows={4}
                        value={proofTextDraft}
                        onChange={(event) => setProofTextDraft(event.target.value)}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Describe what was completed."
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-medium text-neutral-700">Proof Image</label>
                      <div className="flex items-center gap-4">
                        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                          proofUpload.status === 'uploading'
                            ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                        }`}>
                          <Upload className="h-4 w-4" />
                          {proofUpload.status === 'uploading' ? 'Uploading...' : 'Upload proof image'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleProofUpload}
                            disabled={proofUpload.status === 'uploading'}
                            className="hidden"
                          />
                        </label>
                        {proofUpload.status === 'uploaded' && (
                          <span className="text-sm font-medium text-emerald-600">Image uploaded</span>
                        )}
                      </div>
                      {proofUpload.error && (
                        <p className="text-sm font-medium text-rose-600">{proofUpload.error}</p>
                      )}
                      {proofUpload.url && (
                        <a
                          href={proofUpload.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          <FileImage className="h-4 w-4" />
                          Preview proof
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {isAdmin && (
                  <div className="space-y-4 rounded-2xl border border-neutral-100 p-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Linked Event</label>
                      <select
                        value={selectedTask.event_id}
                        onChange={(event) => setSelectedTask((current) => current ? { ...current, event_id: event.target.value } : current)}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-neutral-900"
                      >
                        <option value="">No linked event</option>
                        {selectableEvents.map((calendarEvent) => (
                          <option key={calendarEvent.id} value={calendarEvent.id}>
                            {formatEventOptionLabel(calendarEvent)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Admin Review Decision</label>
                      <select
                        value={adminReviewStatus}
                        onChange={(event) => setAdminReviewStatus(event.target.value as 'approved' | 'rejected' | 'completed')}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-neutral-900"
                      >
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    <p className="text-sm text-neutral-500">
                      Review is separate from proof upload. Supervisors upload first, then submit.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-neutral-100 bg-neutral-50 p-4">
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="rounded-lg px-5 py-2 font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
                >
                  Close
                </button>
                {isSupervisor && selectedTask.assignedToUid === user?.uid && (
                  <button
                    type="button"
                    onClick={handleSupervisorSave}
                    disabled={submitting || proofUpload.status === 'uploading'}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {submitting ? 'Saving...' : supervisorStatus === 'proof_submitted' ? 'Submit Proof' : 'Save Progress'}
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleAdminReview}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-5 py-2 font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {submitting ? 'Saving...' : 'Save Review'}
                  </button>
                )}
              </div>
            </motion.div>
          </>
            );
          })()
        )}
      </AnimatePresence>
    </div>
  );
}
