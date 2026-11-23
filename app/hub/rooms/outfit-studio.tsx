"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { Cross, Trash } from "@/components/icons";
import {
  SLOTS,
  slotOf,
  suggestedSlot,
  type Garment,
  type Outfit,
  type Piece,
  type Slot,
} from "@/lib/rooms";
import { deleteOutfit, saveOutfit, type FormState } from "./actions";
import { OutfitFigure } from "./outfits/figure";

const IDLE: FormState = { status: "idle" };

/**
 * En qué orden se ofrecen los rieles.
 *
 * De la cabeza a los pies no: de lo que más se elige a lo que menos. Un
 * conjunto empieza por la camisa y el pantalón —eso es el conjunto— y
 * termina en los accesorios, que son los que a veces ni se ponen. El orden
 * de `SLOTS` es el de las capas sobre el cuerpo, que es otra cosa y sigue
 * mandando donde importa: el dibujo.
 */
const RAILS = [...SLOTS].sort(
  (a, b) =>
    ["top", "bottom", "shoes", "outer", "socks", "accessory"].indexOf(a.key) -
    ["top", "bottom", "shoes", "outer", "socks", "accessory"].indexOf(b.key)
);

/** Qué prenda está puesta en cada ranura. */
type Worn = Partial<Record<Slot, string>>;

/**
 * Armar un conjunto.
 *
 * Arriba, el conjunto tendido —ver `OutfitFigure`—; abajo, un riel de fotos
 * por cada parte del cuerpo. Se toca una prenda y aparece arriba. Se toca
 * otra y la reemplaza. Se toca la que está puesta y se la quita.
 *
 * Eso es todo, y llegar ahí costó dos intentos fallidos que conviene dejar
 * escritos. El primero fue un lienzo libre: arrastrar, escalar y girar
 * recortes hasta que el conjunto se veía derecho. Armar un conjunto no puede
 * ser un trabajo de recortes. El segundo fue un maniquí con seis filas de
 * flechitas: "Arriba — Sin camisa ‹ ›". Ordenado, legible y horrible — para
 * ver una camisa había que pasarlas de a una, a ciegas, leyendo nombres.
 *
 * La ropa se elige MIRÁNDOLA. Es lo único que hacen igual todas las apps que
 * resuelven esto bien, y es obvio en cuanto se ve: un riel de fotos contesta
 * "¿cuál me pongo?" de un vistazo, y ninguna lista de nombres con flechas lo
 * va a hacer nunca.
 *
 * Cada riel ofrece toda la ropa recortada, con la que probablemente
 * corresponde primero. Esconder opciones por categoría dejaría prendas
 * imposibles de poner, y el costo de ofrecer de más es rodar un poco.
 */
