// Gera as imagens editoriais do blog (capa + figuras inline) chamando o
// Codex CLI (ferramenta de geração de imagem) e otimizando o resultado para
// WebP via optimize-blog-image.mjs.
//
// Schema de scripts/blog-images.manifest.json (array de entradas):
//   [
//     {
//       "slug": "controle-de-fiado",   // slug do post em src/lib/blog/posts.js
//       "name": "capa",                // 'capa' (COVER_IMAGE_NAME) = capa (dimensões COVER_*);
//                                       // qualquer outro nome = figura inline
//                                       // (dimensões INLINE_*), casando com o
//                                       // <name> usado em inlineFigure().
//       "prompt": "descrição da cena, sem mencionar marca/texto/logo",
//       "alt": "texto alternativo em português, usado em post.cover.alt ou no <img> inline"
//     }
//   ]
// O agente de conteúdo (posts.js) preenche este arquivo; este script só lê.
//
// Uso:
//   node scripts/generate-blog-images.mjs
//   node scripts/generate-blog-images.mjs --only controle-de-fiado
//   node scripts/generate-blog-images.mjs --force
//   node scripts/generate-blog-images.mjs --dry-run
//   node scripts/generate-blog-images.mjs --concurrency 3
//   node scripts/generate-blog-images.mjs --manifest scripts/blog-images.manifest.json
//
// Requer o Codex CLI instalado e autenticado (`codex`) disponível no PATH.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { COVER_IMAGE_NAME, IMAGE_FORMAT } from '../src/lib/blog/images.js';
import { optimizeBlogImage } from './optimize-blog-image.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'blog-images.manifest.json');
const STATIC_BLOG_DIR = path.join(REPO_ROOT, 'static', 'blog');

// Sufixo de estilo aplicado a todo prompt, para manter consistência
// editorial entre as fotos geradas (ver GEO_PLAN_2026-09.md, frente 2:
// conteúdo precisa parecer real e específico, não banco de imagem genérico).
const STYLE_SUFFIX =
  ', fotografia editorial realista de pequenos negócios de alimentação brasileiros, ' +
  'luz natural, enquadramento 16:9 paisagem, sem texto, sem logotipos, sem marca d\'água, ' +
  'sem nomes de marca visíveis, pessoas são opcionais e nunca devem parecer celebridades';

// Invocação do Codex CLI. No Windows o binário é um shim `.cmd`, que o Node
// só consegue executar com shell ligado.
const IS_WINDOWS = process.platform === 'win32';
const CODEX_BIN = IS_WINDOWS ? 'codex.cmd' : 'codex';
const CODEX_EXEC_ARGS = ['exec', '--skip-git-repo-check', '-s', 'workspace-write'];

// Tempo máximo por imagem antes de considerar a chamada ao Codex travada.
const PER_IMAGE_TIMEOUT_MS = 8 * 60 * 1000;

// Concorrência padrão quando --concurrency não é informado.
const DEFAULT_CONCURRENCY = 2;

function parseArgs(argv) {
  const args = {
    only: null,
    force: false,
    dryRun: false,
    concurrency: DEFAULT_CONCURRENCY,
    manifestPath: DEFAULT_MANIFEST_PATH
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--only') {
      args.only = argv[i + 1];
      i += 1;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--concurrency') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) args.concurrency = value;
      i += 1;
    } else if (arg === '--manifest') {
      args.manifestPath = path.resolve(argv[i + 1]);
      i += 1;
    }
  }

  return args;
}

async function loadManifest(manifestPath) {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    throw new Error(`Manifesto inválido em ${manifestPath}: esperado um array.`);
  }
  return entries;
}

