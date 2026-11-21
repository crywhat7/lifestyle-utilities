-- =============================================================================
-- 0025 — Rooms Planning: las categorías propias
--
-- El catálogo de fábrica son veintidós casillas pensadas para una casa
-- cualquiera, y una casa cualquiera no existe. Alguien tiene repuestos de
-- moto, alguien tiene material de pesca, alguien tiene plantas raras: lo que
-- no está en la lista termina en "Otro", y lo que cae en "Otro" es
-- exactamente lo que después no se encuentra —el color deja de agrupar y el
-- dibujo deja de nombrar.
--
-- Por eso la tabla guarda las tres cosas que hacen legible una categoría y no
-- solo el nombre: la etiqueta, el color con el que se barre la lista con la
-- vista, y cuál de los dibujos que ya existen le toca.
--
-- Lo que NO está acá, a propósito: la categoría de fábrica. Esas viven en
-- `lib/rooms.ts` y no en la base, porque son las mismas para todo el mundo y
-- tenerlas en una tabla obligaría a sembrarlas por persona para no ganar
-- nada. La columna `rooms_items.category` guarda una clave de fábrica
-- ("cables") o el id de una fila de acá, y la pantalla resuelve una u otra.
--
-- Borrar una categoría propia NO toca las cosas que la usaban: el id deja de
-- resolver y esas cosas se muestran como "Otro". Es a propósito —borrar una
-- etiqueta no puede borrar el inventario— y es también la razón de que acá no
-- haya una clave foránea desde `rooms_items`.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

create table if not exists lifestyle_utilities.rooms_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,

  -- Corta a propósito: una etiqueta de categoría tiene que entrar debajo de
  -- un dibujo de 22 px en una grilla de cuatro columnas. Lo que no entra ahí
  -- no es una categoría, es una nota.
  label      text not null check (char_length(trim(label)) between 1 and 24),

  -- El color con el que se pinta la fila y el punto de la lista.
  hue        text not null default '#6b7280'
             check (hue ~ '^#[0-9a-f]{6}$'),

  -- Cuál de los dibujos que ya existen le toca. Es una clave de las que
  -- conoce `category-glyph.tsx`; si llega una desconocida, la pantalla cae en
  -- la etiqueta genérica y no se rompe nada.
  glyph      text not null default 'other' check (char_length(glyph) between 1 and 24),

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dos categorías con el mismo nombre son un error de dedo, no una intención:
-- en la grilla se verían como dos casillas idénticas y elegir una sería una
-- moneda al aire.
create unique index if not exists rooms_categories_label_once
  on lifestyle_utilities.rooms_categories (user_id, lower(trim(label)));

create index if not exists rooms_categories_user_idx
  on lifestyle_utilities.rooms_categories (user_id, sort_order, created_at);

drop trigger if exists rooms_categories_set_updated_at on lifestyle_utilities.rooms_categories;
create trigger rooms_categories_set_updated_at
  before update on lifestyle_utilities.rooms_categories
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.rooms_categories enable row level security;

drop policy if exists "rooms_categories_all_own" on lifestyle_utilities.rooms_categories;
create policy "rooms_categories_all_own"
  on lifestyle_utilities.rooms_categories for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on lifestyle_utilities.rooms_categories to authenticated;
grant all on lifestyle_utilities.rooms_categories to service_role;

-- Sin esto la tabla nueva queda fuera del registro de cambios (0017).
select lifestyle_utilities.audit_attach_all();

notify pgrst, 'reload schema';
