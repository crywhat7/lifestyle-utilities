-- =============================================================================
-- 0018 — Rooms Planning: los cuartos y lo que hay dentro
--
-- Dos tablas y una decisión de fondo.
--
--   rooms_nodes — TODO lo que contiene algo: la habitación, el mueble, la
--                 gaveta, la caja que está dentro de la caja. Una sola tabla
--                 que se apunta a sí misma.
--   rooms_items — las cosas. El cable, el clip, la camisa. No contienen nada
--                 y por eso no son nodos: son la hoja del árbol.
--
-- ¿Por qué una tabla recursiva y no cuatro (habitación, mueble, gaveta,
-- contenedor)? Porque la profundidad real es variable: una bolsa dentro de
-- una caja dentro de una gaveta es normal, y cuatro tablas fijas obligarían a
-- una migración cada vez que aparece un nivel nuevo. El `kind` más el trigger
-- de jerarquía dan la misma validación sin congelar la forma.
--
-- La ruta ("Cuarto > Armario > Gaveta 2 > Bolsa negra") NO se arma con un CTE
-- recursivo al leer: vive materializada en `path` y la mantiene un trigger.
-- El buscador de la Fase 2 tiene que mostrar la ruta de cuarenta resultados
-- de una sola consulta, y cuarenta recursiones para pintar una lista es la
-- diferencia entre un buscador y una pantalla que piensa.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

-- -----------------------------------------------------------------------------
-- rooms_nodes — el árbol
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.rooms_nodes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,

  -- Nulo solo en una habitación: es la raíz. Al borrar el padre se va la rama
  -- entera, que es exactamente lo que pasa cuando tirás un mueble.
  parent_id  uuid references lifestyle_utilities.rooms_nodes (id) on delete cascade,

  kind       text not null
             check (kind in ('room', 'furniture', 'compartment', 'container')),
  name       text not null check (char_length(trim(name)) between 1 and 60),

  -- Qué es exactamente. En un mueble decide qué se dibuja en la vista
  -- isométrica ('bed', 'desk', 'wardrobe'…); en un contenedor es el tipo que
  -- la persona eligió ('box', 'bag', 'case'…). Mismo campo porque es la misma
  -- pregunta —"¿qué clase de cosa es esto?"— hecha a dos niveles.
  variant    text check (variant is null or char_length(variant) <= 24),

  note       text check (note is null or char_length(note) <= 280),

  -- Tres cajas iguales en la misma repisa son una fila con cantidad 3, no tres
  -- filas: nadie quiere nombrarlas "Caja 1", "Caja 2", "Caja 3" para guardar
  -- lo mismo en las tres.
  quantity   smallint not null default 1 check (quantity between 1 and 999),

  -- El color es del dato, no del tema: es lo que hace que la pantalla se vea
  -- viva sin romper el acento único de la marca.
  color      text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),

  /* -- Fase 3: la vista isométrica -----------------------------------------
     Van acá desde ahora, nulas, porque son atributos del mismo mueble y no de
     otra entidad: separarlas en una tabla "posiciones" sería inventar una
     relación 1:1 que nadie consulta por su cuenta. Mientras no exista la vista
     se quedan vacías y no molestan a nadie. */
  grid_x      smallint check (grid_x between 0 and 64),
  grid_y      smallint check (grid_y between 0 and 64),
  grid_w      smallint check (grid_w between 1 and 64),
  grid_h      smallint check (grid_h between 1 and 64),
  rotation    smallint not null default 0 check (rotation in (0, 90, 180, 270)),
  wall_color  text check (wall_color is null or wall_color ~ '^#[0-9a-fA-F]{6}$'),
  floor_color text check (floor_color is null or floor_color ~ '^#[0-9a-fA-F]{6}$'),

  sort_order smallint not null default 0,

  /* -- La ruta, materializada ----------------------------------------------
     `path_ids` termina en el propio id, así que también es la lista de
     ancestros: con eso el trigger detecta un ciclo sin recorrer nada.
     `path` son los nombres, que es lo que lee la persona. Las mantiene
     `rooms_sync_path()` — nadie las escribe a mano. */
  path_ids   uuid[] not null default '{}',
  path       text[] not null default '{}',
  depth      smallint not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_nodes_parent_idx
  on lifestyle_utilities.rooms_nodes (user_id, parent_id, sort_order, created_at);

