"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface Slide {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  linkUrl: string | null;
}

const ADVANCE_MS = 5000;

/**
 * The promo banners: a row that snaps, swipes on a phone, and moves on by
 * itself every few seconds.
 *
 * The scrolling is the browser's own (`scroll-snap`), so a swipe feels native
 * and needs no gesture code. It stops advancing while a finger, a cursor or
 * keyboard focus is on it, and never advances at all for a person who asked
 * their device for less motion - a banner that moves under you is how you tap
 * the wrong thing.
 */
export function BannerSlider({ slides }: { slides: Slide[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  function scrollTo(next: number) {
    const el = track.current;
    if (!el) return;
    const clamped = (next + slides.length) % slides.length;
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  }

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(() => {
      const el = track.current;
      if (!el) return;
      const current = Math.round(el.scrollLeft / el.clientWidth);
      const next = (current + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, ADVANCE_MS);

    return () => clearInterval(timer);
  }, [slides.length, paused]);

  if (slides.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotions"
      className="relative"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ul
        ref={track}
        onScroll={(event) => {
          const el = event.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => {
          const body = (
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-tile sm:aspect-[3/1]">
              <Image
                src={slide.imageUrl}
                alt=""
                fill
                sizes="(min-width: 1152px) 1104px, 100vw"
                priority={i === 0}
                className="object-cover"
              />
              {slide.title || slide.subtitle ? (
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-5 text-white sm:p-8">
                  {slide.title ? (
                    <p className="text-xl font-semibold tracking-tight sm:text-3xl">{slide.title}</p>
                  ) : null}
                  {slide.subtitle ? <p className="mt-1 text-sm text-white/85">{slide.subtitle}</p> : null}
                </div>
              ) : null}
            </div>
          );

          return (
            <li
              key={slide.id}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
              className="w-full shrink-0 snap-center"
            >
              {slide.linkUrl ? (
                <Link href={slide.linkUrl} className="block">
                  {body}
                  <span className="sr-only">{slide.title ?? "Open promotion"}</span>
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>

      {slides.length > 1 ? (
        <div className="absolute bottom-3 right-4 flex items-center gap-1">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Show promotion ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => scrollTo(i)}
              // The dot is small; the button around it is the tap target.
              className="flex h-6 w-6 items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition-all ${
                  i === index ? "w-5 bg-gold" : "w-2 bg-white/70"
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
