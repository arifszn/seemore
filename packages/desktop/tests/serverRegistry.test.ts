import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerRegistry, type ServerProcess } from '../src/main/serverRegistry.js';

class FakeProcess extends EventEmitter implements ServerProcess {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  constructor(readonly root: string) {
    super();
  }

  ready(port = 4100): void {
    this.stdout.write(`noise before the ready line\n`);
    this.stdout.write(`${JSON.stringify({ url: `http://localhost:${port}/`, port, contentRoot: this.root, pageCount: 1 })}\n`);
  }

  kill(): boolean {
    this.killed = true;
    this.emit('exit', 0);
    return true;
  }

  crash(stderr: string): void {
    this.stderr.write(stderr);
    // Let the stderr chunk land before the exit, as a real process's would.
    setImmediate(() => this.emit('exit', 1));
  }
}

function setup(options: { graceMs?: number; readyTimeoutMs?: number } = {}) {
  const spawned: FakeProcess[] = [];
  const crashes: { root: string; stderr: string }[] = [];
  const registry = new ServerRegistry({
    fork: (root) => {
      const child = new FakeProcess(root);
      spawned.push(child);
      return child;
    },
    onCrash: (root, stderr) => crashes.push({ root, stderr }),
    ...options,
  });
  return { registry, spawned, crashes };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ServerRegistry', () => {
  it('starts one server per root and shares it between leases', async () => {
    const { registry, spawned } = setup();

    const first = registry.acquire('/a');
    const second = registry.acquire('/a');
    spawned[0]!.ready(4101);

    const [one, two] = await Promise.all([first, second]);
    expect(spawned).toHaveLength(1);
    expect(one.server.origin).toBe('http://localhost:4101');
    expect(two.server).toBe(one.server);
  });

  it('keeps a released server alive for the grace period, and reuses it if reacquired', async () => {
    vi.useFakeTimers();
    const { registry, spawned } = setup({ graceMs: 1000 });

    const pending = registry.acquire('/a');
    spawned[0]!.ready();
    (await pending).release();

    vi.advanceTimersByTime(999);
    expect(spawned[0]!.killed).toBe(false);
    const again = await registry.acquire('/a');
    vi.advanceTimersByTime(5000);
    expect(spawned[0]!.killed).toBe(false);
    expect(spawned).toHaveLength(1);

    again.release();
    vi.advanceTimersByTime(1000);
    expect(spawned[0]!.killed).toBe(true);
    expect(registry.roots()).toEqual([]);
  });

  it('kills only when the last lease is released, and ignores a double release', async () => {
    vi.useFakeTimers();
    const { registry, spawned } = setup({ graceMs: 10 });

    const pending = Promise.all([registry.acquire('/a'), registry.acquire('/a')]);
    spawned[0]!.ready();
    const [one, two] = await pending;

    one.release();
    one.release();
    vi.advanceTimersByTime(100);
    expect(spawned[0]!.killed).toBe(false);

    two.release();
    vi.advanceTimersByTime(100);
    expect(spawned[0]!.killed).toBe(true);
  });

  it('rejects, and forgets the root, when the process exits before it is ready', async () => {
    const { registry, spawned } = setup();

    const pending = registry.acquire('/a');
    spawned[0]!.crash('boom');

    await expect(pending).rejects.toThrow(/exited before it was ready[\s\S]*boom/);
    expect(registry.roots()).toEqual([]);
  });

  it('rejects and kills the process when no ready line arrives in time', async () => {
    const { registry, spawned } = setup({ readyTimeoutMs: 50 });

    await expect(registry.acquire('/a')).rejects.toThrow(/did not report readiness/);
    expect(spawned[0]!.killed).toBe(true);
  });

  it('reports a crash after readiness with the recent stderr, and a fresh acquire starts anew', async () => {
    const { registry, spawned, crashes } = setup();

    const pending = registry.acquire('/a');
    spawned[0]!.ready();
    const lease = await pending;

    spawned[0]!.crash('vite: out of memory');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(crashes).toEqual([{ root: '/a', stderr: 'vite: out of memory' }]);
    expect(registry.roots()).toEqual([]);

    // The dead server's lease no longer counts against a new one.
    lease.release();
    const next = registry.acquire('/a');
    spawned[1]!.ready(4200);
    expect((await next).server.origin).toBe('http://localhost:4200');
  });

  it('does not report a crash for a server it stopped itself', async () => {
    const { registry, spawned, crashes } = setup();

    const pending = registry.acquire('/a');
    spawned[0]!.ready();
    await pending;

    registry.killAll();
    expect(spawned[0]!.killed).toBe(true);
    expect(crashes).toEqual([]);
  });

  it('keeps draining stdout after readiness', async () => {
    const { registry, spawned } = setup();

    const pending = registry.acquire('/a');
    spawned[0]!.ready();
    await pending;

    expect(spawned[0]!.stdout.readableFlowing).toBe(true);
  });
});
