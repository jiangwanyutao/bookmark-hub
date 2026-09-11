import { browser } from 'wxt/browser';
import { openHubDB } from './db';
import type { BookmarksApi, Ctx } from './history';

let ctxPromise: Promise<Ctx> | undefined;

/** 页面内共用一个 IndexedDB 连接。 */
export function getHubCtx(): Promise<Ctx> {
  ctxPromise ??= openHubDB().then((db) => ({
    api: browser.bookmarks as BookmarksApi,
    db,
    now: Date.now,
  }));
  return ctxPromise;
}
