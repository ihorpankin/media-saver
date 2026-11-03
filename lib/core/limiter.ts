/**
 * Limits the number of tasks running at the same time.
 * Tasks over the limit wait their turn in arrival order.
 */
export function createLimiter(concurrency: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  const next = () => {
    active--;
    waiting.shift()?.();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++;
        task().then(resolve, reject).finally(next);
      };
      if (active < concurrency) start();
      else waiting.push(start);
    });
  };
}
