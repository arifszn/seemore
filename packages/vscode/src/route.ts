/**
 * Asks the running dev server what URL an absolute file path resolved to, rather than
 * recomputing `resolveRoutes` here — that resolution is corpus-level (index vs. README,
 * duplicate slugs, `exclude`, `base`) and a local copy would drift.
 */

export function buildRouteRequestUrl(origin: string, absFile: string): string {
  const url = new URL('/__seemore/route', origin);
  url.searchParams.set('file', absFile);
  return url.toString();
}

export type RouteResult = { ok: true; url: string } | { ok: false; status: number; error: string };

/**
 * `origin` is the server's own `http://localhost:<port>` — not the (possibly rewritten by
 * `asExternalUri`) URL the webview loads, since this fetch runs in the extension host.
 */
export async function fetchRoute(origin: string, absFile: string): Promise<RouteResult> {
  const response = await fetch(buildRouteRequestUrl(origin, absFile));
  const body = (await response.json()) as { url?: string; error?: string };

  if (response.ok && typeof body.url === 'string') {
    return { ok: true, url: body.url };
  }

  return { ok: false, status: response.status, error: body.error ?? `Unexpected response (${response.status}).` };
}
