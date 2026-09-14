import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** 面板：白色卡片 + 细描边；有标题时带一行表头。高度由外层决定，内容区自己滚动。 */
export function Panel({ title, meta, actions, children, className, bodyClassName }: Props) {
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-card', className)}>
      {(title || actions) && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {meta && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{meta}</span>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}
