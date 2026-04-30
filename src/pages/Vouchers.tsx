import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarClock, Gift, Plus, Store, Ticket, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

type VoucherType = 'grab' | 'foodpanda' | 'instore' | 'campaign' | 'other';

type VoucherRecord = {
  id: string;
  outlet_id: string;
  loggedByUid: string;
  voucherType: VoucherType;
  amount: number;
  notes: string;
  usedAt: Date | null;
  createdAt: Date | null;
};

type VoucherFormState = {
  outlet_id: string;
  voucherType: VoucherType;
  amount: string;
  notes: string;
  usedAt: string;
};

type MasterOutlet = {
  id: string;
  name: string;
};

type VoucherFeedback = {
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

function normalizeVoucher(row: any): VoucherRecord {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    outlet_id: typeof row.outlet_id === 'string' ? row.outlet_id : '',
    loggedByUid: typeof row.logged_by_user_id === 'string' ? row.logged_by_user_id : '',
    voucherType: (row.voucher_type as VoucherType) || 'other',
    amount: Number(row.amount) || 0,
    notes: typeof row.notes === 'string' ? row.notes : '',
    usedAt: normalizeDate(row.used_at),
    createdAt: normalizeDate(row.created_at)
  };
}

function buildDefaultForm(outletId: string) {
  return {
    outlet_id: outletId,
    voucherType: 'grab' as VoucherType,
    amount: '',
    notes: '',
    usedAt: toDateTimeLocal(new Date())
  };
}

