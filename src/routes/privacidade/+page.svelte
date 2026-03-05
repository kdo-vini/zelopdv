<svelte:head>
  <title>Política de Privacidade — Zelo PDV</title>
  <meta name="robots" content="noindex, follow" />
</svelte:head>

<script>
  // Lista de seções do sumário — usada tanto no TOC desktop quanto nos jump-links mobile
  const sections = [
    { id: 'controlador',      label: '1. Controlador dos Dados' },
    { id: 'encarregado',      label: '2. Encarregado (DPO)' },
    { id: 'dados',            label: '3. Dados Coletados' },
    { id: 'base-legal',       label: '4. Base Legal do Tratamento' },
    { id: 'finalidade',       label: '5. Finalidade do Tratamento' },
    { id: 'compartilhamento', label: '6. Compartilhamento com Terceiros' },
    { id: 'transferencia',    label: '7. Transferência Internacional' },
    { id: 'retencao',         label: '8. Retenção de Dados' },
    { id: 'seguranca',        label: '9. Segurança' },
    { id: 'direitos',         label: '10. Direitos do Titular' },
    { id: 'cookies',          label: '11. Cookies e Tecnologias Similares' },
    { id: 'menores',          label: '12. Menores de Idade' },
    { id: 'alteracoes',       label: '13. Alterações nesta Política' },
    { id: 'contato',          label: '14. Contato e Canal do Encarregado' },
  ];
</script>

