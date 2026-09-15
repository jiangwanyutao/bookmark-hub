import { useEffect, useState, type CSSProperties } from 'react';
import { faviconUrl, hasRealFavicon } from '@/lib/favicon';
import { cn } from '@/lib/utils';

// 按容器最大尺寸要图，小图放大会发虚
const ICON_SIZE = 64;

interface Props {
  url: string;
  /** 取不到图标时显示首字 */
  name: string;
  className?: string;
  /** 给首字底板着色 */
  style?: CSSProperties;
}

/** 网站图标；浏览器没缓存时显示首字。装饰性，旁边总有标题文字，所以对读屏隐藏。 */
export function Favicon({ url, name, className, style }: Props) {
  // 记下确认有图标的网址，换网址时自然回到首字，不用 key 重置
  const [realUrl, setRealUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void hasRealFavicon(url, ICON_SIZE).then((ok) => {
      if (alive && ok) setRealUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-semibold text-muted-foreground',
        className,
      )}
    >
      {realUrl === url ? (
        <img src={faviconUrl(url, ICON_SIZE)} alt="" className="size-full object-contain" onError={() => setRealUrl(null)} />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
