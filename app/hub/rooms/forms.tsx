"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ArrowBack,
  Camera,
  Grid,
  Minus,
  Pin,
  PlusSlot,
  Scan,
  Sliders,
  Trash,
} from "@/components/icons";
import { CENTERED, cropSquare, openPhoto, type Square } from "@/lib/photo";
import {
  CONDITIONS,
  ROOM_COLORS,
  VARIANTS,
  catalog,
  categoryOf,
  conditionOf,
  guessCategory,
  guessVariant,
  isWearable,
  nextColor,
  wearCatalog,
  type Condition,
  type ItemWithPhoto,
  type NodeKind,
  type OwnCategory,
  type RoomNode,
} from "@/lib/rooms";
import {
  attachItemPhoto,
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
import { CategoryMaker } from "./category-maker";
import { DictateKey } from "./dictate";
import { SquareFramer, type Framed } from "./framer";
import { CATEGORIES_PATH, trailPath } from "./paths";

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

/** Las dos puertas de la foto, para abrirlas desde otro paso. */
export type PhotoDoors = { camera: () => void; gallery: () => void };

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
  doorsRef,
  children,
}: {
  /** Lo que ya está guardado: el enlace firmado o la miniatura. */
  saved?: string | null;
  thumbEdge?: number;
  note?: string;
  /** Qué hacer cuando se quita una foto que YA estaba guardada. */
  onDrop?: () => void;
  /**
   * Las dos puertas, para que las abra alguien de afuera.
   *
   * Existe por una sola razón, y es la que hace que el paso de la foto sea un
   * toque en vez de dos: abrir la cámara tiene que ocurrir DENTRO del mismo
   * toque que llevó a este paso. El navegador no deja que un `input file` se
   * abra solo —si no hay un gesto de la persona detrás, no pasa nada—, así
   * que el botón del paso anterior abre la cámara en su propio `onClick` y
   * recién después cambia de paso. Si el navegador igual lo bloquea, no se
   * rompe nada: se cae en el paso de siempre, con sus dos botones.
   */
  doorsRef?: React.RefObject<PhotoDoors | null>;
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

  useEffect(() => {
    if (!doorsRef) return;
    doorsRef.current = {
      camera: () => camera.current?.click(),
      gallery: () => gallery.current?.click(),
    };
    return () => {
      doorsRef.current = null;
    };
  }, [doorsRef]);

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
 * Una grilla de casillas con su dibujo: las veintidós categorías de una cosa,
 * los diez tipos de mueble, los ocho de caja. Antes todas eran píldoras de
 * texto envueltas en cuatro renglones, y elegir una era leerlas.
 *
 * El orden es el del catálogo y no se toca NUNCA: lo que hace rápido al
 * objeto número doscientos es que la mano ya sepa dónde está "cables" sin
 * mirar, y eso se rompe si las casillas se mueven. Las más usadas sí se
 * adelantan, pero con una copia arriba y sin sacarlas de su lugar — ver
 * `CategoryStep`.
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
  extra,
  big,
}: {
  name: string;
  legend: string;
  options: { key: string; label: string; tone?: string; icon: React.ReactNode }[];
  value: string | null;
  onPick: (key: string) => void;
  /** Una casilla más al final de la grilla — hoy, "hacerse una categoría". */
  extra?: React.ReactNode;
  /** Cuando la grilla es TODO lo que hay en la pantalla: ver `CategoryStep`. */
  big?: boolean;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="r-cats" data-big={big ? "true" : undefined}>
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
        {extra}
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

/* -------------------------------------------------------------------------- */

/**
 * Cuántas casillas se adelantan por uso.
 *
 * Seis es una fila y media en un teléfono: alcanza para tapar lo que
 * cualquiera usa de verdad —cables, ropa, papelería— y no tanto como para
 * volverse una segunda grilla que también hay que leer.
 */
const HOT = 6;

/**
 * Las categorías que más usa esta persona, si son suficientes para valer la
 * pena.
 *
 * Con menos de tres no se muestra nada: un inventario recién empezado tendría
 * un "las que más usás" con una sola casilla, que no es un atajo, es un
 * cartel que ocupa una fila.
 *
 * Empatan a favor del orden del catálogo, así que el bloque de arriba tampoco
 * se reacomoda solo cada vez que entra una cosa.
 */
function hottest<T extends { key: string }>(options: T[], use: Record<string, number>) {
  const rows = options
    .map((option, index) => ({ option, index, count: use[option.key] ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, HOT);

  return rows.length >= 3 ? rows.map((row) => row.option) : [];
}

/**
 * Guardar un objeto.
 *
 * Esta pantalla se rediseñó alrededor de un solo número: trescientos. Un
 * inventario de verdad no son diez cosas, son cientos, y cualquier campo que
 * cueste una decisión consciente se paga cientos de veces.
 *
 * Por eso el alta son TRES pantallas de una pregunta cada una y no un
 * formulario de siete campos. Todo junto cabía —cabía de hecho— pero elegir
 * entre veintidós casillas mientras el cursor parpadea en un campo de texto y
 * un botón de cámara espera abajo es tener tres decisiones abiertas a la vez,
 * y tres decisiones abiertas a la vez es lo que vuelve lento algo que son
 * cuatro toques. Separadas, cada pantalla se contesta sin pensar: qué clase
 * de cosa es, cómo se llama, cómo se ve.
 *
 * El orden tampoco es casual. La categoría va primera porque es la única que
 * se contesta de un vistazo y sin teclado —y porque, puesta primera, se puede
 * ver entera en grande en vez de apretada debajo del nombre—. El nombre va
 * segundo, cuando ya hay color en la pantalla y se puede dictar. La foto va
 * última porque es la única que puede saltarse.
 *
 * Al editar no hay pasos: ahí no se está llenando una gaveta, se está
 * corrigiendo una cosa, y lo que hace falta es ver todo junto.
 *
 * Y nada de eso sirve si el botón tarda. Por eso la foto no viaja con el
 * formulario: el alta termina con el INSERT —nombre, categoría, miniatura,
 * unos KB— y la imagen grande se sube sola por detrás mientras se escribe el
 * objeto siguiente. La cosa ya se ve completa en la lista, porque la
 * miniatura la recortó el teléfono y entró con la fila.
 *
 * Y al agregar, la pantalla NO se cierra: vuelve al paso del nombre con la
 * categoría puesta. Volver a la lista y tocar otra vez "Agregar cosa" por
 * cada objeto es la mitad del trabajo de llenar un cajón, y quien vacía una
 * gaveta de cables agrega quince cables seguidos. Arriba queda el conteo de
 * lo que llevás con un "deshacer" para el último, que es lo que permite
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
  own,
  use,
  mode,
  onSaved,
}: {
  nodeId: string;
  item?: ItemWithPhoto;
  places: Place[];
  /** Las categorías que se hizo la persona, además de las de fábrica. */
  own: OwnCategory[];
  /** Cuántas cosas tiene guardadas en cada categoría, para adelantar las suyas. */
  use?: Record<string, number>;
  /**
   * Qué se está guardando.
   *
   * "wear" cambia la primera pantalla entera: en vez de las veintidós
   * categorías de la casa, las trece clases de prenda. Es un botón aparte en
   * la lista porque la ropa no es una categoría más —un armario son camisas,
   * pantalones y zapatos, no "treinta ropas"— y porque la clase de prenda es
   * lo que después deja armar un conjunto sin adivinar qué va arriba.
   */
  mode?: "thing" | "wear";
  onSaved: () => void;
}) {
  const editing = Boolean(item);
  const wear = mode === "wear";
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<FormState>(IDLE);
  const [pending, run] = useTransition();

  const form = useRef<HTMLFormElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const doorsRef = useRef<PhotoDoors | null>(null);

  /* En qué paso va el alta: 1 la categoría, 2 el nombre, 3 la foto. Al editar
     no se usa —se ve todo junto— y por eso arranca en el último. */
  const [step, setStep] = useState(editing ? 3 : 1);

  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item ? categoryOf(item.category, own).key : "");

  /* Las categorías que nacieron en ESTA pantalla. El servidor todavía no las
     mandó —la lista de arriba se renderizó antes de que existieran— y sin
     esto habría que recargar la pantalla entera en medio de un alta en
     cadena para poder usar la que se acaba de crear. */
  const [fresh, setFresh] = useState<OwnCategory[]>([]);
  const [making, setMaking] = useState(false);

  const mine = [...own, ...fresh.filter((row) => !own.some((saved) => saved.id === row.id))];

  /* El armario tiene su propio catálogo. `item?.category` entra para que una
     prenda guardada como "Ropa" —de antes de las trece clases— se vea con su
     casilla marcada en vez de en blanco. */
  const options = wear ? wearCatalog(item?.category ?? null) : catalog(mine);
  const hot = hottest(options, use ?? {});

  const [condition, setCondition] = useState<string>(item?.condition ?? "good");
  const [quantity, setQuantity] = useState(item?.quantity ?? 1);
  const [open, setOpen] = useState(false);

  /** Lo agregado en esta tanda, para el conteo y para deshacer el último. */
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);

  /* Cuántas fotos están viajando ahora mismo y cuántas se cayeron. El campo
     de foto se desmonta y vuelve con cada objeto —de ahí `round`—, que es la
     única forma honesta de vaciarlo: su recorte, su previsualización y sus
     dos inputs son estado suyo, y `form.reset()` no los toca. */
  const [uploads, setUploads] = useState(0);
  const [lost, setLost] = useState(0);
  const [round, setRound] = useState(0);

  /* Avisar antes de cerrar la pestaña con fotos a medio subir. Es la única
     contra de subir por detrás, y cuesta tres líneas. */
  useEffect(() => {
    if (uploads === 0) return;

    const hold = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [uploads]);

  /**
   * Mandar la foto por detrás, ya con el id de la cosa guardada.
   *
   * Sin `await` a propósito: el valor de todo esto es justamente que nadie
   * espere. La promesa sobrevive al desmontaje del formulario, así que la
   * subida termina aunque se cierre la hoja; lo único que la mata es cerrar
   * la pestaña, y para eso está el aviso de arriba.
   */
  function sendPhoto(id: string, photo: File, thumb: string) {
    const body = new FormData();
    body.set("id", id);
    body.set("node_id", item?.node_id ?? nodeId);
    body.set("photo", photo);
    if (thumb) body.set("thumb", thumb);

    setUploads((count) => count + 1);

    void attachItemPhoto(IDLE, body)
      .then((result) => {
        if (result.status === "error") setLost((count) => count + 1);
      })
      .catch(() => setLost((count) => count + 1))
      .finally(() => setUploads((count) => Math.max(0, count - 1)));
  }

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

    /*
       La foto se saca del envío y viaja aparte.

       El alta en cadena vive o muere por lo que tarda el botón: el INSERT con
       nombre, categoría y miniatura son unos KB y vuelve al instante, pero el
       cuadrado de 1080 px son cientos y en datos móviles se sienten. Mandarlo
       en el mismo FormData hacía esperar la red para poder escribir el objeto
       siguiente —y, mientras se esperaba, la foto seguía en pantalla y no
       había forma de saber si la cosa había entrado.

       Al editar no: ahí la hoja se cierra y guardar una sola cosa no es una
       carrera, así que la foto viaja con el formulario como siempre.
    */
    const picked = data.get("photo");
    const photo = picked instanceof File && picked.size > 0 ? picked : null;
    const thumb = String(data.get("thumb") ?? "");

    if (photo && !editing) data.delete("photo");

    run(async () => {
      const result = await (editing ? updateItem : createItem)(IDLE, data);
      setState(result);

      if (result.status !== "saved") return;

      if (editing) {
        onSaved();
        return;
      }

      /* Alta en cadena: no se cierra nada y no se vuelve al paso uno. Se
         limpia el nombre, se recuerda lo que entró y la categoría se queda
         puesta a propósito. */
      if (result.id) {
        setAdded((current) => [{ id: result.id as string, name: sent }, ...current].slice(0, 20));
        if (photo) sendPhoto(result.id, photo, thumb);
      }

      form.current?.reset();
      setName("");
      setQuantity(1);
      setOpen(false);
      setRound((current) => current + 1);
      setStep(2);
    });
  }

  /**
   * Al paso de la foto, con la cámara ya abierta.
   *
   * El orden importa y no es cosmético: la cámara se abre DENTRO del mismo
   * toque que trajo a esta función —si se hiciera después de pintar el paso
   * tres, ya no habría gesto de la persona detrás y el navegador no abriría
   * nada—. Así el paso de la foto es un toque y no tres.
   */
  function toPhoto(door: "camera" | "gallery") {
    if (door === "camera") doorsRef.current?.camera();
    else doorsRef.current?.gallery();
    setStep(3);
  }

  const tag = categoryOf(category, mine);
  const tone = category ? tag.hue : "#6b7280";

  /* La corazonada, ahora como oferta y no como automatismo. Antes la
     categoría se elegía sola mientras se escribía el nombre; con la categoría
     puesta de entrada eso ya no corresponde —nada peor que un campo que se
     desarma solo— pero el diccionario sigue sirviendo para lo que se dicta de
     un tirón: quien dijo "tijeras" teniendo puesto "Cocina" lo arregla con un
     toque. En el armario no se ofrece: el diccionario habla de categorías de
     la casa, no de clases de prenda. */
  const hunch = !wear && !editing && name.trim().length >= 3 ? guessCategory(name, mine) : null;
  const offer = hunch && hunch !== category ? categoryOf(hunch, mine) : null;

  const titles = ["", wear ? "La prenda" : "La categoría", "El nombre", "La foto"];

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
            {/* Las fotos que todavía viajan se cuentan acá y no en un cartel
                aparte: es el mismo renglón que se mira entre objeto y objeto,
                y así nadie tiene que buscar si la suya ya subió. */}
            {uploads > 0 ? (
              <span className="r-up"> · {uploads === 1 ? "subiendo 1 foto" : `subiendo ${uploads} fotos`}</span>
            ) : null}
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

      {/* Dónde va el alta, y cómo se vuelve. Sin esto, tres pantallas que se
          parecen son tres pantallas en las que uno no sabe si avanzó. */}
      {!editing ? (
        <div className="r-steps">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="r-steps-back"
              aria-label="Volver al paso anterior"
            >
              <ArrowBack className="size-[1.125rem]" />
            </button>
          ) : null}
          <span>
            <strong>{titles[step]}</strong> · paso {step} de 3
          </span>
          {/* La categoría elegida se queda a la vista en los pasos siguientes:
              es la única respuesta que ya se dio y que no se ve en ningún otro
              lado del paso dos. */}
          {step > 1 && category ? (
            <span className="r-steps-tag" style={{ "--tone": tone } as React.CSSProperties}>
              <CategoryGlyph category={tag.glyph ?? tag.key} className="size-[0.9375rem]" />
              {tag.label}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ----------------------------- Paso 1 ----------------------------- */}

      {editing || step === 1 ? (
        <>
          {!editing ? (
            <p className="r-ask">{wear ? "¿Qué prenda es?" : "¿Qué clase de cosa es?"}</p>
          ) : null}

          {/* Las más usadas se COPIAN arriba, no se mueven: la casilla de
              "cables" sigue estando donde la mano ya la busca, y de paso está
              también en la primera fila. Duplicar una casilla cuesta un poco
              de alto de pantalla; reordenar la grilla cuesta la memoria
              muscular, que es lo único que hace rápido al objeto doscientos. */}
          {!editing && hot.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="r-eyebrow px-1">Las que más usás</span>
              <TilePicker
                big
                name="category"
                legend={wear ? "Prenda, las más usadas" : "Categoría, las más usadas"}
                value={category}
                options={hot.map((option) => ({
                  key: option.key,
                  label: option.label,
                  tone: option.hue,
                  icon: (
                    <CategoryGlyph
                      category={option.glyph ?? option.key}
                      className="size-[1.375rem]"
                    />
                  ),
                }))}
                onPick={(key) => {
                  setCategory(key);
                  if (!editing) setStep(2);
                }}
              />
              <span className="r-eyebrow mt-2 px-1">Todas</span>
            </div>
          ) : null}

          <TilePicker
            big={!editing}
            name="category"
            legend={wear ? "Prenda" : "Categoría"}
            value={category}
            options={options.map((option) => ({
              key: option.key,
              label: option.label,
              tone: option.hue,
              icon: (
                <CategoryGlyph category={option.glyph ?? option.key} className="size-[1.375rem]" />
              ),
            }))}
            onPick={(key) => {
              setCategory(key);
              if (!editing) setStep(2);
            }}
            /* La casilla de hacerse una categoría va al final de la grilla y
               no en un enlace a "ajustes": el momento en que alguien descubre
               que le falta "pesca" es con la caña en la mano, no en una
               pantalla de configuración a la que va a entrar otro día.

               En el armario no va: las trece clases de prenda son un cuerpo,
               no un gusto, y una prenda que no esté ahí es una categoría de
               la casa. */
            extra={
              !making && !wear ? (
                <button
                  type="button"
                  onClick={() => setMaking(true)}
                  className="r-cat r-cat-new"
                  aria-label="Hacer una categoría nueva"
                >
                  <PlusSlot className="size-[1.375rem]" />
                  <span>Nueva</span>
                </button>
              ) : null
            }
          />

          {/* Renombrar, recolorear o borrar NO se hace acá: es otra cosa, se
              hace una vez cada tanto, y meterla en el alta sería llenar de
              botones la pantalla que vive o muere por estar vacía. */}
          {mine.length > 0 && !making && !wear ? (
            <NavLink href={CATEGORIES_PATH} className="r-hint underline underline-offset-4">
              Mis categorías
            </NavLink>
          ) : null}

          {making ? (
            <CategoryMaker
              nodeId={item?.node_id ?? nodeId}
              onCancel={() => setMaking(false)}
              onDone={(saved) => {
                setFresh((current) => [...current, saved]);
                setCategory(saved.id);
                setMaking(false);
                if (!editing) setStep(2);
              }}
            />
          ) : null}
        </>
      ) : (
        <input type="hidden" name="category" value={category} />
      )}

      {/* ----------------------------- Paso 2 ----------------------------- */}

      {editing || step === 2 ? (
        <div>
          <label className="r-field-label" htmlFor="item-name">
            {editing ? "¿Qué cosa es?" : wear ? "¿Cómo le decís?" : "¿Qué cosa es?"}
          </label>

          <div className="r-named">
            <input
              ref={nameField}
              id="item-name"
              name="name"
              type="text"
              required
              maxLength={80}
              autoComplete="off"
              enterKeyHint={editing ? "done" : "next"}
              autoFocus={!editing}
              value={name}
              onChange={(event) => setName(event.target.value)}
              /* Enter no guarda: lleva a la foto. Guardar desde acá existe
                 —el botón de abajo— pero no puede ser lo que pasa al apretar
                 la tecla que el teclado ofrece de paso. */
              onKeyDown={(event) => {
                if (editing || event.key !== "Enter") return;
                event.preventDefault();
                if (name.trim().length > 0) toPhoto("camera");
              }}
              placeholder={
                wear ? "Sudadera gris, jean negro…" : "Cable HDMI, memoria RAM, tijeras…"
              }
              className="r-field r-field-lg"
            />

            {/* Dictar, para quien tiene las dos manos ocupadas. Dentro del
                campo y no debajo: es otra forma de llenar ESTE campo, no otra
                función de la pantalla. */}
            {!editing ? <DictateKey onHeard={setName} /> : null}
          </div>

          {/* La oferta de la corazonada: una píldora, nunca un cambio solo. */}
          {offer ? (
            <button
              type="button"
              onClick={() => setCategory(offer.key)}
              className="r-chip mt-2.5 gap-1.5"
              style={{ "--tone": offer.hue } as React.CSSProperties}
            >
              <CategoryGlyph
                category={offer.glyph ?? offer.key}
                className="size-[0.9375rem]"
              />
              ¿Es {offer.label.toLowerCase()}?
            </button>
          ) : null}
        </div>
      ) : (
        <input type="hidden" name="name" value={name} />
      )}

      {!editing && step === 2 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={name.trim().length === 0}
            onClick={() => toPhoto("camera")}
            className="r-key r-key-lit w-full gap-2"
            style={{ "--tone": tone } as React.CSSProperties}
          >
            <Camera className="size-[1.125rem]" />
            Tomar la foto
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={name.trim().length === 0}
              onClick={() => toPhoto("gallery")}
              className="r-key flex-1 gap-2 text-[0.9375rem]"
            >
              <Grid className="size-[1.125rem]" />
              Elegir
            </button>
            <button
              type="submit"
              disabled={pending || name.trim().length === 0}
              className="r-key flex-1 text-[0.9375rem]"
            >
              {pending ? "Guardando…" : "Guardar sin foto"}
            </button>
          </div>
        </div>
      ) : null}

      {/* ----------------------------- Paso 3 ----------------------------- */}

      {/* El campo de la foto NO se desmonta en los pasos anteriores: tiene que
          existir para que el toque del paso dos pueda abrirle la cámara, y
          porque el archivo elegido vive en sus inputs y desmontarlo lo
          perdería. Oculto, sus inputs siguen viajando en el formulario. */}
      <div hidden={!editing && step !== 3}>
        <PhotoField
          /* La `key` es lo que vacía el campo al pasar al objeto siguiente: su
             recorte y su previsualización son estado interno, y sin desmontarlo
             la foto del cable anterior seguía ahí, dando a entender que no se
             había guardado nada. */
          key={round}
          doorsRef={doorsRef}
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
          {(shot) => (item && isWearable(item.category) && !shot ? <Cutout item={item} /> : null)}
        </PhotoField>
      </div>

      {/* Todo lo que tiene un valor por defecto que acierta casi siempre vive
          acá adentro. Mostrarlo de entrada llenaba la pantalla de decisiones
          que casi nadie cambia. */}
      {editing || step === 3 ? (
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
      ) : null}

      <Error state={state} />

      {lost > 0 ? (
        <p className="r-alert" role="alert">
          {lost === 1
            ? "Una foto no se pudo subir. La cosa quedó guardada: podés volver a ponerle la foto editándola."
            : `${lost} fotos no se pudieron subir. Las cosas quedaron guardadas: podés volver a ponerles la foto editándolas.`}
        </p>
      ) : null}

      {editing || step === 3 ? (
        <button
          type="submit"
          disabled={pending || name.trim().length === 0 || category.length === 0}
          className="r-key r-key-lit w-full"
          style={{ "--tone": tone } as React.CSSProperties}
        >
          {pending ? "Guardando…" : editing ? "Guardar" : "Agregar y seguir"}
        </button>
      ) : null}

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