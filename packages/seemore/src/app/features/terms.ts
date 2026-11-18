/**
 * `<Term>` hints: hover, tap or tab to a term and its explanation pops up beside it.
 *
 * One delegated binding on the document, not React state, so the same code runs in every
 * place a term ends up: the live site (bound once in `entry.client.tsx`, covering every page
 * navigated to after), the CLI export (imported by `standalone.ts`), and the browser export
 * (inlined into its `RUNTIME` as `bindTerms.toString()`).
 *
 * That last use is why this function must stay self-contained: no imports, no module-level
 * constants, no helpers declared outside it. Only its own source survives the inlining.
 */
export function bindTerms(doc: Document): void {
  const HOVER_OPEN_MS = 300;
  const HOVER_CLOSE_MS = 200;
  const GAP = 8;
  const MARGIN = 8;

  let open: HTMLElement | undefined;
  let pinned = false;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  const termOf = (target: EventTarget | null): HTMLElement | undefined => {
    if (!(target instanceof Element)) return undefined;
    return (target.closest('.seemore-term') as HTMLElement | null) ?? undefined;
  };
  const triggerOf = (term: HTMLElement) => term.querySelector<HTMLElement>('.seemore-term-trigger');
  const tipOf = (term: HTMLElement) => term.querySelector<HTMLElement>('.seemore-term-tip');

  // Fixed, not absolute: a term inside a scrolling table or code tab would otherwise be
  // clipped by its container. Below the term by default, above when there is no room.
  const place = (term: HTMLElement): void => {
    const trigger = triggerOf(term);
    const tip = tipOf(term);
    if (trigger === null || tip === null) return;
    const anchor = trigger.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const viewWidth = doc.documentElement.clientWidth;
    const viewHeight = window.innerHeight;

    const left = Math.max(MARGIN, Math.min(anchor.left + anchor.width / 2 - width / 2, viewWidth - width - MARGIN));
    const below = anchor.bottom + GAP;
    const above = anchor.top - GAP - height;
    const fitsBelow = below + height <= viewHeight - MARGIN;
    const top = fitsBelow || above < MARGIN ? below : above;

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.setAttribute('data-side', top === below ? 'bottom' : 'top');
  };

  const close = (): void => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (open === undefined) return;
    const tip = tipOf(open);
    if (tip !== null) tip.hidden = true;
    triggerOf(open)?.setAttribute('aria-expanded', 'false');
    open = undefined;
    pinned = false;
  };

  const show = (term: HTMLElement, pin: boolean): void => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (open !== term) close();
    const tip = tipOf(term);
    if (tip === null) return;
    tip.hidden = false;
    triggerOf(term)?.setAttribute('aria-expanded', 'true');
    open = term;
    pinned = pin || pinned;
    place(term);
  };

  doc.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse') return;
    const term = termOf(event.target);
    if (term === undefined) return;
    if (term === open) {
      clearTimeout(closeTimer);
      return;
    }
    // Only the term itself opens on hover; the tip is reachable once open.
    if (!(event.target instanceof Element) || event.target.closest('.seemore-term-trigger') === null) return;
    clearTimeout(openTimer);
    openTimer = setTimeout(() => show(term, false), HOVER_OPEN_MS);
  });

  doc.addEventListener('pointerout', (event) => {
    if (event.pointerType !== 'mouse') return;
    const term = termOf(event.target);
    if (term === undefined || termOf(event.relatedTarget) === term) return;
    clearTimeout(openTimer);
    if (term !== open || pinned) return;
    // A short grace period, so the pointer can cross the gap from the term into the tip.
    closeTimer = setTimeout(close, HOVER_CLOSE_MS);
  });

  doc.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest('.seemore-term-trigger');
    const term = termOf(target);
    if (trigger != null && term !== undefined) {
      // A hover-opened tip gets pinned by the click rather than closed by it.
      if (term === open && pinned) close();
      else show(term, true);
      return;
    }
    if (term === undefined) close();
  });

  // Keyboard focus only: a mouse click focuses the button too (in most browsers), and the
  // click handler already decided what that click means.
  doc.addEventListener('focusin', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target === null || !target.matches('.seemore-term-trigger:focus-visible')) return;
    const term = termOf(target);
    if (term !== undefined) show(term, true);
  });

  doc.addEventListener('focusout', (event) => {
    const term = termOf(event.target);
    // Tabbing on to the next element closes; focus dropped by a click elsewhere is the
    // click handler's call.
    if (term !== undefined && term === open && event.relatedTarget !== null && termOf(event.relatedTarget) !== term) close();
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  const follow = (): void => {
    if (open === undefined) return;
    // The page navigated away underneath an open tip.
    if (!open.isConnected) {
      open = undefined;
      pinned = false;
      return;
    }
    place(open);
  };
  window.addEventListener('scroll', follow, { capture: true, passive: true });
  window.addEventListener('resize', follow, { passive: true });
}
