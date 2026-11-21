"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Camera, Grid, Minus, Pin, PlusSlot, Scan, Sliders, Trash } from "@/components/icons";
import { CENTERED, cropSquare, openPhoto, type Square } from "@/lib/photo";
import {
  CATEGORIES,
  CONDITIONS,
  ROOM_COLORS,
  VARIANTS,
  categoryOf,
  conditionOf,
  guessCategory,
  guessVariant,
  nextColor,
  type Condition,
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
  removeNodePhoto,
  saveCutout,
  updateItem,
  updateNode,
  type FormState,
} from "./actions";
import { CUTOUT_FIRST_RUN, cutOut } from "./cutout";
import { NavLink } from "@/components/nav-link";
import { CategoryGlyph, VariantGlyph } from "./category-glyph";
import { SquareFramer, type Framed } from "./framer";
import { trailPath } from "./paths";

/**
 * Qué se puede combinar en un conjunto.
 *
 * Quitar el fondo tiene sentido en lo que se usa puesto. Un cable recortado
 * no sirve para nada y el botón solo ensuciaría la hoja de todas las demás
 * cosas del inventario.
 */
const WEARABLE = new Set(["clothing", "shoes", "accessories"]);

/** Un lugar al que se puede mover una cosa, con su ruta completa. */
export type Place = { id: string; label: string };

/* El estado inicial vive acá y no junto a las acciones: `actions.ts` lleva
   `"use server"` y esos módulos solo pueden exportar funciones async. */
const IDLE: FormState = { status: "idle" };

/* -------------------------------------------------------------------------- */
/* Piezas compartidas                                                          */
/* -------------------------------------------------------------------------- */

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

  const [name, setName] = useState(node?.name ?? "");
  const [variant, setVariant] = useState<string | null>(node?.variant ?? null);

  /* Igual que en las cosas: la corazonada se calla en cuanto alguien elige a
     mano, para que el campo no se desarme solo mientras se escribe el resto
     del nombre. */
  const [chosen, setChosen] = useState(editing);

  useCloseOnSaved(state, onSaved);

  function rename(next: string) {
    setName(next);
    if (chosen) return;

    const guess = guessVariant(kind, next);
    if (guess) setVariant(guess);
  }


  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="kind" value={kind} />
      {node ? <input type="hidden" name="id" value={node.id} /> : null}
      {parentId ? <input type="hidden" name="parent_id" value={parentId} /> : null}

      {/* Sin título: lo pone la pantalla. Repetirlo acá era decir dos veces
          lo mismo a dos tamaños distintos. */}
      {node && !armed ? (
        <div className="flex justify-end">
          <TrashKey onClick={() => setArmed(true)} />
        </div>
      ) : null}

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
          value={name}
          onChange={(event) => rename(event.target.value)}
          /* El autofoco es para quien acaba de tocar "agregar": el teclado
             sube solo y se escribe. Al editar no, porque ahí lo primero
             suele ser mirar, no escribir. */
          autoFocus={!editing}
          placeholder={PLACEHOLDER[kind]}
          className="r-field r-field-lg"
        />
      </div>

      <TilePicker
        name="variant"
        legend="¿Qué es?"
        value={variant}
        options={VARIANTS[kind].map((option) => ({
          key: option.key,
          label: option.label,
          icon: <VariantGlyph variant={option.key} className="size-[1.375rem]" />,
        }))}
        onPick={(key) => {
          setVariant(key);
          setChosen(true);
        }}
      />

      {/* La foto del contenedor existe para una sola cosa, y conviene
          decirlo: para que el buscador pueda mostrar el camino en imágenes
          cuando haya que explicarle a alguien dónde está algo. */}
      <PhotoField
        saved={node?.photo ?? node?.thumb ?? null}
        thumbEdge={96}
        note="Sirve para que el buscador arme la ruta en fotos: así se le puede mostrar a alguien dónde está algo sin que conozca tu cuarto."
        onDrop={
          node
            ? () => {
                void removeNodePhoto(node.id, node.parent_id);
                onSaved();
              }
            : undefined
        }
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
 * Lo que sube NO es lo que salió de la cámara: es un cuadrado de 1080 px que
 * sale del encuadre que eligió la persona. Dos razones, y ninguna es el peso.
 * Una, 8 MB por un clip con datos móviles es la diferencia entre guardar y
 * abandonar. Dos, y la que importa acá: la cosa fotografiada no está en el
 * centro de la foto —se la tiene en la mano, apoyada, de costado— y un
 * cuadrado recortado por el código le come justo la parte que la identifica.
 * Encuadrar es un paso más, y es el paso que hace que la lista se entienda.
 */
