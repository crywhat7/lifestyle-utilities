-- =============================================================================
-- Web Push — suscripciones por dispositivo
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
--
-- Una persona puede tener varias: el teléfono, la laptop, la tablet. Cada
-- navegador entrega su propio endpoint y sus propias llaves de cifrado, y el
-- servidor le habla a cada uno por separado.
-- =============================================================================

create table if not exists lifestyle_utilities.pocket_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- La URL que el navegador da para alcanzarlo. Es el identificador real.
  endpoint   text not null,
  -- Llaves con las que se cifra el mensaje: sin ellas el push no se entrega.
  p256dh     text not null,
  auth       text not null,
  -- Para saber qué dispositivo es cuando la persona quiera desconectar uno.
  label      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reinstalar la app en el mismo navegador devuelve el mismo endpoint: el
-- upsert lo reutiliza en vez de acumular suscripciones muertas.
create unique index if not exists pocket_push_subscriptions_endpoint_idx
  on lifestyle_utilities.pocket_push_subscriptions (endpoint);

create index if not exists pocket_push_subscriptions_user_idx
  on lifestyle_utilities.pocket_push_subscriptions (user_id);

drop trigger if exists pocket_push_subscriptions_set_updated_at
  on lifestyle_utilities.pocket_push_subscriptions;
create trigger pocket_push_subscriptions_set_updated_at
  before update on lifestyle_utilities.pocket_push_subscriptions
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.pocket_push_subscriptions enable row level security;

drop policy if exists "pocket_push_subscriptions_all_own"
  on lifestyle_utilities.pocket_push_subscriptions;
create policy "pocket_push_subscriptions_all_own"
  on lifestyle_utilities.pocket_push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on lifestyle_utilities.pocket_push_subscriptions to authenticated;

-- El cron corre con service_role y necesita ver las suscripciones de todos.
-- El `grant all on all tables` de la 0002 solo alcanzó a las tablas que
-- existían entonces, así que las nuevas hay que nombrarlas.
grant all on lifestyle_utilities.pocket_push_subscriptions to service_role;

notify pgrst, 'reload schema';
