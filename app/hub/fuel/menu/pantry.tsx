"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { Check, Cross, PlusSlot, Spark } from "@/components/icons";
import { CUSTOM_PREFIX, PANTRY } from "@/lib/fuel";
import { generateMenu, type MenuState } from "../actions";

const IDLE: MenuState = { status: "idle" };

/**
 * La despensa: lo que tenés o podés comprar.
 *
 * Cada ingrediente es un checkbox real con `name="pantry"`, así que el
 * formulario viaja entero sin que React tenga que armar nada: la selección
 * es el formulario. Lo que no está en el catálogo se escribe abajo y entra
 * como una pastilla más.
 */
export function Pantry({
  selected,
  hasMenu,
  delay = 0,
}: {
  selected: string[];
  hasMenu: boolean;
  delay?: number;
}) {
  const [state, action, pending] = useActionState(generateMenu, IDLE);
  const [picked, setPicked] = useState(() => new Set(selected));
  const [custom, setCustom] = useState(() => selected.filter((key) => key.startsWith(CUSTOM_PREFIX)));
  const [draft, setDraft] = useState("");

  function toggle(key: string, on: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function addCustom() {
    const label = draft.replace(/\s+/g, " ").trim().slice(0, 40);
    if (label.length < 2) return;
    const key = `${CUSTOM_PREFIX}${label}`;
    setCustom((current) => (current.includes(key) ? current : [...current, key]));
    toggle(key, true);
    setDraft("");
  }

  const count = picked.size;

  return (
    <form action={action} className="flex flex-col gap-7 pb-24">
      {PANTRY.map((group, index) => {
        const all = group.items.every((item) => picked.has(item.key));
        return (
          <fieldset
            key={group.key}
            className="kindle flex flex-col gap-3"
            style={{ "--d": `${delay + index * 60}ms` } as CSSProperties}
          >
            <div className="flex items-baseline justify-between">
              <legend className="e-display text-[1.375rem]">{group.name}</legend>
              <button
                type="button"
                onClick={() => group.items.forEach((item) => toggle(item.key, !all))}
                className="text-[0.75rem] text-[var(--e-ink-3)] underline decoration-[var(--e-hair-2)] underline-offset-4"
              >
                {all ? "Ninguno" : "Todos"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <label key={item.key} className="e-opt h-10 px-3.5 text-[0.8125rem]">
                  <input
                    type="checkbox"
                    name="pantry"
                    value={item.key}
                    checked={picked.has(item.key)}
                    onChange={(event) => toggle(item.key, event.target.checked)}
                  />
                  {picked.has(item.key) ? <Check className="size-3" /> : null}
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      <fieldset
        className="kindle flex flex-col gap-3"
        style={{ "--d": `${delay + PANTRY.length * 60}ms` } as CSSProperties}
      >
        <legend className="e-display mb-3 text-[1.375rem]">Algo más</legend>
        {custom.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {custom.map((key) => (
              <label key={key} className="e-opt h-10 pr-2 pl-3.5 text-[0.8125rem]">
                <input
                  type="checkbox"
                  name="pantry"
                  value={key}
                  checked={picked.has(key)}
                  onChange={(event) => toggle(key, event.target.checked)}
                />
                {key.slice(CUSTOM_PREFIX.length)}
                <button
                  type="button"
                  aria-label={`Quitar ${key.slice(CUSTOM_PREFIX.length)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    toggle(key, false);
                    setCustom((current) => current.filter((value) => value !== key));
                  }}
                  className="grid size-6 place-items-center rounded-full text-[var(--e-ink-3)]"
                >
                  <Cross className="size-2.5" />
                </button>
              </label>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
            }}
            placeholder="Chimichurri, tofu, pan pita…"
            className="e-field"
          />
          <button
            type="button"
            onClick={addCustom}
            aria-label="Agregar ingrediente"
            className="e-key grid size-[3.25rem] shrink-0 place-items-center"
          >
            <PlusSlot className="size-4" />
          </button>
        </div>
      </fieldset>

      {/*
        La barra fija de abajo: el conteo y el botón siempre a mano, por más
        abajo que haya quedado la lista. Lo que tarda la IA se cuenta ahí
        mismo, sin tapar la pantalla.
      */}
      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-[30rem] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] [background:linear-gradient(transparent,var(--e-ground)_35%)]">
        {state.status === "error" ? (
          <p role="alert" className="mb-2 text-center text-[0.8125rem] text-[var(--e-over-ink)]">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || count < 5}
          className="e-key e-key-lit flex h-14 w-full items-center justify-center gap-2 text-[0.9375rem] font-medium"
        >
          <Spark className="size-4" />
          {pending
            ? "Cocinando 25 platos…"
            : count < 5
              ? `Elegí al menos 5 (${count})`
              : `${hasMenu ? "Rehacer" : "Armar"} menú con ${count}`}
        </button>
      </div>
    </form>
  );
}
