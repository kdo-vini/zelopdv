<script>
  export let variant = 'aqua';
  export let compact = false;
  export let label = 'Blog do Zelo PDV';
  export let title = '';

  const iconMap = {
    aqua: '✦',
    sunrise: '◉',
    violet: '✺',
    slate: '◌',
    orbital: '◎',
    linen: '△',
    ember: '✳'
  };

  $: icon = iconMap[variant] || iconMap.aqua;
</script>

<div class={`cover cover-${variant} ${compact ? 'cover-compact' : 'cover-large'}`}>
  <div class="grain"></div>
  <div class="halo halo-a"></div>
  <div class="halo halo-b"></div>
  <div class="halo halo-c"></div>

  <div class="cover-pill">{label}</div>

  <div class="cover-center">
    <span class="cover-mark">{icon}</span>
    {#if title}
      <h3 class="cover-title">{title}</h3>
    {/if}
  </div>

  <div class="cover-shapes">
    <span class="shape shape-a"></span>
    <span class="shape shape-b"></span>
    <span class="shape shape-c"></span>
  </div>
</div>

<style>
  .cover {
    position: relative;
    overflow: hidden;
    border-bottom: 1px solid var(--blog-border);
    background: linear-gradient(135deg, var(--cover-base-start), var(--cover-base-end));
    isolation: isolate;
  }

  .cover-large {
    min-height: 21rem;
  }

  .cover-compact {
    min-height: 14rem;
  }

  .grain {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.28) 0, transparent 32%),
      radial-gradient(circle at 80% 0%, rgba(255, 255, 255, 0.22) 0, transparent 28%),
      radial-gradient(circle at 50% 100%, rgba(255, 255, 255, 0.18) 0, transparent 35%);
    opacity: 0.88;
    mix-blend-mode: screen;
  }

  .halo {
    position: absolute;
    border-radius: 9999px;
    filter: blur(28px);
    opacity: 0.9;
  }

  .halo-a {
    width: 16rem;
    height: 16rem;
    top: -4rem;
    right: -2rem;
    background: var(--cover-glow-a);
  }

  .halo-b {
    width: 18rem;
    height: 18rem;
    bottom: -7rem;
    left: -3rem;
    background: var(--cover-glow-b);
  }

  .halo-c {
    width: 12rem;
    height: 12rem;
    top: 30%;
    left: 32%;
    background: var(--cover-glow-c);
  }

  .cover-pill {
    position: absolute;
    top: 1.2rem;
    left: 1.2rem;
    z-index: 2;
    padding: 0.55rem 0.9rem;
    border-radius: 9999px;
    background: var(--blog-pill-bg);
    color: var(--blog-pill-text);
    font-size: 0.95rem;
    font-weight: 500;
    box-shadow: 0 8px 18px var(--blog-shadow);
    backdrop-filter: blur(16px);
  }

  .cover-center {
    position: relative;
    z-index: 2;
    min-height: inherit;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4.5rem 1.5rem 2rem;
  }

  .cover-mark {
    width: 4.8rem;
    height: 4.8rem;
    border-radius: 1.6rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.92);
    font-size: 2rem;
    box-shadow: 0 12px 32px rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(8px);
  }

  .cover-title {
    margin-top: 1rem;
    color: rgba(255, 255, 255, 0.96);
    font-size: clamp(2.1rem, 4vw, 4.1rem);
    line-height: 0.95;
    font-weight: 700;
    letter-spacing: -0.05em;
    max-width: 11ch;
    text-wrap: balance;
  }

  .cover-compact .cover-title {
    font-size: clamp(1.7rem, 3vw, 2.8rem);
    max-width: 9ch;
  }

  .cover-shapes {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .shape {
    position: absolute;
    display: block;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.42);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.36);
  }

  .shape-a {
    width: 4.25rem;
    height: 1.5rem;
    transform: rotate(-18deg);
    top: 20%;
    right: 24%;
  }

  .shape-b {
    width: 5rem;
    height: 1.8rem;
    transform: rotate(24deg);
    bottom: 18%;
    left: 18%;
  }

  .shape-c {
    width: 3.6rem;
    height: 1.3rem;
    transform: rotate(-28deg);
    bottom: 26%;
    right: 15%;
  }

  .cover-aqua {
    --cover-base-start: color-mix(in srgb, white 74%, var(--blog-glow-a));
    --cover-base-end: color-mix(in srgb, white 18%, var(--primary));
    --cover-glow-a: color-mix(in srgb, white 36%, var(--primary));
    --cover-glow-b: color-mix(in srgb, white 52%, var(--accent));
    --cover-glow-c: var(--blog-glow-c);
  }

  .cover-sunrise {
    --cover-base-start: color-mix(in srgb, white 70%, var(--blog-glow-b));
    --cover-base-end: color-mix(in srgb, white 12%, var(--warning));
    --cover-glow-a: color-mix(in srgb, white 30%, var(--warning));
    --cover-glow-b: color-mix(in srgb, white 45%, var(--error-light));
    --cover-glow-c: color-mix(in srgb, white 40%, var(--blog-glow-a));
  }

  .cover-violet {
    --cover-base-start: color-mix(in srgb, white 72%, var(--blog-glow-c));
    --cover-base-end: color-mix(in srgb, white 10%, var(--accent));
    --cover-glow-a: color-mix(in srgb, white 34%, var(--accent));
    --cover-glow-b: color-mix(in srgb, white 55%, var(--error-light));
    --cover-glow-c: color-mix(in srgb, white 45%, var(--blog-glow-b));
  }

  .cover-slate {
    --cover-base-start: color-mix(in srgb, white 78%, var(--blog-glow-c));
    --cover-base-end: color-mix(in srgb, white 22%, var(--blog-glow-a));
    --cover-glow-a: color-mix(in srgb, white 42%, var(--blog-glow-a));
    --cover-glow-b: color-mix(in srgb, white 38%, var(--blog-glow-c));
    --cover-glow-c: color-mix(in srgb, white 54%, var(--primary));
  }

  .cover-orbital {
    --cover-base-start: color-mix(in srgb, white 72%, var(--blog-glow-c));
    --cover-base-end: color-mix(in srgb, white 2%, var(--primary));
    --cover-glow-a: color-mix(in srgb, white 18%, var(--primary));
    --cover-glow-b: color-mix(in srgb, white 58%, var(--blog-glow-a));
    --cover-glow-c: color-mix(in srgb, white 50%, var(--blog-glow-c));
  }

  .cover-linen {
    --cover-base-start: color-mix(in srgb, white 80%, var(--blog-glow-b));
    --cover-base-end: color-mix(in srgb, white 46%, var(--blog-glow-c));
    --cover-glow-a: color-mix(in srgb, white 62%, var(--warning));
    --cover-glow-b: color-mix(in srgb, white 72%, var(--blog-glow-a));
    --cover-glow-c: color-mix(in srgb, white 42%, var(--success));
  }

  .cover-ember {
    --cover-base-start: color-mix(in srgb, white 76%, var(--warning));
    --cover-base-end: color-mix(in srgb, white 40%, var(--error-light));
    --cover-glow-a: color-mix(in srgb, white 52%, var(--warning));
    --cover-glow-b: color-mix(in srgb, white 28%, var(--warning));
    --cover-glow-c: color-mix(in srgb, white 60%, var(--error-light));
  }

  @media (max-width: 640px) {
    .cover-large {
      min-height: 17rem;
    }

    .cover-compact {
      min-height: 12rem;
    }

    .cover-pill {
      font-size: 0.84rem;
      padding: 0.45rem 0.75rem;
    }

    .cover-mark {
      width: 4rem;
      height: 4rem;
      font-size: 1.65rem;
    }
  }
</style>
