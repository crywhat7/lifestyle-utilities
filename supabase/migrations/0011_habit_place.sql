-- =============================================================================
-- 0011 — El lugar
--
-- La fórmula de la intención de implementación son tres cosas, no dos:
-- «Yo haré [CONDUCTA] a [HORA] en [LUGAR]». Hasta ahora faltaba la última.
--
-- No es un detalle de completitud: el lugar es la mitad del contexto que
-- dispara un hábito. «Voy a leer a las 22:00» se pierde; «voy a leer a las
-- 22:00 en el sillón» le da al cerebro un ambiente concreto que reconocer, y
-- la señal deja de depender de acordarse.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

alter table lifestyle_utilities.clean_habits
  add column if not exists place text;

alter table lifestyle_utilities.clean_habits
  drop constraint if exists clean_habits_place_check;
alter table lifestyle_utilities.clean_habits
  add constraint clean_habits_place_check
  check (place is null or char_length(trim(place)) between 1 and 60);

comment on column lifestyle_utilities.clean_habits.place is
  'Dónde pasa: "la cocina", "el gimnasio". La tercera pata de la intención.';

notify pgrst, 'reload schema';
