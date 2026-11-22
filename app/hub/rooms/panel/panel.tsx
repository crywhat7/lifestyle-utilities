"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { NavLink } from "@/components/nav-link";
import { ArrowBack, Camera, Check, Copy, Pin, Spark } from "@/components/icons";
import { CENTERED, cropSquare } from "@/lib/photo";
import {
  COLORS,
  CONDITIONS,
  catalog,
  categoryOf,
  colorOf,
  hasTwoEnds,
  isGarment,
  pathLabel,
  wearCatalog,
  type ItemWithPhoto,
  type OwnCategory,
  type RoomNode,
} from "@/lib/rooms";
import { CategoryGlyph } from "../category-glyph";
import type { Place } from "../forms";
import { ROOMS_PATH, itemPath, trailPath } from "../paths";
import { guessItem, pasteImage, patchItem, type Patch } from "../panel-actions";

/** Cuánto se espera después de la última tecla antes de guardar. */
const SETTLE = 650;

type Slot = "main" | "second" | "cutout";
type State = "idle" | "saving" | "saved" | "error";

/**
 * El panel.
 *
 * Una pantalla de escritorio en un módulo hecho para el pulgar, y la razón
 * es que son dos trabajos distintos. Guardar algo pasa con el objeto en la
 * mano, de pie frente a un cajón: ahí manda el teléfono. Auditar lo guardado
 * —repasar ciento veinte prendas, corregir nombres, poner colores, pegar las
 * fotos recortadas— pasa sentado, con teclado, y en un teléfono es inviable.
 *
 * Tres decisiones que definen la pantalla:
 *
 * No hay botón de guardar. Cada campo se guarda solo medio segundo después
 * de dejar de escribir. Con ciento veinte prendas, un botón por cambio son
 * cientos de clics y, peor, cientos de oportunidades de perder lo escrito al
 * pasar a la siguiente.
 *
 * Las fotos se copian y se pegan. Quitar el fondo dentro de la app salía
 * mal; copiar la foto, pasarla por la herramienta que uno quiera y pegarla
 * de vuelta sale perfecto y toma diez segundos. Ctrl/Cmd+V en cualquier
 * parte del panel pega en la foto de outfit, que es la que usa el maniquí.
 *
 * La IA propone, no guarda. El botón de adivinar lee la foto y muestra lo
 * que vio en una barra con "Aplicar". Un modelo que escribe solo deja datos
 * que nadie revisó y que PARECEN revisados, que es peor que no tener modelo.
 */
