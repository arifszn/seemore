const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `17 Nov 2026` for a page whose file is named for a date (`2026-11-17.md`) and whose title
 * was derived from that name (`2026 11 17`); `undefined` for every other page.
 *
 * Only the generated index uses it — the sidebar keeps the derived title. A frontmatter
 * `title` never matches the derived one, so a title someone wrote is left alone. Month names
 * are fixed rather than taken from `Intl`, so prerendered HTML and the browser always agree.
 */
export function dateTitle(url: string, title: string | undefined): string | undefined {
  const slug = url.replace(/\/+$/, '').split('/').at(-1) ?? '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slug);
  if (match === null) return undefined;
  if (title !== slug.replaceAll('-', ' ')) return undefined;

  const [, year, month, day] = match;
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > daysIn(Number(year), m)) return undefined;
  return `${d} ${MONTHS[m - 1]} ${year}`;
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
