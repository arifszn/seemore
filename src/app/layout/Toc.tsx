import { useEffect, useRef } from 'react';
import { TOCProvider, TOCScrollArea, useActiveAnchor, useTOCItems } from 'fumadocs-ui/components/toc';
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
  const active = useActiveAnchor();
  const container = useRef<HTMLDivElement>(null);

  // `toc.follow`: keep the active entry visible as the page scrolls.
  useEffect(() => {
    if (!feature('toc.follow') || active === undefined || container.current === null) return;
    const element = container.current.querySelector(`a[href="#${CSS.escape(active)}"]`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  if (items.length === 0) return <TOCEmpty />;

  return (
    <div ref={container}>
      <TOCItems>
        {items.map((item) => (
          <TOCItem key={item.url} item={item} />
        ))}
      </TOCItems>
    </div>
  );
}
