/**
 * DABZ Printshoppe brand mark.
 *
 * The official logo is a dark-background asset: red "DABZ" wordmark with white
 * "PRINTSHOPPE" beneath a crest. Drop it in as `public/brand/logo.png` and set
 * HAS_LOGO_ASSET to true — the typographic wordmark below is a stand-in only,
 * deliberately plain so it is never mistaken for the real mark.
 *
 * Because the artwork carries white text, it belongs on the dark sidebar and on
 * the near-black login panel, never on a white surface.
 */
const HAS_LOGO_ASSET = false;

export function Brand({ compact = false }: { compact?: boolean }) {
  if (HAS_LOGO_ASSET) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/brand/logo.png"
        alt="DABZ Printshoppe"
        className={compact ? "h-7 w-auto" : "h-10 w-auto"}
      />
    );
  }

  return (
    <span className="flex flex-col leading-none" aria-label="DABZ Printshoppe">
      <span
        className={`font-bold italic tracking-tight text-brand ${
          compact ? "text-lg" : "text-2xl"
        }`}
      >
        DABZ
      </span>
      {compact ? null : (
        <span className="mt-1 text-[0.5rem] font-semibold tracking-[0.38em] text-white">
          PRINTSHOPPE
        </span>
      )}
    </span>
  );
}
