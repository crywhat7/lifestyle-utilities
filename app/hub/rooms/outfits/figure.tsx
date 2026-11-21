import type { CSSProperties } from "react";
import { SLOTS, type Garment, type Piece } from "@/lib/rooms";

/**
 * El maniquí: el conjunto dibujado sobre un cuerpo.
 *
 * Es el mismo dibujo en las dos pantallas donde aparece —el armador y la
 * miniatura de la lista— y por eso vive acá y no dentro de ninguna de las
 * dos: si el abrigo se pisara distinto en la lista que en el armador, el
 * armador no serviría para decidir nada.
 *
 * Cada prenda se coloca en la zona de su ranura con `contain`, así que un
 * recorte alto y uno ancho ocupan el mismo lugar del cuerpo sin deformarse.
 * Las zonas se superponen y el orden lo decide `z`: la camisa debajo del
 * abrigo, la calceta debajo del zapato. Ese orden es la única cosa que un
 * collage de recortes arrastrados a mano no podía garantizar.
 *
 * Los conjuntos armados antes del maniquí no traen ranura y se siguen
 * dibujando por coordenadas: borrarlos para estrenar un dibujo nuevo sería
 * cobrarle a la persona el cambio de idea del programa.
 */
export function OutfitFigure({
  pieces,
  wardrobe,
  active,
  onPick,
}: {
  pieces: Piece[];
  wardrobe: Garment[];
  /** La ranura que se está editando: se marca para saber dónde mirar. */
  active?: string | null;
  onPick?: (slot: string) => void;
}) {
  const byId = new Map(wardrobe.map((garment) => [garment.id, garment]));
  const placed = new Map(
    pieces.filter((piece) => piece.slot).map((piece) => [piece.slot as string, piece])
  );
  const loose = pieces.filter((piece) => !piece.slot);

  return (
    <div className="r-figure">
      <Mannequin />

      {SLOTS.map((slot) => {
        const piece = placed.get(slot.key);
        const garment = piece ? byId.get(piece.item_id) : null;
        const live = Boolean(garment?.cutout);

        /* Las zonas vacías no se dibujan en la miniatura: una lista de
           conjuntos no necesita saber qué ranura quedó libre. Solo en el
           armador, y solo como un marco finito que dice "acá va algo". */
        if (!live && !onPick) return null;

        const Zone = onPick ? "button" : "span";

        return (
          <Zone
            key={slot.key}
            {...(onPick
              ? { type: "button" as const, onClick: () => onPick(slot.key), "aria-label": slot.label }
              : {})}
            className="r-zone"
            data-on={active === slot.key}
            data-empty={!live}
            style={
              {
                top: `${slot.top}%`,
                height: `${slot.height}%`,
                width: `${slot.width}%`,
                zIndex: slot.z,
              } as CSSProperties
            }
          >
            {garment?.cutout ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={garment.cutout} alt="" draggable={false} />
            ) : null}
          </Zone>
        );
      })}

      {loose.map((piece, index) => {
        const garment = byId.get(piece.item_id);
        if (!garment?.cutout) return null;

        return (
          <span
            key={`${piece.item_id}-${index}`}
            className="r-loose"
            style={{
              left: `${piece.x}%`,
              top: `${piece.y}%`,
              transform: `translate(-50%, -50%) scale(${piece.scale}) rotate(${piece.rot}deg)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={garment.cutout} alt="" draggable={false} />
          </span>
        );
      })}
    </div>
  );
}

/**
 * El cuerpo de referencia.
 *
 * Una línea y nada más: sin él, seis zonas vacías son seis rectángulos
 * flotando: con él, son un cuerpo al que le falta ropa. No pretende ser una
 * persona —no tiene cara, ni género, ni proporciones de maniquí de vidriera—
 * solo da la escala para entender que el pantalón va donde van las piernas.
 */
function Mannequin() {
  return (
    <svg className="r-mannequin" viewBox="0 0 120 180" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M60 8a11 11 0 010 22 11 11 0 010-22" />
        <path d="M53 31h14" />
        <path d="M40 42q20-6 40 0l4 12-7 5-2 39H45l-2-39-7-5z" />
        <path d="M40 44 26 60l-5 26 7 3M80 44l14 16 5 26-7 3" />
        <path d="M45 98q6 36 4 66M75 98q-6 36-4 66" />
        <path d="M43 164h14q3 6-2 8H41zM77 164H63q-3 6 2 8h14z" />
      </g>
    </svg>
  );
}
