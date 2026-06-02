<script>
  import ReferralCard from '$lib/components/ReferralCard.svelte';

  const faqItems = [
    {
      question: 'Quando eu ganho os R$30 de crédito?',
      answer:
        'O crédito só é aprovado depois que o indicado vira cliente pagante e esse primeiro pagamento é confirmado manualmente pela equipe. Clique ou cadastro sozinho não libera recompensa.'
    },
    {
      question: 'O indicado ganha o quê?',
      answer:
        'Quem entra pelo seu link recebe uma condição especial definida pelo time ZeloPDV. Em geral isso entra como apoio na implantação, período de teste estendido ou outro benefício comercial equivalente.'
    },
    {
      question: 'O que pode fazer uma indicação ser rejeitada?',
      answer:
        'Os bloqueios mais rígidos são autoindicação da mesma empresa ou uso do mesmo e-mail do indicador. Casos suspeitos também podem passar por revisão manual antes de qualquer aprovação.'
    },
    {
      question: 'Preciso avisar o suporte para validar uma indicação?',
      answer:
        'Não para o tracking normal. Basta compartilhar o link ou código. Se você perceber um status incoerente depois do cadastro e onboarding, aí vale chamar o suporte para revisão manual.'
    },
    {
      question: 'Onde eu acompanho se a indicação avançou?',
      answer:
        'Nesta própria página. Aqui você vê cadastros, clientes pagos e recompensas pendentes, aprovadas ou aplicadas.'
    }
  ];
</script>

<svelte:head>
  <title>Minhas indicações — ZeloPDV</title>
</svelte:head>

<section class="wrap">
  <div class="header border-b border-slate-700/60 pb-4 mb-6">
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Outros / Indicações</p>
      <h1 class="text-xl font-bold text-slate-100 tracking-tight">Minhas indicações</h1>
      <span class="lede">
        Compartilhe seu código, acompanhe quem avançou no cadastro e veja quando seu crédito fica liberado.
      </span>
    </div>
  </div>

  <ReferralCard />

  <div class="faq-shell">
    <div class="section-copy">
      <p class="section-eyebrow">FAQ</p>
      <h2>Perguntas frequentes</h2>
    </div>

    <div class="faq-list">
      {#each faqItems as item}
        <details class="faq-item">
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      {/each}
    </div>
  </div>
</section>

<style>
  .wrap {
    padding: 16px;
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    gap: 1.25rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .header p,
  .section-eyebrow {
    margin: 0 0 0.25rem;
    color: var(--text-muted);
    text-transform: uppercase;
    font-size: 0.625rem;
    font-weight: 800;
    letter-spacing: 0.2em;
  }

  h1,
  h2 {
    margin: 0;
    color: var(--text-main);
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 700;
  }

  h2 {
    font-size: 1.05rem;
  }

  .lede,
  .faq-item p {
    display: block;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .lede {
    margin-top: 0.45rem;
    max-width: 760px;
  }

  .faq-shell,
  .section-copy,
  .faq-list {
    display: grid;
    gap: 0.9rem;
  }

  .section-copy {
    gap: 0.2rem;
  }

  .faq-item {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 0.95rem 1rem;
  }

  .faq-item summary {
    cursor: pointer;
    color: var(--text-main);
    font-weight: 700;
    list-style: none;
  }

  .faq-item summary::-webkit-details-marker {
    display: none;
  }

  .faq-item p {
    margin: 0.75rem 0 0;
  }
</style>