export function Vouchers() {
  const { user, userData } = useAuth();
  const role = userData?.role;
  const isAdmin = role === 'admin';
  const isOutletScopedUser = role === 'supervisor' || role === 'pic';
  const canManageVouchers = isAdmin || isOutletScopedUser;

  const [vouchers, setVouchers] = useState<VoucherRecord[]>([]);
  const [masterOutlets, setMasterOutlets] = useState<MasterOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<VoucherRecord | null>(null);
  const [formState, setFormState] = useState<VoucherFormState>(buildDefaultForm(''));
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<VoucherFeedback>(null);

  useEffect(() => {
    if (!user || !isAdmin) {
      setMasterOutlets([]);
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
        console.error('Error loading voucher outlets:', error);
        setMasterOutlets([]);
        return;
      }

      setMasterOutlets(
        (data || [])
          .map((outlet) => typeof outlet.name === 'string' && outlet.name.trim()
            ? { id: outlet.id, name: outlet.name.trim() }
            : null)
          .filter((outlet): outlet is MasterOutlet => outlet !== null)
      );
    };

    void loadOutlets();

    const channel = supabase
      .channel('core-ops-voucher-outlets')
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
    if (!user || !userData) {
      setVouchers([]);
      setLoading(false);
      return;
    }

    if (isOutletScopedUser && !userData.outlet_id) {
      setVouchers([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadVouchers = async () => {
      setLoading(true);

      let request = supabase
        .from('vouchers')
        .select('*')
        .order('used_at', { ascending: false });

      if (isOutletScopedUser) {
        request = request.eq('outlet_id', userData.outlet_id);
      }

      const { data, error } = await request;

      if (!isMounted) return;

      if (error) {
        console.error('Error loading vouchers:', error);
        setFeedback({ tone: 'error', message: 'Failed to load vouchers.' });
        setLoading(false);
        return;
      }

      const normalized = (data || [])
        .map(normalizeVoucher)
        .sort((left, right) => {
          const leftTime = left.usedAt?.getTime() || 0;
          const rightTime = right.usedAt?.getTime() || 0;
          return rightTime - leftTime;
        });

      setVouchers(normalized);
      setLoading(false);
    };

    void loadVouchers();

    const channel = supabase
      .channel('core-ops-vouchers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vouchers' }, () => {
        void loadVouchers();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [user, userData, isOutletScopedUser]);

  const outletLabelFor = (outletId: string) => {
    if (isOutletScopedUser && userData?.outlet_id === outletId) {
      return userData.outlet_name || outletId;
    }

    const matchedOutlet = masterOutlets.find((outlet) => outlet.id === outletId);
    return matchedOutlet?.name || outletId;
  };

  const openCreateEditor = () => {
    setEditingVoucher(null);
    setFormState(buildDefaultForm(isOutletScopedUser ? userData?.outlet_id || '' : ''));
    setFeedback(null);
    setIsEditorOpen(true);
  };

  const openEditEditor = (voucher: VoucherRecord) => {
    setEditingVoucher(voucher);
    setFormState({
      outlet_id: voucher.outlet_id,
      voucherType: voucher.voucherType,
      amount: voucher.amount.toString(),
      notes: voucher.notes,
      usedAt: toDateTimeLocal(voucher.usedAt)
    });
    setFeedback(null);
    setIsEditorOpen(true);
  };

  const canEditVoucher = (voucher: VoucherRecord) => {
    if (isAdmin) return true;
    return isOutletScopedUser && voucher.outlet_id === userData?.outlet_id;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !userData || !canManageVouchers) return;

    const outletId = isOutletScopedUser ? userData.outlet_id : formState.outlet_id;
    const usedAtDate = new Date(formState.usedAt);
    const amount = Number(formState.amount);

    if (!outletId) {
      setFeedback({ tone: 'error', message: 'Outlet is required.' });
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback({ tone: 'error', message: 'Amount must be greater than zero.' });
      return;
    }

    if (Number.isNaN(usedAtDate.getTime())) {
      setFeedback({ tone: 'error', message: 'A valid time is required.' });
      return;
    }

    const payload = {
      outlet_id: outletId,
      logged_by_user_id: editingVoucher?.loggedByUid || userData.id,
      voucher_type: formState.voucherType,
      amount,
      notes: formState.notes.trim(),
      used_at: usedAtDate.toISOString(),
      updated_at: nowIso()
    };

    setSubmitting(true);
    setFeedback(null);

    try {
      if (editingVoucher) {
        const { error } = await supabase
          .from('vouchers')
          .update(payload)
          .eq('id', editingVoucher.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('vouchers').insert({
          ...payload,
          created_at: nowIso()
        });

        if (error) throw error;
      }

      setIsEditorOpen(false);
      setEditingVoucher(null);
      setFormState(buildDefaultForm(isOutletScopedUser ? userData.outlet_id : ''));
      setFeedback({
        tone: 'success',
        message: editingVoucher ? 'Voucher updated.' : 'Voucher saved.'
      });
    } catch (error) {
      console.error('Error saving voucher:', error);
      setFeedback({ tone: 'error', message: 'Failed to save voucher.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Vouchers</h1>
          <p className="mt-1 text-neutral-500">Track voucher claims by outlet.</p>
        </div>
        {canManageVouchers && (
          <button
            type="button"
            onClick={openCreateEditor}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-amber-600"
          >
            <Plus size={18} />
            Log Voucher
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

      {isOutletScopedUser && !userData?.outlet_id && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your profile is missing an assigned outlet. An admin must assign your outlet before you can log vouchers.
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 gap-6 md:grid-cols-3"
      >
        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Total Claims</p>
              <p className="text-2xl font-bold text-neutral-900">{vouchers.length}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">Claims visible to your role.</p>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Total Amount</p>
              <p className="text-2xl font-bold text-neutral-900">
                {vouchers.reduce((sum, voucher) => sum + voucher.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">Total from visible claims.</p>
        </div>

        <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Outlet</p>
              <p className="text-lg font-bold text-neutral-900">
                {isOutletScopedUser ? (userData?.outlet_name || userData?.outlet_id || 'Unassigned') : 'Multi-outlet'}
              </p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">
            Outlet teams stay on their outlet. Admins can log any outlet.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm"
      >
        {loading ? (
          <p className="text-neutral-500">Loading vouchers...</p>
        ) : vouchers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-12 text-center">
            <Ticket className="mx-auto mb-4 h-10 w-10 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-900">No vouchers yet</p>
            <p className="mt-2 text-sm text-neutral-500">
              {canManageVouchers ? 'Log the first claim to start tracking.' : 'Claims will appear here once logged.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {vouchers.map((voucher) => (
              <div
                key={voucher.id}
                className="flex flex-col gap-4 rounded-2xl border border-neutral-100 p-5 transition-colors hover:bg-neutral-50 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                      {voucher.voucherType}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
                      {outletLabelFor(voucher.outlet_id)}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-neutral-900">{voucher.amount.toLocaleString()} claimed</p>
                  <p className="text-sm text-neutral-500">{voucher.notes || 'No notes.'}</p>
                </div>

                <div className="flex flex-col items-start gap-3 md:items-end">
                  <div className="text-sm text-neutral-500">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4" />
                      <span>{voucher.usedAt ? voucher.usedAt.toLocaleString() : 'No time'}</span>
                    </div>
                  </div>
                  {canEditVoucher(voucher) && (
                    <button
                      type="button"
                      onClick={() => openEditEditor(voucher)}
                      className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                    >
                      Edit Voucher
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {isEditorOpen && canManageVouchers && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditorOpen(false)}
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
                  <h3 className="text-lg font-bold text-neutral-900">
                    {editingVoucher ? 'Edit Voucher' : 'Log Voucher'}
                  </h3>
                  <p className="mt-0.5 text-sm text-neutral-500">
                    {isOutletScopedUser ? (userData?.outlet_name || userData?.outlet_id || 'Assigned outlet required') : 'Admin voucher entry'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <form id="voucher-form" onSubmit={handleSubmit} className="space-y-5">
                  {isAdmin ? (
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Outlet</label>
                      <select
                        value={formState.outlet_id}
                        onChange={(event) => setFormState((current) => ({ ...current, outlet_id: event.target.value }))}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Select outlet</option>
                        {masterOutlets.map((outlet) => (
                          <option key={outlet.id} value={outlet.id}>
                            {outlet.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Outlet</label>
                      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700">
                        {userData?.outlet_name || userData?.outlet_id || 'Assigned outlet required'}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Voucher Type</label>
                      <select
                        value={formState.voucherType}
                        onChange={(event) => setFormState((current) => ({ ...current, voucherType: event.target.value as VoucherType }))}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="grab">Grab</option>
                        <option value="foodpanda">Foodpanda</option>
                        <option value="instore">In-store</option>
                        <option value="campaign">Campaign</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Amount</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={formState.amount}
                        onChange={(event) => setFormState((current) => ({ ...current, amount: event.target.value }))}
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                      <label className="text-sm font-medium text-neutral-700">Claim Time</label>
                    <input
                      type="datetime-local"
                      value={formState.usedAt}
                      onChange={(event) => setFormState((current) => ({ ...current, usedAt: event.target.value }))}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-neutral-700">Notes</label>
                    <textarea
                      rows={4}
                      value={formState.notes}
                      onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 p-2 outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Optional notes"
                    />
                  </div>
                </form>
              </div>

              <div className="flex justify-end gap-3 border-t border-neutral-100 bg-neutral-50 p-4">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="rounded-lg px-5 py-2 font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="voucher-form"
                  disabled={submitting || (isOutletScopedUser && !userData?.outlet_id)}
                  className="rounded-lg bg-amber-500 px-5 py-2 font-medium text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300"
                >
                  {submitting ? 'Saving...' : editingVoucher ? 'Save Changes' : 'Save Voucher'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
