export const INVALID_JSON = 'AI 返回的内容不是有效的 JSON';

/** 容忍 ```json 代码块和前后说明文字：取第一个 { 到最后一个 }。 */
export function extractJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(INVALID_JSON);
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new Error(INVALID_JSON);
  }
}
