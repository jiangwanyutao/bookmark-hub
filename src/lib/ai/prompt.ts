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

const SYSTEM_PROMPT = [
  '你帮用户整理浏览器书签：为每个书签从「现有目录」里挑选最合适的一个。',
  '- 优先从现有目录中选择，folder 必须与列表里的路径完全一致。',
  '- 如果至少 5 个书签明显属于某个现有目录下还没有的同一个子主题，可以建议新建子目录：folder 写「现有目录 / 新目录名」，并加上 "isNewFolder": true；新目录名要简短。',
  '- 没有明显合适的目录时，不给这个书签建议。',
  '- confidence 是 0 到 1 之间的数字，表示你有多确定。',
  '- reason 用一句简短的中文说明理由。',
  '只输出 JSON，格式：{"suggestions":[{"ref":"b1","folder":"书签栏 / 开发","confidence":0.9,"reason":"……"}]}',
].join('\n');

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

export function buildMessages(items: AiItem[], folderPaths: string[]): ChatMessage[] {
  const user = [
    '现有目录：',
    ...folderPaths.map((p) => `- ${p}`),
    '',
    '待整理的书签（每行一个 JSON）：',
    ...items.map((item) => JSON.stringify(item)),
  ].join('\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}
