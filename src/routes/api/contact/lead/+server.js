import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sendEmail } from '$lib/server/email';
import {
  buildRateLimitKey,
  createRateLimitResponse,
  enforceRateLimit,
  getRequestIp,
  normalizeEmail,
} from '$lib/server/rateLimit';

const VALID_SUBJECTS = new Set([
  'demo',
  'especialista',
  'whatsapp',
  'suporte',
  'planos',
  'teste',
  'outro',
]);

const SUBJECT_LABELS = {
  demo: 'Agendar demonstração',
  especialista: 'Falar com especialista',
  whatsapp: 'Pedidos pelo WhatsApp',
  suporte: 'Falar com suporte',
  planos: 'Conhecer planos',
  teste: 'Testar o Zelo PDV',
  outro: 'Outro assunto',
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function getLeadDestination() {
  return env.CONTACT_LEAD_EMAIL || env.SALES_LEAD_EMAIL || 'techne.br@gmail.com';
}

export async function POST({ request, getClientAddress }) {
  const ip = getRequestIp({ request, getClientAddress });
  const rateLimit = enforceRateLimit({
    key: buildRateLimitKey('contact-lead', ip),
    logKey: buildRateLimitKey('contact-lead', ip),
    route: '/api/contact/lead',
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return createRateLimitResponse(rateLimit, 'Muitas mensagens enviadas. Tente novamente em 1 hora.');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (cleanText(body.website, 200)) {
    return json({ ok: true });
  }

  const name = cleanText(body.name, 100);
  const email = normalizeEmail(body.email);
  const phone = cleanText(body.phone, 40);
  const business = cleanText(body.business, 120);
  const message = cleanText(body.message, 1200);
  const subject = VALID_SUBJECTS.has(body.subject) ? body.subject : 'outro';
  const utmContent = cleanText(body.utmContent, 120);
  const pagePath = cleanText(body.pagePath, 240);

  if (!name || !email || !message) {
    return json({ error: 'Preencha nome, e-mail e mensagem.' }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Informe um e-mail válido.' }, { status: 400 });
  }

  const subjectLabel = SUBJECT_LABELS[subject] || SUBJECT_LABELS.outro;
  const leadDestination = getLeadDestination();
  const html = `
    <h2>Novo lead pelo site Zelo PDV</h2>
    <p><strong>Assunto:</strong> ${escapeHtml(subjectLabel)}</p>
    <p><strong>Nome:</strong> ${escapeHtml(name)}</p>
    <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
    <p><strong>Telefone/WhatsApp:</strong> ${escapeHtml(phone || 'Não informado')}</p>
    <p><strong>Negócio:</strong> ${escapeHtml(business || 'Não informado')}</p>
    <p><strong>Origem:</strong> ${escapeHtml(pagePath || '/contato')}</p>
    <p><strong>UTM content:</strong> ${escapeHtml(utmContent || 'Não informado')}</p>
    <hr />
    <p><strong>Mensagem:</strong></p>
    <p>${escapeHtml(message).replaceAll('\n', '<br />')}</p>
  `;

  const sent = await sendEmail({
    to: leadDestination,
    subject: `[Zelo PDV] ${subjectLabel} - ${name}`,
    html,
  });

  if (!sent) {
    return json(
      { error: 'Não conseguimos enviar sua mensagem agora. Tente criar sua conta grátis ou volte em alguns minutos.' },
      { status: 503 },
    );
  }

  return json({ ok: true });
}
