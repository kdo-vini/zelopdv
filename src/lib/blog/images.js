// Fonte única de constantes e helpers para imagens editoriais do blog.
// Isomorphic (sem imports de $env, roda no servidor e no cliente) — o
// gerador/otimizador em scripts/ importa as constantes de dimensão daqui
// para não duplicar número mágico em dois lugares.
//
// Convenção de arquivo em static/blog/<slug>/:
// - <name>.webp        — versão "full" (cover ou inline), já no tamanho final.
// - <name>-800.webp     — thumb 800px de largura, mesma proporção, para listagens.
//
// Contrato de dados (ver src/lib/blog/posts.js):
// - post.cover = { alt: string } → existe capa em /blog/<slug>/capa.webp.
// - Figuras inline são HTML puro dentro de post.content, produzidas com
//   inlineFigure() abaixo.

// Import relativo (não $lib) de propósito: este módulo também é importado
// diretamente por scripts/*.mjs via node puro (fora do resolver do Vite),
// que não entende o alias $lib.
import { absoluteUrl } from '../seo/site.js';

/** Raiz pública onde as imagens de blog vivem (static/blog). */
export const BLOG_IMAGE_ROOT = '/blog';

/** Nome de arquivo padrão da imagem de capa de um post. */
export const COVER_IMAGE_NAME = 'capa';

/** Formato final de toda imagem de blog. */
export const IMAGE_FORMAT = 'webp';

/** Dimensões da capa (full width do artigo, usada em og:image). */
export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 900;

/** Dimensões das figuras inline dentro do corpo do post. */
export const INLINE_WIDTH = 1200;
export const INLINE_HEIGHT = 675;

/** Largura da variante thumb (capa/figura reduzida para cards de listagem). */
export const THUMB_WIDTH = 800;

/**
 * Calcula a altura da variante thumb mantendo a proporção da imagem base.
 * @param {number} baseWidth
 * @param {number} baseHeight
 * @returns {number}
 */
function thumbHeight(baseWidth, baseHeight) {
  return Math.round((THUMB_WIDTH / baseWidth) * baseHeight);
}

/** Altura da thumb derivada da proporção da capa (1600x900 → 800x450). */
export const COVER_THUMB_HEIGHT = thumbHeight(COVER_WIDTH, COVER_HEIGHT);

/** Altura da thumb derivada da proporção inline (1200x675 → 800x450). */
export const INLINE_THUMB_HEIGHT = thumbHeight(INLINE_WIDTH, INLINE_HEIGHT);

/** Qualidade WebP usada pelo otimizador (0-100). */
export const WEBP_QUALITY = 82;

/**
 * Monta o caminho público de uma imagem de blog.
 * @param {string} slug - slug do post.
 * @param {string} name - nome do arquivo sem extensão (ex.: 'capa', 'estoque-critico').
 * @param {'full' | 'thumb'} [variant] - 'full' (padrão) ou 'thumb' (versão -800).
 * @returns {string} ex.: '/blog/meu-post/capa.webp' ou '/blog/meu-post/capa-800.webp'
 */
export function blogImagePath(slug, name, variant = 'full') {
  const suffix = variant === 'thumb' ? `-${THUMB_WIDTH}` : '';
  return `${BLOG_IMAGE_ROOT}/${slug}/${name}${suffix}.${IMAGE_FORMAT}`;
}

/**
 * Escapa texto para uso seguro dentro de um atributo HTML com aspas duplas.
 * @param {string} value
 * @returns {string}
 */
function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Monta os dados de exibição da capa de um post, ou null quando o post não
 * tem `cover` definido. Usado por src/routes/blog/[slug]/+page.svelte e
 * src/routes/blog/+page.svelte para renderizar <img> reais no lugar do
 * BlogCoverArt sintético.
 * @param {{ slug: string, cover?: { alt: string } }} post
 * @returns {{ src: string, srcset: string, thumbSrc: string, width: number, height: number, alt: string, absoluteUrl: string } | null}
 */
export function coverImage(post) {
  if (!post?.cover?.alt) return null;

  const src = blogImagePath(post.slug, COVER_IMAGE_NAME, 'full');
  const thumbSrc = blogImagePath(post.slug, COVER_IMAGE_NAME, 'thumb');

  return {
    src,
    thumbSrc,
    srcset: `${thumbSrc} ${THUMB_WIDTH}w, ${src} ${COVER_WIDTH}w`,
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    alt: post.cover.alt,
    absoluteUrl: absoluteUrl(src)
  };
}

/**
 * Monta o HTML de uma figura inline (imagem + legenda) para ser colado
 * dentro de post.content. Usa as constantes de dimensão do módulo e escapa
 * atributos — o autor do post só passa texto puro.
 * @param {{ slug: string, name: string, alt: string, caption?: string }} params
 * @returns {string}
 */
export function inlineFigure({ slug, name, alt, caption }) {
  const src = blogImagePath(slug, name, 'full');
  const thumbSrc = blogImagePath(slug, name, 'thumb');
  const srcset = `${thumbSrc} ${THUMB_WIDTH}w, ${src} ${INLINE_WIDTH}w`;
  const altAttr = escapeHtmlAttr(alt);

  const figcaption = caption
    ? `<figcaption>${escapeHtmlAttr(caption)}</figcaption>`
    : '';

  return (
    `<figure class="post-figure">` +
    `<img src="${src}" srcset="${srcset}" sizes="(min-width: 768px) ${INLINE_WIDTH}px, 100vw" ` +
    `alt="${altAttr}" width="${INLINE_WIDTH}" height="${INLINE_HEIGHT}" loading="lazy" decoding="async">` +
    `${figcaption}` +
    `</figure>`
  );
}
