import { describe, expect, it } from 'vitest';
import { getPostBySlug, publishedPosts } from '../src/lib/blog/posts.js';

describe('blog post taxa-ifood-2026-como-calcular', () => {
  const post = getPostBySlug('taxa-ifood-2026-como-calcular');

  it('is published and listed first by date', () => {
    expect(post).toBeTruthy();
    expect(publishedPosts.some((item) => item.slug === post.slug)).toBe(true);
    expect(post.publishedAt).toBe('2026-09-24');
  });

  it('keeps iFood fee claims attributed and ranged', () => {
    expect(post.content).toContain('blog-parceiros.ifood.com.br/taxas-ifood');
    expect(post.content).toContain('blog-parceiros.ifood.com.br/planos-ifood');
    expect(post.content).toContain('parceiros.ifood.com.br/restaurante/como-funciona/entregas');
    expect(post.content).toContain('~12%');
    expect(post.content).toContain('~23%');
    expect(post.content).toContain('zelopdv.com.br/sobre');
    expect(post.content).not.toMatch(/NFC-e|NF-e/);
  });

  it('includes FAQ, above-the-fold answer and tables', () => {
    expect(post.faq).toHaveLength(3);
    expect(post.content).toContain('<blockquote>');
    expect(post.content).toContain('<table>');
    expect(post.faq[0].question).toMatch(/Básico e Plano Entrega/);
  });
});
