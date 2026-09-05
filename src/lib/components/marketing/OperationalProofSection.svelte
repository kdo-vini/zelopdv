<script>
  import { onMount } from 'svelte';
  import { ArrowRight, ScanSearch } from 'lucide-svelte';
  import { capturePostHogEvent } from '$lib/posthogClient';
  import {
    OPERATIONAL_PROOF_EVENTS,
    OPERATIONAL_PROOF_SCREENS,
    PUBLISHED_MENUS_URL,
  } from './operationalProof';

  let isHydrated = false;
  export let onPreview = null;

  onMount(() => {
    isHydrated = true;
    const handleClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const previewButton = target?.closest('[data-proof-screen]');
      if (previewButton) {
        const screen = OPERATIONAL_PROOF_SCREENS.find((item) => item.key === previewButton.dataset.proofScreen);
        if (screen) preview(screen, { currentTarget: previewButton });
        return;
      }

    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  });

  function preview(screen, event) {
    void capturePostHogEvent(OPERATIONAL_PROOF_EVENTS.previewed, { screen: screen.key });
    onPreview?.(screen.src, event.currentTarget);
  }

  function openPublishedMenus() {
    void capturePostHogEvent(OPERATIONAL_PROOF_EVENTS.publishedMenus);
  }

  function startTrial() {
    void capturePostHogEvent(OPERATIONAL_PROOF_EVENTS.trial, { placement: 'proof' });
  }
</script>

