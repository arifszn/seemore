import { TOCProvider, TOCScrollArea, useTOCItems } from 'fumadocs-ui/components/toc';
import { TOCEmpty, TOCItem, TOCItems } from 'fumadocs-ui/components/toc/default';
import type { TocEntry } from '../../shared/types.js';
import { feature } from '../lib/features.js';

export function TocProvider({ toc, children }: { toc: TocEntry[]; children: React.ReactNode }) {
  return <TOCProvider toc={toc}>{children}</TOCProvider>;
}

export function Toc() {
  const items = useTOCItems();
  if (items.length === 0) return <nav className="seemore-toc" aria-label="On this page" />;

  return (
    <nav className="seemore-toc" aria-label="On this page">
      <p className="seemore-toc-title">On this page</p>
      <TOCScrollArea>
        <TocBody />
      </TOCScrollArea>
    </nav>
  );
}

/** `toc.integrate`: the same items, rendered inside the sidebar instead of its own rail. */
export function IntegratedToc() {
  const items = useTOCItems();
  if (items.length === 0) return null;
  return (
    <div className="seemore-toc-integrated">
      <TocBody />
    </div>
  );
}

function TocBody() {
  const items = useTOCItems();

  if (items.length === 0) return <TOCEmpty />;

  return (
    <TOCItems>
      {items.map((item) => (
        // `toc.follow` is TOCItem's own `autoScroll`: it keeps the active entry visible
        // using a scroll bounded to this container. A native `scrollIntoView` here — even
        // with `block: 'nearest'` — walks every scroll ancestor including the page, and in
        // engines that ignore the options it fights the reader's own scrolling.
        <TOCItem key={item.url} item={item} autoScroll={feature('toc.follow')} />
      ))}
    </TOCItems>
  );
}
