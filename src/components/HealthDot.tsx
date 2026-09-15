import type { Health } from '@/lib/scan/classify';
import { cn } from '@/lib/utils';

export type HealthState = Health | 'unscanned';

/** 状态名与圆点形态：除颜色外，待确认是空心圈、还没检查是虚线圈。 */
export const HEALTH_META: Record<HealthState, { label: string; dot: string }> = {
  healthy: { label: '正常', dot: 'bg-primary' },
  redirected: { label: '网址已搬家', dot: 'bg-warn-indicator' },
  broken: { label: '失效', dot: 'bg-destructive' },
  suspicious: { label: '待确认', dot: 'border-[1.5px] border-warn-indicator' },
  unknown: { label: '待确认', dot: 'border-[1.5px] border-warn-indicator' },
  unscanned: { label: '还没检查', dot: 'border border-dashed border-muted-foreground' },
};

/** 状态点；装饰性，调用方负责给出文字。10px 才看得清描边圈。 */
export function HealthDot({ health, className }: { health: HealthState; className?: string }) {
  return <span aria-hidden title={HEALTH_META[health].label} className={cn('size-2.5 shrink-0 rounded-full', HEALTH_META[health].dot, className)} />;
}