function PhotoField({
  saved,
  thumbEdge,
  note,
  onDrop,
  children,
}: {
  /** Lo que ya está guardado: el enlace firmado o la miniatura. */
  saved?: string | null;
  thumbEdge?: number;
  note?: string;
  /** Qué hacer cuando se quita una foto que YA estaba guardada. */
  onDrop?: () => void;
  /** Lo que va debajo de la foto — por ejemplo, quitar el fondo. */
  children?: (fresh: boolean) => React.ReactNode;
}) {
  const field = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(saved ?? null);
  const [thumb, setThumb] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* La foto abierta y esperando encuadre. Mientras esto exista, la pantalla
     es el encuadrador: no hay nada que confirmar todavía. */
  const [open, setOpen] = useState<(Framed & { source: Blob }) | null>(null);
  const [square, setSquare] = useState<Square>(CENTERED);

  // Lo guardado y lo recién elegido se distinguen: borrar lo primero toca la
  // base, descartar lo segundo es solo vaciar el input.
  const [fresh, setFresh] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const photo = await openPhoto(file);
      setOpen(photo);
      setSquare(CENTERED);
    } catch {
      setError("No se pudo leer esa imagen.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!open) return;

    setBusy(true);

    try {
      const ready = await cropSquare(open.source, square, thumbEdge);

      /*
         El archivo que se manda es el cuadrado recortado, no el que eligió la
         persona. `DataTransfer` es la única forma de poner un File distinto
         dentro de un input de archivo, y hace falta para que viaje en el
         FormData del propio formulario en vez de en una petición aparte.
      */
      const box = new DataTransfer();
      box.items.add(ready.image);
      if (field.current) field.current.files = box.files;

      URL.revokeObjectURL(open.url);
      setOpen(null);
      setPreview(ready.preview);
      setThumb(ready.thumb);
      setFresh(true);
    } catch {
      setError("No se pudo recortar esa imagen.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    if (open) URL.revokeObjectURL(open.url);
    setOpen(null);
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

      {note && !open ? <p className="r-hint mb-2">{note}</p> : null}

      {open ? (
        <div className="flex flex-col gap-3">
          <SquareFramer photo={open} square={square} onChange={setSquare} />

          <div className="flex gap-2">
            <button type="button" onClick={cancel} className="r-key flex-1">
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm()}
              className="r-key r-key-lit flex-1"
            >
              {busy ? "Recortando…" : "Usar este encuadre"}
            </button>
          </div>
        </div>
      ) : preview ? (
        <div className="flex flex-col gap-2">
          <div className="r-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" />
          </div>

          {children?.(fresh)}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => gallery.current?.click()}
              className="r-key flex-1"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => {
                if (fresh || !onDrop) {
                  discard();
                  return;
                }
                startTransition(() => {
                  onDrop();
                  discard();
                });
              }}
              className="r-key flex-1"
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
            className="r-key flex-1 gap-2"
          >
            <Camera className="size-[1.125rem]" />
            {busy ? "Leyendo…" : "Tomar"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => gallery.current?.click()}
            className="r-key flex-1 gap-2"
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

/**
 * Quitar el fondo, a pedido.
 *
 * Nunca al guardar: el recorte tarda segundos y la primera vez descarga un
 * modelo de varios MB. Anotar que tenés una camisa no puede costar eso. El
 * botón está para el día que quieras armar conjuntos con ella.
 *
 * El trabajo ocurre entero en el teléfono —ver `cutout.ts`— y lo único que
 * viaja al servidor es el PNG ya recortado.
 */
function Cutout({ item }: { item: ItemWithPhoto }) {
  const [state, setState] = useState<
    { status: "idle" | "done" } | { status: "busy"; step: string } | { status: "error"; error: string }
  >({ status: item.cutout ? "done" : "idle" });

  const [shot, setShot] = useState<string | null>(item.cutout);

  async function run() {
    if (!item.photo) return;

    setState({ status: "busy", step: "Cargando el recortador…" });

    try {
      const source = await fetch(item.photo).then((response) => response.blob());
      const cut = await cutOut(source, (step) => setState({ status: "busy", step }));

      const form = new FormData();
      form.set("id", item.id);
      form.set("node_id", item.node_id);
      form.set("cutout", cut.file);

      const saved = await saveCutout({ status: "idle" }, form);

      if (saved.status === "error") {
        setState({ status: "error", error: saved.error });
        return;
      }

      setShot(cut.preview);
      setState({ status: "done" });
    } catch {
      setState({
        status: "error",
        error: "No se pudo recortar. Probá con una foto donde la prenda se vea entera.",
      });
    }
  }

  if (state.status === "done" && shot) {
    return (
      <div className="flex flex-col gap-2">
        <div className="r-cut">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt={`${item.name} sin fondo`} />
        </div>
        <button
          type="button"
          onClick={() => void run()}
          className="r-key min-h-12 w-full text-[0.875rem]"
        >
          Recortar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={state.status === "busy"}
        onClick={() => void run()}
        className="r-key min-h-12 w-full gap-2 text-[0.875rem]"
      >
        <Scan className="size-[1.125rem]" />
        {state.status === "busy" ? state.step : "Quitar el fondo"}
      </button>

      {state.status === "idle" ? (
        <p className="px-1 text-[0.75rem] leading-relaxed text-[var(--r-ink-3)]">
          {CUTOUT_FIRST_RUN}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="r-alert" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* El formulario de una cosa                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Elegir sin leer.
 *
 * Una grilla de casillas con su dibujo: las dieciséis categorías de una cosa,
 * los diez tipos de mueble, los ocho de caja. Antes todas eran píldoras de
 * texto envueltas en cuatro renglones, y elegir una era leerlas.
 *
 * La tentación es poner adelante las más usadas; sería más listo y más lento,
 * porque lo que hace rápido al objeto número doscientos es que la mano ya
 * sepa dónde está "cables" sin mirar, y eso se rompe si las casillas se
 * mueven. El orden es el del catálogo y no se toca nunca.
 *
 * El radio real vive debajo de cada casilla: la elección llega al `FormData`
 * como cualquier campo y funcionaría sin JavaScript.
 */
function TilePicker({
  name,
  legend,
  options,
  value,
  onPick,
}: {
  name: string;
  legend: string;
  options: { key: string; label: string; tone?: string; icon: React.ReactNode }[];
  value: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="r-cats">
        {options.map((option) => (
          <label
            key={option.key}
            className="r-cat"
            data-on={value === option.key}
            style={option.tone ? ({ "--tone": option.tone } as React.CSSProperties) : undefined}
          >
            <input
              type="radio"
              name={name}
              value={option.key}
              checked={value === option.key}
              onChange={() => onPick(option.key)}
            />
            {option.icon}
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Cuántos hay, sin abrir el teclado numérico.
 *
 * Casi todo en un inventario es uno, y lo que no lo es suele ser dos o tres.
 * Un campo de número obliga a cambiar de teclado y a apuntarle a un cursor
 * para lo que casi siempre es tocar "más" una vez.
 */
function Stepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div className="r-stepper">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Uno menos"
      >
        <Minus className="size-4" />
      </button>
      <span aria-live="polite">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(9999, value + 1))}
        aria-label="Uno más"
      >
        <PlusSlot className="size-4" />
      </button>
      <input type="hidden" name="quantity" value={value} />
    </div>
  );
}

/**
 * Guardar un objeto.
 *
 * Esta pantalla se rediseñó alrededor de un solo número: trescientos. Un
 * inventario de verdad no son diez cosas, son cientos, y cualquier campo que
 * cueste una decisión consciente se paga cientos de veces. Lo que quedó
 * arriba es lo único que cambia siempre —el nombre y la categoría— y todo lo
 * demás tiene un valor por defecto que acierta casi siempre y vive detrás de
 * "Más detalles": estado en buen estado, cantidad en uno, sin foto y sin
 * nota.
 *
 * Y al agregar, la pantalla NO se cierra. Volver a la lista y tocar otra vez
 * "Agregar cosa" por cada objeto es la mitad del trabajo de llenar un cajón:
 * el formulario se vacía, el cursor vuelve al nombre y arriba queda el conteo
 * de lo que llevás con un "deshacer" para el último, que es lo que permite
 * escribir rápido sin miedo a equivocarse.
 *
 * El "¿dónde está?" se fue de acá. Era un desplegable con todos los lugares
 * de la casa y daba a entender que uno tiene que decirle a la app dónde
 * guardó algo — cuando la app ya lo sabe, porque se agregó estando adentro.
 * Mover sigue existiendo, pero como lo que es: una corrección, dentro de los
 * detalles y solo al editar.
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
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<FormState>(IDLE);
  const [pending, run] = useTransition();

  const form = useRef<HTMLFormElement>(null);
  const nameField = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item ? categoryOf(item.category).key : "other");
  const [condition, setCondition] = useState<string>(item?.condition ?? "good");
  const [quantity, setQuantity] = useState(item?.quantity ?? 1);
  const [open, setOpen] = useState(false);

  /* Si la persona ya eligió categoría a mano para ESTE objeto, la corazonada
     se calla: nada peor que un campo que se desarma solo mientras se escribe
     el resto del nombre. */
  const [chosen, setChosen] = useState(editing);

  /** Lo agregado en esta tanda, para el conteo y para deshacer el último. */
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);

  /**
   * Guardar, y seguir.
   *
   * El resultado se atiende acá y no en un efecto sobre `useActionState`: lo
   * que pasa después de guardar —vaciar el formulario, anotar lo que entró,
   * devolver el cursor— es una consecuencia de ESTE envío, no del hecho de
   * que el estado haya cambiado. Escrito como efecto, React tiene razón en
   * quejarse: son renders en cascada para algo que ya sabíamos al enviar.
   */
  function submit(data: FormData) {
    const sent = String(data.get("name") ?? "").trim();

    run(async () => {
      const result = await (editing ? updateItem : createItem)(IDLE, data);
      setState(result);

      if (result.status !== "saved") return;

      if (editing) {
        onSaved();
        return;
      }

      /* Alta en cadena: no se cierra nada. Se limpia, se recuerda lo que
         entró y el cursor vuelve a donde estaba. La categoría se queda
         puesta a propósito — quien vacía una gaveta de cables agrega quince
         cables seguidos. */
      if (result.id) {
        setAdded((current) => [{ id: result.id as string, name: sent }, ...current].slice(0, 20));
      }

      form.current?.reset();
      setName("");
      setQuantity(1);
      setChosen(false);
      setOpen(false);
      nameField.current?.focus();
    });
  }

  function rename(next: string) {
    setName(next);
    if (chosen) return;

    const guess = guessCategory(next);
    if (guess) setCategory(guess);
  }

  const tone = categoryOf(category).hue;

  return (
    <form ref={form} action={submit} className="flex flex-col gap-4">
      <input type="hidden" name="node_id" value={item?.node_id ?? nodeId} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <input type="hidden" name="condition" value={condition} />

      {/* Al editar, lo primero no es un campo: es la salida a "cómo llegar",
          que es lo que uno quiere de una cosa ya guardada —mandarle a alguien
          dónde está— mucho más seguido que cambiarle el nombre. */}
      {item && !armed ? (
        <div className="flex items-center gap-2">
          <NavLink href={trailPath(item.id)} className="r-key flex-1 gap-2">
            <Pin className="size-[1.125rem]" />
            Cómo llegar · compartir
          </NavLink>
          <TrashKey onClick={() => setArmed(true)} />
        </div>
      ) : null}

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

      {/* El recibo de la tanda. Arriba del campo y no abajo porque es lo que
          se mira entre objeto y objeto para saber que sí entró. */}
      {added.length > 0 ? (
        <div className="r-receipt">
          <span className="min-w-0 flex-1 truncate">
            <strong>{added.length}</strong>{" "}
            {added.length === 1 ? "agregada" : "agregadas"} · {added[0].name}
          </span>
          <button
            type="button"
            onClick={() => {
              const last = added[0];
              setAdded((current) => current.slice(1));
              startTransition(() => void deleteItem(last.id, item?.node_id ?? nodeId));
            }}
          >
            Deshacer
          </button>
        </div>
      ) : null}

      <div>
        <label className="r-field-label" htmlFor="item-name">
          ¿Qué cosa es?
        </label>
        <input
          ref={nameField}
          id="item-name"
          name="name"
          type="text"
          required
          maxLength={80}
          autoComplete="off"
          enterKeyHint={editing ? "done" : "send"}
          autoFocus={!editing}
          value={name}
          onChange={(event) => rename(event.target.value)}
          placeholder="Cable HDMI, memoria RAM, camisa azul…"
          className="r-field r-field-lg"
        />
      </div>

      <TilePicker
        name="category"
        legend="Categoría"
        value={category}
        options={CATEGORIES.map((option) => ({
          key: option.key,
          label: option.label,
          tone: option.hue,
          icon: <CategoryGlyph category={option.key} className="size-[1.375rem]" />,
        }))}
        onPick={(key) => {
          setCategory(key);
          setChosen(true);
        }}
      />

      {/* La foto NO vive en los detalles, aunque sea opcional como ellos.
          Opcional no es lo mismo que secundario: para un cable o una prenda
          la foto ES el dato —"cable negro de 2 metros" describe a cuatro
          cables distintos y la imagen no— y guardada detrás de un acordeón
          simplemente no se le pone a nada. Los detalles son para lo que casi
          nunca se cambia; esto es para lo que casi siempre conviene hacer. */}
      <PhotoField
        saved={item?.photo ?? item?.thumb ?? null}
        onDrop={
          item
            ? () => {
                void removeItemPhoto(item.id, item.node_id);
                onSaved();
              }
            : undefined
        }
      >
        {(fresh) => (item && WEARABLE.has(item.category) && !fresh ? <Cutout item={item} /> : null)}
      </PhotoField>

      {/* Todo lo que tiene un valor por defecto que acierta casi siempre vive
          acá adentro. Mostrarlo de entrada llenaba la pantalla de decisiones
          que casi nadie cambia. */}
      <details className="r-more" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          <Sliders className="size-4" />
          Más detalles
          <span className="r-more-sum">{summarize(condition, quantity)}</span>
        </summary>

        <div className="flex flex-col gap-5 pt-4">
          <fieldset>
            <legend className="r-field-label">Estado</legend>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setCondition(option.key)}
                  className="r-chip"
                  data-on={condition === option.key}
                  style={{ "--tone": tone } as React.CSSProperties}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <span className="r-field-label">¿Cuántos?</span>
            <Stepper value={quantity} onChange={setQuantity} />
          </div>

          {/* Mover es una corrección, no un paso del alta: solo al editar, y
              acá abajo, donde no le quita lugar a lo que se usa siempre. */}
          {item && places.length > 1 ? (
            <div>
              <label className="r-field-label" htmlFor="item-move">
                Mover a otro lugar
              </label>
              <select id="item-move" name="move_to" defaultValue={item.node_id} className="r-field">
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
              Nota
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
        </div>
      </details>

      <Error state={state} />

      <button
        type="submit"
        disabled={pending || name.trim().length === 0}
        className="r-key r-key-lit w-full"
        style={{ "--tone": tone } as React.CSSProperties}
      >
        {pending ? "Guardando…" : editing ? "Guardar" : "Agregar y seguir"}
      </button>

      {/* La salida del alta en cadena. Sin esto, la única forma de volver es
          el botón de atrás, y el pulgar está abajo. */}
      {!editing && added.length > 0 ? (
        <button type="button" onClick={onSaved} className="r-key w-full">
          Listo, volver
        </button>
      ) : null}
    </form>
  );
}

/** Lo que dice el resumen de los detalles sin abrirlos. */
function summarize(condition: string, quantity: number) {
  const parts = [conditionOf(condition as Condition).label.toLowerCase()];
  if (quantity > 1) parts.push(`${quantity} unidades`);
  return parts.join(" · ");
}