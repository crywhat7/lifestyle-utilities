-- =============================================================================
-- 0009 — Intenciones de implementación y avisos de Clean Daily
--
-- El libro es explícito: un hábito no se sostiene por fuerza de voluntad sino
-- por contexto. La fórmula es "cuando pase SEÑAL, a tal HORA, voy a HÁBITO, y
-- voy a obtener RESULTADO". Hasta ahora la tabla solo guardaba el hábito —la
-- respuesta— y le faltaban las otras tres patas del ciclo:
--
--   cue        — la señal que dispara el anhelo.
--   start_time — el momento. Una intención sin hora es un deseo.
--   end_time   — hasta cuándo sigue siendo hoy. Nulo = momento puntual.
--   reward     — el resultado que cierra el ciclo y lo vuelve a asociar.
--
-- Y `remind` decide si además de estar escrito, el teléfono lo dice en voz
-- alta. La señal más confiable es la que no depende de que te acuerdes.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

alter table lifestyle_utilities.clean_habits
  add column if not exists cue text;

alter table lifestyle_utilities.clean_habits
  add column if not exists reward text;

alter table lifestyle_utilities.clean_habits
  add column if not exists start_time time;

alter table lifestyle_utilities.clean_habits
  add column if not exists end_time time;

alter table lifestyle_utilities.clean_habits
  add column if not exists remind boolean not null default true;

alter table lifestyle_utilities.clean_habits
  drop constraint if exists clean_habits_cue_check;
alter table lifestyle_utilities.clean_habits
  add constraint clean_habits_cue_check
  check (cue is null or char_length(trim(cue)) between 1 and 80);

alter table lifestyle_utilities.clean_habits
  drop constraint if exists clean_habits_reward_check;
alter table lifestyle_utilities.clean_habits
  add constraint clean_habits_reward_check
  check (reward is null or char_length(trim(reward)) between 1 and 80);

-- Un rango sin principio no es un rango, y uno que termina antes de empezar
-- no cae nunca. Las ventanas que cruzan la medianoche quedan fuera a
-- propósito: "hoy" termina a las 00:00 y ahí la pizarra ya se borró.
alter table lifestyle_utilities.clean_habits
  drop constraint if exists clean_habits_window_check;
alter table lifestyle_utilities.clean_habits
  add constraint clean_habits_window_check
  check (
    end_time is null
    or (start_time is not null and end_time > start_time)
  );

comment on column lifestyle_utilities.clean_habits.cue is
  'La señal que dispara el hábito: "después de servir el café".';
comment on column lifestyle_utilities.clean_habits.reward is
  'El resultado que cierra el ciclo: "me siento despierto".';
comment on column lifestyle_utilities.clean_habits.start_time is
  'Hora local (POCKET_TIMEZONE) en que toca. Nulo = en cualquier momento del día.';
comment on column lifestyle_utilities.clean_habits.end_time is
  'Fin de la ventana. Nulo = momento puntual, sin última llamada.';

-- -----------------------------------------------------------------------------
-- clean_habit_nudges — qué aviso ya salió
--
-- El cron corre cada 15 minutos, así que sin esto un hábito de las 07:00
-- recibiría el mismo empujón 96 veces al día. La fila ES el candado: la
-- constraint única se reclama con un upsert que ignora duplicados, y solo
-- quien insertó de verdad manda el push. Dos corridas superpuestas —o dos
-- servidores— no pueden avisar dos veces lo mismo.
--
--   start     — se abrió la ventana.
--   last_call — está por cerrarse y todavía no se marcó.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.clean_habit_nudges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  habit_id   uuid not null references lifestyle_utilities.clean_habits (id) on delete cascade,
  sent_on    date not null,
  kind       text not null check (kind in ('start', 'last_call')),
  created_at timestamptz not null default now()
);

alter table lifestyle_utilities.clean_habit_nudges
  drop constraint if exists clean_habit_nudges_slot_key;
alter table lifestyle_utilities.clean_habit_nudges
  add constraint clean_habit_nudges_slot_key unique (habit_id, sent_on, kind);

create index if not exists clean_habit_nudges_user_day_idx
  on lifestyle_utilities.clean_habit_nudges (user_id, sent_on desc);

alter table lifestyle_utilities.clean_habit_nudges enable row level security;

-- Los escribe el cron con service_role, que se salta RLS. La política existe
-- para que la app pueda leer su propio historial sin abrirle nada a nadie.
drop policy if exists "clean_habit_nudges_select_own" on lifestyle_utilities.clean_habit_nudges;
create policy "clean_habit_nudges_select_own"
  on lifestyle_utilities.clean_habit_nudges for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on lifestyle_utilities.clean_habit_nudges to authenticated;
grant all on lifestyle_utilities.clean_habit_nudges to service_role;

notify pgrst, 'reload schema';
