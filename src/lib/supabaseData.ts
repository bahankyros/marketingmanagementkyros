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

type RealtimeTableEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE';

type RealtimeTableOptions = {
  schema?: string;
  events?: RealtimeTableEvent | RealtimeTableEvent[];
  filter?: string;
  debounceMs?: number;
};

export function subscribeToTable(
  channelName: string,
  table: string,
  onChange: () => void,
  options: RealtimeTableOptions = {}
) {
  const {
    schema = 'public',
    events = '*',
    filter,
    debounceMs = 150
  } = options;
  const channel = supabase.channel(channelName);
  const eventList = Array.isArray(events) ? events : [events];
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;

  const runChangeHandler = () => {
    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }

    debounceHandle = setTimeout(() => {
      debounceHandle = null;
      onChange();
    }, debounceMs);
  };

  eventList.forEach((event) => {
    channel.on(
      'postgres_changes',
      {
        event,
        schema,
        table,
        ...(filter ? { filter } : {})
      },
      runChangeHandler
    );
  });

  channel.subscribe();

  return () => {
    if (debounceHandle) {
      clearTimeout(debounceHandle);
      debounceHandle = null;
    }

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
