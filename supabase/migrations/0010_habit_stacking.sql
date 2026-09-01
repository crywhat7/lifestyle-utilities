-- =============================================================================
-- 0010 — Acumulación de hábitos (habit stacking)
--
-- «Después de [HÁBITO ACTUAL], voy a [HÁBITO NUEVO]».
--
-- Es la señal más confiable que existe, y por una razón simple: el hábito
-- anterior ya pasa todos los días sin que nadie tenga que acordarse. Una hora
-- puede encontrarte ocupado y un recordatorio se puede ignorar; terminar de
-- estudiar, no.
--
-- Por eso `after_habit_id` no es un campo más: es la señal, y desplaza al
-- texto libre de `cue` cuando está puesto. Un hábito tiene una señal, no dos.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

alter table lifestyle_utilities.clean_habits
  add column if not exists after_habit_id uuid
  references lifestyle_utilities.clean_habits (id) on delete set null;

-- Borrar el padre no se lleva al hijo: lo deja suelto con su propia hora, que
-- es exactamente lo que pasa en la vida real cuando se cae una rutina.

-- Nadie puede ir después de sí mismo. Los círculos más largos —A después de
-- B, B después de A— no los puede ver un CHECK de una sola fila: eso lo
-- valida `saveHabit` recorriendo la cadena antes de guardar.
alter table lifestyle_utilities.clean_habits
  drop constraint if exists clean_habits_after_self_check;
alter table lifestyle_utilities.clean_habits
  add constraint clean_habits_after_self_check
  check (after_habit_id is null or after_habit_id <> id);

create index if not exists clean_habits_after_idx
  on lifestyle_utilities.clean_habits (after_habit_id)
  where after_habit_id is not null;

comment on column lifestyle_utilities.clean_habits.after_habit_id is
  'El hábito que dispara a este. Cuando está puesto, ES la señal y `cue` no se usa.';

notify pgrst, 'reload schema';