create index if not exists rooms_nodes_kind_idx
  on lifestyle_utilities.rooms_nodes (user_id, kind);

-- Para "todo lo que cuelga de este mueble" en una sola consulta, sin recursión.
create index if not exists rooms_nodes_path_idx
  on lifestyle_utilities.rooms_nodes using gin (path_ids);

-- -----------------------------------------------------------------------------
-- La ruta y la jerarquía, en un trigger
--
-- Las dos cosas van juntas a propósito: para calcular la ruta hay que leer al
-- padre igual, y ya que está leído, validar que el padre pueda tenerlo como
-- hijo sale gratis. Partirlo en dos triggers serían dos lecturas de la misma
-- fila por cada inserción.
--
-- Esto no es cosmético: es lo que impide meter un armario dentro de una gaveta
-- —o un mueble dentro de sí mismo, que además colgaría la consulta de ruta—.
-- -----------------------------------------------------------------------------

create or replace function lifestyle_utilities.rooms_sync_path()
returns trigger
language plpgsql
security definer
set search_path = lifestyle_utilities, pg_temp
as $$
declare
  parent lifestyle_utilities.rooms_nodes%rowtype;
begin
  if new.parent_id is null then
    if new.kind <> 'room' then
      raise exception 'Solo una habitación puede estar en la raíz (llegó %)', new.kind;
    end if;

    new.path_ids := array[new.id];
    new.path     := array[new.name];
    new.depth    := 1;
    return new;
  end if;

  select * into parent
    from lifestyle_utilities.rooms_nodes
   where id = new.parent_id;

  if not found then
    raise exception 'El contenedor padre no existe';
  end if;

  -- RLS no cubre esto: la política deja escribir filas propias, y sin este
  -- control se podría colgar un mueble propio del cuarto de otra persona.
  if parent.user_id <> new.user_id then
    raise exception 'El contenedor padre es de otra persona';
  end if;

  if new.id = any (parent.path_ids) then
    raise exception 'Un contenedor no puede quedar dentro de sí mismo';
  end if;

  /*
     Qué puede vivir dentro de qué. Los contenedores son los flexibles a
     propósito: una caja puede estar en una gaveta, sobre un mueble, dentro de
     otra caja o en el suelo del cuarto. Los muebles y las gavetas no: un
     armario está en una habitación y una gaveta está en un mueble, y permitir
     lo contrario solo serviría para equivocarse.
  */
  if not (
       (new.kind = 'furniture'   and parent.kind = 'room')
    or (new.kind = 'compartment' and parent.kind = 'furniture')
    or (new.kind = 'container'   and parent.kind in ('room', 'furniture', 'compartment', 'container'))
  ) then
    raise exception 'Un % no puede ir dentro de un %', new.kind, parent.kind;
  end if;

  new.path_ids := parent.path_ids || new.id;
  new.path     := parent.path || new.name;
  new.depth    := cardinality(new.path_ids);

  -- Ocho niveles es una bolsa dentro de una caja dentro de una caja dentro de
  -- una gaveta de un mueble de un cuarto, y sobra. El techo existe para que un
  -- error de arrastre no haga crecer el árbol sin fondo.
  if new.depth > 8 then
    raise exception 'Demasiados contenedores anidados (máximo 8)';
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_nodes_sync_path on lifestyle_utilities.rooms_nodes;
create trigger rooms_nodes_sync_path
  before insert or update of parent_id, name, user_id
  on lifestyle_utilities.rooms_nodes
  for each row execute function lifestyle_utilities.rooms_sync_path();

