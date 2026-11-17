-- =============================================================================
-- 0024 — Rooms Planning: el póster es TU póster
--
-- Un póster dibujado por nosotros es un rectángulo de color: sirve para que
-- la pared no esté vacía y para nada más. Lo que hace que el cuarto del
-- plano se parezca al cuarto de verdad es que ahí cuelgue lo que de verdad
-- está colgado — la lámina, la figura, la foto.
--
-- Las dos columnas son las mismas de siempre y por el mismo motivo:
-- `storage_path` apunta al bucket privado (nada es público) y `thumb` es la
-- miniatura que viaja en la fila para que la pared se pinte sin esperar una
-- descarga.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

alter table lifestyle_utilities.rooms_props
  add column if not exists storage_path text;

alter table lifestyle_utilities.rooms_props
  add column if not exists thumb text;

alter table lifestyle_utilities.rooms_props
  drop constraint if exists rooms_props_thumb_small;

-- Más grande que la de un contenedor: un póster se mira, una gaveta solo se
-- reconoce. 256 px entran en unos 20 KB y es lo que hace que la lámina se
-- lea en la pared sin esperar la imagen firmada.
alter table lifestyle_utilities.rooms_props
  add constraint rooms_props_thumb_small
  check (thumb is null or char_length(thumb) <= 90000);

select lifestyle_utilities.audit_attach_all();

notify pgrst, 'reload schema';
