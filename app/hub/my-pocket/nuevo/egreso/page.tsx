import type { Metadata } from "next";
import { EntryRoute } from "../loader";

export const metadata: Metadata = {
  title: "Nuevo egreso · My Pocket",
  description: "Registrá en qué se te fue la plata.",
};

export default function NewExpensePage() {
  return <EntryRoute kind="expense" />;
}
