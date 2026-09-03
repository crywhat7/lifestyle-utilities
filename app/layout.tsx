import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Instrument_Serif,
  Space_Grotesk,
} from "next/font/google";
import { absoluteUrl, site } from "@/lib/site";
import { THEME_BOOT_SCRIPT, THEME_COLOR } from "@/lib/theme";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  display: "swap",
});

/**
 * La voz de Clean Daily y de nadie más.
 *
 * El módulo de hábitos es otro ambiente —vidrio sobre aurora, no placa
 * mecanizada— y el serif es lo primero que lo delata al entrar. Se declara
 * acá porque `next/font` tiene que verlo en el módulo raíz para preargar el
 * archivo, pero la variable solo la usa `.glass-display`.
 */
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const ogImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${site.name} — ${site.tagline}`,
  type: "image/png",
};

export const metadata: Metadata = {
  // Base para resolver toda URL relativa (og:image, canonical, etc).
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  keywords: [...site.keywords],
  authors: [{ name: site.author, url: site.url }],
  creator: site.author,
  publisher: site.name,
  category: "finance",
  classification: "Finanzas personales",
  formatDetection: { telephone: false, email: false, address: false },

  alternates: {
    canonical: "/",
    languages: { "es-ES": "/", es: "/" },
  },

  openGraph: {
    type: "website",
    determiner: "",
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.shortDescription,
    url: "/",
    locale: site.locale,
    alternateLocale: ["es_AR", "es_MX", "es_419"],
    countryName: "Internacional",
    images: [ogImage],
  },

  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.shortDescription,
    images: [ogImage],
  },

  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  manifest: "/manifest.webmanifest",

  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },

  appleWebApp: {
    capable: true,
    title: site.shortName,
    statusBarStyle: "black-translucent",
  },

  // Google Search Console / Bing / Yandex: se activan poniendo la variable.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFICATION }
      : undefined,
  },

  // Etiquetas que la API tipada de Next todavía no cubre pero que
  // consumen Facebook, Telegram, WhatsApp, Pinterest, Slack y Schema.org.
  other: {
    "twitter:label1": "Precio",
    "twitter:data1": "Gratis",
    "twitter:label2": "Herramientas",
    "twitter:data2": "Should I Buy It · My Pocket",
    "apple-mobile-web-app-capable": "yes",
    "msapplication-TileColor": site.themeColor,
    "msapplication-TileImage": absoluteUrl("/apple-icon"),
    "pinterest-rich-pin": "true",
  },
};

export const viewport: Viewport = {
  // Sin elección guardada manda el sistema, así que la barra del navegador
  // también viene en dos versiones. Cuando la persona elige, el selector
  // reescribe esta meta en el cliente.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Datos estructurados: cómo Google entiende qué es este sitio. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      url: absoluteUrl("/"),
      name: site.name,
      description: site.description,
      inLanguage: "es",
      publisher: { "@id": absoluteUrl("/#person") },
    },
    {
      "@type": "Person",
      "@id": absoluteUrl("/#person"),
      name: site.author,
      url: absoluteUrl("/"),
    },
    {
      "@type": "WebApplication",
      "@id": absoluteUrl("/#app"),
      name: site.name,
      url: absoluteUrl("/"),
      description: site.shortDescription,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      browserRequirements: "Requiere JavaScript",
      inLanguage: "es",
      image: absoluteUrl("/opengraph-image"),
      author: { "@id": absoluteUrl("/#person") },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      featureList: [
        "Convertir el precio de una compra en horas de trabajo",
        "Registrar ingresos y egresos con categorías",
        "Ver el balance del mes y en qué se va la plata",
        "Gastos contemplados y fechas de pago flexibles",
      ],
    },
  ],
};

/**
 * Guardián del evento de instalación. Ver `lib/install.ts` para el otro lado.
 */
const INSTALL_PROMPT_CATCHER = `
window.__installPrompt = null;
addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  window.__installPrompt = event;
  dispatchEvent(new Event("installpromptready"));
});
addEventListener("appinstalled", function () {
  window.__installPrompt = null;
});
`.trim();

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={site.lang}
      dir="ltr"
      className={`${bricolage.variable} ${spaceGrotesk.variable} ${instrument.variable} h-full antialiased`}
      /* El script de abajo le escribe `data-theme` a este mismo nodo antes de
         que React lo vea, así que el servidor y el cliente no coinciden. */
      suppressHydrationWarning
    >
      <body className="relative min-h-full">
        {/*
          Primero de todo, y bloqueante a propósito: es lo único del árbol
          que tiene que correr ANTES del primer pintado. Si el tema elegido
          se aplicara recién al hidratar, quien pidió oscuro se comería un
          flash blanco en cada carga.
        */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/*
          Chrome dispara `beforeinstallprompt` una sola vez y muy temprano —
          en una visita repetida, antes de que React hidrate. Si nadie lo
          atrapa ahí, el evento se pierde y el botón de instalar no aparece
          nunca. Esto lo guarda en `window` para que `HubNotice` lo
          recoja cuando monte, sea antes o después.
        */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_CATCHER }}
        />
        <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
