"use client";

import { useState } from "react";
import {
  ORDINAL_OPTIONS,
  WEEKDAY_OPTIONS,
  type Freq,
  type Recurrence,
} from "@/lib/pocket";

/*
   Los rótulos son cortos a la fuerza: son tres teclas en un riel de 270px y
   una que se parta en dos líneas desnivela todo el control. "1er/último" es
   lo más corto que sigue diciendo de qué se trata — el detalle exacto lo
   eligen los dos selectores que aparecen debajo.
*/
const TABS: { value: Freq; label: string }[] = [
  { value: "monthly_day", label: "Día del mes" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly_weekday", label: "1er/último" },
];

/**
 * Cada cuánto vuelve esto.
 *
 * Tres formas de decir lo mismo, y solo una a la vista: el riel elige la
 * frecuencia y debajo aparecen únicamente los campos que esa frecuencia usa.
 * Mostrar los tres juegos de controles a la vez obligaría a leer cuál manda,
 * que es exactamente la pregunta que este control existe para evitar.
 *
 * Lo que no se ve no viaja: los campos ocultos no se renderizan, así que la
 * acción del servidor recibe la regla ya limpia.
 */
export function RecurrenceFields({
  id,
  value,
  optionalDay = false,
}: {
  /** Prefijo de los ids: hay dos de estos en la misma pantalla. */
  id: string;
  value?: Recurrence | null;
  /** El gasto contemplado puede no tener día; el pago no. */
  optionalDay?: boolean;
}) {
  const [freq, setFreq] = useState<Freq>(value?.freq ?? "monthly_day");

  return (
    <div className="flex flex-col gap-3">
      <span className="field-label">Cada cuánto</span>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className="tab text-[0.75rem]"
            data-active={freq === tab.value ? "true" : "false"}
            onClick={() => setFreq(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <input type="hidden" name="freq" value={freq} />

      {freq === "monthly_day" ? (
        <div>
          <label className="field-label" htmlFor={`${id}-day`}>
            {optionalDay ? "Día del mes · opcional" : "Día del mes"}
          </label>
          <input
            id={`${id}-day`}
            name="day_of_month"
            type="number"
            inputMode="numeric"
            min="1"
            max="31"
            required={!optionalDay}
            defaultValue={value?.day_of_month ?? (optionalDay ? "" : 15)}
            placeholder={optionalDay ? "Ej. 5" : undefined}
            className="field tabular-nums"
          />
          <p className="mt-2 px-1 text-[0.75rem] text-[var(--text-3)]">
            El 31 en un mes de 30 cae el último día que sí existe.
          </p>
        </div>
      ) : null}

      {freq === "weekly" ? (
        <div>
          <label className="field-label" htmlFor={`${id}-weekday`}>
            Todos los
          </label>
          <select
            id={`${id}-weekday`}
            name="weekday"
            defaultValue={value?.weekday ?? 3}
            className="field"
          >
            {WEEKDAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {freq === "monthly_weekday" ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="field-label" htmlFor={`${id}-ordinal`}>
              Cuál
            </label>
            <select
              id={`${id}-ordinal`}
              name="week_ordinal"
              defaultValue={value?.week_ordinal ?? 1}
              className="field text-[0.9375rem]"
            >
              {ORDINAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-nth-weekday`}>
              Día
            </label>
            <select
              id={`${id}-nth-weekday`}
              name="weekday"
              defaultValue={value?.weekday ?? 6}
              className="field text-[0.9375rem]"
            >
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
