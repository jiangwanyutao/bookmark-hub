import { useState } from 'react';
import { cn } from '@/lib/utils';

// 浏览器本地缓存的网站图标（favicon 权限），不发网络请求
export const faviconUrl = (pageUrl: string, size = 64) =>
  `${location.origin}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;

interface Props {
  url: string;
  /** 取不到图标时显示首字 */
  name: string;
  className?: string;
}

/** 网站图标；装饰性，旁边总有标题文字，所以对读屏隐藏。换书签时用 key 重置加载失败状态。 */
export function Favicon({ url, name, className }: Props) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-semibold text-muted-foreground',
        className,
      )}
    >
      {broken ? (
        name.slice(0, 1).toUpperCase()
      ) : (
        <img src={faviconUrl(url, 32)} alt="" className="size-full object-contain" onError={() => setBroken(true)} />
      )}
    </span>
  );
}
