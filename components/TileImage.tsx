"use client";

import { ImageOff } from "lucide-react";
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

// Session-wide record of URLs that failed to load, so a known-bad image is never
// requested again — including when a tile remounts after navigating back to a
// category. Cleared on full page reload (in-memory only).
const failedSrc = new Set<string>();

export default function TileImage({ src, className }: TileImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(() => failedSrc.has(src));

  useEffect(() => {
    if (failedSrc.has(src)) return;
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
  }, [src]);

  // Re-evaluate when the tile is reused for a different stream.
  useEffect(() => {
    setFailed(failedSrc.has(src));
  }, [src]);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      {failed ? (
        <ImageOff className="text-gray-300 dark:text-gray-600" size={28} aria-label="Image unavailable" />
      ) : visible ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={className}
          onError={() => {
            failedSrc.add(src);
            setFailed(true);
          }}
        />
      ) : null}
    </div>
  );
}
