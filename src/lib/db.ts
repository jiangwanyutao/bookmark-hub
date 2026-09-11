import { openDB, type DBSchema } from 'idb';
import type { Batch, IdMapping, Snapshot } from './history';

export interface HubDB extends DBSchema {
  batches: { key: string; value: Batch; indexes: { createdAt: number } };
  snapshots: { key: string; value: Snapshot; indexes: { createdAt: number } };
  idMap: { key: string; value: IdMapping };
}

const DB_NAME = 'bookmark-hub';
const DB_VERSION = 1;

export function openHubDB() {
  return openDB<HubDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('batches', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      db.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      db.createObjectStore('idMap', { keyPath: 'oldId' });
    },
  });
}
