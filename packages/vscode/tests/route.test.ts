import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRouteRequestUrl, fetchRoute } from '../src/route.js';

describe('buildRouteRequestUrl', () => {
  it('builds a request URL with the file path as a query parameter', () => {
    expect(buildRouteRequestUrl('http://localhost:5173', '/repo/docs/guide/a.md')).toBe(
      'http://localhost:5173/__seemore/route?file=%2Frepo%2Fdocs%2Fguide%2Fa.md',
    );
  });

  it('encodes characters that would otherwise break the query string', () => {
    const url = buildRouteRequestUrl('http://localhost:5173', '/repo/docs/a b & c.md');
    expect(url).toContain('file=%2Frepo%2Fdocs%2Fa+b+%26+c.md');
  });
});

describe('fetchRoute', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server === undefined) return;
    await new Promise((resolve) => server?.close(() => resolve(undefined)));
    server = undefined;
  });

  function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
    server = createServer(handler);
    return new Promise((resolvePromise) => {
      server?.listen(0, '127.0.0.1', () => {
        const address = server?.address();
        if (address === null || typeof address !== 'object') throw new Error('no address');
        resolvePromise(`http://127.0.0.1:${address.port}`);
      });
    });
  }

  it('returns the resolved URL on a 200', async () => {
    const origin = await listen((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ url: '/guide/intro' }));
    });

    expect(await fetchRoute(origin, '/repo/docs/guide/intro.md')).toEqual({ ok: true, url: '/guide/intro' });
  });

  it('surfaces the server\'s error message on a 404', async () => {
    const origin = await listen((_req, res) => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'excluded, or lost a duplicate slug' }));
    });

    expect(await fetchRoute(origin, '/repo/docs/excluded.md')).toEqual({
      ok: false,
      status: 404,
      error: 'excluded, or lost a duplicate slug',
    });
  });
});
