-- =============================================================================
-- 0006 — Recurrencias de verdad y gastos contemplados
--
-- El día del mes no alcanza. A un conductor de Uber le pagan todos los
-- miércoles; el alquiler del local se cobra el primer sábado; la cuota del
-- gimnasio, el último viernes. Todo eso vivía sin poder representarse.
--
-- La regla se guarda en tres columnas y `freq` dice cuál de ellas manda:
--
--   monthly_day     — día fijo del mes (lo de siempre). Usa day_of_month.
--   weekly          — todas las semanas ese día. Usa weekday.
--   monthly_weekday — el N-ésimo de ese día en el mes. Usa weekday y
--                     week_ordinal, donde 1..4 cuentan desde el inicio y
--                     -1/-2 desde el final ("el último viernes").
--
-- Y los gastos dejan de ser fijos para ser CONTEMPLADOS: casi ninguno cae
-- siempre igual. `amount` pasa a ser el piso del rango y `amount_max` el
-- techo. Nulo en amount_max = monto exacto, que es como quedan todos los que
-- ya existían.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fechas de pago
-- -----------------------------------------------------------------------------

alter table lifestyle_utilities.pocket_pay_schedules
  add column if not exists freq text not null default 'monthly_day';

alter table lifestyle_utilities.pocket_pay_schedules
  add column if not exists weekday smallint;

alter table lifestyle_utilities.pocket_pay_schedules
  add column if not exists week_ordinal smallint;

-- Un pago semanal no tiene día del mes que poner.
alter table lifestyle_utilities.pocket_pay_schedules
  alter column day_of_month drop not null;

alter table lifestyle_utilities.pocket_pay_schedules
  drop constraint if exists pocket_pay_schedules_freq_check;
alter table lifestyle_utilities.pocket_pay_schedules
  add constraint pocket_pay_schedules_freq_check
  check (freq in ('monthly_day', 'weekly', 'monthly_weekday'));

alter table lifestyle_utilities.pocket_pay_schedules
  drop constraint if exists pocket_pay_schedules_weekday_check;
alter table lifestyle_utilities.pocket_pay_schedules
  add constraint pocket_pay_schedules_weekday_check
  check (weekday is null or weekday between 0 and 6);

alter table lifestyle_utilities.pocket_pay_schedules
  drop constraint if exists pocket_pay_schedules_ordinal_check;
alter table lifestyle_utilities.pocket_pay_schedules
  add constraint pocket_pay_schedules_ordinal_check
  check (week_ordinal is null or week_ordinal in (1, 2, 3, 4, -1, -2));

-- Cada frecuencia exige lo suyo: una regla a medio llenar no cae nunca.
alter table lifestyle_utilities.pocket_pay_schedules
  drop constraint if exists pocket_pay_schedules_rule_check;
alter table lifestyle_utilities.pocket_pay_schedules
  add constraint pocket_pay_schedules_rule_check
  check (
    (freq = 'monthly_day' and day_of_month is not null)
    or (freq = 'weekly' and weekday is not null)
    or (freq = 'monthly_weekday' and weekday is not null and week_ordinal is not null)
  );

-- -----------------------------------------------------------------------------
-- Gastos contemplados (antes: fijos)
-- -----------------------------------------------------------------------------

alter table lifestyle_utilities.pocket_fixed_expenses
  add column if not exists freq text not null default 'monthly_day';

alter table lifestyle_utilities.pocket_fixed_expenses
  add column if not exists weekday smallint;

alter table lifestyle_utilities.pocket_fixed_expenses
  add column if not exists week_ordinal smallint;

alter table lifestyle_utilities.pocket_fixed_expenses
  add column if not exists amount_max numeric(14, 2);

alter table lifestyle_utilities.pocket_fixed_expenses
  drop constraint if exists pocket_fixed_expenses_freq_check;
alter table lifestyle_utilities.pocket_fixed_expenses
  add constraint pocket_fixed_expenses_freq_check
  check (freq in ('monthly_day', 'weekly', 'monthly_weekday'));

alter table lifestyle_utilities.pocket_fixed_expenses
  drop constraint if exists pocket_fixed_expenses_weekday_check;
alter table lifestyle_utilities.pocket_fixed_expenses
  add constraint pocket_fixed_expenses_weekday_check
  check (weekday is null or weekday between 0 and 6);

alter table lifestyle_utilities.pocket_fixed_expenses
  drop constraint if exists pocket_fixed_expenses_ordinal_check;
alter table lifestyle_utilities.pocket_fixed_expenses
  add constraint pocket_fixed_expenses_ordinal_check
  check (week_ordinal is null or week_ordinal in (1, 2, 3, 4, -1, -2));

-- Acá el día del mes sigue siendo opcional: un gasto contemplado puede no
-- tener fecha ("cuando toque"). Lo que no se perdona es una regla semanal
-- sin día de la semana.
alter table lifestyle_utilities.pocket_fixed_expenses
  drop constraint if exists pocket_fixed_expenses_rule_check;
alter table lifestyle_utilities.pocket_fixed_expenses
  add constraint pocket_fixed_expenses_rule_check
  check (
    freq = 'monthly_day'
    or (freq = 'weekly' and weekday is not null)
    or (freq = 'monthly_weekday' and weekday is not null and week_ordinal is not null)
  );

-- El techo nunca puede estar debajo del piso.
alter table lifestyle_utilities.pocket_fixed_expenses
  drop constraint if exists pocket_fixed_expenses_range_check;
alter table lifestyle_utilities.pocket_fixed_expenses
  add constraint pocket_fixed_expenses_range_check
  check (amount_max is null or amount_max >= amount);

comment on column lifestyle_utilities.pocket_fixed_expenses.amount is
  'Piso del rango contemplado. Sin amount_max, es el monto exacto.';
comment on column lifestyle_utilities.pocket_fixed_expenses.amount_max is
  'Techo del rango. Nulo = el gasto siempre cae por el mismo monto.';
comment on column lifestyle_utilities.pocket_pay_schedules.freq is
  'monthly_day | weekly | monthly_weekday. Decide qué columnas de la regla mandan.';

notify pgrst, 'reload schema';
