import "server-only";
import { formatMoney } from "@/lib/money";

export type SalaryLine = {
  label: string;
  amount: number;
  currency: string;
  amountBase: number;
  baseCurrency: string;
};

/**
 * El correo repite el gesto de la app: el monto es lo único grande, el resto
 * es contexto. Todo en tabla y con estilos en línea porque los clientes de
 * correo no entienden flex ni hojas externas.
 */
export function salaryEmail(lines: SalaryLine[], balance: number, baseCurrency: string) {
  const single = lines.length === 1;
  const total = lines.reduce((sum, line) => sum + line.amountBase, 0);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = site ? `${site.replace(/\/$/, "")}/hub/my-pocket` : "";

  const subject = single
    ? `Se registró tu ${lines[0].label.toLowerCase()}: ${formatMoney(lines[0].amountBase, baseCurrency)}`
    : `Se registraron ${lines.length} pagos: ${formatMoney(total, baseCurrency)}`;

  const rows = lines
    .map((line) => {
      const converted = line.currency !== line.baseCurrency;
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);color:#f3f1ea;font-size:15px;">
            ${escape(line.label)}
            ${
              converted
                ? `<span style="color:rgba(243,241,234,.36);font-size:13px;"> · ${escape(
                    formatMoney(line.amount, line.currency)
                  )}</span>`
                : ""
            }
          </td>
          <td style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);text-align:right;color:#c6f24e;font-size:15px;font-weight:700;white-space:nowrap;">
            +${escape(formatMoney(line.amountBase, line.baseCurrency))}
          </td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:32px 16px;background:#08090b;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr>
        <td style="padding-bottom:28px;color:rgba(243,241,234,.36);font-size:11px;letter-spacing:.24em;text-transform:uppercase;">
          My Pocket · Entró plata
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;color:#c6f24e;font-size:44px;font-weight:700;letter-spacing:-.04em;line-height:1;">
          +${escape(formatMoney(total, baseCurrency))}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;color:rgba(243,241,234,.62);font-size:15px;line-height:1.55;">
          ${
            single
              ? "Hoy tocaba este pago, así que ya quedó registrado en tu balance. No tenés que hacer nada."
              : "Hoy tocaban estos pagos, así que ya quedaron registrados en tu balance. No tenés que hacer nada."
          }
        </td>
      </tr>
      <tr>
        <td style="padding:4px 20px 8px;background:#16181c;border:1px solid rgba(255,255,255,.07);border-radius:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${rows}
            <tr>
              <td style="padding:14px 0;color:rgba(243,241,234,.36);font-size:13px;">Balance general</td>
              <td style="padding:14px 0;text-align:right;color:${
                balance < 0 ? "#ff7a5c" : "#f3f1ea"
              };font-size:13px;font-weight:700;white-space:nowrap;">
                ${escape(formatMoney(balance, baseCurrency))}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      ${
        link
          ? `<tr>
        <td style="padding-top:28px;">
          <a href="${escape(link)}" style="display:block;padding:16px;background:#c6f24e;border-radius:999px;color:#0a0d05;font-size:15px;font-weight:700;text-align:center;text-decoration:none;">
            Ver mi bolsillo
          </a>
        </td>
      </tr>`
          : ""
      }
      <tr>
        <td style="padding-top:24px;color:rgba(243,241,234,.36);font-size:12px;line-height:1.6;">
          ¿No era el monto exacto? Entrá al movimiento y corregilo — se registra
          con lo que tenés configurado en Ajustes.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    single ? "Se registró tu pago." : "Se registraron tus pagos.",
    "",
    ...lines.map(
      (line) => `${line.label}: +${formatMoney(line.amountBase, line.baseCurrency)}`
    ),
    "",
    `Balance general: ${formatMoney(balance, baseCurrency)}`,
    link ? `\n${link}` : "",
  ].join("\n");

  return { subject, html, text };
}

function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
