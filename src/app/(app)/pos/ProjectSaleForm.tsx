"use client";

/**
 * The Counter's "Project" tab.
 *
 * It behaves like a regular sale that is paid in parts. A person either
 *   - starts a project: picks its TYPE, fills in that type's details, and takes
 *     a down payment (or the whole price) - one sale, one project; or
 *   - finds a project already started and takes a follow-up payment against it:
 *     the job is shown read-only and only the amount and the way of paying are
 *     asked for.
 * Either way the money is a real Counter sale (`complete_sale`), it lands on
 * the day it was paid, and it finishes on the same screen a regular sale does,
 * with a button to the same receipt.
 *
 * The figures here are a PREVIEW. The Server Action re-checks every one, and
 * the database function checks them again, because the balance is money.
 */
import Link from "next/link";
import { useActionState, useMemo, useState, type ReactNode } from "react";

import {
  Button,
  buttonClasses,
  Field,
  Input,
  Notice,
  Select,
  TAP_AREA,
  Tag,
  HEADING_BOX,
} from "@/components/ui";
import { formatManilaDate } from "@/lib/datetime";
import { centavosToDecimalString, formatPesos, parsePesos } from "@/lib/money";
import {
  FIND_LIMIT,
  searchProjects,
  type FindableProject,
} from "@/lib/project-find";
import {
  NOTES_FIELD,
  PROJECT_TYPES,
  PROJECT_TYPE_IDS,
  detailInputName,
  isProjectTypeId,
  sizeInputName,
  type FieldDef,
  type ProjectTypeId,
} from "@/lib/project-types";
import { belowDownPaymentPolicy } from "@/lib/projects";
import { APPAREL_SIZES } from "@/lib/uniforms";

import {
  createProjectSaleAction,
  recordProjectBalanceAction,
  type BalanceState,
  type ProjectSaleState,
} from "../projects/actions";
import type { PosCustomer } from "./PosScreen";

/** Pesos as typed, or null when the box is empty or not an amount. */
function tryPesos(text: string): number | null {
  if (text.trim() === "") return null;
  try {
    return parsePesos(text);
  } catch {
    return null;
  }
}

const TEXTAREA_CLASS =
  "w-full rounded-control bg-surface-sunken px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/50";

const CARD = "space-y-4 rounded-card bg-surface p-5 ring-1 ring-line/60";

export function ProjectSaleForm({
  customers,
  downPaymentPercent,
  openProjects = [],
  projectsUnavailable = false,
}: {
  customers: PosCustomer[];
  downPaymentPercent: number | null;
  /** Projects that can still take a payment, for "Find project". */
  openProjects?: FindableProject[];
  /** The list could not be read; starting a project still works. */
  projectsUnavailable?: boolean;
}) {
  // Bumping the key remounts the form, which is the whole of "start another".
  const [round, setRound] = useState(0);
  return (
    <ProjectSaleFormInner
      key={round}
      customers={customers}
      downPaymentPercent={downPaymentPercent}
      openProjects={openProjects}
      projectsUnavailable={projectsUnavailable}
      onAnother={() => setRound((value) => value + 1)}
    />
  );
}

