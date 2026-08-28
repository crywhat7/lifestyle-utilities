-- -----------------------------------------------------------------------------
-- 0004 — desde cuándo cuenta My Pocket
--
-- Los gastos fijos se repiten cada mes desde siempre, pero el seguimiento no:
-- empieza el día que la persona monta su sistema acá. Sin esa frontera, el
-- primer día la app grita "atrasado" por recibos que ya estaban pagados antes
-- de que existiera la cuenta.
--
-- Nulo = usar `created_at` del perfil, que es el arranque real. La columna
-- existe solo para corrergirlo a mano cuando esa fecha no es la que la persona
-- considera su punto de partida.
-- -----------------------------------------------------------------------------

alter table lifestyle_utilities.work_profiles
  add column if not exists pocket_since date;

comment on column lifestyle_utilities.work_profiles.pocket_since is
  'Desde cuándo My Pocket cuenta gastos fijos como pendientes. Nulo = created_at.';
