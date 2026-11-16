-- =============================================================================
-- 0019 — Rooms Planning: la ropa y los conjuntos
--
-- Lo que agregan las fases 2 y 4 sobre el árbol de la 0018:
--
--   rooms_items.cutout_path — la prenda recortada, sin fondo. Va aparte de
--                             `storage_path` porque la foto original no se
--                             pisa: quitar el fondo se puede reintentar, y si
--                             el recorte sale mal hay que poder volver.
--   rooms_outfits           — los conjuntos armados en el lienzo.
--
-- El buscador de la fase 2 no aparece acá y es a propósito: filtra en el
-- navegador sobre el inventario que la pantalla ya trajo, así responde en la
-- misma tecla que se escribe. Un índice de texto en Postgres sería un viaje
-- de red por pulsación para ganar nada en un inventario personal.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

-- -----------------------------------------------------------------------------
-- La prenda recortada
-- -----------------------------------------------------------------------------

alter table lifestyle_utilities.rooms_items
  add column if not exists cutout_path text;

-- -----------------------------------------------------------------------------
-- rooms_outfits — los conjuntos
--
-- Las prendas del conjunto van en un `jsonb` y no en una tabla puente, y la
-- razón es qué se guarda: no es "esta camisa pertenece a este outfit", es
-- dónde quedó puesta sobre el lienzo —posición, tamaño, giro y qué va delante
-- de qué—. Eso es un lienzo, se reescribe entero cada vez que se arrastra algo
-- y nadie lo consulta por prenda. Una tabla puente con cuatro columnas de
-- geometría sería una relación que solo se lee junta.
--
-- Cada entrada: { "item_id": uuid, "x": %, "y": %, "scale": n, "rot": grados }
-- Las posiciones son porcentajes del lienzo, no píxeles: así el conjunto se ve
-- igual en un teléfono angosto que en una pantalla ancha.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.rooms_outfits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,

  name       text not null check (char_length(trim(name)) between 1 and 60),
  note       text check (note is null or char_length(note) <= 280),

  pieces     jsonb not null default '[]'::jsonb,
  -- Un conjunto de veinte prendas no es un conjunto, es un error de arrastre.
  constraint rooms_outfits_pieces_sane
    check (jsonb_typeof(pieces) = 'array' and jsonb_array_length(pieces) <= 20),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_outfits_user_idx
  on lifestyle_utilities.rooms_outfits (user_id, created_at desc);

drop trigger if exists rooms_outfits_set_updated_at on lifestyle_utilities.rooms_outfits;
create trigger rooms_outfits_set_updated_at
  before update on lifestyle_utilities.rooms_outfits
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.rooms_outfits enable row level security;

drop policy if exists "rooms_outfits_all_own" on lifestyle_utilities.rooms_outfits;
create policy "rooms_outfits_all_own"
  on lifestyle_utilities.rooms_outfits for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on lifestyle_utilities.rooms_outfits to authenticated;
grant all on lifestyle_utilities.rooms_outfits to service_role;

-- Sin esto la tabla nueva queda fuera del registro de cambios (0017).
select lifestyle_utilities.audit_attach_all();

notify pgrst, 'reload schema';
