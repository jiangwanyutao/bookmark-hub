import { openDB, type DBSchema } from 'idb';
import type { Batch, IdMapping, Snapshot } from './history';
import type { ScanResult } from './scan/classify';
import type { IgnoredUrl, ScanRun, VpnHost } from './scan/scanner';
import type { BookmarkTags } from './ai/tags';

export interface HubDB extends DBSchema {
  batches: { key: string; value: Batch; indexes: { createdAt: number } };
  snapshots: { key: string; value: Snapshot; indexes: { createdAt: number } };
  idMap: { key: string; value: IdMapping };
  /** 按网址存：书签撤销恢复后 id 会变，网址不变；重复书签也只需请求一次 */
  scanResults: { key: string; value: ScanResult };
  scanRuns: { key: string; value: ScanRun };
  ignoredUrls: { key: string; value: IgnoredUrl };
  vpnHosts: { key: string; value: VpnHost };
  tags: { key: string; value: BookmarkTags };
}

const DB_NAME = 'bookmark-hub';
const DB_VERSION = 5;

export function openHubDB() {
  return openDB<HubDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('batches', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        db.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        db.createObjectStore('idMap', { keyPath: 'oldId' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('scanResults', { keyPath: 'url' });
        db.createObjectStore('scanRuns', { keyPath: 'id' });
      }
      if (oldVersion < 3) {
        db.createObjectStore('ignoredUrls', { keyPath: 'url' });
      }
      if (oldVersion < 4) {
        db.createObjectStore('vpnHosts', { keyPath: 'host' });
      }
      if (oldVersion < 5) {
        db.createObjectStore('tags', { keyPath: 'url' });
      }
    },
  });
}
