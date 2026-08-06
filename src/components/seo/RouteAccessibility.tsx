import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export function RouteAccessibility() {
  const { pathname } = useLocation();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    const isInitialLoad = previousPath.current === null;
    previousPath.current = pathname;

    if (isInitialLoad) return;

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const focusPageHeading = () => {
      const heading = document.querySelector<HTMLHeadingElement>("#main-content h1");
      if (!heading) return false;

      if (!heading.hasAttribute("tabindex")) {
        heading.setAttribute("tabindex", "-1");
      }

      heading.focus({ preventScroll: true });
      return true;
    };

    if (focusPageHeading()) return;

    const root = document.getElementById("root");
    if (!root) return;

    const observer = new MutationObserver(() => {
      if (focusPageHeading()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });

    const timeout = window.setTimeout(() => observer.disconnect(), 5_000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [pathname]);

  return null;
}
