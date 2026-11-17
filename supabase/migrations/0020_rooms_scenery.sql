-- =============================================================================
-- 0020 — Rooms Planning: el cuarto como escenario
--
-- Hasta acá el plano era un piso liso con muebles encima. Esto lo convierte
-- en un lugar: pasto, piedra, arena y agua celda por celda, y cosas que no
-- guardan nada pero hacen que el cuarto se sienta tuyo — un árbol, una roca,
-- una lámpara, un cristal.
--
--   rooms_nodes.terrain — el piso pintado, una letra por celda.
--   rooms_props         — lo que decora y no guarda.
--
-- Por qué el terreno es una CADENA en la habitación y no una tabla de celdas:
-- son 64 casilleros de una letra que se leen siempre juntos y se pintan de a
-- brochazos. Una tabla serían 64 filas por cuarto para responder una sola
-- pregunta ("¿cómo se ve este piso?"), y cada brochazo un UPDATE por celda.
--
-- Por qué las decoraciones NO son `rooms_nodes`: un árbol no contiene nada.
-- Meterlo en el árbol del inventario lo haría aparecer en las listas de
-- "¿qué hay acá dentro?" para siempre, y obligaría a explicar por qué no se
-- le puede agregar una gaveta.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

-- -----------------------------------------------------------------------------
-- El piso pintado
--
-- Una letra por celda, leída de izquierda a derecha y de atrás hacia
-- adelante: 'g' pasto, 's' piedra, 'a' arena, 'w' agua. Nulo es "todavía no
-- lo pintó nadie", y entonces la vista dibuja el piso por defecto.
-- -----------------------------------------------------------------------------

alter table lifestyle_utilities.rooms_nodes
  add column if not exists terrain text;

alter table lifestyle_utilities.rooms_nodes
  drop constraint if exists rooms_nodes_terrain_shape;

alter table lifestyle_utilities.rooms_nodes
  add constraint rooms_nodes_terrain_shape
  check (terrain is null or terrain ~ '^[gsaw]{64}$');

-- -----------------------------------------------------------------------------
-- rooms_props — lo que decora
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.rooms_props (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,

  -- Siempre dentro de una habitación. Si el cuarto se va, el bosque también.
  room_id    uuid not null references lifestyle_utilities.rooms_nodes (id) on delete cascade,

  -- Qué cosa es: 'pine', 'rock', 'bush', 'lamp'… El catálogo vive en
  -- `lib/iso.ts`, que es quien sabe dibujarlas; acá solo se guarda la llave.
  variant    text not null check (char_length(variant) between 1 and 24),

  grid_x     smallint not null check (grid_x between 0 and 63),
  grid_y     smallint not null check (grid_y between 0 and 63),

  -- Dos pinos idénticos uno al lado del otro se notan. La variación es un
  -- número por pieza que el dibujo usa para torcerla un poco.
  seed       smallint not null default 0 check (seed between 0 and 999),

  created_at timestamptz not null default now()
);

create index if not exists rooms_props_room_idx
  on lifestyle_utilities.rooms_props (user_id, room_id);

-- Una celda, una decoración: dos árboles en el mismo casillero es un error de
-- toque, no una intención.
create unique index if not exists rooms_props_cell_idx
  on lifestyle_utilities.rooms_props (room_id, grid_x, grid_y);

alter table lifestyle_utilities.rooms_props enable row level security;

drop policy if exists "rooms_props_all_own" on lifestyle_utilities.rooms_props;
create policy "rooms_props_all_own"
  on lifestyle_utilities.rooms_props for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on lifestyle_utilities.rooms_props to authenticated;
grant all on lifestyle_utilities.rooms_props to service_role;

-- Sin esto la tabla nueva queda fuera del registro de cambios (0017).
select lifestyle_utilities.audit_attach_all();

notify pgrst, 'reload schema';
