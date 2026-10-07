import { describe, expect, it } from 'vitest';
import { buildDevArgs, parseReadyLine } from '../src/devProcess.js';

describe('parseReadyLine', () => {
  it('parses a well-formed ready line', () => {
    const line = JSON.stringify({ url: 'http://localhost:5173/', port: 5173, contentRoot: '/repo/docs', pageCount: 3 });
    expect(parseReadyLine(line)).toEqual({
      url: 'http://localhost:5173/',
      port: 5173,
      contentRoot: '/repo/docs',
      pageCount: 3,
    });
  });

  it('rejects a line that is not JSON', () => {
    expect(parseReadyLine('  seemore  http://localhost:4040/')).toBeUndefined();
  });

  it('rejects JSON missing a required field', () => {
    expect(parseReadyLine(JSON.stringify({ url: 'http://localhost:4040/', port: 4040 }))).toBeUndefined();
  });

  it('rejects JSON with a field of the wrong type', () => {
    const line = JSON.stringify({ url: 'http://localhost:4040/', port: '4040', contentRoot: '/repo', pageCount: 1 });
    expect(parseReadyLine(line)).toBeUndefined();
  });

  it('rejects a bare JSON value that is not an object', () => {
    expect(parseReadyLine('42')).toBeUndefined();
    expect(parseReadyLine('null')).toBeUndefined();
  });
});

describe('buildDevArgs', () => {
  it('always requests an ephemeral port, no open, and JSON output', () => {
    expect(buildDevArgs('/repo/docs')).toEqual(['/repo/docs', '--port', '0', '--no-open', '--json']);
  });
});
