import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KIND_LABEL, allowedChildren, branchTone, isNodeKind } from "@/lib/rooms";
import { loadTree, nodePath, roomsClient } from "../../data";
import { FormShell } from "../../form-shell";
import { NodeScreen } from "../../screens";

export const metadata: Metadata = { title: "Agregar" };

/**
 * Crear un mueble, una gaveta o una caja dentro de este contenedor.
 *
 * El tipo viaja en la dirección (`?tipo=furniture`) y se valida contra la
 * jerarquía ANTES de dibujar nada: entrar a mano pidiendo un armario dentro
 * de una gaveta tiene que terminar en 404, no en un formulario que la base
 * va a rechazar al guardar.
 */
export default async function AddPage({
  params,
  searchParams,
}: PageProps<"/hub/rooms/[nodeId]/agregar">) {
  const { nodeId } = await params;
  const { tipo } = await searchParams;

  const { supabase, user } = await roomsClient();
  const tree = await loadTree(supabase, user.id);

  const parent = tree.nodes.find((node) => node.id === nodeId);
  if (!parent) notFound();

  const kind = Array.isArray(tipo) ? tipo[0] : tipo;
  if (!isNodeKind(kind) || !allowedChildren(parent.kind, parent.depth).includes(kind)) {
    notFound();
  }

  return (
    <FormShell
      back={nodePath(parent.id)}
      backLabel={parent.name}
      eyebrow={KIND_LABEL[kind].add}
      title={`En ${parent.name}`}
      tone={branchTone(parent, tree.nodes)}
    >
      <NodeScreen kind={kind} parentId={parent.id} back={nodePath(parent.id)} />
    </FormShell>
  );
}
