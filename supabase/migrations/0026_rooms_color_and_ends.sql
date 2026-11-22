-- =============================================================================
-- 0026 — Rooms Planning: el color, y la otra punta del cable
--
-- Dos columnas nuevas en `rooms_items`, y las dos salen del mismo problema:
-- hay cosas que el nombre no distingue.
--
-- EL COLOR. Un armario de ochenta prendas tiene cuatro camisetas negras y tres
-- blancas, y "Camiseta" no dice cuál. Escribirlo en el nombre funciona hasta
-- que uno escribe "negra", "Negra" y "negro" en la misma gaveta y ya no se
-- puede agrupar por nada. Guardado aparte, el color es un punto en la lista,
-- una palabra que el buscador entiende y, el día que haga falta, un filtro.
--
-- Se guarda la CLAVE de la paleta ("black"), no el hexadecimal. El nombre en
-- pantalla y el tono exacto viven en `lib/rooms.ts` y se pueden corregir sin
-- reescribir una sola fila; un hexadecimal suelto en la base sería un color
-- que nadie puede renombrar ni agrupar. Sin lista cerrada en el check a
-- propósito: la paleta va a crecer, y una restricción que hay que migrar cada
-- vez que se agrega un verde no protege de nada que la pantalla no proteja ya.
--
-- LA OTRA PUNTA. Un cable se identifica por sus dos extremos —HDMI a HDMI no
-- es lo mismo que HDMI a mini— y una sola foto siempre deja uno afuera. La
-- segunda foto no es "otra imagen más": es la mitad que falta del dato, y por
-- eso tiene columna propia y no una tabla de fotos. Dos son dos; cuando hagan
-- falta cinco, esto habrá que repensarlo y estará bien que así sea.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

alter table lifestyle_utilities.rooms_items
  add column if not exists color text
    check (color is null or char_length(color) between 1 and 24);

-- La ruta del objeto en el bucket privado, igual que `storage_path`: la arma
-- el servidor con el user_id de la sesión, nunca el formulario.
alter table lifestyle_utilities.rooms_items
  add column if not exists second_path text;

-- Y su miniatura, que viaja dentro de la fila y pinta la ficha sin pedirle
-- nada a la red. Mismo trato que `thumb`.
alter table lifestyle_utilities.rooms_items
  add column if not exists second_thumb text;

-- Buscar "todo lo negro" es una consulta por color sobre el inventario
-- entero. Parcial porque la mayoría de las cosas no van a tener color puesto
-- —un documento no tiene color— y un índice que incluye miles de nulos es
-- peso sin uso.
create index if not exists rooms_items_color_idx
  on lifestyle_utilities.rooms_items (user_id, color)
  where color is not null;

-- Las columnas nuevas entran al registro de cambios (0017) como el resto.
select lifestyle_utilities.audit_attach_all();

notify pgrst, 'reload schema';
