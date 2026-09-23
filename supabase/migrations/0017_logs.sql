-- =============================================================================
-- 0017 — El registro: nada se pierde
--
-- Dos tablas con dos trabajos distintos:
--
--   app_logs  — lo que PASA: cada llamada a la IA (buena o mala), cada error
--               del servidor y del navegador, cada corrida de los cron, cada
--               push que no llegó, cada consulta a la base que falló.
--               La escribe la app con service_role.
--
--   audit_log — lo que CAMBIA: cada insert, update y delete de todas las
--               tablas del esquema, con la fila antes y después. Lo escribe
--               Postgres con un trigger, así que ni un bug de la app ni una
--               edición a mano desde Supabase Studio se escapan.
--
-- Ninguna de las dos se ve desde el navegador: RLS encendido y cero
-- políticas. Solo service_role lee y escribe, y la pantalla de registro
-- solo la abre el administrador (POCKET_ADMIN_EMAIL).
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app_logs
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.app_logs (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  level       text not null check (level in ('info', 'warn', 'error')),
  -- ai, db, server, client, cron, push, mail, canvas, fx, tex, office…
  source      text not null,
  event       text not null,
  message     text,
  -- Sin FK a propósito: el registro de alguien sobrevive a que borre su cuenta.
  user_id     uuid,
  path        text,
  duration_ms integer,
  detail      jsonb
);

create index if not exists app_logs_created_idx on lifestyle_utilities.app_logs (created_at desc);
create index if not exists app_logs_level_idx on lifestyle_utilities.app_logs (level, created_at desc);
create index if not exists app_logs_source_idx on lifestyle_utilities.app_logs (source, created_at desc);
create index if not exists app_logs_user_idx on lifestyle_utilities.app_logs (user_id, created_at desc);

alter table lifestyle_utilities.app_logs enable row level security;

-- -----------------------------------------------------------------------------
-- audit_log
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  table_name text not null,
  op         text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  row_id     text,
  user_id    uuid,
  -- Quién lo hizo: la sesión de la app, o null si fue el cron o Studio.
  actor      uuid,
  old_row    jsonb,
  new_row    jsonb
);

create index if not exists audit_log_at_idx on lifestyle_utilities.audit_log (at desc);
create index if not exists audit_log_table_idx on lifestyle_utilities.audit_log (table_name, at desc);
create index if not exists audit_log_user_idx on lifestyle_utilities.audit_log (user_id, at desc);

alter table lifestyle_utilities.audit_log enable row level security;

/*
  Lo que nunca se copia al registro: llaves, credenciales de push y las
  miniaturas en base64 (pesan decenas de KB y no dicen nada). Se reemplazan
  por una marca para que se sepa que el campo existía y cambió.
*/
create or replace function lifestyle_utilities.audit_scrub(row_data jsonb)
returns jsonb
language sql
immutable
as $$
  select case when row_data is null then null else
    (
      select coalesce(jsonb_object_agg(
        key,
        case
          when key in ('access_token', 'p256dh', 'auth', 'endpoint') then to_jsonb('[oculto]'::text)
          when key = 'thumb' and value <> 'null'::jsonb then to_jsonb('[imagen]'::text)
          else value
        end
      ), '{}'::jsonb)
      from jsonb_each(row_data)
    )
  end
$$;

create or replace function lifestyle_utilities.audit_row()
returns trigger
language plpgsql
security definer
set search_path = lifestyle_utilities, public
as $$
declare
  old_data jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_data jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  any_row  jsonb := coalesce(new_data, old_data);
begin
  -- Un update que no cambió nada no es un cambio.
  if tg_op = 'UPDATE' and old_data = new_data then
    return null;
  end if;

  insert into lifestyle_utilities.audit_log (table_name, op, row_id, user_id, actor, old_row, new_row)
  values (
    tg_table_name,
    tg_op,
    coalesce(any_row ->> 'id', any_row ->> 'user_id'),
    nullif(any_row ->> 'user_id', '')::uuid,
    auth.uid(),
    lifestyle_utilities.audit_scrub(old_data),
    lifestyle_utilities.audit_scrub(new_data)
  );

  return null;
end;
$$;

/*
  Engancha el trigger a TODAS las tablas del esquema menos las del propio
  registro. Es idempotente: cada migración futura que cree una tabla nueva
  tiene que terminar con `select lifestyle_utilities.audit_attach_all();`
  para que esa tabla también quede registrada.
*/
create or replace function lifestyle_utilities.audit_attach_all()
returns integer
language plpgsql
as $$
declare
  target record;
  attached integer := 0;
begin
  for target in
    select tablename
    from pg_tables
    where schemaname = 'lifestyle_utilities'
      and tablename not in ('app_logs', 'audit_log')
  loop
    execute format('drop trigger if exists zz_audit on lifestyle_utilities.%I', target.tablename);
    execute format(
      'create trigger zz_audit after insert or update or delete on lifestyle_utilities.%I
         for each row execute function lifestyle_utilities.audit_row()',
      target.tablename
    );
    attached := attached + 1;
  end loop;
  return attached;
end;
$$;

select lifestyle_utilities.audit_attach_all();

-- -----------------------------------------------------------------------------
-- Privilegios: solo service_role. El navegador no ve ninguna de las dos.
-- -----------------------------------------------------------------------------

revoke all on lifestyle_utilities.app_logs, lifestyle_utilities.audit_log from anon, authenticated;
grant all on lifestyle_utilities.app_logs, lifestyle_utilities.audit_log to service_role;
grant usage, select on sequence lifestyle_utilities.app_logs_id_seq, lifestyle_utilities.audit_log_id_seq to service_role;

notify pgrst, 'reload schema';
