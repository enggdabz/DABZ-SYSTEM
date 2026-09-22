"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui";

/**
 * The "Sort by" box.
 *
 * It writes the choice into the URL rather than into component state, so the
 * order survives a reload, a back button and a link somebody sends to the
 * other person at the counter. The server does the sorting; this only says
 * how.
 */
export function SortPicker({
  value,
  options,
  name = "sort",
}: {
  value: string;
  options: { value: string; label: string }[];
  name?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Sort by</span>
      <Select
        value={value}
        className="w-auto"
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          next.set(name, event.target.value);
          router.replace(`${pathname}?${next.toString()}`);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
