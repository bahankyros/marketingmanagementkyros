import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle,
  Clock,
  MapPin,
  PenTool,
  Plus,
  Smile,
  X
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

type MascotBookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type MascotBookingRecord = {
  id: string;
  outlet_id: string;
  requestedByUid: string;
  title: string;
  location: string;
  requestNote: string;
  startAt: Date | null;
  endAt: Date | null;
  status: MascotBookingStatus;
  adminNote: string;
  approvedByUid: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type MascotLogRecord = {
  id: string;
  date: string;
  outletEvent: string;
  status: string;
  condition: string;
  actualUsageNotes: string;
  createdAt: Date | null;
};

type OutletOption = {
  id: string;
  name: string;
};

type BookingFormState = {
  outlet_id: string;
  title: string;
  location: string;
  requestNote: string;
  startAt: string;
  endAt: string;
};

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

function toDateTimeLocal(value: Date | string | null | undefined) {
  if (!value) return '';

  const date = value instanceof Date
    ? value
    : new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function buildDefaultBookingForm(outletId = ''): BookingFormState {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + 2);

  return {
    outlet_id: outletId,
    title: '',
    location: '',
    requestNote: '',
    startAt: toDateTimeLocal(start),
    endAt: toDateTimeLocal(end)
  };
}

function bookingStatusTone(status: MascotBookingStatus) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-700';
    case 'rejected':
      return 'bg-rose-100 text-rose-700';
    case 'cancelled':
      return 'bg-neutral-100 text-neutral-700';
    default:
      return 'bg-amber-100 text-amber-700';
  }
}

function normalizeBooking(row: any): MascotBookingRecord {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    outlet_id: typeof row.outlet_id === 'string' ? row.outlet_id : '',
    requestedByUid: typeof row.requested_by_user_id === 'string' ? row.requested_by_user_id : '',
    title: typeof row.title === 'string' ? row.title : '',
    location: typeof row.location === 'string' ? row.location : '',
    requestNote: typeof row.request_note === 'string' ? row.request_note : '',
    startAt: normalizeDate(row.start_at),
    endAt: normalizeDate(row.end_at),
    status: (row.status as MascotBookingStatus) || 'pending',
    adminNote: typeof row.admin_note === 'string' ? row.admin_note : '',
    approvedByUid: typeof row.approved_by_user_id === 'string' ? row.approved_by_user_id : '',
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at)
  };
}

function normalizeLog(row: any): MascotLogRecord {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    date: typeof row.date === 'string' ? row.date : '',
    outletEvent: typeof row.outlet_event === 'string' ? row.outlet_event : '',
    status: typeof row.status === 'string' ? row.status : 'Available',
    condition: typeof row.condition === 'string' ? row.condition : 'Good',
    actualUsageNotes: typeof row.actual_usage_notes === 'string' ? row.actual_usage_notes : '',
    createdAt: normalizeDate(row.created_at)
  };
}

