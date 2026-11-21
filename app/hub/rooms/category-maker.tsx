"use client";

import { startTransition, useRef, useState, useTransition, type CSSProperties } from "react";
import { Check, Trash } from "@/components/icons";
import { CATEGORY_HUES, type OwnCategory } from "@/lib/rooms";
import { createOwnCategory, deleteOwnCategory, updateOwnCategory } from "./actions";
import { CategoryGlyph, OWN_GLYPHS } from "./category-glyph";

/**
 * Hacerse una categoría.
 *
 * Las veintidós de fábrica están pensadas para una casa cualquiera, y una
 * casa cualquiera no existe: alguien tiene repuestos de moto, alguien
 * material de pesca, alguien plantas raras. Lo que no está en la lista cae en
 * "Otro", y lo que cae en "Otro" es exactamente lo que después no se
 * encuentra — el color deja de agrupar y el dibujo deja de nombrar.
 *
 * Por eso pide las tres cosas y no solo el nombre: sin color y sin dibujo, la
 * categoría propia sería una palabra gris entre veintidós casillas de colores
 * y se leería como un error.
 *
 * Y por eso vive acá adentro y no en una pantalla aparte: el momento en que
 * uno descubre que le falta una categoría es con el objeto en la mano, en
 * medio del alta. Mandarlo a "ajustes" a crearla es perder el objeto y la
 * tanda.
 *
 * No es un `<form>`: se usa DENTRO del formulario de una cosa, y un
 * formulario anidado no existe en HTML. Por eso arma su `FormData` a mano.
 */
export function CategoryMaker({
  category,
  nodeId,
  onDone,
  onCancel,
  onDeleted,
}: {
  /** La que se edita. Sin esto, se está creando una nueva. */
  category?: OwnCategory;
  /** La pantalla a la que volver a pintar, si esto pasa en medio de un alta. */
  nodeId?: string;
  onDone: (saved: OwnCategory) => void;
  onCancel?: () => void;
  onDeleted?: (id: string) => void;
}) {
  const [label, setLabel] = useState(category?.label ?? "");
  const [hue, setHue] = useState(category?.hue ?? CATEGORY_HUES[0]);
  const [glyph, setGlyph] = useState(category?.glyph ?? "other");
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, run] = useTransition();

  const field = useRef<HTMLInputElement>(null);

  function save() {
    const name = label.trim();
    if (!name) {
      setError("¿Cómo se llama?");
      field.current?.focus();
      return;
    }

    const body = new FormData();
    body.set("label", name);
    body.set("hue", hue);
    body.set("glyph", glyph);
    if (category) body.set("id", category.id);
    if (nodeId) body.set("node_id", nodeId);

    run(async () => {
      const result = await (category ? updateOwnCategory : createOwnCategory)(
        { status: "idle" },
        body
      );

      if (result.status === "error") {
        setError(result.error);
        return;
      }

      const id = result.id ?? category?.id;
      if (!id) {
        setError("No se pudo guardar. Probá de nuevo.");
        return;
      }

      setError(null);
      onDone({ id, label: name, hue, glyph });
    });
  }

  return (
    <div className="r-maker" style={{ "--tone": hue } as CSSProperties}>
      <input
        ref={field}
        type="text"
        value={label}
        maxLength={24}
        autoComplete="off"
        autoFocus={!category}
        onChange={(event) => setLabel(event.target.value)}
        /* Enter guarda, porque el campo del nombre es lo único que casi
           siempre se escribe: el color y el dibujo tienen un valor puesto y
           muchas veces no se tocan. */
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          save();
        }}
        placeholder="Pesca, repuestos, plantas raras…"
        className="r-field"
        aria-label="Nombre de la categoría"
      />

      <div className="r-maker-row">
        {CATEGORY_HUES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => setHue(color)}
            className="r-swatch"
            data-on={hue === color}
            style={{ background: color }}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>

      {/* Los dibujos sin su nombre debajo: acá el nombre lo pone la persona en
          el campo de arriba, y escribir "cable" bajo un dibujo que va a
          significar "repuestos de moto" sería mentir. */}
      <div className="r-glyphs">
        {OWN_GLYPHS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setGlyph(key)}
            className="r-cat"
            data-on={glyph === key}
            style={{ "--tone": hue } as CSSProperties}
            aria-label={`Dibujo ${key}`}
          >
            <CategoryGlyph category={key} className="size-[1.25rem]" />
          </button>
        ))}
      </div>

      {error ? (
        <p className="r-alert" role="alert">
          {error}
        </p>
      ) : null}

      {armed && category ? (
        <div className="flex flex-col gap-2">
          <p className="r-alert" role="alert">
            Las cosas que estén en {category.label} no se borran: quedan como “Otro”.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setArmed(false)} className="r-key flex-1">
              Mejor no
            </button>
            <button
              type="button"
              onClick={() =>
                startTransition(() => {
                  void deleteOwnCategory(category.id);
                  onDeleted?.(category.id);
                })
              }
              className="r-key r-key-lit flex-1"
              style={{ "--tone": "#a33a2a" } as CSSProperties}
            >
              Sí, borrar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {category && onDeleted ? (
            <button
              type="button"
              onClick={() => setArmed(true)}
              className="r-ico"
              aria-label={`Borrar ${category.label}`}
            >
              <Trash className="size-[1.125rem]" />
            </button>
          ) : null}

          {onCancel ? (
            <button type="button" onClick={onCancel} className="r-key flex-1">
              Cancelar
            </button>
          ) : null}

          <button
            type="button"
            disabled={pending || label.trim().length === 0}
            onClick={save}
            className="r-key r-key-lit flex-1 gap-2"
          >
            <Check className="size-4" />
            {pending ? "Guardando…" : category ? "Guardar" : "Crear y usar"}
          </button>
        </div>
      )}
    </div>
  );
}
