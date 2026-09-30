import Image from "next/image";

/**
 * What stands where the banners will be until there are any: the brand, on
 * the dark ground the artwork was made for (public/logo/README.md).
 */
export function Hero() {
  return (
    <section className="flex flex-col items-center gap-4 rounded-card bg-sidebar px-6 py-10 text-center text-sidebar-ink sm:py-14">
      <Image
        src="/logo/logo-transparent.png"
        alt="Dabz Printshoppe"
        width={1200}
        height={328}
        priority
        className="h-14 w-auto sm:h-16"
      />
      <h1 className="text-[clamp(26px,5vw,44px)] font-semibold leading-tight tracking-tight">
        Made for your team
      </h1>
      <p className="max-w-md text-sm text-white/75 sm:text-base">
        Jerseys, shirts, jackets and prints, made to order in San Carlos City.
      </p>
      <span aria-hidden="true" className="h-1 w-16 rounded-full bg-gold" />
    </section>
  );
}
