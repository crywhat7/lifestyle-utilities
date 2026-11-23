"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { Cross, Trash } from "@/components/icons";
import {
  SLOTS,
  boxOf,
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

/**
 * Armar un conjunto.
 *
 * Arriba, el conjunto tendido sobre la mesa —ver `OutfitFigure`—; abajo, un
 * riel de fotos por cada parte del cuerpo. Se toca una prenda y aparece
 * arriba, en su lugar. Se arrastra si ese lugar no gusta.
 *
 * Llegar acá costó dos intentos fallidos que conviene dejar escritos. El
 * primero fue un lienzo libre: cada prenda nacía en el centro y había que
 * acomodarla a mano. Eso no es libertad, es tarea, y armar un conjunto
 * terminaba siendo un trabajo de recortes. El segundo fue lo contrario: un
 * maniquí con seis filas de flechitas —"Arriba · Sin camisa ‹ ›"—, ordenado,
 * legible y horrible: para ver una camisa había que pasarlas de a una, a
 * ciegas, leyendo nombres.
 *
 * Lo que funciona es el medio. La prenda CAE en su lugar, así que el conjunto
 * se ve armado desde la primera; y se puede mover y agrandar, así que la
 * forma final es la que uno quiere y no la que el programa impone. "Acomodar"
 * devuelve todo a su sitio, que es lo que vuelve barato el experimento.
 *
 * Y la ropa se elige MIRÁNDOLA. Un riel de fotos contesta "¿cuál me pongo?"
 * de un vistazo, y ninguna lista de nombres con flechas lo va a hacer nunca.
 * Cada riel ofrece toda la ropa recortada, con la que probablemente
 * corresponde primero: esconder opciones por categoría dejaría prendas
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
  const [pieces, setPieces] = useState<Piece[]>(() => settle(outfit?.pieces ?? []));
  const [active, setActive] = useState<Slot | null>(null);

  useEffect(() => {
    if (state.status === "saved") onDone();
  }, [state, onDone]);

  /* La ropa que ofrece cada riel, calculada una vez: con veinte prendas y
     seis rieles, reordenar en cada tecla es trabajo para nada. */
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

  const wornAt = (slot: Slot) => pieces.find((piece) => piece.slot === slot);

  /** Poner, cambiar o sacar la prenda de una ranura. */
  function wear(slot: Slot, id: string | null) {
    setPieces((current) => {
      const rest = current.filter((piece) => piece.slot !== slot);
      if (!id) return rest;

      /* Cambiar de camisa conserva dónde y de qué tamaño quedó la anterior:
         quien acomodó la suya no quiere volver a acomodarla por probarse
         otra. */
      const before = current.find((piece) => piece.slot === slot);
      const box = boxOf(slot);

      return [
        ...rest,
        {
          item_id: id,
          slot,
          x: before?.x ?? box.x,
          y: before?.y ?? box.y,
          scale: before?.scale ?? 1,
          rot: before?.rot ?? 0,
        },
      ];
    });
  }

  function move(slot: string, x: number, y: number) {
    setPieces((current) =>
      current.map((piece) => (piece.slot === slot ? { ...piece, x, y } : piece))
    );
  }

  function resize(slot: Slot, scale: number) {
    setPieces((current) =>
      current.map((piece) => (piece.slot === slot ? { ...piece, scale } : piece))
    );
  }

  /** Todo de vuelta a su lugar. Es lo que hace barato probar. */
  function tidy() {
    setPieces((current) =>
      current.map((piece) => {
        const box = boxOf(piece.slot);
        return { ...piece, x: box.x, y: box.y, scale: 1, rot: 0 };
      })
    );
  }

  const dressed = pieces.length;
  const chosen = active ? wornAt(active) : null;
  const askew = pieces.some((piece) => {
    const box = boxOf(piece.slot);
    return Math.abs(piece.x - box.x) > 1 || Math.abs(piece.y - box.y) > 1 || piece.scale !== 1;
  });

  return (
    <form action={action} className="flex flex-col gap-5">
      {outfit ? <input type="hidden" name="id" value={outfit.id} /> : null}
      <input type="hidden" name="pieces" value={JSON.stringify(pieces)} />

      <div className="flex flex-col gap-2">
        <OutfitFigure
          pieces={pieces}
          wardrobe={wardrobe}
          active={active}
          onPick={(slot) => setActive((now) => (now === slot ? null : (slot as Slot)))}
          onMove={move}
        />

        {/* El tamaño aparece al tocar una prenda y no antes: una barra fija
            debajo de la mesa sería un control para algo que casi nunca se
            cambia, ocupando lugar siempre. */}
        {chosen && active ? (
          <div className="r-size">
            <span className="r-eyebrow shrink-0">Tamaño</span>
            <input
              type="range"
              min={50}
              max={180}
              step={1}
              value={Math.round((chosen.scale || 1) * 100)}
              onChange={(event) => resize(active, Number(event.target.value) / 100)}
              aria-label="Tamaño de la prenda"
            />
            <button type="button" onClick={() => resize(active, 1)} className="r-hint shrink-0">
              normal
            </button>
          </div>
        ) : (
          <p className="r-hint text-center">
            {dressed > 0 ? "Arrastrá una prenda para moverla. Tocala para cambiarle el tamaño." : ""}
          </p>
        )}

        {askew ? (
          <button type="button" onClick={tidy} className="r-key self-center text-[0.8125rem]">
            Acomodar todo
          </button>
        ) : null}
      </div>

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

          const wornId = wornAt(slot.key)?.item_id;

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
                      {option.cutout ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={option.cutout} alt="" />
                      ) : (
                        <Cross className="size-5 opacity-30" />
                      )}
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
 * Un conjunto guardado, listo para la mesa.
 *
 * Los que se armaron antes vienen sin ranura o con coordenadas de otro
 * dibujo —el lienzo libre primero, el maniquí después—. En vez de borrarlos
 * para estrenar, se los acomoda: se les reparte una ranura libre y se los
 * manda a su lugar de la mesa. No va a quedar igual que como se guardó, pero
 * queda visible y editable, que es mejor que quedar intacto y no poder
 * tocarse.
 */
function settle(pieces: Piece[]): Piece[] {
  const taken = new Set<string>();

  return pieces.map((piece) => {
    let slot = slotOf(piece.slot)?.key;

    if (!slot || taken.has(slot)) {
      slot = SLOTS.find((candidate) => !taken.has(candidate.key))?.key;
    }

    if (!slot) return piece;
    taken.add(slot);

    /* Las coordenadas del maniquí eran del cuerpo, no de la mesa: cualquier
       conjunto guardado con ranura se vuelve a tender desde cero. */
    const box = boxOf(slot);
    return { item_id: piece.item_id, slot, x: box.x, y: box.y, scale: 1, rot: 0 };
  });
}
