import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ANONYMOUS,
  encodeIdentity,
  IDENTITY_HEADER,
  type SessionUser,
} from "@/lib/identity";

const PROTECTED_PREFIXES = ["/hub"];

export async function proxy(request: NextRequest) {
  const cookiesToSet: { name: string; value: string; options?: object }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(updates) {
          updates.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            cookiesToSet.push({ name, value, options });
          });
        },
      },
    }
  );

  /*
    `getClaims` verifica el JWT con WebCrypto en el propio proceso cuando el
    proyecto firma con llave asimétrica —cero red— y refresca la sesión solo
    si está por vencer. `getUser`, en cambio, salía a preguntarle al servidor
    de Auth en cada navegación, incluidas las de prefetch.
  */
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const user: SessionUser | null = claims?.sub
    ? {
        id: String(claims.sub),
        email: typeof claims.email === "string" ? claims.email : null,
        name: nameFromMetadata(claims.user_metadata),
      }
    : null;

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!user && isProtected) return redirectTo(request, cookiesToSet, "/");
  if (user && pathname === "/") return redirectTo(request, cookiesToSet, "/hub");

  /*
    Se copian las cabeceras recién ahora: si Supabase refrescó el token,
    `request.cookies.set` ya reescribió la cookie y la página la ve.

    La de identidad la escribe solo este archivo, y `set` pisa cualquier valor
    que haya llegado del navegador: nadie puede hacerse pasar por otro
    mandándola desde afuera. Y aunque colara una, las consultas siguen
    saliendo con el JWT de la sesión y RLS no devolvería filas ajenas.
  */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    IDENTITY_HEADER,
    user ? encodeIdentity(user) : ANONYMOUS
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}

function nameFromMetadata(metadata: unknown) {
  if (typeof metadata !== "object" || metadata === null) return null;
  const bag = metadata as Record<string, unknown>;
  const name = bag.full_name ?? bag.name;
  return typeof name === "string" ? name : null;
}

/** Redirige sin perder las cookies de sesión que acaba de escribir Supabase. */
function redirectTo(
  request: NextRequest,
  cookiesToSet: { name: string; value: string; options?: object }[],
  destination: string
) {
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = "";

  const redirect = NextResponse.redirect(url);
  cookiesToSet.forEach(({ name, value, options }) => {
    redirect.cookies.set(name, value, options);
  });
  return redirect;
}

export const config = {
  matcher: [
    /*
     * Todo excepto estáticos, imágenes optimizadas, assets públicos, las
     * rutas de SEO (robots, sitemap, manifest e imágenes de metadatos), el
     * service worker y los trabajos de cron: son públicas por definición o se
     * autentican solas, y ninguna necesita resolver una sesión de navegador.
     *
     * `sw.js` va en la lista por una razón extra: el navegador lo vuelve a
     * pedir cada pocas horas para ver si cambió, y esa petición no debería
     * despertar a Supabase ni arriesgarse a que le reescriban cookies.
     */
    "/((?!api/cron|_next/static|_next/image|favicon.ico|sw.js|robots.txt|sitemap.xml|manifest.webmanifest|opengraph-image|twitter-image|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
