import type { Bookmark } from '../lib/bookmarks';

// javascript: 等链接不能从扩展页打开
const OPENABLE = /^(https?|ftp):/i;

export function BookmarkDetail({ bookmark }: { bookmark: Bookmark | undefined }) {
  if (!bookmark) return <aside className="detail muted">选择一个书签查看详情</aside>;

  return (
    <aside className="detail">
      <h2>{bookmark.title || '（无标题）'}</h2>
      <dl>
        <dt>网址</dt>
        <dd className="break">{bookmark.url}</dd>
        <dt>网站</dt>
        <dd>{bookmark.domain || '—'}</dd>
        <dt>目录</dt>
        <dd>{bookmark.folderPath}</dd>
        <dt>添加时间</dt>
        <dd>{bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleString('zh-CN') : '—'}</dd>
      </dl>
      {OPENABLE.test(bookmark.url) && (
        <a className="btn" href={bookmark.url} target="_blank" rel="noreferrer">
          打开
        </a>
      )}
    </aside>
  );
}
