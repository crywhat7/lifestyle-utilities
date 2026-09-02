"use client";

import {
  Fragment,
  startTransition,
  useActionState,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  Check,
  Chevron,
  Cross,
  Drop,
  PlusSlot,
  Power,
  Spark,
  Trash,
} from "@/components/icons";
import {
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  chainOrder,
  descendantsOf,
  freqLabel,
  hhmm,
  intention,
  timeLabel,
  type ChainRow,
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
  place: null,
  start_time: null,
  end_time: null,
  remind: true,
  after_habit_id: null,
  active: true,
  sort_order: 0,
};

export function HabitManager({ habits }: { habits: Habit[] }) {
  // `null` = cerrado, `"new"` = alta, un id = edición de ese hábito.
  const [editing, setEditing] = useState<string | null>(null);

  /*
    El mismo orden que la lista de hoy: por hora, con cada cadena junta.
    Activos y pausados se ordenan por separado, así una cadena a medio pausar
    no arrastra a la fila de al lado a una sección que no le toca.
  */
  const active = chainOrder(habits.filter((habit) => habit.active));
  const paused = chainOrder(habits.filter((habit) => !habit.active));

  return (
    <section className="flex flex-col gap-2.5">
      {editing === "new" ? (
        <HabitForm habits={habits} onClose={() => setEditing(null)} />
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

      <HabitList
        rows={active}
        all={habits}
        baseDelay={260}
        editing={editing}
        onEdit={setEditing}
        onClose={() => setEditing(null)}
      />

      {paused.length > 0 ? (
        <>
          <p className="glass-eyebrow mt-4">En pausa</p>
          <HabitList
            rows={paused}
            all={habits}
            baseDelay={320}
            editing={editing}
            onEdit={setEditing}
            onClose={() => setEditing(null)}
          />
        </>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* La lista                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Los hábitos ya ordenados por hora, con un corte donde se termina la agenda.
 *
 * Sin ese corte, pasar de "22:00" a un hábito sin hora se lee como un error
 * de orden. Con él, la lista dice lo que es: primero el día en orden, después
 * lo que se puede hacer en cualquier momento.
 *
 * El rótulo solo aparece cuando la lista es mixta: si ninguno tiene hora, un
 * encabezado "Sin hora" arriba de todo es una etiqueta que no distingue nada.
 */
function HabitList({
  rows,
  all,
  baseDelay,
  editing,
  onEdit,
  onClose,
}: {
  rows: ChainRow[];
  /** Todos los hábitos: el formulario los necesita para elegir el anterior. */
  all: Habit[];
  baseDelay: number;
  editing: string | null;
  onEdit: (id: string) => void;
  onClose: () => void;
}) {
  // La hora que decide el corte es la efectiva: un hábito encadenado hereda
  // la de su cadena, así que se queda arriba con el resto de la agenda.
  const firstUntimed = rows.findIndex((row) => row.startsAt == null);
  const mixed = firstUntimed > 0;

  return rows.map((row, index) => (
    <Fragment key={row.habit.id}>
      {mixed && index === firstUntimed ? (
        <p
          className="glass-eyebrow settle mt-3"
          style={{ "--d": `${baseDelay + index * 55}ms` } as CSSProperties}
        >
          Sin hora
        </p>
      ) : null}

      {editing === row.habit.id ? (
        <HabitForm habit={row.habit} habits={all} onClose={onClose} />
      ) : (
        <HabitRow
          row={row}
          delay={baseDelay + index * 55}
          onEdit={() => onEdit(row.habit.id)}
        />
      )}
    </Fragment>
  ));
}

/* -------------------------------------------------------------------------- */
/* La fila                                                                     */
/* -------------------------------------------------------------------------- */

function HabitRow({
  row,
  delay,
  onEdit,
}: {
  row: ChainRow;
  delay: number;
  onEdit: () => void;
}) {
  const { habit, after } = row;
  const bad = habit.polarity === "bad";

  return (
    <article
      className="pane settle flex items-center gap-3 p-3.5"
      style={
        {
          "--d": `${delay}ms`,
          opacity: habit.active ? 1 : 0.62,
          // Sangría por nivel: la cadena se ve como lo que es, una rutina
          // colgando de su primer hábito.
          marginLeft: row.depth > 0 ? `${Math.min(row.depth, 3) * 1.25}rem` : undefined,
        } as CSSProperties
      }
    >
      {row.depth > 0 ? <span aria-hidden="true" className="link-arm" /> : null}
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
        aria-label={`Editar ${habit.name}`}
      >
        {/* El glifo se alinea con el PRIMER renglón, no con el centro del
            bloque: con un nombre de dos líneas quedaba flotando en el medio,
            apuntando a ninguna de las dos. */}
        <span className="flex items-start gap-2">
          {bad ? (
            <Drop className="mt-[0.2rem] size-3.5 shrink-0 text-[var(--g-bad-ink)]" />
          ) : (
            <Check className="mt-[0.2rem] size-3.5 shrink-0 text-[var(--g-good-ink)]" />
          )}
          {/* Dos renglones antes de cortar: los nombres reales son frases
              ("Beber algo que contenga azúcar"), no etiquetas de una palabra,
              y el nombre es lo único que no se puede dejar de leer. */}
          <span className="line-clamp-2 min-w-0 text-[1.0625rem] leading-snug">
            {habit.name}
          </span>
        </span>
        <span className="mt-1 block truncate text-[0.75rem] text-[var(--g-ink-3)]">
          {[
            after ? `Después de ${after.name.toLowerCase()}` : timeLabel(habit),
            freqLabel(habit),
            bad ? `se cuenta en ${habit.unit_label ?? "veces"}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>

        {/* La intención escrita, que es lo que la persona quiere releer al
            volver acá: la regla ya la dice la línea de arriba. */}
        {/* Entera, sin recortar: es la frase que la persona viene a releer, y
            cortada a la mitad no sirve para nada. Cuesta un renglón más. */}
        {habit.cue || habit.place || after ? (
          <span className="mt-1.5 block text-[0.75rem] leading-relaxed text-[var(--g-ink-2)] italic">
            {intention(habit, after?.name)}
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

function HabitForm({
  habit,
  habits,
  onClose,
}: {
  habit?: Habit;
  /** Todos, para poder elegir cuál dispara a este. */
  habits: Habit[];
  onClose: () => void;
}) {
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
  const [place, setPlace] = useState(habit?.place ?? "");
  const [start, setStart] = useState(hhmm(habit?.start_time) ?? "");
  const [end, setEnd] = useState(hhmm(habit?.end_time) ?? "");
  const [afterId, setAfterId] = useState(habit?.after_habit_id ?? "");

  /*
    El modo va aparte de la elección, y no derivado de ella.

    Si "encadenado" fuera simplemente "hay un padre elegido", tocar «Después
    de otro» tendría que elegir uno solo para que el modo se active — y
    elegirlo por la persona, alfabéticamente, es meterle un hábito que no
    pidió. Con el modo separado, el select puede arrancar vacío esperando una
    decisión.
  */
  const [mode, setMode] = useState<"cue" | "after">(
    habit?.after_habit_id ? "after" : "cue"
  );

  /*
    Qué hábitos puede tener adelante.

    Fuera quedan él mismo y todo lo que ya cuelga de él: elegir a un
    descendiente cerraría un círculo. El servidor lo vuelve a verificar —esto
    solo evita ofrecer una opción que va a ser rechazada—, y los hábitos en
    pausa siguen adentro porque la cadena se define aunque hoy no corra.
  */
  const options = useMemo(() => {
    const forbidden = habit
      ? new Set([habit.id, ...descendantsOf(habits, habit.id)])
      : new Set<string>();

    return habits
      .filter((candidate) => !forbidden.has(candidate.id))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [habits, habit]);

  const stacked = mode === "after";
  const afterName = options.find((option) => option.id === afterId)?.name ?? null;

  /*
    Cerrado al crear, abierto al editar algo que ya tiene esos datos.

    Abrir un hábito con señal y hora y ver solo el nombre da la impresión de
    que se perdieron. Si nunca se completaron, en cambio, no hay nada que
    mostrar y el formulario arranca corto.
  */
  const [open, setOpen] = useState(
    Boolean(
      habit &&
        (habit.cue ||
          habit.reward ||
          habit.place ||
          habit.start_time ||
          habit.after_habit_id ||
          habit.freq !== "daily")
    )
  );

  const sentence = intention(
    {
      ...(habit ?? EMPTY_HABIT),
      name: name || (polarity === "good" ? "el hábito" : "eso"),
      polarity,
      // Encadenado no hay texto de señal, igual que en lo que se guarda: la
      // frase de arriba no puede prometer algo distinto de lo que se manda.
      cue: stacked ? null : cue || null,
      reward: reward || null,
      place: place || null,
      start_time: start || null,
      end_time: end || null,
    },
    stacked ? afterName : null
  );

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

      {/*
        Todo lo demás vive detrás de este botón.

        Pedir señal, hora, resultado y frecuencia de entrada es pedirle a
        alguien que complete cuatro campos cuyo sentido todavía no conoce: o
        los llena de cualquier cosa o abandona el formulario. Con nombre y
        polaridad ya hay un hábito que funciona; el resto es lo que lo hace
        sostenerse, y quien quiera saber por qué lo abre y se lo explican.
      */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="gkey flex h-12 items-center gap-2.5 px-4 text-left"
      >
        <Spark className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.8125rem]">La ciencia del hábito</span>
          <span className="block truncate text-[0.6875rem] text-[var(--g-ink-3)]">
            Señal, hora, resultado y frecuencia
          </span>
        </span>
        {/* El giro va en un envoltorio: los glifos de `components/icons`
            solo aceptan `className`, y no vale ensuciar ese contrato
            compartido por una animación de una sola pantalla. */}
        <span
          aria-hidden="true"
          className="shrink-0 transition-transform duration-300 [transition-timing-function:var(--g-ease)]"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        >
          <Chevron className="size-4" />
        </span>
      </button>

      {/*
        Colapsado se esconde con `display: none`, NO desmontando los campos.

        Un campo desmontado no viaja en el `FormData`, y la acción lo leería
        como vacío: editar un hábito con señal y hora, guardarlo sin abrir
        esto, y perderlas las dos sin enterarte. Oculto, sale del orden de
        tabulación igual y sigue mandando su valor.

        La clase se elige entera en vez de sumar `hidden` a `flex` porque las
        dos son utilidades de `display` y cuál gana depende del orden en que
        Tailwind las emita.
      */}
      <div className={open ? "flex flex-col gap-4" : "hidden"}>
        <Science polarity={polarity} />

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
            <span className="mt-2 block text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
              Vacío cuenta en veces. Dos coca-colas no son una, y ese es el
              número que querés ver bajar.
            </span>
          </label>
        ) : null}

        {/*
          La señal, de dos maneras posibles y nunca de las dos a la vez.

          Encadenarla a otro hábito es la versión más confiable: el hábito
          anterior ya pasa todos los días sin que nadie tenga que acordarse.
          Por eso va primero en el orden de lectura cuando hay con qué.
        */}
        <div className="flex flex-col gap-2">
          <span className="glass-eyebrow">La señal</span>

          {options.length > 0 ? (
            <div className="flex gap-2">
              <Segment
                active={!stacked}
                onClick={() => setMode("cue")}
                label="Escribirla"
              />
              <Segment
                active={stacked}
                onClick={() => setMode("after")}
                label="Después de otro"
              />
            </div>
          ) : null}

          {stacked ? (
            <>
              <select
                name="after_habit_id"
                value={afterId}
                onChange={(event) => setAfterId(event.target.value)}
                aria-label="Hábito que lo dispara"
                className="gfield"
              >
                <option value="">Elegí el hábito anterior…</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <p className="text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
                Va a aparecer pegado a ese hábito en la lista de hoy, y se
                enciende en cuanto lo marques. Podés encadenar varios: así se
                arma una rutina entera.
              </p>
            </>
          ) : (
            <>
              {/* Sin `after_habit_id` el select no existe, y un campo que no
                  se envía se leería como "sin padre" — que es justo lo que
                  hay que guardar acá. */}
              <input
                name="cue"
                maxLength={80}
                value={cue}
                onChange={(event) => setCue(event.target.value)}
                placeholder="Termine de desayunar"
                className="gfield"
              />
              <p className="text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
                Encadenala a algo que ya hacés sin pensar. «Después de servir
                el café» funciona; «en la mañana» no le dice nada a nadie.
              </p>
            </>
          )}
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
              : "Una intención sin hora es un deseo. Sin ella aparece igual en la lista, pero nadie te va a avisar."}
          </p>
        </div>

        {/*
          La tercera pata de la intención: «a tal hora EN TAL LUGAR».

          Va pegado a la hora porque son la misma idea —el contexto— y separar
          uno del otro haría que se completara solo la mitad. Un lugar
          concreto le da al cerebro un ambiente que reconocer; sin él, la
          señal vuelve a depender de acordarse.
        */}
        <div className="flex flex-col gap-2">
          <span className="glass-eyebrow">El lugar · en…</span>
          <input
            name="place"
            maxLength={60}
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            placeholder={polarity === "good" ? "La cocina" : "El comedor"}
            className="gfield"
          />
          <p className="text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
            {polarity === "good"
              ? "Mientras más concreto, mejor: «el sillón» le dice algo al cerebro que «la casa» no."
              : "Dónde caés casi siempre. Saber el lugar es lo que después te deja cambiarlo."}
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
          <p className="text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
            {polarity === "good"
              ? "Nombrar lo que ganás es lo que hace que mañana la señal vuelva a funcionar."
              : "Nombrar lo que te cuesta es lo que le quita el atractivo."}
          </p>
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

        {/*
          Encadenado, la frecuencia propia no manda: el hábito aparece los
          días que aparece el que lo dispara. Mostrar igual el selector sería
          ofrecer una decisión que el sistema va a ignorar.
        */}
        {stacked && afterName ? (
          <div className="flex flex-col gap-2">
            <span className="glass-eyebrow">Cada cuánto aparece</span>
            <p className="sunk px-3.5 py-3 text-[0.8125rem] leading-relaxed text-[var(--g-ink-2)]">
              Los días que aparezca «{afterName}». Un hábito que va después de
              otro no tiene calendario propio: si ese día no toca, este
              tampoco.
            </p>
          </div>
        ) : (
        <>
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
        </>
        )}
      </div>

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

/* -------------------------------------------------------------------------- */
/* El porqué                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Los cuatro pasos del ciclo, cada uno señalando el campo que le toca.
 *
 * No es un texto de ayuda: es la razón por la que el formulario pide lo que
 * pide. Alguien que nunca escuchó hablar del ciclo ve cuatro campos
 * opcionales y los saltea —o peor, los llena de cualquier cosa—. Viéndolo
 * mapeado entiende que el nombre del hábito es UN paso de cuatro, y que los
 * otros tres son justamente los que hacen que no dependa de acordarse.
 *
 * El anhelo es el único que no tiene campo, y decirlo explícitamente evita la
 * pregunta obvia de "¿y ese dónde se escribe?".
 */
function Science({ polarity }: { polarity: Polarity }) {
  const steps = [
    {
      n: 1,
      name: "Señal",
      text: "Lo que lo dispara.",
      field: "la señal, la hora y el lugar de abajo",
    },
    { n: 2, name: "Anhelo", text: "Las ganas que aparecen.", field: null },
    { n: 3, name: "Respuesta", text: "El hábito en sí.", field: "el nombre de arriba" },
    { n: 4, name: "Recompensa", text: "Lo que te deja.", field: "el resultado" },
  ];

  return (
    <div className="sunk flex flex-col gap-3 p-3.5">
      <p className="text-[0.8125rem] leading-relaxed text-[var(--g-ink-2)]">
        Un hábito no se sostiene por fuerza de voluntad. Es un circuito de
        cuatro pasos que se refuerza solo:
      </p>

      <ol className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.n} className="flex items-start gap-2.5">
            <span className="step">{step.n}</span>
            <span className="min-w-0 flex-1 text-[0.75rem] leading-relaxed">
              <span className="text-[var(--g-ink-2)]">{step.name}</span>
              <span className="text-[var(--g-ink-3)]"> — {step.text}</span>
              {step.field ? (
                <span className="text-[var(--g-good-ink)]"> Es {step.field}.</span>
              ) : (
                <span className="text-[var(--g-ink-3)]"> No se escribe: aparece solo.</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      <p className="text-[0.75rem] leading-relaxed text-[var(--g-ink-3)]">
        {polarity === "good"
          ? "Escribir solo el nombre es escribir el paso 3, el único que cuesta. Lo de acá abajo son los otros tres: mientras más obvia la señal y más claro el resultado, menos esfuerzo hace falta."
          : "Con un hábito malo el mismo circuito juega en tu contra. Contarlo es el primer paso: lo que se mide se vuelve visible, y recién ahí se puede cambiar."}
      </p>
    </div>
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
