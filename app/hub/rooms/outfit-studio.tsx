"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { Chevron, Cross, Trash } from "@/components/icons";
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

/** Qué prenda está puesta en cada ranura. */
type Worn = Partial<Record<Slot, string>>;

/**
 * Vestir el maniquí.
 *
 * Antes esto era un lienzo: las prendas se arrastraban, se escalaban y se
 * giraban hasta que el conjunto se veía derecho. Funcionaba y no servía —
 * armar un conjunto terminaba siendo un trabajo de recortes, y nadie abre un
 * armario para hacer collage. Peor: cada vez que querías cambiar la camisa
 * había que sacar la vieja, meter la nueva y volver a acomodarla.
 *
 * Ahora es un selector de personaje: un cuerpo, seis ranuras y una fila por
 * ranura para pasar ropa. Cambiar de camisa es una flecha, y el pantalón
 * nunca más se va a quedar donde va la cabeza. El orden de las capas lo sabe
 * el maniquí —ver `OutfitFigure`—, así que la parte aburrida ya no es de
 * quien se viste.
 *
 * Toda ranura ofrece toda la ropa recortada, con la que probablemente
 * corresponde primero. El inventario sabe que algo es calzado, pero no sabe
 * si una prenda de "ropa" es una camisa o un pantalón: esconder opciones por
 * una categoría que no distingue eso dejaría pantalones imposibles de poner.
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

  /**
   * Pasar a la prenda siguiente o anterior de una ranura.
   *
   * El vacío es una posición más —antes de la primera prenda— y no un botón
   * aparte: sacarse el abrigo es ir una para atrás, igual que ponerse otro es
   * ir una para adelante. Y la vuelta es circular porque una lista que se
   * termina obliga a adivinar en qué punta estás.
   */
  function step(slot: Slot, direction: 1 | -1) {
    const rack = racks[slot];
    if (rack.length === 0) return;

    const worn_id = worn[slot];
    const at = worn_id ? rack.findIndex((garment) => garment.id === worn_id) + 1 : 0;
    const next = (at + direction + rack.length + 1) % (rack.length + 1);

    wear(slot, next === 0 ? null : rack[next - 1].id);
    setActive(slot);
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

      <section className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="r-eyebrow">Vestidor</h2>
          <span className="r-meta">
            {dressed === 0 ? "nada puesto" : dressed === 1 ? "1 prenda" : `${dressed} prendas`}
          </span>
        </div>

        <ul className="r-slots">
          {SLOTS.map((slot) => {
            const rack = racks[slot.key];
            const worn_id = worn[slot.key];
            const garment = worn_id ? rack.find((item) => item.id === worn_id) : null;
            const open = active === slot.key;

            return (
              <li key={slot.key} className="r-slot" data-on={open} data-filled={Boolean(garment)}>
                <div className="r-slot-row">
                  <button
                    type="button"
                    onClick={() => step(slot.key, -1)}
                    className="r-step-key"
                    aria-label={`${slot.label}: anterior`}
                  >
                    <Chevron className="size-4 rotate-90" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActive(open ? null : slot.key)}
                    className="r-slot-face"
                    aria-expanded={open}
                  >
                    <span className="r-slot-name">{slot.label}</span>
                    <span className="r-slot-worn">{garment?.name ?? slot.empty}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => step(slot.key, 1)}
                    className="r-step-key"
                    aria-label={`${slot.label}: siguiente`}
                  >
                    <Chevron className="size-4 -rotate-90" />
                  </button>
                </div>

                {/* El cajón de la ranura: la ropa a la vista, para elegir de un
                    toque cuando pasar de a una es más largo que mirar. */}
                {open ? (
                  <ul className="r-rack">
                    <li>
                      <button
                        type="button"
                        onClick={() => wear(slot.key, null)}
                        className="r-hanger"
                        data-on={!garment}
                        aria-label={slot.empty}
                      >
                        <Cross className="size-5 opacity-40" />
                        <span className="truncate">Nada</span>
                      </button>
                    </li>
                    {rack.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          onClick={() => wear(slot.key, option.id)}
                          className="r-hanger"
                          data-on={option.id === worn_id}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {option.cutout ? <img src={option.cutout} alt="" /> : null}
                          <span className="truncate">{option.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
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
