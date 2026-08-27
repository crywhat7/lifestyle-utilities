import { Check, Cross, Spark } from "@/components/icons";
import type { DecisionRecord } from "@/lib/decisions";
import {
  SIZE_LABEL,
  TYPE_LABEL,
  formatMoney,
  riskLevel,
  type Verdict,
} from "@/lib/money";
import { retryAnalysis } from "./actions";
import { Dial } from "./dial";
import { RiskPanel } from "./risk-panel";
import { TimeReadout } from "./time-readout";

/** Qué decirle a la persona según lo que falló de verdad. */
const ERROR_COPY: Record<string, string> = {
  quota:
    "Se agotó la cuota diaria de todos los modelos disponibles. Se renueva sola: probá más tarde.",
  overloaded:
    "Todos los modelos estaban saturados. Pasa seguido y es pasajero; reintentar casi siempre alcanza.",
  timeout:
    "Los modelos tardaron más de lo que esperamos. Suele contestar bien al segundo intento.",
  bad_response:
    "Ningún modelo devolvió una respuesta con el formato que esperábamos.",
  network: "No pudimos llegar a ningún proveedor de IA.",
  no_key: "No hay ningún proveedor de IA configurado en el entorno.",
};

const DEFAULT_ERROR = "La IA no contestó esta vez.";

export type ViewProfile = {
  monthly_income: number;
  hours_per_day: number;
  hourly_rate: number;
  currency: string;
};

export function DecisionView({
  decision,
  profile,
}: {
  decision: DecisionRecord;
  profile: ViewProfile;
}) {
  const price = decision.price != null ? Number(decision.price) : null;
  const hours = decision.hours_cost != null ? Number(decision.hours_cost) : null;
  const share =
    decision.income_share != null ? Number(decision.income_share) : null;
  const verdict: Verdict = decision.verdict ?? "think";

  const pending = decision.ai_status === "pending";
  const failed = decision.ai_status === "failed";
  const highRisk = share != null && riskLevel(share) === "high";
  const errorCopy =
    (decision.ai_error ? ERROR_COPY[decision.ai_error] : null) ?? DEFAULT_ERROR;

  // Sin precio no hay nada que mostrar todavía: la IA lo está estimando.
  if (price == null || hours == null || share == null) {
    return (
      <div className="plate flex flex-1 items-center justify-center">
        {pending ? (
          <Dial
            label="Buscando el precio"
            hint={`Estimando cuánto cuesta “${decision.query}” y cuántas horas de tu vida son.`}
          />
        ) : (
          <div className="px-6 py-10 text-center">
            <p className="display text-[1.25rem]">No pudimos estimarlo</p>
            <p className="mx-auto mt-2 max-w-[17rem] text-[0.8125rem] leading-relaxed text-[var(--text-3)]">
              {errorCopy}{" "}
              También podés escribir el precio a mano: el cálculo es
              instantáneo.
            </p>
            <div className="mt-6">
              <RetryButton id={decision.id} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ProductCard decision={decision} price={price} pending={pending} />

      <TimeReadout
        hours={hours}
        incomeShare={share}
        verdict={verdict}
        hoursPerDay={profile.hours_per_day}
        hourlyRate={Number(decision.hourly_rate_snap) || profile.hourly_rate}
        currency={decision.currency}
      />

      {highRisk ? (
        <RiskPanel
          price={price}
          currency={decision.currency}
          monthlyIncome={profile.monthly_income}
          hourlyRate={Number(decision.hourly_rate_snap) || profile.hourly_rate}
          hoursPerDay={profile.hours_per_day}
        />
      ) : null}

      {pending ? (
        <section className="plate">
          <Dial
            label="Analizando"
            hint="Clasificando la compra y armando los argumentos a favor y en contra."
            size="size-16"
          />
        </section>
      ) : null}

      {failed ? (
        <section className="plate p-5">
          <p className="eyebrow">Sin análisis</p>
          <p className="mt-3 text-[0.875rem] leading-relaxed text-[var(--text-2)]">
            {errorCopy}
          </p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-3)]">
            Los números de arriba son tuyos igual: no dependen de la IA.
          </p>
          <div className="mt-5">
            <RetryButton id={decision.id} />
          </div>
        </section>
      ) : null}

      {!pending && !failed ? (
        <>
          <ProsCons pros={decision.pros} cons={decision.cons} />

          {decision.ai_opinion ? (
            <section className="plate p-5">
              <p className="flex items-center gap-2 text-[0.6875rem] tracking-[0.18em] text-[var(--text-3)] uppercase">
                <Spark className="size-3.5 text-[var(--accent)]" />
                Qué hacer
              </p>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--text-1)]">
                {decision.ai_opinion}
              </p>
            </section>
          ) : null}

          <RetryButton id={decision.id} subtle />
        </>
      ) : null}

      {decision.price_is_estimated ? (
        <p className="px-1 text-[0.75rem] leading-relaxed text-[var(--text-3)]">
          El precio es una estimación de la IA, no un precio de tienda.
          Verificalo antes de comprar.
        </p>
      ) : null}
    </div>
  );
}

