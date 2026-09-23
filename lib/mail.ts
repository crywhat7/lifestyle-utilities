import "server-only";
import { log } from "@/lib/log";

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

/** Manda el correo y deja constancia de cómo salió (sin el cuerpo). */
export async function sendMail(input: Parameters<typeof deliver>[0]): Promise<MailOutcome> {
  const started = Date.now();
  const outcome = await deliver(input);
  log({
    level: outcome.ok ? "info" : "error",
    source: "mail",
    event: outcome.ok ? "mail.sent" : "mail.failed",
    message: outcome.ok ? input.subject : outcome.error,
    durationMs: Date.now() - started,
    detail: { to: input.to, subject: input.subject, ...(outcome.ok ? { id: outcome.id } : {}) },
  });
  return outcome;
}

async function deliver({
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
