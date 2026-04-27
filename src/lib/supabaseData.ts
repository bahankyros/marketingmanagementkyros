import { supabase } from './supabase';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function nowIso() {
  return new Date().toISOString();
}

export function toNullableDate(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

export function toNullableUuid(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function toNumber(value: unknown, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

export function subscribeToTable(channelName: string, table: string, onChange: () => void) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function normalizeCampaign(row: any) {
  return {
    id: row.id,
    name: row.name || '',
    objective: row.objective || '',
    status: row.status || 'Planning',
    type: row.type || 'Promo',
    ownerId: row.owner_user_id || '',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    budget: toNumber(row.budget),
    assetUrl: row.asset_url || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

