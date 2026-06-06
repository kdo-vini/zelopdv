import { json } from '@sveltejs/kit';
import { sendEmail, isEmailConfigured } from '$lib/server/email';
import { isWhatsAppConfigured, sendWhatsAppTextDetailed, getWhatsAppSendError } from '$lib/server/whatsapp';
import {
  applyCommunicationPlaceholders,
  renderAdminEmailHtml,
  summarizeText,
  TECHNE_WHATSAPP_NUMBER,
} from '$lib/server/adminCommunications';
import { supabaseAdmin } from '$lib/server/supabaseAdmin';

const ALLOWED_ORIGINS = new Set([
  'https://admin.zelopdv.com.br',
  'https://www.admin.zelopdv.com.br',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
]);

function buildCorsHeaders(request) {
  const origin = request.headers.get('origin');
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
  if (!allowOrigin) return {};
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function unauthorized(headers) {
  return json({ error: 'Não autorizado.' }, { status: 401, headers });
}

async function requireSuperAdmin(request, headers) {
  if (!supabaseAdmin) {
    return { errorResponse: json({ error: 'Supabase admin não configurado.' }, { status: 500, headers }) };
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { errorResponse: unauthorized(headers) };

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return { errorResponse: unauthorized(headers) };

  const { data: admin } = await supabaseAdmin
    .from('super_admins')
    .select('id, is_active, email')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!admin) {
    return { errorResponse: json({ error: 'Acesso restrito a super admins.' }, { status: 403, headers }) };
  }

  return { admin, user };
}

function validateRecipient(recipient) {
  if (!recipient || typeof recipient !== 'object') return 'Destinatário inválido.';
  if (!recipient.user_id || typeof recipient.user_id !== 'string') return 'recipient.user_id obrigatório.';
  return null;
}

function normalizeRecipients(body) {
  const single = body?.recipient ? [body.recipient] : [];
  const many = Array.isArray(body?.recipients) ? body.recipients : [];
  const combined = [...single, ...many];
  const deduped = [];
  const seen = new Set();

  for (const recipient of combined) {
    if (!recipient?.user_id || seen.has(recipient.user_id)) continue;
    seen.add(recipient.user_id);
    deduped.push(recipient);
  }

  return deduped;
}

async function sendEmailToRecipient(recipient, templateSubject, templateBody) {
  if (!isEmailConfigured()) {
    return { ok: false, status: 500, error: 'Resend não configurado.' };
  }
  if (!recipient.email) {
    return { ok: false, status: 400, error: 'Destinatário sem email.' };
  }
  if (!templateSubject.trim()) {
    return { ok: false, status: 400, error: 'Assunto obrigatório para email.' };
  }

  const resolvedSubject = applyCommunicationPlaceholders(templateSubject, recipient);
  const resolvedBody = applyCommunicationPlaceholders(templateBody, recipient);
  const html = renderAdminEmailHtml(templateBody, recipient);
  const sent = await sendEmail({
    to: recipient.email,
    subject: resolvedSubject,
    html,
  });

  if (!sent) {
    return { ok: false, status: 502, error: 'Falha ao enviar email via Resend.' };
  }

  return {
    ok: true,
    recipient: recipient.email,
    resolvedSubject,
    resolvedBody,
  };
}

async function sendWhatsAppToRecipient(recipient, templateBody) {
  if (!isWhatsAppConfigured()) {
    return { ok: false, status: 500, error: 'WhatsApp interno não configurado.' };
  }
  if (!recipient.phone) {
    return { ok: false, status: 400, error: 'Destinatário sem WhatsApp.' };
  }

  const resolvedBody = applyCommunicationPlaceholders(templateBody, recipient);
  const result = await sendWhatsAppTextDetailed(recipient.phone, resolvedBody);
  if (!result.ok) {
    return { ok: false, status: 502, error: getWhatsAppSendError(result) };
  }

  return {
    ok: true,
    recipient: recipient.phone,
    resolvedBody,
    senderNumber: TECHNE_WHATSAPP_NUMBER,
  };
}

async function writeAdminLog(admin, { action, recipient, details }) {
  try {
    await supabaseAdmin.from('admin_activity_logs').insert({
      admin_id: admin.id,
      admin_email: admin.email || null,
      action,
      target_user_id: recipient.user_id,
      target_email: recipient.email || null,
      details,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[admin/communications/send] failed to write admin log:', err?.message || err);
  }
}

export function OPTIONS({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: cors });
}

export async function POST({ request }) {
  const cors = buildCorsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origem não permitida.' }, { status: 403, headers: cors });
  }

  try {
    const auth = await requireSuperAdmin(request, cors);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json().catch(() => ({}));
    const mode = body.mode === 'whatsapp' ? 'whatsapp' : 'email';
    const recipients = normalizeRecipients(body);
    const templateSubject = typeof body.subject === 'string' ? body.subject : '';
    const templateBody = typeof body.body === 'string' ? body.body : '';

    if (recipients.length === 0) {
      return json({ error: 'Selecione ao menos um destinatário.' }, { status: 400, headers: cors });
    }
    if (recipients.length > 200) {
      return json({ error: 'Limite de 200 destinatários por envio.' }, { status: 400, headers: cors });
    }
    for (const recipient of recipients) {
      const recipientError = validateRecipient(recipient);
      if (recipientError) return json({ error: recipientError }, { status: 400, headers: cors });
    }
    if (!templateBody.trim()) return json({ error: 'Mensagem obrigatória.' }, { status: 400, headers: cors });

    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      const result = mode === 'email'
        ? await sendEmailToRecipient(recipient, templateSubject, templateBody)
        : await sendWhatsAppToRecipient(recipient, templateBody);

      if (!result.ok) {
        failedCount += 1;
        results.push({
          ok: false,
          user_id: recipient.user_id,
          recipient: mode === 'email' ? recipient.email || null : recipient.phone || null,
          error: result.error,
        });
        continue;
      }

      sentCount += 1;
      results.push({
        ok: true,
        user_id: recipient.user_id,
        recipient: result.recipient,
      });

      await writeAdminLog(auth.admin, {
        action: mode === 'email' ? 'admin_send_email' : 'admin_send_whatsapp',
        recipient,
        details: mode === 'email'
          ? {
              mode,
              bulk: recipients.length > 1,
              recipient_name: recipient.nome_exibicao || null,
              subject_template: summarizeText(templateSubject, 160),
              subject_resolved: summarizeText(result.resolvedSubject, 160),
              body_template_preview: summarizeText(templateBody),
              body_resolved_preview: summarizeText(result.resolvedBody),
            }
          : {
              mode,
              bulk: recipients.length > 1,
              recipient_name: recipient.nome_exibicao || null,
              sender_number: TECHNE_WHATSAPP_NUMBER,
              body_template_preview: summarizeText(templateBody),
              body_resolved_preview: summarizeText(result.resolvedBody),
            },
      });
    }

    if (sentCount === 0) {
      return json({
        error: results[0]?.error || 'Falha ao enviar comunicação.',
        mode,
        total: recipients.length,
        sentCount,
        failedCount,
        results,
      }, { status: 502, headers: cors });
    }

    return json({
      success: true,
      mode,
      total: recipients.length,
      sentCount,
      failedCount,
      senderNumber: mode === 'whatsapp' ? TECHNE_WHATSAPP_NUMBER : null,
      results,
    }, { headers: cors });
  } catch (err) {
    console.error('[admin/communications/send] error:', err?.message || err);
    return json({ error: err?.message || 'Falha ao enviar comunicação.' }, { status: 500, headers: cors });
  }
}
