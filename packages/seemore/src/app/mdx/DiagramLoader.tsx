/** Shown by `Mermaid`/`D2` while a diagram's synchronous render pass is in progress. */
export function DiagramLoader() {
  return (
    <div className="seemore-diagram-loading" role="status">
      <span className="seemore-diagram-spinner" aria-hidden="true" />
      <span className="sr-only">Rendering diagram…</span>
    </div>
  );
}

export default DiagramLoader;
