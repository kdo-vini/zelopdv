const DEFAULT_BASE_URL = 'http://127.0.0.1:17321';
const TOKEN_KEY = 'zelo_impressao_token_v1';
const TIMEOUT_MS = 1800;

export const ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL = 'https://zelopdv.com.br/zelo-impressao';
export const ZELO_IMPRESSAO_DOWNLOADS_BASE_URL = 'https://zelopdv.com.br/downloads/zelo-impressao';
export const ZELO_IMPRESSAO_INSTALLER_FILENAME = 'Zelo-Impressao-Setup.exe';
export const ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL = `${ZELO_IMPRESSAO_DOWNLOADS_BASE_URL}/latest/${ZELO_IMPRESSAO_INSTALLER_FILENAME}`;

export const ZELO_IMPRESSAO_UNAVAILABLE_MESSAGE =
  'O Zelo Impressão não está aberto neste computador. Abra o aplicativo ou use a impressão pelo navegador.';

export const ZELO_IMPRESSAO_PRINTER_UNAVAILABLE_MESSAGE =
  'Não conseguimos acessar a impressora selecionada. Verifique se ela está ligada e conectada.';

export const ZELO_IMPRESSAO_AUTO_CONNECT_FALLBACK_MESSAGE =
  'A conexão automática não foi concluída. Se o aplicativo pedir, digite o código exibido no Zelo Impressão.';

function unknownPrintOutcome(cause) {
  return Object.assign(new Error('Não foi possível confirmar a impressão. Confira a saída antes de tentar novamente.'), {
    code: 'PRINT_OUTCOME_UNKNOWN', retrySafe: false, cause,
  });
}

function getStoredToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function setStoredToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

async function request(path, options = {}) {
  const isPrint = path === '/print' || path === '/test-print';
  const token = options.token ?? getStoredToken();
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'X-Zelo-Impressao-Token': token } : {})
  };

  const body = options.body ? JSON.stringify(options.body) : undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  let response;
  let data = null;
  try {
    response = await fetch(`${options.baseUrl || DEFAULT_BASE_URL}${path}`, {
      method: options.method || 'GET', headers, body, signal: controller.signal,
    });
    try { data = await response.json(); }
    catch (error) { if (response.ok || controller.signal.aborted) throw error; }
    if (response.ok && (!data || typeof data.ok !== 'boolean')) throw new Error('Invalid local printer response');
  } catch (error) {
    if (isPrint) throw unknownPrintOutcome(error);
    throw Object.assign(new Error(ZELO_IMPRESSAO_UNAVAILABLE_MESSAGE), {
      code: 'ZELO_IMPRESSAO_UNAVAILABLE',
      retrySafe: true,
      cause: error
    });
  } finally {
    clearTimeout(timer);
  }

  if (isPrint && (data?.code === 'PRINT_OUTCOME_UNKNOWN' || data?.retrySafe === false ||
    (!response.ok && ![401, 403, 404, 413, 415].includes(response.status) && data?.retrySafe !== true) ||
    (response.ok && data?.ok !== true))) {
    throw unknownPrintOutcome(data);
  }

  if (!response.ok || data?.ok === false) {
    const code = data?.code || (response.status === 401 ? 'PAIRING_REQUIRED' : 'ZELO_IMPRESSAO_ERROR');
    if (code === 'PAIRING_REQUIRED' && options.token === undefined) {
      try { localStorage.removeItem(TOKEN_KEY); } catch {}
    }
    const message = code === 'PAIRING_REQUIRED'
      ? ZELO_IMPRESSAO_AUTO_CONNECT_FALLBACK_MESSAGE
      : friendlyMessage(data?.message || response.statusText);
    throw Object.assign(new Error(message), { code, status: response.status, data, retrySafe: data?.retrySafe });
  }

  return data;
}

function friendlyMessage(message) {
  const raw = String(message || '');
  if (/offline|unavailable|printer|impressora/i.test(raw)) {
    return ZELO_IMPRESSAO_PRINTER_UNAVAILABLE_MESSAGE;
  }
  if (/fetch|refused|network|failed|abort|localhost/i.test(raw)) {
    return ZELO_IMPRESSAO_UNAVAILABLE_MESSAGE;
  }
  return raw || 'Não conseguimos concluir a impressão agora.';
}

