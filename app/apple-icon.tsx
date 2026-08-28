import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS no respeta transparencias ni bordes: fondo sólido y margen propio. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0d0f12",
          backgroundImage:
            "radial-gradient(100% 100% at 50% 0%, rgba(198,242,78,0.20) 0%, rgba(13,15,18,0) 70%)",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 48 48" fill="none">
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
    ),
    size,
  );
}
