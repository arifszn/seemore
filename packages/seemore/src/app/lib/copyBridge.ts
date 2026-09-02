/**
 * Answers a clipboard-copy request from an embedding parent frame (the seemore VS Code
 * extension's webview shell — see `panelHtml.ts`/`panel.ts` in that package).
 *
 * Embedded there, this page runs inside a nested, cross-origin iframe, and the host's own
 * Ctrl+C/Cmd+C keybinding never reaches this document's native selection-copy at all — the
 * extension asks for the current selection over `postMessage` instead and writes it to the
 * clipboard itself. Outside that embedding, nothing ever posts this message, so the listener
 * is otherwise inert.
 */
interface CopyRequest {
  type: 'seemore:copy-request';
  requestId: string;
}

function isCopyRequest(value: unknown): value is CopyRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === 'seemore:copy-request' && typeof candidate.requestId === 'string';
}

export function installCopyBridge(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !isCopyRequest(event.data)) return;
    const text = window.getSelection()?.toString() ?? '';
    window.parent.postMessage({ type: 'seemore:copy-response', requestId: event.data.requestId, text }, '*');
  });
}
