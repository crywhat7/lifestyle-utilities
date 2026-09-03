-- =============================================================================
-- 0013 — Canvas Studio: las entregas del semestre, importadas y empezadas
--
-- Cuatro tablas y una idea: Canvas es la fuente de la verdad, acá solo vive
-- lo que la persona eligió mirar y lo que escribió encima.
--
--   canvas_connections — la llave de acceso y el dominio de la escuela.
--   canvas_courses     — los cursos que trajimos, con cuáles se siguen.
--   canvas_assignments — el espejo local de una tarea pendiente.
--   canvas_drafts      — el borrador en LaTeX que generó la IA.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

-- -----------------------------------------------------------------------------
-- canvas_connections — una por persona
--
-- El token se guarda tal cual porque hay que mandárselo a Canvas en cada
-- petición: no existe forma de usarlo hasheado. Lo que sí se hace es no
-- dejarlo salir nunca del servidor —ninguna pantalla lo devuelve, solo dice si
-- hay uno puesto— y encerrarlo detrás de RLS, que es la misma protección que
-- tienen los movimientos bancarios de la otra herramienta.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.canvas_connections (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- Sin barra final y con esquema: "https://escuela.instructure.com".
  base_url    text not null check (base_url ~ '^https://[a-z0-9.-]+$'),
  access_token text not null check (char_length(access_token) between 20 and 400),
  -- Cuántas semanas hacia atrás se mira. Diez es el default del ciclo.
  weeks       smallint not null default 10 check (weeks between 1 and 52),
  -- Cómo se llama la persona en Canvas: sirve para confirmar que la llave es
  -- de quien dice ser, sin volver a preguntarle a la API en cada pantalla.
  account_name text,
  last_sync_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists canvas_connections_set_updated_at on lifestyle_utilities.canvas_connections;
create trigger canvas_connections_set_updated_at
  before update on lifestyle_utilities.canvas_connections
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.canvas_connections enable row level security;

drop policy if exists "canvas_connections_all_own" on lifestyle_utilities.canvas_connections;
create policy "canvas_connections_all_own"
  on lifestyle_utilities.canvas_connections for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- canvas_courses — el catálogo que trajimos, con la elección encima
--
-- `followed` arranca en falso: nadie quiere ver de golpe las tareas de los
-- ocho cursos en los que Canvas todavía lo tiene matriculado. La persona
-- prende los que le importan y esa elección sobrevive a cada sincronización.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.canvas_courses (
  user_id    uuid not null references auth.users (id) on delete cascade,
  course_id  bigint not null,
  name       text not null,
  code       text,
  term       text,
  followed   boolean not null default false,
  seen_at    timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index if not exists canvas_courses_followed_idx
  on lifestyle_utilities.canvas_courses (user_id)
  where followed;

alter table lifestyle_utilities.canvas_courses enable row level security;

drop policy if exists "canvas_courses_all_own" on lifestyle_utilities.canvas_courses;
create policy "canvas_courses_all_own"
  on lifestyle_utilities.canvas_courses for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- canvas_assignments — el espejo local de una tarea pendiente
--
-- Se guarda una fila solo cuando la persona la importa: la lista que se ve
-- antes de eso vive en memoria, viene de Canvas y no ensucia la base.
--
-- `task_id` es el puente a Clean Daily. Es un uuid suelto y no una llave
-- foránea a propósito: si la persona borra el recordatorio allá, la tarea de
-- acá tiene que sobrevivir con su borrador — perder un texto escrito por
-- marcar un recordatorio sería imperdonable.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.canvas_assignments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  assignment_id bigint not null,
  course_id     bigint not null,
  course_name   text not null,
  title         text not null check (char_length(trim(title)) between 1 and 200),
  -- Las instrucciones de Canvas, ya sin HTML. Es lo que después lee la IA.
  instructions  text,
  html_url      text,
  due_at        timestamptz,
  points        numeric(8, 2),
  task_id       uuid,
  imported_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, assignment_id)
);

create index if not exists canvas_assignments_due_idx
  on lifestyle_utilities.canvas_assignments (user_id, due_at);

drop trigger if exists canvas_assignments_set_updated_at on lifestyle_utilities.canvas_assignments;
create trigger canvas_assignments_set_updated_at
  before update on lifestyle_utilities.canvas_assignments
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.canvas_assignments enable row level security;

drop policy if exists "canvas_assignments_all_own" on lifestyle_utilities.canvas_assignments;
create policy "canvas_assignments_all_own"
  on lifestyle_utilities.canvas_assignments for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- canvas_drafts — lo que escribió la IA, versión por versión
--
-- No se pisa el borrador anterior: generar de nuevo con otro prompt crea otra
-- fila. Cuando alguien está a mitad de una tarea a las once de la noche, el
-- intento anterior es exactamente lo que quiere volver a mirar.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.canvas_drafts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  assignment_id uuid not null references lifestyle_utilities.canvas_assignments (id) on delete cascade,
  -- Lo que la persona pidió además de las instrucciones de Canvas.
  extra_prompt  text,
  -- Con qué llegó: "3 imágenes, 1 PDF". Para saber de dónde salió el texto.
  sources       text,
  latex         text,
  model         text,
  status        text not null default 'ready' check (status in ('ready', 'failed')),
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists canvas_drafts_assignment_idx
  on lifestyle_utilities.canvas_drafts (assignment_id, created_at desc);

alter table lifestyle_utilities.canvas_drafts enable row level security;

drop policy if exists "canvas_drafts_all_own" on lifestyle_utilities.canvas_drafts;
create policy "canvas_drafts_all_own"
  on lifestyle_utilities.canvas_drafts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Privilegios (RLS sigue siendo la última palabra)
-- -----------------------------------------------------------------------------

grant select, insert, update, delete
  on lifestyle_utilities.canvas_connections,
     lifestyle_utilities.canvas_courses,
     lifestyle_utilities.canvas_assignments,
     lifestyle_utilities.canvas_drafts
  to authenticated;

-- Refrescar el cache de PostgREST
notify pgrst, 'reload schema';
