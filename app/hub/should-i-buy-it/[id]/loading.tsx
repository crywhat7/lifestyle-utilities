import { Dial } from "../dial";

export default function Loading() {
  return (
    <main className="flex flex-1 items-center justify-center px-5">
      <Dial
        label="Sacando cuentas"
        hint="Convirtiendo el precio en horas de tu vida."
      />
    </main>
  );
}
