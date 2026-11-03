import { describe, expect, it } from 'vitest';
import { createLimiter } from './limiter';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createLimiter', () => {
  it('does not run more tasks than allowed', async () => {
    const run = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
    };
    await Promise.all(Array.from({ length: 6 }, () => run(task)));
    expect(peak).toBe(2);
  });

  it('one task failing does not stop the queue', async () => {
    const run = createLimiter(1);
    const failed = run(() => Promise.reject(new Error('boom')));
    const ok = run(async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    await expect(ok).resolves.toBe('ok');
  });
});
