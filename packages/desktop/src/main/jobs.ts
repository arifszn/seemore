/**
 * One-off CLI runs, export and build, each in its own utility process (DESKTOP-SPEC §7). The
 * CLI exits when the command is done (seemore §11 item 4), and the exit code is the result.
 */

/** The slice of Electron's `UtilityProcess` a job uses. */
export interface JobProcess {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  kill(): boolean;
  on(event: 'exit', listener: (code: number) => void): unknown;
}

export interface Job {
  /** The exit code. A job that was killed resolves too, with whatever code the OS reports. */
  done: Promise<number>;
  /** Recent combined output, for an error message. */
  output(): string;
  kill(): void;
}

const OUTPUT_TAIL = 64 * 1024;

export function startJob(child: JobProcess, onOutput?: (text: string) => void): Job {
  let output = '';
  const collect = (chunk: Buffer | string) => {
    const text = chunk.toString();
    output = (output + text).slice(-OUTPUT_TAIL);
    onOutput?.(text);
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  let exited = false;
  const done = new Promise<number>((resolve) => {
    child.on('exit', (code) => {
      exited = true;
      resolve(code);
    });
  });

  return {
    done,
    output: () => output,
    kill: () => {
      if (!exited) child.kill();
    },
  };
}

/** Strips the ANSI colour codes the CLI prints, for a log shown as plain text. */
export function stripAnsi(text: string): string {
  // oxlint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}
