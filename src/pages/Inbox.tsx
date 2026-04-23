import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bell,
  CalendarClock,
  CheckCheck,
  CheckSquare,
  Clock3,
  Smile
} from 'lucide-react';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { useNavigate } from 'react-router';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';

type TaskInboxStatus = 'assigned' | 'in_progress' | 'proof_submitted' | 'approved' | 'rejected' | 'completed';
type MascotInboxStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type TaskInboxRecord = {
  id: string;
  title: string;
  status: TaskInboxStatus;
  dueAt: Timestamp | null;
  updatedAt: Timestamp | null;
  assignedToUid: string;
};

type MascotInboxRecord = {
  id: string;
  title: string;
  location: string;
  status: MascotInboxStatus;
  outlet_id: string;
  updatedAt: Timestamp | null;
  startAt: Timestamp | null;
};

type InboxItem = {
  id: string;
  sourceId: string;
  source: 'task' | 'mascot_booking';
  title: string;
  body: string;
  status: string;
  updatedAt: Timestamp | null;
  href: '/tasks' | '/mascots';
};

const SUPERVISOR_MASCOT_VISIBLE_STATUSES: MascotInboxStatus[] = ['approved', 'rejected', 'cancelled'];

function inboxStatusTone(status: string) {
  switch (status) {
    case 'approved':
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'rejected':
    case 'cancelled':
      return 'bg-rose-100 text-rose-700';
    case 'proof_submitted':
    case 'pending':
      return 'bg-amber-100 text-amber-700';
    case 'in_progress':
      return 'bg-indigo-100 text-indigo-700';
    default:
      return 'bg-neutral-100 text-neutral-700';
  }
}

function formatTimestamp(value: Timestamp | null) {
  if (!value) return 'No time';
  return value.toDate().toLocaleString();
}