function finalWebpPath(slug, name) {
  return path.join(STATIC_BLOG_DIR, slug, `${name}.${IMAGE_FORMAT}`);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Roda o Codex CLI em um diretório temporário isolado, pedindo para salvar
 * a imagem final como <name>.png no cwd. stdin fica fechado (--skip
 * confirmação interativa não existe nesse fluxo; workspace-write basta).
 * @param {{ prompt: string, name: string, cwd: string }} params
 * @returns {Promise<void>}
 */
function runCodexImageGeneration({ prompt, name, cwd }) {
  const fullPrompt =
    `Use your image generation tool to create ONE image: ${prompt}${STYLE_SUFFIX}. ` +
    `Save the final image file in the current working directory as ${name}.png.`;

  return new Promise((resolve, reject) => {
    // O prompt vai pelo stdin (`-`), não como argumento: no Windows o `codex`
    // é um shim `.cmd` que só roda via shell, e aspas/acentos do prompt não
    // sobrevivem ao quoting do cmd.exe. Os demais argumentos são fixos e seguros.
    const codexArgs = [...CODEX_EXEC_ARGS, '-'];
    const spawnOptions = { cwd, stdio: ['pipe', 'pipe', 'pipe'] };
    const child = IS_WINDOWS
      ? spawn([CODEX_BIN, ...codexArgs].join(' '), { ...spawnOptions, shell: true })
      : spawn(CODEX_BIN, codexArgs, spawnOptions);
    child.stdin.end(fullPrompt);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`Timeout após ${PER_IMAGE_TIMEOUT_MS}ms esperando o Codex gerar ${name}.png`));
    }, PER_IMAGE_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`codex exec saiu com código ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      }
    });
  });
}

/**
 * Processa uma entrada do manifesto: gera a imagem via Codex em um diretório
 * temporário e otimiza o resultado para static/blog/<slug>/.
 * @param {{ slug: string, name: string, prompt: string, alt: string }} entry
 * @param {{ dryRun: boolean }} options
 */
async function processEntry(entry, { dryRun }) {
  const { slug, name, prompt } = entry;
  const inline = name !== COVER_IMAGE_NAME;
  const label = `${slug}/${name}`;

  if (dryRun) {
    console.log(`[dry-run] geraria ${label} (${inline ? 'inline' : 'cover'}) a partir do prompt: "${prompt}"`);
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zelo-blog-image-'));
  try {
    console.log(`[generate-blog-images] gerando ${label}...`);
    await runCodexImageGeneration({ prompt, name, cwd: tempDir });

    const pngPath = path.join(tempDir, `${name}.png`);
    if (!(await fileExists(pngPath))) {
      throw new Error(`Codex não salvou ${name}.png em ${tempDir}`);
    }

    const result = await optimizeBlogImage({ inputPath: pngPath, slug, name, inline });
    console.log(`[generate-blog-images] ok: ${label} -> ${result.fullPath}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Executa uma lista de tarefas assíncronas com concorrência limitada,
 * continuando mesmo quando alguma falha (o chamador decide o exit code).
 * @param {Array<() => Promise<void>>} tasks
 * @param {number} concurrency
 * @returns {Promise<Array<{ ok: boolean, error?: Error }>>}
 */
async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= tasks.length) return;
      try {
        await tasks[current]();
        results[current] = { ok: true };
      } catch (error) {
        results[current] = { ok: false, error };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await loadManifest(args.manifestPath);

  const filtered = entries.filter((entry) => {
    if (args.only && entry.slug !== args.only) return false;
    if (args.force) return true;
    return true; // filtro de "já existe" acontece por entrada abaixo (precisa do path)
  });

  const pending = [];
  for (const entry of filtered) {
    const target = finalWebpPath(entry.slug, entry.name);
    if (!args.force && !args.dryRun && (await fileExists(target))) {
      console.log(`[generate-blog-images] pulando ${entry.slug}/${entry.name} (já existe ${target})`);
      continue;
    }
    pending.push(entry);
  }

  if (pending.length === 0) {
    console.log('[generate-blog-images] nada para gerar.');
    return;
  }

  console.log(
    `[generate-blog-images] processando ${pending.length} imagem(ns) com concorrência ${args.concurrency}${args.dryRun ? ' (dry-run)' : ''}...`
  );

  const tasks = pending.map((entry) => () => processEntry(entry, { dryRun: args.dryRun }));
  const results = await runWithConcurrency(tasks, args.concurrency);

  const failures = results
    .map((result, index) => ({ result, entry: pending[index] }))
    .filter(({ result }) => !result.ok);

  if (failures.length > 0) {
    console.error(`\n[generate-blog-images] ${failures.length} falha(s):`);
    for (const { entry, result } of failures) {
      console.error(`  - ${entry.slug}/${entry.name}: ${result.error?.message || result.error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('[generate-blog-images] concluído sem falhas.');
}

main().catch((err) => {
  console.error('[generate-blog-images] erro fatal:', err);
  process.exitCode = 1;
});
