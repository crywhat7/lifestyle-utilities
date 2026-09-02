# Lifestyle Utilities

> Herramientas pequeñas y afiladas para las decisiones que hacen grande tu día a día.

Una app web (mobile-first, en español) con dos utilidades de finanzas personales
detrás de un login con Google:

| Herramienta | Qué hace |
| --- | --- |
| **Should I Buy It** | Traduce el precio de una compra a las horas de tu vida que cuesta ganarlo. La IA normaliza el producto, lo clasifica y arma pros y contras; los números se recalculan en el servidor. |
| **My Pocket** | Ingresos, egresos, categorías, gastos fijos y fechas de pago. El balance real del mes en un solo número. |
| **Clean Daily** | Hábitos —buenos y malos— en una pizarra que se borra a las 00:00, y tareas que no mueren hasta que las marcás. Mide consistencia mensual, no rachas. |

---

## Stack

- **Next.js 16.3** (App Router, Turbopack, Server Components y Server Actions)
- **React 19.2** · **TypeScript 5** · **Tailwind CSS 4**
- **Supabase** — auth con Google OAuth + Postgres con RLS, esquema `lifestyle_utilities`
- **IA**: Gemini como proveedor principal, Groq como respaldo automático
- Tipo de cambio en vivo vía [open.er-api.com](https://open.er-api.com), cacheado 6 h

El diseño es un sistema propio: superficies mecanizadas oscuras, tipografía
grabada y un único acento (`#c6f24e`). Vive en [`app/globals.css`](app/globals.css).

Clean Daily es la excepción deliberada: usa su propio ambiente de vidrio
esmerilado sobre una aurora, en OKLCH y con serif de titular, aislado en
[`app/hub/clean-daily/glass.css`](app/hub/clean-daily/glass.css). Todo cuelga de
la clase `.glass`, así que nada de ese vocabulario se filtra a las otras dos
herramientas.

---

## Arranque local

```bash
npm install
```

Creá un `.env.local` en la raíz:

```bash
# Supabase (Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # reservado para tareas server-side

# URL pública del sitio: la usan OAuth y todos los metadatos (canonical, OG…)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# IA (al menos una; si faltan las dos, el análisis se degrada con aviso)
SHOULD_I_BUY_IT_GEMINI_API_KEY=...
GROQ_API_KEY=...

# Opcionales — verificación de buscadores
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
NEXT_PUBLIC_YANDEX_VERIFICATION=
NEXT_PUBLIC_BING_VERIFICATION=
```

Corré las migraciones en **Supabase Studio → SQL Editor**, en orden (son idempotentes):

1. [`supabase/migrations/0001_lifestyle_utilities.sql`](supabase/migrations/0001_lifestyle_utilities.sql)
2. [`supabase/migrations/0002_my_pocket.sql`](supabase/migrations/0002_my_pocket.sql)
3. …y el resto en orden numérico. Las cuatro últimas
   ([`0008`](supabase/migrations/0008_clean_daily.sql),
   [`0009`](supabase/migrations/0009_clean_daily_intentions.sql),
   [`0010`](supabase/migrations/0010_habit_stacking.sql) y
   [`0011`](supabase/migrations/0011_habit_place.sql)) son las de Clean
   Daily: tablas, intenciones de implementación, acumulación de hábitos y el
   lugar.

En Supabase → **Authentication → Providers** habilitá Google, y en **URL
Configuration** agregá `http://localhost:3000/auth/callback` y el equivalente de
producción como redirect URLs.

```bash
npm run dev     # http://localhost:3000
npm run build   # build de producción
npm run lint
```

---

## Trabajos programados

Tres endpoints pensados para [cron-job.org](https://cron-job.org). Todos piden
`CRON_SECRET` como `Authorization: Bearer <secreto>` —o `?secret=` para los
programadores que no dejan poner cabeceras— y responden JSON con lo que
hicieron. Agregando `?dry=1` calculan todo pero no mandan nada: es la forma de
probar sin despertar a nadie.

| Endpoint | Cada cuánto | Qué hace |
| --- | --- | --- |
| `/api/cron/salarios` | 1 vez al día | Registra los pagos que caen hoy. |
| `/api/cron/recordatorio` | 13:00 y 19:00 | Pide registrar gastos y avisa lo que vence. |
| `/api/cron/habitos` | **cada 5 min** | Recordatorios de Clean Daily. |

### El de hábitos

```
https://TU-DOMINIO/api/cron/habitos
```

Configuralo **cada 5 minutos** (`*/5 * * * *`), sin parámetros. El intervalo
del cron es lo único que define la puntería: un hábito de las 07:07 recibe su
aviso en la primera corrida a partir de esa hora, o sea 07:10 con cinco
minutos y 07:15 con quince.

`?window=N` es otra cosa y casi nunca hay que tocarlo: son los minutos hacia
atrás que mira cada corrida, 15 por defecto. **De más nunca hace daño** —los
minutos cubiertos dos veces los absorbe el candado, y esa superposición es lo
que salva a un hábito cuando una corrida se pierde—. De menos sí: lo que caiga
en el hueco no se avisa nunca. Con el cron a 5 minutos y `window` en 15, cada
minuto queda cubierto por tres corridas seguidas y solo la primera manda algo.

La anticipación de la última llamada es fija en 15 minutos y no depende del
intervalo, así que bajar el cron te da más puntería sin encogerte el aviso.

Manda dos tipos de aviso, y nunca más de uno por persona a la vez aunque
tenga tres hábitos a la misma hora:

- **Apertura** — llegó la hora del hábito y todavía no está marcado. El texto
  repite la señal y el resultado que la persona escribió: el aviso *es* la
  señal.
- **Última llamada** — el hábito tiene ventana (`07:00–09:00`) y faltan 15
  minutos para que cierre sin que se haya marcado. Las ventanas de 15 minutos
  o menos no la llevan: caería encima del aviso de apertura.

Que no se repita no lo garantiza el reloj sino la tabla `clean_habit_nudges`:
cada aviso reclama su fila con una constraint única, y solo quien la insertó
manda el push. Dos corridas superpuestas no pueden avisar dos veces lo mismo.

Las horas se interpretan en `POCKET_TIMEZONE` (por defecto
`America/Tegucigalpa`), no en la del servidor. Para probar una hora puntual
sin esperarla:

```bash
curl "https://TU-DOMINIO/api/cron/habitos?dry=1&at=07:00" -H "Authorization: Bearer $CRON_SECRET"
```

Los push necesitan las llaves VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`) y que cada persona los active en su dispositivo desde
**Clean Daily → Mis hábitos → Recordatorios**.

---

## Estructura

```
app/
  layout.tsx              Metadatos globales, OG/Twitter, JSON-LD, fuentes
  page.tsx                Landing pública + login con Google
  opengraph-image.tsx     Tarjeta social 1200x630 generada con next/og
  twitter-image.tsx       Reexporta la anterior
  icon.tsx / apple-icon.tsx
  manifest.ts             Web app manifest (PWA instalable)
  robots.ts / sitemap.ts
  auth/                   Callback y signout de Supabase
  hub/
    layout.tsx            noindex heredado por todo lo privado
    page.tsx              Catálogo de herramientas
    should-i-buy-it/
    my-pocket/
components/               Iconos y botón de Google
lib/
  site.ts                 Fuente única de marca, dominio y keywords
  ai/                     Gemini → Groq con failover, prompts y parseo
  money.ts, pocket.ts, decisions.ts, fx.ts, tools.ts
proxy.ts                  Sesión + guardas de ruta (/hub exige login)
supabase/migrations/      Esquema y RLS
```

---

## SEO y compartir en redes

Todo lo público sale de un solo archivo: [`lib/site.ts`](lib/site.ts). Cambiás el
nombre, la descripción o las keywords ahí y se propaga a metadatos, manifest,
sitemap y datos estructurados.

**Qué está cubierto**

- Título con plantilla (`%s · Lifestyle Utilities`), descripción, keywords, autor,
  categoría, `referrer` y `format-detection`
- **Open Graph** completo: `og:type`, `og:title`, `og:description`, `og:url`,
  `og:site_name`, `og:locale` (+ `es_AR`, `es_MX`, `es_419`), `og:country_name`,
  `og:image` con `width`, `height`, `alt` y `type` — lo que leen Facebook,
  WhatsApp, Telegram, LinkedIn, Slack y Discord
- **Twitter/X**: `summary_large_image` con título, descripción, imagen, alt y
  etiquetas `label/data`
- **Imagen social generada en runtime** (`/opengraph-image`, 1200x630) con la
  identidad de la app — sin PNGs que mantener a mano
- **Iconos**: favicon, `/icon` 512px y `/apple-icon` 180px para iOS
- **Manifest** instalable con shortcuts a cada herramienta
- **JSON-LD** (`WebSite`, `Person`, `WebApplication` con `offers` y `featureList`)
- **robots.txt** y **sitemap.xml** generados; `/hub`, `/auth` y `/api` bloqueados
- `noindex, nofollow` heredado en todo `/hub`: son datos financieros privados,
  no hay nada que indexar
- Ranuras listas para verificación de Google, Bing y Yandex vía variables de entorno

**Antes de publicar**

1. Poné `NEXT_PUBLIC_SITE_URL` con el dominio real (`https://…`). En producción,
   una URL `http://` se ignora y se usa el fallback de
   [`lib/site.ts`](lib/site.ts) — ahí está el dominio por defecto si querés
   cambiarlo.
2. Agregá esa misma URL a las redirect URLs de Supabase Auth.
3. Validá las tarjetas: [opengraph.xyz](https://www.opengraph.xyz),
   [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/),
   [Twitter Card Validator](https://cards-dev.twitter.com/validator) y el
   [Rich Results Test](https://search.google.com/test/rich-results) de Google.
4. Dá de alta el sitio en Google Search Console y subí `/sitemap.xml`.

---

## Deploy

Pensado para Vercel: importá el repo, cargá las variables de entorno del bloque
de arriba (con `NEXT_PUBLIC_SITE_URL` apuntando al dominio final) y desplegá.
Cualquier host con soporte para Node y el runtime de Next 16 también sirve.
