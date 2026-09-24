<script>
  import { onMount, onDestroy } from 'svelte';
  import { capturePostHogEvent } from '$lib/posthogClient';
  import {
    createStartedOnceTracker,
    pickVideoFormat,
    videoAssetPaths,
  } from '$lib/marketing/productVideo';

  /** 'venda' | 'fiado' | 'zelinho' — nome do arquivo em static/videos/landing/. */
  export let name;
  /** Descrição em PT-BR do que o vídeo mostra (aria-label + alt do poster). */
  export let alt;
  /** Página onde o vídeo aparece, pro evento de analytics. */
  export let page = 'home';

  const mobileAssets = videoAssetPaths(name, 'mobile');
  const desktopAssets = videoAssetPaths(name, 'desktop');
  const markStarted = createStartedOnceTracker();

  let containerEl;
  let videoEl;
  let format = 'desktop';
  let src = '';
  let shouldLoad = false;
  let reducedMotion = false;
  let observer;

  function tryPlay() {
    if (!videoEl || reducedMotion) return;
    const playPromise = videoEl.play();
    // iOS em economia de dados/Low Power pode recusar o play(); o poster
    // continua visível (poster attr do <video>), nunca tela preta.
    playPromise?.catch(() => {});
  }

  function loadAndPlay() {
    if (!shouldLoad) {
      format = pickVideoFormat(window.innerWidth);
      src = videoAssetPaths(name, format).src;
      shouldLoad = true;
    }
    tryPlay();
  }

  function handlePlaying() {
    if (!markStarted(name)) return;
    void capturePostHogEvent('marketing_video_started', { video: name, format, page });
  }

  onMount(() => {
    reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || typeof IntersectionObserver === 'undefined') return;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadAndPlay();
          } else {
            videoEl?.pause();
          }
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(containerEl);
  });

  onDestroy(() => {
    observer?.disconnect();
  });
</script>

<div class="product-video" bind:this={containerEl} data-video={name}>
  {#if shouldLoad && !reducedMotion}
    <video
      bind:this={videoEl}
      {src}
      poster={format === 'mobile' ? mobileAssets.poster : desktopAssets.poster}
      width={format === 'mobile' ? 1080 : 1920}
      height={format === 'mobile' ? 1920 : 1080}
      muted
      playsinline
      loop
      autoplay
      preload="none"
      aria-label={alt}
      on:playing={handlePlaying}
    ></video>
  {:else}
    <picture>
      <source media="(max-width: 767px)" srcset={mobileAssets.poster} />
      <img
        src={desktopAssets.poster}
        alt={alt}
        width="1920"
        height="1080"
        loading="lazy"
        decoding="async"
      />
    </picture>
  {/if}
</div>

<style>
  .product-video {
    position: relative;
    display: block;
    width: 100%;
    overflow: hidden;
    border: 1px solid var(--marketing-line);
    border-radius: 0.75rem;
    background: var(--marketing-dark-soft);
    aspect-ratio: 16 / 9;
  }

  .product-video video,
  .product-video img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    touch-action: pan-y;
  }

  @media (max-width: 767px) {
    .product-video {
      width: min(100%, calc(70vh * 9 / 16));
      aspect-ratio: 9 / 16;
      max-height: 70vh;
      margin-inline: auto;
    }
  }
</style>
