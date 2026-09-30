"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

/**
 * The search field, with suggestions as you type.
 *
 * It is a real GET form to /store/search first: with no script it still
 * searches. The suggestions are added on top - a short pause after the last
 * keystroke, then one small request - and they are only ever product NAMES
 * from what a visitor may already see.
 *
 * Built to the combobox pattern so a keyboard or a screen reader can use it:
 * arrows move through the list, Enter picks, Escape closes.
 */
export function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);

  const [value, setValue] = useState(initial);
  const [fetched, setFetched] = useState<{ term: string; names: string[] }>({
    term: "",
    names: [],
  });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const term = value.trim();

  useEffect(() => {
    if (term.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/store/suggest?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { suggestions?: string[] };
        setFetched({ term, names: body.suggestions ?? [] });
      } catch {
        // Aborted by the next keystroke, or offline: no suggestions, no harm.
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // Suggestions for an older term are stale the moment the text changes.
  const names = term.length >= 2 && fetched.term === term ? fetched.names : [];
  const showList = open && names.length > 0;

  function go(text: string) {
    setOpen(false);
    router.push(`/store/search?q=${encodeURIComponent(text)}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (event.key === "ArrowDown" && names.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % names.length);
    } else if (event.key === "ArrowUp" && names.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index <= 0 ? names.length - 1 : index - 1));
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault();
      setValue(names[active]);
      go(names[active]);
    }
  }

  return (
    <div
      ref={box}
      className="relative w-full"
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <form action="/store/search" role="search" className="relative">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search products
        </label>
        <input
          id={`${listId}-input`}
          name="q"
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          maxLength={40}
          placeholder="Search jerseys, shirts, jackets"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-full bg-white/10 pl-11 pr-4 text-base text-white placeholder:text-white/60 ring-1 ring-white/20 focus:bg-white focus:text-black focus:placeholder:text-black/50 focus:outline-none focus:ring-2 focus:ring-gold"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/70"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
      </form>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-card bg-surface text-ink shadow-lg ring-1 ring-line"
        >
          {names.map((name, index) => (
            <li
              key={name}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mouseDown, not click: the input's blur would close the list first.
              onMouseDown={(event) => {
                event.preventDefault();
                setValue(name);
                go(name);
              }}
              className={`cursor-pointer px-4 py-3 text-sm ${index === active ? "bg-seg" : "hover:bg-seg"}`}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
