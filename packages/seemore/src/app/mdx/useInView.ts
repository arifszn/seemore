import { useEffect, useState, type RefObject } from 'react';

/**
 * True once the element has entered (or nearly entered) the viewport, and stays true
 * afterward — used to defer starting expensive diagram rendering until it's actually needed,
 * rather than the moment a page mounts.
 */
export function useInView(ref: RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const node = ref.current;
    if (node === null) return;

    // Diagrams sit well below the fold on a typical docs page; a margin means scrolling to
    // one feels instant rather than triggering a visible render-in-place.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, inView]);

  return inView;
}

export default useInView;
