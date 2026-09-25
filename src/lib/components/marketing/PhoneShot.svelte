<script>
  /** Caminho da screenshot real (webp), recorte de celular (proporção ~390:844). */
  export let src;
  /** Alt descritivo do que a tela mostra. */
  export let alt;
  /** Legenda curta opcional abaixo do device. */
  export let caption = '';
  export let width = 560;
  export let height = 1212;
</script>

<figure class="phone-shot">
  <div class="phone-glow" aria-hidden="true"></div>
  <div class="phone-frame">
    <img {src} {alt} {width} {height} loading="lazy" decoding="async" />
    <span class="phone-home-indicator" aria-hidden="true"></span>
  </div>
  {#if caption}
    <figcaption>{caption}</figcaption>
  {/if}
</figure>

<style>
  .phone-shot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 0;
    padding: 1.75rem 0;
  }

  .phone-glow {
    position: absolute;
    inset: -8% 10%;
    background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--primary) 24%, transparent), transparent 62%);
    pointer-events: none;
    z-index: 0;
  }

  .phone-frame {
    position: relative;
    z-index: 1;
    width: min(62%, 14rem);
    aspect-ratio: 390 / 844;
    padding: 0.5rem;
    border-radius: 2.15rem;
    background: linear-gradient(155deg, #1b2436 0%, #0c1220 55%, #060a14 100%);
    box-shadow:
      0 2.5rem 4rem -1.75rem rgba(0, 0, 0, 0.65),
      0 0 0 1px rgba(255, 255, 255, 0.06),
      inset 0 0 0 2px rgba(255, 255, 255, 0.04);
  }

  .phone-frame img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    border-radius: 1.65rem;
    background: var(--bg-app);
  }

  .phone-home-indicator {
    position: absolute;
    bottom: 0.7rem;
    left: 50%;
    width: 28%;
    height: 4px;
    transform: translateX(-50%);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.55);
  }

  figcaption {
    position: relative;
    z-index: 1;
    max-width: 22rem;
    margin-top: 1.1rem;
    color: var(--marketing-dark-muted);
    font-size: 0.8125rem;
    text-align: center;
  }

  @media (min-width: 640px) {
    .phone-frame {
      width: min(48%, 15.5rem);
    }
  }
</style>
