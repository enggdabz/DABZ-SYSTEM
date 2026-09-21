# Online Orders — what is built, how to check it, what is next

Read `docs/spec.md` first (the module's specification), then
`docs/open-questions.md` (what is waiting on the owner, and every place the spec
was mapped onto the system that already existed).

This file is the handover note. A session starts with no memory of the last one.

---

## Where it stands

| Milestone | State |
| --- | --- |
| M0 — docs, tokens, shells | ✅ |
| M1 — database, RLS, views, storage | in progress |
| M2 — admin products and designs | not started |
| M3 — public catalogue | not started |
| M4 — cart, checkout, order creation, track | not started |
| M5 — admin orders and the order page | not started |
| M6 — production steps and board | not started |
| M7 — calendar | not started |
| M8 — reports and settings | not started |
| M9 — hardening | not started |

---

## Verifying

The module is checked by the same five commands as the rest of the system
(`AGENTS.md`):

```bash
npm test              # unit tests, including everything in src/lib/online/
npm run test:rls      # security rules against a real PostgreSQL
npm run check:schema  # every table and column the app asks for exists
npm run typecheck && npm run lint && npm run build
```

`test:rls` and `check:schema` need a local PostgreSQL. Point them at one with
`PGHOST`/`PGPORT`/`PGUSER`.

---

## M0 — docs, tokens, shells ✅

- `docs/spec.md` — the specification, so the next session has it.
- `docs/open-questions.md` — D1–D12, and every mapping decision.
- Four new colour tokens in `src/app/globals.css`: `--tile`, `--seg`, `--gold`,
  `--on-gold`. Everything else the module needs was already there.

**How to check it:** nothing visible yet. `npm run build` passes.
