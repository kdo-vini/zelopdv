import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';

const EXPECTED_FILENAME = 'Zelo-Impressao-Setup.exe';
const DEFAULT_REMOTE_INSTALLER_URL = 'https://github.com/kdo-vini/zeloprinter/releases/latest/download/Zelo-Impressao-Setup.exe';
const INSTALLER_PATH = path.resolve('static', 'downloads', 'zelo-impressao', 'latest', EXPECTED_FILENAME);

function attachmentHeaders(extra = {}) {
  return {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${EXPECTED_FILENAME}"`,
    'Cache-Control': 'public, max-age=300',
    ...extra,
  };
}

async function serveLocalInstaller() {
  const file = await readFile(INSTALLER_PATH);
  return new Response(file, {
    status: 200,
    headers: attachmentHeaders(),
  });
}

async function proxyRemoteInstaller() {
  const remoteUrl = env.ZELO_IMPRESSAO_INSTALLER_URL?.trim() || DEFAULT_REMOTE_INSTALLER_URL;
  if (!remoteUrl) return null;

  const upstream = await fetch(remoteUrl, {
    headers: {
      Accept: 'application/octet-stream,application/octet-stream;q=0.9,*/*;q=0.8',
    },
  });

  if (!upstream.ok || !upstream.body) {
    throw new Error(`Falha ao baixar instalador remoto (${upstream.status}).`);
  }

  const contentLength = upstream.headers.get('content-length');
  return new Response(upstream.body, {
    status: 200,
    headers: attachmentHeaders(contentLength ? { 'Content-Length': contentLength } : {}),
  });
}

export async function GET({ params }) {
  if (params.filename !== EXPECTED_FILENAME) {
    return new Response('Arquivo não encontrado.', { status: 404 });
  }

  try {
    return await serveLocalInstaller();
  } catch {
    // fallback below
  }

  try {
    const proxied = await proxyRemoteInstaller();
    if (proxied) return proxied;
  } catch {
    // fallback below
  }

  throw redirect(307, '/zelo-impressao?download=not-ready');
}
