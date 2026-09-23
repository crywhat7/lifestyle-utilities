import type { NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { currentUser } from "@/lib/auth";
import { loadChanges, loadEvents, readFilters } from "../data";

export const dynamic = "force-dynamic";

/** Hasta dónde llega una exportación. Para más, se acota por fecha. */
const EXPORT_LIMIT = 5_000;

/**
 * El registro filtrado, en un JSON para guardar o revisar afuera.
 * Mismos filtros que la pantalla, y la misma puerta: solo el administrador.
 */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user || !isAdmin(user.email)) {
    return Response.json({ error: "Solo para quien administra." }, { status: 403 });
  }

  const filters = readFilters(Object.fromEntries(request.nextUrl.searchParams));
  const result =
    filters.tab === "cambios" ? await loadChanges(filters, EXPORT_LIMIT) : await loadEvents(filters, EXPORT_LIMIT);

  if (result.error) return Response.json({ error: result.error }, { status: 500 });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new Response(JSON.stringify({ exported_at: new Date().toISOString(), filters, rows: result.rows }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="registro-${filters.tab}-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