export function Mascots() {
  const { user, userData } = useAuth();
  const normalizedRole = userData?.role?.toLowerCase().trim();
  const isAdmin = normalizedRole === 'admin';
  const isSupervisor = normalizedRole === 'supervisor' || normalizedRole === 'pic';
  const canRequestMascot = isAdmin || isSupervisor;
  const canLogCondition = isAdmin;
  const canViewMascotHistory = isAdmin || isSupervisor;

  const [activeTab, setActiveTab] = useState<'requests' | 'logs'>('requests');
  const [view, setView] = useState<'default' | 'book' | 'logCondition'>('default');
  const [bookingRequests, setBookingRequests] = useState<MascotBookingRecord[]>([]);
  const [logs, setLogs] = useState<MascotLogRecord[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<MascotBookingRecord | null>(null);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [bookingForm, setBookingForm] = useState<BookingFormState>(buildDefaultBookingForm());
  const [adminDecisionStatus, setAdminDecisionStatus] = useState<MascotBookingStatus>('pending');
  const [adminNoteDraft, setAdminNoteDraft] = useState('');
  const [conditionForm, setConditionForm] = useState({
    date: '',
    outletEvent: '',
    status: 'Available',
    condition: 'Good',
    actualUsageNotes: ''
  });

  useEffect(() => {
    if (!user || !canRequestMascot) {
      setBookingRequests([]);
      setLoadingBookings(false);
      return;
    }

    if (isSupervisor && !userData?.outlet_id) {
      setBookingRequests([]);
      setLoadingBookings(false);
      return;
    }

    let isMounted = true;

    const loadBookings = async () => {
      setLoadingBookings(true);

      let request = supabase
        .from('mascot_bookings')
        .select('*')
        .order('start_at', { ascending: true });

      if (!isAdmin) {
        request = request.eq('outlet_id', userData?.outlet_id || '');
      }

      const { data, error } = await request;

      if (!isMounted) return;

      if (error) {
        console.error('Error loading mascot booking requests:', error);
        setFeedback({ tone: 'error', message: 'Failed to load booking requests.' });
        setLoadingBookings(false);
        return;
      }

      const normalized = (data || [])
        .map(normalizeBooking)
        .sort((left, right) => {
          const leftTime = left.startAt?.getTime() || 0;
          const rightTime = right.startAt?.getTime() || 0;
          return leftTime - rightTime;
        });

      setBookingRequests(normalized);
      setLoadingBookings(false);
    };

    void loadBookings();

    const channel = supabase
      .channel('core-ops-mascot-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mascot_bookings' }, () => {
        void loadBookings();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, userData?.outlet_id, canRequestMascot, isAdmin, isSupervisor]);

  useEffect(() => {
    if (!user || !canViewMascotHistory) {
      setLogs([]);
      setLoadingLogs(false);
      return;
    }

    let isMounted = true;

    const loadLogs = async () => {
      setLoadingLogs(true);

      const { data, error } = await supabase
        .from('mascot_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (error) {
        console.error('Error loading mascot logs:', error);
        setLoadingLogs(false);
        return;
      }

      setLogs((data || []).map(normalizeLog));
      setLoadingLogs(false);
    };

    void loadLogs();

    const channel = supabase
      .channel('core-ops-mascot-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mascot_logs' }, () => {
        void loadLogs();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, canViewMascotHistory]);

  useEffect(() => {
    if (!user || !isAdmin) {
      setOutlets([]);
      return;
    }

    let isMounted = true;

    const loadOutlets = async () => {
      const { data, error } = await supabase
        .from('outlets')
        .select('id, name')
        .order('name', { ascending: true });

      if (!isMounted) return;

      if (error) {
        console.error('Error loading mascot outlets:', error);
        setOutlets([]);
        return;
      }

      setOutlets((data || [])
        .map((outlet) => typeof outlet.name === 'string' && outlet.name.trim()
          ? { id: outlet.id, name: outlet.name.trim() }
          : null)
        .filter((outlet): outlet is OutletOption => outlet !== null));
    };

    void loadOutlets();

    const channel = supabase
      .channel('core-ops-mascot-outlets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outlets' }, () => {
        void loadOutlets();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, isAdmin]);

  useEffect(() => {
    if (isSupervisor) {
      setBookingForm((current) => ({
        ...current,
        outlet_id: userData?.outlet_id || ''
      }));
    }
  }, [isSupervisor, userData?.outlet_id]);

  const outletNameMap = useMemo(
    () => new Map(outlets.map((outlet) => [outlet.id, outlet.name])),
    [outlets]
  );

  const latestLog = logs[0] || null;
  const currentCondition = latestLog?.condition || 'Good';
  const currentAssetStatus = latestLog?.status || 'Available';
  const activeApprovedBooking = bookingRequests.find((booking) => {
    if (booking.status !== 'approved' || !booking.startAt || !booking.endAt) return false;
    const now = Date.now();
    return booking.startAt.getTime() <= now && booking.endAt.getTime() >= now;
  });
  const currentLocation = activeApprovedBooking?.location || latestLog?.outletEvent || 'HQ Storage';
  const upcomingBookingRequests = bookingRequests.filter((booking) => {
    if (!booking.startAt) return true;
    return booking.startAt.getTime() >= Date.now() - 24 * 60 * 60 * 1000;
  });

  const resolveOutletLabel = (outletId: string) => {
    if (isSupervisor && userData?.outlet_id === outletId) {
      return userData.outlet_name || outletId;
    }

    return outletNameMap.get(outletId) || outletId;
  };

  const handleBookMascot = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userData?.id || !canRequestMascot) return;

    const outletId = isSupervisor ? (userData?.outlet_id || '') : bookingForm.outlet_id;
    const startAt = new Date(bookingForm.startAt);
    const endAt = new Date(bookingForm.endAt);

    if (!outletId) {
      setFeedback({ tone: 'error', message: 'Outlet is required.' });
      return;
    }

    if (!bookingForm.title.trim() || !bookingForm.location.trim()) {
      setFeedback({ tone: 'error', message: 'Title and location are required.' });
      return;
    }

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      setFeedback({ tone: 'error', message: 'Enter a valid start and end time.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const { error } = await supabase.from('mascot_bookings').insert({
        outlet_id: outletId,
        requested_by_user_id: userData.id,
        title: bookingForm.title.trim(),
        location: bookingForm.location.trim(),
        request_note: bookingForm.requestNote.trim(),
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        status: 'pending',
        admin_note: '',
        approved_by_user_id: null,
        created_at: nowIso(),
        updated_at: nowIso()
      });

      if (error) throw error;

      setView('default');
      setActiveTab('requests');
      setBookingForm(buildDefaultBookingForm(isSupervisor ? (userData?.outlet_id || '') : ''));
      setFeedback({ tone: 'success', message: 'Booking request sent.' });
    } catch (error) {
      console.error('Error creating mascot booking request:', error);
      setFeedback({ tone: 'error', message: 'Failed to submit request.' });
    } finally {
      setSubmitting(false);
    }
  };

  const openBookingDetail = (booking: MascotBookingRecord) => {
    setSelectedBooking(booking);
    setAdminDecisionStatus(booking.status);
    setAdminNoteDraft(booking.adminNote);
    setFeedback(null);
  };

  const handleAdminDecisionSave = async () => {
    if (!userData?.id || !isAdmin || !selectedBooking) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const { error } = await supabase
        .from('mascot_bookings')
        .update({
          status: adminDecisionStatus,
          admin_note: adminNoteDraft.trim(),
          approved_by_user_id: adminDecisionStatus === 'pending' ? null : userData.id,
          updated_at: nowIso()
        })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      setSelectedBooking(null);
      setFeedback({
        tone: 'success',
        message: `Mascot booking request ${adminDecisionStatus}.`
      });
    } catch (error) {
      console.error('Error updating mascot booking request:', error);
      setFeedback({ tone: 'error', message: 'Failed to update request.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogCondition = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userData?.id || !canLogCondition) return;

    try {
      const { error } = await supabase.from('mascot_logs').insert({
        date: conditionForm.date || null,
        outlet_event: conditionForm.outletEvent.trim(),
        status: conditionForm.status,
        condition: conditionForm.condition,
        actual_usage_notes: conditionForm.actualUsageNotes.trim(),
        assigned_pic_user_id: userData.id,
        created_at: nowIso(),
        updated_at: nowIso()
      });

      if (error) throw error;

      setView('default');
      setActiveTab('logs');
      setConditionForm({ date: '', outletEvent: '', status: 'Available', condition: 'Good', actualUsageNotes: '' });
      setFeedback({ tone: 'success', message: 'Asset update saved.' });
    } catch (error) {
      console.error('Error logging mascot condition:', error);
      setFeedback({ tone: 'error', message: 'Failed to save asset update.' });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Mascot Management</h1>
          <p className="text-neutral-500 mt-1">Request mascot bookings and track the queue.</p>
        </div>
        <div className="flex gap-3">
          {canLogCondition && (
            <button
              onClick={() => {
                setFeedback(null);
                setView('logCondition');
              }}
              className="flex items-center gap-2 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
            >
              <PenTool size={18} /> Update asset
            </button>
          )}
          {canRequestMascot && (
            <button
              onClick={() => {
                setFeedback(null);
                setBookingForm(buildDefaultBookingForm(isSupervisor ? (userData?.outlet_id || '') : ''));
                setView('book');
              }}
              className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
            >
              <CalendarIcon size={18} /> Request booking
            </button>
          )}
        </div>
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

      {isSupervisor && !userData?.outlet_id && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You need an assigned outlet before you can request mascot bookings.
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center border-2 border-rose-100 shrink-0">
              <Smile className="w-10 h-10 text-rose-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 leading-tight mb-1">Kyros Mascot</h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  currentAssetStatus === 'Available' ? 'bg-emerald-100 text-emerald-700'
                  : currentAssetStatus === 'In use' ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'
                }`}>
                  {currentAssetStatus === 'Available' ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  {currentAssetStatus}
                </span>
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  currentCondition === 'Good' ? 'bg-emerald-100 text-emerald-700'
                  : currentCondition === 'Fair' ? 'bg-blue-100 text-blue-700'
                  : 'bg-rose-100 text-rose-700'
                }`}>
                  {currentCondition === 'Good' ? <Smile className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  Condition: {currentCondition}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 gap-x-8 gap-y-4 border-t md:border-t-0 md:border-l border-neutral-100 pt-4 md:pt-0 md:pl-8 flex-grow">
            <div>
              <p className="text-xs text-neutral-500 uppercase font-semibold mb-1 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Location</p>
              <p className="font-semibold text-neutral-900 text-lg">{currentLocation}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase font-semibold mb-1 flex items-center gap-1.5"><PenTool className="w-3.5 h-3.5" /> Updated</p>
              <p className="font-semibold text-neutral-900 text-lg">{latestLog ? (latestLog.createdAt?.toLocaleDateString() || 'Today') : 'N/A'}</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="flex border-b border-neutral-200">
        <button
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'requests' ? 'border-rose-500 text-rose-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'} mr-6`}
          onClick={() => setActiveTab('requests')}
        >
          Requests
        </button>
        <button
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'logs' ? 'border-rose-500 text-rose-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('logs')}
        >
          Asset Log
        </button>
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="pt-2"
      >
        {activeTab === 'requests' && (
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50/50 border-b border-neutral-100 text-sm text-neutral-500">
                    <th className="font-medium px-6 py-4">Request Window</th>
                    <th className="font-medium px-6 py-4">Outlet</th>
                    <th className="font-medium px-6 py-4">Title & Location</th>
                    <th className="font-medium px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingBookings ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-neutral-500">Loading mascot booking requests...</td></tr>
                  ) : upcomingBookingRequests.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-neutral-500">
                        {canRequestMascot ? 'No mascot booking requests yet. Click "Request Booking" to submit one.' : 'No mascot booking requests found.'}
                      </td>
                    </tr>
                  ) : (
                    upcomingBookingRequests.map((booking) => (
                      <tr
                        key={booking.id}
                        onClick={() => openBookingDetail(booking)}
                        className="hover:bg-neutral-50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <p className="font-semibold text-neutral-900">
                            {booking.startAt ? booking.startAt.toLocaleDateString() : 'No date'}
                          </p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {booking.startAt ? booking.startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                            {' - '}
                            {booking.endAt ? booking.endAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </p>
                        </td>
                        <td className="px-6 py-4 font-medium text-neutral-900">{resolveOutletLabel(booking.outlet_id)}</td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-neutral-900">{booking.title}</p>
                          <p className="text-sm text-neutral-500 mt-1">{booking.location}</p>
                          {booking.requestNote && (
                            <p className="text-xs text-neutral-400 mt-2">{booking.requestNote}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${bookingStatusTone(booking.status)}`}>
                            {booking.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-3">
            {loadingLogs ? (
              <p className="text-neutral-500 p-4">Loading history...</p>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center bg-white border border-neutral-100 rounded-xl">
                <p className="text-neutral-500 text-sm">No historical logs found.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-4 bg-white border border-neutral-100 rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="min-w-[80px] h-12 bg-neutral-50 rounded-lg flex flex-col items-center justify-center border border-neutral-100 shrink-0">
                      <span className="text-[10px] uppercase font-bold text-neutral-400">Date</span>
                      <span className="text-xs font-bold text-neutral-700 leading-none mt-0.5">{log.date || 'Unknown'}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-neutral-900">{log.outletEvent}</p>
                      <p className="text-sm text-neutral-500 line-clamp-1 mt-0.5">{log.actualUsageNotes || 'No notes provided'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold px-2 py-1 bg-neutral-100 text-neutral-600 rounded whitespace-nowrap">{log.status}</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${
                      log.condition === 'Good' ? 'bg-emerald-50 text-emerald-600'
                      : log.condition === 'Fair' ? 'bg-blue-50 text-blue-600'
                      : 'bg-rose-50 text-rose-600'
                    }`}>
                      {log.condition}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {selectedBooking && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBooking(null)}
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
                  <h3 className="font-bold text-neutral-900 text-lg">Request Details</h3>
                  <p className="text-sm text-neutral-500 mt-0.5">{selectedBooking.title}</p>
                </div>
                <button onClick={() => setSelectedBooking(null)} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-900">Outlet</p>
                  <p className="mt-2 text-sm text-neutral-500">{resolveOutletLabel(selectedBooking.outlet_id)}</p>
                </div>

                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-900">Location</p>
                  <p className="mt-2 text-sm text-neutral-500">{selectedBooking.location}</p>
                </div>

                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-900">Schedule</p>
                  <p className="mt-2 text-sm text-neutral-500">
                    {selectedBooking.startAt ? selectedBooking.startAt.toLocaleString() : 'No start time'}
                    {' - '}
                    {selectedBooking.endAt ? selectedBooking.endAt.toLocaleString() : 'No end time'}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-900">Note</p>
                  <p className="mt-2 text-sm text-neutral-500">{selectedBooking.requestNote || 'No note.'}</p>
                </div>

                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-900">Status</p>
                  <span className={`inline-flex mt-3 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${bookingStatusTone(selectedBooking.status)}`}>
                    {selectedBooking.status}
                  </span>
                </div>

                {isAdmin && (
                  <div className="space-y-4 rounded-2xl border border-neutral-100 p-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Decision</label>
                      <select
                        value={adminDecisionStatus}
                        onChange={(event) => setAdminDecisionStatus(event.target.value as MascotBookingStatus)}
                        className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Admin Note</label>
                      <textarea
                        rows={4}
                        value={adminNoteDraft}
                        onChange={(event) => setAdminNoteDraft(event.target.value)}
                        className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                        placeholder="Add approval or rejection notes."
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                <button onClick={() => setSelectedBooking(null)} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">
                  Close
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleAdminDecisionSave}
                    disabled={submitting}
                    className="px-5 py-2 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
                  >
                    <CheckCircle size={18} /> {submitting ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}

        {((view === 'book' && canRequestMascot) || (view === 'logCondition' && canLogCondition)) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setView('default')}
              className="fixed inset-0 bg-neutral-900/30 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 border-l border-neutral-200 flex flex-col"
            >
              {view === 'book' ? (
                <>
                  <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
                    <div>
                      <h3 className="font-bold text-neutral-900 text-lg">New Booking Request</h3>
                      <p className="text-sm text-neutral-500 mt-0.5">Send a request for admin approval.</p>
                    </div>
                    <button onClick={() => setView('default')} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <form id="book-form" onSubmit={handleBookMascot} className="space-y-5">
                      {isAdmin ? (
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">Outlet</label>
                          <select
                            value={bookingForm.outlet_id}
                            onChange={(event) => setBookingForm((current) => ({ ...current, outlet_id: event.target.value }))}
                            className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                          >
                            <option value="">Select outlet</option>
                            {outlets.map((outlet) => (
                              <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">Outlet</label>
                          <div className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700">
                            {userData?.outlet_name || userData?.outlet_id || 'Assigned outlet required'}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Title *</label>
                        <input
                          required
                          type="text"
                          placeholder="e.g. Weekend mall activation"
                          value={bookingForm.title}
                          onChange={(event) => setBookingForm((current) => ({ ...current, title: event.target.value }))}
                          className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Location *</label>
                        <input
                          required
                          type="text"
                          placeholder="e.g. Setia City Mall Atrium"
                          value={bookingForm.location}
                          onChange={(event) => setBookingForm((current) => ({ ...current, location: event.target.value }))}
                          className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">Start At *</label>
                          <input
                            required
                            type="datetime-local"
                            value={bookingForm.startAt}
                            onChange={(event) => setBookingForm((current) => ({ ...current, startAt: event.target.value }))}
                            className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">End At *</label>
                          <input
                            required
                            type="datetime-local"
                            value={bookingForm.endAt}
                            onChange={(event) => setBookingForm((current) => ({ ...current, endAt: event.target.value }))}
                            className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Notes</label>
                        <textarea
                          rows={4}
                          placeholder="Timing, staffing, or handling notes."
                          value={bookingForm.requestNote}
                          onChange={(event) => setBookingForm((current) => ({ ...current, requestNote: event.target.value }))}
                          className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                        />
                      </div>
                    </form>
                  </div>
                  <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                    <button onClick={() => setView('default')} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      form="book-form"
                      disabled={submitting || (isSupervisor && !userData?.outlet_id)}
                      className="px-5 py-2 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
                    >
                      <CheckCircle size={18} /> {submitting ? 'Submitting...' : 'Send Request'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
                    <div>
                      <h3 className="font-bold text-neutral-900 text-lg">Update Asset</h3>
                      <p className="text-sm text-neutral-500 mt-0.5">Log damage, cleaning, or movement.</p>
                    </div>
                    <button onClick={() => setView('default')} className="p-2 hover:bg-neutral-200 rounded-lg text-neutral-500 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <form id="condition-form" onSubmit={handleLogCondition} className="space-y-5">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Date Logged *</label>
                        <input required type="date" value={conditionForm.date} onChange={e => setConditionForm({ ...conditionForm, date: e.target.value })} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Location / Last Event *</label>
                        <input required type="text" placeholder="e.g. Storage, or Returned from Mytown" value={conditionForm.outletEvent} onChange={e => setConditionForm({ ...conditionForm, outletEvent: e.target.value })} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">Asset Status</label>
                          <select value={conditionForm.status} onChange={e => setConditionForm({ ...conditionForm, status: e.target.value })} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900">
                            {['Available', 'In use', 'In transit', 'Cleaning', 'Repair'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-neutral-700">Condition</label>
                          <select value={conditionForm.condition} onChange={e => setConditionForm({ ...conditionForm, condition: e.target.value })} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900">
                            {['Good', 'Fair', 'Needs cleaning', 'Needs repair'].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-neutral-700">Notes / Repairs</label>
                        <textarea rows={4} placeholder="e.g. Tear in the left arm hole..." value={conditionForm.actualUsageNotes} onChange={e => setConditionForm({ ...conditionForm, actualUsageNotes: e.target.value })} className="w-full p-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-neutral-900 resize-none"></textarea>
                      </div>
                    </form>
                  </div>
                  <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3">
                    <button onClick={() => setView('default')} className="px-5 py-2 text-neutral-600 font-medium hover:bg-neutral-200 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" form="condition-form" className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"><CheckCircle size={18} /> Save Log</button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
