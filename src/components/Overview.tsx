import { topDomains, type BookmarkIndex } from '../lib/bookmarks';

const TOP_DOMAIN_LIMIT = 10;

const formatCount = (n: number) => n.toLocaleString('zh-CN');

export function Overview({ index }: { index: BookmarkIndex }) {
  const domains = topDomains(index.bookmarks, TOP_DOMAIN_LIMIT);

  return (
    <section className="overview">
      <h1>我的书签</h1>

      <div className="cards">
        <div className="card">
          <strong>{formatCount(index.bookmarks.length)}</strong>
          <span>总书签</span>
        </div>
        <div className="card">
          <strong>{formatCount(index.folderCount)}</strong>
          <span>文件夹</span>
        </div>
      </div>

      <h2>收藏最多的网站</h2>
      {domains.length > 0 ? (
        <ol className="domains">
          {domains.map((d) => (
            <li key={d.domain}>
              <span>{d.domain}</span>
              <span className="num">{formatCount(d.count)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">还没有网页书签。</p>
      )}
    </section>
  );
}
