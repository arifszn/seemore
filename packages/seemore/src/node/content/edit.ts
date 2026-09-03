/**
 * Writing an edited block back into its source file.
 *
 * The unit is a byte range that a rehype plugin stamped onto the rendered block
 * (`rehypeSeemorePositions`), so an edit replaces exactly the characters that produced that
 * block and leaves every other character in the file untouched — no reflow, no
 * re-serialisation, nothing for a Markdown printer to normalise on its way past.
 */

export interface SpliceRequest {
  /** Offsets into the file, as JavaScript string indices. */
  start: number;
  end: number;
  /**
   * The slice the client was originally handed, unmodified.
   *
   * Kept separate from `text` on purpose: a `<textarea>` reports its value with `\n`
   * regardless of what was put into it, so the round-tripped copy cannot be compared against
   * a CRLF file. This one never went through the DOM.
   */
  expected: string;
  /** The replacement, with whatever line endings the browser saw fit to give us. */
  text: string;
}

export type SpliceResult =
  | { ok: true; content: string }
  | { ok: false; status: number; error: string };

export function spliceSource(content: string, request: SpliceRequest): SpliceResult {
  const { start, end, expected, text } = request;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > content.length) {
    return { ok: false, status: 400, error: 'The edited range is not inside this file.' };
  }

  // The file may have moved under us — an editor saved it, or a previous edit landed — and
  // the offsets the browser is holding would then point at unrelated text. Comparing the
  // slice is cheaper than versioning and catches every case that matters.
  if (content.slice(start, end) !== expected) {
    return {
      ok: false,
      status: 409,
      error: 'This file changed since the page was rendered. Reload and try the edit again.',
    };
  }

  return { ok: true, content: content.slice(0, start) + withEol(text, dominantEol(content)) + content.slice(end) };
}

/**
 * The line ending the file already uses.
 *
 * Without this, editing a multi-line block on Windows silently rewrites its `\r\n` to `\n` —
 * the browser normalises a textarea's value — and the next `git diff` shows every line of the
 * block as changed. Mixed endings within one file are decided by majority, so the common case
 * of a file that is already consistent stays consistent.
 */
export function dominantEol(content: string): '\r\n' | '\n' {
  const crlf = content.match(/\r\n/g)?.length ?? 0;
  const lf = (content.match(/\n/g)?.length ?? 0) - crlf;
  return crlf > lf ? '\r\n' : '\n';
}

function withEol(text: string, eol: '\r\n' | '\n'): string {
  const normalised = text.replace(/\r\n/g, '\n');
  return eol === '\n' ? normalised : normalised.replace(/\n/g, '\r\n');
}
