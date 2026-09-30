"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface GalleryPhoto {
  url: string;
  alt: string;
}

/**
 * The photos of a product: one large, a row of thumbnails, zoom on a mouse and
 * a full-screen view on a tap.
 *
 * Two kinds of zoom because two kinds of hand. A mouse gets the picture
 * magnified under the cursor, the way a shop's own gallery does; a finger gets
 * a full-screen view, where the browser's own pinch-zoom takes over.
 *
 * The full-screen view is PORTALLED into <body>. The header above it has its
 * own stacking context, and `fixed inset-0` inside a transformed or filtered
 * ancestor measures against that ancestor instead of the screen (the bill
 * reminder once hung 260px off the top of a phone that way).
 */
export function ProductGallery({ photos, name }: { photos: GalleryPhoto[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [origin, setOrigin] = useState("50% 50%");
  const [open, setOpen] = useState(false);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-card bg-tile text-sm text-muted">
        Photo coming soon
      </div>
    );
  }

  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <div className="space-y-3">
      <div
        className="group relative aspect-square overflow-hidden rounded-card bg-tile ring-1 ring-line/60"
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const box = event.currentTarget.getBoundingClientRect();
          setOrigin(
            `${((event.clientX - box.left) / box.width) * 100}% ${((event.clientY - box.top) / box.height) * 100}%`,
          );
        }}
      >
        <Image
          src={current.url}
          alt={current.alt || name}
          fill
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
          style={{ transformOrigin: origin }}
          className="object-cover transition-transform duration-200 [@media(hover:hover)]:group-hover:scale-[1.8]"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="View larger"
          className="absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ink"
        />
      </div>

      {photos.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((photo, i) => (
            <li key={photo.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1} of ${photos.length}`}
                aria-current={i === index ? "true" : undefined}
                className={`relative block h-16 w-16 overflow-hidden rounded-control bg-tile ring-2 sm:h-20 sm:w-20 ${
                  i === index ? "ring-ink" : "ring-transparent hover:ring-line"
                }`}
              >
                <Image src={photo.url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <Lightbox
          photos={photos}
          index={index}
          name={name}
          onIndex={setIndex}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function Lightbox({
  photos,
  index,
  name,
  onIndex,
  onClose,
}: {
  photos: GalleryPhoto[];
  index: number;
  name: string;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const count = photos.length;

  const step = useCallback(
    (by: number) => onIndex((index + by + count) % count),
    [index, count, onIndex],
  );

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();

    // The page behind must not scroll while the picture is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" && count > 1) step(1);
      else if (event.key === "ArrowLeft" && count > 1) step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step, count]);

  const photo = photos[index];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} photos`}
      className="store fixed inset-0 z-[100] flex flex-col bg-black/95"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-sm">
          {index + 1} / {count}
        </p>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          className="flex h-11 min-w-11 items-center justify-center rounded-full bg-white/10 px-4 text-sm font-medium hover:bg-white/20"
        >
          Close
        </button>
      </div>

      <div className="relative flex-1">
        <Image src={photo.url} alt={photo.alt || name} fill sizes="100vw" className="object-contain" />
      </div>

      {count > 1 ? (
        <div className="flex justify-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => step(-1)}
            className="flex h-11 min-w-24 items-center justify-center rounded-full bg-white/10 px-4 text-sm text-white hover:bg-white/20"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="flex h-11 min-w-24 items-center justify-center rounded-full bg-white/10 px-4 text-sm text-white hover:bg-white/20"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