export async function connectZeloImpressao(options = {}) {
  const response = await request('/connect', {
    ...options,
    method: 'POST',
    token: '',
    body: {},
  });
  if (!response?.token) {
    throw Object.assign(new Error(ZELO_IMPRESSAO_AUTO_CONNECT_FALLBACK_MESSAGE), {
      code: 'AUTO_CONNECT_INVALID_RESPONSE',
      data: response,
    });
  }
  setStoredToken(response.token);
  return response;
}

export async function detectZeloImpressao(options = {}) {
  try {
    const health = await request('/health', { ...options, token: '' });
    const hasToken = !!(options.token ?? getStoredToken());
    let autoConnected = false;
    let autoConnectError = null;
    let alreadyPaired = !health.pairingRequired;
    if (!alreadyPaired && hasToken) {
      try {
        await request('/config', options);
        alreadyPaired = true;
      } catch (error) {
        autoConnectError = error;
      }
    }

    if (!alreadyPaired && options.autoConnect !== false) {
      try {
        await connectZeloImpressao(options);
        autoConnected = true;
      } catch (error) {
        autoConnectError = error;
      }
    }

    const paired = alreadyPaired || autoConnected;
    return {
      installed: true,
      running: true,
      paired,
      autoConnected,
      autoConnectError,
      health,
      message: paired ? undefined : ZELO_IMPRESSAO_AUTO_CONNECT_FALLBACK_MESSAGE,
    };
  } catch (error) {
    return {
      installed: false,
      running: false,
      paired: false,
      error,
      message: ZELO_IMPRESSAO_UNAVAILABLE_MESSAGE
    };
  }
}

export async function pairZeloImpressao(code, options = {}) {
  const response = await request('/pair', {
    ...options,
    method: 'POST',
    token: '',
    body: { code: String(code || '').trim() }
  });
  if (response.token) setStoredToken(response.token);
  return response;
}

export async function getPrinters(options = {}) {
  const response = await request('/printers', options);
  return response.printers || [];
}

export async function getConfig(options = {}) {
  const response = await request('/config', options);
  return response.config;
}

export async function saveConfig(config, options = {}) {
  const response = await request('/config', {
    ...options,
    method: 'POST',
    body: config
  });
  return response.config;
}

export async function sendPrintJob(job, options = {}) {
  // Only a failed read preflight can safely mean that nothing was submitted.
  const health = await request('/health', { ...options, token: '' });
  if (job.intent?.mode === 'automatic' && health.capabilities?.canonicalAutoPrint !== true) {
    throw Object.assign(new Error('Atualize o Zelo Impressão para coordenar PDV e Chat sem duplicar pedidos. A segunda via manual continua disponível.'), {
      code: 'AUTO_PRINT_COORDINATION_REQUIRED', retrySafe: false,
    });
  }
  const response = await request('/print', {
    ...options,
    method: 'POST',
    timeoutMs: options.timeoutMs || 12000,
    body: {
      ...job,
      jobId: job.jobId || globalThis.crypto?.randomUUID?.(),
      timestamp: job.timestamp || new Date().toISOString()
    }
  });
  return response;
}

export async function sendRawEscposPrintJob({
  jobId,
  source,
  companyStoreId,
  printerId,
  printerName,
  bytes,
  type = 'raw_escpos',
  metadata
}, options = {}) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = '';
  for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]);
  return sendPrintJob({
    jobId,
    source,
    companyStoreId,
    type,
    printerId,
    printerName,
    timestamp: new Date().toISOString(),
    content: {
      format: 'raw_escpos_base64',
      base64: btoa(binary)
    },
    metadata
  }, options);
}

export async function sendTestPrint(printerId, options = {}) {
  await request('/health', { ...options, token: '' });
  return request('/test-print', {
    ...options,
    method: 'POST',
    timeoutMs: options.timeoutMs || 10000,
    body: { printerId }
  });
}

export function fallbackToBrowserPrint(html) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    const cleanup = () => setTimeout(() => {
      try { document.body.removeChild(iframe); } catch {}
      resolve();
    }, 500);
    try { iframe.contentWindow.addEventListener('afterprint', cleanup); } catch {}
    setTimeout(cleanup, 15000);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    if (!/window\.print\s*\(/i.test(html)) {
      setTimeout(() => {
        try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch {}
      }, 150);
    }
  });
}

export function getZeloImpressaoFriendlyMessage(error) {
  return friendlyMessage(error?.message || error);
}

export function clearZeloImpressaoPairing() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}
