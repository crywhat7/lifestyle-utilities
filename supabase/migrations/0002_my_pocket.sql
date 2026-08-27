-- =============================================================================
-- My Pocket — finanzas personales
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
--
-- Todo lo que se registra vive en la moneda con la que se escribió, pero
-- también se guarda convertido a la moneda del work_profile: el balance se
-- suma sobre esa columna y nunca hay que convertir al leer.
-- =============================================================================

create schema if not exists lifestyle_utilities;

-- -----------------------------------------------------------------------------
-- pocket_categories — catálogo mixto
--
-- user_id null  = categoría global: la ven todos, la puede usar la IA.
-- user_id = uid = categoría personal: solo la ve su dueño y la IA NO la toca.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.pocket_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  slug       text not null,
  icon_key   text not null default 'other',
  kind       text not null default 'expense' check (kind in ('income', 'expense', 'both')),
  is_ai      boolean not null default false,
  created_at timestamptz not null default now()
);

-- Un slug global es único para todos; los personales, únicos por persona.
create unique index if not exists pocket_categories_global_slug_idx
  on lifestyle_utilities.pocket_categories (slug, kind)
  where user_id is null;

create unique index if not exists pocket_categories_user_slug_idx
  on lifestyle_utilities.pocket_categories (user_id, slug, kind)
  where user_id is not null;

alter table lifestyle_utilities.pocket_categories enable row level security;

drop policy if exists "pocket_categories_select" on lifestyle_utilities.pocket_categories;
create policy "pocket_categories_select"
  on lifestyle_utilities.pocket_categories for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);

-- Insert propio, o global solo cuando lo crea la IA en nombre de alguien.
drop policy if exists "pocket_categories_insert" on lifestyle_utilities.pocket_categories;
create policy "pocket_categories_insert"
  on lifestyle_utilities.pocket_categories for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    or (user_id is null and is_ai = true)
  );

-- Las globales no se editan ni se borran desde la app: son de todos.
drop policy if exists "pocket_categories_update_own" on lifestyle_utilities.pocket_categories;
create policy "pocket_categories_update_own"
  on lifestyle_utilities.pocket_categories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "pocket_categories_delete_own" on lifestyle_utilities.pocket_categories;
create policy "pocket_categories_delete_own"
  on lifestyle_utilities.pocket_categories for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- pocket_pay_schedules — cuándo y cuánto te pagan
-- Cero, una o varias fechas por mes. Cada una con su propio monto y moneda.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.pocket_pay_schedules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  label         text not null default 'Pago',
  day_of_month  smallint not null check (day_of_month between 1 and 31),
  amount        numeric(14, 2) not null check (amount > 0),
  currency      text not null default 'HNL',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pocket_pay_schedules_user_idx
  on lifestyle_utilities.pocket_pay_schedules (user_id, day_of_month);

drop trigger if exists pocket_pay_schedules_set_updated_at on lifestyle_utilities.pocket_pay_schedules;
create trigger pocket_pay_schedules_set_updated_at
  before update on lifestyle_utilities.pocket_pay_schedules
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.pocket_pay_schedules enable row level security;

drop policy if exists "pocket_pay_schedules_all_own" on lifestyle_utilities.pocket_pay_schedules;
create policy "pocket_pay_schedules_all_own"
  on lifestyle_utilities.pocket_pay_schedules for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- pocket_fixed_expenses — la lista de gastos que se repiten
-- Es una plantilla, no un movimiento: solo se vuelve gasto cuando se registra.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.pocket_fixed_expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 60),
  amount       numeric(14, 2) not null check (amount > 0),
  currency     text not null default 'HNL',
  day_of_month smallint check (day_of_month between 1 and 31),
  category_id  uuid references lifestyle_utilities.pocket_categories (id) on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists pocket_fixed_expenses_user_idx
  on lifestyle_utilities.pocket_fixed_expenses (user_id, active);

drop trigger if exists pocket_fixed_expenses_set_updated_at on lifestyle_utilities.pocket_fixed_expenses;
create trigger pocket_fixed_expenses_set_updated_at
  before update on lifestyle_utilities.pocket_fixed_expenses
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.pocket_fixed_expenses enable row level security;

