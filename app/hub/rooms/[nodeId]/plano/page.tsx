import { redirect } from "next/navigation";
import { nodePath } from "../../paths";

/**
 * El plano dejó de tener pantalla propia.
 *
 * Ahora es lo primero que se ve al entrar a una habitación, que es donde
 * tenía que estar desde el principio: entrar a un cuarto es ver el cuarto.
 * Esta ruta se queda como redirección para que no se rompa ningún enlace
 * guardado ni el botón de atrás de quien la tenía abierta.
 */
export default async function PlanPage({ params }: PageProps<"/hub/rooms/[nodeId]/plano">) {
  const { nodeId } = await params;

  redirect(nodePath(nodeId));
}
