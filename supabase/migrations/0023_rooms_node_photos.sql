-- =============================================================================
-- 0023 — Rooms Planning: la foto de cada contenedor
--
-- Hasta acá la foto era de la COSA: el cable, la camisa. Pero cuando hay que
-- explicarle a alguien dónde está algo, el nombre no alcanza —"la gaveta 2"
-- no significa nada para quien no vive ahí— y lo que sirve es ver el mueble.
--
-- Con esto, un armario, una gaveta o una caja pueden tener su propia foto, y
-- el buscador puede armar la ruta completa en imágenes: la foto del armario,
-- después la de la gaveta, después la de la bolsa, y al final la cosa.
--
-- La foto del contenedor NO se dibuja en el plano. El plano es un dibujo y
-- meterle una foto encima lo rompería; esto es para encontrar, no para
-- decorar.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

alter table lifestyle_utilities.rooms_nodes
  add column if not exists storage_path text;

-- La miniatura viaja dentro de la fila, así que la ruta de búsqueda se dibuja
-- sin pedir nada a la red. Por eso es chica: 96 px de lado, unos pocos KB.
-- Un inventario con cuarenta muebles fotografiados sigue cargando liviano.
alter table lifestyle_utilities.rooms_nodes
  add column if not exists thumb text;

alter table lifestyle_utilities.rooms_nodes
  drop constraint if exists rooms_nodes_thumb_small;

alter table lifestyle_utilities.rooms_nodes
  add constraint rooms_nodes_thumb_small
  check (thumb is null or char_length(thumb) <= 24000);

select lifestyle_utilities.audit_attach_all();

notify pgrst, 'reload schema';
