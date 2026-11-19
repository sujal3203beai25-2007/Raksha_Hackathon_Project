import { openDB } from 'idb';
import { FacilityRecord, OfflineDraft } from '../shared/types.ts';

const DB_NAME = 'raksha-offline-store';
const DB_VERSION = 1;

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cached_facilities')) {
        db.createObjectStore('cached_facilities', { keyPath: 'facilityId' });
      }
    },
  });
}

export async function saveOfflineDraft(draft: OfflineDraft): Promise<void> {
  const db = await getDb();
  await db.put('drafts', draft);
}

export async function listOfflineDrafts(): Promise<OfflineDraft[]> {
  const db = await getDb();
  return db.getAll('drafts');
}

export async function deleteOfflineDraft(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('drafts', id);
}

export async function cacheFacilitiesLocally(facilities: FacilityRecord[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('cached_facilities', 'readwrite');
  for (const f of facilities) {
    await tx.store.put(f);
  }
  await tx.done;
}

export async function getCachedFacilitiesLocally(): Promise<FacilityRecord[]> {
  const db = await getDb();
  return db.getAll('cached_facilities');
}
