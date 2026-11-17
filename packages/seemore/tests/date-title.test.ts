import { describe, expect, it } from 'vitest';
import { dateTitle } from '../src/app/lib/date-title.js';

describe('dateTitle', () => {
  it('formats a title derived from a date file name', () => {
    expect(dateTitle('/notes/2026-11-17', '2026 11 17')).toBe('17 Nov 2026');
    expect(dateTitle('/2026-01-03', '2026 01 03')).toBe('3 Jan 2026');
  });

  it('ignores a trailing slash in the url', () => {
    expect(dateTitle('/notes/2026-11-17/', '2026 11 17')).toBe('17 Nov 2026');
  });

  it('leaves a frontmatter title alone', () => {
    expect(dateTitle('/notes/2026-11-17', 'Kickoff')).toBeUndefined();
  });

  it('leaves names that are not dates alone', () => {
    expect(dateTitle('/notes/getting-started', 'Getting Started')).toBeUndefined();
    expect(dateTitle('/notes/2026-11', '2026 11')).toBeUndefined();
  });

  it('rejects impossible dates', () => {
    expect(dateTitle('/2026-13-01', '2026 13 01')).toBeUndefined();
    expect(dateTitle('/2026-02-30', '2026 02 30')).toBeUndefined();
    expect(dateTitle('/2028-02-29', '2028 02 29')).toBe('29 Feb 2028');
  });
});
