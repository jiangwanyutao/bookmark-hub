import { skipReason, stripSensitiveParams } from '../scan/rules';

/** 发给 AI 的信息范围（PRD §20）。 */
export type Privacy = 'title' | 'title_domain' | 'title_url';

export const PRIVACY_LABEL: Record<Privacy, string> = {
  title: '仅标题',
  title_domain: '标题 + 域名（推荐）',
  title_url: '标题 + 网址（去掉登录凭据类参数）',
};

/** 发给 AI 的一条书签；ref 是本次请求内的短编号，避免暴露真实 id、也防止模型编造 id。 */
export interface AiItem {
  ref: string;
  title: string;
  domain?: string;
  url?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 按隐私等级组装发给 AI 的内容；内网书签一律不发，返回 null。 */
export function toAiItem(
  ref: string,
  bookmark: { title: string; url: string; domain: string },
  privacy: Privacy,
): AiItem | null {
  if (skipReason(bookmark.url) === 'intranet') return null;
  if (privacy === 'title') return { ref, title: bookmark.title };
  if (privacy === 'title_domain') return { ref, title: bookmark.title, domain: bookmark.domain };
  return { ref, title: bookmark.title, url: stripSensitiveParams(bookmark.url) };
}
