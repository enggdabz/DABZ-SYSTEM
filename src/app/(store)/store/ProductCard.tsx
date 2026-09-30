import Image from "next/image";
import Link from "next/link";

import { BADGE_LABELS, type BadgeKind } from "@/lib/store/catalogue";
import type { StoreCard } from "@/lib/store/card";

/**
 * One product in a grid: picture on top, then the name and the price.
 *
 * A plain component with no server-only imports, because the recently viewed
 * strip draws these in the browser from JSON. The whole card is one link, so
 * the target is as big as the card and needs no separate padding.
 *
 * A warning badge carries an icon AND a word, never colour alone - red is the
 * brand colour, so an unlabelled red thing reads as a button.
 */
export function ProductCard({ card, priority = false }: { card: StoreCard; priority?: boolean }) {
  return (
    <Link
      href={`/store/p/${card.slug}`}
      className="group flex h-full flex-col gap-3 focus-visible:outline-none"
    >
      <div className="relative aspect-square overflow-hidden rounded-card bg-tile ring-1 ring-line/60 transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ink">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.imageAlt}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            Photo coming soon
          </div>
        )}

        {card.badges.length > 0 ? (
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">
            {card.badges.map((badge) => (
              <Badge key={badge} kind={badge} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-0.5 px-0.5">
        {card.categoryName ? (
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {card.categoryName}
          </p>
        ) : null}
        <h3 className="text-sm font-medium leading-snug text-ink group-hover:text-accent sm:text-base">
          {card.name}
        </h3>
        <p className={card.isQuote ? "text-sm font-medium text-accent" : "text-sm font-semibold"}>
          {card.price}
        </p>
        {card.bulk ? <p className="text-xs text-muted">{card.bulk}</p> : null}
      </div>
    </Link>
  );
}

function Badge({ kind }: { kind: BadgeKind }) {
  const style = {
    new: "bg-gold text-on-gold",
    low: "bg-attention-bg text-attention ring-1 ring-attention/40",
    out: "bg-ink text-page",
  }[kind];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>
      {kind === "low" ? <span aria-hidden="true">⚠</span> : null}
      {BADGE_LABELS[kind]}
    </span>
  );
}