function ProductCard({
  decision,
  price,
  pending,
}: {
  decision: DecisionRecord;
  price: number;
  pending: boolean;
}) {
  const original =
    decision.price_original != null ? Number(decision.price_original) : null;
  const converted =
    original != null &&
    decision.purchase_currency != null &&
    decision.purchase_currency !== decision.currency;

  return (
    <section className="groove flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="eyebrow">Tu elección</p>
        <p className="mt-1.5 truncate text-[1.0625rem] font-medium">
          {decision.product_name}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {decision.category ? (
            <span className="chip">{decision.category}</span>
          ) : null}
          {decision.purchase_type ? (
            <span className="chip">{TYPE_LABEL[decision.purchase_type]}</span>
          ) : null}
          {decision.size_bucket ? (
            <span className="chip">{SIZE_LABEL[decision.size_bucket]}</span>
          ) : null}
          {pending && !decision.category ? (
            <span className="chip text-[var(--text-3)]">Clasificando…</span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="display text-[1.5rem] tabular-nums">
          {formatMoney(price, decision.currency)}
        </p>
        {converted ? (
          <p className="mt-1 text-[0.6875rem] text-[var(--text-3)] tabular-nums">
            {formatMoney(original, decision.purchase_currency!)}
          </p>
        ) : null}
        {decision.price_is_estimated ? (
          <p className="mt-1 text-[0.6875rem] tracking-[0.12em] text-[var(--text-3)] uppercase">
            Estimado
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** A favor y en contra, específicos de este producto y este presupuesto. */
function ProsCons({
  pros,
  cons,
}: {
  pros: string[] | null;
  cons: string[] | null;
}) {
  const forList = pros ?? [];
  const againstList = cons ?? [];

  if (forList.length === 0 && againstList.length === 0) return null;

  return (
    <section className="plate p-5">
      <p className="eyebrow">Pros y contras</p>

      <div className="mt-4 flex flex-col">
        <ArgumentList
          title="A favor"
          items={forList}
          tone="#c6f24e"
          kind="pro"
        />

        {forList.length > 0 && againstList.length > 0 ? (
          <span
            aria-hidden="true"
            className="my-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
          />
        ) : null}

        <ArgumentList
          title="En contra"
          items={againstList}
          tone="#ff7a5c"
          kind="con"
        />
      </div>
    </section>
  );
}

function ArgumentList({
  title,
  items,
  tone,
  kind,
}: {
  title: string;
  items: string[];
  tone: string;
  kind: "pro" | "con";
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p
        className="text-[0.6875rem] tracking-[0.16em] uppercase"
        style={{ color: tone }}
      >
        {title}
      </p>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {items.map((item, index) => (
          <li
            key={index}
            className="flex gap-2.5 text-[0.875rem] leading-relaxed text-[var(--text-2)]"
          >
            <span
              className="mt-[0.3125rem] flex size-4 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${tone}26`, color: tone }}
            >
              {kind === "pro" ? (
                <Check className="size-2.5" />
              ) : (
                <Cross className="size-2.5" />
              )}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pedirle a la IA que lo vuelva a mirar. */
function RetryButton({ id, subtle = false }: { id: string; subtle?: boolean }) {
  return (
    <form action={retryAnalysis}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={
          subtle
            ? "mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-[0.75rem] text-[var(--text-3)] transition-colors duration-300 [transition-timing-function:var(--ease-quart)] active:text-[var(--accent)]"
            : "key flex h-12 w-full items-center justify-center gap-2 text-[0.9375rem] font-medium text-[var(--text-1)]"
        }
      >
        <Spark className={subtle ? "size-3" : "size-4 text-[var(--accent)]"} />
        Volver a analizar
      </button>
    </form>
  );
}
