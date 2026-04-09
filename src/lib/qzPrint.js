/**
 * QZ Tray integration — impressão direta em impressora térmica sem diálogo do browser.
 * Fallback automático: se QZ Tray não estiver instalado, retorna false e o caller
 * cai no printViaIframe normal.
 *
 * Instalação para o cliente:
 *   https://qz.io/download/ → instalar e manter rodando em background
 */
import { supabase } from '$lib/supabaseClient';

/** @type {any} Instância do QZ Tray carregada dinamicamente */
let qz = null;

/**
 * Carrega a biblioteca qz-tray dinamicamente (client-side only).
 * Reutiliza a instância já carregada. Retorna null se não disponível.
 */
async function loadQZ() {
  if (qz !== null) return qz || null; // false = já tentou e falhou
  if (typeof window === 'undefined') return null;

  try {
    const mod = await import('qz-tray');
    qz = mod.default ?? mod;

    // Certificado assinado — QZ Tray reconhece zelopdv.com.br como site confiável.
    // O certificado fica em /digital-certificate.pem e a assinatura é feita no servidor.
    qz.security.setCertificatePromise(function (resolve, reject) {
      fetch('/digital-certificate.pem')
        .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
        .then(resolve)
        .catch(reject);
    });
    qz.security.setSignatureAlgorithm('SHA512');
    qz.security.setSignaturePromise(function (toSign) {
      return function (resolve, reject) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          const token = session?.access_token ?? '';
          return fetch('/api/print/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ toSign })
          });
        })
          .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
          .then((data) => resolve(data.signature))
          .catch(reject);
      };
    });

    return qz;
  } catch (e) {
    console.debug('[QZ] Biblioteca indisponível:', e?.message);
    qz = false; // evita retry em chamadas subsequentes
    return null;
  }
}

/**
 * Garante que o WebSocket do QZ Tray está conectado.
 * @param {any} qzInstance
 * @returns {Promise<boolean>}
 */
async function ensureConnected(qzInstance) {
  if (qzInstance.websocket.isActive()) return true;
  try {
    await qzInstance.websocket.connect({ retries: 1, delay: 500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Tenta imprimir HTML via QZ Tray na impressora padrão do sistema.
 * @param {string} html - HTML completo do recibo
 * @returns {Promise<boolean>} true se imprimiu com sucesso, false se QZ indisponível ou erro
 */
export async function printHtmlViaQZ(html) {
  const qzInstance = await loadQZ();
  if (!qzInstance) return false;

  const connected = await ensureConnected(qzInstance);
  if (!connected) return false;

  try {
    const printer = await qzInstance.printers.getDefault();
    if (!printer) return false;

    const config = qzInstance.configs.create(printer);
    await qzInstance.print(config, [{ type: 'html', format: 'plain', data: html }]);
    return true;
  } catch (e) {
    console.warn('[QZ] Falha ao imprimir:', e?.message || e);
    return false;
  }
}
