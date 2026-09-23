import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowBack, Download } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import { isAdmin } from "@/lib/admin";
import { currentUser } from "@/lib/auth";
import { TIMEZONE } from "@/lib/cron";
import {
  LEVELS,
  loadChanges,
  loadEvents,
  loadNames,
  loadPulse,
  PAGE_SIZE,
  readFilters,
  SOURCES,
  type AuditRow,
  type Filters,
  type LogRow,
} from "./data";

export const metadata: Metadata = {
  title: "Registro",
  description: "Todo lo que pasa en la app: IA, errores, cron, push y cambios de datos.",
};

const STAMP = new Intl.DateTimeFormat("es-HN", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const LEVEL_LABEL: Record<string, string> = { error: "Error", warn: "Aviso", info: "Info" };
const LEVEL_COLOR: Record<string, string> = {
  error: "var(--danger)",
  warn: "var(--warn)",
  info: "var(--text-3)",
};

/** La URL con un filtro cambiado, conservando el resto. */
function href(filters: Filters, change: Partial<Record<string, string | null>>) {
  const params = new URLSearchParams();
  const current: Record<string, string | null> = {
    t: filters.tab === "cambios" ? "cambios" : null,
    nivel: filters.level,
    origen: filters.source,
    q: filters.q,
    desde: filters.since,
    antes: null,
  };
  for (const [key, value] of Object.entries({ ...current, ...change })) {
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `/hub/registro?${text}` : "/hub/registro";
}

/**
 * El registro de la app, solo para quien la administra.
 *
 * Dos pestañas porque son dos preguntas distintas: "¿qué pasó?" (eventos:
 * la IA, los errores, los cron) y "¿qué cambió?" (cada fila de la base que
 * se creó, editó o borró). Todo filtrable por URL, así un filtro útil se
 * guarda como marcador.
 */
export default async function RegistroPage({ searchParams }: PageProps<"/hub/registro">) {
  const user = await currentUser();
  if (!user) redirect("/");

  if (!isAdmin(user.email)) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-4 px-5 py-10">
        <p className="eyebrow">Registro</p>
        <h1 className="display emboss text-[2.5rem]">Solo para quien administra.</h1>
        <p className="text-[0.875rem] leading-relaxed text-[var(--text-2)]">
          Esta pantalla muestra datos de todas las personas que usan la app. Se abre
          únicamente con el correo configurado en <code>POCKET_ADMIN_EMAIL</code>.
        </p>
        <NavLink href="/hub" className="key flex h-12 items-center justify-center rounded-full text-[0.875rem]">
          Volver al hub
        </NavLink>
      </main>
    );
  }

  const filters = readFilters(await searchParams);
  const [pulse, events, changes] = await Promise.all([
    loadPulse(),
    filters.tab === "eventos" ? loadEvents(filters) : Promise.resolve(null),
    filters.tab === "cambios" ? loadChanges(filters) : Promise.resolve(null),
  ]);

  const rows = events?.rows ?? changes?.rows ?? [];
  const names = await loadNames(rows.map((row) => row.user_id));
  const failure = events?.error ?? changes?.error ?? null;
  const last = rows.at(-1);

  return (
    <main className="flex flex-1 flex-col gap-5 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="fade flex items-center justify-between" style={{ "--d": "0ms" } as CSSProperties}>
        <NavLink href="/hub/perfil" className="key flex h-10 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] text-[var(--text-2)]">
          <ArrowBack className="size-4" />
          Perfil
        </NavLink>
        <a
          href={`/hub/registro/exportar?${new URLSearchParams(
            Object.entries({ t: filters.tab, nivel: filters.level, origen: filters.source, q: filters.q, desde: filters.since })
              .filter((entry): entry is [string, string] => Boolean(entry[1]))
          ).toString()}`}
          className="key flex h-10 items-center gap-2 rounded-full px-4 text-[0.8125rem] text-[var(--text-2)]"
        >
          <Download className="size-4" />
          Exportar
        </a>
      </header>

      <section className="rise" style={{ "--d": "60ms" } as CSSProperties}>
        <p className="eyebrow">Últimas 24 horas</p>
        <h1 className="display emboss mt-2 text-[clamp(2.5rem,12vw,3.25rem)]">Registro</h1>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { label: "Errores", value: pulse.errors, color: pulse.errors ? "var(--danger)" : undefined, to: { nivel: "error", t: null } },
            { label: "Avisos", value: pulse.warnings, color: pulse.warnings ? "var(--warn)" : undefined, to: { nivel: "warn", t: null } },
            { label: "Llamadas IA", value: pulse.aiCalls, to: { origen: "ai", nivel: null, t: null } },
            { label: "Fallas IA", value: pulse.aiFailures, color: pulse.aiFailures ? "var(--warn)" : undefined, to: { origen: "ai", nivel: "warn", t: null } },
          ].map((stat) => (
            <NavLink key={stat.label} href={href(filters, stat.to)} className="plate flex flex-col gap-1 p-3">
              <span className="text-[1.375rem] leading-none font-semibold tabular-nums" style={{ color: stat.color }}>
                {stat.value}
              </span>
              <span className="text-[0.6875rem] leading-tight text-[var(--text-3)]">{stat.label}</span>
            </NavLink>
          ))}
        </div>
      </section>

      <nav className="tabs rise" style={{ "--d": "100ms" } as CSSProperties} aria-label="Qué mirar">
        <NavLink href={href(filters, { t: null })} className="tab" data-active={filters.tab === "eventos"}>
          Eventos
        </NavLink>
        <NavLink href={href(filters, { t: "cambios", nivel: null, origen: null })} className="tab" data-active={filters.tab === "cambios"}>
          Cambios de datos
        </NavLink>
      </nav>

      {/* Un formulario GET: los filtros viven en la URL y se pueden guardar. */}
      <form action="/hub/registro" className="rise flex flex-col gap-2" style={{ "--d": "140ms" } as CSSProperties}>
        {filters.tab === "cambios" ? <input type="hidden" name="t" value="cambios" /> : null}
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder={filters.tab === "cambios" ? "Tabla o id de fila…" : "Buscar en mensaje, evento o ruta…"}
          className="field"
        />
        <div className="grid grid-cols-3 gap-2">
          {filters.tab === "eventos" ? (
            <>
              <select name="nivel" defaultValue={filters.level ?? ""} className="field">
                <option value="">Todo nivel</option>
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABEL[level]}
                  </option>
                ))}
              </select>
              <select name="origen" defaultValue={filters.source ?? ""} className="field">
                <option value="">Todo origen</option>
                {SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <input type="date" name="desde" defaultValue={filters.since ?? ""} className="field" />
        </div>
        <button type="submit" className="key key-accent flex h-11 items-center justify-center rounded-full text-[0.8125rem] font-medium">
          Filtrar
        </button>
      </form>

      {failure ? (
        <p className="plate p-4 text-[0.875rem] text-[var(--danger)]">
          No se pudo leer el registro: {failure}. ¿Corriste la migración 0017?
        </p>
      ) : rows.length === 0 ? (
        <p className="plate p-5 text-center text-[0.875rem] text-[var(--text-3)]">Nada con esos filtros.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {events
            ? events.rows.map((row) => <EventRow key={row.id} row={row} name={row.user_id ? names[row.user_id] : null} />)
            : changes?.rows.map((row) => <ChangeRow key={row.id} row={row} name={row.user_id ? names[row.user_id] : null} />)}
        </ol>
      )}

      {rows.length === PAGE_SIZE && last ? (
        <NavLink
          href={href(filters, { antes: String(last.id) })}
          className="key flex h-12 items-center justify-center rounded-full text-[0.875rem]"
        >
          Más antiguos
        </NavLink>
      ) : null}
    </main>
  );
}

