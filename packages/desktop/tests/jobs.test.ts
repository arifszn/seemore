import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { startJob, stripAnsi, type JobProcess } from '../src/main/jobs.js';

class FakeJob extends EventEmitter implements JobProcess {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kills = 0;
  kill(): boolean {
    this.kills += 1;
    this.emit('exit', 143);
    return true;
  }
}

describe('startJob', () => {
  it('streams both outputs and resolves with the exit code', async () => {
    const child = new FakeJob();
    const seen: string[] = [];
    const job = startJob(child, (text) => seen.push(text));

    child.stdout.write('building\n');
    child.stderr.write('a warning\n');
    await new Promise((resolve) => setImmediate(resolve));
    child.emit('exit', 0);

    expect(await job.done).toBe(0);
    expect(seen.join('')).toBe('building\na warning\n');
    expect(job.output()).toBe('building\na warning\n');
  });

  it('kills a running job once, and not one that has already exited', async () => {
    const running = new FakeJob();
    const job = startJob(running);
    job.kill();
    job.kill();
    expect(running.kills).toBe(1);
    expect(await job.done).toBe(143);

    const finished = new FakeJob();
    const other = startJob(finished);
    finished.emit('exit', 1);
    await other.done;
    other.kill();
    expect(finished.kills).toBe(0);
  });
});

describe('stripAnsi', () => {
  it('removes colour codes', () => {
    expect(stripAnsi('\u001b[32mseemore\u001b[39m  wrote dist')).toBe('seemore  wrote dist');
  });
});
