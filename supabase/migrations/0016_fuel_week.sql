-- =============================================================================
-- 0016 — Fuel: el menú de la semana
--
-- Una fila por persona con los seis días (lunes a sábado) y, en cada uno, a
-- lo sumo un plato por tiempo de comida. La forma misma del JSON es la regla:
-- `slots.mon.breakfast` es UN plato o no existe, así que dos desayunos el
-- mismo día no se pueden ni escribir.
--
--   slots   — { "mon": { "breakfast": {…plato…}, "lunch": {…} }, "tue": {} … }
--   recipes — las preparaciones detalladas para el PDF, por nombre de plato.
--             Se piden a la IA una sola vez y se reusan en cada exportación.
--
-- El plato se guarda copiado y no como índice del menú: rehacer el menú no
-- puede dejar la semana apuntando a platos que ya no existen.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create table if not exists lifestyle_utilities.fuel_week_plans (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  slots      jsonb not null default '{}'::jsonb,
  recipes    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists fuel_week_plans_set_updated_at on lifestyle_utilities.fuel_week_plans;
create trigger fuel_week_plans_set_updated_at
  before update on lifestyle_utilities.fuel_week_plans
  for each row execute function lifestyle_utilities.set_updated_at();

alter table lifestyle_utilities.fuel_week_plans enable row level security;

drop policy if exists "fuel_week_plans_all_own" on lifestyle_utilities.fuel_week_plans;
create policy "fuel_week_plans_all_own"
  on lifestyle_utilities.fuel_week_plans for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on lifestyle_utilities.fuel_week_plans to authenticated;
grant all on lifestyle_utilities.fuel_week_plans to service_role;

notify pgrst, 'reload schema';
