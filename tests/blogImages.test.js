import { describe, expect, it } from 'vitest';
import { SITE_URL } from '../src/lib/seo/site.js';
import {
  COVER_IMAGE_NAME,
  blogImagePath,
  COVER_HEIGHT,
  COVER_THUMB_HEIGHT,
  COVER_WIDTH,
  coverImage,
  IMAGE_FORMAT,
  inlineFigure,
  INLINE_HEIGHT,
  INLINE_WIDTH,
  THUMB_WIDTH
} from '../src/lib/blog/images.js';

describe('blog/images.js', () => {
  it('blogImagePath builds the full and thumb paths from slug + name', () => {
    expect(blogImagePath('meu-post', 'cover')).toBe(`/blog/meu-post/cover.${IMAGE_FORMAT}`);
    expect(blogImagePath('meu-post', 'cover', 'full')).toBe(`/blog/meu-post/cover.${IMAGE_FORMAT}`);
    expect(blogImagePath('meu-post', 'cover', 'thumb')).toBe(
      `/blog/meu-post/cover-${THUMB_WIDTH}.${IMAGE_FORMAT}`
    );
  });

  it('coverImage returns null when the post has no cover', () => {
    expect(coverImage({ slug: 'sem-capa' })).toBeNull();
    expect(coverImage({ slug: 'sem-capa', cover: {} })).toBeNull();
  });

  it('coverImage derives src/srcset/dimensions/absoluteUrl from the post slug + cover.alt', () => {
    const post = { slug: 'controle-de-fiado', cover: { alt: 'Dona de lanchonete no caixa' } };
    const image = coverImage(post);

    expect(image.src).toBe(`/blog/controle-de-fiado/${COVER_IMAGE_NAME}.${IMAGE_FORMAT}`);
    expect(image.thumbSrc).toBe(`/blog/controle-de-fiado/${COVER_IMAGE_NAME}-${THUMB_WIDTH}.${IMAGE_FORMAT}`);
    expect(image.width).toBe(COVER_WIDTH);
    expect(image.height).toBe(COVER_HEIGHT);
    expect(image.alt).toBe('Dona de lanchonete no caixa');
    expect(image.absoluteUrl).toBe(`${SITE_URL}/blog/controle-de-fiado/${COVER_IMAGE_NAME}.${IMAGE_FORMAT}`);
    expect(image.srcset).toContain(`${THUMB_WIDTH}w`);
    expect(image.srcset).toContain(`${COVER_WIDTH}w`);
  });

  it('COVER_THUMB_HEIGHT keeps the cover aspect ratio at THUMB_WIDTH', () => {
    expect(COVER_THUMB_HEIGHT).toBe(Math.round((THUMB_WIDTH / COVER_WIDTH) * COVER_HEIGHT));
  });

  it('inlineFigure renders a post-figure with img, srcset and figcaption', () => {
    const html = inlineFigure({
      slug: 'controle-de-fiado',
      name: 'planilha-fiado',
      alt: 'Planilha de fiado em papel',
      caption: 'Muita lanchonete ainda controla fiado assim.'
    });

    expect(html).toContain('<figure class="post-figure">');
    expect(html).toContain(`src="/blog/controle-de-fiado/planilha-fiado.${IMAGE_FORMAT}"`);
    expect(html).toContain(`srcset="/blog/controle-de-fiado/planilha-fiado-${THUMB_WIDTH}.${IMAGE_FORMAT}`);
    expect(html).toContain(`width="${INLINE_WIDTH}"`);
    expect(html).toContain(`height="${INLINE_HEIGHT}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('alt="Planilha de fiado em papel"');
    expect(html).toContain('<figcaption>Muita lanchonete ainda controla fiado assim.</figcaption>');
  });

  it('inlineFigure omits figcaption when caption is not provided', () => {
    const html = inlineFigure({ slug: 'post', name: 'img', alt: 'Alt texto' });
    expect(html).not.toContain('<figcaption>');
  });

  it('inlineFigure escapes quotes and angle brackets in alt/caption', () => {
    const html = inlineFigure({
      slug: 'post',
      name: 'img',
      alt: 'Caixa "aberto" <teste>',
      caption: 'Legenda com "aspas" & <tag>'
    });

    expect(html).toContain('alt="Caixa &quot;aberto&quot; &lt;teste&gt;"');
    expect(html).toContain('<figcaption>Legenda com &quot;aspas&quot; &amp; &lt;tag&gt;</figcaption>');
    expect(html).not.toContain('<tag>');
  });
});
