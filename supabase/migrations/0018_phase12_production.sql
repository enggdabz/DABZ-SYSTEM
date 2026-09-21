-- Phase 12: the production report (owner's request, 21 September 2026).
--
-- WHAT THE OWNER ASKED FOR
--
--   "Another category for Production Report, for every project, we can open it
--    and we can put a status of that item whether it is already OK in design,
--    Color Test, pattern, print, Heatpress, Fabric Cutting, sewing, quality
--    checking, Packaging, ready! And from this project it will sum up all
--    status per item to create a final status of this project."
--
-- So the shop floor marks each ITEM on a job order as it passes each bench,
-- and the project's own status is worked out from those marks.
--
-- DECISIONS MADE HERE, recorded in docs/DECISIONS.md:
--
--   * An ITEM is a line on the job order - "18 full sublimation jerseys" -
--     not a single player's shirt. A batch of one design moves through the
--     shop together: it is printed together, pressed together and sewn
--     together, and ten ticks against each of eighteen names is a hundred and
--     eighty boxes nobody would keep up to date at the counter. Marking the
--     line is what the shop actually does.
--
--   * A stage is MARKED, not counted up to. Ticking "Sewing" says the sewing
--     is done and says nothing about the printing - so a stage ticked with an
--     earlier one still blank is shown as exactly that, a skipped stage, and
--     never quietly treated as though the earlier bench had finished too.
--
--   * The project's status is NEVER STORED. It is worked out from these rows
--     every time the screen is opened, the same rule as an order's total, a
--     payslip and a report. A stored "project stage" and a set of ticks can
--     disagree, and then nothing says which one is lying.
--
--   * A tick is REMOVED when it was made by mistake, rather than answered
--     with an opposite row the way a stock movement or a ledger entry is.
--     Those are money; this is a statement about where the work is right now,
--     and the honest correction to "the printing is done" when it is not is to
--     stop saying it. The permanent record is the audit log, which the app
--     writes on every change and which nobody can edit or delete.

-- ---------------------------------------------------------------------------
-- The ten benches
-- ---------------------------------------------------------------------------
-- In the owner's own order, which is the order the work happens in at Dabz
-- Apparel. The list is closed by a check constraint rather than left open:
-- a typo that created an eleventh bench would put an item in a stage no
-- screen knows how to show, and the report would go quietly wrong.

create table if not exists public.apparel_production_steps (
  id uuid primary key default gen_random_uuid(),

  -- The ITEM: a line on the job order.
  line_id uuid not null
    references public.apparel_order_lines (id) on delete cascade,

  stage text not null check (stage in (
    'design',
    'colour_test',
    'pattern',
    'print',
    'heat_press',
    'fabric_cutting',
    'sewing',
    'quality_check',
    'packaging',
    'ready'
  )),

  created_at timestamptz not null default now(),
  created_by uuid,

  -- One mark per bench per item. Marking a stage that is already marked
  -- changes nothing rather than piling up rows that would each have to be
  -- read and de-duplicated before the report could say anything.
  constraint apparel_production_steps_one_per_stage unique (line_id, stage)
);

comment on table public.apparel_production_steps is
  'One row per item per bench it has passed. The project''s status is NOT stored - it is worked out from these rows, the same rule as an order total.';

comment on column public.apparel_production_steps.created_at is
  'When the bench was marked done. Stored in UTC and shown in Manila time, like every other timestamp here.';

create index if not exists apparel_production_steps_line_idx
  on public.apparel_production_steps (line_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- The same door as the job orders themselves: whoever may open a job order may
-- say where its work has got to. This is not money and it is not a customer's
-- private details - it is the shop's own bench list - so there is no narrower
-- rule to apply, and a printer who cannot tick "Print" would be a report that
-- nobody keeps up.

alter table public.apparel_production_steps enable row level security;

drop policy if exists apparel_production_steps_read on public.apparel_production_steps;
create policy apparel_production_steps_read on public.apparel_production_steps
  for select using (
    public.is_owner_or_admin() or public.has_permission('apparel_job_orders')
  );

drop policy if exists apparel_production_steps_insert on public.apparel_production_steps;
create policy apparel_production_steps_insert on public.apparel_production_steps
  for insert with check (public.has_permission('apparel_job_orders'));

drop policy if exists apparel_production_steps_update on public.apparel_production_steps;
create policy apparel_production_steps_update on public.apparel_production_steps
  for update
  using (public.has_permission('apparel_job_orders'))
  with check (public.has_permission('apparel_job_orders'));

-- Un-ticking is a delete, for the reason in the header: a wrong tick is a
-- claim that has to stop being made, not a payment that has to be reversed.
-- Both `using` and the policies above are written out rather than folded into
-- one `for all`, so that adding a narrower rule to one of them later cannot
-- silently loosen the other three.
drop policy if exists apparel_production_steps_delete on public.apparel_production_steps;
create policy apparel_production_steps_delete on public.apparel_production_steps
  for delete using (public.has_permission('apparel_job_orders'));
