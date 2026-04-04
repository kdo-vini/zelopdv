import { env } from '$env/dynamic/private';
import crypto from 'crypto';

/**
 * POST /api/print/sign
 * Assina o string "toSign" enviado pelo QZ Tray com a chave privada RSA do servidor.
 * Sem esse endpoint o QZ exibe "site não confiável" e bloqueia a impressão.
 */
export async function POST({ request }) {
  const { toSign } = await request.json();

  if (!env.QZ_PRIVATE_KEY_B64) {
    return new Response(JSON.stringify({ error: 'QZ_PRIVATE_KEY_B64 não configurada' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const privateKeyPem = Buffer.from(env.QZ_PRIVATE_KEY_B64, 'base64').toString('utf-8');

  const sign = crypto.createSign('SHA512');
  sign.update(toSign);
  const signature = sign.sign(privateKeyPem, 'base64');

  return new Response(JSON.stringify({ signature }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
