import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Space_Grotesk } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Lifestyle Utilities",
  description:
    "Herramientas pequeñas y afiladas para tomar mejores decisiones de vida.",
  applicationName: "Lifestyle Utilities",
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${bricolage.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="relative min-h-full">
        <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
