-- =============================================================================
-- 0005 — Egresos leídos de una captura
--
-- Registrar a mano una lista de movimientos del banco es el trabajo que la
-- app debería quitarle a la persona: se adjunta la captura, la IA lee las
-- filas y acá solo entra lo que se confirma.
--
-- Dos cosas nuevas viven en la fila del movimiento:
--
--   external_ref — el número de referencia/autorización que imprime el banco.
--   Es la única llave real contra el duplicado: el mismo café dos martes
--   seguidos tiene el mismo monto y la misma descripción, pero nunca la misma
--   referencia. Cuando el banco no la muestra queda nulo, y ahí la defensa
--   pasa a ser el aviso de "mismo monto" que se calcula al leer la captura.
--
--   status — un cargo pendiente todavía puede cambiar de monto o caerse. Se
--   guarda igual porque la plata ya no está disponible, pero se marca para
--   que se pueda distinguir de lo que ya cerró.
--
-- Ejecutar completo en Supabase Studio > SQL Editor (es idempotente).
-- =============================================================================

alter table lifestyle_utilities.pocket_transactions
  add column if not exists external_ref text;

alter table lifestyle_utilities.pocket_transactions
  add column if not exists status text not null default 'posted';

alter table lifestyle_utilities.pocket_transactions
  drop constraint if exists pocket_transactions_status_check;
alter table lifestyle_utilities.pocket_transactions
  add constraint pocket_transactions_status_check
  check (status in ('posted', 'pending'));

-- 'image' es un origen más, al lado de manual, fijo y salario.
alter table lifestyle_utilities.pocket_transactions
  drop constraint if exists pocket_transactions_source_check;
alter table lifestyle_utilities.pocket_transactions
  add constraint pocket_transactions_source_check
  check (source in ('manual', 'fixed', 'salary', 'image'));

-- La misma referencia no entra dos veces. Parcial a propósito: los nulos de
-- todo lo que se registra a mano no colisionan entre sí.
create unique index if not exists pocket_transactions_external_ref_idx
  on lifestyle_utilities.pocket_transactions (user_id, external_ref)
  where external_ref is not null;

comment on column lifestyle_utilities.pocket_transactions.external_ref is
  'Referencia del banco leída de la captura. Única por persona cuando existe.';
comment on column lifestyle_utilities.pocket_transactions.status is
  'posted = cargo firme. pending = el banco todavía lo tiene en proceso.';

notify pgrst, 'reload schema';
