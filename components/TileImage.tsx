"use client";

import { useEffect, useRef, useState } from "react";

interface TileImageProps {
  src: string;
  className?: string;
}

// Only loads the image once the tile scrolls within the viewport (plus a margin),
// so a large category fetches images in batches as you scroll rather than firing
// hundreds of requests at once. IntersectionObserver accounts for the scroll
// container's clipping, so root=null (the viewport) is correct here.
const ROOT_MARGIN = "300px 0px";

export default function TileImage({ src, className }: TileImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: ROOT_MARGIN, threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset when the tile is reused for a different stream (key changes usually
  // remount, but guard in case React reuses the node).
  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      {visible && !failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={className}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
