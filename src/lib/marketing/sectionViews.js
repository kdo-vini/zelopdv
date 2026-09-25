import { capturePostHogEvent } from '$lib/posthogClient';

export const SECTION_VIEWED_EVENT = 'marketing_section_viewed';

/**
 * Dispara `marketing_section_viewed` uma vez por seção quando o topo dela
 * passa de 60% da altura da tela. Mede até onde a página é lida de fato — o
 * scroll % do $pageleave não diz quais blocos foram vistos.
 *
 * Marque as seções com `data-track-section="nome"`. Devolve a função de limpeza.
 * @param {ParentNode} root
 * @param {{ page?: string, capture?: typeof capturePostHogEvent }} [options]
 */
export function observeSectionViews(root, { page = '', capture = capturePostHogEvent } = {}) {
  if (!root || typeof IntersectionObserver === 'undefined') return () => {};

  const sections = [...root.querySelectorAll('[data-track-section]')];
  if (!sections.length) return () => {};

  const seen = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const name = entry.target.getAttribute('data-track-section');
        if (!name || seen.has(name)) continue;
        seen.add(name);
        observer.unobserve(entry.target);
        void capture(SECTION_VIEWED_EVENT, {
          section: name,
          order: sections.indexOf(entry.target) + 1,
          total_sections: sections.length,
          page,
        });
      }
    },
    // Seção "vista" quando entra nos 60% de cima da tela, valha para blocos
    // curtos ou mais altos que a própria tela.
    { rootMargin: '0px 0px -40% 0px', threshold: 0 },
  );

  for (const section of sections) observer.observe(section);
  return () => observer.disconnect();
}
