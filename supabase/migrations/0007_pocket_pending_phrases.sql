-- =============================================================================
-- 0007 — Frases de "todavía no es su nombre"
--
-- Una compra retenida en la tarjeta no llega con el nombre del comercio: el
-- banco escribe "COMPRA EN PROCESO" y recién días después la reemplaza por
-- "SUPERMERCADO LA COLONIA". Cuando esa captura se lee, el movimiento entra
-- con el nombre provisional y sin categoría que le quede.
--
-- Esta tabla es la lista de esos nombres provisionales. Un movimiento cuya
-- descripción contenga cualquiera de estas frases se marca en la app como
-- pendiente de clasificar: un punto en la fila y una pantalla propia donde
-- corregirle el nombre y la categoría cuando el banco ya diga cuál era.
--
-- Es un catálogo de mantenimiento manual, a propósito: se edita desde
-- Supabase Studio y la app solo lo lee. Por eso no hay política de escritura
-- — nadie puede tocarla desde el navegador, ni siquiera su dueño.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create table if not exists lifestyle_utilities.pocket_pending_phrases (
  id         uuid primary key default gen_random_uuid(),
  phrase     text not null check (char_length(trim(phrase)) between 2 and 80),
  -- Para acordarse de por qué se agregó: "Ficohsa la usa en las retenidas".
  note       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- La misma frase dos veces solo duplicaría el trabajo de comparar.
create unique index if not exists pocket_pending_phrases_phrase_idx
  on lifestyle_utilities.pocket_pending_phrases (lower(trim(phrase)));

alter table lifestyle_utilities.pocket_pending_phrases enable row level security;

-- Lectura para todos: la lista es vocabulario compartido, no dato personal.
drop policy if exists "pocket_pending_phrases_select" on lifestyle_utilities.pocket_pending_phrases;
create policy "pocket_pending_phrases_select"
  on lifestyle_utilities.pocket_pending_phrases for select to authenticated
  using (true);

grant select on lifestyle_utilities.pocket_pending_phrases to authenticated;
grant all on lifestyle_utilities.pocket_pending_phrases to service_role;

-- Semilla con lo que imprimen los bancos de la región. Agregá las tuyas
-- desde Studio; la app las toma sin necesidad de tocar código.
insert into lifestyle_utilities.pocket_pending_phrases (phrase, note)
values
  ('compra en proceso',      'Retenidas de tarjeta de crédito'),
  ('transaccion en proceso', 'Variante sin tilde'),
  ('transacción en proceso', 'Variante con tilde'),
  ('en proceso',             'Cae por contención, cubre varias variantes'),
  ('pendiente de aplicar',   'Encabezado que a veces se pega a la fila'),
  ('autorizacion pendiente', 'Autorizaciones que aún no cierran'),
  ('cargo pendiente',        'Genérico'),
  ('pos pendiente',          'Compras en punto de venta sin liquidar')
on conflict do nothing;

notify pgrst, 'reload schema';
