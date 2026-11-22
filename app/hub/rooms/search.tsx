"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Cross, Pin, Search as SearchIcon } from "@/components/icons";
import { NavLink } from "@/components/nav-link";
import {
  categoryOf,
  colorOf,
  conditionOf,
  search,
  type IndexEntry,
  type OwnCategory,
  type RoomNode,
} from "@/lib/rooms";
import { thumbsFor } from "./actions";
import { CategoryGlyph } from "./category-glyph";
import { itemPath, trailPath } from "./paths";

/** Cuántos resultados se dibujan. El mismo techo que trae `search`. */
const SHOWN = 48;

/**
 * El buscador.
 *
 * La promesa del módulo entera se juega acá: guardar dónde están las cosas
 * solo sirve si encontrarlas después cuesta menos que levantarse a revisar el
 * cajón. Por eso está en TODAS las pantallas —la portada, el cuarto, la
 * cómoda, la gaveta— y no solo en la primera: cuando uno está parado en el
 * armario, lo que quiere buscar está casi siempre ahí adentro, y tener que
 * salir hasta la portada para escribir una palabra es el camino largo a lo
 * que tenés en la mano.
 *
 * Y por eso filtra en el navegador: el inventario ya vino con la página, así
 * que "cable" se resuelve en la misma tecla, sin un viaje al servidor por
 * pulsación.
 *
 * Los resultados son una rejilla de fotos y no una lista de renglones. No es
 * estética: con dieciséis calzonetas guardadas, dieciséis renglones que dicen
 * "Calzoneta azul · Mi cuarto › Cómoda › Gaveta 2 · Buen estado" son
 * dieciséis veces la misma frase y hay que LEERLAS para elegir. La foto
 * cuadrada se reconoce sin leer —es la razón por la que uno la tomó— y las
 * fichas de arriba parten el montón por categoría, que es lo que hace
 * cualquier tienda con mil productos y la razón por la que funciona.
 */