export function OutfitStudio({
  wardrobe,
  outfit,
  onDone,
}: {
  wardrobe: Garment[];
  outfit?: Outfit;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveOutfit, IDLE);
  const [worn, setWorn] = useState<Worn>(() => dress(outfit?.pieces ?? []));
  const [active, setActive] = useState<Slot | null>(null);

  useEffect(() => {
    if (state.status === "saved") onDone();
  }, [state, onDone]);

  /* La ropa que ofrece cada ranura, calculada una vez: con veinte prendas y
     seis ranuras, reordenar en cada tecla es trabajo para nada. */
  const racks = useMemo(() => {
    const out = {} as Record<Slot, Garment[]>;

    for (const slot of SLOTS) {
      out[slot.key] = [...wardrobe].sort(
        (a, b) =>
          Number(suggestedSlot(b.category) === slot.key) -
          Number(suggestedSlot(a.category) === slot.key)
      );
    }

    return out;
  }, [wardrobe]);

  const pieces = useMemo(() => undress(worn), [worn]);

  function wear(slot: Slot, id: string | null) {
    setWorn((current) => {
      const next = { ...current };
      if (id) next[slot] = id;
      else delete next[slot];
      return next;
    });
  }

  const dressed = pieces.length;

  return (
    <form action={action} className="flex flex-col gap-6">
      {outfit ? <input type="hidden" name="id" value={outfit.id} /> : null}
      <input type="hidden" name="pieces" value={JSON.stringify(pieces)} />

      <OutfitFigure
        pieces={pieces}
        wardrobe={wardrobe}
        active={active}
        onPick={(slot) => setActive((current) => (current === slot ? null : (slot as Slot)))}
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="r-eyebrow">Vestidor</h2>
          <span className="r-meta">
            {dressed === 0 ? "nada puesto" : dressed === 1 ? "1 prenda" : `${dressed} prendas`}
          </span>
        </div>

        {RAILS.map((slot) => {
          const rack = racks[slot.key];
          if (rack.length === 0) return null;

          const wornId = worn[slot.key];

          return (
            <div key={slot.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <span className="r-eyebrow">{slot.label}</span>

                {/* Quitar es un enlace y no una ficha más del riel: sacarse el
                    abrigo pasa una vez por conjunto, y una casilla "Nada"
                    delante de toda la ropa se toca sin querer. */}
                {wornId ? (
                  <button
                    type="button"
                    onClick={() => wear(slot.key, null)}
                    className="r-hint underline underline-offset-4"
                  >
                    quitar
                  </button>
                ) : null}
              </div>

              <ul className="r-rail">
                {rack.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => {
                        wear(slot.key, option.id === wornId ? null : option.id);
                        setActive(slot.key);
                      }}
                      className="r-pick"
                      data-on={option.id === wornId}
                      aria-pressed={option.id === wornId}
                      aria-label={option.name}
                      title={option.name}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {option.cutout ? <img src={option.cutout} alt="" /> : <Cross className="size-5 opacity-30" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <div>
        <label className="r-field-label" htmlFor="outfit-name">
          ¿Cómo se llama el conjunto?
        </label>
        <input
          id="outfit-name"
          name="name"
          type="text"
          required
          maxLength={60}
          autoComplete="off"
          defaultValue={outfit?.name ?? ""}
          placeholder="Para la oficina, salida de noche…"
          className="r-field"
        />
      </div>

      {state.status === "error" ? (
        <p className="r-alert" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        {outfit ? (
          <button
            type="button"
            onClick={() =>
              startTransition(() => {
                void deleteOutfit(outfit.id);
                onDone();
              })
            }
            className="r-ico"
            aria-label="Borrar el conjunto"
          >
            <Trash className="size-[1.125rem]" />
          </button>
        ) : null}

        <button type="submit" disabled={pending || dressed === 0} className="r-key r-key-lit flex-1">
          {pending ? "Guardando…" : outfit ? "Guardar cambios" : "Guardar conjunto"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * De conjunto guardado a maniquí vestido.
 *
 * Un conjunto armado en el lienzo viejo no trae ranuras, así que al abrirlo
 * se reparte por la categoría de cada prenda. No va a quedar perfecto —el
 * lienzo nunca supo qué era una camisa— pero queda editable, que es mejor que
 * quedar intacto y no poder tocarse.
 */
function dress(pieces: Piece[]): Worn {
  const worn: Worn = {};

  for (const piece of pieces) {
    const slot = slotOf(piece.slot)?.key;
    if (slot) {
      worn[slot] = piece.item_id;
      continue;
    }

    const guess = SLOTS.find((candidate) => !worn[candidate.key]);
    if (guess) worn[guess.key] = piece.item_id;
  }

  return worn;
}

/**
 * De maniquí vestido a lo que viaja al servidor.
 *
 * Las coordenadas se siguen escribiendo aunque el maniquí dibuje por ranura:
 * son el centro de la zona, y existen para que un conjunto guardado hoy se
 * entienda con cualquier dibujo —el de antes incluido— sin una migración.
 */
function undress(worn: Worn): Piece[] {
  return SLOTS.flatMap((slot) => {
    const id = worn[slot.key];
    if (!id) return [];

    return [
      {
        item_id: id,
        slot: slot.key,
        x: 50,
        y: slot.top + slot.height / 2,
        scale: 1,
        rot: 0,
      },
    ];
  });
}
