-- =============================================================================
-- 0015 — Fuel: el contador de calorías
--
-- Cuatro tablas y una idea: lo que se prepara una vez (el plan, la despensa,
-- el menú) vive aparte de lo que se toca varias veces al día (lo que comiste).
--
--   fuel_profiles — el cuerpo, la meta y el plan diario que armó la IA.
--   fuel_menus    — el último menú generado con la despensa elegida.
--   fuel_meals    — cada cosa que comiste, con lo que la IA calculó.
--   fuel_nudges   — el candado de los avisos: uno por tipo, por día.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

-- -----------------------------------------------------------------------------
-- fuel_profiles — una por persona
--
-- Los datos del cuerpo y el plan que salió de ellos viajan en la misma fila:
-- el plan sin los datos no se puede recalcular, y los datos sin plan son un
-- formulario a medio llenar. `pantry` son las claves del catálogo de
-- ingredientes más los que la persona escribió a mano.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.fuel_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  sex          text not null check (sex in ('male', 'female')),
  age          smallint not null check (age between 14 and 100),
  height_cm    numeric(5, 1) not null check (height_cm between 120 and 230),
  weight_kg    numeric(5, 1) not null check (weight_kg between 30 and 300),
  activity     text not null default 'light'
               check (activity in ('sedentary', 'light', 'moderate', 'high')),
  goal         text not null check (goal in ('lose', 'maintain', 'gain')),

  -- El plan. Nulo mientras la persona no lo haya pedido.
  target_kcal  integer check (target_kcal between 1000 and 6000),
  protein_g    integer check (protein_g between 0 and 500),
  carbs_g      integer check (carbs_g between 0 and 900),
  fat_g        integer check (fat_g between 0 and 400),
  plan_summary text check (plan_summary is null or char_length(plan_summary) <= 600),
  plan_tips    text[] not null default '{}',
  plan_model   text,
  planned_at   timestamptz,

  pantry       text[] not null default '{}',
  -- Los avisos del contador se apagan acá sin tocar los de los hábitos.
  remind       boolean not null default true,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists fuel_profiles_set_updated_at on lifestyle_utilities.fuel_profiles;
create trigger fuel_profiles_set_updated_at
  before update on lifestyle_utilities.fuel_profiles
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.fuel_profiles enable row level security;

drop policy if exists "fuel_profiles_all_own" on lifestyle_utilities.fuel_profiles;
create policy "fuel_profiles_all_own"
  on lifestyle_utilities.fuel_profiles for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- fuel_menus — el último menú, entero en una fila
--
-- El menú es una sola respuesta de la IA y se regenera entero: guardarlo
-- partido en veinticinco filas sería inventar una relación que nadie edita.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.fuel_menus (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  items       jsonb not null default '[]'::jsonb,
  target_kcal integer,
  model       text,
  created_at  timestamptz not null default now()
);

alter table lifestyle_utilities.fuel_menus enable row level security;

drop policy if exists "fuel_menus_all_own" on lifestyle_utilities.fuel_menus;
create policy "fuel_menus_all_own"
  on lifestyle_utilities.fuel_menus for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- fuel_meals — lo que comiste
--
-- Las cifras son las de UNA porción tal como la vio la IA; `portion` es el
-- multiplicador que la persona corrige después ("fue la mitad"). Así el
-- cálculo original nunca se pierde y la corrección se puede deshacer.
--
-- La foto no se guarda: se lee y se descarta. Lo que queda es una miniatura
-- de pocos KB para reconocer el plato en la lista.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.fuel_meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  eaten_on    date not null,
  eaten_at    timestamptz not null default now(),
  name        text not null check (char_length(trim(name)) between 1 and 80),
  note        text check (note is null or char_length(note) <= 280),
  kcal        integer not null check (kcal between 0 and 5000),
  protein_g   numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g     numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g       numeric(6, 1) not null default 0 check (fat_g >= 0),
  portion     numeric(3, 2) not null default 1 check (portion between 0.25 and 4),
  confidence  text check (confidence in ('low', 'medium', 'high')),
  source      text not null default 'photo' check (source in ('photo', 'text', 'menu')),
  thumb       text check (thumb is null or char_length(thumb) <= 60000),
  model       text,
  created_at  timestamptz not null default now()
);

create index if not exists fuel_meals_day_idx
  on lifestyle_utilities.fuel_meals (user_id, eaten_on desc, eaten_at desc);

alter table lifestyle_utilities.fuel_meals enable row level security;

drop policy if exists "fuel_meals_all_own" on lifestyle_utilities.fuel_meals;
create policy "fuel_meals_all_own"
  on lifestyle_utilities.fuel_meals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- fuel_nudges — el candado de los avisos
--
-- Mismo truco que `clean_habit_nudges`: el cron reclama la fila con un upsert
-- que ignora duplicados y solo avisa quien la insertó de verdad. Dos corridas
-- superpuestas no pueden mandar dos veces el mismo resumen.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.fuel_nudges (
  user_id  uuid not null references auth.users (id) on delete cascade,
  sent_on  date not null,
  kind     text not null check (kind in ('morning', 'midday', 'evening', 'night', 'over')),
  sent_at  timestamptz not null default now(),
  primary key (user_id, sent_on, kind)
);

alter table lifestyle_utilities.fuel_nudges enable row level security;

drop policy if exists "fuel_nudges_select_own" on lifestyle_utilities.fuel_nudges;
create policy "fuel_nudges_select_own"
  on lifestyle_utilities.fuel_nudges for select to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Privilegios (RLS sigue siendo la última palabra)
-- -----------------------------------------------------------------------------

grant select, insert, update, delete
  on lifestyle_utilities.fuel_profiles,
     lifestyle_utilities.fuel_menus,
     lifestyle_utilities.fuel_meals
  to authenticated;

grant select on lifestyle_utilities.fuel_nudges to authenticated;

-- El cron corre con service_role: lee perfiles y comidas de todos y escribe
-- el candado. Un `grant all on all tables` viejo no alcanza a tablas nuevas.
grant all
  on lifestyle_utilities.fuel_profiles,
     lifestyle_utilities.fuel_menus,
     lifestyle_utilities.fuel_meals,
     lifestyle_utilities.fuel_nudges
  to service_role;

-- Refrescar el cache de PostgREST
notify pgrst, 'reload schema';