function EventRow({ row, name }: { row: LogRow; name: string | null }) {
  return (
    <li>
      <details className="plate group overflow-hidden">
        <summary className="flex cursor-pointer list-none flex-col gap-1.5 p-3.5">
          <span className="flex items-center gap-2 text-[0.6875rem] text-[var(--text-3)] tabular-nums">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: LEVEL_COLOR[row.level] }}
              aria-label={LEVEL_LABEL[row.level]}
            />
            <span>{STAMP.format(new Date(row.created_at))}</span>
            <span className="font-medium text-[var(--text-2)]">{row.event}</span>
            {row.duration_ms != null ? <span>· {row.duration_ms} ms</span> : null}
          </span>
          <span className="text-[0.8125rem] leading-snug break-words">{row.message ?? "—"}</span>
          {row.path || name ? (
            <span className="text-[0.6875rem] text-[var(--text-3)]">
              {[name, row.path].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </summary>
        <pre className="max-h-96 overflow-auto border-t border-[var(--edge)] p-3.5 text-[0.6875rem] leading-relaxed whitespace-pre-wrap break-all text-[var(--text-2)]">
          {JSON.stringify({ id: row.id, source: row.source, user_id: row.user_id, detail: row.detail }, null, 2)}
        </pre>
      </details>
    </li>
  );
}

const OP_LABEL: Record<AuditRow["op"], string> = { INSERT: "Creó", UPDATE: "Editó", DELETE: "Borró" };
const OP_COLOR: Record<AuditRow["op"], string> = {
  INSERT: "var(--accent-ink)",
  UPDATE: "var(--warn)",
  DELETE: "var(--danger)",
};

/** Solo los campos que cambiaron, antes → después. */
function diff(row: AuditRow) {
  if (row.op !== "UPDATE" || !row.old_row || !row.new_row) return null;
  const keys = Object.keys(row.new_row).filter(
    (key) => key !== "updated_at" && JSON.stringify(row.old_row?.[key]) !== JSON.stringify(row.new_row?.[key])
  );
  return Object.fromEntries(keys.map((key) => [key, { antes: row.old_row?.[key], después: row.new_row?.[key] }]));
}

function ChangeRow({ row, name }: { row: AuditRow; name: string | null }) {
  const changed = diff(row);
  return (
    <li>
      <details className="plate overflow-hidden">
        <summary className="flex cursor-pointer list-none flex-col gap-1.5 p-3.5">
          <span className="flex items-center gap-2 text-[0.6875rem] text-[var(--text-3)] tabular-nums">
            <span className="font-medium" style={{ color: OP_COLOR[row.op] }}>
              {OP_LABEL[row.op]}
            </span>
            <span>{STAMP.format(new Date(row.at))}</span>
            {row.actor ? null : <span>· sistema</span>}
          </span>
          <span className="text-[0.8125rem]">
            {row.table_name}
            {changed ? (
              <span className="text-[var(--text-3)]"> · {Object.keys(changed).join(", ") || "sin cambios visibles"}</span>
            ) : null}
          </span>
          {name ? <span className="text-[0.6875rem] text-[var(--text-3)]">{name}</span> : null}
        </summary>
        <pre className="max-h-96 overflow-auto border-t border-[var(--edge)] p-3.5 text-[0.6875rem] leading-relaxed whitespace-pre-wrap break-all text-[var(--text-2)]">
          {JSON.stringify(changed ?? row.new_row ?? row.old_row, null, 2)}
        </pre>
      </details>
    </li>
  );
}
