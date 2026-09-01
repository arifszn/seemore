import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Client-side navigation to `#hash` does not scroll on its own, and the target element only
 * exists once the page's MDX module has rendered — so scrolling waits a frame.
 */
export function useHashScroll(): void {
  const location = useLocation();

  useEffect(() => {
    if (location.hash === '') {
      if (location.key !== 'default') window.scrollTo({ top: 0 });
      return;
    }

    const id = decodeURIComponent(location.hash.slice(1));
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.key, location.hash]);
}
