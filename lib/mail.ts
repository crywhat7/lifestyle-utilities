import "server-only";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Sin dominio verificado, Resend solo entrega desde su remitente de prueba y
 * únicamente al correo dueño de la cuenta. Cuando verifiques un dominio,
 * poné POCKET_MAIL_FROM y esto empieza a llegarle a cualquiera.
 */
const FALLBACK_FROM = "My Pocket <onboarding@resend.dev>";

export type MailOutcome =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<MailOutcome> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Falta RESEND_API_KEY." };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.POCKET_MAIL_FROM || FALLBACK_FROM,
        to: [to],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        (payload as { message?: string } | null)?.message ??
        `HTTP ${response.status}`;
      return { ok: false, error: detail };
    }

    return { ok: true, id: String((payload as { id?: string })?.id ?? "") };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error de red",
    };
  }
}
