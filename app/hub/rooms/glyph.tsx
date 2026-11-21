import type { CSSProperties } from "react";
import { Box, Drawer, Grid, Slate, Wardrobe } from "@/components/icons";
import { CategoryGlyph } from "./category-glyph";
import { categoryOf, type NodeKind, type OwnCategory } from "@/lib/rooms";

/**
 * El cuadrado de color con el glifo adentro.
 *
 * Es la pieza que hace legible una pantalla con cuarenta filas: el color sale
 * del dato —el de la habitación, el de la categoría del objeto— y entra como
 * `--tone`, que es de donde la hoja de estilos saca el relleno y la tinta. Un
 * cable azul y una camisa rosa se distinguen antes de leer la palabra.
 */
export function Glyph({
  tone,
  size = "md",
  children,
}: {
  tone: string;
  size?: "sm" | "md";
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className="r-glyph"
      data-size={size === "sm" ? "sm" : undefined}
      style={{ "--tone": tone } as CSSProperties}
    >
      {children}
    </span>
  );
}

/**
 * Qué glifo le toca a un contenedor.
 *
 * Deliberadamente grueso: cinco dibujos para veinticinco tipos. Un icono por
 * variante sería un set de iconos que nadie aprende, y lo que la fila
 * necesita distinguir de un barrido es "esto es un mueble" de "esto es una
 * caja" — el tipo exacto ya está escrito debajo del nombre.
 */
export function NodeGlyph({ kind, variant }: { kind: NodeKind; variant: string | null }) {
  const size = "size-[1.375rem]";

  if (kind === "room") return <Grid className={size} />;
  if (kind === "container") return <Box className={size} />;

  if (kind === "compartment") {
    if (variant === "shelf" || variant === "cubby") return <Grid className={size} />;
    return <Drawer className={size} />;
  }

  if (variant === "dresser") return <Drawer className={size} />;
  if (variant === "shelf") return <Grid className={size} />;
  if (variant === "trunk") return <Box className={size} />;
  if (variant === "desk" || variant === "table" || variant === "bed" || variant === "nightstand") {
    return <Slate className={size} />;
  }

  return <Wardrobe className={size} />;
}

/**
 * El glifo de una cosa: el dibujo de su categoría, teñido con su color.
 *
 * Antes eran todas la misma etiqueta y el color hacía todo el trabajo. Con
 * veintidós categorías el color solo alcanza para agrupar, no para nombrar:
 * en una lista de cuarenta filas, dos azules parecidos se confunden y el
 * dibujo no.
 */
export function ItemGlyph({ category, own }: { category: string; own?: OwnCategory[] }) {
  const found = categoryOf(category, own);

  return (
    <Glyph tone={found.hue} size="sm">
      <CategoryGlyph category={found.glyph ?? found.key} className="size-[1.0625rem]" />
    </Glyph>
  );
}
