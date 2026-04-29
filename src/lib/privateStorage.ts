import { supabase } from './supabase';

const STORAGE_MARKERS = [
  '/storage/v1/object/public/',
  '/storage/v1/object/sign/'
];

function decodeObjectPath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractStorageObjectPath(bucket: string, value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';

  for (const marker of STORAGE_MARKERS) {
    const bucketMarker = `${marker}${bucket}/`;
    const markerIndex = trimmed.indexOf(bucketMarker);
    if (markerIndex >= 0) {
      const rawPath = trimmed.slice(markerIndex + bucketMarker.length).split('?')[0];
      return decodeObjectPath(rawPath).replace(/^\/+/, '');
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return '';
  }

  return trimmed.replace(/^\/+/, '');
}

export async function createPrivateStorageUrl(bucket: string, value: string | null | undefined, expiresIn = 60 * 60) {
  const objectPath = extractStorageObjectPath(bucket, value);
  if (!objectPath) {
    return typeof value === 'string' ? value.trim() : '';
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresIn);

  if (error) {
    throw error;
  }

  return data.signedUrl || '';
}
