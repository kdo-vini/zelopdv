// Redimensiona e converte para WebP uma imagem de blog (capa ou figura
// inline), gerando a versão "full" e a versão thumb (800px) no diretório
// static/blog/<slug>/. As dimensões e a qualidade vêm de
// src/lib/blog/images.js — fonte única compartilhada com o front-end, para
// o optimizador nunca desalinhar do que a página realmente renderiza.
//
// Uso como CLI:
//   node scripts/optimize-blog-image.mjs <input.png> <slug> <name>
//   node scripts/optimize-blog-image.mjs <input.png> <slug> <name> --inline
//   node scripts/optimize-blog-image.mjs <input.png> <slug> <name> --out-dir <dir>
//
// --inline usa as dimensões de figura inline (1200x675); sem a flag, usa as
// dimensões de capa (1600x900). --out-dir sobrescreve o diretório de saída
// (padrão: static/blog/<slug>) — usado pelos testes manuais fora de static/.
//
// Uso como módulo:
//   import { optimizeBlogImage } from './optimize-blog-image.mjs';
//   await optimizeBlogImage({ inputPath, slug, name, inline: false });

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  IMAGE_FORMAT,
  INLINE_HEIGHT,
  INLINE_WIDTH,
  THUMB_WIDTH,
  WEBP_QUALITY
} from '../src/lib/blog/images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Calcula a altura da thumb mantendo a proporção da imagem base — mesma
 * lógica de src/lib/blog/images.js, aplicada aqui em runtime de build.
 * @param {number} baseWidth
 * @param {number} baseHeight
 * @returns {number}
 */
function thumbHeightFor(baseWidth, baseHeight) {
  return Math.round((THUMB_WIDTH / baseWidth) * baseHeight);
}

/**
 * Gera as versões full (WxH) e thumb (800w) em WebP de uma imagem de origem.
 * @param {{ inputPath: string, slug: string, name: string, inline?: boolean, outDir?: string }} params
 * @returns {Promise<{ fullPath: string, thumbPath: string, width: number, height: number, thumbWidth: number, thumbHeight: number }>}
 */
export async function optimizeBlogImage({ inputPath, slug, name, inline = false, outDir }) {
  if (!inputPath || !slug || !name) {
    throw new Error('optimizeBlogImage requer inputPath, slug e name.');
  }

  const width = inline ? INLINE_WIDTH : COVER_WIDTH;
  const height = inline ? INLINE_HEIGHT : COVER_HEIGHT;
  const thumbWidth = THUMB_WIDTH;
  const thumbHeight = thumbHeightFor(width, height);

  const targetDir = outDir || path.join(REPO_ROOT, 'static', 'blog', slug);
  await fs.mkdir(targetDir, { recursive: true });

  const fullPath = path.join(targetDir, `${name}.${IMAGE_FORMAT}`);
  const thumbPath = path.join(targetDir, `${name}-${thumbWidth}.${IMAGE_FORMAT}`);

  const source = await fs.readFile(inputPath);

  await sharp(source)
    .resize({ width, height, fit: 'cover', position: 'attention' })
    .webp({ quality: WEBP_QUALITY })
    .withMetadata({}) // remove EXIF/GPS/comentários; mantém só o essencial de cor
    .toFile(fullPath);

  await sharp(source)
    .resize({ width: thumbWidth, height: thumbHeight, fit: 'cover', position: 'attention' })
    .webp({ quality: WEBP_QUALITY })
    .withMetadata({})
    .toFile(thumbPath);

  return { fullPath, thumbPath, width, height, thumbWidth, thumbHeight };
}

async function runCli() {
  const [, , inputArg, slugArg, nameArg, ...rest] = process.argv;

  if (!inputArg || !slugArg || !nameArg) {
    console.error(
      'Uso: node scripts/optimize-blog-image.mjs <input.png> <slug> <name> [--inline] [--out-dir <dir>]'
    );
    process.exitCode = 1;
    return;
  }

  const inline = rest.includes('--inline');
  const outDirFlagIndex = rest.indexOf('--out-dir');
  const outDir = outDirFlagIndex >= 0 ? rest[outDirFlagIndex + 1] : undefined;

  const result = await optimizeBlogImage({
    inputPath: path.resolve(inputArg),
    slug: slugArg,
    name: nameArg,
    inline,
    outDir: outDir ? path.resolve(outDir) : undefined
  });

  const fullStat = await fs.stat(result.fullPath);
  const thumbStat = await fs.stat(result.thumbPath);

  console.log(`[optimize-blog-image] ${slugArg}/${nameArg}`);
  console.log(
    `  full:  ${result.fullPath} (${result.width}x${result.height}, ${fullStat.size} bytes)`
  );
  console.log(
    `  thumb: ${result.thumbPath} (${result.thumbWidth}x${result.thumbHeight}, ${thumbStat.size} bytes)`
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  runCli().catch((err) => {
    console.error('[optimize-blog-image] falhou:', err);
    process.exitCode = 1;
  });
}
