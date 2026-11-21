import { KIND_LABEL, categoryOf, conditionOf, pathLabel, variantLabel } from "@/lib/rooms";
import { trailPdf, type TrailStep } from "@/lib/rooms-pdf";
import { loadIndex, loadOwnCategories, loadTree, roomsClient } from "../../../data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * La ruta hasta una cosa, en PDF.
 *
 * Existe porque la pantalla de la ruta solo se puede mandar a quien tenga
 * cuenta acá, y la persona a la que uno le explica dónde está algo —alguien
 * en la casa, alguien que viene a buscarlo mientras no estás— nunca la tiene.
 * Un PDF se manda por donde sea y se abre en cualquier teléfono.
 *
 * Las fotos se bajan del bucket privado en el servidor, con los enlaces que
 * `loadTree` ya firmó. Son tres o cuatro por ruta y solo cuando alguien pide
 * el papel: no vale la pena cachearlas, y una que falle sale como un hueco
 * gris en vez de tumbar la exportación.
 */
export async function GET(_request: Request, { params }: RouteContext<"/hub/rooms/ruta/[itemId]/pdf">) {
  const { itemId } = await params;
  const { supabase, user } = await roomsClient();

  const [tree, index, own] = await Promise.all([
    loadTree(supabase, user.id),
    loadIndex(supabase, user.id),
    loadOwnCategories(supabase, user.id),
  ]);

  const item = index.find((candidate) => candidate.id === itemId);
  if (!item) return new Response("No existe esa cosa.", { status: 404 });

  const node = tree.nodes.find((candidate) => candidate.id === item.node_id);
  const chain = node
    ? node.path_ids
        .map((id) => tree.nodes.find((candidate) => candidate.id === id))
        .filter((step): step is NonNullable<typeof step> => Boolean(step))
    : [];

  const steps: TrailStep[] = await Promise.all(
    chain.map(async (step) => ({
      name: step.name,
      detail: variantLabel(step.kind, step.variant) ?? KIND_LABEL[step.kind].one,
      photo: await fetchPhoto(step.photo),
    }))
  );

  const detail = [
    categoryOf(item.category, own).label,
    conditionOf(item.condition).label,
    item.quantity > 1 ? `${item.quantity} unidades` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const bytes = await trailPdf({
    item: item.name,
    detail,
    place: node ? pathLabel(node.path) : "Sin lugar",
    steps,
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slug(item.name)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

/** La foto de un paso, o nada. Nada es un hueco gris, no un error. */
async function fetchPhoto(url: string | null | undefined) {
  if (!url) return null;

  try {
    const answer = await fetch(url);
    if (!answer.ok) return null;
    return new Uint8Array(await answer.arrayBuffer());
  } catch {
    return null;
  }
}

/** Un nombre de archivo que sobreviva a cualquier sistema. */
function slug(name: string) {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return clean ? `donde-esta-${clean}` : "donde-esta";
}
