"use client";

import { CategoryIcon } from "@/components/category-icons";
import { Spark } from "@/components/icons";
import type { PocketCategory } from "@/lib/pocket";

type Props = {
  categories: PocketCategory[];
  value: string;
  onChange: (id: string) => void;
  /** El primer casillero deja la decisión en manos de la IA. */
  allowAuto?: boolean;
};

/**
 * Nunca un dropdown: los iconos se reconocen de un vistazo y el pulgar llega
 * a cualquiera sin abrir nada. Las personales van marcadas para que se note
 * cuáles son de todos y cuáles son tuyas.
 */
export function CategoryGrid({
  categories,
  value,
  onChange,
  allowAuto = false,
}: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {allowAuto ? (
        <button
          type="button"
          onClick={() => onChange("")}
          data-active={value === "" ? "true" : "false"}
          className="tile"
          aria-pressed={value === ""}
        >
          <Spark className="size-[1.375rem]" />
          <span className="tile-label">IA decide</span>
        </button>
      ) : null}

      {categories.map((category) => {
        const active = value === category.id;

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onChange(category.id)}
            data-active={active ? "true" : "false"}
            className="tile relative"
            aria-pressed={active}
          >
            {category.user_id ? (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 size-1.5 rounded-full"
                style={{
                  background: active ? "rgba(10,13,5,.45)" : "var(--accent)",
                }}
              />
            ) : null}
            <CategoryIcon iconKey={category.icon_key} className="size-[1.375rem]" />
            <span className="tile-label">{category.name}</span>
          </button>
        );
      })}
    </div>
  );
}
