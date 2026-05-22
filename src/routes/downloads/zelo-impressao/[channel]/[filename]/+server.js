import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';

const EXPECTED_FILENAME = 'Zelo-Impressao-Setup.exe';

export async function GET({ params }) {
  const { channel, filename } = params;

  if (filename !== EXPECTED_FILENAME) {
    return new Response('Arquivo não encontrado.', { status: 404 });
  }

  // 1. Try to serve from local static files first (if present)
  try {
    const localPath = path.resolve('static', 'downloads', 'zelo-impressao', channel, EXPECTED_FILENAME);
    const file = await readFile(localPath);
    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${EXPECTED_FILENAME}"`,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    // Fallback to redirect
  }

  // 2. Redirect to the GitHub Release of the specified version/tag
  // If channel is 'latest', redirect to env.ZELO_IMPRESSAO_INSTALLER_URL if configured
  if (channel === 'latest') {
    const remoteUrl = env.ZELO_IMPRESSAO_INSTALLER_URL?.trim();
    if (remoteUrl) {
      throw redirect(302, remoteUrl);
    }
  }

  // Otherwise, construct GitHub release URL
  // If channel is a version (e.g. '0.1.2'), we redirect to the versioned filename 'Zelo-Impressao-0.1.2-Setup.exe'
  // If channel is 'latest', we redirect to the version-independent filename 'Zelo-Impressao-Setup.exe'
  const gitHubReleaseUrl = channel === 'latest'
    ? 'https://github.com/kdo-vini/zeloprinter/releases/latest/download/Zelo-Impressao-Setup.exe'
    : `https://github.com/kdo-vini/zeloprinter/releases/download/v${channel.replace(/^v/, '')}/Zelo-Impressao-${channel.replace(/^v/, '')}-Setup.exe`;

  throw redirect(302, gitHubReleaseUrl);
}
