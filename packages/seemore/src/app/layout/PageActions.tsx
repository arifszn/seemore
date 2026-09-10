import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { config } from 'virtual:seemore/config';
import type { ActionId } from '../../shared/types.js';
import { exportPageAsHtml } from '../export/exportPage.js';

/**
 * The actions the button can hold, keyed by the id a config's `pageActions` array names.
 * A new action is a new id in `ACTION_IDS`, one entry here, and the menu picks it up —
 * no component changes.
 */
const ACTIONS: Record<ActionId, { label: string; icon: ReactNode; run: () => Promise<void> }> = {
  'export-html': { label: 'Export as HTML', icon: <Download aria-hidden="true" />, run: exportPageAsHtml },
};

/**
 * The page-actions button: one dropdown above the article, holding the actions the site
 * enables, in the order the config lists them. Chrome, not content — print hides it, and
 * the export never touches it because the export takes the article only.
 */
export function PageActions() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const ids = config.pageActions.filter((id) => id in ACTIONS);
  if (ids.length === 0) return undefined;

  return (
    <div className="seemore-page-actions" ref={root}>
      <button
        type="button"
        className="seemore-page-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Actions
        <ChevronDown aria-hidden="true" />
      </button>

      {open ? (
        <div className="seemore-page-actions-menu" role="menu">
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className="seemore-page-actions-item"
              onClick={() => {
                setOpen(false);
                void ACTIONS[id].run().catch((cause: unknown) => {
                  const message = cause instanceof Error ? cause.message : String(cause);
                  window.alert(`Could not run this action: ${message}`);
                });
              }}
            >
              {ACTIONS[id].icon}
              {ACTIONS[id].label}
            </button>
          ))}
        </div>
      ) : undefined}
    </div>
  );
}
