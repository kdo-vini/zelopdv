import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { redirect } from '@sveltejs/kit';

const EXPECTED_FILENAME = 'Zelo-Impressao-Setup.exe';
const INSTALLER_PATH = path.resolve('static', 'downloads', 'zelo-impressao', 'latest', EXPECTED_FILENAME);

export async function GET({ params }) {
  if (params.filename !== EXPECTED_FILENAME) {
    return new Response('Arquivo não encontrado.', { status: 404 });
  }

  try {
    const file = await readFile(INSTALLER_PATH);
    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${EXPECTED_FILENAME}"`,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    throw redirect(307, '/zelo-impressao?download=not-ready');
  }
}
