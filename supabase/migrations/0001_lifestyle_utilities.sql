-- =============================================================================
-- Lifestyle Utilities — esquema base
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
--
-- El catálogo de herramientas vive en el código, no en la base:
-- las herramientas las construye el desarrollador, no los usuarios.
-- Acá solo guardamos datos que pertenecen a cada persona.
-- =============================================================================

create schema if not exists lifestyle_utilities;

grant usage on schema lifestyle_utilities to anon, authenticated, service_role;

-- Limpieza de la iteración anterior (catálogo en DB), si llegó a ejecutarse.
drop table if exists lifestyle_utilities.user_tool_favorites cascade;
drop table if exists lifestyle_utilities.tool_events cascade;
drop table if exists lifestyle_utilities.user_settings cascade;
drop table if exists lifestyle_utilities.tools cascade;

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

create or replace function lifestyle_utilities.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- work_profiles — cuánto vale una hora de tu vida
-- Base de "Should I Buy It" y de cualquier herramienta futura que hable de tiempo.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.work_profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  monthly_income numeric(12, 2) not null check (monthly_income > 0),
  hours_per_day  numeric(4, 2) not null default 8 check (hours_per_day > 0 and hours_per_day <= 24),
  days_per_week  numeric(3, 1) not null default 5 check (days_per_week > 0 and days_per_week <= 7),
  currency       text not null default 'HNL',
  -- 4.345 semanas por mes en promedio
  hourly_rate    numeric(12, 4) generated always as
                   (monthly_income / (hours_per_day * days_per_week * 4.345)) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists work_profiles_set_updated_at on lifestyle_utilities.work_profiles;
create trigger work_profiles_set_updated_at
  before update on lifestyle_utilities.work_profiles
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.work_profiles enable row level security;

drop policy if exists "work_profiles_select_own" on lifestyle_utilities.work_profiles;
create policy "work_profiles_select_own"
  on lifestyle_utilities.work_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "work_profiles_insert_own" on lifestyle_utilities.work_profiles;
create policy "work_profiles_insert_own"
  on lifestyle_utilities.work_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "work_profiles_update_own" on lifestyle_utilities.work_profiles;
create policy "work_profiles_update_own"
  on lifestyle_utilities.work_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "work_profiles_delete_own" on lifestyle_utilities.work_profiles;
create policy "work_profiles_delete_own"
  on lifestyle_utilities.work_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- purchase_decisions — historial de todo lo consultado
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.purchase_decisions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  query              text not null,
  product_name       text not null,
  price              numeric(12, 2) not null check (price >= 0),
  currency           text not null default 'HNL',
  price_is_estimated boolean not null default false,
  category           text,
  purchase_type      text check (purchase_type in ('necesidad', 'inversion', 'antojo', 'impulso')),
  size_bucket        text check (size_bucket in ('small', 'medium', 'large')),
  hours_cost         numeric(10, 2) not null,
  work_days_cost     numeric(10, 2) not null,
  income_share       numeric(6, 4) not null,
  hourly_rate_snap   numeric(12, 4) not null,
  verdict            text not null check (verdict in ('buy', 'think', 'skip')),
  ai_opinion         text,
  ai_model           text,
  pros               text[] not null default '{}',
  cons               text[] not null default '{}',
  created_at         timestamptz not null default now()
);

-- Para tablas creadas antes de que existieran los pros y contras.
alter table lifestyle_utilities.purchase_decisions
  add column if not exists pros text[] not null default '{}';
alter table lifestyle_utilities.purchase_decisions
  add column if not exists cons text[] not null default '{}';

create index if not exists purchase_decisions_user_created_idx
  on lifestyle_utilities.purchase_decisions (user_id, created_at desc);

alter table lifestyle_utilities.purchase_decisions enable row level security;

drop policy if exists "purchase_decisions_select_own" on lifestyle_utilities.purchase_decisions;
create policy "purchase_decisions_select_own"
  on lifestyle_utilities.purchase_decisions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "purchase_decisions_insert_own" on lifestyle_utilities.purchase_decisions;
create policy "purchase_decisions_insert_own"
  on lifestyle_utilities.purchase_decisions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "purchase_decisions_delete_own" on lifestyle_utilities.purchase_decisions;
create policy "purchase_decisions_delete_own"
  on lifestyle_utilities.purchase_decisions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- El historial no se edita: se consulta o se borra.

-- -----------------------------------------------------------------------------
-- Privilegios (RLS sigue siendo la última palabra)
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on lifestyle_utilities.work_profiles to authenticated;
grant select, insert, delete on lifestyle_utilities.purchase_decisions to authenticated;
grant all on all tables in schema lifestyle_utilities to service_role;

-- -----------------------------------------------------------------------------
-- Alta de usuario: perfil en public.users_profiles
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.users_profiles (user_id, name, notification_email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  on conflict (user_id) do update
    set name = coalesce(public.users_profiles.name, excluded.name),
        notification_email = coalesce(public.users_profiles.notification_email, excluded.notification_email);

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS de public.users_profiles (cada quien ve y edita solo su perfil)
-- -----------------------------------------------------------------------------

alter table public.users_profiles enable row level security;

drop policy if exists "users_profiles_select_own" on public.users_profiles;
create policy "users_profiles_select_own"
  on public.users_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users_profiles_insert_own" on public.users_profiles;
create policy "users_profiles_insert_own"
  on public.users_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users_profiles_update_own" on public.users_profiles;
create policy "users_profiles_update_own"
  on public.users_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Refrescar el cache de PostgREST
notify pgrst, 'reload schema';