/*
   Y cuando la rama se mueve o se renombra, los hijos tienen que enterarse.

   El `set parent_id = parent_id` parece un no-op y es justamente el truco:
   dispara el trigger de arriba en cada hijo, que recalcula su ruta leyendo la
   del padre ya actualizada. Cada hijo dispara el suyo, y así baja sola hasta
   la hoja. Termina porque la guarda de `is distinct from` corta en cuanto una
   rama queda igual, y porque el árbol tiene ocho niveles de techo.
*/
create or replace function lifestyle_utilities.rooms_sync_children()
returns trigger
language plpgsql
security definer
set search_path = lifestyle_utilities, pg_temp
as $$
begin
  if new.path is distinct from old.path or new.path_ids is distinct from old.path_ids then
    update lifestyle_utilities.rooms_nodes
       set parent_id = parent_id
     where parent_id = new.id;
  end if;

  return null;
end;
$$;

drop trigger if exists rooms_nodes_sync_children on lifestyle_utilities.rooms_nodes;
create trigger rooms_nodes_sync_children
  after update on lifestyle_utilities.rooms_nodes
  for each row execute function lifestyle_utilities.rooms_sync_children();

drop trigger if exists rooms_nodes_set_updated_at on lifestyle_utilities.rooms_nodes;
create trigger rooms_nodes_set_updated_at
  before update on lifestyle_utilities.rooms_nodes
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.rooms_nodes enable row level security;

drop policy if exists "rooms_nodes_all_own" on lifestyle_utilities.rooms_nodes;
create policy "rooms_nodes_all_own"
  on lifestyle_utilities.rooms_nodes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on lifestyle_utilities.rooms_nodes to authenticated;
grant all on lifestyle_utilities.rooms_nodes to service_role;

-- -----------------------------------------------------------------------------
-- rooms_items — las cosas
--
-- Un ítem siempre cuelga de un nodo, nunca del aire: "lo tengo en algún lado"
-- no es un dato que sirva. Si el nodo se va, el ítem se va con él.
--
-- `condition` es un enum corto a propósito. Lo que no entra en cinco palabras
-- —"funciona bien, es de 2 metros"— va en `note`, que es texto libre porque
-- cada objeto tiene su propia rareza y un formulario nunca las cubre todas.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.rooms_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  node_id    uuid not null references lifestyle_utilities.rooms_nodes (id) on delete cascade,

  name       text not null check (char_length(trim(name)) between 1 and 80),
  category   text not null default 'other',
  condition  text not null default 'good'
             check (condition in ('new', 'good', 'used', 'worn', 'broken')),
  note       text check (note is null or char_length(note) <= 400),
  quantity   smallint not null default 1 check (quantity between 1 and 9999),

  /* -- Fase 2: la foto ------------------------------------------------------
     `storage_path` apunta al bucket privado (el patrón de Canvas Studio: el
     objeto no es público, se firma una URL al leer) y `thumb` es la miniatura
     en data URL que pinta la lista sin pedir nada a la red — el mismo truco
     que ya usa Fuel con los platos. Las dos nulas hasta la Fase 2. */
  storage_path text,
  thumb        text check (thumb is null or char_length(thumb) <= 60000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_items_node_idx
  on lifestyle_utilities.rooms_items (user_id, node_id, created_at);

-- El buscador de la Fase 2 filtra por nombre sobre el inventario entero. Con
-- un inventario personal `ilike` sobre este índice alcanza de sobra; si algún
-- día hace falta tolerar errores de tipeo, acá entra pg_trgm.
create index if not exists rooms_items_name_idx
  on lifestyle_utilities.rooms_items (user_id, lower(name));

drop trigger if exists rooms_items_set_updated_at on lifestyle_utilities.rooms_items;
create trigger rooms_items_set_updated_at
  before update on lifestyle_utilities.rooms_items
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.rooms_items enable row level security;

drop policy if exists "rooms_items_all_own" on lifestyle_utilities.rooms_items;
create policy "rooms_items_all_own"
  on lifestyle_utilities.rooms_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on lifestyle_utilities.rooms_items to authenticated;
grant all on lifestyle_utilities.rooms_items to service_role;

-- Sin esto las dos tablas nuevas quedan fuera del registro de cambios (0017).
select lifestyle_utilities.audit_attach_all();

notify pgrst, 'reload schema';
