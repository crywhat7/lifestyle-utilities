-- =============================================================================
-- 0014 — El material de cada tarea
--
-- Una tarea de Canvas casi nunca es solo su enunciado: es el PDF del caso, la
-- plantilla en Word, el enlace al capítulo. Todo eso vive detrás de la sesión
-- de Canvas, así que a las tres semanas —o cuando cambia el semestre— deja de
-- estar. Acá se copia una vez y se queda.
--
--   canvas_files    — un archivo bajado (o un enlace que no era archivo).
--   bucket canvas-files — dónde viven los bytes, privado y por persona.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

create schema if not exists lifestyle_utilities;

-- -----------------------------------------------------------------------------
-- canvas_files
--
-- `kind` separa dos cosas que la persona ve distinto:
--   file — se bajó y está en el bucket. Se abre aunque Canvas se caiga.
--   link — no era un archivo (una página, un Drive que pide sesión). Se
--          guarda la dirección para tenerla a mano y nada más.
--
-- `status` solo importa en los archivos: 'ready' está bajado, 'failed' no se
-- pudo y dice por qué, para poder reintentarlo sin adivinar.
-- -----------------------------------------------------------------------------

create table if not exists lifestyle_utilities.canvas_files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  assignment_id uuid not null references lifestyle_utilities.canvas_assignments (id) on delete cascade,
  kind          text not null default 'file' check (kind in ('file', 'link')),
  status        text not null default 'ready' check (status in ('ready', 'failed')),
  name          text not null check (char_length(trim(name)) between 1 and 200),
  -- De dónde salió. Es también la clave de deduplicación: reimportar una
  -- tarea no vuelve a bajar lo que ya está.
  source_url    text not null,
  mime          text,
  bytes         bigint,
  -- Ruta dentro del bucket: "<user_id>/<assignment_id>/<uuid>-<nombre>".
  -- Nula en los enlaces, que no ocupan nada.
  storage_path  text,
  error         text,
  created_at    timestamptz not null default now(),
  unique (assignment_id, source_url)
);

create index if not exists canvas_files_assignment_idx
  on lifestyle_utilities.canvas_files (assignment_id, created_at);

alter table lifestyle_utilities.canvas_files enable row level security;

drop policy if exists "canvas_files_all_own" on lifestyle_utilities.canvas_files;
create policy "canvas_files_all_own"
  on lifestyle_utilities.canvas_files for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on lifestyle_utilities.canvas_files to authenticated;

-- -----------------------------------------------------------------------------
-- El bucket
--
-- Privado: son documentos de un curso de una persona. Se leen con URLs
-- firmadas que caducan, nunca por dirección pública.
--
-- El primer segmento de la ruta es el uuid de la persona, y las políticas de
-- abajo se apoyan en eso: nadie puede leer, escribir ni borrar fuera de su
-- propia carpeta, aunque adivine el nombre del archivo.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('canvas-files', 'canvas-files', false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "canvas_files_read_own" on storage.objects;
create policy "canvas_files_read_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'canvas-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "canvas_files_write_own" on storage.objects;
create policy "canvas_files_write_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'canvas-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "canvas_files_update_own" on storage.objects;
create policy "canvas_files_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'canvas-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "canvas_files_delete_own" on storage.objects;
create policy "canvas_files_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'canvas-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Refrescar el cache de PostgREST
notify pgrst, 'reload schema';