export function Inbox() {
  const navigate = useNavigate();
  const { user, userData } = useAuth();
  const role = userData?.role;
  const isAdmin = role === 'admin';
  const isSupervisor = role === 'supervisor';
  const canUseInbox = isAdmin || isSupervisor;

  const [taskItems, setTaskItems] = useState<TaskInboxRecord[]>([]);
  const [bookingItems, setBookingItems] = useState<MascotInboxRecord[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [readIds, setReadIds] = useState<string[]>([]);

  const readStorageKey = user?.uid ? `mmkyros:inbox:read:${user.uid}` : '';

  useEffect(() => {
    if (!readStorageKey) {
      setReadIds([]);
      return;
    }

    try {
      const persisted = window.localStorage.getItem(readStorageKey);
      setReadIds(persisted ? JSON.parse(persisted) : []);
    } catch (error) {
      console.error('Error loading inbox read state:', error);
      setReadIds([]);
    }
  }, [readStorageKey]);

  useEffect(() => {
    if (!user || !canUseInbox) {
      setTaskItems([]);
      setLoadingTasks(false);
      return;
    }

    setLoadingTasks(true);
    const tasksQuery = isAdmin
      ? query(collection(db, 'tasks'), where('status', '==', 'proof_submitted'))
      : query(collection(db, 'tasks'), where('assignedToUid', '==', user.uid));

    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const normalized = snapshot.docs
        .map((taskDoc) => {
          const taskData = taskDoc.data();
          return {
            id: taskDoc.id,
            title: typeof taskData.title === 'string' ? taskData.title : '',
            status: taskData.status as TaskInboxStatus,
            dueAt: taskData.dueAt instanceof Timestamp ? taskData.dueAt : null,
            updatedAt: taskData.updatedAt instanceof Timestamp ? taskData.updatedAt : null,
            assignedToUid: typeof taskData.assignedToUid === 'string' ? taskData.assignedToUid : ''
          } satisfies TaskInboxRecord;
        })
        .sort((left, right) => (right.updatedAt?.toMillis() || 0) - (left.updatedAt?.toMillis() || 0));

      setTaskItems(normalized);
      setLoadingTasks(false);
    }, (error) => {
      console.error('Error loading inbox tasks:', error);
      setTaskItems([]);
      setLoadingTasks(false);
    });

    return () => unsubscribe();
  }, [user, canUseInbox, isAdmin]);

  useEffect(() => {
    if (!user || !canUseInbox) {
      setBookingItems([]);
      setLoadingBookings(false);
      return;
    }

    if (isSupervisor && !userData?.outlet_id) {
      setBookingItems([]);
      setLoadingBookings(false);
      return;
    }

    setLoadingBookings(true);
    const mascotBookingsQuery = isAdmin
      ? query(collection(db, 'mascot_bookings'), where('status', '==', 'pending'))
      : query(collection(db, 'mascot_bookings'), where('outlet_id', '==', userData?.outlet_id || ''));

    const unsubscribe = onSnapshot(mascotBookingsQuery, (snapshot) => {
      const normalized = snapshot.docs
        .map((bookingDoc) => {
          const bookingData = bookingDoc.data();
          return {
            id: bookingDoc.id,
            title: typeof bookingData.title === 'string' ? bookingData.title : '',
            location: typeof bookingData.location === 'string' ? bookingData.location : '',
            status: bookingData.status as MascotInboxStatus,
            outlet_id: typeof bookingData.outlet_id === 'string' ? bookingData.outlet_id : '',
            updatedAt: bookingData.updatedAt instanceof Timestamp ? bookingData.updatedAt : null,
            startAt: bookingData.startAt instanceof Timestamp ? bookingData.startAt : null
          } satisfies MascotInboxRecord;
        })
        .filter((booking) => isAdmin || SUPERVISOR_MASCOT_VISIBLE_STATUSES.includes(booking.status))
        .sort((left, right) => (right.updatedAt?.toMillis() || 0) - (left.updatedAt?.toMillis() || 0));

      setBookingItems(normalized);
      setLoadingBookings(false);
    }, (error) => {
      console.error('Error loading inbox mascot bookings:', error);
      setBookingItems([]);
      setLoadingBookings(false);
    });

    return () => unsubscribe();
  }, [user, userData?.outlet_id, canUseInbox, isAdmin, isSupervisor]);

  const inboxItems = useMemo(() => {
    const taskInboxItems = taskItems.map((task) => ({
      id: `task:${task.id}`,
      sourceId: task.id,
      source: 'task',
      title: isAdmin ? `Task ready for review: ${task.title}` : `Assigned task: ${task.title}`,
      body: isAdmin
        ? 'Proof is in and ready for review.'
        : `Status: ${task.status.replace('_', ' ')}${task.dueAt ? ` • Due ${formatTimestamp(task.dueAt)}` : ''}`,
      status: task.status,
      updatedAt: task.updatedAt,
      href: '/tasks'
    } satisfies InboxItem));

    const mascotInboxItems = bookingItems.map((booking) => ({
      id: `mascot:${booking.id}`,
      sourceId: booking.id,
      source: 'mascot_booking',
      title: isAdmin
        ? `Pending mascot request: ${booking.title}`
        : `Mascot request ${booking.status}: ${booking.title}`,
      body: `${booking.location}${booking.startAt ? ` • ${formatTimestamp(booking.startAt)}` : ''}`,
      status: booking.status,
      updatedAt: booking.updatedAt,
      href: '/mascots'
    } satisfies InboxItem));

    return [...taskInboxItems, ...mascotInboxItems]
      .sort((left, right) => (right.updatedAt?.toMillis() || 0) - (left.updatedAt?.toMillis() || 0));
  }, [taskItems, bookingItems, isAdmin]);

  const unreadCount = inboxItems.filter((item) => !readIds.includes(item.id)).length;

  const persistReadIds = (nextReadIds: string[]) => {
    setReadIds(nextReadIds);
    if (!readStorageKey) return;
    window.localStorage.setItem(readStorageKey, JSON.stringify(nextReadIds));
  };

  const markRead = (itemId: string) => {
    if (readIds.includes(itemId)) return;
    persistReadIds([...readIds, itemId]);
  };

  const markAllRead = () => {
    persistReadIds(Array.from(new Set([...readIds, ...inboxItems.map((item) => item.id)])));
  };

  if (!canUseInbox) {
    return (
      <div className="space-y-6 pb-12">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Inbox</h1>
          <p className="mt-1 text-neutral-500">Inbox is for admins and supervisors only.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Inbox</h1>
          <p className="mt-1 text-neutral-500">Live alerts from tasks and mascot bookings.</p>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={inboxItems.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck size={18} />
          Mark all read
        </button>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 gap-6 md:grid-cols-3"
      >
        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Unread</p>
              <p className="text-2xl font-bold text-neutral-900">{unreadCount}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">Stored locally for this user.</p>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <CheckSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Tasks</p>
              <p className="text-2xl font-bold text-neutral-900">{taskItems.length}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">
            {isAdmin ? 'Proof waiting for review.' : 'Tasks assigned to you.'}
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <Smile className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Mascot</p>
              <p className="text-2xl font-bold text-neutral-900">{bookingItems.length}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">
            {isAdmin ? 'Pending mascot approvals.' : 'Recent mascot updates for your outlet.'}
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm"
      >
        {loadingTasks || loadingBookings ? (
          <p className="text-neutral-500">Loading inbox...</p>
        ) : inboxItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-12 text-center">
            <Bell className="mx-auto mb-4 h-10 w-10 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-900">All clear</p>
            <p className="mt-2 text-sm text-neutral-500">New task and mascot updates appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {inboxItems.map((item) => {
              const isRead = readIds.includes(item.id);

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-5 transition-colors ${
                    isRead ? 'border-neutral-100 bg-white' : 'border-rose-100 bg-rose-50/40'
                  }`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${inboxStatusTone(item.status)}`}>
                          {item.status.replace('_', ' ')}
                        </span>
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
                          {item.source === 'task' ? 'Task' : 'Mascot Booking'}
                        </span>
                        {!isRead && (
                          <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                            Unread
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-neutral-900">{item.title}</h3>
                      <p className="text-sm text-neutral-500">{item.body}</p>
                    </div>

                    <div className="flex flex-col items-start gap-3 md:items-end">
                      <div className="text-sm text-neutral-500">
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-4 w-4" />
                          <span>{formatTimestamp(item.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!isRead && (
                          <button
                            type="button"
                            onClick={() => markRead(item.id)}
                            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                          >
                            Mark read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            markRead(item.id);
                            navigate(item.href);
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
                        >
                          {item.source === 'task' ? <CheckSquare className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                          Open item
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
