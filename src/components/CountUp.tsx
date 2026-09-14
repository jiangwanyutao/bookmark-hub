import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 600;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** 数字从上一次的值滚到新值；系统开了「减少动态效果」时直接显示。 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const origin = from.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setShown(Math.round(origin + (value - origin) * easeOutCubic(t)));
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{shown.toLocaleString('zh-CN')}</>;
}
