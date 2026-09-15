import type { ReactNode } from 'react';

/**
 * 页面外框：铺满主区域，页头与面板之间 gap-4。
 * 最小高度是「一屏放下」的下限，视口更矮时主区域滚动：总览多一行统计卡用 640px，智能整理 600px，其余 560px。
 * 类名写成字面量，Tailwind 才扫描得到。
 */
export const pageLayout = (minHeight = 'min-h-[560px]') => `flex h-full ${minHeight} flex-col gap-4 px-6 py-5`;

/** 页头：标题 + 一行灰色副标题 + 右侧操作。 */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {/* ml-auto：窄屏换行后操作仍靠右 */}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
