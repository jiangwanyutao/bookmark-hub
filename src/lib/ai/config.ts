import { browser } from 'wxt/browser';
import type { Privacy } from './prompt';

/** OpenAI 兼容接口配置，只存本机 storage.local，不随 Chrome 同步。 */
export interface AiConfig {
  /** 到 /v1 这一级，不含 /chat/completions，不以 / 结尾 */
  baseUrl: string;
  apiKey: string;
  model: string;
  privacy: Privacy;
}

const STORAGE_KEY = 'aiConfig';
const PRIVACY_LEVELS: Privacy[] = ['title', 'title_domain', 'title_url'];

// storage 里的数据视为外部输入，读出来先校验
function isAiConfig(value: unknown): value is AiConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.baseUrl === 'string' &&
    typeof v.apiKey === 'string' &&
    typeof v.model === 'string' &&
    PRIVACY_LEVELS.includes(v.privacy as Privacy)
  );
}

export async function loadAiConfig(): Promise<AiConfig | null> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value: unknown = stored[STORAGE_KEY];
  return isAiConfig(value) ? value : null;
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: config });
}

/** 只接受 http(s) 地址；去掉结尾的 / 和误填的 /chat/completions。无效时返回 null。 */
export function normalizeBaseUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.origin}${u.pathname}`.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** 必须是点击事件里的第一个 await；已授权时直接返回 true。 */
export const requestAiHostPermission = (baseUrl: string) =>
  browser.permissions.request({ origins: [`${new URL(baseUrl).origin}/*`] });