export function Panel({
  items,
  nodes,
  places,
  own,
}: {
  items: ItemWithPhoto[];
  nodes: RoomNode[];
  places: Place[];
  own: OwnCategory[];
}) {
  const [rows, setRows] = useState(items);
  const [pick, setPick] = useState<string | null>(items[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  /* "Ocultar" existe por un pedido concreto: no querer ver las calcetas. Con
     solo "mostrar", esconder una categoría obliga a elegir las otras doce. */
  const [hide, setHide] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [note, setNote] = useState<string | null>(null);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const timer of live.values()) clearTimeout(timer);
      live.clear();
    };
  }, []);

  const whereById = useMemo(
    () => new Map(nodes.map((node) => [node.id, pathLabel(node.path)])),
    [nodes]
  );

  const options = useMemo(() => [...catalog(own), ...wearCatalog()], [own]);

  /** Qué categorías hay de verdad, con su cuenta. */
  const facets = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; hue: string; count: number }>();

    for (const row of rows) {
      const tag = categoryOf(row.category, own);
      const found = seen.get(tag.key);
      if (found) found.count += 1;
      else seen.set(tag.key, { key: tag.key, label: tag.label, hue: tag.hue, count: 1 });
    }

    return [...seen.values()].sort((a, b) => b.count - a.count);
  }, [rows, own]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (tags.length > 0) {
        const inside = tags.includes(categoryOf(row.category, own).key);
        if (hide ? inside : !inside) return false;
      }

      if (!needle) return true;

      const hay = [
        row.name,
        categoryOf(row.category, own).label,
        colorOf(row.color)?.label ?? "",
        whereById.get(row.node_id) ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(needle);
    });
  }, [rows, tags, hide, query, own, whereById]);

  const item = rows.find((row) => row.id === pick) ?? null;

  /**
   * Guardar un campo, un rato después de la última tecla.
   *
   * El cambio se pinta al instante y el viaje al servidor va detrás: en una
   * auditoría uno escribe y pasa a la siguiente prenda sin esperar a nadie.
   * Un temporizador por campo y no uno global, porque cambiar el color no
   * tiene por qué reiniciar la espera de lo que se está escribiendo.
   */
  const save = useCallback((id: string, field: string, patch: Patch) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? ({ ...row, ...patch } as ItemWithPhoto) : row))
    );

    const key = `${id}:${field}`;
    const running = timers.current.get(key);
    if (running) clearTimeout(running);

    setState("saving");

    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);

        void patchItem(id, patch)
          .then((result) => setState(result.ok ? "saved" : "error"))
          .catch(() => setState("error"));
      }, SETTLE)
    );
  }, []);

  /* --- Las fotos ---------------------------------------------------------- */

  const [busy, setBusy] = useState(false);

  /**
   * Copiar la foto al portapapeles.
   *
   * Se convierte a PNG porque es lo único que todos los navegadores aceptan
   * poner en el portapapeles como imagen, y el `ClipboardItem` se arma con
   * la PROMESA y no con el blob ya resuelto: Safari exige que la escritura
   * salga del mismo gesto que la provocó, y esperar la descarga antes
   * rompería esa cadena.
   */
  async function copyPhoto(url: string) {
    setNote(null);

    const png = async () => {
      const blob = await (await fetch(url)).blob();
      const bitmap = await createImageBitmap(blob);

      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);

        return await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((made) => (made ? resolve(made) : reject(new Error("sin blob"))), "image/png");
        });
      } finally {
        bitmap.close();
      }
    };

    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png() })]);
      setNote("Foto copiada.");
    } catch {
      setNote("El navegador no dejó copiar la imagen.");
    }
  }

  /** Subir una imagen pegada —o elegida— a una de las tres ranuras. */
  const put = useCallback(
    async (id: string, slot: Slot, file: File) => {
      setBusy(true);
      setNote(null);
      setState("saving");

      try {
        const body = new FormData();
        body.set("id", id);
        body.set("slot", slot);

        if (slot === "cutout") {
          /* La foto de outfit no se recorta: si trae transparencia, la
             transparencia ES el dato y meterla en un cuadrado opaco sería
             deshacer justo lo que se vino a pegar.

             Lo único que se hace es volverla PNG cuando no lo es. El
             portapapeles casi siempre entrega PNG, pero un WebP pegado desde
             otra herramienta también conserva el canal alfa y rechazarlo por
             la extensión sería perder una imagen que sirve. */
          body.set("image", file.type === "image/png" ? file : await toPng(file));
        } else {
          const ready = await cropSquare(file, CENTERED);
          body.set("image", ready.image);
          body.set("thumb", ready.thumb);
          URL.revokeObjectURL(ready.preview);
        }

        const result = await pasteImage(body);

        if (!result.ok) {
          setNote(result.error ?? "No se pudo guardar la imagen.");
          setState("error");
          return;
        }

        /* La URL firmada vieja ya no sirve para ver lo nuevo. Se muestra el
           archivo local mientras tanto: el servidor ya lo tiene. */
        const local = URL.createObjectURL(file);
        setRows((current) =>
          current.map((row) =>
            row.id === id
              ? ({
                  ...row,
                  ...(slot === "cutout" ? { cutout: local } : {}),
                  ...(slot === "second" ? { second: local } : {}),
                  ...(slot === "main" ? { photo: local } : {}),
                } as ItemWithPhoto)
              : row
          )
        );

        setState("saved");
        setNote(slot === "cutout" ? "Foto de outfit actualizada." : "Foto actualizada.");
      } catch {
        setNote("No se pudo leer esa imagen.");
        setState("error");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  /**
   * Ctrl/Cmd+V en cualquier parte del panel.
   *
   * Va a la foto de outfit y no a la foto normal porque ese es el circuito
   * que el pegado vino a cerrar: copiar la foto, quitarle el fondo afuera,
   * volver y pegar. Para reemplazar la foto original están los botones de
   * cada ranura, que es una acción mucho menos frecuente.
   */
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (!pick) return;

      const file = [...(event.clipboardData?.items ?? [])]
        .filter((entry) => entry.kind === "file" && entry.type.startsWith("image/"))
        .map((entry) => entry.getAsFile())
        .find((entry): entry is File => Boolean(entry));

      if (!file) return;

      event.preventDefault();
      void put(pick, "cutout", file);
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pick, put]);

  /* --- La corazonada de la IA --------------------------------------------- */

  const [guess, setGuess] = useState<{ name: string; category: string; color: string | null } | null>(
    null
  );
  const [reading, setReading] = useState(false);

  async function askAi(id: string) {
    setReading(true);
    setGuess(null);
    setNote(null);

    try {
      const result = await guessItem(id);
      if (result.ok) setGuess({ name: result.name, category: result.category, color: result.color });
      else setNote(result.error);
    } catch {
      setNote("No se pudo leer la foto.");
    } finally {
      setReading(false);
    }
  }

  /* --- Pintar -------------------------------------------------------------- */

  return (
    <main className="r-panel">
      <aside className="r-panel-side">
        <header className="flex items-center gap-2">
          <NavLink href={ROOMS_PATH} className="r-ico" aria-label="Volver a los cuartos">
            <ArrowBack className="size-[1.125rem]" />
          </NavLink>
          <div className="min-w-0 flex-1">
            <p className="r-eyebrow">Panel</p>
            <p className="text-[0.875rem] font-medium">
              {shown.length === rows.length
                ? `${rows.length} cosas`
                : `${shown.length} de ${rows.length}`}
            </p>
          </div>
        </header>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar por nombre, color, lugar…"
          aria-label="Filtrar la lista"
          className="r-field"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHide(!hide)}
            className="r-chip shrink-0"
            data-on={hide}
            title="Cambia si las fichas marcadas se muestran o se esconden"
          >
            {hide ? "Ocultar" : "Mostrar solo"}
          </button>
          {tags.length > 0 ? (
            <button type="button" onClick={() => setTags([])} className="r-hint underline">
              limpiar
            </button>
          ) : null}
        </div>

        <div className="r-panel-tags">
          {facets.map((facet) => (
            <button
              key={facet.key}
              type="button"
              className="r-chip"
              data-on={tags.includes(facet.key)}
              style={{ "--tone": facet.hue } as CSSProperties}
              onClick={() =>
                setTags((current) =>
                  current.includes(facet.key)
                    ? current.filter((key) => key !== facet.key)
                    : [...current, facet.key]
                )
              }
            >
              {facet.label}
              <span className="r-facet-n">{facet.count}</span>
            </button>
          ))}
        </div>

        <ul className="r-panel-list">
          {shown.map((row) => {
            const tag = categoryOf(row.category, own);
            const tint = colorOf(row.color);

            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPick(row.id);
                    setGuess(null);
                    setNote(null);
                  }}
                  className="r-panel-row"
                  data-on={row.id === pick}
                  style={{ "--tone": tag.hue } as CSSProperties}
                >
                  <span className="r-panel-shot">
                    {row.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.thumb} alt="" />
                    ) : (
                      <CategoryGlyph category={tag.glyph ?? tag.key} className="size-4" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[0.8125rem] font-medium">{row.name}</span>
                    <span className="flex items-center gap-1.5 text-[0.6875rem] text-[var(--r-ink-3)]">
                      {tint ? (
                        <span
                          aria-hidden="true"
                          className="r-tint"
                          style={{ background: tint.hex }}
                        />
                      ) : null}
                      <span className="truncate">{tag.label}</span>
                    </span>
                  </span>

                  {row.cutout ? (
                    <span className="r-panel-ok" title="Ya tiene foto de outfit">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}

          {shown.length === 0 ? <li className="r-hint p-3">Nada con ese filtro.</li> : null}
        </ul>
      </aside>

      <section className="r-panel-sheet">
        {!item ? (
          <p className="r-empty">Elegí algo de la lista.</p>
        ) : (
          <Sheet
            key={item.id}
            item={item}
            own={own}
            options={options}
            places={places}
            where={whereById.get(item.node_id) ?? ""}
            state={state}
            note={note}
            busy={busy}
            reading={reading}
            guess={guess}
            onSave={save}
            onCopy={copyPhoto}
            onPut={put}
            onAsk={askAi}
            onDropGuess={() => setGuess(null)}
          />
        )}
      </section>
    </main>
  );
}

/** La misma imagen, en PNG, conservando la transparencia si la tenía. */
async function toPng(file: File) {
  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((made) => (made ? resolve(made) : reject(new Error("sin blob"))), "image/png");
    });

    return new File([blob], "outfit.png", { type: "image/png" });
  } finally {
    bitmap.close();
  }
}