<section id="operational-proof" class="operational-proof" aria-labelledby="operational-proof-title" data-proof-ready={isHydrated ? 'true' : 'false'}>
  <div class="proof-shell">
    <div class="proof-heading">
      <span class="proof-kicker">Tela real do sistema</span>
      <h2 id="operational-proof-title">Veja o que realmente sobrou no fim do dia.</h2>
      <p>
        Vender R$ 3.000 no dia não quer dizer nada. O que importa é o que sobrou depois do aluguel, da luz e das retiradas. O Zelo faz essa conta para você.
      </p>
      <p class="proof-subcopy">O sistema que aparece aqui é o mesmo que organiza o caixa, mostra o que entrou e calcula o que realmente sobrou.</p>
    </div>

    <div class="proof-grid">
      {#each OPERATIONAL_PROOF_SCREENS as screen, index}
        <button
          type="button"
          class:proof-primary={index === 0}
          class="proof-shot"
          data-proof-screen={screen.key}
          aria-label={`Ampliar tela de ${screen.label.toLowerCase()}`}
        >
          <picture>
            <source type="image/webp" srcset={screen.srcset} sizes="(max-width: 768px) calc(100vw - 2rem), 50vw" />
            <img src={screen.src} alt={screen.alt} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
          </picture>
          <span class="proof-zoom"><ScanSearch class="size-5" aria-hidden="true" /> Ampliar tela</span>
        </button>
      {/each}
    </div>

    <div class="proof-flow" aria-label="Como o Zelo mostra o resultado do dia">
      <div><strong>O que entrou</strong><span>Vendas do caixa</span></div>
      <ArrowRight class="size-5" aria-hidden="true" />
      <div><strong>O que saiu</strong><span>Despesas e retiradas</span></div>
      <ArrowRight class="size-5" aria-hidden="true" />
      <div><strong>O que sobrou</strong><span>Resultado do negócio</span></div>
    </div>

    <div class="proof-trustbar">
      <div class="proof-facts" aria-label="Fatos verificáveis sobre o produto">
        <span><strong>14 dias</strong> sem cartão</span>
        <span><strong>Offline</strong> com sincronização</span>
        <span><strong>WhatsApp</strong> com suporte</span>
      </div>
      <div class="proof-actions">
        <a class="proof-link proof-trial" href="/cadastro" onclick={startTrial}>
          Testar 14 dias grátis <ArrowRight class="size-4" aria-hidden="true" />
        </a>
        <a
          class="proof-link"
          href={PUBLISHED_MENUS_URL}
          target="_blank"
          rel="noopener noreferrer"
          onclick={openPublishedMenus}
        >
          Ver cardápios publicados <ArrowRight class="size-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  </div>
</section>

<style>
  .operational-proof {
    padding: clamp(4.5rem, 8vw, 7rem) 0;
    border-top: 1px solid var(--marketing-line);
    background: var(--marketing-paper);
  }

  .proof-shell {
    width: min(100% - 3rem, 80rem);
    margin-inline: auto;
  }

  .proof-heading {
    max-width: 56rem;
    margin-bottom: 2.5rem;
  }

  .proof-kicker {
    display: inline-block;
    margin-bottom: 0.85rem;
    color: var(--primary);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .proof-heading h2 {
    margin: 0;
    color: var(--marketing-ink);
    font-size: clamp(2.25rem, 4.4vw, 4rem);
    font-weight: 750;
    letter-spacing: -0.04em;
    line-height: 1.03;
    text-wrap: balance;
  }

  .proof-heading p {
    max-width: 44rem;
    margin: 1.4rem 0 0;
    color: var(--marketing-ink-soft);
    font-size: 1.125rem;
    line-height: 1.7;
    text-wrap: pretty;
  }

  .proof-subcopy {
    margin-top: 0.75rem !important;
    font-size: 1rem !important;
  }

  .proof-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.75fr);
    gap: 1rem;
  }

  .proof-shot {
    position: relative;
    display: block;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--marketing-line);
    border-radius: 0.75rem;
    background: var(--marketing-dark-soft);
    cursor: zoom-in;
  }

  .proof-shot img {
    display: block;
    width: 100%;
    height: auto;
    transition: transform 360ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .proof-shot:hover img,
  .proof-shot:focus-visible img {
    transform: scale(1.012);
  }

  .proof-zoom {
    position: absolute;
    right: 1rem;
    bottom: 1rem;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.5rem;
    padding-inline: 0.85rem;
    border-radius: 999px;
    background: var(--marketing-paper-strong);
    color: var(--marketing-ink);
    font-size: 0.875rem;
    font-weight: 700;
    opacity: 0;
    transform: translateY(0.5rem);
    transition: opacity 180ms ease, transform 180ms ease;
  }

  .proof-shot:hover .proof-zoom,
  .proof-shot:focus-visible .proof-zoom {
    opacity: 1;
    transform: translateY(0);
  }

  .proof-flow {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr;
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
    padding: 1.15rem 1.25rem;
    border: 1px solid var(--marketing-line);
    border-radius: 0.75rem;
    background: var(--marketing-paper-strong);
  }

  .proof-flow > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .proof-flow strong {
    color: var(--marketing-ink);
    font-size: 0.875rem;
  }

  .proof-flow span {
    color: var(--marketing-ink-soft);
    font-size: 0.875rem;
  }

  .proof-flow > :global(svg) {
    color: var(--primary);
  }

  .proof-trustbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    margin-top: 1rem;
    padding: 1.15rem 1.25rem;
    border: 1px solid var(--marketing-line);
    border-radius: 0.75rem;
    background: var(--marketing-paper-strong);
  }

  .proof-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    color: var(--marketing-ink-soft);
    font-size: 0.875rem;
  }

  .proof-facts strong {
    color: var(--marketing-ink);
  }

  .proof-link {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    color: var(--primary);
    font-size: 0.875rem;
    font-weight: 800;
  }

  .proof-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem 1.25rem;
  }

  .proof-trial {
    padding-inline: 0.9rem;
    border-radius: 999px;
    background: var(--primary);
    color: var(--marketing-dark);
  }

  @media (max-width: 48rem) {
    .proof-grid {
      grid-template-columns: 1fr;
    }

    .proof-trustbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .proof-flow {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .proof-flow > div {
      align-items: center;
    }

    .proof-flow > :global(svg) {
      justify-self: center;
      transform: rotate(90deg);
    }

    .proof-actions {
      justify-content: flex-start;
    }
  }

  @media (max-width: 30rem) {
    .proof-shell {
      width: min(100% - 2rem, 80rem);
    }

    .proof-zoom {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .proof-shot img,
    .proof-zoom {
      transition: none;
    }
  }
</style>
