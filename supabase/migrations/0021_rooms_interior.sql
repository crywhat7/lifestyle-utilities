-- =============================================================================
-- 0021 — Rooms Planning: esto es un cuarto, no un patio
--
-- La 0020 trajo terreno y decoraciones, pero con vocabulario de exterior:
-- pasto, arena, agua, pinos. El módulo se llama Rooms Planning y lo que hace
-- falta es lo de adentro — piso de madera, baldosa, alfombra; paredes; y la
-- forma real del cuarto, que no siempre es un cuadrado.
--
-- Tres cambios:
--
--   1. El alfabeto del piso cambia. Ahora '.' es FUERA DEL CUARTO, y es lo
--      que permite cuartos en L, en T o con un recorte donde está la puerta.
--      El piso dejó de ser un fondo y pasó a ser la planta del lugar.
--   2. Las decoraciones giran, como los muebles.
--   3. Las decoraciones de exterior se van. Un pino adentro de un cuarto no
--      es una decoración, es un error de catálogo.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

-- -----------------------------------------------------------------------------
-- El piso, con vocabulario de interior
--
--   '.' fuera del cuarto · 'w' madera · 't' baldosa · 'c' alfombra · 's' cemento
--
-- La restricción vieja se suelta ANTES de convertir: mientras esté puesta,
-- cualquier escritura con el alfabeto nuevo sería rechazada.
-- -----------------------------------------------------------------------------

alter table lifestyle_utilities.rooms_nodes
  drop constraint if exists rooms_nodes_terrain_shape;

-- Lo que había, traducido: el pasto pasa a madera (el piso más común de un
-- cuarto), la arena a alfombra, el agua a baldosa. Nadie pierde su plano.
update lifestyle_utilities.rooms_nodes
   set terrain = translate(terrain, 'gaw', 'wct')
 where terrain is not null
   and terrain ~ '[gaw]';

alter table lifestyle_utilities.rooms_nodes
  add constraint rooms_nodes_terrain_shape
  check (terrain is null or terrain ~ '^[.wtcs]{64}$');

-- -----------------------------------------------------------------------------
-- Las paredes
--
-- No se guardan: se CALCULAN a partir de la forma del piso. Una pared existe
-- donde una celda con piso toca el vacío por detrás, así que un cuarto en L
-- tiene sus paredes en L sin que nadie las dibuje. Guardarlas sería guardar
-- algo que ya está dicho, y dejar que se contradigan.
--
-- Lo único que se guarda es de qué color están pintadas, y para eso alcanza
-- la columna que antes era `wall_color`, que vuelve a significar exactamente
-- lo que su nombre dice.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Las cosas del cuarto
-- -----------------------------------------------------------------------------

alter table lifestyle_utilities.rooms_props
  add column if not exists rotation smallint not null default 0;

alter table lifestyle_utilities.rooms_props
  drop constraint if exists rooms_props_rotation_quarter;

alter table lifestyle_utilities.rooms_props
  add constraint rooms_props_rotation_quarter
  check (rotation in (0, 90, 180, 270));

-- El catálogo de exterior se retira. Son las piezas que ya no se pueden
-- dibujar, así que dejarlas sería dejar huecos en el plano.
delete from lifestyle_utilities.rooms_props
 where variant in (
   'pine', 'oak', 'bush', 'rock', 'boulder', 'stump',
   'flowers', 'mushrooms', 'crystal', 'lantern', 'fence', 'well'
 );

select lifestyle_utilities.audit_attach_all();

notify pgrst, 'reload schema';
