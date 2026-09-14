import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// 状态用小药丸表达，颜色只做辅助，文字本身说明状态
const TONE = {
  ok: 'bg-accent text-accent-foreground',
  warn: 'bg-warn text-warn-foreground',
  danger: 'bg-coral text-coral-foreground',
  neutral: 'bg-muted text-muted-foreground',
} as const;

export type PillTone = keyof typeof TONE;

export function Pill({ tone = 'neutral', className, children }: { tone?: PillTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
