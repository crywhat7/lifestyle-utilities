"use client";

import {
  startTransition,
  useActionState,
  useState,
  type CSSProperties,
} from "react";
import { Check, Cross, Drop, PlusSlot, Power, Trash } from "@/components/icons";
import {
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  freqLabel,
  hhmm,
  intention,
  timeLabel,
  type Habit,
  type HabitFreq,
  type Polarity,
} from "@/lib/habits";
import {
  deleteHabit,
  saveHabit,
  setHabitActive,
  type FormState,
} from "../actions";

const INITIAL: FormState = { status: "idle" };

/** El molde para armar la frase de un hábito que todavía no existe. */
const EMPTY_HABIT: Habit = {
  id: "",
  name: "",
  polarity: "good",
  freq: "daily",
  weekdays: null,
  interval_days: null,
  anchor_date: "",
  unit_label: null,
  cue: null,
  reward: null,
  start_time: null,
  end_time: null,
  remind: true,
  active: true,
  sort_order: 0,
};

export function HabitManager({ habits }: { habits: Habit[] }) {
  // `null` = cerrado, `"new"` = alta, un id = edición de ese hábito.
  const [editing, setEditing] = useState<string | null>(null);

  const active = habits.filter((habit) => habit.active);
  const paused = habits.filter((habit) => !habit.active);

  return (
    <section className="flex flex-col gap-2.5">
      {editing === "new" ? (
        <HabitForm onClose={() => setEditing(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="gkey settle flex h-12 items-center justify-center gap-2 text-[0.875rem]"
          style={{ "--d": "200ms" } as CSSProperties}
        >
          <PlusSlot className="size-4" />
          Nuevo hábito
        </button>
      )}

      {active.map((habit, index) =>
        editing === habit.id ? (
          <HabitForm
            key={habit.id}
            habit={habit}
            onClose={() => setEditing(null)}
          />
        ) : (
          <HabitRow
            key={habit.id}
            habit={habit}
            delay={260 + index * 55}
            onEdit={() => setEditing(habit.id)}
          />
        )
      )}

      {paused.length > 0 ? (
        <>
          <p className="glass-eyebrow mt-4">En pausa</p>
          {paused.map((habit, index) =>
            editing === habit.id ? (
              <HabitForm
                key={habit.id}
                habit={habit}
                onClose={() => setEditing(null)}
              />
            ) : (
              <HabitRow
                key={habit.id}
                habit={habit}
                delay={320 + index * 55}
                onEdit={() => setEditing(habit.id)}
              />
            )
          )}
        </>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* La fila                                                                     */
/* -------------------------------------------------------------------------- */

function HabitRow({
  habit,
  delay,
  onEdit,
}: {
  habit: Habit;
  delay: number;
  onEdit: () => void;
}) {
  const bad = habit.polarity === "bad";

  return (
    <article
      className="pane settle flex items-center gap-3 p-3.5"
      style={{ "--d": `${delay}ms`, opacity: habit.active ? 1 : 0.62 } as CSSProperties}
    >
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
        aria-label={`Editar ${habit.name}`}
      >
        <span className="flex items-center gap-2">
          {bad ? (
            <Drop className="size-3.5 shrink-0 text-[var(--g-bad-ink)]" />
          ) : (
            <Check className="size-3.5 shrink-0 text-[var(--g-good-ink)]" />
          )}
          <span className="truncate text-[1.0625rem]">{habit.name}</span>
        </span>
        <span className="mt-1 block truncate text-[0.75rem] text-[var(--g-ink-3)]">
          {[
            timeLabel(habit),
            freqLabel(habit),
            bad ? `se cuenta en ${habit.unit_label ?? "veces"}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>

        {/* La intención escrita, que es lo que la persona quiere releer al
            volver acá: la regla ya la dice la línea de arriba. */}
        {habit.cue ? (
          <span className="mt-1.5 line-clamp-2 text-[0.75rem] leading-relaxed text-[var(--g-ink-2)] italic">
            {intention(habit)}
          </span>
        ) : null}
      </button>

      {/* Pausar es un icono y no la palabra: a 375px el rótulo se comía el
          nombre del hábito, que es lo único que hay que poder leer acá. */}
      <button
        type="button"
        aria-label={habit.active ? `Pausar ${habit.name}` : `Reactivar ${habit.name}`}
        title={habit.active ? "Pausar" : "Reactivar"}
        className="gkey flex size-9 items-center justify-center"
        onClick={() =>
          startTransition(async () => {
            await setHabitActive(habit.id, !habit.active);
          })
        }
      >
        <Power className="size-3.5" />
      </button>

      <button
        type="button"
        aria-label={`Borrar ${habit.name}`}
        className="gkey flex size-9 items-center justify-center"
        onClick={() =>
          startTransition(async () => {
            await deleteHabit(habit.id);
          })
        }
      >
        <Trash className="size-3.5" />
      </button>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* El formulario                                                               */
/* -------------------------------------------------------------------------- */

function HabitForm({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const [polarity, setPolarity] = useState<Polarity>(habit?.polarity ?? "good");
  const [freq, setFreq] = useState<HabitFreq>(habit?.freq ?? "daily");
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? [1, 3, 5]);

  /*
    Estos cinco van controlados —y no con `defaultValue`— porque la frase de
    abajo se arma con ellos mientras se escribe. Ver la intención completa
    tomando forma es lo que hace que alguien complete la señal en vez de
    saltearla: sin eso son cuatro campos opcionales que nadie llena.
  */
  const [name, setName] = useState(habit?.name ?? "");
  const [cue, setCue] = useState(habit?.cue ?? "");
  const [reward, setReward] = useState(habit?.reward ?? "");
  const [start, setStart] = useState(hhmm(habit?.start_time) ?? "");
  const [end, setEnd] = useState(hhmm(habit?.end_time) ?? "");

  const sentence = intention({
    ...(habit ?? EMPTY_HABIT),
    name: name || (polarity === "good" ? "el hábito" : "eso"),
    polarity,
    cue: cue || null,
    reward: reward || null,
    start_time: start || null,
    end_time: end || null,
  });

  /*
    Cerrar es parte de guardar, así que vive adentro de la acción y no en un
    efecto que mire el estado un render después: ese efecto disparaba una
    cascada de renders por cada alta. Si falla, el formulario se queda
    abierto con lo escrito adentro.
  */
  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await saveHabit(prev, formData);
      if (result.status === "saved") onClose();
      return result;
    },
    INITIAL
  );

  function toggleDay(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day]
    );
  }

  return (
    <form action={action} className="pane settle flex flex-col gap-4 p-4">
      {habit ? <input type="hidden" name="id" value={habit.id} /> : null}
      <input type="hidden" name="polarity" value={polarity} />
      <input type="hidden" name="freq" value={freq} />
      {freq === "weekdays"
        ? weekdays.map((day) => (
            <input key={day} type="hidden" name="weekdays" value={day} />
          ))
        : null}

      <input
        name="name"
        required
        maxLength={60}
        autoFocus={!habit}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={polarity === "good" ? "Caminar 30 minutos" : "Coca-cola"}
        className="gfield"
      />

      {/*
        Bueno o malo no es un juicio: define qué significa marcar. En el
        bueno, marcar suma. En el malo, marcar es la caída que se cuenta —y
        el porcentaje sube los días en que nadie toca nada.
      */}
      <div className="flex gap-2">
        <Segment
          active={polarity === "good"}
          onClick={() => setPolarity("good")}
          label="Quiero sostenerlo"
        />
        <Segment
          active={polarity === "bad"}
          onClick={() => setPolarity("bad")}
          label="Quiero contarlo"
          tone="bad"
        />
      </div>

      {polarity === "bad" ? (
        <label className="block">
          <span className="glass-eyebrow">Qué se cuenta</span>
          <input
            name="unit_label"
            maxLength={20}
            defaultValue={habit?.unit_label ?? ""}
            placeholder="vasos, panes, cigarros…"
            className="gfield mt-2"
          />
        </label>
      ) : null}

      {/*
        Las tres patas que le faltan al hábito solo.

        Señal, hora y resultado no son metadatos decorativos: son el ciclo
        completo. El campo de la señal va antes que la hora a propósito —una
        señal encadenada a algo que ya hacés todos los días es más confiable
        que un horario, y quien la escribe primero suele poner una mejor.
      */}
      <div className="flex flex-col gap-2">
        <span className="glass-eyebrow">La señal · cuando…</span>
        <input
          name="cue"
          maxLength={80}
          value={cue}
          onChange={(event) => setCue(event.target.value)}
          placeholder="Termine de desayunar"
          className="gfield"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="glass-eyebrow">La hora</span>
        <div className="flex items-center gap-2">
          <input
            type="time"
            name="start_time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            aria-label="Hora de inicio"
            className="gfield flex-1 text-center"
          />
          <span className="text-[0.8125rem] text-[var(--g-ink-3)]">hasta</span>
          <input
            type="time"
            name="end_time"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            disabled={!start}
            aria-label="Cierre de la ventana (opcional)"
            className="gfield flex-1 text-center disabled:opacity-45"
          />
        </div>
        <p className="text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
          {start
            ? end
              ? "Tenés esa ventana entera. Si se está por cerrar y no lo marcaste, te llega una última llamada."
              : "Dejá el cierre vacío si es un momento puntual."
            : "Sin hora aparece igual en la lista de hoy, pero nadie te va a avisar."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="glass-eyebrow">El resultado</span>
        <input
          name="reward"
          maxLength={80}
          value={reward}
          onChange={(event) => setReward(event.target.value)}
          placeholder={
            polarity === "good"
              ? "Arrancar el día despierto"
              : "Dormir mal y despertar hinchado"
          }
          className="gfield"
        />
      </div>

      {/*
        El aviso solo existe si hay hora. Con el interruptor deshabilitado y
        el texto explicando por qué, nadie queda esperando un push que el
        servidor no tiene cuándo mandar.
      */}
      <label
        className="sunk flex items-center gap-3 p-3.5"
        style={{ opacity: start ? 1 : 0.5 }}
      >
        <input
          type="checkbox"
          name="remind"
          disabled={!start}
          defaultChecked={habit ? habit.remind : true}
          className="size-5 shrink-0 accent-[var(--g-good-lit)]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem]">Avisarme a esa hora</span>
          <span className="mt-0.5 block text-[0.75rem] text-[var(--g-ink-3)]">
            {start
              ? "El teléfono dice la señal aunque la app esté cerrada."
              : "Necesita una hora."}
          </span>
        </span>
      </label>

      {/* La intención completa, armándose mientras se escribe. */}
      {sentence ? (
        <p className="sunk px-3.5 py-3 text-[0.875rem] leading-relaxed text-[var(--g-ink-2)]">
          {sentence}
        </p>
      ) : null}

      <div>
        <span className="glass-eyebrow">Cada cuánto aparece</span>
        <div className="mt-2 flex gap-2">
          <Segment
            active={freq === "daily"}
            onClick={() => setFreq("daily")}
            label="Diario"
          />
          <Segment
            active={freq === "weekdays"}
            onClick={() => setFreq("weekdays")}
            label="Días"
          />
          <Segment
            active={freq === "interval"}
            onClick={() => setFreq("interval")}
            label="Cada N"
          />
        </div>
      </div>

      {freq === "weekdays" ? (
        <div className="flex justify-between gap-1.5">
          {WEEKDAY_SHORT.map((letter, day) => {
            const on = weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={on}
                aria-label={WEEKDAY_NAMES[day]}
                className={`gkey flex size-10 items-center justify-center text-[0.8125rem] ${
                  on ? "gkey-lit" : ""
                }`}
              >
                {letter}
              </button>
            );
          })}
        </div>
      ) : null}

      {freq === "interval" ? (
        <label className="flex items-center gap-3">
          <span className="text-[0.875rem] text-[var(--g-ink-2)]">Cada</span>
          <input
            type="number"
            name="interval_days"
            min={2}
            max={60}
            defaultValue={habit?.interval_days ?? 2}
            className="gfield w-24 text-center"
          />
          <span className="text-[0.875rem] text-[var(--g-ink-2)]">días</span>
        </label>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="text-center text-[0.8125rem] text-[var(--g-bad-ink)]">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="gkey flex h-11 flex-1 items-center justify-center gap-2 text-[0.8125rem]"
        >
          <Cross className="size-3.5" />
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="gkey gkey-lit flex h-11 flex-1 items-center justify-center text-[0.8125rem] disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

function Segment({
  active,
  onClick,
  label,
  tone = "good",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: Polarity;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="gkey flex h-10 flex-1 items-center justify-center px-2 text-[0.8125rem]"
      style={
        active
          ? ({
              borderColor:
                tone === "bad"
                  ? "color-mix(in oklch, var(--g-bad-lit) 50%, transparent)"
                  : "color-mix(in oklch, var(--g-good-lit) 50%, transparent)",
              color:
                tone === "bad" ? "var(--g-bad-ink)" : "var(--g-good-ink)",
            } as CSSProperties)
          : undefined
      }
    >
      {label}
    </button>
  );
}
