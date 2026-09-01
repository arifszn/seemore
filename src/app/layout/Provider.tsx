import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams, useRevalidator } from 'react-router';
import { FrameworkProvider } from 'fumadocs-core/framework';
import { RootProvider } from 'fumadocs-ui/provider/base';
import { decodePath } from '../../shared/base.js';
import { SearchDialog } from '../search/SearchDialog.js';

/**
 * fumadocs' React Router bindings, with one change.
 *
 * Its `usePathname` returns `useLocation().pathname` verbatim, which the browser reports
 * percent-encoded. Every active-state comparison in fumadocs — the highlighted sidebar link,
 * whether a folder starts open — then measures `/gu%C3%ADa/…` against a page tree holding
 * `/guía/…` and finds no match. Prerendering runs against a memory router, where the
 * pathname is *not* encoded, so the two disagree and hydration fails on any page with a
 * non-ASCII route. Decoding here makes both sides read the same URL.
 */
function usePathname(): string {
  return decodePath(useLocation().pathname);
}

function useRouter() {
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  return useMemo(
    () => ({
      push(url: string) {
        void navigate(url);
      },
      refresh() {
        void revalidator.revalidate();
      },
    }),
    [navigate, revalidator],
  );
}

/** fumadocs' own Link binding, plus the view transition that gives navigation the SPA feel. */
function Link({ href, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) {
  return <RouterLink to={href ?? ''} viewTransition {...props} />;
}

export function OpenmdProvider({ children }: { children: ReactNode }) {
  return (
    <FrameworkProvider
      usePathname={usePathname}
      useParams={() => useParams() as Record<string, string | string[]>}
      useRouter={useRouter}
      Link={Link}
    >
      <RootProvider
        search={{ enabled: true, SearchDialog }}
        theme={{ attribute: 'class', defaultTheme: 'system', enableSystem: true }}
      >
        {children}
      </RootProvider>
    </FrameworkProvider>
  );
}
