import { Link } from 'react-router';
import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { findNeighbour } from 'fumadocs-core/page-tree';
import type * as PageTree from 'fumadocs-core/page-tree';
import { config } from 'virtual:openmd/config';

/** `navigation.footer`: previous / next links. */
export function PageFooter({ tree, url }: { tree: PageTree.Root; url: string }) {
  const { previous, next } = findNeighbour(tree, url);
  if (previous === undefined && next === undefined) return null;

  return (
    <nav className="openmd-page-footer" aria-label="Previous and next page">
      {previous === undefined ? (
        <span />
      ) : (
        <Link to={previous.url} viewTransition className="openmd-prev">
          <ArrowLeft aria-hidden="true" />
          <span>{previous.name}</span>
        </Link>
      )}
      {next === undefined ? (
        <span />
      ) : (
        <Link to={next.url} viewTransition className="openmd-next">
          <span>{next.name}</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}

export function SiteFooter() {
  if (config.footer === undefined) return null;
  return (
    <footer className="openmd-site-footer">
      {config.footer.text === undefined ? undefined : <p>{config.footer.text}</p>}
      {(config.footer.links ?? []).map((link) => (
        <a key={link.link} href={link.link}>
          {link.text}
        </a>
      ))}
    </footer>
  );
}

/** `navigation.top`. */
export function BackToTop() {
  return (
    <button
      type="button"
      className="openmd-back-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ArrowUp aria-hidden="true" />
      <span>Back to top</span>
    </button>
  );
}
