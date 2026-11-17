-- =============================================================================
-- 0022 — Rooms Planning: lo que va colgado de la pared
--
-- Un cuarto sin ventana no es un cuarto, es una caja. Hasta acá todo lo que
-- se podía poner se apoyaba en el piso o sobre un mueble; esto agrega la
-- tercera superficie: la pared.
--
-- No es una tabla nueva. Una ventana y una planta son la misma clase de
-- cosa —algo puesto en una celda que no guarda nada— y lo único que cambia
-- es contra qué está apoyada. Una tabla aparte duplicaría las reglas de
-- borrado, de propiedad y de giro para no ganar nada.
--
--   side = null      · está en el piso (o sobre un mueble)
--   side = 'left'    · colgada de la pared que cierra por detrás en x
--   side = 'right'   · colgada de la que cierra por detrás en y
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

alter table lifestyle_utilities.rooms_props
  add column if not exists side text;

alter table lifestyle_utilities.rooms_props
  drop constraint if exists rooms_props_side_valid;

alter table lifestyle_utilities.rooms_props
  add constraint rooms_props_side_valid
  check (side is null or side in ('left', 'right'));

-- -----------------------------------------------------------------------------
-- Una celda, tres lugares
--
-- El índice viejo era (room_id, grid_x, grid_y): una sola cosa por celda. Eso
-- ahora es demasiado estricto — en la misma celda puede haber un escritorio
-- con su monitor y, detrás, una ventana en cada una de las dos paredes.
--
-- El `coalesce` NO es un detalle: en Postgres dos NULL son distintos entre
-- sí para un índice único, así que `(room_id, x, y, side)` dejaría meter
-- veinte cosas en el piso de la misma celda. Con la cadena 'floor' en lugar
-- del nulo, el piso vuelve a ser un solo lugar.
-- -----------------------------------------------------------------------------

drop index if exists lifestyle_utilities.rooms_props_cell_idx;

create unique index if not exists rooms_props_spot_idx
  on lifestyle_utilities.rooms_props (room_id, grid_x, grid_y, coalesce(side, 'floor'));

select lifestyle_utilities.audit_attach_all();

notify pgrst, 'reload schema';
