"use client";

import { useEffect, useState } from "react";

// True only on devices with a real hover-capable pointer (mouse/trackpad).
// Touch devices report (hover: none)/(pointer: coarse), so we use this to
// suppress hover tooltips on mobile. Defaults to true for SSR / first paint so
// desktop behaviour is unaffected before hydration.
export function useHasHover() {
  const [hasHover, setHasHover] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHasHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return hasHover;
}
