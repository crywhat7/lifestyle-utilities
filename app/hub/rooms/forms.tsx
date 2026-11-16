"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Camera, Grid, Trash } from "@/components/icons";
import { preparePhoto } from "@/lib/photo";
import {
  CATEGORIES,
  CONDITIONS,
  KIND_LABEL,
  ROOM_COLORS,
  VARIANTS,
  categoryOf,
  conditionOf,
  nextColor,
  type ItemWithPhoto,
  type NodeKind,
  type RoomNode,
} from "@/lib/rooms";
import {
  createItem,
  createNode,
  deleteItem,
  deleteNode,
  removeItemPhoto,
  updateItem,
  updateNode,
  type FormState,
} from "./actions";

/** Un lugar al que se puede mover una cosa, con su ruta completa. */
export type Place = { id: string; label: string };

/* El estado inicial vive acá y no junto a las acciones: `actions.ts` lleva
   `"use server"` y esos módulos solo pueden exportar funciones async. */
const IDLE: FormState = { status: "idle" };

/* -------------------------------------------------------------------------- */
/* Piezas compartidas                                                          */
/* -------------------------------------------------------------------------- */

/**
 * El grupo de chips.
 *
 * Vive acá y no en cada formulario porque resuelve el detalle que el radio
 * nativo no cuenta: cuando uno se prende, los otros se apagan sin disparar
 * `change`. El grupo escucha una vez y reparte el estado.
 */
