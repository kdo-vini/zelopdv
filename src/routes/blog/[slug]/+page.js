import { error } from '@sveltejs/kit';
import { getPostBySlug } from '$lib/blog/posts';

export function load({ params }) {
  const post = getPostBySlug(params.slug);

  if (!post) {
    throw error(404, 'Artigo não encontrado');
  }

  return { post };
}
