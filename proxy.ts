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

  /*
    La otra mitad del mismo bug: "no pude verificarte" no es "no sos nadie".

    El router dispara varios prefetch a la vez y cada uno corre aislado. Si el
    token estaba por vencer, todos intentan refrescarlo con el mismo refresh
    token; Supabase lo rota, el primero gana y a los demás les contesta que ya
    no vale. Esa negativa pasajera se leía como sesión cerrada y mandaba a la
    pantalla de acceso a alguien perfectamente logueado.

    Con cookie de sesión encima, entonces, no se decide nada acá: la petición
    pasa sin la cabecera de identidad y la página lo resuelve con `getUser()`,
    que le pregunta al servidor de Auth y sí es concluyente.
  */
  const hasSessionCookie = request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")
    );
  const unverified = !user && hasSessionCookie;

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  /*
    Acá vivía el bug de "toco una vez y no pasa nada, a la segunda sí".

    El router pide cada pantalla por adelantado con una petición RSC. Si el
    proxy le contestaba con un redirect, `fetch` lo seguía solo y el router
    terminaba guardando, bajo la dirección de My Pocket, el contenido de la
    pantalla de acceso —un 200 de `text/x-component`, sin nada que le avisara
    que lo habían mandado a otro lado—. Al tocar el botón aplicaba esa entrada
    envenenada: la URL cambiaba, la pantalla no, y no salía ni una petición.
    Recién el segundo toque la descartaba y navegaba de verdad.

    Así que el redirect se reserva para lo único que un redirect sabe
    manejar: la navegación de verdad, la que escribe una página en el
    navegador. Eso se reconoce porque pide HTML —Next borra la cabecera `RSC`
    y el parámetro `_rsc` antes de llegar hasta acá, pero el `accept` del
    navegador sobrevive—. Todo lo demás pasa de largo, y si no hay sesión la
    propia página llama a `redirect()`: eso Next lo manda dentro de la
    respuesta, en el formato que el router entiende.

    El portero real, igual, no es este archivo: es que cada pantalla de /hub
    resuelve su sesión y redirige sola, y que RLS no le da una fila a nadie
    sin su JWT.
  */
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");

  if (wantsHtml && !unverified) {
    if (!user && isProtected) return redirectTo(request, cookiesToSet, "/");
    if (user && pathname === "/") {
      return redirectTo(request, cookiesToSet, "/hub");
    }
  }

  /*
    Se copian las cabeceras recién ahora: si Supabase refrescó el token,
    `request.cookies.set` ya reescribió la cookie y la página la ve.

    La de identidad la escribe solo este archivo, y `set` pisa cualquier valor
    que haya llegado del navegador: nadie puede hacerse pasar por otro
    mandándola desde afuera. Y aunque colara una, las consultas siguen
    saliendo con el JWT de la sesión y RLS no devolvería filas ajenas.
  */
  const requestHeaders = new Headers(request.headers);

  if (unverified) {
    // Se borra a mano: sin cabecera, `currentUser()` va a preguntar de verdad.
    requestHeaders.delete(IDENTITY_HEADER);
  } else {
    requestHeaders.set(IDENTITY_HEADER, user ? encodeIdentity(user) : ANONYMOUS);
  }

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
