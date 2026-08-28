import type { Metadata } from "next";
import { EntryRoute } from "../loader";

export const metadata: Metadata = {
  title: "Nuevo ingreso · My Pocket",
  description: "Registrá lo que entró, incluido el salario.",
};

export default function NewIncomePage() {
  return <EntryRoute kind="income" />;
}
