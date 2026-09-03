-- =============================================================================
-- 0012 — nombre de usuario en el perfil
--
-- El perfil ya guardaba el nombre real; le falta el apodo con el que la
-- persona se identifica. Va en public.users_profiles, junto al resto de su
-- identidad, y no en un lugar nuevo: es el mismo dato de la misma persona.
--
-- Idempotente: se puede correr encima de una base que ya lo tenga.
-- =============================================================================

alter table public.users_profiles
  add column if not exists username text;

-- Formato cerrado a propósito: minúsculas, dígitos, punto y guion bajo. Así el
-- apodo se puede escribir en una URL, decir en voz alta y comparar sin
-- sorpresas de mayúsculas. Nulo sigue siendo válido: nadie está obligado.
alter table public.users_profiles
  drop constraint if exists users_profiles_username_format;

alter table public.users_profiles
  add constraint users_profiles_username_format
  check (username is null or username ~ '^[a-z0-9._]{3,20}$');

-- Único, y en minúsculas por si alguna fila vieja entró de otro modo. Los
-- nulos no chocan entre sí, que es exactamente lo que queremos.
create unique index if not exists users_profiles_username_key
  on public.users_profiles (lower(username));

-- Refrescar el cache de PostgREST
notify pgrst, 'reload schema';
