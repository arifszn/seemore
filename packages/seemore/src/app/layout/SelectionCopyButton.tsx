import { useEffect, useState } from 'react';

/**
 * A floating "Copy" button that appears over the current text selection.
 *
 * Only matters embedded in the VS Code extension's webview: the page runs there inside a
 * nested, cross-origin iframe, and the workbench's own Ctrl+C/Cmd+C handling never reaches a
 * selection made inside it. A click does — but the write itself still can't happen here:
 * VS Code webviews deny the Clipboard API to embedded content regardless of how it's
 * triggered, so the click instead posts the selected text up to the extension host (see
 * `panelHtml.ts`/`panel.ts`), which is the only side actually allowed to touch the OS
 * clipboard (`vscode.env.clipboard`). A plain browser tab already has native copy and is
 * never embedded this way, so this renders nothing there.
 */
export function SelectionCopyButton() {
  const [rect, setRect] = useState<DOMRect>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (window.parent === window) return;

    function onSelectionChange() {
      const selection = window.getSelection();
      if (selection === null || selection.isCollapsed || selection.toString().trim() === '') {
        setRect(undefined);
        return;
      }
      setRect(selection.getRangeAt(0).getBoundingClientRect());
      setCopied(false);
    }

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  if (rect === undefined) return undefined;

  return (
    <button
      type="button"
      className="seemore-selection-copy"
      style={{ top: Math.max(rect.top - 36, 8), left: rect.left }}
      // A button's default mousedown behaviour collapses whatever is currently selected
      // before the click ever fires — this is what keeps the selection alive through it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        const text = window.getSelection()?.toString() ?? '';
        if (text === '') return;
        window.parent.postMessage({ type: 'seemore:copy', text }, '*');
        setCopied(true);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
