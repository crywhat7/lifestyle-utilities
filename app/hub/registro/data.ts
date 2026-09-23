import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const PAGE_SIZE = 100;

export const LEVELS = ["error", "warn", "info"] as const;
export const SOURCES = ["ai", "db", "server", "client", "cron", "push", "mail", "canvas", "fx", "tex", "office"] as const;

export type Filters = {
  tab: "eventos" | "cambios";
  level: string | null;
  source: string | null;
  q: string | null;
  since: string | null;
  before: number | null;
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Los filtros de la URL, validados: nada de lo que llega va crudo a la consulta. */
export function readFilters(params: Record<string, string | string[] | undefined>): Filters {
  const level = one(params.nivel);
  const source = one(params.origen);
  const q = one(params.q)?.trim().slice(0, 80) ?? "";
  const since = one(params.desde);
  const before = Number(one(params.antes));

  return {
    tab: one(params.t) === "cambios" ? "cambios" : "eventos",
    level: LEVELS.includes(level as (typeof LEVELS)[number]) ? level! : null,
    source: source && /^[a-z]{2,12}$/.test(source) ? source : null,
    // Las comas y paréntesis rompen la sintaxis de `.or()` de PostgREST.
    q: q.replace(/[,()*%\\]/g, " ").trim() || null,
    since: since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : null,
    before: Number.isInteger(before) && before > 0 ? before : null,
  };
}

export type LogRow = {
  id: number;
  created_at: string;
  level: "info" | "warn" | "error";
  source: string;
  event: string;
  message: string | null;
  user_id: string | null;
  path: string | null;
  duration_ms: number | null;
  detail: unknown;
};

export type AuditRow = {
  id: number;
  at: string;
  table_name: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  row_id: string | null;
  user_id: string | null;
  actor: string | null;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
};

export async function loadEvents(filters: Filters, limit = PAGE_SIZE) {
  const supabase = createAdminClient();
  let query = supabase.from("app_logs").select("*").order("id", { ascending: false }).limit(limit);

  if (filters.level) query = query.eq("level", filters.level);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.q) query = query.or(`message.ilike.*${filters.q}*,event.ilike.*${filters.q}*,path.ilike.*${filters.q}*`);
  if (filters.since) query = query.gte("created_at", `${filters.since}T00:00:00Z`);
  if (filters.before) query = query.lt("id", filters.before);

  const { data, error } = await query;
  return { rows: (data ?? []) as LogRow[], error: error?.message ?? null };
}

export async function loadChanges(filters: Filters, limit = PAGE_SIZE) {
  const supabase = createAdminClient();
  let query = supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(limit);

  if (filters.q) query = query.or(`table_name.ilike.*${filters.q}*,row_id.ilike.*${filters.q}*`);
  if (filters.since) query = query.gte("at", `${filters.since}T00:00:00Z`);
  if (filters.before) query = query.lt("id", filters.before);

  const { data, error } = await query;
  return { rows: (data ?? []) as AuditRow[], error: error?.message ?? null };
}

/** El pulso de las últimas 24 horas, para ver de un vistazo si algo anda mal. */
export async function loadPulse() {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const count = (build: (query: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    build(base()).then(({ count: total }) => total ?? 0);

  function base() {
    return supabase.from("app_logs").select("id", { count: "exact", head: true }).gte("created_at", since);
  }

  const [errors, warnings, aiCalls, aiFailures] = await Promise.all([
    count((query) => query.eq("level", "error")),
    count((query) => query.eq("level", "warn")),
    count((query) => query.eq("source", "ai")),
    count((query) => query.eq("source", "ai").neq("event", "ai.call")),
  ]);

  return { errors, warnings, aiCalls, aiFailures };
}

/** Nombres para los ids que aparecen en la página, en una sola consulta. */
export async function loadNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return {} as Record<string, string>;

  const { data } = await createAdminClient()
    .from("users_profiles")
    .select("user_id,name,username")
    .in("user_id", unique);

  return Object.fromEntries(
    (data ?? []).map((row) => [
      String(row.user_id),
      String(row.username ? `@${row.username}` : (row.name ?? "").split(/\s+/)[0] || "—"),
    ])
  ) as Record<string, string>;
}