<div class="privacy-page">

  <!-- ── CABEÇALHO ── -->
  <header class="privacy-header">
    <div class="badge-update">Última atualização: Março de 2026</div>
    <h1 class="privacy-title">Política de Privacidade</h1>

    <!-- Caixa de destaque LGPD -->
    <div class="lgpd-callout" role="note" aria-label="Conformidade com a LGPD">
      <div class="lgpd-callout-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-shield">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <p>
        Esta Política está em conformidade com a <strong>Lei Geral de Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018)</strong> e demais normas aplicáveis, incluindo as regulamentações da Autoridade Nacional de Proteção de Dados (ANPD).
      </p>
    </div>

    <p class="privacy-intro">
      A Téchne Sistemas ("Empresa", "nós") respeita sua privacidade e está comprometida com a proteção dos seus dados pessoais. Esta Política descreve quais dados coletamos, como os utilizamos, com quem os compartilhamos e quais são os seus direitos como titular.
    </p>
  </header>

  <!-- ── JUMP-LINKS MOBILE (visível apenas em telas pequenas) ── -->
  <nav class="mobile-toc" aria-label="Sumário — navegação rápida">
    <p class="mobile-toc-label">Ir para a seção:</p>
    <ul class="mobile-toc-list">
      {#each sections as sec}
        <li>
          <a href="#{sec.id}" class="mobile-toc-link">{sec.label}</a>
        </li>
      {/each}
    </ul>
  </nav>

  <!-- ── CORPO PRINCIPAL: ASIDE + CONTEÚDO ── -->
  <div class="privacy-body">

    <!-- TOC Sidebar (fixo no desktop) -->
    <aside class="privacy-toc" aria-label="Sumário">
      <p class="toc-heading">Sumário</p>
      <nav>
        <ul class="toc-list">
          {#each sections as sec}
            <li>
              <a href="#{sec.id}" class="toc-link">{sec.label}</a>
            </li>
          {/each}
        </ul>
      </nav>
    </aside>

    <!-- Conteúdo da política -->
    <article class="privacy-content" aria-label="Conteúdo da Política de Privacidade">

      <!-- ── 1. Controlador ── -->
      <section id="controlador" aria-labelledby="heading-controlador">
        <h2 id="heading-controlador" class="section-title">1. Controlador dos Dados</h2>
        <p>
          Nos termos do Art. 5º, VI da LGPD, o controlador dos dados pessoais tratados nesta Política é:
        </p>
        <div class="info-card">
          <p><strong>Téchne Sistemas</strong></p>
          <p>CNPJ: (a informar)</p>
          <p>Endereço: Bauru, São Paulo, Brasil</p>
          <p>E-mail: <a href="mailto:techne.br@gmail.com" class="inline-link">techne.br@gmail.com</a></p>
          <p>Site: <a href="https://zelopdv.com.br" target="_blank" rel="noopener noreferrer" class="inline-link">zelopdv.com.br</a></p>
        </div>
      </section>

      <hr class="section-divider" />

      <!-- ── 2. Encarregado ── -->
      <section id="encarregado" aria-labelledby="heading-encarregado">
        <h2 id="heading-encarregado" class="section-title">2. Encarregado (DPO)</h2>
        <p>
          O Encarregado pelo Tratamento de Dados Pessoais (Data Protection Officer — DPO), conforme Art. 41 da LGPD, pode ser contatado pelo e-mail:
          <a href="mailto:techne.br@gmail.com?subject=LGPD%20%E2%80%94%20Encarregado%20de%20Dados" class="inline-link font-semibold">techne.br@gmail.com</a>,
          com o assunto <strong>"LGPD — Encarregado de Dados"</strong>.
        </p>
      </section>

      <hr class="section-divider" />

      <!-- ── 3. Dados Coletados ── -->
      <section id="dados" aria-labelledby="heading-dados">
        <h2 id="heading-dados" class="section-title">3. Dados Coletados</h2>
        <p>Coletamos as seguintes categorias de dados:</p>

        <h3 class="subsection-title">3.1 Dados de Cadastro</h3>
        <ul class="prose-list">
          <li>Nome completo</li>
          <li>Endereço de e-mail</li>
          <li>Senha (armazenada de forma criptografada via hash — nunca em texto simples)</li>
        </ul>

        <h3 class="subsection-title">3.2 Dados do Estabelecimento</h3>
        <ul class="prose-list">
          <li>Nome da empresa/lanchonete</li>
          <li>Logotipo (imagem enviada voluntariamente pelo usuário)</li>
        </ul>

        <h3 class="subsection-title">3.3 Dados Operacionais do Negócio</h3>
        <p>Inseridos pelo próprio usuário para uso do sistema:</p>
        <ul class="prose-list">
          <li>Produtos, categorias, preços e estoque</li>
          <li>Registros de vendas e formas de pagamento</li>
          <li>Dados de clientes e fornecedores cadastrados pelo usuário (nome, contato, saldo de crédito)</li>
          <li>Movimentações financeiras e de caixa</li>
        </ul>

        <h3 class="subsection-title">3.4 Dados de Pagamento</h3>
        <p>
          Processados diretamente pela Stripe (terceiro). A Empresa recebe apenas confirmação de pagamento e identificadores de assinatura. Dados completos de cartão de crédito <strong>não</strong> são armazenados em nossos servidores.
        </p>

        <h3 class="subsection-title">3.5 Dados Técnicos (coletados automaticamente)</h3>
        <ul class="prose-list">
          <li>Endereço IP</li>
          <li>Tipo de navegador e dispositivo</li>
          <li>Sistema operacional</li>
          <li>Páginas acessadas e tempo de sessão</li>
          <li>Logs de acesso (para segurança e diagnóstico)</li>
        </ul>
      </section>

      <hr class="section-divider" />

      <!-- ── 4. Base Legal ── -->
      <section id="base-legal" aria-labelledby="heading-base-legal">
        <h2 id="heading-base-legal" class="section-title">4. Base Legal do Tratamento</h2>
        <p>Tratamos seus dados com fundamento nas seguintes bases legais do Art. 7º da LGPD:</p>

        <div class="table-wrapper" role="region" aria-label="Tabela de bases legais">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Base Legal</th>
                <th scope="col">Aplicação</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Execução de contrato</strong> (Art. 7º, V)</td>
                <td>Criação de conta, gestão da assinatura, funcionamento do serviço</td>
              </tr>
              <tr>
                <td><strong>Legítimo interesse</strong> (Art. 7º, IX)</td>
                <td>Segurança, prevenção de fraudes, melhoria do serviço, logs técnicos</td>
              </tr>
              <tr>
                <td><strong>Cumprimento de obrigação legal</strong> (Art. 7º, II)</td>
                <td>Manutenção de registros conforme exigência legal</td>
              </tr>
              <tr>
                <td><strong>Consentimento</strong> (Art. 7º, I)</td>
                <td>Comunicações de marketing (quando aplicável, com opção de opt-out)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <hr class="section-divider" />

      <!-- ── 5. Finalidade ── -->
      <section id="finalidade" aria-labelledby="heading-finalidade">
        <h2 id="heading-finalidade" class="section-title">5. Finalidade do Tratamento</h2>
        <p>Utilizamos seus dados para:</p>
        <ul class="prose-list">
          <li>Criar e gerenciar sua conta e assinatura no Zelo PDV</li>
          <li>Processar pagamentos e gerenciar cobranças</li>
          <li>Fornecer suporte técnico e atendimento ao cliente</li>
          <li>Melhorar e desenvolver novas funcionalidades do Serviço</li>
          <li>Enviar comunicações essenciais do serviço (alertas de cobrança, atualizações de termos)</li>
          <li>Garantir a segurança, integridade e disponibilidade do Serviço</li>
          <li>Cumprir obrigações legais e regulatórias aplicáveis</li>
          <li>Produzir estatísticas e análises internas (sempre de forma anonimizada/agregada)</li>
        </ul>
        <p class="mt-4">
          Não utilizamos seus dados para venda a terceiros ou para fins publicitários de terceiros.
        </p>
      </section>

      <hr class="section-divider" />

      <!-- ── 6. Compartilhamento ── -->
      <section id="compartilhamento" aria-labelledby="heading-compartilhamento">
        <h2 id="heading-compartilhamento" class="section-title">6. Compartilhamento com Terceiros</h2>
        <p>
          Compartilhamos dados estritamente com os parceiros necessários para a operação do Serviço, todos vinculados a contratos de proteção de dados:
        </p>

        <div class="partner-card">
          <h3 class="partner-name">6.1 Supabase <span class="partner-domain">(supabase.io)</span></h3>
          <p>
            Provedor de banco de dados, autenticação e armazenamento de arquivos. Processa dados de cadastro, dados operacionais e logs. Certificado SOC 2 Type II.
          </p>
          <p class="mt-2">
            Política de privacidade:
            <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" class="inline-link">supabase.com/privacy</a>
          </p>
        </div>

        <div class="partner-card">
          <h3 class="partner-name">6.2 Stripe <span class="partner-domain">(stripe.com)</span></h3>
          <p>
            Processador de pagamentos. Processa dados de cobrança e cartão de crédito. PCI DSS Level 1 certificado.
          </p>
          <p class="mt-2">
            Política de privacidade:
            <a href="https://stripe.com/br/privacy" target="_blank" rel="noopener noreferrer" class="inline-link">stripe.com/br/privacy</a>
          </p>
        </div>

        <div class="partner-card">
          <h3 class="partner-name">6.3 Vercel <span class="partner-domain">(vercel.com)</span></h3>
          <p>
            Plataforma de hospedagem e entrega de conteúdo (CDN). Processa dados de tráfego e requisições.
          </p>
          <p class="mt-2">
            Política de privacidade:
            <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" class="inline-link">vercel.com/legal/privacy-policy</a>
          </p>
        </div>

        <p class="mt-4">
          Não compartilhamos dados pessoais com anunciantes, brokers de dados ou qualquer terceiro não listado acima sem seu consentimento explícito.
        </p>
      </section>

      <hr class="section-divider" />

      <!-- ── 7. Transferência Internacional ── -->
      <section id="transferencia" aria-labelledby="heading-transferencia">
        <h2 id="heading-transferencia" class="section-title">7. Transferência Internacional de Dados</h2>
        <p>
          Os parceiros Supabase, Stripe e Vercel possuem infraestrutura nos Estados Unidos e/ou na União Europeia. As transferências internacionais são realizadas com amparo em cláusulas contratuais padrão (Standard Contractual Clauses — SCCs) e mecanismos equivalentes, em conformidade com o Art. 33 da LGPD e as diretrizes da ANPD.
        </p>
      </section>

      <hr class="section-divider" />

      <!-- ── 8. Retenção ── -->
      <section id="retencao" aria-labelledby="heading-retencao">
        <h2 id="heading-retencao" class="section-title">8. Retenção de Dados</h2>

        <div class="table-wrapper" role="region" aria-label="Tabela de prazos de retenção de dados">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Categoria de Dado</th>
                <th scope="col">Período de Retenção</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Dados de conta (e-mail, perfil)</td>
                <td>Durante a vigência da conta + 5 anos após encerramento</td>
              </tr>
              <tr>
                <td>Dados operacionais (vendas, produtos)</td>
                <td>Durante a vigência da conta + 5 anos</td>
              </tr>
              <tr>
                <td>Dados de pagamento (logs Stripe)</td>
                <td>10 anos (obrigação fiscal/legal)</td>
              </tr>
              <tr>
                <td>Logs de acesso técnico</td>
                <td>6 meses</td>
              </tr>
              <tr>
                <td>Dados anonimizados e agregados</td>
                <td>Indefinidamente</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="mt-4">
          Após o prazo de retenção, os dados são eliminados de forma segura ou anonimizados.
        </p>
      </section>

      <hr class="section-divider" />

      <!-- ── 9. Segurança ── -->
      <section id="seguranca" aria-labelledby="heading-seguranca">
        <h2 id="heading-seguranca" class="section-title">9. Segurança</h2>
        <p>Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados:</p>
        <ul class="prose-list">
          <li>Transmissão criptografada via HTTPS/TLS em todos os acessos</li>
          <li>Senhas armazenadas apenas como hash criptográfico (nunca em texto plano)</li>
          <li>Controle de acesso baseado em funções (Row Level Security — RLS no banco de dados)</li>
          <li>Chaves de API de alto privilégio restritas a ambiente de servidor, nunca expostas ao frontend</li>
          <li>Monitoramento de atividades suspeitas e logs de auditoria</li>
          <li>Backups automáticos com criptografia</li>
        </ul>
        <p class="mt-4">
          Em caso de incidente de segurança que afete seus dados, notificaremos os titulares afetados e a ANPD nos prazos previstos em lei.
        </p>
      </section>

      <hr class="section-divider" />

      <!-- ── 10. Direitos do Titular ── -->
      <section id="direitos" aria-labelledby="heading-direitos">
        <h2 id="heading-direitos" class="section-title">10. Direitos do Titular</h2>
        <p>Nos termos do Art. 18 da LGPD, você tem os seguintes direitos:</p>

        <ol class="rights-list">
          <li>
            <strong>Confirmação e Acesso:</strong> Saber se tratamos seus dados e obter cópia deles.
          </li>
          <li>
            <strong>Correção:</strong> Corrigir dados incompletos, inexatos ou desatualizados.
          </li>
          <li>
            <strong>Anonimização, Bloqueio ou Eliminação:</strong> Solicitar que dados desnecessários ou tratados em desconformidade sejam anonimizados, bloqueados ou eliminados.
          </li>
          <li>
            <strong>Portabilidade:</strong> Receber seus dados em formato estruturado e interoperável.
          </li>
          <li>
            <strong>Eliminação:</strong> Solicitar a exclusão de dados tratados com base em consentimento.
          </li>
          <li>
            <strong>Informação sobre Compartilhamento:</strong> Saber com quais entidades compartilhamos seus dados.
          </li>
          <li>
            <strong>Revogação do Consentimento:</strong> Retirar consentimento previamente concedido.
          </li>
          <li>
            <strong>Oposição:</strong> Se opor a tratamentos realizados com base em legítimo interesse que violem seus direitos.
          </li>
          <li>
            <strong>Revisão de Decisões Automatizadas:</strong> Solicitar revisão humana de decisões tomadas automaticamente.
          </li>
          <li>
            <strong>Petição à ANPD:</strong> Peticionar contra o controlador perante a Autoridade Nacional de Proteção de Dados.
          </li>
        </ol>

        <div class="highlight-box" role="note">
          Para exercer qualquer desses direitos, entre em contato pelo e-mail
          <a href="mailto:techne.br@gmail.com?subject=LGPD%20%E2%80%94%20Exerc%C3%ADcio%20de%20Direitos" class="inline-link font-semibold">techne.br@gmail.com</a>
          com o assunto <strong>"LGPD — Exercício de Direitos"</strong>. Responderemos em até <strong>15 (quinze) dias corridos</strong>.
        </div>
      </section>

      <hr class="section-divider" />

      <!-- ── 11. Cookies ── -->
      <section id="cookies" aria-labelledby="heading-cookies">
        <h2 id="heading-cookies" class="section-title">11. Cookies e Tecnologias Similares</h2>
        <p>O Zelo PDV utiliza:</p>
        <ul class="prose-list">
          <li>
            <strong>Cookies de sessão:</strong> Necessários para manter o usuário autenticado. Não armazenam dados sensíveis.
          </li>
          <li>
            <strong>LocalStorage / IndexedDB:</strong> Utilizados para funcionalidade offline do PDV (cache de produtos e vendas para uso sem conexão).
          </li>
          <li>
            <strong>Cookies de autenticação (Supabase):</strong> Gerenciam a sessão de login de forma segura.
          </li>
        </ul>
        <p class="mt-4">
          Não utilizamos cookies de rastreamento, publicidade comportamental ou ferramentas de analytics de terceiros como Google Analytics.
        </p>
        <p class="mt-4">
          Você pode limpar cookies e dados locais a qualquer momento pelas configurações do seu navegador, porém isso encerrará sua sessão no sistema.
        </p>
      </section>

      <hr class="section-divider" />

      <!-- ── 12. Menores ── -->
      <section id="menores" aria-labelledby="heading-menores">
        <h2 id="heading-menores" class="section-title">12. Menores de Idade</h2>
        <p>
          O Serviço é destinado exclusivamente a pessoas maiores de 18 (dezoito) anos, titulares ou responsáveis por negócios. Não coletamos intencionalmente dados de menores. Se identificarmos coleta acidental de dados de menores, procederemos à eliminação imediata. Em caso de dúvida, entre em contato conosco.
        </p>
      </section>

      <hr class="section-divider" />

      <!-- ── 13. Alterações ── -->
      <section id="alteracoes" aria-labelledby="heading-alteracoes">
        <h2 id="heading-alteracoes" class="section-title">13. Alterações nesta Política</h2>
        <p>
          Podemos atualizar esta Política periodicamente para refletir mudanças em nossas práticas ou na legislação aplicável. Alterações relevantes serão comunicadas por e-mail com antecedência de 15 (quinze) dias. A data de "Última atualização" no topo desta página indica a versão vigente.
        </p>
      </section>

      <hr class="section-divider" />

      <!-- ── 14. Contato ── -->
      <section id="contato" aria-labelledby="heading-contato">
        <h2 id="heading-contato" class="section-title">14. Contato e Canal do Encarregado</h2>
        <p>Para exercer seus direitos, tirar dúvidas ou registrar uma reclamação:</p>

        <div class="contact-grid">
          <div class="contact-item">
            <span class="contact-label">E-mail (DPO)</span>
            <a href="mailto:techne.br@gmail.com?subject=LGPD" class="inline-link">
              techne.br@gmail.com — assunto: "LGPD"
            </a>
          </div>
          <div class="contact-item">
            <span class="contact-label">WhatsApp</span>
            <a href="https://wa.me/5514991537503" target="_blank" rel="noopener noreferrer" class="inline-link">
              +55 (14) 99153-7503
            </a>
          </div>
          <div class="contact-item">
            <span class="contact-label">Prazo de resposta</span>
            <span>até 15 dias corridos</span>
          </div>
          <div class="contact-item">
            <span class="contact-label">ANPD</span>
            <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" class="inline-link">
              gov.br/anpd
            </a>
          </div>
        </div>

        <p class="mt-4">
          Caso não fique satisfeito com nossa resposta, você pode peticionar perante a <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>:
          <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" class="inline-link">gov.br/anpd</a>.
        </p>
      </section>

      <!-- ── RODAPÉ DA POLÍTICA ── -->
      <footer class="policy-footer">
        <p>
          Veja também nossos <a href="/termos" class="inline-link font-semibold">Termos de Uso</a>.
        </p>
        <a href="/" class="btn-back" aria-label="Voltar à página inicial do Zelo PDV">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="btn-back-icon" aria-hidden="true">
            <path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd" />
          </svg>
          Voltar ao início
        </a>
      </footer>

    </article>
  </div>
</div>

<style>
  /* ── LAYOUT ── */
  .privacy-page {
    max-width: 56rem; /* ~896px / max-w-4xl, contenido dentro do max-w-6xl do layout */
    margin-left: auto;
    margin-right: auto;
  }

  /* ── CABEÇALHO ── */
  .privacy-header {
    margin-bottom: 2rem;
  }

  .badge-update {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    background-color: var(--bg-card);
    margin-bottom: 1rem;
  }

  .privacy-title {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 1.25rem;
    line-height: 1.2;
  }

  /* ── CAIXA LGPD ── */
  .lgpd-callout {
    display: flex;
    gap: 0.875rem;
    align-items: flex-start;
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid var(--accent);
    background-color: var(--accent-light);
    color: var(--text-main);
    margin-bottom: 1.25rem;
    font-size: 0.9rem;
    line-height: 1.6;
  }

  .lgpd-callout strong {
    color: var(--text-main);
  }

  .lgpd-callout-icon {
    flex-shrink: 0;
    margin-top: 0.125rem;
    color: var(--accent);
  }

  .icon-shield {
    width: 1.25rem;
    height: 1.25rem;
  }

  .privacy-intro {
    font-size: 0.9375rem;
    line-height: 1.7;
    color: var(--text-muted);
  }

  /* ── JUMP-LINKS MOBILE ── */
  .mobile-toc {
    display: block;
    margin-bottom: 2rem;
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-card);
    background-color: var(--bg-card);
  }

  .mobile-toc-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .mobile-toc-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .mobile-toc-link {
    display: inline-block;
    font-size: 0.75rem;
    padding: 0.25rem 0.625rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border-subtle);
    color: var(--accent);
    background-color: transparent;
    text-decoration: none;
    transition: background-color 150ms ease, color 150ms ease;
    white-space: nowrap;
  }

  .mobile-toc-link:hover,
  .mobile-toc-link:focus {
    background-color: var(--accent-light);
    color: var(--text-main);
    outline: none;
  }

  /* ── CORPO: ASIDE + ARTIGO ── */
  .privacy-body {
    display: flex;
    align-items: flex-start;
    gap: 2.5rem;
  }

  /* ── SIDEBAR TOC (desktop only) ── */
  .privacy-toc {
    display: none; /* hidden on mobile — shown via media query */
    flex-shrink: 0;
    width: 13rem;
    position: sticky;
    top: 5rem; /* abaixo do header fixo do app (~60px) */
    max-height: calc(100vh - 6rem);
    overflow-y: auto;
    padding: 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-card);
    background-color: var(--bg-card);
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }

  .toc-heading {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .toc-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .toc-link {
    display: block;
    font-size: 0.8125rem;
    line-height: 1.4;
    padding: 0.3rem 0.5rem;
    border-radius: 0.375rem;
    color: var(--text-muted);
    text-decoration: none;
    transition: color 150ms ease, background-color 150ms ease;
  }

  .toc-link:hover,
  .toc-link:focus {
    color: var(--text-main);
    background-color: var(--accent-light);
    outline: none;
  }

  /* ── ARTIGO ── */
  .privacy-content {
    flex: 1;
    min-width: 0; /* evita overflow em flex */
  }

  /* ── SEÇÕES ── */
  section {
    scroll-margin-top: 5.5rem; /* compensa o header fixo no scroll */
    margin-bottom: 0;
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 0.75rem;
    margin-top: 0;
    padding-top: 1.75rem;
  }

  .subsection-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-main);
    margin-top: 1.25rem;
    margin-bottom: 0.5rem;
  }

  .section-divider {
    border: none;
    border-top: 1px solid var(--border-card);
    margin: 0;
  }

  /* ── TIPOGRAFIA PROSE ── */
  p {
    font-size: 0.9375rem;
    line-height: 1.75;
    color: var(--text-muted);
    margin-top: 0;
    margin-bottom: 0.5rem;
  }

  .mt-4 {
    margin-top: 1rem;
  }

  .prose-list {
    list-style: disc;
    padding-left: 1.5rem;
    margin: 0.5rem 0 0.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .prose-list li {
    font-size: 0.9375rem;
    line-height: 1.65;
    color: var(--text-muted);
  }

  .prose-list strong {
    color: var(--text-main);
  }

  .rights-list {
    list-style: decimal;
    padding-left: 1.5rem;
    margin: 0.75rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .rights-list li {
    font-size: 0.9375rem;
    line-height: 1.65;
    color: var(--text-muted);
  }

  .rights-list strong {
    color: var(--text-main);
  }

  /* ── INFO CARD (controlador) ── */
  .info-card {
    margin-top: 0.75rem;
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-card);
    background-color: var(--bg-card);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-card p {
    margin: 0;
    font-size: 0.9rem;
  }

  .info-card strong {
    color: var(--text-main);
  }

  /* ── PARTNER CARDS ── */
  .partner-card {
    margin-top: 1rem;
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-card);
    background-color: var(--bg-card);
  }

  .partner-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-main);
    margin: 0 0 0.5rem 0;
  }

  .partner-domain {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* ── TABELAS ── */
  .table-wrapper {
    margin-top: 0.75rem;
    overflow-x: auto;
    border-radius: 0.5rem;
    border: 1px solid var(--border-card);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .data-table thead {
    background-color: var(--bg-card);
  }

  .data-table th {
    padding: 0.625rem 1rem;
    text-align: left;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-card);
    white-space: nowrap;
  }

  .data-table td {
    padding: 0.625rem 1rem;
    color: var(--text-muted);
    line-height: 1.5;
    border-bottom: 1px solid var(--border-card);
    vertical-align: top;
  }

  .data-table td strong {
    color: var(--text-main);
  }

  .data-table tbody tr:last-child td {
    border-bottom: none;
  }

  /* Linha zebrada */
  .data-table tbody tr:nth-child(odd) {
    background-color: var(--bg-card);
  }

  .data-table tbody tr:nth-child(even) {
    background-color: transparent;
  }

  /* ── HIGHLIGHT BOX (direitos) ── */
  .highlight-box {
    margin-top: 1rem;
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    border-left: 4px solid var(--primary);
    background-color: var(--bg-card);
    font-size: 0.9rem;
    color: var(--text-muted);
    line-height: 1.7;
  }

  .highlight-box strong {
    color: var(--text-main);
  }

  /* ── CONTATO GRID ── */
  .contact-grid {
    margin-top: 0.75rem;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .contact-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-card);
    background-color: var(--bg-card);
  }

  .contact-label {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .contact-item span:not(.contact-label),
  .contact-item a {
    font-size: 0.9rem;
    color: var(--text-main);
  }

  /* ── LINKS ── */
  .inline-link {
    color: var(--link);
    text-decoration: underline;
    text-underline-offset: 2px;
    text-decoration-color: transparent;
    transition: text-decoration-color 150ms ease, color 150ms ease;
  }

  .inline-link:hover,
  .inline-link:focus {
    color: var(--link-hover);
    text-decoration-color: currentColor;
    outline: none;
  }

  .font-semibold {
    font-weight: 600;
  }

  /* ── RODAPÉ DA POLÍTICA ── */
  .policy-footer {
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border-card);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .policy-footer p {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .btn-back {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-subtle);
    background-color: var(--bg-card);
    color: var(--text-main);
    text-decoration: none;
    transition: background-color 150ms ease, border-color 150ms ease;
  }

  .btn-back:hover,
  .btn-back:focus {
    background-color: var(--accent-light);
    border-color: var(--accent);
    outline: none;
  }

  .btn-back-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  /* ── RESPONSIVIDADE ── */

  /* Tablet+ (>= 768px): mostrar sidebar TOC, esconder jump-links mobile */
  @media (min-width: 768px) {
    .mobile-toc {
      display: none;
    }

    .privacy-toc {
      display: block;
    }

    .contact-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* Desktop (>= 1024px): título maior */
  @media (min-width: 1024px) {
    .privacy-title {
      font-size: 2.25rem;
    }

    .privacy-toc {
      width: 14rem;
    }
  }
</style>
