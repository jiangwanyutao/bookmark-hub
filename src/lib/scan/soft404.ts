// 软 404：服务器返回 200，但页面其实是「找不到」页。只用标题关键词和落地路径判断，
// 结果只进「待确认」，不判失效。
// ponytail: 纯关键词启发式；若漏判多，再加「请求同站随机不存在网址、比对标题」的探测

// 404 前后不能紧挨数字或小数点，避免「4040」「2.404」这类误判；
// 中文要求「页面/内容/商品…」+「已(被)删除/下架」，避免「如何恢复已删除的文件」这类正常标题
const NOT_FOUND_TITLE =
  /(?<![\d.])404(?!\d)|not\s*found|page\s+(?:does\s*not|doesn['’]t)\s+exist|页面不存在|找不到(?:该|这个|您要的)?页面|无法找到(?:该|这个)?页面|(?:页面|内容|文章|商品|视频|帖子)已(?:被)?(?:删除|下架)/i;

const NOT_FOUND_PATH = /\/(?:404|not[-_]?found|error\/404)(?:\.html?)?\/?$/i;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** 取 HTML 里第一个 <title> 的文字；没有时返回 null。 */
export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = decodeEntities(match[1]!).replace(/\s+/g, ' ').trim();
  return title || null;
}

const pathnameOf = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
};

export function looksLikeSoft404({
  requestedUrl,
  finalUrl,
  title,
}: {
  requestedUrl: string;
  finalUrl?: string;
  title?: string | null;
}): boolean {
  if (title && NOT_FOUND_TITLE.test(title)) return true;
  const landed = pathnameOf(finalUrl ?? requestedUrl);
  return landed !== null && NOT_FOUND_PATH.test(landed) && landed !== pathnameOf(requestedUrl);
}