function ProjectSaleFormInner({
  customers,
  downPaymentPercent,
  openProjects,
  projectsUnavailable,
  onAnother,
}: {
  customers: PosCustomer[];
  downPaymentPercent: number | null;
  openProjects: FindableProject[];
  projectsUnavailable: boolean;
  onAnother: () => void;
}) {
  const [picked, setPicked] = useState<FindableProject | null>(null);
  // Whether a payment has been taken; the finder goes away with the form.
  const [finished, setFinished] = useState(false);

  return (
    <div className="space-y-6">
      {finished ? null : (
        <FindProject
          projects={openProjects}
          unavailable={projectsUnavailable}
          picked={picked}
          onPick={setPicked}
        />
      )}

      {picked ? (
        <FollowUpForm
          // A different project is a different form: nothing typed carries over.
          key={picked.id}
          project={picked}
          onDone={() => setFinished(true)}
          onAnother={onAnother}
        />
      ) : null}

      {/*
        Hidden, not unmounted, while a found project is being paid - the same
        rule as the Counter's two tabs. Half a new project (a customer, a size
        breakdown) is exactly what nobody wants to type twice, and looking up
        somebody's balance in the middle of it is an ordinary thing to do.
      */}
      <div hidden={picked !== null}>
        <NewProjectForm
          customers={customers}
          downPaymentPercent={downPaymentPercent}
          onDone={() => setFinished(true)}
          onAnother={onAnother}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Find project
// ---------------------------------------------------------------------------

function FindProject({
  projects,
  unavailable,
  picked,
  onPick,
}: {
  projects: FindableProject[];
  unavailable: boolean;
  picked: FindableProject | null;
  onPick: (project: FindableProject | null) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => searchProjects(projects, query),
    [projects, query],
  );
  const searching = query.trim() !== "";

  return (
    <section className={CARD} aria-label="Find project">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={`${HEADING_BOX} text-base font-semibold tracking-tight`}>
            Find project
          </h2>
          <p className="mt-1 text-sm text-muted">
            For a payment on a project already started. To start a new one,
            leave this empty.
          </p>
        </div>
        {picked ? (
          <button
            type="button"
            onClick={() => {
              onPick(null);
              setQuery("");
            }}
            className={`text-sm underline underline-offset-2 ${TAP_AREA}`}
          >
            Start a new project instead
          </button>
        ) : null}
      </div>

      {unavailable ? (
        <Notice tone="attention" title="The project list could not be loaded">
          <p>
            A new project can still be started. To take a payment on one
            already started, open it from Projects.
          </p>
        </Notice>
      ) : picked ? (
        <p className="text-sm">
          Taking a payment on <strong>{picked.number}</strong> for{" "}
          {picked.customerName}.
        </p>
      ) : (
        <>
          <Field
            label="Customer or project number"
            hint={
              projects.length === 0
                ? "No project is waiting on a payment."
                : `${projects.length} ${projects.length === 1 ? "project is" : "projects are"} waiting on a payment.`
            }
          >
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Falcons, or J-260930-001"
              autoComplete="off"
            />
          </Field>

          {searching ? (
            matches.length > 0 ? (
              <ul className="divide-y divide-line/60 rounded-control ring-1 ring-line/60">
                {matches.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => onPick(project)}
                      className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-left text-sm hover:bg-ink/5"
                    >
                      <span>
                        <span className="font-medium">{project.number}</span>
                        <span className="text-muted">
                          {" "}
                          &middot; {project.customerName} &middot;{" "}
                          {project.typeLabel}
                        </span>
                      </span>
                      <span className="text-attention">
                        <span aria-hidden="true">{"⚠"} </span>
                        Balance {formatPesos(project.balanceCentavos)}
                      </span>
                    </button>
                  </li>
                ))}
                {matches.length === FIND_LIMIT ? (
                  <li className="px-3 py-2 text-xs text-muted">
                    Showing the first {FIND_LIMIT}. Type more to narrow it down.
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                No project waiting on a payment matches &ldquo;{query.trim()}
                &rdquo;. One that is fully paid or cancelled is not listed.
              </p>
            )
          ) : null}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Payment: the part both flows share
// ---------------------------------------------------------------------------

function PaymentMethodFields({
  method,
  onMethod,
  moneyGiven,
  onMoneyGiven,
  reference,
  onReference,
  amountCentavos,
  moneyGivenError,
}: {
  method: string;
  onMethod: (value: string) => void;
  moneyGiven: string;
  onMoneyGiven: (value: string) => void;
  reference: string;
  onReference: (value: string) => void;
  amountCentavos: number | null;
  moneyGivenError?: string;
}) {
  const change = useMemo(() => {
    if (method !== "cash" || amountCentavos === null) return null;
    const given = tryPesos(moneyGiven);
    return given === null ? null : given - amountCentavos;
  }, [method, amountCentavos, moneyGiven]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paying with">
          <Select
            name="paymentMethod"
            value={method}
            onChange={(event) => onMethod(event.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
            <option value="bank">Bank</option>
          </Select>
        </Field>

        {method === "cash" ? (
          <Field label="Money given" error={moneyGivenError}>
            <Input
              name="moneyGiven"
              inputMode="decimal"
              value={moneyGiven}
              onChange={(event) => onMoneyGiven(event.target.value)}
              placeholder="e.g. 3000"
            />
          </Field>
        ) : (
          <Field label="Reference number" hint="From the payment app or slip.">
            <Input
              name="referenceNumber"
              value={reference}
              onChange={(event) => onReference(event.target.value)}
              placeholder="e.g. 0012345678"
            />
          </Field>
        )}
      </div>

      {method === "cash" && change !== null ? (
        <p
          className={`text-sm ${change < 0 ? "text-attention" : "text-muted"}`}
        >
          {change < 0 ? (
            <>
              <span aria-hidden="true">{"⚠"} </span>
              {formatPesos(Math.abs(change))} short
            </>
          ) : (
            <>Change: {formatPesos(change)}</>
          )}
        </p>
      ) : null}
    </>
  );
}

/**
 * The button that takes the money. It sticks to the bottom of the screen at every
 * width, as a regular sale's pay bar does below `lg`: the form is taller than a
 * phone, a tablet held upright AND a desktop window, and the primary action has
 * to be reachable without scrolling to the end of it.
 */
function SubmitBar({ pending }: { pending: boolean }) {
  return (
    <div className="sticky bottom-0 z-30 flex justify-end rounded-card border border-line bg-surface/95 p-3 backdrop-blur-md">
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Complete sale & print"}
      </Button>
    </div>
  );
}

/**
 * What the counter shows once the money is taken - the same shape as a regular
 * sale's "Sale complete": the number, the change, and a button to the receipt.
 */
function PaymentDone({
  heading,
  saleId,
  saleNumber,
  projectNumber,
  projectId,
  changeCentavos,
  balanceCentavos,
  policyWarning,
  onAnother,
}: {
  heading: string;
  saleId: string;
  saleNumber: string;
  projectNumber: string;
  projectId?: string;
  changeCentavos: number;
  balanceCentavos: number;
  policyWarning?: string | null;
  onAnother: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-5 py-10 text-center">
      <p className="text-sm font-medium text-muted">{heading}</p>
      <p className="text-5xl font-semibold tracking-tight">{saleNumber}</p>
      <p className="text-sm text-muted">Project {projectNumber}</p>

      {changeCentavos > 0 ? (
        <div className="rounded-card bg-surface p-6 ring-1 ring-line/60">
          <p className="text-sm text-muted">Change</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">
            {formatPesos(changeCentavos)}
          </p>
        </div>
      ) : null}

      <p className="text-sm">
        {balanceCentavos > 0 ? (
          <>
            <span aria-hidden="true">{"⚠"} </span>
            {formatPesos(balanceCentavos)} is still owed and stays on the
            project.
          </>
        ) : (
          <>
            <span aria-hidden="true">{"✓"} </span>
            The project is fully paid.
          </>
        )}
      </p>

      {policyWarning ? (
        <div className="text-left">
          <Notice tone="attention" title="Under the down payment policy">
            <p>{policyWarning}</p>
          </Notice>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href={`/sales/${saleId}/receipt`}
          className={buttonClasses("primary")}
        >
          Print the receipt
        </Link>
        <button
          type="button"
          onClick={onAnother}
          className={buttonClasses("secondary")}
        >
          Start another
        </button>
      </div>
      {projectId ? (
        <Link
          href={`/projects/${projectId}`}
          className={`inline-block text-sm underline underline-offset-2 ${TAP_AREA}`}
        >
          Open the project
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A new project
// ---------------------------------------------------------------------------

function NewProjectForm({
  customers,
  downPaymentPercent,
  onDone,
  onAnother,
}: {
  customers: PosCustomer[];
  downPaymentPercent: number | null;
  onDone: () => void;
  onAnother: () => void;
}) {
  const [state, submit, pending] = useActionState<ProjectSaleState, FormData>(
    async (previous, formData) => {
      const next = await createProjectSaleAction(previous, formData);
      if (next.created) onDone();
      return next;
    },
    {},
  );

  const [typeId, setTypeId] = useState<ProjectTypeId | "">("");
  const [dueOn, setDueOn] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [total, setTotal] = useState("");
  const [kind, setKind] = useState<"down" | "full">("down");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [moneyGiven, setMoneyGiven] = useState("");
  const [reference, setReference] = useState("");

  const totalCentavos = tryPesos(total);
  // A full payment is the whole price, so there is nothing to type.
  const shownAmount = kind === "full" ? total : amount;
  const amountCentavos = tryPesos(shownAmount);

  const balanceCentavos =
    totalCentavos !== null && amountCentavos !== null
      ? totalCentavos - amountCentavos
      : null;

  const belowPolicy =
    kind === "down" && totalCentavos !== null && amountCentavos !== null
      ? belowDownPaymentPolicy({
          totalCentavos,
          amountCentavos,
          policyPercent: downPaymentPercent,
        })
      : false;

  const errors = state.fieldErrors ?? {};
  const detailErrors = state.detailErrors ?? {};

  if (state.created) {
    const done = state.created;
    return (
      <PaymentDone
        heading={
          kind === "full" ? "Project paid in full" : "Project downpayment taken"
        }
        saleId={done.saleId}
        saleNumber={done.saleNumber}
        projectNumber={done.projectNumber}
        projectId={done.projectId}
        changeCentavos={paymentMethod === "cash" ? done.changeCentavos : 0}
        balanceCentavos={done.balanceCentavos}
        policyWarning={done.policyWarning}
        onAnother={onAnother}
      />
    );
  }

  return (
    <form action={submit} className="space-y-6" noValidate>
      {state.error ? (
        <Notice tone="attention" title="The project was not saved">
          <p>{state.error}</p>
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={CARD}>
          <h2 className={`${HEADING_BOX} text-base font-semibold tracking-tight`}>The job</h2>

          <Field label="Project type" error={detailErrors.type}>
            <Select
              name="projectType"
              value={typeId}
              onChange={(event) =>
                setTypeId(
                  isProjectTypeId(event.target.value) ? event.target.value : "",
                )
              }
            >
              <option value="">Choose a type…</option>
              {PROJECT_TYPE_IDS.map((id) => (
                <option key={id} value={id}>
                  {PROJECT_TYPES[id].label}
                </option>
              ))}
            </Select>
          </Field>

          {typeId ? (
            // Keyed by the type: another type starts from empty boxes rather
            // than carrying over a size the new type does not have.
            <JobFields key={typeId} typeId={typeId} errors={detailErrors} />
          ) : (
            <p className="text-sm text-muted">
              Choose a type to see what to fill in.
            </p>
          )}

          <Field
            label={
              kind === "down"
                ? "Due date (required with a down payment)"
                : "Due / target release date"
            }
            hint={
              kind === "down"
                ? "The project goes on the Projects calendar on this day."
                : "Optional. If you give one, the project goes on the calendar."
            }
            error={errors.dueOn}
          >
            <Input
              name="dueOn"
              type="date"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
            />
          </Field>
        </div>

        <div className={CARD}>
          <h2 className={`${HEADING_BOX} text-base font-semibold tracking-tight`}>
            The customer
          </h2>

          {customers.length > 0 ? (
            <Field label="Existing customer (optional)">
              <Select
                name="customerId"
                value={customerId}
                onChange={(event) => {
                  const chosen = customers.find(
                    (entry) => entry.id === event.target.value,
                  );
                  setCustomerId(event.target.value);
                  if (chosen) {
                    setCustomerName(chosen.name);
                    setContact(chosen.contactNumber ?? "");
                  }
                }}
              >
                <option value="">Not on the list</option>
                {customers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Customer name" error={errors.customerName}>
            <Input
              name="customerName"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </Field>

          <Field label="Contact" hint="Messenger name or phone number.">
            <Input
              name="contact"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className={CARD}>
        <h2 className={`${HEADING_BOX} text-base font-semibold tracking-tight`}>
          Payment today
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Total project price"
            hint="The agreed price for the whole job."
            error={errors.total}
          >
            <Input
              name="total"
              inputMode="decimal"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
              placeholder="e.g. 9000"
            />
          </Field>

          <Field label="Payment type" error={errors.kind}>
            <Select
              name="kind"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as "down" | "full")
              }
            >
              <option value="down">Downpayment</option>
              <option value="full">Full payment</option>
            </Select>
          </Field>

          <Field
            label="Amount paid now"
            hint={
              kind === "full"
                ? "The whole price."
                : "Only this goes on today's sales."
            }
            error={errors.amount}
          >
            <Input
              name="amount"
              inputMode="decimal"
              value={shownAmount}
              readOnly={kind === "full"}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 3000"
            />
          </Field>
        </div>

        <div className="rounded-control bg-surface-sunken p-3 ring-1 ring-line/60">
          <p className="text-xs text-muted">Balance (total minus paid now)</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight">
            {balanceCentavos === null ? (
              "—"
            ) : balanceCentavos < 0 ? (
              <span className="text-attention">
                <span aria-hidden="true">{"⚠"} </span>
                More than the total
              </span>
            ) : (
              formatPesos(balanceCentavos)
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            The balance stays on the project. It is not part of today&apos;s
            sales.
          </p>
        </div>

        {belowPolicy ? (
          <Notice tone="attention" title="Under the down payment policy">
            <p>
              That is under the {downPaymentPercent}% down payment policy. You
              can still take it - this is only a warning.
            </p>
          </Notice>
        ) : null}

        <PaymentMethodFields
          method={paymentMethod}
          onMethod={setPaymentMethod}
          moneyGiven={moneyGiven}
          onMoneyGiven={setMoneyGiven}
          reference={reference}
          onReference={setReference}
          amountCentavos={amountCentavos}
          moneyGivenError={errors.moneyGiven}
        />
      </div>

      <SubmitBar pending={pending} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// The job's fields, drawn from the config
// ---------------------------------------------------------------------------

function JobFields({
  typeId,
  errors,
}: {
  typeId: ProjectTypeId;
  errors: Record<string, string>;
}) {
  const type = PROJECT_TYPES[typeId];
  const [values, setValues] = useState<Record<string, string>>({});
  const [sizes, setSizes] = useState<Record<string, string>>({});

  const set = (id: string, value: string) =>
    setValues((current) => ({ ...current, [id]: value }));

  function control(field: FieldDef): ReactNode {
    const name = detailInputName(field.id);
    const value = values[field.id] ?? "";
    switch (field.kind) {
      case "select":
        return (
          <Select
            name={name}
            value={value}
            onChange={(event) => set(field.id, event.target.value)}
          >
            <option value="">Choose…</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        );
      case "textarea":
        return (
          <textarea
            name={name}
            rows={2}
            value={value}
            onChange={(event) => set(field.id, event.target.value)}
            className={TEXTAREA_CLASS}
            placeholder={field.placeholder}
          />
        );
      default:
        return (
          <Input
            name={name}
            inputMode={
              field.kind === "integer"
                ? "numeric"
                : field.kind === "number"
                  ? "decimal"
                  : undefined
            }
            value={value}
            onChange={(event) => set(field.id, event.target.value)}
            placeholder={field.placeholder}
          />
        );
    }
  }

  const pieces =
    type.sizesSumTo && /^\d+$/.test(values[type.sizesSumTo] ?? "")
      ? Number(values[type.sizesSumTo])
      : null;
  const sizeTotal = APPAREL_SIZES.reduce(
    (sum, size) =>
      sum + (/^\d+$/.test(sizes[size] ?? "") ? Number(sizes[size]) : 0),
    0,
  );

  return (
    <div className="space-y-4">
      {type.fields.map((field) => (
        <Field
          key={field.id}
          label={field.label}
          hint={field.hint}
          error={errors[field.id]}
        >
          {control(field)}
        </Field>
      ))}

      {type.sizesSumTo ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Size breakdown</legend>
          <p className="text-xs text-muted">
            How many of each size. They have to add up to the number of pieces.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {APPAREL_SIZES.map((size) => (
              <Field key={size} label={size}>
                <Input
                  name={sizeInputName(size)}
                  inputMode="numeric"
                  value={sizes[size] ?? ""}
                  onChange={(event) =>
                    setSizes((current) => ({
                      ...current,
                      [size]: event.target.value,
                    }))
                  }
                />
              </Field>
            ))}
          </div>
          <p
            aria-live="polite"
            className={`text-sm ${
              pieces !== null && sizeTotal !== pieces
                ? "text-attention"
                : "text-muted"
            }`}
          >
            {pieces === null ? (
              <>Sizes so far: {sizeTotal}</>
            ) : sizeTotal === pieces ? (
              <>
                <span aria-hidden="true">{"✓"} </span>
                Sizes add up to {sizeTotal} of {pieces} pieces
              </>
            ) : (
              <>
                <span aria-hidden="true">{"⚠"} </span>
                Sizes add up to {sizeTotal} of {pieces} pieces
                {sizeTotal === 0
                  ? ""
                  : sizeTotal < pieces
                    ? ` - ${pieces - sizeTotal} short`
                    : ` - ${sizeTotal - pieces} too many`}
              </>
            )}
          </p>
          {errors.sizes ? (
            <p className="flex items-start gap-1.5 text-xs text-attention">
              <span aria-hidden="true">{"⚠"}</span>
              <span>{errors.sizes}</span>
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <Field label={NOTES_FIELD.label} error={errors[NOTES_FIELD.id]}>
        <textarea
          name={detailInputName(NOTES_FIELD.id)}
          rows={2}
          value={values[NOTES_FIELD.id] ?? ""}
          onChange={(event) => set(NOTES_FIELD.id, event.target.value)}
          className={TEXTAREA_CLASS}
          placeholder={NOTES_FIELD.placeholder}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A payment on a project already started
// ---------------------------------------------------------------------------

function FollowUpForm({
  project,
  onDone,
  onAnother,
}: {
  project: FindableProject;
  onDone: () => void;
  onAnother: () => void;
}) {
  const [state, submit, pending] = useActionState<BalanceState, FormData>(
    async (previous, formData) => {
      const next = await recordProjectBalanceAction(previous, formData);
      if (next.paid) onDone();
      return next;
    },
    {},
  );

  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [moneyGiven, setMoneyGiven] = useState("");
  const [reference, setReference] = useState("");

  const amountCentavos = tryPesos(amount);
  const remaining =
    amountCentavos === null ? null : project.balanceCentavos - amountCentavos;

  if (state.paid) {
    return (
      <PaymentDone
        heading="Project payment taken"
        saleId={state.paid.saleId}
        saleNumber={state.paid.saleNumber}
        projectNumber={state.paid.projectNumber}
        changeCentavos={paymentMethod === "cash" ? state.paid.changeCentavos : 0}
        balanceCentavos={state.paid.balanceCentavos}
        onAnother={onAnother}
      />
    );
  }

  return (
    <form
      action={submit}
      className="space-y-6"
      noValidate
      aria-label="Payment on a started project"
    >
      <input type="hidden" name="projectId" value={project.id} />

      {state.error ? (
        <Notice tone="attention" title="The payment was not saved">
          <p>{state.error}</p>
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={CARD}>
          <h2 className={`${HEADING_BOX} text-base font-semibold tracking-tight`}>The job</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{project.number}</Tag>
            <Tag>{project.typeLabel}</Tag>
          </div>
          <ul className="space-y-1 text-sm">
            {project.lines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            The job cannot be changed here. Open it from Projects to do that.
          </p>
        </div>

        <div className={CARD}>
          <h2 className={`${HEADING_BOX} text-base font-semibold tracking-tight`}>
            The customer
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Customer</dt>
              <dd>{project.customerName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Contact</dt>
              <dd>
                {project.contact ?? (
                  <span className="text-muted">Not recorded</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Due</dt>
              <dd>
                {project.dueOn ? (
                  formatManilaDate(`${project.dueOn}T12:00:00+08:00`)
                ) : (
                  <span className="text-muted">No date</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className={CARD}>
        <h2 className={`${HEADING_BOX} text-base font-semibold tracking-tight`}>
          Payment today
        </h2>

        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-control bg-surface-sunken p-3 ring-1 ring-line/60">
            <dt className="text-xs text-muted">Total price</dt>
            <dd className="mt-0.5 text-xl font-semibold tracking-tight">
              {formatPesos(project.totalCentavos)}
            </dd>
          </div>
          <div className="rounded-control bg-surface-sunken p-3 ring-1 ring-line/60">
            <dt className="text-xs text-muted">Paid so far</dt>
            <dd className="mt-0.5 text-xl font-semibold tracking-tight">
              {formatPesos(project.paidCentavos)}
            </dd>
          </div>
          <div className="rounded-control bg-surface-sunken p-3 ring-1 ring-line/60">
            <dt className="text-xs text-attention">
              <span aria-hidden="true">{"⚠"} </span>
              Balance due
            </dt>
            <dd className="mt-0.5 text-xl font-semibold tracking-tight">
              {formatPesos(project.balanceCentavos)}
            </dd>
          </div>
        </dl>

        <Field
          label="Amount paid now"
          hint={`Up to the ${formatPesos(project.balanceCentavos)} balance. Less is an installment.`}
          error={state.fieldErrors?.amount}
        >
          <Input
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="e.g. 500"
          />
        </Field>
        <button
          type="button"
          onClick={() =>
            setAmount(centavosToDecimalString(project.balanceCentavos))
          }
          className={`text-sm underline underline-offset-2 ${TAP_AREA}`}
        >
          Pay the whole balance
        </button>

        <p className="text-sm text-muted">
          {remaining === null ? null : remaining < 0 ? (
            <span className="text-attention">
              <span aria-hidden="true">{"⚠"} </span>
              More than the balance
            </span>
          ) : remaining === 0 ? (
            "This clears the balance and marks the project fully paid."
          ) : (
            `${formatPesos(remaining)} would still be owed.`
          )}
        </p>

        <PaymentMethodFields
          method={paymentMethod}
          onMethod={setPaymentMethod}
          moneyGiven={moneyGiven}
          onMoneyGiven={setMoneyGiven}
          reference={reference}
          onReference={setReference}
          amountCentavos={amountCentavos}
          moneyGivenError={state.fieldErrors?.moneyGiven}
        />
      </div>

      <SubmitBar pending={pending} />
    </form>
  );
}
