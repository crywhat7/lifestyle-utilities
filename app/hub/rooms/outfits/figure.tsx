import type { CSSProperties } from "react";
import { type Garment, type Piece, type Slot } from "@/lib/rooms";

/**
 * El conjunto, tendido.
 *
 * Antes esto era un maniquí: un cuerpo dibujado con una línea y seis zonas
 * donde caían las prendas. La idea era dar escala —que se entendiera que el
 * pantalón va donde van las piernas— y el resultado era un muñeco de palitos
 * con ropa encima. Nadie arma un conjunto para ver un muñeco.
 *
 * Así se arman de verdad, y así los muestran todas las apps que hacen esto
 * bien: las prendas tendidas sobre una superficie, como cuando uno las pone
 * sobre la cama antes de vestirse. La camisa grande, el pantalón debajo, y
 * los zapatos y el accesorio en una columna al costado. Sin cuerpo, sin
 * contornos, sin nada que no sea la ropa.
 *
 * Es una REJILLA y no posiciones absolutas, y esa es la decisión que lo hace
 * funcionar: lo que no está puesto no deja un hueco, los demás se reparten el
 * lugar que sobra, y un conjunto de dos prendas se ve tan terminado como uno
 * de cinco. Con coordenadas fijas, quitarse el abrigo dejaba un agujero
 * rectangular en el aire.
 *
 * El mismo dibujo en el armador y en la miniatura de la lista: si un conjunto
 * se viera distinto en los dos lados, el armador no serviría para decidir
 * nada.
 */

/** La columna ancha: lo que ocupa el cuerpo. */
const MAIN: Slot[] = ["top", "outer"];
const UNDER: Slot[] = ["bottom"];
/** La columna angosta: lo que se suma. */
const SIDE: Slot[] = ["accessory", "socks", "shoes"];

export function OutfitFigure({
  pieces,
  wardrobe,
  active,
  onPick,
}: {
  pieces: Piece[];
  wardrobe: Garment[];
  /** La ranura que se está cambiando: se marca para saber dónde mirar. */
  active?: string | null;
  onPick?: (slot: string) => void;
}) {
  const byId = new Map(wardrobe.map((garment) => [garment.id, garment]));

  /* Lo que de verdad se puede dibujar. Una prenda sin recorte no entra: el
     fondo del cuarto detrás de la camisa arruina el conjunto entero, que es
     justamente lo que `loadWardrobe` filtra antes de llegar acá. */
  const worn = new Map<string, Garment>();

  for (const piece of pieces) {
    const garment = byId.get(piece.item_id);
    if (!garment?.cutout) continue;
    worn.set(piece.slot ?? loose(worn), garment);
  }

  const top = MAIN.filter((slot) => worn.has(slot));
  const under = UNDER.filter((slot) => worn.has(slot));
  const side = SIDE.filter((slot) => worn.has(slot));

  function cell(slot: string) {
    const garment = worn.get(slot);
    if (!garment) return null;

    const Box = onPick ? "button" : "span";

    return (
      <Box
        key={slot}
        {...(onPick
          ? { type: "button" as const, onClick: () => onPick(slot), "aria-label": garment.name }
          : {})}
        className="r-piece"
        data-on={active === slot}
        title={garment.name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={garment.cutout ?? ""} alt="" draggable={false} />
      </Box>
    );
  }

  return (
    <div className="r-lay" data-side={side.length > 0 ? "true" : undefined}>
      <div className="r-lay-main">
        {top.length > 0 ? <div className="r-lay-row">{top.map(cell)}</div> : null}
        {under.length > 0 ? <div className="r-lay-row">{under.map(cell)}</div> : null}
      </div>

      {side.length > 0 ? <div className="r-lay-side">{side.map(cell)}</div> : null}

      {worn.size === 0 ? (
        <p className="r-lay-empty" style={{ gridColumn: "1 / -1" } as CSSProperties}>
          Elegí abajo y se va armando acá.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Dónde cae una prenda de un conjunto viejo, de cuando no había ranuras.
 *
 * Se van llenando los lugares libres en orden. No va a quedar perfecto —el
 * lienzo de entonces nunca supo qué era una camisa— pero queda visible y
 * editable, que es mejor que quedar intacto y no poder tocarse.
 */
function loose(worn: Map<string, Garment>) {
  return [...MAIN, ...UNDER, ...SIDE].find((slot) => !worn.has(slot)) ?? "top";
}
