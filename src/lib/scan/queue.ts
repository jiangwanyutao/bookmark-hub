export interface QueueOptions<T> {
  /** 同时进行的任务上限 */
  concurrency: number;
  /** 同一个 key（如同一网站）同时进行的上限 */
  perKey: number;
  keyOf: (item: T) => string;
  /** 中止后不再取新任务，已开始的任务跑完即结束 */
  signal?: AbortSignal;
}

export function runQueue<T>(items: T[], worker: (item: T) => Promise<void>, opts: QueueOptions<T>): Promise<void> {
  return new Promise((resolve, reject) => {
    const waiting = [...items];
    const activeByKey = new Map<string, number>();
    let active = 0;
    let failed = false;

    const pump = () => {
      if (failed) return;
      // ponytail: 每次线性扫描等待队列找可运行项，最坏 O(n²)；上万条集中在少数网站时再按 key 分桶
      for (let i = 0; !opts.signal?.aborted && i < waiting.length && active < opts.concurrency; ) {
        const item = waiting[i]!;
        const key = opts.keyOf(item);
        if ((activeByKey.get(key) ?? 0) >= opts.perKey) {
          i += 1;
          continue;
        }
        waiting.splice(i, 1);
        active += 1;
        activeByKey.set(key, (activeByKey.get(key) ?? 0) + 1);
        worker(item).then(
          () => {
            active -= 1;
            activeByKey.set(key, activeByKey.get(key)! - 1);
            pump();
          },
          (e: unknown) => {
            failed = true;
            reject(e);
          },
        );
      }
      if (active === 0 && (opts.signal?.aborted || waiting.length === 0)) resolve();
    };

    pump();
  });
}