function ChipGroup({
  name,
  legend,
  options,
  value,
}: {
  name: string;
  legend: string;
  options: { key: string; label: string; tone?: string }[];
  value: string | null;
}) {
  const [picked, setPicked] = useState(value);

  return (
    <fieldset>
      <legend className="r-field-label">{legend}</legend>
      <div
        className="flex flex-wrap gap-2"
        onChange={(event) => {
          const target = event.target as HTMLInputElement;
          if (target.name === name) setPicked(target.value);
        }}
      >
        {options.map((option) => (
          <label
            key={option.key}
            className="r-chip relative"
            data-on={picked === option.key}
            style={option.tone ? ({ "--tone": option.tone } as React.CSSProperties) : undefined}
          >
            <input
              type="radio"
              name={name}
              value={option.key}
              defaultChecked={value === option.key}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Borrar, en dos toques.
 *
 * El primero no borra: pregunta, y dice cuánto se lleva. Un `confirm()` del
 * navegador haría lo mismo, pero no puede decir "y las 34 cosas que hay
 * dentro", que es justamente el dato que hace cambiar de opinión.
 *
 * Son dos piezas separadas y no una porque van en dos lugares distintos de la
 * hoja: la papelera arriba, junto al título, y la pregunta ancha debajo. En un
 * solo componente, el aviso nacía dentro del encabezado y quedaba estrangulado
 * en la columna que le deja el título.
 */
function TrashKey({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="r-ico" aria-label="Borrar">
      <Trash className="size-[1.125rem]" />
    </button>
  );
}

function ConfirmDelete({
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="r-alert" role="alert">
        {label} Esto no se puede deshacer.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="r-key flex-1 text-[0.9375rem]">
          Mejor no
        </button>
        <button
          type="button"
          onClick={() => startTransition(onConfirm)}
          className="r-key r-key-lit flex-1 text-[0.9375rem]"
          style={{ "--tone": "#a33a2a" } as React.CSSProperties}
        >
          Sí, borrar
        </button>
      </div>
    </div>
  );
}

/** Cierra la hoja en cuanto el servidor confirmó, y no antes. */
function useCloseOnSaved(state: FormState, onSaved: () => void) {
  useEffect(() => {
    if (state.status === "saved") onSaved();
  }, [state, onSaved]);
}

function Error({ state }: { state: FormState }) {
  if (state.status !== "error") return null;
  return (
    <p className="r-alert" role="alert">
      {state.error}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* El formulario de un contenedor                                              */
/* -------------------------------------------------------------------------- */

/**
 * Crear o editar una habitación, un mueble, una gaveta o una caja.
 *
 * Un solo formulario para los cuatro: lo que cambia es la lista de tipos y
 * dos campos que aparecen o no. Cuatro formularios casi iguales era la otra
 * opción, y el día que haya que tocar el nombre habría que tocarlos todos.
 */
export function NodeForm({
  kind,
  parentId,
  node,
  usedColors,
  onSaved,
}: {
  kind: NodeKind;
  parentId: string | null;
  node?: RoomNode;
  usedColors?: string[];
  onSaved: () => void;
}) {
  const editing = Boolean(node);
  const [state, action, pending] = useActionState(editing ? updateNode : createNode, IDLE);
  const [armed, setArmed] = useState(false);

  useCloseOnSaved(state, onSaved);

  const label = KIND_LABEL[kind];

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="kind" value={kind} />
      {node ? <input type="hidden" name="id" value={node.id} /> : null}
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}

      <header className="flex items-start justify-between gap-3">
        <h2 className="r-title text-[1.5rem]">{editing ? node?.name : label.add}</h2>
        {node && !armed ? <TrashKey onClick={() => setArmed(true)} /> : null}
      </header>

      {node && armed ? (
        <ConfirmDelete
          label={deleteWarning(node)}
          onCancel={() => setArmed(false)}
          onConfirm={() => {
            void deleteNode(node.id, node.parent_id);
            onSaved();
          }}
        />
      ) : null}

      <div>
        <label className="r-field-label" htmlFor="node-name">
          Nombre
        </label>
        <input
          id="node-name"
          name="name"
          type="text"
          required
          maxLength={60}
          autoComplete="off"
          /* El autofoco es para quien acaba de tocar "agregar": el teclado
             sube solo y se escribe. Al editar no, porque ahí lo primero
             suele ser mirar, no escribir. */
          autoFocus={!editing}
          defaultValue={node?.name ?? ""}
          placeholder={PLACEHOLDER[kind]}
          className="r-field"
        />
      </div>

      <ChipGroup
        name="variant"
        legend="¿Qué es?"
        options={VARIANTS[kind]}
        value={node?.variant ?? null}
      />

      {/* Tres cajas iguales en la misma repisa son una fila con cantidad 3.
          En un mueble o una habitación la pregunta no tiene sentido. */}
      {kind === "container" ? (
        <div>
          <label className="r-field-label" htmlFor="node-quantity">
            ¿Cuántas iguales?
          </label>
          <input
            id="node-quantity"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            defaultValue={node?.quantity ?? 1}
            className="r-field tabular-nums"
          />
        </div>
      ) : null}

      {kind === "room" ? <ColorPicker value={node?.color ?? null} used={usedColors ?? []} /> : null}

      <div>
        <label className="r-field-label" htmlFor="node-note">
          Nota · opcional
        </label>
        <textarea
          id="node-note"
          name="note"
          rows={2}
          maxLength={280}
          defaultValue={node?.note ?? ""}
          placeholder="Lo que haga falta recordar de este lugar"
          className="r-field resize-none"
        />
      </div>

      <Error state={state} />

      <button type="submit" disabled={pending} className="r-key r-key-lit w-full">
        {pending ? "Guardando…" : editing ? "Guardar" : "Crear"}
      </button>
    </form>
  );
}

const PLACEHOLDER: Record<NodeKind, string> = {
  room: "Mi cuarto, la sala…",
  furniture: "Armario grande, escritorio…",
  compartment: "Gaveta 2, repisa de arriba…",
  container: "Bolsa negra, caja de cables…",
};

function deleteWarning(node: RoomNode) {
  return `Se va ${node.name} y todo lo que tenga dentro.`;
}

/**
 * El color de la habitación.
 *
 * Ocho muestras y nada más. Una rueda de color sería una decisión de diseño
 * en medio de "quiero anotar dónde está mi cargador", y además dejaría
 * elegir colores que no se leen sobre el fondo.
 */
function ColorPicker({ value, used }: { value: string | null; used: string[] }) {
  // El mismo cálculo que hace el servidor cuando el formulario no manda
  // color: el siguiente de la paleta que no esté en uso.
  const [picked, setPicked] = useState(value ?? nextColor(used));

  return (
    <fieldset>
      <legend className="r-field-label">Color</legend>
      <div className="flex flex-wrap gap-3">
        {ROOM_COLORS.map((color) => (
          <label
            key={color}
            className="r-swatch"
            data-on={picked === color}
            style={{ background: color }}
            aria-label={`Color ${color}`}
          >
            <input
              type="radio"
              name="color"
              value={color}
              checked={picked === color}
              onChange={() => setPicked(color)}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* La foto                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * La foto de una cosa: opcional, pero ofrecida.
 *
 * Para un cable o una prenda, la foto es el dato: "cable negro de 2 metros"
 * describe a cuatro cables distintos y la imagen no. Por eso el campo está a
 * la vista y no detrás de un "más opciones" — pero nunca es obligatorio,
 * porque obligar a fotografiar un clip es la forma más rápida de que el
 * inventario deje de llenarse.
 *
 * Lo que sube NO es lo que salió de la cámara. `preparePhoto` la achica a
 * 1280 px en el teléfono y de la misma pasada saca la miniatura: 8 MB por un
 * clip con datos móviles es la diferencia entre guardar y abandonar.
 */
function PhotoField({
  item,
  onDropped,
}: {
  item?: ItemWithPhoto;
  onDropped: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(item?.photo ?? item?.thumb ?? null);
  const [thumb, setThumb] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lo guardado y lo recién elegido se distinguen: borrar lo primero toca la
  // base, descartar lo segundo es solo vaciar el input.
  const [fresh, setFresh] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const ready = await preparePhoto(file);

      /*
         El archivo que se manda es el achicado, no el que eligió la persona.
         `DataTransfer` es la única forma de poner un File distinto dentro de
         un input de archivo, y hace falta para que viaje en el FormData del
         propio formulario en vez de en una petición aparte.
      */
      const box = new DataTransfer();
      box.items.add(ready.image);
      if (field.current) field.current.files = box.files;

      setPreview(ready.preview);
      setThumb(ready.thumb);
      setFresh(true);
    } catch {
      setError("No se pudo leer esa imagen.");
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    if (field.current) field.current.value = "";
    setPreview(null);
    setThumb("");
    setFresh(false);
  }

  return (
    <div>
      <span className="r-field-label">Foto · opcional</span>

      <input ref={field} type="file" name="photo" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" />
      <input type="hidden" name="thumb" value={thumb} />

      {/* Dos puertas: la cámara para lo que está en la mano y la galería para
          lo que ya se fotografió. `capture` es lo que abre la cámara directo
          en el teléfono en vez del selector del sistema. */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {preview ? (
        <div className="flex flex-col gap-2">
          <div className="r-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => gallery.current?.click()}
              className="r-key min-h-12 flex-1 text-[0.875rem]"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => {
                if (fresh || !item) {
                  discard();
                  return;
                }
                startTransition(() => {
                  void removeItemPhoto(item.id, item.node_id);
                  discard();
                  onDropped();
                });
              }}
              className="r-key min-h-12 flex-1 text-[0.875rem]"
            >
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => camera.current?.click()}
            className="r-key min-h-12 flex-1 gap-2 text-[0.875rem]"
          >
            <Camera className="size-[1.125rem]" />
            {busy ? "Leyendo…" : "Tomar"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => gallery.current?.click()}
            className="r-key min-h-12 flex-1 gap-2 text-[0.875rem]"
          >
            <Grid className="size-[1.125rem]" />
            Elegir
          </button>
        </div>
      )}

      {error ? (
        <p className="r-alert mt-2" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* El formulario de una cosa                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Guardar un objeto.
 *
 * El orden de los campos es el orden en que la cabeza los piensa con el cajón
 * abierto: qué es, de qué clase, cómo está, cuántos hay. La nota al final
 * porque es la que casi nunca se llena, y si estuviera arriba parecería
 * obligatoria.
 */
export function ItemForm({
  nodeId,
  item,
  places,
  onSaved,
}: {
  nodeId: string;
  item?: ItemWithPhoto;
  places: Place[];
  onSaved: () => void;
}) {
  const editing = Boolean(item);
  const [state, action, pending] = useActionState(editing ? updateItem : createItem, IDLE);
  const [armed, setArmed] = useState(false);

  useCloseOnSaved(state, onSaved);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="node_id" value={item?.node_id ?? nodeId} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      <header className="flex items-start justify-between gap-3">
        <h2 className="r-title text-[1.5rem]">{editing ? item?.name : "Agregar cosa"}</h2>
        {item && !armed ? <TrashKey onClick={() => setArmed(true)} /> : null}
      </header>

      {item && armed ? (
        <ConfirmDelete
          label={`Se va ${item.name} del inventario.`}
          onCancel={() => setArmed(false)}
          onConfirm={() => {
            void deleteItem(item.id, item.node_id);
            onSaved();
          }}
        />
      ) : null}

      <div>
        <label className="r-field-label" htmlFor="item-name">
          ¿Qué cosa es?
        </label>
        <input
          id="item-name"
          name="name"
          type="text"
          required
          maxLength={80}
          autoComplete="off"
          autoFocus={!editing}
          defaultValue={item?.name ?? ""}
          placeholder="Cable HDMI, memoria RAM, camisa azul…"
          className="r-field"
        />
      </div>

      <PhotoField item={item} onDropped={onSaved} />

      <ChipGroup
        name="category"
        legend="Categoría"
        options={CATEGORIES.map((category) => ({
          key: category.key,
          label: category.label,
          tone: category.hue,
        }))}
        value={item ? categoryOf(item.category).key : "other"}
      />

      <ChipGroup
        name="condition"
        legend="Estado"
        options={CONDITIONS.map((condition) => ({
          key: condition.key,
          label: condition.label,
        }))}
        value={item ? conditionOf(item.condition).key : "good"}
      />

      <div>
        <label className="r-field-label" htmlFor="item-quantity">
          ¿Cuántos?
        </label>
        <input
          id="item-quantity"
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={9999}
          defaultValue={item?.quantity ?? 1}
          className="r-field tabular-nums"
        />
      </div>

      {/* Mover vive acá dentro a propósito: cambiar de cajón es una edición
          como cualquier otra, no un flujo aparte. */}
      {item && places.length > 1 ? (
        <div>
          <label className="r-field-label" htmlFor="item-move">
            ¿Dónde está?
          </label>
          <select
            id="item-move"
            name="move_to"
            defaultValue={item.node_id}
            className="r-field"
          >
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="r-field-label" htmlFor="item-note">
          Nota · opcional
        </label>
        <textarea
          id="item-note"
          name="note"
          rows={3}
          maxLength={400}
          defaultValue={item?.note ?? ""}
          placeholder="Funciona bien, es de 2 metros…"
          className="r-field resize-none"
        />
      </div>

      <Error state={state} />

      <button type="submit" disabled={pending} className="r-key r-key-lit w-full">
        {pending ? "Guardando…" : editing ? "Guardar" : "Agregar"}
      </button>
    </form>
  );
}
