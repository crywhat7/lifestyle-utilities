import type { Metadata } from "next";

/**
 * Todo /hub vive detrás de sesión: datos financieros de una persona.
 * El noindex se hereda a cada página hija, así ninguna se escapa.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function HubLayout({ children }: LayoutProps<"/hub">) {
  return children;
}
