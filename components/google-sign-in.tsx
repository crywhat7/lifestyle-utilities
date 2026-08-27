"use client";

import { useState } from "react";
import { GoogleMark } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="key key-accent flex h-16 w-full items-center justify-center gap-3 px-6 text-[1.0625rem] font-semibold tracking-[-0.01em] disabled:cursor-progress"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.35),inset_0_-1px_0_rgba(0,0,0,.12)]">
          <GoogleMark className="size-[1.125rem]" />
        </span>
        <span className={pending ? "opacity-70" : undefined}>
          {pending ? "Abriendo Google…" : "Continuar con Google"}
        </span>
      </button>

      {failed ? (
        <p role="alert" className="mt-4 text-center text-[0.8125rem] text-[#ff9a7a]">
          No se pudo abrir Google. Revisá tu conexión y probá otra vez.
        </p>
      ) : null}
    </>
  );
}