export function Search({
  index,
  nodes,
  own,
  scope,
}: {
  index: IndexEntry[];
  nodes: RoomNode[];
  own?: OwnCategory[];
  /** Dónde está parada la persona. Sin esto, se busca en toda la casa. */
  scope?: { id: string; label: string };
}) {
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState<string | null>(null);

  /* Si hay dónde, se empieza buscando ahí: quien escribe "calzoneta" parado
     en la cómoda está preguntando por las de la cómoda. La casa entera está
     a un toque, y el vacío de acá adentro lo ofrece solo. */
  const [here, setHere] = useState(true);

  /**
   * Dónde está cada cosa, dicho corto.
   *
   * En una ficha de dos pulgadas no entra "Mi cuarto › Cómoda › Gaveta 2" y
   * cortado por el principio queda "...arto › Cómoda › Gaveta 2", que es
   * peor que no decir nada. Los dos últimos tramos son los que contestan la
   * pregunta —el mueble y el cajón—, y el camino entero vive a un toque, en
   * el alfiler.
   */
  const whereById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.path.slice(-2).join(" › ")])),
    [nodes]
  );

  /** Los nodos que cuelgan de donde estamos, incluido él mismo. */
  const inside = useMemo(() => {
    if (!scope) return null;
    return new Set(
      nodes.filter((node) => node.path_ids.includes(scope.id)).map((node) => node.id)
    );
  }, [nodes, scope]);

  const all = useMemo(() => search(index, nodes, query, own), [index, nodes, query, own]);
  const near = useMemo(
    () => (inside ? all.filter((hit) => inside.has(hit.nodeId)) : all),
    [all, inside]
  );

  const narrow = Boolean(scope) && here;
  const hits = narrow ? near : all;

  /**
   * Las fichas de categoría, con lo que hay de cada una.
   *
   * Salen de los resultados y no del catálogo: una tienda no te ofrece
   * filtrar por una categoría vacía, y acá sería peor —veintidós fichas para
   * una búsqueda de tres resultados—. Ordenadas por cantidad, que es el orden
   * en que sirven cuando lo que sobra es de un solo tipo.
   */
  const facets = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; hue: string; count: number }>();

    for (const hit of hits) {
      const tag = categoryOf(hit.item.category, own);
      const row = seen.get(tag.key);
      if (row) row.count += 1;
      else seen.set(tag.key, { key: tag.key, label: tag.label, hue: tag.hue, count: 1 });
    }

    return [...seen.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
  }, [hits, own]);

  const shown = useMemo(() => {
    const kept = pick ? hits.filter((hit) => categoryOf(hit.item.category, own).key === pick) : hits;
    return kept.slice(0, SHOWN);
  }, [hits, own, pick]);

  /* Las miniaturas no vienen en el índice —ver `thumbsFor`— así que se piden
     para lo que se está mostrando y se guardan. Lo ya pedido no se vuelve a
     pedir aunque la búsqueda lo traiga de nuevo. */
  const [thumbs, setThumbs] = useState<Record<string, string[]>>({});
  const askedRef = useRef(new Set<string>());

  const wanted = shown.map((hit) => hit.item.id).join(",");

  useEffect(() => {
    const ids = wanted ? wanted.split(",") : [];
    const missing = ids.filter((id) => !askedRef.current.has(id));
    if (missing.length === 0) return;

    let alive = true;

    /* La espera es para no pedir una tanda por letra: mientras se escribe
       "calzoneta" los resultados cambian nueve veces y las fotos de las ocho
       primeras no las va a ver nadie. */
    const timer = setTimeout(() => {
      for (const id of missing) askedRef.current.add(id);

      void thumbsFor(missing)
        .then((found) => {
          if (alive && Object.keys(found).length > 0) {
            setThumbs((now) => ({ ...now, ...found }));
          }
        })
        .catch(() => {});
    }, 180);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [wanted]);

  /* Si el campo está pegado arriba.
     No hay forma de saberlo en CSS, así que se mira con un testigo de un
     píxel puesto justo encima: cuando ese píxel sale de la pantalla, el
     campo está pegado. Importa para una sola cosa —el fondo— y por eso no
     se pinta siempre: en reposo, una banda difuminada sobre el papel es una
     banda sobre el papel, una mancha donde no pasa nada. */
  const [stuck, setStuck] = useState(false);
  const markRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const mark = markRef.current;
    if (!mark || typeof IntersectionObserver === "undefined") return;

    const eye = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting));
    eye.observe(mark);
    return () => eye.disconnect();
  }, []);

  const typing = query.trim().length > 0;
  const short = typing && query.trim().length < 2;

  /* El vacío de acá adentro que sí existe en la casa. Es el único caso en que
     el buscador tiene algo mejor que decir que "nada se llama así". */
  const elsewhere = narrow && near.length === 0 ? all.length : 0;

  return (
    <section className="flex flex-col gap-3">
      <span ref={markRef} aria-hidden="true" className="r-stick-mark" />

      {/* El campo se queda arriba mientras se rueda. Con una rejilla de
          cuarenta fichas, buscar otra cosa era subir hasta el principio —y
          el buscador es justamente lo que se usa dos veces seguidas: se
          escribe, se mira, se corrige. */}
      <div className="r-stick" data-stuck={stuck}>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-[var(--r-ink-3)]" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              /* La ficha elegida no sobrevive a otra búsqueda: filtrar por
                 "Calzado" lo que ya no tiene calzado deja la pantalla vacía
                 sin decir por qué. */
              setPick(null);
            }}
            placeholder={
              scope ? `Buscar en ${scope.label}…` : "Buscar un cable, una sudadera, un clip…"
            }
            aria-label={scope ? `Buscar en ${scope.label}` : "Buscar en todo el inventario"}
            autoComplete="off"
            className="r-field pr-12 pl-11"
          />
          {typing ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPick(null);
              }}
              aria-label="Borrar la búsqueda"
              className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-[var(--r-ink-3)] active:scale-90"
            >
              <Cross className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Mientras no se escriba nada, acá no hay nada: la pantalla sigue
          siendo la de los cuartos. El buscador no se adueña de la portada. */}
      {!typing ? null : short ? (
        <p className="px-1 text-[0.8125rem] text-[var(--r-ink-3)]">Escribí un poco más.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 px-1">
            <p className="r-eyebrow min-w-0 flex-1">
              {hits.length === 0
                ? "Sin resultados"
                : hits.length === 1
                  ? "1 resultado"
                  : `${hits.length} resultados`}
            </p>

            {/* Dónde se busca. Dos botones pegados y no un desplegable: son
                dos, se alternan todo el tiempo y el estado tiene que verse
                sin abrir nada. */}
            {scope ? (
              <div className="r-where">
                {/* Cambiar de dónde también suelta la ficha: una categoría
                    que existía acá adentro puede no existir en la casa, y la
                    rejilla quedaría vacía sin decir por qué. */}
                <button
                  type="button"
                  data-on={here}
                  onClick={() => {
                    setHere(true);
                    setPick(null);
                  }}
                >
                  Acá
                </button>
                <button
                  type="button"
                  data-on={!here}
                  onClick={() => {
                    setHere(false);
                    setPick(null);
                  }}
                >
                  Toda la casa
                </button>
              </div>
            ) : null}
          </div>

          {facets.length > 1 ? (
            <div className="r-facets">
              <button
                type="button"
                className="r-chip"
                data-on={pick === null}
                onClick={() => setPick(null)}
              >
                Todo
                <span className="r-facet-n">{hits.length}</span>
              </button>

              {facets.map((facet) => (
                <button
                  key={facet.key}
                  type="button"
                  className="r-chip"
                  data-on={pick === facet.key}
                  style={{ "--tone": facet.hue } as CSSProperties}
                  onClick={() => setPick(pick === facet.key ? null : facet.key)}
                >
                  {facet.label}
                  <span className="r-facet-n">{facet.count}</span>
                </button>
              ))}
            </div>
          ) : null}

          {shown.length === 0 ? (
            /* El vacío con salida. Decir "en la casa hay tres" y dejar que la
               persona busque el botón es media respuesta: el botón es la
               respuesta. */
            <div className="r-empty">
              {elsewhere > 0 ? (
                <>
                  <p>Acá adentro no hay nada que se llame así.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setHere(false);
                      setPick(null);
                    }}
                    className="r-key mt-1"
                  >
                    {elsewhere === 1
                      ? "Hay 1 en toda la casa"
                      : `Hay ${elsewhere} en toda la casa`}
                  </button>
                </>
              ) : (
                <p>
                  Nada se llama así. Puede que esté guardado con otro nombre, o que todavía
                  no lo hayas anotado.
                </p>
              )}
            </div>
          ) : (
            <ul className="r-grid">
              {shown.map((hit) => {
                const tag = categoryOf(hit.item.category, own);
                const state = conditionOf(hit.item.condition);
                const tint = colorOf(hit.item.color);
                const shots = thumbs[hit.item.id] ?? [];

                return (
                  <li
                    key={hit.item.id}
                    className="r-hit"
                    style={{ "--tone": tag.hue } as CSSProperties}
                  >
                    {/* La ficha abre LA COSA, no el cajón donde está. Abrir
                        el cajón era la respuesta a "¿dónde está?", pero quien
                        buscó "pantalón" y ve el pantalón en pantalla lo que
                        quiere es tocarlo: el camino hasta él ya está en el
                        alfiler de al lado. */}
                    <NavLink
                      href={itemPath(hit.nodeId, hit.item.id)}
                      className="r-hit-link"
                    >
                      {/* Las dos puntas del cable se dibujan juntas: un cable
                          se reconoce por el par, no por un extremo. */}
                      <span
                        className="r-hit-shot"
                        data-pair={shots.length > 1 ? "true" : undefined}
                      >
                        {shots.length > 0 ? (
                          shots.map((shot, index) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={index} src={shot} alt="" />
                          ))
                        ) : (
                          <CategoryGlyph
                            category={tag.glyph ?? tag.key}
                            className="size-[1.75rem]"
                          />
                        )}

                        {hit.item.quantity > 1 ? (
                          <span className="r-hit-many">×{hit.item.quantity}</span>
                        ) : null}
                      </span>

                      <span className="r-hit-name">{hit.item.name}</span>

                      {/* La ruta es el resultado. El nombre de la cosa no
                          sirve de nada sin el "Cómoda › Gaveta 2" debajo:
                          eso es lo que se va a leer. El punto de color va en
                          el mismo renglón porque es del mismo tamaño que un
                          dato: distingue dos camisetas, no las nombra. */}
                      <span className="r-hit-where">
                        {tint ? (
                          <span
                            className="r-tint"
                            style={{ background: tint.hex }}
                            title={tint.label}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="r-crumb">{whereById.get(hit.nodeId) ?? hit.where}</span>
                      </span>

                      {/* El estado solo cuando NO es el de siempre. Repetido
                          en cada ficha, "Buen estado" es una palabra que
                          nadie lee y que le quita lugar a la que sí. */}
                      {state.key !== "good" ? (
                        <span className="r-state text-[0.6875rem]" data-tone={state.tone}>
                          {state.label}
                        </span>
                      ) : null}
                    </NavLink>

                    {/* El atajo que justifica todo el módulo: no ir hasta la
                        cosa, sino poder MOSTRAR el camino. Hermano del enlace
                        y no hijo: un enlace dentro de otro no existe en HTML
                        y en el teléfono es una lotería de cuál se activa. */}
                    <NavLink
                      href={trailPath(hit.item.id)}
                      className="r-hit-pin"
                      aria-label={`Cómo llegar a ${hit.item.name}`}
                    >
                      <Pin className="size-[0.9375rem]" />
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
