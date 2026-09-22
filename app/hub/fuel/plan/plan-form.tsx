"use client";

import { useActionState, type CSSProperties } from "react";
import { Spark } from "@/components/icons";
import {
  ACTIVITY_LABEL,
  GOAL_LABEL,
  SEX_LABEL,
  type Activity,
  type FuelProfile,
  type Goal,
  type Sex,
} from "@/lib/fuel";
import { savePlan, type PlanState } from "../actions";

const IDLE: PlanState = { status: "idle" };

const SEXES: Sex[] = ["female", "male"];
const GOALS: Goal[] = ["lose", "maintain", "gain"];
const ACTIVITIES: Activity[] = ["sedentary", "light", "moderate", "high"];

/**
 * El cuerpo y la meta. Seis datos, una sola pantalla, un solo botón.
 *
 * Es un formulario HTML de verdad —radios y números con nombre— y no un
 * estado de React armando un objeto: así los valores de la vez anterior
 * vienen puestos, y si la IA tarda, lo escrito sigue ahí.
 */
export function PlanForm({ profile, delay = 0 }: { profile: FuelProfile | null; delay?: number }) {
  const [state, action, pending] = useActionState(savePlan, IDLE);

  return (
    <form
      action={action}
      className="kindle flex flex-col gap-6"
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <fieldset className="flex flex-col gap-2.5">
        <legend className="e-eyebrow mb-2.5">Quiero</legend>
        <div className="grid grid-cols-3 gap-2">
          {GOALS.map((goal) => (
            <label key={goal} className="e-opt h-14 text-[0.9375rem]">
              <input
                type="radio"
                name="goal"
                value={goal}
                defaultChecked={(profile?.goal ?? "lose") === goal}
                required
              />
              {GOAL_LABEL[goal].name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="e-eyebrow mb-2.5">Sexo</legend>
        <div className="grid grid-cols-2 gap-2">
          {SEXES.map((sex) => (
            <label key={sex} className="e-opt h-12 text-[0.875rem]">
              <input type="radio" name="sex" value={sex} defaultChecked={profile?.sex === sex} required />
              {SEX_LABEL[sex]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-2.5">
        <NumberField name="age" label="Edad" unit="años" value={profile?.age} min={14} max={100} step={1} />
        <NumberField
          name="height_cm"
          label="Altura"
          unit="cm"
          value={profile?.height_cm}
          min={120}
          max={230}
          step={0.5}
        />
        <NumberField
          name="weight_kg"
          label="Peso"
          unit="kg"
          value={profile?.weight_kg}
          min={30}
          max={300}
          step={0.1}
        />
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="e-eyebrow mb-2.5">Qué tan activo sos</legend>
        <div className="grid grid-cols-2 gap-2">
          {ACTIVITIES.map((activity) => (
            <label
              key={activity}
              className="e-opt flex-col items-start justify-start gap-1 rounded-[20px] px-4 py-3.5 text-left"
            >
              <input
                type="radio"
                name="activity"
                value={activity}
                defaultChecked={(profile?.activity ?? "light") === activity}
                required
              />
              <span className="text-[0.9375rem]">{ACTIVITY_LABEL[activity].name}</span>
              <span className="text-[0.75rem] leading-snug text-[var(--e-ink-3)]">
                {ACTIVITY_LABEL[activity].hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="e-key e-key-lit flex h-14 items-center justify-center gap-2 text-[0.9375rem] font-medium"
      >
        <Spark className="size-4" />
        {pending ? "La IA está armando tu plan…" : profile?.target_kcal ? "Recalcular mi plan" : "Calcular mi plan"}
      </button>

      {state.status === "error" ? (
        <p role="alert" className="-mt-2 text-center text-[0.8125rem] text-[var(--e-over-ink)]">
          {state.error}
        </p>
      ) : state.status === "saved" ? (
        <p role="status" className="-mt-2 text-center text-[0.8125rem] text-[var(--e-ink-2)]">
          {state.offline
            ? "Plan guardado con la fórmula clínica: la IA no contestó esta vez."
            : "Plan actualizado. Tu fogón ya cuenta contra la meta nueva."}
        </p>
      ) : null}
    </form>
  );
}

function NumberField({
  name,
  label,
  unit,
  value,
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  unit: string;
  value: number | undefined;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="e-eyebrow tracking-[0.16em]">{label}</span>
      <span className="relative">
        <input
          type="number"
          name={name}
          inputMode="decimal"
          defaultValue={value ?? ""}
          min={min}
          max={max}
          step={step}
          required
          className="e-field pr-10 text-[1.125rem]"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[0.75rem] text-[var(--e-ink-3)]">
          {unit}
        </span>
      </span>
    </label>
  );
}
