/**
 * Server-side email module for ZeloPDV.
 * Uses Resend (resend.com) to send transactional emails.
 *
 * Usage:
 *   import { sendEmail, isEmailConfigured } from '$lib/server/email';
 *   await sendEmail({ to: 'user@example.com', subject: 'Olá!', html: '<p>...</p>' });
 */

import { env } from '$env/dynamic/private';
import { Resend } from 'resend';

/** @type {Resend|null} */
let resendClient = null;

function getResend() {
  if (!resendClient && env.RESEND_API_KEY) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

export function isEmailConfigured() {
  return !!(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

/**
 * Send an email via Resend.
 * @param {{ to: string, subject: string, html: string }} options
 * @returns {Promise<boolean>} true if sent successfully
 */
export async function sendEmail({ to, subject, html }) {
  const resend = getResend();
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY não configurado, email ignorado.');
    return false;
  }

  if (!env.RESEND_FROM_EMAIL) {
    console.warn('[Email] RESEND_FROM_EMAIL não configurado, email ignorado.');
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('[Email] Erro ao enviar para', to, ':', error);
      return false;
    }

    console.log('[Email] Enviado com sucesso para', to, '|', subject);
    return true;
  } catch (err) {
    console.error('[Email] Exceção ao enviar para', to, ':', err?.message || err);
    return false;
  }
}
