import { useCallback, useEffect, useRef, useState } from 'react';
import type { RouteEntry } from '../../shared/types.js';

/**
 * Editing a block of a page from the browser.
 *
 * What is edited is the block's **Markdown source**, not its rendered HTML. A rehype plugin
 * stamped every editable block with its `start:end` offsets into the file, so a save replaces
 * exactly those characters and every other byte of the file is left alone — no HTML-to-
 * Markdown round trip to mangle a table, a fence or a link reference, and no whole-file
 * reflow in the diff.
 *
 * Nothing here re-renders the page. The dev server writes the file, the watcher notices, and
 * the page hot-reloads through the same path an edit made in an editor takes.
 */

const ENDPOINT = '/__seemore/source';

interface Editing {
  element: HTMLElement;
  start: number;
  end: number;
  /**
   * The slice exactly as the server sent it, kept out of the DOM.
   *
   * A textarea reports its value with `\n` whatever was put into it, so a CRLF file's block
   * cannot be compared against the copy that came back through the editor. This is the copy
   * the server checks the file against.
   */
  original: string;
  top: number;
  left: number;
  width: number;
}

export function InlineEditor({ entry }: { entry: RouteEntry }) {
  const layer = useRef<HTMLDivElement | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const [editing, setEditing] = useState<Editing | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  /**
   * Set when a save was refused, which in practice means the file moved under the offsets
   * this editor is holding. It disarms the automatic save-on-blur: the text on screen is
   * stale by definition, and leaving blur armed means a later click — or navigating away —
   * silently commits it the moment the file happens to match `original` again.
   */
  const [refused, setRefused] = useState(false);

  const close = useCallback(() => {
    setEditing((current) => {
      current?.element.classList.remove('seemore-editing');
      return undefined;
    });
    setError(undefined);
    setRefused(false);
  }, []);

  // The article is this layer's own parent, so there is no ref to thread down from the layout.
  const article = () => layer.current?.parentElement ?? undefined;

  useEffect(() => {
    const host = article();
    if (host === undefined) return;

    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target === null) return;
      // A link would have navigated on the first of the two clicks. Leave it alone; the rest
      // of the paragraph around it still opens the editor.
      if (target.closest('a') !== null) return;

      const block = target.closest<HTMLElement>('[data-seemore-pos]');
      if (block === null || !host.contains(block)) return;

      const [start, end] = (block.dataset['seemorePos'] ?? '').split(':').map(Number);
      if (!Number.isInteger(start) || !Number.isInteger(end)) return;

      event.preventDefault();
      void open(block, start as number, end as number);
    };

    const open = async (block: HTMLElement, start: number, end: number) => {
      const query = new URLSearchParams({ file: entry.absPath, start: String(start), end: String(end) });
      let original: string;
      try {
        const response = await fetch(`${ENDPOINT}?${query.toString()}`);
        const body = (await response.json()) as { text?: string; error?: string };
        if (!response.ok || typeof body.text !== 'string') {
          setError(body.error ?? 'Could not read this block from the file.');
          return;
        }
        original = body.text;
      } catch {
        setError('Could not reach the dev server.');
        return;
      }

      // Measured against the article, which is the positioning context of the layer.
      const host = article();
      if (host === undefined) return;
      const bounds = host.getBoundingClientRect();
      const rect = block.getBoundingClientRect();

      block.classList.add('seemore-editing');
      setError(undefined);
      setRefused(false);
      setEditing({
        element: block,
        start,
        end,
        original,
        top: rect.top - bounds.top,
        left: rect.left - bounds.left,
        width: rect.width,
      });
    };

    host.addEventListener('dblclick', onDoubleClick);
    return () => host.removeEventListener('dblclick', onDoubleClick);
  }, [entry.absPath]);

  // The block is hidden rather than removed while it is edited, so the page does not jump.
  // If this component goes away mid-edit — a navigation, a hot reload — put it back.
  useEffect(() => () => editing?.element.classList.remove('seemore-editing'), [editing]);

  const save = useCallback(async () => {
    const current = editing;
    const field = textarea.current;
    if (current === undefined || field === null || saving || refused) return;

    // Both sides normalised: a textarea reports `\n` even for the `\r\n` a CRLF file gave it,
    // so comparing raw would make every no-op edit on Windows look like a change and rewrite
    // the file — same bytes, but a fresh mtime and a pointless reload.
    if (field.value.replace(/\r\n/g, '\n') === current.original.replace(/\r\n/g, '\n')) {
      close();
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: entry.absPath,
          start: current.start,
          end: current.end,
          expected: current.original,
          text: field.value,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'The edit could not be saved.');
        setRefused(true);
        return;
      }
      // The watcher takes it from here: the file changed, so the page reloads its own module.
      close();
    } catch {
      setError('Could not reach the dev server.');
      setRefused(true);
    } finally {
      setSaving(false);
    }
  }, [editing, entry.absPath, close, saving, refused]);

  return (
    <div className="seemore-editor-layer" ref={layer}>
      {editing === undefined ? undefined : (
        <div
          className="seemore-editor"
          // `nearest` scrolls only when the box does not already fit, so opening an editor on
          // a block that is comfortably in view does not move the page under the reader.
          ref={(node) => node?.scrollIntoView({ block: 'nearest' })}
          style={{ top: editing.top, left: editing.left, width: editing.width }}
        >
          <textarea
            ref={(node) => {
              textarea.current = node;
              if (node === null) return;
              node.focus();
              node.setSelectionRange(node.value.length, node.value.length);
              resize(node);
              requestAnimationFrame(() => resize(node));
            }}
            className="seemore-editor-input"
            // One row, so `height: auto` in `resize` collapses to the content rather than to
            // the two-row default a textarea otherwise floors itself at.
            rows={1}
            defaultValue={editing.original}
            spellCheck={false}
            disabled={saving}
            onInput={(event) => resize(event.currentTarget)}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
              }
              // `metaKey` on macOS, `ctrlKey` everywhere else — accept either rather than
              // sniffing the platform.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void save();
              }
            }}
          />
          <div className="seemore-editor-actions">
            <span className="seemore-editor-status">
              {saving ? 'Saving…' : refused ? 'Not saved — copy your text, then reload the page' : undefined}
            </span>
            {/*
              `onMouseDown` is prevented on both buttons so focus never leaves the textarea.
              Taking focus would fire its blur handler, which saves — so a click on Cancel
              would commit the very edit it is meant to discard.
            */}
            <button
              type="button"
              className="seemore-editor-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="button"
              className="seemore-editor-button seemore-editor-button-primary"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void save()}
              disabled={saving || refused}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {error === undefined ? undefined : (
        <p
          className="seemore-editor-error"
          role="alert"
          title="Dismiss"
          onClick={() => setError(undefined)}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Grow with the content: the Markdown behind a block is rarely the height of the block.
 *
 * Capped at part of the window, because a block whose source runs longer than the viewport
 * would otherwise push Save and Cancel off the bottom of the screen. Past the cap the
 * textarea scrolls inside itself and the action bar stays put.
 */
function resize(node: HTMLTextAreaElement): void {
  const cap = Math.max(MIN_EDITOR_HEIGHT, Math.round(window.innerHeight * 0.55));
  node.style.height = 'auto';
  const wanted = node.scrollHeight;
  node.style.height = `${Math.min(wanted, cap)}px`;
  node.style.overflowY = wanted > cap ? 'auto' : 'hidden';
}

/** Floor for the cap, so a very short window still shows a usable amount of text. */
const MIN_EDITOR_HEIGHT = 160;
