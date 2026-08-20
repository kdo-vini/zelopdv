<script>
  import { page } from '$app/stores';

  $: status = $page.status;
  $: message = $page.error?.message ?? 'Erro interno do servidor';
  $: isInApp =
    $page.url?.pathname?.startsWith('/app') ||
    $page.url?.pathname?.startsWith('/gestao') ||
    $page.url?.pathname?.startsWith('/relatorios');
  $: backHref = isInApp ? '/app' : '/';
  $: backLabel = isInApp ? 'Voltar para o Painel' : 'Ir para a página inicial';
  $: errorType =
    status >= 500 ? 'InternalServerError' :
    status === 404 ? 'NotFound' :
    status === 403 ? 'Forbidden' :
    status === 401 ? 'Unauthorized' : 'HttpError';

  // 4xx: ícone e título por código
  $: icon4xx =
    status === 404 ? 'search_off' :
    status === 403 ? 'lock' :
    status === 401 ? 'key_off' : 'block';
  $: title4xx =
    status === 404 ? 'Página não encontrada.' :
    status === 403 ? 'Acesso negado.' :
    status === 401 ? 'Não autorizado.' : `Erro ${status}.`;
  $: desc4xx =
    status === 404 ? 'O endereço que você tentou acessar não existe ou foi removido. Verifique o link e tente novamente.' :
    status === 403 ? 'Você não tem permissão para acessar este recurso.' :
    status === 401 ? 'Você precisa estar autenticado para acessar esta página.' : message;

  const timestamp = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const requestId = `ZLO-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  let copied = false;
  function copyLogs() {
    const text = `Código: ${status}\nTipo: ${errorType}\nMensagem: ${message}\nTimestamp: ${timestamp}\nRequest ID: ${requestId}`;
    navigator.clipboard.writeText(text).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    });
  }

  $: waText = `Oi, tive um erro ${status} no Zelo PDV.\nMensagem: ${message}\nTimestamp: ${timestamp}\nID: ${requestId}`;
</script>

<svelte:head>
  <title>Erro {status} — Zelo PDV</title>
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
  />
</svelte:head>

<div class="error-page">
  <div class="grad-tr"></div>
  <div class="grad-bl"></div>

  {#if status >= 500}
  <!-- ── Layout 500: erro do sistema — painel técnico + WhatsApp ── -->
  <main class="error-main">
    <div class="error-grid">

      <div class="error-left">
        <div class="icon-wrap">
          <div class="icon-glow"></div>
          <div class="icon-card">
            <span class="material-symbols-outlined icon-main">settings_suggest</span>
          </div>
          <div class="icon-badge">
            <span class="material-symbols-outlined">priority_high</span>
          </div>
        </div>

        <div class="error-text">
          <h1 class="error-title">
            Opa! <br /><span class="title-accent">Algo não saiu<br />como planejado.</span>
          </h1>
          <p class="error-desc">
            Não se preocupe, os dados do seu caixa estão seguros. Nossa equipe técnica já foi
            avisada, mas você pode agilizar o atendimento enviando os detalhes abaixo para o
            nosso suporte.
          </p>
        </div>

        <div class="error-btns">
          <a href={backHref} class="btn-back">
            <span class="material-symbols-outlined">dashboard</span>
            {backLabel}
          </a>
          <a
            href="https://wa.me/5514991537503?text={encodeURIComponent(waText)}"
            target="_blank"
            rel="noopener"
            class="btn-wa"
          >
            <span class="material-symbols-outlined">chat</span>
            Enviar erro para o Suporte
          </a>
        </div>
      </div>

      <div class="error-right">
        <div class="tech-card">
          <div class="tech-header">
            <div class="th-left">
              <span class="pulse-dot"></span>
              <span class="th-label">Relatório Técnico</span>
            </div>
            <span class="material-symbols-outlined th-icon">code</span>
          </div>
          <div class="tech-body">
            <div class="tech-fields">
              <div class="field">
                <span class="field-label">Error Type</span>
                <span class="field-error">{errorType} ({status})</span>
              </div>
              <div class="field-row">
                <div class="field">
                  <span class="field-label">Timestamp</span>
                  <span>{timestamp}</span>
                </div>
                <div class="field">
                  <span class="field-label">Request ID</span>
                  <span class="mono">{requestId}</span>
                </div>
              </div>
              <div class="field">
                <span class="field-label">Mensagem</span>
                <div class="code-block">
                  <code>{message}</code>
                </div>
              </div>
            </div>
            <button class="btn-copy" on:click={copyLogs}>
              <span class="material-symbols-outlined">{copied ? 'check' : 'content_copy'}</span>
              {copied ? 'Copiado!' : 'Copiar logs para a área de transferência'}
            </button>
          </div>
        </div>
        <div class="security-tag">
          <span class="material-symbols-outlined">lock</span>
          <span>Conexão segura — seus dados estão protegidos</span>
        </div>
      </div>

    </div>
  </main>

  {:else}
  <!-- ── Layout 4xx: erro do usuário — simples, sem painel técnico ── -->
  <main class="error-main error-main--centered">
    <div class="error-400">

      <div class="icon-wrap">
        <div class="icon-glow"></div>
        <div class="icon-card">
          <span class="material-symbols-outlined icon-main">{icon4xx}</span>
        </div>
        <div class="icon-badge icon-badge--warn">
          <span class="badge-status">{status}</span>
        </div>
      </div>

      <div class="error-text" style="text-align: center; align-items: center;">
        <h1 class="error-title">{title4xx}</h1>
        <p class="error-desc">{desc4xx}</p>
      </div>

      <div class="error-btns" style="justify-content: center;">
        <a href={backHref} class="btn-back">
          <span class="material-symbols-outlined">arrow_back</span>
          {backLabel}
        </a>
      </div>

    </div>
  </main>
  {/if}

  <!-- Footer — mesmo estilo do app -->
  <footer class="error-footer">
    <div class="footer-inner">
      <span class="footer-copy">© {new Date().getFullYear()} <strong>Zelo PDV</strong></span>
      <span class="footer-dev">
        Desenvolvido com 💙 por
        <a href="https://techneia.com.br" target="_blank" rel="noopener noreferrer">Techne Sistemas</a>
      </span>
      <div class="footer-links">
        <a href="/termos">Termos de Uso</a>
        <a href="/privacidade">Privacidade</a>
      </div>
    </div>
  </footer>
</div>

<style>
  /* ── Página ── */
  .error-page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-app);
    color: var(--text-main);
    font-family: 'Inter', sans-serif;
    position: relative;
    overflow-x: hidden;
  }

  /* Gradientes decorativos */
  .grad-tr {
    position: fixed; top: 0; right: 0;
    width: 33%; height: 33%;
    background: rgba(14, 165, 233, 0.05);
    filter: blur(120px);
    pointer-events: none; z-index: -1;
  }
  .grad-bl {
    position: fixed; bottom: 0; left: 0;
    width: 25%; height: 25%;
    background: rgba(14, 165, 233, 0.04);
    filter: blur(100px);
    pointer-events: none; z-index: -1;
  }

  /* ── Main ── */
  .error-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
  }
  .error-grid {
    max-width: 56rem;
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
    align-items: center;
  }
  @media (min-width: 768px) {
    .error-grid { grid-template-columns: 7fr 5fr; }
  }

  /* Layout 4xx centralizado */
  .error-main--centered { align-items: center; }
  .error-400 {
    max-width: 36rem;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    text-align: center;
  }
  .icon-badge--warn { background: var(--warning, #f59e0b); }
  .badge-status {
    color: white; font-size: 0.7rem; font-weight: 800;
    font-family: 'Inter', sans-serif; line-height: 1;
  }

  /* ── Coluna esquerda ── */
  .error-left { display: flex; flex-direction: column; gap: 2rem; }

  /* Ícone */
  .icon-wrap { position: relative; width: 8rem; height: 8rem; }
  .icon-glow {
    position: absolute; inset: 0;
    background: rgba(14, 165, 233, 0.15);
    filter: blur(40px); border-radius: 9999px;
  }
  .icon-card {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    width: 100%; height: 100%;
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(12px);
    border-radius: 1.5rem;
    border: 1px solid rgba(51, 65, 85, 0.2);
  }
  .icon-main {
    color: var(--primary);
    font-size: 3.5rem;
    font-variation-settings: 'FILL' 1;
  }
  .icon-badge {
    position: absolute; top: -0.5rem; right: -0.5rem;
    width: 2.5rem; height: 2.5rem;
    background: var(--primary);
    display: flex; align-items: center; justify-content: center;
    border-radius: 0.75rem;
    box-shadow: 0 10px 15px rgba(14, 165, 233, 0.2);
  }
  .icon-badge .material-symbols-outlined { color: white; font-size: 1.25rem; }

  /* Texto */
  .error-text { display: flex; flex-direction: column; gap: 1rem; }
  .error-title {
    font-weight: 800;
    font-size: clamp(2rem, 5vw, 3.5rem);
    color: var(--text-main);
    line-height: 1.2;
    letter-spacing: -0.025em;
    margin: 0;
  }
  .title-accent { color: var(--primary); }
  .error-desc {
    color: var(--text-muted);
    font-size: 1.125rem;
    line-height: 1.6;
    max-width: 36rem;
    margin: 0;
  }

  /* Botões */
  .error-btns { display: flex; flex-direction: column; gap: 1rem; padding-top: 1rem; }
  @media (min-width: 640px) { .error-btns { flex-direction: row; } }

  .btn-back, .btn-wa {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 0.5rem; padding: 1rem 2rem;
    font-weight: 700; border-radius: 0.75rem;
    text-decoration: none; transition: all 0.2s; font-size: 0.95rem;
  }
  .btn-back {
    background: var(--primary); color: white;
    box-shadow: 0 10px 15px rgba(14, 165, 233, 0.15);
  }
  .btn-back:hover { background: var(--primary-hover); transform: translateY(-1px); }
  .btn-back:active, .btn-wa:active { transform: scale(0.97); }
  .btn-wa {
    background: #25D366; color: white;
    box-shadow: 0 10px 15px rgba(37, 211, 102, 0.1);
  }
  .btn-wa:hover { background: #20ba59; transform: translateY(-1px); }

  /* ── Coluna direita ── */
  .tech-card {
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(12px);
    border-radius: 1rem;
    border: 1px solid rgba(51, 65, 85, 0.1);
    overflow: hidden;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
  }
  .tech-header {
    background: var(--bg-card);
    padding: 1rem 1.5rem;
    display: flex; align-items: center; justify-content: space-between;
  }
  .th-left { display: flex; align-items: center; gap: 0.5rem; }
  .pulse-dot {
    width: 0.5rem; height: 0.5rem;
    border-radius: 9999px;
    background: var(--error);
    display: inline-block;
    animation: pulse 2s infinite;
  }
  .th-label {
    font-weight: 700; font-size: 0.75rem;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--text-muted);
  }
  .th-icon { color: var(--text-muted); font-size: 1.125rem; }

  .tech-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
  .tech-fields { display: flex; flex-direction: column; gap: 1rem; }

  .field { display: flex; flex-direction: column; }
  .field-label {
    font-size: 0.625rem; text-transform: uppercase;
    letter-spacing: 0.15em; color: rgba(148, 163, 184, 0.6);
    font-weight: 700; margin-bottom: 0.25rem;
  }
  .field span { font-size: 0.875rem; color: var(--text-main); }
  .field-error { color: var(--error) !important; font-weight: 500; }
  .mono { font-family: monospace; }

  .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

  .code-block {
    background: rgba(11, 18, 32, 0.5);
    border-radius: 0.5rem; padding: 0.75rem;
    border: 1px solid rgba(51, 65, 85, 0.05);
  }
  .code-block code {
    font-size: 0.75rem; color: rgba(148, 163, 184, 0.8);
    font-family: monospace; word-break: break-all; line-height: 1.5;
  }

  .btn-copy {
    width: 100%; padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: var(--bg-card); color: var(--text-main);
    font-size: 0.875rem; font-weight: 600;
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
    border: none; cursor: pointer; transition: background 0.2s;
    font-family: 'Inter', sans-serif;
  }
  .btn-copy:hover { background: var(--bg-panel); }
  .btn-copy .material-symbols-outlined { color: var(--primary); font-size: 1.25rem; }

  .security-tag {
    margin-top: 1rem;
    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
    color: rgba(148, 163, 184, 0.4);
  }
  .security-tag .material-symbols-outlined { font-size: 0.875rem; }
  .security-tag span:last-child {
    font-size: 0.625rem; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.05em;
  }

  /* ── Footer ── */
  .error-footer {
    border-top: 1px solid var(--border-subtle);
    padding: 1rem 2rem;
    background: var(--bg-panel);
    margin-top: auto;
  }
  .footer-inner {
    max-width: 72rem; margin: 0 auto;
    display: flex; flex-wrap: wrap;
    align-items: center; justify-content: space-between; gap: 0.75rem;
  }
  .footer-copy { font-size: 0.75rem; color: var(--text-muted); }
  .footer-copy strong { color: var(--text-main); }
  .footer-dev { font-size: 0.75rem; color: var(--text-muted); }
  .footer-dev a { color: var(--accent); font-weight: 500; text-decoration: none; }
  .footer-dev a:hover { text-decoration: underline; }
  .footer-links { display: flex; gap: 1.5rem; }
  .footer-links a {
    font-size: 0.75rem; color: var(--text-muted);
    text-decoration: none; transition: color 0.2s;
  }
  .footer-links a:hover { color: var(--primary); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
