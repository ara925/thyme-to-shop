import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const positions = new Map<string, number>();

/** Runs when the actual page mounts, including after a lazy route loads. */
export function RouteScroll() {
  const location = useLocation();
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    const savedPosition = positions.get(location.key);
    if (location.hash) {
      try {
        document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
      } catch { /* A malformed URL fragment must not crash the storefront. */ }
    } else if (navigationType !== 'POP' || savedPosition !== undefined) {
      window.scrollTo({ top: navigationType === 'POP' ? savedPosition || 0 : 0, behavior: 'instant' });
    }
    const remember = () => positions.set(location.key, window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [location.key, location.hash, navigationType]);
  return null;
}
