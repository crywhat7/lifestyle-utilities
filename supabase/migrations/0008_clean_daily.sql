-- =============================================================================
-- 0008 — Clean Daily: hábitos que se reinician y tareas que no mueren
--
-- Dos objetos con filosofías opuestas a propósito:
--
--   clean_habits  — no guardan estado "pendiente". Lo que se ve hoy sale de
--                   la regla + los registros DE HOY. A las 00:00 no corre
--                   ningún job: simplemente cambia la fecha con la que se
--                   consulta y la lista aparece limpia. Lo de ayer no se
--                   arrastra porque nunca existió como deuda.
--
--   clean_tasks   — sí guardan estado. Viven hasta que alguien las marca, y
--                   si se pasó `due_at` suben al tope de la pantalla.
--
-- Un hábito puede ser bueno (quiero hacerlo) o malo (quiero contarlo). El
-- mismo registro sirve para ambos: en el bueno significa "lo hice", en el
-- malo "caí" — y `times` dice cuántas veces en el día.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

-- -----------------------------------------------------------------------------
-- clean_habits — la regla, nunca el estado
--
-- `freq` decide qué columna manda, igual que en pocket:
--   daily     — todos los días.
--   weekdays  — los días marcados en `weekdays` (0 = domingo).
--   interval  — cada `interval_days`, contando desde `anchor_date`.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.clean_habits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 60),
  polarity      text not null default 'good' check (polarity in ('good', 'bad')),
  freq          text not null default 'daily' check (freq in ('daily', 'weekdays', 'interval')),
  weekdays      smallint[],
  interval_days smallint check (interval_days between 2 and 60),
  -- Desde qué día se cuenta el intervalo. También es el piso de las métricas:
  -- un hábito creado el 20 no arrastra un mes entero de días fallados.
  anchor_date   date not null default current_date,
  -- Qué se cuenta en un hábito malo: "vasos", "panes", "cigarros".
  unit_label    text check (unit_label is null or char_length(trim(unit_label)) between 1 and 20),
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Una regla a medio llenar no cae nunca. Mismo criterio que pocket_*_rule_check.
alter table lifestyle_utilities.clean_habits
  drop constraint if exists clean_habits_rule_check;
alter table lifestyle_utilities.clean_habits
  add constraint clean_habits_rule_check
  check (
    freq = 'daily'
    or (
      freq = 'weekdays'
      and weekdays is not null
      and array_length(weekdays, 1) between 1 and 7
      and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    )
    or (freq = 'interval' and interval_days is not null)
  );

create index if not exists clean_habits_user_idx
  on lifestyle_utilities.clean_habits (user_id, active, sort_order);

drop trigger if exists clean_habits_set_updated_at on lifestyle_utilities.clean_habits;
create trigger clean_habits_set_updated_at
  before update on lifestyle_utilities.clean_habits
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.clean_habits enable row level security;

drop policy if exists "clean_habits_all_own" on lifestyle_utilities.clean_habits;
create policy "clean_habits_all_own"
  on lifestyle_utilities.clean_habits for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- clean_habit_logs — una fila por hábito y por día, o ninguna
--
-- La ausencia de fila ES el "no lo hice": no se guarda el fallo, no hay nada
-- que arrastrar. `times` solo crece en los hábitos malos, donde importa la
-- cantidad (dos coca-colas no son una).
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.clean_habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  habit_id   uuid not null references lifestyle_utilities.clean_habits (id) on delete cascade,
  done_on    date not null default current_date,
  times      smallint not null default 1 check (times between 1 and 99),
  created_at timestamptz not null default now()
);

-- El upsert del toque diario se apoya en esta constraint: sin WHERE parcial
-- para que PostgREST pueda inferirla.
alter table lifestyle_utilities.clean_habit_logs
  drop constraint if exists clean_habit_logs_day_key;
alter table lifestyle_utilities.clean_habit_logs
  add constraint clean_habit_logs_day_key unique (habit_id, done_on);

create index if not exists clean_habit_logs_user_day_idx
  on lifestyle_utilities.clean_habit_logs (user_id, done_on desc);

alter table lifestyle_utilities.clean_habit_logs enable row level security;

drop policy if exists "clean_habit_logs_all_own" on lifestyle_utilities.clean_habit_logs;
create policy "clean_habit_logs_all_own"
  on lifestyle_utilities.clean_habit_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- clean_tasks — lo contrario del hábito: acá el estado sí persiste
-- `due_at` nulo = "pendiente sin fecha", que es un estado válido y no un olvido.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.clean_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 120),
  note       text check (note is null or char_length(note) <= 300),
  due_at     timestamptz,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La pantalla siempre pide "lo que no está hecho, lo más vencido primero".
create index if not exists clean_tasks_open_idx
  on lifestyle_utilities.clean_tasks (user_id, due_at)
  where done_at is null;

create index if not exists clean_tasks_user_idx
  on lifestyle_utilities.clean_tasks (user_id, created_at desc);

drop trigger if exists clean_tasks_set_updated_at on lifestyle_utilities.clean_tasks;
create trigger clean_tasks_set_updated_at
  before update on lifestyle_utilities.clean_tasks
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.clean_tasks enable row level security;

drop policy if exists "clean_tasks_all_own" on lifestyle_utilities.clean_tasks;
create policy "clean_tasks_all_own"
  on lifestyle_utilities.clean_tasks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Privilegios (RLS sigue siendo la última palabra)
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on lifestyle_utilities.clean_habits to authenticated;
grant select, insert, update, delete on lifestyle_utilities.clean_habit_logs to authenticated;
grant select, insert, update, delete on lifestyle_utilities.clean_tasks to authenticated;
grant all on all tables in schema lifestyle_utilities to service_role;

comment on table lifestyle_utilities.clean_habits is
  'La regla de un hábito. Nunca guarda "pendiente": lo de hoy se deriva de la regla.';
comment on column lifestyle_utilities.clean_habit_logs.times is
  'Cuántas veces cayó en el día. Solo crece en los hábitos malos.';
comment on column lifestyle_utilities.clean_tasks.due_at is
  'Nulo = pendiente sin fecha. Vencida = sube al tope de la pantalla.';

notify pgrst, 'reload schema';
