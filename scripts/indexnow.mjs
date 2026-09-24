// Notifica o IndexNow (Bing e demais motores participantes) sobre as URLs
// publicadas no sitemap.xml, a cada deploy de página pública.
//
// Uso:
//   INDEXNOW_KEY=xxxx node scripts/indexnow.mjs
//   INDEXNOW_KEY=xxxx node scripts/indexnow.mjs --dry-run
//   INDEXNOW_KEY=xxxx node scripts/indexnow.mjs --site-url https://zelopdv.com.br --dry-run
//
// O site alvo pode ser sobrescrito via argv (--site-url) ou env
// INDEXNOW_SITE_URL, útil para apontar para um sitemap local em teste.

const DEFAULT_SITE_URL = 'https://zelopdv.com.br';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH_SIZE = 200; // limite prático recomendado pelo protocolo IndexNow

function parseArgs(argv) {
  const args = { dryRun: false, siteUrl: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--site-url') {
      args.siteUrl = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function extractLocUrls(sitemapXml) {
  const matches = sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g);
  return Array.from(matches, (match) => match[1].trim()).filter(Boolean);
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const { dryRun, siteUrl: argvSiteUrl } = parseArgs(process.argv.slice(2));
  const siteUrl = (argvSiteUrl || process.env.INDEXNOW_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
  const key = process.env.INDEXNOW_KEY;

  if (!key) {
    console.error('INDEXNOW_KEY não definido no ambiente. Abortando.');
    process.exitCode = 1;
    return;
  }

  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  console.log(`Buscando sitemap em ${sitemapUrl}...`);

  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    console.error(`Falha ao buscar sitemap: HTTP ${response.status}`);
    process.exitCode = 1;
    return;
  }

  const sitemapXml = await response.text();
  const urls = extractLocUrls(sitemapXml);

  if (urls.length === 0) {
    console.error('Nenhuma URL encontrada no sitemap. Abortando.');
    process.exitCode = 1;
    return;
  }

  console.log(`${urls.length} URLs encontradas no sitemap.`);

  const host = new URL(siteUrl).host;
  const keyLocation = `${siteUrl}/indexnow-key.txt`;
  const batches = chunk(urls, BATCH_SIZE);

  for (const [index, batchUrls] of batches.entries()) {
    const payload = {
      host,
      key,
      keyLocation,
      urlList: batchUrls
    };

    if (dryRun) {
      console.log(`\n[dry-run] Lote ${index + 1}/${batches.length} (${batchUrls.length} URLs):`);
      console.log(JSON.stringify(payload, null, 2));
      continue;
    }

    const submitResponse = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });

    console.log(
      `Lote ${index + 1}/${batches.length} (${batchUrls.length} URLs): HTTP ${submitResponse.status}`
    );

    if (!submitResponse.ok) {
      const text = await submitResponse.text().catch(() => '');
      console.error(`Falha no lote ${index + 1}: ${text}`);
      process.exitCode = 1;
    }
  }

  if (dryRun) {
    console.log('\n[dry-run] Nenhuma requisição foi enviada ao IndexNow.');
  } else {
    console.log('\nEnvio ao IndexNow concluído.');
  }
}

main().catch((err) => {
  console.error('Erro ao notificar o IndexNow:', err);
  process.exitCode = 1;
});