/* -------------------------------------------------------------------------- */

/** La ficha de la derecha: todo lo que se sabe de una cosa, editable al vuelo. */
function Sheet({
  item,
  own,
  options,
  places,
  where,
  state,
  note,
  busy,
  reading,
  guess,
  onSave,
  onCopy,
  onPut,
  onAsk,
  onDropGuess,
}: {
  item: ItemWithPhoto;
  own: OwnCategory[];
  options: { key: string; label: string; hue: string; glyph?: string }[];
  places: Place[];
  where: string;
  state: State;
  note: string | null;
  busy: boolean;
  reading: boolean;
  guess: { name: string; category: string; color: string | null } | null;
  onSave: (id: string, field: string, patch: Patch) => void;
  onCopy: (url: string) => void;
  onPut: (id: string, slot: Slot, file: File) => void;
  onAsk: (id: string) => void;
  onDropGuess: () => void;
}) {
  const tag = categoryOf(item.category, own);
  const tone = tag.hue;
  const two = hasTwoEnds(item.category);

  return (
    <div className="flex flex-col gap-5" style={{ "--tone": tone } as CSSProperties}>
      <header className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-[1.25rem] font-semibold">{item.name}</h1>

        <span className="r-save" data-state={state}>
          {state === "saving" ? "Guardando…" : state === "error" ? "No se guardó" : "Guardado"}
        </span>

        <NavLink href={itemPath(item.node_id, item.id)} className="r-ico" aria-label="Abrir la ficha">
          <Camera className="size-[1.125rem]" />
        </NavLink>
        <NavLink href={trailPath(item.id)} className="r-ico" aria-label="Cómo llegar">
          <Pin className="size-[1.125rem]" />
        </NavLink>
      </header>

      {note ? <p className="r-hint">{note}</p> : null}

      {/* La propuesta de la IA, para aceptar o tirar. Nunca se aplica sola. */}
      {guess ? (
        <div className="r-guess">
          <span className="min-w-0 flex-1">
            Parece <strong>{guess.name}</strong> · {categoryOf(guess.category, own).label}
            {guess.color ? ` · ${colorOf(guess.color)?.label}` : ""}
          </span>
          <button type="button" onClick={onDropGuess} className="r-key">
            No
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(item.id, "guess", {
                name: guess.name,
                category: guess.category,
                color: guess.color,
              });
              onDropGuess();
            }}
            className="r-key r-key-lit"
          >
            Aplicar
          </button>
        </div>
      ) : null}

      <div className="r-panel-shots">
        <Shot
          label="La foto"
          url={item.photo ?? item.thumb}
          busy={busy}
          onCopy={onCopy}
          onPick={(file) => onPut(item.id, "main", file)}
        />

        {two ? (
          <Shot
            label="La otra punta"
            url={item.second ?? item.second_thumb}
            busy={busy}
            onCopy={onCopy}
            onPick={(file) => onPut(item.id, "second", file)}
          />
        ) : null}

        <Shot
          label="Foto de outfit · PNG"
          hint="Ctrl/Cmd+V pega acá"
          url={item.cutout}
          busy={busy}
          checkered
          onCopy={onCopy}
          onPick={(file) => onPut(item.id, "cutout", file)}
        />
      </div>

      <button
        type="button"
        disabled={reading}
        onClick={() => onAsk(item.id)}
        className="r-key gap-2 self-start"
      >
        <Spark className="size-4" />
        {reading ? "Mirando la foto…" : "¿Qué es? Adivinar con IA"}
      </button>

      <div className="r-panel-grid">
        <label className="r-panel-field">
          <span className="r-field-label">Nombre</span>
          <input
            type="text"
            defaultValue={item.name}
            maxLength={80}
            onChange={(event) => onSave(item.id, "name", { name: event.target.value })}
            className="r-field"
          />
        </label>

        <label className="r-panel-field">
          <span className="r-field-label">Categoría</span>
          <select
            value={tag.key}
            onChange={(event) => onSave(item.id, "category", { category: event.target.value })}
            className="r-field"
          >
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {isGarment(option.key) ? `Ropa · ${option.label}` : option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="r-panel-field">
          <span className="r-field-label">Dónde está</span>
          <select
            value={item.node_id}
            onChange={(event) => onSave(item.id, "node", { node_id: event.target.value })}
            className="r-field"
          >
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.label}
              </option>
            ))}
          </select>
        </label>

        <label className="r-panel-field">
          <span className="r-field-label">Cuántos</span>
          <input
            type="number"
            min={1}
            max={9999}
            defaultValue={item.quantity}
            onChange={(event) =>
              onSave(item.id, "quantity", { quantity: Number(event.target.value) })
            }
            className="r-field"
          />
        </label>
      </div>

      <div>
        <span className="r-field-label">Color</span>
        <div className="r-tints">
          {COLORS.map((swatch) => (
            <button
              key={swatch.key}
              type="button"
              onClick={() =>
                onSave(item.id, "color", {
                  color: item.color === swatch.key ? null : swatch.key,
                })
              }
              className="r-tint-key"
              data-on={item.color === swatch.key}
              data-multi={swatch.key === "multi" ? "true" : undefined}
              style={{ "--swatch": swatch.hex } as CSSProperties}
              aria-label={swatch.label}
              title={swatch.label}
            />
          ))}
        </div>
      </div>

      <div>
        <span className="r-field-label">Estado</span>
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onSave(item.id, "condition", { condition: option.key })}
              className="r-chip"
              data-on={item.condition === option.key}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label className="r-panel-field">
        <span className="r-field-label">Nota</span>
        <textarea
          rows={3}
          maxLength={400}
          defaultValue={item.note ?? ""}
          onChange={(event) => onSave(item.id, "note", { note: event.target.value })}
          className="r-field resize-none"
        />
      </label>

      <p className="r-hint">{where}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Una ranura de foto.
 *
 * Copiar y reemplazar en la misma pieza, porque son los dos lados del mismo
 * viaje: la foto sale al portapapeles, da una vuelta por donde uno quiera, y
 * vuelve. El tablero de ajedrez detrás de la foto de outfit no es decoración:
 * es la única forma de ver si el PNG que se pegó tiene fondo transparente de
 * verdad o trae un rectángulo blanco.
 */
function Shot({
  label,
  hint,
  url,
  busy,
  checkered,
  onCopy,
  onPick,
}: {
  label: string;
  hint?: string;
  url?: string | null;
  busy: boolean;
  checkered?: boolean;
  onCopy: (url: string) => void;
  onPick: (file: File) => void;
}) {
  const field = useRef<HTMLInputElement>(null);

  return (
    <div className="r-shot-slot">
      <span className="r-field-label">{label}</span>

      <div className="r-shot-box" data-checkered={checkered ? "true" : undefined}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" />
        ) : (
          <span className="r-hint">{hint ?? "Sin foto"}</span>
        )}
      </div>

      <input
        ref={field}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = "";
        }}
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!url}
          onClick={() => url && onCopy(url)}
          className="r-key flex-1 gap-1.5 text-[0.8125rem]"
        >
          <Copy className="size-4" />
          Copiar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => field.current?.click()}
          className="r-key flex-1 text-[0.8125rem]"
        >
          Reemplazar
        </button>
      </div>
    </div>
  );
}