drop policy if exists "pocket_fixed_expenses_all_own" on lifestyle_utilities.pocket_fixed_expenses;
create policy "pocket_fixed_expenses_all_own"
  on lifestyle_utilities.pocket_fixed_expenses for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- pocket_transactions — ingresos y egresos
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.pocket_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  kind             text not null check (kind in ('income', 'expense')),
  description      text not null check (char_length(trim(description)) between 1 and 120),
  -- Monto tal como se escribió, en la moneda con la que se escribió
  amount           numeric(14, 2) not null check (amount > 0),
  currency         text not null,
  -- El mismo monto en la moneda del work_profile: sobre esto se suma todo
  amount_base      numeric(14, 2) not null,
  base_currency    text not null,
  fx_rate          numeric(16, 6) not null default 1,
  category_id      uuid references lifestyle_utilities.pocket_categories (id) on delete set null,
  pay_schedule_id  uuid references lifestyle_utilities.pocket_pay_schedules (id) on delete set null,
  fixed_expense_id uuid references lifestyle_utilities.pocket_fixed_expenses (id) on delete set null,
  source           text not null default 'manual' check (source in ('manual', 'fixed', 'salary')),
  ai_categorized   boolean not null default false,
  occurred_at      date not null default current_date,
  created_at       timestamptz not null default now()
);

-- Evita que un mismo día de pago se materialice dos veces. Sin WHERE parcial
-- a propósito: PostgREST necesita inferir la constraint en el upsert, y los
-- nulls de los movimientos manuales no colisionan entre sí.
alter table lifestyle_utilities.pocket_transactions
  drop constraint if exists pocket_transactions_pay_slot_key;
alter table lifestyle_utilities.pocket_transactions
  add constraint pocket_transactions_pay_slot_key unique (pay_schedule_id, occurred_at);

create index if not exists pocket_transactions_user_date_idx
  on lifestyle_utilities.pocket_transactions (user_id, occurred_at desc, created_at desc);

create index if not exists pocket_transactions_category_idx
  on lifestyle_utilities.pocket_transactions (user_id, category_id);

alter table lifestyle_utilities.pocket_transactions enable row level security;

drop policy if exists "pocket_transactions_all_own" on lifestyle_utilities.pocket_transactions;
create policy "pocket_transactions_all_own"
  on lifestyle_utilities.pocket_transactions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Privilegios (RLS sigue siendo la última palabra)
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on lifestyle_utilities.pocket_categories to authenticated;
grant select, insert, update, delete on lifestyle_utilities.pocket_pay_schedules to authenticated;
grant select, insert, update, delete on lifestyle_utilities.pocket_fixed_expenses to authenticated;
grant select, insert, update, delete on lifestyle_utilities.pocket_transactions to authenticated;
grant all on all tables in schema lifestyle_utilities to service_role;

-- -----------------------------------------------------------------------------
-- Semilla de categorías globales
-- Es el vocabulario con el que arranca la IA. Puede crecer, nunca encogerse.
-- -----------------------------------------------------------------------------

insert into lifestyle_utilities.pocket_categories (user_id, name, slug, icon_key, kind, is_ai)
values
  (null, 'Comida',          'comida',          'food',      'expense', false),
  (null, 'Supermercado',    'supermercado',    'market',    'expense', false),
  (null, 'Transporte',      'transporte',      'transport', 'expense', false),
  (null, 'Vivienda',        'vivienda',        'home',      'expense', false),
  (null, 'Servicios',       'servicios',       'bills',     'expense', false),
  (null, 'Salud',           'salud',           'health',    'expense', false),
  (null, 'Tecnología',      'tecnologia',      'tech',      'expense', false),
  (null, 'Ropa',            'ropa',            'clothes',   'expense', false),
  (null, 'Entretenimiento', 'entretenimiento', 'fun',       'expense', false),
  (null, 'Suscripciones',   'suscripciones',   'stream',    'expense', false),
  (null, 'Educación',       'educacion',       'study',     'expense', false),
  (null, 'Regalos',         'regalos',         'gift',      'expense', false),
  (null, 'Mascotas',        'mascotas',        'pet',       'expense', false),
  (null, 'Viajes',          'viajes',          'travel',    'expense', false),
  (null, 'Belleza',         'belleza',         'beauty',    'expense', false),
  (null, 'Deudas',          'deudas',          'debt',      'expense', false),
  (null, 'Ahorro',          'ahorro',          'savings',   'expense', false),
  (null, 'Otros',           'otros',           'other',     'expense', false),
  (null, 'Salario',         'salario',         'salary',    'income',  false),
  (null, 'Freelance',       'freelance',       'work',      'income',  false),
  (null, 'Ventas',          'ventas',          'sale',      'income',  false),
  (null, 'Inversiones',     'inversiones',     'invest',    'income',  false),
  (null, 'Préstamos',       'prestamos',       'bank',      'income',  false),
  (null, 'Otros ingresos',  'otros-ingresos',  'other',     'income',  false)
on conflict do nothing;

-- Refrescar el cache de PostgREST
notify pgrst, 'reload schema';
