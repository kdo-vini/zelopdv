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

function normalizeReleaseChannel(channel) {
  const value = String(channel || 'latest').trim();
  return value || 'latest';
}

export function getZeloImpressaoInstallerUrl(channel = 'latest') {
  const normalizedChannel = normalizeReleaseChannel(channel);
  if (normalizedChannel === 'latest') return ZELO_IMPRESSAO_INSTALLER_DOWNLOAD_URL;
  return `${ZELO_IMPRESSAO_DOWNLOADS_BASE_URL}/${encodeURIComponent(normalizedChannel)}/${ZELO_IMPRESSAO_INSTALLER_FILENAME}`;
}

export function getZeloImpressaoDownloadPageUrl() {
  return ZELO_IMPRESSAO_DOWNLOAD_PAGE_URL;
}

function getStoredToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function setStoredToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

function withTimeout(promise, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    run: promise(controller.signal).finally(() => clearTimeout(timeout))
  };
}

async function request(path, options = {}) {
  const token = options.token ?? getStoredToken();
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'X-Zelo-Impressao-Token': token } : {})
  };

  const task = withTimeout((signal) => fetch(`${options.baseUrl || DEFAULT_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal
  }), options.timeoutMs);

  let response;
  try {
    response = await task.run;
  } catch (error) {
    throw Object.assign(new Error(ZELO_IMPRESSAO_UNAVAILABLE_MESSAGE), {
      code: 'ZELO_IMPRESSAO_UNAVAILABLE',
      cause: error
    });
  }

  let data = null;
  try { data = await response.json(); } catch {}

  if (!response.ok || data?.ok === false) {
    const code = data?.code || (response.status === 401 ? 'PAIRING_REQUIRED' : 'ZELO_IMPRESSAO_ERROR');
    const message = code === 'PAIRING_REQUIRED'
      ? 'Conecte este navegador ao Zelo Impressão usando o código exibido no aplicativo.'
      : friendlyMessage(data?.message || response.statusText);
    throw Object.assign(new Error(message), { code, status: response.status, data });
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

export async function detectZeloImpressao(options = {}) {
  try {
    const health = await request('/health', { ...options, token: '' });
    const hasToken = !!getStoredToken();
    return {
      installed: true,
      running: true,
      paired: !health.pairingRequired || (!!health.paired && hasToken),
      health
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
  const response = await request('/print', {
    ...options,
    method: 'POST',
    timeoutMs: options.timeoutMs || 12000,
    body: {
      ...job,
      timestamp: job.timestamp || new Date().toISOString()
    }
  });
  return response;
}

export async function sendRawEscposPrintJob({
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
