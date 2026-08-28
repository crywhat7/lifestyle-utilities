import type { Metadata } from "next";
import { EntryRoute } from "../loader";

export const metadata: Metadata = {
  title: "Nuevo egreso · My Pocket",
  description: "Registrá en qué se te fue la plata.",
};

export default async function NewExpensePage({
  searchParams,
}: PageProps<"/hub/my-pocket/nuevo/egreso">) {
  // ?fijo=<id> llega desde la agenda de fijos del balance: abre el registro
  // con esa plantilla ya elegida, para que sea un solo toque y confirmar.
  const { fijo } = await searchParams;

  return (
    <EntryRoute kind="expense" preselect={typeof fijo === "string" ? fijo : null} />
  );
}
