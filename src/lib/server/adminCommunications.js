const APP_URL = 'https://zelopdv.com.br';
export const TECHNE_WHATSAPP_NUMBER = '5514991537503';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstNameFrom(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'cliente';
  return normalized.split(/\s+/)[0];
}

function normalizeString(value) {
  return String(value || '').trim();
}

export function buildCommunicationContext(recipient = {}) {
  const nomeCompleto =
    normalizeString(recipient.nome_exibicao) ||
    normalizeString(recipient.nome_completo) ||
    normalizeString(recipient.nome) ||
    normalizeString(recipient.email) ||
    'cliente';

  return {
    primeiro_nome: firstNameFrom(nomeCompleto),
    nome_completo: nomeCompleto,
    empresa: normalizeString(recipient.nome_exibicao) || nomeCompleto,
    email: normalizeString(recipient.email),
    telefone: normalizeString(recipient.phone),
    documento: normalizeString(recipient.documento),
    numero_techne: TECHNE_WHATSAPP_NUMBER,
    link_login: `${APP_URL}/login`,
  };
}

export function applyCommunicationPlaceholders(template, recipient = {}) {
  const context = buildCommunicationContext(recipient);
  return String(template || '').replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key) => {
    const normalizedKey = String(key || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(context, normalizedKey)
      ? context[normalizedKey]
      : match;
  });
}

export function renderAdminEmailHtml(bodyText, recipient = {}) {
  const resolvedBody = applyCommunicationPlaceholders(bodyText, recipient);
  const bodyHtml = resolvedBody
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#0b1220;padding:24px 36px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Zelo PDV</span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px;color:#111827;font-size:15px;line-height:1.7;">
              ${bodyHtml || '<p style="margin:0;color:#6b7280;">&nbsp;</p>'}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
                Zelo PDV · <a href="${APP_URL}" style="color:#6b7280;">zelopdv.com.br</a> ·
                <a href="https://wa.me/${TECHNE_WHATSAPP_NUMBER}" style="color:#6b7280;">WhatsApp</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function summarizeText(value, maxLength = 220) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}
