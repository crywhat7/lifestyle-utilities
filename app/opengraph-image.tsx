import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Tarjeta social generada en runtime: la misma placa mecanizada oscura
 * de la app, en 1200x630. Satori solo soporta flexbox, nada de grid.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#08090b",
          backgroundImage:
            "radial-gradient(120% 80% at 15% -10%, rgba(198,242,78,0.16) 0%, rgba(8,9,11,0) 60%), radial-gradient(90% 60% at 100% 110%, rgba(120,150,255,0.10) 0%, rgba(8,9,11,0) 60%)",
          color: "#f3f1ea",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "rgba(243,241,234,0.42)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: "#1e2127",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
                <path
                  d="M24 3c1.1 9.6 5.1 14.2 14.6 15.6C29 20.2 25.1 24.8 24 34.4c-1.1-9.6-5.1-14.2-14.6-15.8C18.9 17.2 22.9 12.6 24 3Z"
                  fill="#c6f24e"
                />
                <path
                  d="M11.5 30c.5 4.5 2.4 6.7 6.9 7.4-4.5.7-6.4 2.9-6.9 7.4-.5-4.5-2.4-6.7-6.9-7.4 4.5-.7 6.4-2.9 6.9-7.4Z"
                  fill="#c6f24e"
                  opacity="0.55"
                />
              </svg>
            </div>
            <span>Lifestyle Utilities</span>
          </div>
          <span>Gratis</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 118,
              fontWeight: 800,
              letterSpacing: -4,
              lineHeight: 1,
            }}
          >
            Lifestyle
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 118,
              fontWeight: 800,
              letterSpacing: -4,
              lineHeight: 1,
              paddingLeft: 64,
              color: "#c6f24e",
            }}
          >
            Utilities
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 32,
              maxWidth: 760,
              fontSize: 30,
              lineHeight: 1.4,
              color: "rgba(243,241,234,0.62)",
            }}
          >
            Herramientas pequeñas y afiladas para las decisiones que hacen
            grande tu día a día.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {["Should I Buy It", "My Pocket"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "14px 28px",
                borderRadius: 999,
                fontSize: 26,
                backgroundColor: "#16181c",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(243,241,234,0.82)",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
