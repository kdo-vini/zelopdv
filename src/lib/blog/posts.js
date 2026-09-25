// Campos opcionais em cada post (não inventar conteúdo — só preencher quando
// o post for de fato revisado/atualizado):
// - updatedAt (string 'YYYY-MM-DD'): data da última revisão de conteúdo.
//   Quando presente, vira dateModified no Article JSON-LD e mostra a linha
//   "Atualizado em ..." na página do post (src/routes/blog/[slug]/+page.svelte).
// - faq ({ question, answer }[]): perguntas específicas do post. Quando
//   presente, vira FAQPage JSON-LD e uma seção de FAQ visível no fim do post.
// - tldr (string[]): 3-5 bullets que respondem a pergunta do post direto.
// - cover ({ alt }): existe capa em /blog/<slug>/cover.webp (ver $lib/blog/images).
import { PLANS, ADDONS, TRIAL_DAYS } from '$lib/pricing';
import { inlineFigure } from '$lib/blog/images';

export const posts = [
  {
    slug: 'melhores-sistemas-pdv-para-lanchonete-2026',
    title: 'Melhores sistemas PDV para lanchonete em 2026: comparativo honesto com preços',
    description:
      'Comparamos preço público de entrada, operação offline, NFC-e, integração com iFood e fiado de 8 sistemas de PDV para lanchonete, com fontes oficiais e data de consulta.',
    keyword: 'melhor sistema pdv para lanchonete',
    coverVariant: 'orbital',
    publishedAt: '2026-09-25',
    readingTime: '13 min',
    tldr: [
      `Mais barato com fiado e offline: o Zelo PDV custa R$ ${PLANS.pdv.price.toFixed(0)}/mês, funciona sem internet e não emite NFC-e — se você precisa de nota fiscal pelo próprio sistema, veja Saipos, Consumer, Anota AI ou Yooga.`,
      'Precisa de NFC-e integrada: Saipos, Consumer, Anota AI e Yooga anunciam emissão fiscal; o Zelo PDV não emite nota e exige um emissor fiscal à parte.',
      'Delivery grande com iFood pesado e operação de rede: Saipos e Consumer têm integração e recursos mais robustos, com preço de entrada acima de R$ 200/mês.',
      'Cardápio digital e robô de WhatsApp são o foco: Goomer e Anota AI são especializadas nisso, mas nenhuma das duas é, por si só, uma frente de caixa completa como o Zelo, a Consumer, a Kyte, o SisFood, a Saipos ou a Yooga.',
      'Orçamento mínimo e varejo em geral (não só comida): a Kyte tem plano grátis e entrada mais barata que o Zelo, mas não é especializada em food service.'
    ],
    faq: [
      {
        question: 'Qual o PDV mais barato para lanchonete?',
        answer:
          `Em preço de entrada publicado, a Kyte tem plano grátis e o Pro custa R$ 49,90/mês, mas não é especializada em food service. Entre os sistemas feitos para restaurante e lanchonete, o Zelo PDV é o mais barato com preço público, a R$ ${PLANS.pdv.price.toFixed(0)}/mês, sem exigir plano anual.`
      },
      {
        question: 'Qual PDV funciona sem internet?',
        answer:
          'O Zelo PDV funciona offline direto no navegador (PWA) e sincroniza quando a conexão volta. A Consumer também divulga operação offline com sincronização automática. Saipos, SisFood (segundo a própria empresa), Anota AI, Goomer e Yooga não anunciam operação offline nos materiais públicos consultados.'
      },
      {
        question: 'Preciso de PDV com NFC-e?',
        answer:
          'Depende da sua obrigação fiscal e de como você já emite nota hoje. Saipos, Consumer, Anota AI e Yooga anunciam emissão de NFC-e/NF-e (a Consumer e a Anota AI já incluem isso no plano de entrada). O Zelo PDV não emite nota fiscal — funciona com um emissor fiscal separado, se você precisar.'
      },
      {
        question: 'Sistema de PDV grátis vale a pena para lanchonete?',
        answer:
          'A Kyte tem um plano grátis, mas não é pensada para food service (é voltada a varejo em geral) e o material público dela não confirma recursos como taxa de delivery configurável. Para uma lanchonete, vale comparar o custo de um plano pago especializado (a partir de R$ 59/mês no Zelo) contra o tempo perdido remendando um sistema genérico.'
      },
      {
        question: 'Dá para trocar de sistema de PDV depois?',
        answer:
          'Sim, mas migrar histórico de vendas, estoque e clientes dá trabalho. Por isso vale testar o sistema de verdade — a maioria dos comparados aqui, incluindo o Zelo PDV, tem teste grátis sem cartão — antes de bater o martelo, em vez de trocar depois de alguns meses de uso.'
      }
    ],
    content: `
      <p>Comparamos 8 sistemas de PDV usados por lanchonetes e restaurantes pequenos no Brasil, com preço consultado nos sites oficiais em <strong>setembro de 2026</strong>. A resposta curta: não existe "o melhor" único — existe o melhor para o seu caso. Se você precisa de nota fiscal pelo próprio sistema, o Zelo PDV está fora (ele não emite NFC-e); se o orçamento é o critério e você não precisa de fiscal integrada, ele é a opção mais barata com preço público entre os sistemas de food service testados.</p>
      <p>Este comparativo é publicado pelo Zelo PDV. Somos parte interessada — por isso, cada número tem fonte oficial e data de consulta, e incluímos casos honestos em que outro sistema é a escolha certa, inclusive quando isso significa não usar o Zelo.</p>

      <h2>Como avaliamos</h2>
      <p>Usamos os mesmos sete critérios para todos os sistemas, sempre com base no que cada empresa divulga publicamente (site oficial, página de planos, central de ajuda):</p>
      <ul>
        <li><strong>Preço público de entrada</strong> — precisa estar no site, sem precisar falar com vendedor para saber o valor.</li>
        <li><strong>Funciona offline</strong> — o sistema continua registrando vendas sem internet e sincroniza depois.</li>
        <li><strong>Emite NFC-e/NF-e</strong> — nota fiscal de venda pelo próprio sistema, sem um emissor fiscal separado.</li>
        <li><strong>Integração com iFood</strong> — recebe ou registra pedidos de plataformas de delivery.</li>
        <li><strong>Controle de fiado</strong> — conta corrente de cliente, histórico e limite.</li>
        <li><strong>Cardápio digital</strong> — pedido online, QR Code ou totem.</li>
        <li><strong>Teste grátis</strong> — dá para usar de verdade antes de pagar.</li>
      </ul>
      <p>Quando um recurso não aparece no material público de um concorrente, isso não significa necessariamente que o sistema não faça aquilo — significa que a empresa não anuncia esse ponto onde procuramos, e por isso marcamos como "não anuncia" ou "não verificado" em vez de inventar uma resposta.</p>

      <h2>Comparativo rápido</h2>
      <table>
        <thead>
          <tr>
            <th>Sistema</th>
            <th>Preço de entrada (data)</th>
            <th>Offline</th>
            <th>NFC-e</th>
            <th>iFood</th>
            <th>Fiado</th>
            <th>Melhor para</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Zelo PDV</strong></td>
            <td>R$ ${PLANS.pdv.price.toFixed(0)}/mês (set/2026)</td>
            <td>Sim (PWA)</td>
            <td>Não</td>
            <td>Registra venda com taxa configurável</td>
            <td>Sim, nativo</td>
            <td>Lanchonete pequena/média, preço baixo, sem precisar de NF integrada</td>
          </tr>
          <tr>
            <td>Saipos</td>
            <td>A partir de R$ 240,79/mês (set/2026)</td>
            <td>Não (100% nuvem)</td>
            <td>Sim</td>
            <td>Sim (integração)</td>
            <td>Não verificado</td>
            <td>Restaurante/rede grande com orçamento maior</td>
          </tr>
          <tr>
            <td>Consumer</td>
            <td>R$ 59,90/mês (Essencial, anual, set/2026)</td>
            <td>Sim (divulgado)</td>
            <td>Sim</td>
            <td>Sim (integração)</td>
            <td>Sim</td>
            <td>Quem precisa de NF integrada e preço de entrada parecido com o Zelo</td>
          </tr>
          <tr>
            <td>Kyte</td>
            <td>Grátis a R$ 99,90/mês (set/2026)</td>
            <td>App mobile sim; Kyte Web não</td>
            <td>Não anuncia</td>
            <td>Não anuncia</td>
            <td>Sim</td>
            <td>Varejo em geral com orçamento mínimo (não é foco food service)</td>
          </tr>
          <tr>
            <td>Goomer</td>
            <td>A partir de R$ 224,92/mês, anual (set/2026)</td>
            <td>Não verificado</td>
            <td>Não anuncia</td>
            <td>Sim (parceria)</td>
            <td>Depende do PDV integrado</td>
            <td>Cardápio digital, QR Code e totem como prioridade</td>
          </tr>
          <tr>
            <td>Anota AI</td>
            <td>A partir de R$ 99,99/mês (set/2026)</td>
            <td>Não anuncia</td>
            <td>Sim (todos os planos)</td>
            <td>Não anuncia</td>
            <td>Não verificado</td>
            <td>Robô de IA no WhatsApp + NF integrada</td>
          </tr>
          <tr>
            <td>SisFood</td>
            <td>A partir de R$ 149,90/mês (consultado em junho de 2026)</td>
            <td>Não (100% cloud, segundo a empresa)</td>
            <td>Sim, módulo à parte</td>
            <td>Não verificado</td>
            <td>Não verificado</td>
            <td>Food service que aceita módulo fiscal e totem à parte</td>
          </tr>
          <tr>
            <td>Yooga</td>
            <td>A partir de R$ 249/mês (consultado em junho de 2026; preço não público em set/2026)</td>
            <td>Não anuncia</td>
            <td>Sim (planos Completo/Premium)</td>
            <td>Sim (plano Básico)</td>
            <td>Não verificado</td>
            <td>Restaurante estruturado que já quer KDS e recursos de rede</td>
          </tr>
        </tbody>
      </table>
      <p>"Não verificado" significa que não encontramos essa informação nas páginas oficiais consultadas nesta pesquisa — não é uma afirmação de que o recurso não existe. SisFood e Yooga não publicam preço atualizado de forma que desse para reconfirmar em setembro de 2026; por isso mantivemos o último valor verificado, datado.</p>

      <h2>Zelo PDV</h2>
      <p><strong>Para quem é:</strong> lanchonetes, hamburguerias, delivery próprio e MEIs de alimentação que querem frente de caixa, fiado, estoque e financeiro por um preço baixo e público, funcionando mesmo com internet instável.</p>
      <p><strong>Pontos fortes:</strong> R$ ${PLANS.pdv.price.toFixed(0)}/mês de entrada, sem exigir plano anual; funciona offline direto no navegador (PWA); fiado nativo; módulos opcionais (Mesas +R$ ${ADDONS.mesas.price.toFixed(0)}, Controle de Acessos +R$ ${ADDONS.acessos.price.toFixed(0)}, ZeloMenu +R$ ${ADDONS.menu.price.toFixed(0)}) em vez de pacote fechado; teste de ${TRIAL_DAYS} dias grátis, sem cartão.</p>
      <p><strong>Quando não escolher:</strong> se você precisa emitir NFC-e pelo próprio sistema, o Zelo PDV não é a opção certa — ele não emite nota fiscal (nem NFC-e nem NF-e), só recibos e comprovantes de venda. Nesse caso, considere Saipos, Consumer, Anota AI ou Yooga, que anunciam emissão fiscal integrada. O Zelo também não tem totem de autoatendimento nem robô de IA no WhatsApp.</p>

      <h2>Saipos</h2>
      <p><strong>Para quem é:</strong> restaurantes e redes maiores que já têm faturamento para justificar um pacote robusto com mais de 70 recursos e forte integração com plataformas de delivery.</p>
      <p><strong>Pontos fortes:</strong> emite NFC-e no modelo A1 com envio automático de XML para a contabilidade; integra com mais de 50 plataformas, incluindo iFood; oferece demonstração gratuita.</p>
      <p><strong>Quando não escolher:</strong> se o orçamento é apertado (entrada a partir de R$ 240,79/mês, com valor final segmentado por faturamento e fechado em demonstração comercial) ou se você precisa vender sem internet — o material público não confirma operação offline. Veja a comparação completa em <a href="/vs-saipos">Zelo PDV vs Saipos</a>.</p>

      <h2>Consumer</h2>
      <p><strong>Para quem é:</strong> quem quer um preço de entrada parecido com o do Zelo PDV, mas já precisa de emissão fiscal (NFC-e/CF-e/SAT/MFE/NF-e) integrada desde o plano básico.</p>
      <p><strong>Pontos fortes:</strong> plano Essencial a R$ 59,90/mês (cobrança anual); emissor fiscal completo incluso; controle de fiado e conta corrente do cliente; divulga operação offline com sincronização automática; forte presença em integração com iFood.</p>
      <p><strong>Quando não escolher:</strong> se você precisa de mais de um computador/terminal logo no início — sair do Essencial para o plano com PDV em rede custa R$ 179,90/mês, quase o triplo. Veja a comparação completa em <a href="/vs-consumer">Zelo PDV vs Consumer</a>.</p>

      <h2>Kyte</h2>
      <p><strong>Para quem é:</strong> pequenos comerciantes de varejo em geral (moda, calçados, acessórios) com orçamento mínimo — não é um produto pensado para food service.</p>
      <p><strong>Pontos fortes:</strong> plano grátis disponível; Pro a R$ 49,90/mês, mais barato que o Zelo; o app mobile funciona offline e sincroniza depois; tem função própria de controle de fiado e débito.</p>
      <p><strong>Quando não escolher:</strong> se você tem uma lanchonete ou restaurante e precisa de recursos pensados para food service, como taxa de delivery configurável — isso não é destacado no material público da Kyte. A versão Kyte Web também é descrita pela própria empresa como totalmente online, diferente do app mobile. Veja a comparação completa em <a href="/vs-kyte">Zelo PDV vs Kyte</a>.</p>

      <h2>Goomer</h2>
      <p><strong>Para quem é:</strong> quem quer cardápio digital, QR Code na mesa e totem de autoatendimento como prioridade — não é, por desenho, um PDV completo.</p>
      <p><strong>Pontos fortes:</strong> forte em QR Code, tablet e totem; parceria de entrega sob demanda com o iFood; plano grátis para até 30 pedidos/mês.</p>
      <p><strong>Quando não escolher:</strong> se você precisa de frente de caixa, fiado e estoque nativos — a Goomer se integra a um PDV externo para isso, e o plano com PDV ("Integrar") parte de R$ 224,92/mês no anual. Acima de 30 pedidos no plano grátis, cobra R$ 1,39 por pedido. Veja a comparação completa em <a href="/vs-goomer">Zelo PDV vs Goomer</a>.</p>

      <h2>Anota AI</h2>
      <p><strong>Para quem é:</strong> quem quer um robô de atendimento por IA no WhatsApp como centro da operação, com nota fiscal automatizada incluída em todos os planos.</p>
      <p><strong>Pontos fortes:</strong> NF automatizada, cardápio digital, KDS e frente de caixa já no plano de entrada (R$ 99,99/mês, até 150 pedidos/mês); robô de IA no WhatsApp é o diferencial central; sem fidelidade no plano anual, segundo o site oficial.</p>
      <p><strong>Quando não escolher:</strong> se o seu volume de pedidos varia bastante — o preço sobe por faixa (151 a 250 pedidos: R$ 199,99/mês; acima de 250: R$ 299,99/mês) — ou se você precisa vender sem internet, recurso que o material público não anuncia. Veja a comparação completa em <a href="/vs-anota-ai">Zelo PDV vs Anota AI</a>.</p>

      <h2>SisFood</h2>
      <p><strong>Para quem é:</strong> food service que quer um pacote com PDV, cardápio digital e robô de WhatsApp, e não se importa em pagar módulos fiscais e totem à parte.</p>
      <p><strong>Pontos fortes:</strong> pacote "tudo incluído" no núcleo (PDV, cardápio, WhatsApp); sem fidelidade obrigatória segundo a empresa.</p>
      <p><strong>Quando não escolher:</strong> se você precisa vender sem depender de internet estável — a própria empresa descreve o SisFood como 100% cloud. O preço de entrada (a partir de R$ 149,90/mês) é o último valor que conseguimos confirmar oficialmente, verificado em junho de 2026; não conseguimos recarregar a página de preços em setembro de 2026 para reconfirmar. Veja a comparação completa em <a href="/vs-sisfood">Zelo PDV vs SisFood</a>.</p>

      <h2>Yooga</h2>
      <p><strong>Para quem é:</strong> restaurante mais estruturado que já quer KDS, NFC-e no plano Completo/Premium e integração com iFood desde o plano Básico.</p>
      <p><strong>Pontos fortes:</strong> integração com iFood no plano de entrada; NFC-e/CF-e ilimitada nos planos superiores; recursos de rede e IA no Premium.</p>
      <p><strong>Quando não escolher:</strong> se o orçamento é limitado — o último preço público que encontramos ficava a partir de R$ 249/mês (junho de 2026), e em setembro de 2026 o site não publica mais valores, direcionando para "falar com especialista". Também não anuncia operação offline, e há relatos de clientes no Reclame Aqui sobre cobrança acima do anunciado. Veja a comparação completa em <a href="/vs-yooga">Zelo PDV vs Yooga</a>.</p>

      <h2>Como escolher em 5 passos</h2>
      <ol>
        <li><strong>Decida se precisa de NFC-e/NF-e pelo próprio sistema.</strong> Se sim, isso já corta metade da lista (o Zelo PDV, por exemplo, sai fora). Se não — porque você já tem um emissor fiscal separado ou emite recibo — o campo de opções abre.</li>
        <li><strong>Teste a operação offline no seu ponto real.</strong> Internet instável em horário de pico derruba caixa em sistema 100% cloud. Peça para testar exatamente no seu endereço, não confie só na propaganda.</li>
        <li><strong>Some o preço de entrada com o módulo que você sabe que vai usar.</strong> Mesas, fiado avançado, cardápio digital — alguns sistemas cobram isso à parte ou empurram para um plano muito mais caro (veja a Consumer saltando de R$ 59,90 para R$ 179,90 por PDV em rede, ou a Anota AI subindo por faixa de pedidos).</li>
        <li><strong>Verifique fiado e estoque, não assuma.</strong> Alguns sistemas de cardápio digital (como a Goomer) dependem de um PDV externo para isso — você pode acabar pagando duas assinaturas.</li>
        <li><strong>Use o teste grátis com dados reais</strong> — um turno de pico, um pedido de delivery, um cliente fiado — antes de migrar o histórico de verdade. A maioria dos sistemas comparados aqui, incluindo o Zelo PDV, oferece isso sem pedir cartão.</li>
      </ol>
      <p>Para mais contexto sobre o que um PDV de lanchonete precisa cobrir no dia a dia, veja <a href="/para-lanchonetes">Zelo PDV para lanchonetes</a>. Para comparar outros sistemas específicos, veja os <a href="/comparativos">comparativos Zelo PDV vs concorrentes</a>. E se você já sabe que precisa calcular taxa de delivery ou lucro real, tem calculadora pronta em <a href="/ferramentas">ferramentas Zelo PDV</a>.</p>

      <h2>Fontes</h2>
      <ul>
        <li>Saipos — Planos e preços (oficial): <a href="https://saipos.com/planos-e-precos">saipos.com/planos-e-precos</a> — consultado em setembro de 2026</li>
        <li>Consumer — Planos (oficial): <a href="https://loja.consumer.com.br/">loja.consumer.com.br</a> — consultado em setembro de 2026</li>
        <li>Kyte — Planos (oficial): <a href="https://www.kyteapp.com/pt/planos">kyteapp.com/pt/planos</a> — consultado em setembro de 2026</li>
        <li>Goomer — Planos (oficial): <a href="https://goomer.com.br/planos">goomer.com.br/planos</a> — consultado em setembro de 2026</li>
        <li>Anota AI — Planos (oficial): <a href="https://anota.ai/blog/planos-principal/">anota.ai/blog/planos-principal</a> — consultado em setembro de 2026</li>
        <li>SisFood — Site oficial: <a href="https://www.sisfood.com.br/">sisfood.com.br</a> — última consulta confirmada em junho de 2026 (site indisponível para nova consulta em setembro de 2026)</li>
        <li>Yooga — Planos (oficial): <a href="https://yooga.com.br/planos/">yooga.com.br/planos</a> — consultado em setembro de 2026 (sem preço público nesta data; último valor confirmado em junho de 2026)</li>
        <li>Zelo PDV — Catálogo de planos: <a href="/sobre">zelopdv.com.br/sobre</a></li>
      </ul>
    `
  },
  {
    slug: 'taxa-ifood-2026-como-calcular',
    title: 'Quanto o iFood cobra em 2026 e como calcular se vale a pena',
    description:
      'Faixas públicas de comissão, taxa de pagamento e mensalidade do iFood em 2026, com um exemplo de R$ 50 e o que conferir no Portal do Parceiro.',
    keyword: 'taxa ifood 2026',
    coverVariant: 'sunrise',
    publishedAt: '2026-09-24',
    readingTime: '8 min',
    cover: { alt: 'Dono de lanchonete conferindo no celular o repasse de um pedido de delivery, com sacolas prontas no balcão' },
    tldr: [
      'No Plano Básico (você entrega) a comissão pública é de cerca de 12%; no Plano Entrega (logística do iFood), cerca de 23%.',
      'Pedidos pagos pelo app somam uma taxa de pagamento online de cerca de 3,2% a 3,5%, conforme a página ou o contrato.',
      'A mensalidade (cerca de R$ 110 ou R$ 150) só é cobrada acima de cerca de R$ 1.800 de faturamento no mês.',
      'A taxa real da sua loja está no Portal do Parceiro (Financeiro → Taxas e comissões) — use o contrato, não só artigos.'
    ],
    faq: [
      {
        question: 'Qual a diferença entre Plano Básico e Plano Entrega?',
        answer:
          'Básico: você entrega; comissão pública tipicamente ~12%. Entrega: logística iFood; comissão tipicamente ~23%. Ambos somam taxa de pagamento online (~3,2%–3,5% conforme a página/contrato).'
      },
      {
        question: 'A mensalidade é por pedido?',
        answer:
          'Não. É cobrança mensal condicionada a faturamento acima de cerca de R$ 1.800/mês nas faixas públicas (cerca de R$ 110 ou R$ 150).'
      },
      {
        question: 'Como ver a taxa real da minha loja?',
        answer:
          'Portal do Parceiro → dados contratuais / Financeiro → Taxas e comissões. Use o contrato, não só artigos genéricos.'
      }
    ],
    content: `
      <blockquote>
        <p>Em 2026, pelas faixas <strong>públicas</strong> divulgadas no Blog do iFood para Parceiros (atualizado em 2026), o restaurante costuma pagar <strong>cerca de 12% de comissão no Plano Básico</strong> (entrega própria) ou <strong>cerca de 23% no Plano Entrega</strong> (logística iFood), <strong>mais cerca de 3,2% a 3,5% de taxa de pagamento online</strong> nos pedidos pagos via iFood — totalizando da ordem de <strong>~15,2% a ~15,5%</strong> (Básico) e <strong>~26,2% a ~26,5%</strong> (Entrega). Pode haver <strong>mensalidade de cerca de R$ 110 (Básico) ou R$ 150 (Entrega)</strong> quando o faturamento no iFood passa de <strong>cerca de R$ 1.800/mês</strong>. A <strong>taxa de serviço</strong> cobrada do cliente final <strong>não</strong> é a comissão da loja. <strong>Confirme sempre o percentual do seu contrato no Portal do Parceiro</strong> — condições variam por categoria, região e negociação.</p>
      </blockquote>
      <p>Se você vende por aplicativo e fecha o mês olhando só o faturamento do painel, a conta fica incompleta. Comissão, taxa de pagamento e, em alguns contratos, mensalidade saem do valor do pedido antes de sobrar dinheiro para comida, embalagem e operação. Este texto mostra como calcular o líquido em cinco minutos, com números públicos de 2026 e um exemplo de pedido de R$ 50.</p>
      <p>Há um panorama mais amplo de iFood, Rappi e outros apps em <a href="/blog/como-calcular-taxa-aplicativo-delivery">taxas de aplicativos de delivery</a>. Aqui o foco é só o iFood em 2026 e o cálculo de “vale a pena?”.</p>

      <h2>Fontes usadas nesta pesquisa</h2>
      <p>As faixas abaixo não saíram de um “contrato médio inventado”. Elas vêm de páginas oficiais do iFood para parceiros, que em 2026 não batem 100% entre si no detalhe da taxa de pagamento. Por isso rotulamos <strong>faixas (~)</strong> e pedimos conferência no Portal.</p>
      <ul>
        <li><a href="https://blog-parceiros.ifood.com.br/taxas-ifood/">Blog do iFood para Parceiros — Taxas</a> (publicado/atualizado em 2026; tabela Básico ~12% + ~3,2%; Entrega ~23% + ~3,2%; mensalidades cerca de R$ 110 / R$ 150 acima de cerca de R$ 1.800)</li>
        <li><a href="https://blog-parceiros.ifood.com.br/planos-ifood/">Blog do iFood para Parceiros — Planos</a> (em alguns trechos a taxa de pagamento no Entrega aparece como ~3,5%)</li>
        <li><a href="https://parceiros.ifood.com.br/restaurante/como-funciona/entregas">Como funcionam as entregas no iFood</a> (Entrega: ~23% + ~3,5%; Básico: ~12% + ~3,5% em uma das páginas oficiais)</li>
      </ul>
      <p>Se a sua categoria, cidade ou negociação tiver percentual diferente, o contrato vale mais do que qualquer artigo — inclusive este.</p>

      <h2>O que entra na conta (e o que não entra)</h2>
      <p>A maior parte das lojas vê três camadas no extrato do iFood:</p>
      <ul>
        <li><strong>Comissão do plano</strong> — percentual sobre o pedido. Nas faixas públicas, cerca de 12% no Básico (você entrega) ou cerca de 23% no Entrega (logística iFood).</li>
        <li><strong>Taxa de pagamento online</strong> — percentual extra nos pedidos pagos pelo app, nas faixas públicas cerca de 3,2% a 3,5%, conforme a página consultada.</li>
        <li><strong>Mensalidade</strong> — valor fixo no mês, nas faixas públicas cerca de R$ 110 (Básico) ou R$ 150 (Entrega), quando o faturamento no iFood passa de cerca de R$ 1.800/mês. Não é cobrada por pedido.</li>
      </ul>
      <p>A <strong>taxa de serviço</strong> que o cliente vê no app não é a comissão da loja. Misturar os dois números é o erro mais comum na conversa de “o iFood cobra X%”.</p>
      <p>Ainda ficam de fora desta conta de taxas: CMV (comida), embalagem, gás, moto (se você está no Básico), marketing, cancelamentos e a antecipação, se houver. O líquido do pedido só vira lucro depois desses custos.</p>

      <h2>Como calcular em 5 minutos (exemplo de R$ 50)</h2>
      <p>Pedido de <strong>R$ 50,00</strong> pago no app, <strong>Plano Básico</strong>, usando 12% + 3,2% (faixa do blog de taxas):</p>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="num">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Pedido</td>
            <td class="num">R$ 50,00</td>
          </tr>
          <tr>
            <td>Comissão ~12%</td>
            <td class="num">R$ 6,00</td>
          </tr>
          <tr>
            <td>Pagamento online ~3,2%</td>
            <td class="num">R$ 1,60</td>
          </tr>
          <tr>
            <td><strong>Total de taxas do pedido</strong></td>
            <td class="num"><strong>R$ 7,60 (~15,2%)</strong></td>
          </tr>
          <tr>
            <td><strong>Repasse bruto do pedido</strong></td>
            <td class="num"><strong>R$ 42,40</strong></td>
          </tr>
        </tbody>
      </table>
      <p>Se a sua página/contrato usar ~3,5% de pagamento online no Básico, o mesmo pedido sai ~R$ 7,75 de taxas (~15,5%) e ~R$ 42,25 de repasse bruto. A diferença é pequena no ticket unitário; no volume do mês ela aparece.</p>
      <p>Ainda faltam <strong>no mês</strong>: mensalidade (se aplicável), custo de comida (CMV), embalagem, gás, moto (se Básico), marketing e cancelamentos.</p>

      <h2>O mesmo pedido no Plano Entrega</h2>
      <p>No <strong>Plano Entrega</strong>, com ~23% + ~3,2% a ~3,5%, o mesmo pedido de R$ 50 deixa da ordem de <strong>R$ 13 a R$ 13,25</strong> só em taxas percentuais (~26% a ~26,5%), antes do CMV:</p>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="num">~3,2% de pagamento</th>
            <th class="num">~3,5% de pagamento</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Pedido</td>
            <td class="num">R$ 50,00</td>
            <td class="num">R$ 50,00</td>
          </tr>
          <tr>
            <td>Comissão ~23%</td>
            <td class="num">R$ 11,50</td>
            <td class="num">R$ 11,50</td>
          </tr>
          <tr>
            <td>Pagamento online</td>
            <td class="num">R$ 1,60</td>
            <td class="num">R$ 1,75</td>
          </tr>
          <tr>
            <td><strong>Total de taxas</strong></td>
            <td class="num"><strong>R$ 13,10 (~26,2%)</strong></td>
            <td class="num"><strong>R$ 13,25 (~26,5%)</strong></td>
          </tr>
          <tr>
            <td><strong>Repasse bruto</strong></td>
            <td class="num"><strong>R$ 36,90</strong></td>
            <td class="num"><strong>R$ 36,75</strong></td>
          </tr>
        </tbody>
      </table>
      <p>O Entrega troca moto própria por logística do iFood. Isso pode valer a pena se a sua operação não cobre entrega com folga — mas o percentual maior precisa caber no ticket e no CMV. Não compare só “23% versus 12%”: compare o líquido depois de comida, embalagem e, no Básico, o custo real da moto.</p>

      <h2>A mensalidade muda o custo por pedido</h2>
      <p>Nas faixas públicas, a mensalidade (~R$ 110 no Básico ou ~R$ 150 no Entrega) entra quando o faturamento no iFood passa de cerca de R$ 1.800/mês. Não é uma taxa por pedido. O impacto unitário depende de quantos pedidos você faz depois desse limiar.</p>
      <p>Exemplo só para dimensionar — não é a sua conta: se no mês você faturou R$ 3.000 no iFood no Básico e pagou cerca de R$ 110 de mensalidade, isso equivale a cerca de 3,7% extras sobre esse faturamento, além da comissão e do pagamento online. Em volume maior, a mensalidade dilui. Em volume perto do piso, ela pesa mais.</p>
      <p>Some isso no fechamento do mês, não no feeling do dia. Comissão + pagamento + mensalidade + CMV + embalagem é o mínimo para dizer se o canal sobrou.</p>

      <h2>Regra prática: aquisição versus único canal</h2>
      <p>Se depois de comissão + pagamento + CMV + embalagem a margem de contribuição do canal iFood for menor que a do balcão ou do WhatsApp, o app pode ser ótimo para <strong>aquisição</strong>, mas ruim como <strong>único</strong> canal.</p>
      <p>Vale quando: (1) o ticket e o CMV aguentam a faixa de taxa do seu plano; (2) você mede o <strong>líquido</strong>, não só o faturamento do app; (3) existe canal próprio (balcão, WhatsApp, cardápio online) para não depender 100% do marketplace.</p>
      <p>Não vale quando o cardápio do app está no mesmo preço do balcão, o CMV já é apertado e o iFood é o único jeito de a loja aparecer. Aí o volume mascara prejuízo por item. A correção começa por saber o percentual real do contrato e o custo de cada prato — não por “sair do iFood amanhã” sem plano B.</p>

      <h2>Como ver a taxa real da sua loja</h2>
      <p>Abra o Portal do Parceiro → dados contratuais / Financeiro → Taxas e comissões. Anote comissão, taxa de pagamento, se há mensalidade e a partir de qual faturamento. Use o contrato, não só artigos genéricos.</p>
      <p>Depois pegue 10 pedidos recentes do mesmo plano, some o valor dos pedidos, some o que o iFood reteve e divida. Se o percentual sair muito longe da faixa pública do seu plano, tem alguma linha extra (antecipação, cancelamento, ajuste) ou o contrato é outro. Não force o número do blog para caber no seu extrato.</p>

      <h2>Onde o ZeloPDV entra (sem inventar)</h2>
      <p>No ZeloPDV você pode <strong>registrar vendas de plataformas de delivery com a taxa configurável</strong> e ver o líquido. Com o <strong>ZeloMenu (+R$ 40/mês)</strong>, pedidos do iFood, WhatsApp e cardápio online podem cair no sistema e na fila da cozinha. O Zelo <strong>não substitui</strong> o iFood e <strong>não é marketplace</strong>.</p>
      <p>O plano base do ZeloPDV custa R$ 59/mês e cobre frente de caixa, fiado, estoque, financeiro e lucro real, no navegador, com modo offline. O teste é de 14 dias, sem cartão. Fatos oficiais: <a href="https://zelopdv.com.br/sobre">zelopdv.com.br/sobre</a>.</p>
    `
  },
  {
    slug: 'como-calcular-lucro-real-lanchonete',
    title: 'Como calcular o lucro real da sua lanchonete (sem enganar a si mesmo)',
    description:
      'Aprenda a calcular o lucro real da sua lanchonete considerando custo de mercadoria, despesas fixas, mão de obra e pró-labore. Chega de achar que sobrou dinheiro quando não sobrou.',
    keyword: 'como calcular lucro real de lanchonete',
    coverVariant: 'violet',
    publishedAt: '2026-05-10',
    updatedAt: '2026-09-24',
    readingTime: '9 min',
    cover: { alt: 'Dono de lanchonete conferindo contas e um caderno de despesas no balcão' },
    tldr: [
      'Lucro real é o faturamento menos CMV, despesas fixas, despesas variáveis e o pró-labore do dono — não é o dinheiro que sobra no caixa.',
      'O CMV (Custo de Mercadoria Vendida) de uma lanchonete saudável costuma ficar entre 28% e 38% do faturamento.',
      'Margem de lucro acima de 20% é considerada boa para o setor; abaixo de 10% é sinal de alerta.',
      'Ignorar o próprio pró-labore é o erro mais comum e infla o lucro na conta de cabeça.',
      'Registrar vendas, despesas e fechamento de caixa em um só lugar é o que torna esse cálculo possível todo mês, não só uma vez.'
    ],
    faq: [
      {
        question: 'Qual a diferença entre faturamento e lucro real?',
        answer: 'Faturamento é o total vendido no período. Lucro real é o que sobra depois de descontar CMV, despesas fixas, despesas variáveis e o pró-labore do dono — só esse número mostra se o negócio está de fato ganhando dinheiro.'
      },
      {
        question: 'Qual é uma boa margem de lucro para lanchonete?',
        answer: 'Como referência de mercado, abaixo de 10% é uma situação delicada, entre 10% e 20% é uma operação viável e acima de 20% é considerada uma boa margem para o segmento.'
      },
      {
        question: 'Por que incluir o pró-labore no cálculo de despesas?',
        answer: 'Porque se o trabalho do dono não entra como custo, o lucro aparece inflado — o dono pode estar ganhando menos do que ganharia sendo contratado por outra pessoa, sem perceber isso na conta.'
      },
      {
        question: 'Com que frequência devo calcular o lucro real?',
        answer: 'Idealmente todo mês, com os mesmos números de vendas, despesas e fechamento de caixa. Calcular uma vez só dá uma foto; calcular todo mês mostra tendência e evita surpresa.'
      }
    ],
    content: `
      <p>Todo dono de lanchonete já sentiu aquilo: o movimento foi bom, as vendas entraram, mas no fim do mês o dinheiro não está na conta. Parecia que tinha lucro, mas na prática não sobrou nada — ou sobrou muito menos do que o esperado. Esse fenômeno tem nome: é a confusão entre faturamento e lucro real.</p>
      <p>Saber quanto você vendeu é simples. Saber quanto você <em>lucrou de verdade</em> exige uma conta diferente — mais honesta e mais completa. Este artigo vai te mostrar o passo a passo para calcular o lucro real da sua lanchonete, sem ilusão e sem deixar custo de fora.</p>

      <h2>Por que o "dinheiro em caixa" mente sobre o lucro</h2>
      <p>O maior erro financeiro em lanchonetes é confundir caixa cheio com lucro. O caixa pode estar positivo porque você ainda não pagou os fornecedores do mês. Ou porque recebeu antecipado por um evento. Ou porque o aluguel vence semana que vem. Dinheiro em caixa é posição de liquidez — não é lucro.</p>
      <p>Lucro real é o que sobra depois que <strong>todas as despesas operacionais</strong> foram pagas: mercadoria, aluguel, luz, água, funcionários, embalagens, taxas, manutenção, impostos e seu próprio pró-labore. Só depois disso dá para dizer quanto você ganhou.</p>

      <h2>Os 4 números que todo cálculo de lucro precisa ter</h2>
      <p>Para chegar ao lucro real, você precisa calcular quatro componentes principais:</p>

      <h2>1. Custo de Mercadoria Vendida (CMV)</h2>
      <p>O CMV é quanto você gastou em ingredientes e insumos para produzir tudo que vendeu no período. A fórmula é:</p>
      <ul>
        <li><strong>CMV = Estoque inicial + Compras do período − Estoque final</strong></li>
      </ul>
      <p>Exemplo: você tinha R$ 800 em estoque no início do mês, comprou R$ 3.200 em mercadoria e terminou o mês com R$ 600 em estoque. Seu CMV foi <strong>R$ 3.400</strong>.</p>
      <p>Em lanchonetes bem geridas, o CMV costuma ficar entre <strong>28% e 38%</strong> do faturamento. Se estiver acima de 40%, há desperdício ou precificação incorreta.</p>

      <h2>2. Despesas fixas operacionais</h2>
      <p>São os gastos que acontecem todo mês independente de quanto você vende:</p>
      <ul>
        <li>Aluguel do ponto</li>
        <li>Energia elétrica, água, gás</li>
        <li>Internet e telefone</li>
        <li>Salários e encargos de funcionários</li>
        <li>Contabilidade</li>
        <li>Sistema de gestão, maquininhas de pagamento</li>
        <li>Seguros e taxas fixas</li>
      </ul>
      <p>Some tudo. Esse é o seu custo fixo mensal. Qualquer negócio precisa vender o suficiente para cobrir esse valor antes de começar a lucrar.</p>

      <h2>3. Despesas variáveis e extras</h2>
      <p>Esses são custos que variam com o volume de vendas ou que aparecem de forma pontual:</p>
      <ul>
        <li>Embalagens (caixas, sacolas, guardanapos)</li>
        <li>Taxas de cartão e máquina de pagamento (geralmente 1,5% a 3% do faturamento)</li>
        <li>Comissão de delivery apps</li>
        <li>Manutenção de equipamentos</li>
        <li>Material de limpeza e descartáveis</li>
      </ul>

      <h2>4. Pró-labore do dono</h2>
      <p>Esse é o item mais ignorado em lanchonetes familiares: <strong>o salário do próprio dono</strong>. Se você trabalha no seu negócio, precisa considerar o seu trabalho como custo — mesmo que não se pague formalmente.</p>
      <p>Por que isso importa? Porque se você não coloca o seu trabalho como despesa, a conta de lucro está inflada. Você pode estar ganhando menos do que ganharia trabalhando para outra pessoa, sem perceber.</p>
      <p>Uma boa referência é o salário que você teria que pagar para contratar alguém para fazer o que você faz. Inclua esse valor nas despesas.</p>

      <h2>A fórmula do lucro real</h2>
      <p>Com todos os números em mãos, o cálculo é direto:</p>
      <ul>
        <li><strong>Faturamento bruto</strong> (total das vendas do mês)</li>
        <li>menos <strong>CMV</strong> (custo da mercadoria vendida)</li>
        <li>= <strong>Lucro bruto</strong></li>
        <li>menos <strong>Despesas fixas</strong></li>
        <li>menos <strong>Despesas variáveis</strong></li>
        <li>menos <strong>Pró-labore</strong></li>
        <li>= <strong>Lucro real (ou prejuízo)</strong></li>
      </ul>
      <p>Exemplo prático: uma lanchonete com faturamento de R$ 18.000 no mês.</p>
      <ul>
        <li>CMV: R$ 6.300 (35%)</li>
        <li>Despesas fixas: R$ 5.200 (aluguel, luz, salários)</li>
        <li>Despesas variáveis: R$ 1.100 (embalagens, taxas, delivery)</li>
        <li>Pró-labore do dono: R$ 2.000</li>
        <li><strong>Lucro real: R$ 3.400 (18,9% do faturamento)</strong></li>
      </ul>
      <p>R$ 3.400 de lucro real em R$ 18.000 vendidos. Parece pouco? Para muitas lanchonetes, esse é o número real — e muitos donos achavam que lucravam o dobro porque não incluíam todos os custos na conta.</p>

      <h2>Qual é a margem de lucro ideal para uma lanchonete?</h2>
      <p>Não existe um número universal, mas há referências do setor:</p>
      <ul>
        <li><strong>Abaixo de 10%:</strong> situação delicada. Qualquer imprevisto pode gerar prejuízo.</li>
        <li><strong>Entre 10% e 20%:</strong> operação viável, mas com pouca gordura para investimento.</li>
        <li><strong>Acima de 20%:</strong> boa margem para o segmento. Negócio saudável com capacidade de reinvestimento.</li>
      </ul>
      <p>Para hamburguerias artesanais e lanches especiais com ticket médio mais alto, margens acima de 25% são alcançáveis. Para lanches simples em volume, margens entre 12% e 18% são mais comuns.</p>

      <h2>Como usar o Zelo PDV para calcular isso todo mês</h2>
      <p>Fazer essa conta manualmente uma vez até funciona. Fazer todo mês, com dados confiáveis, é o que realmente muda a gestão. O Zelo PDV registra suas vendas, despesas e fechamento de caixa em um lugar só, o que te dá os números necessários para calcular o lucro real sem depender de planilha ou de estimativa.</p>
      <p>Com o controle diário registrado, você consegue ver no fim do mês exatamente quanto entrou, quanto saiu e quanto sobrou — e parar de adivinhar se o negócio está lucrando ou não.</p>
      <p>Para entender como esse controle funciona na prática em lanchonetes, veja a página <a href="/para-lanchonetes">Zelo PDV para lanchonetes</a>. E se você quer conferir com transparência o que o Zelo faz e o que não faz antes de decidir, a página <a href="/sobre">Fatos sobre o Zelo PDV</a> reúne preço, escopo e limitações do produto em um só lugar.</p>
    `
  },
  {
    slug: 'sistema-pdv-para-lanchonete-online',
    title: 'Sistema PDV para lanchonete online: o que é, como funciona e como escolher',
    description:
      'Entenda o que é um sistema PDV para lanchonete online, quais funcionalidades são essenciais, e como escolher o mais adequado para o seu negócio sem pagar caro.',
    keyword: 'sistema pdv para lanchonete online',
    coverVariant: 'aqua',
    publishedAt: '2026-05-14',
    updatedAt: '2026-09-24',
    readingTime: '8 min',
    cover: { alt: 'Tela de um tablet com sistema de ponto de venda genérico sobre o balcão de uma lanchonete' },
    tldr: [
      'Um PDV online roda no navegador, sem instalação, e salva os dados na nuvem em vez de depender de um único computador.',
      'Funções essenciais para lanchonete: registro rápido de vendas, múltiplas formas de pagamento, fechamento de caixa diário, controle de fiado e registro de despesas.',
      'A maioria das lanchonetes independentes resolve bem com um sistema entre R$ 0 e R$ 100/mês, sem precisar de módulos que não vai usar.',
      'PDV online elimina o risco de perder dados se o computador quebrar, e atualiza sozinho sem visita técnica.'
    ],
    faq: [
      {
        question: 'PDV online funciona sem internet?',
        answer: 'Depende do sistema. Um PDV bem feito para o setor funciona como PWA offline: continua registrando vendas sem internet e sincroniza os dados assim que a conexão volta.'
      },
      {
        question: 'Preciso instalar algo no computador ou tablet?',
        answer: 'Não. Um PDV online roda direto no navegador, então funciona em computador, tablet ou celular sem instalação nem servidor próprio.'
      },
      {
        question: 'Qual a diferença entre PDV online e sistema instalado?',
        answer: 'O sistema instalado fica preso a uma máquina e depende de backup manual. O PDV online guarda tudo na nuvem, atualiza automaticamente e pode ser acessado de qualquer dispositivo.'
      },
      {
        question: 'PDV para lanchonete precisa ter controle de fiado?',
        answer: 'Para lanchonetes de bairro que trabalham com clientes recorrentes, sim — é uma das funcionalidades mais usadas no dia a dia, junto com fechamento de caixa e registro de despesas.'
      }
    ],
    content: `
      <p>Se você tem uma lanchonete e ainda controla as vendas no caderninho, na calculadora ou em uma planilha de Excel, existe uma boa chance de estar perdendo dinheiro sem perceber. Um sistema PDV (Ponto de Venda) para lanchonete online resolve exatamente esse problema — e hoje em dia é possível ter um sem instalar nada, sem servidor físico e sem pagar fortunas.</p>
      <p>Este artigo explica o que é um PDV online para lanchonete, quais funcionalidades realmente importam e como escolher o sistema certo para o seu tamanho de negócio.</p>

      <h2>O que é um sistema PDV para lanchonete?</h2>
      <p>PDV significa Ponto de Venda. Um sistema PDV é o software que registra as vendas do seu estabelecimento — o que foi vendido, quanto foi cobrado, qual foi a forma de pagamento e qual foi o troco. No lugar da gaveta de dinheiro com um caderno do lado, o PDV centraliza tudo em tela.</p>
      <p>Um PDV <em>online</em> é aquele que roda no navegador, sem precisar de instalação. Você acessa pelo computador, tablet ou celular, de qualquer lugar. Os dados ficam salvos na nuvem e não se perdem se o dispositivo quebrar ou for trocado.</p>

      <h2>Por que lanchonetes precisam de um PDV?</h2>
      <p>Alguns donos acham que PDV é coisa de supermercado ou de franquia grande. Na prática, qualquer negócio que vende mais de 20 itens por dia se beneficia de um sistema de controle. Veja os principais motivos:</p>
      <ul>
        <li><strong>Registro preciso das vendas:</strong> saber exatamente quanto entrou no dia, sem depender de memória</li>
        <li><strong>Fechamento de caixa confiável:</strong> confrontar o dinheiro físico com o que o sistema registrou</li>
        <li><strong>Controle de formas de pagamento:</strong> separar o que foi no dinheiro, cartão, Pix</li>
        <li><strong>Histórico para tomada de decisão:</strong> quais dias vendem mais, quais produtos saem mais</li>
        <li><strong>Menos erro de troco e de cobrança:</strong> o sistema calcula, não o funcionário no susto</li>
      </ul>

      <h2>Funcionalidades essenciais em um PDV para lanchonete</h2>
      <p>Não são todos os sistemas PDV que servem bem para lanchonetes. Algumas funções são indispensáveis para esse tipo de operação:</p>

      <h2>Registro de vendas rápido</h2>
      <p>Em hora de pico, a lanchonete não pode parar para o atendente mexer em telas complicadas. O PDV precisa ser ágil: seleciona o produto, registra a quantidade, confirma o pagamento. Menos cliques, mais velocidade.</p>

      <h2>Múltiplas formas de pagamento</h2>
      <p>Dinheiro, cartão de débito, crédito, Pix. Um bom PDV registra tudo separado, para que o fechamento de caixa bata com exatidão. Não pode misturar entradas de cartão com entradas em espécie.</p>

      <h2>Fechamento de caixa diário</h2>
      <p>No fim do dia, o sistema deve gerar um resumo: total de vendas, entradas por forma de pagamento, sangrias, saldo esperado. Esse fechamento é o termômetro financeiro da lanchonete — e é onde você identifica se tem sobra, falta ou diferença.</p>

      <h2>Controle de fiado</h2>
      <p>Em lanchonetes de bairro e de comunidade, o fiado é uma realidade. Um bom sistema PDV para esse tipo de negócio precisa ter um módulo de fiado: cadastro de clientes, registro do que foi fiado, data e controle do que foi pago.</p>

      <h2>Registro de despesas</h2>
      <p>Só controlar o que entrou não basta. O PDV precisa também registrar o que saiu: compras de mercadoria, conta de luz, pagamento de funcionário. Sem esse registro, é impossível calcular o lucro real.</p>

      <h2>Como um PDV online se diferencia do sistema instalado</h2>
      <p>PDVs tradicionais são instalados diretamente na máquina. Se o computador quebra, você perde os dados — a não ser que tenha backup. Se precisar acessar de outro dispositivo, não consegue. Se o programa precisar de atualização, alguém precisa ir até o ponto e fazer manualmente.</p>
      <p>Um PDV online (baseado em nuvem) resolve tudo isso:</p>
      <ul>
        <li>Acesso de qualquer dispositivo com navegador</li>
        <li>Dados salvos automaticamente na nuvem</li>
        <li>Atualizações automáticas, sem intervenção manual</li>
        <li>Sem necessidade de servidor ou infraestrutura própria</li>
        <li>Geralmente com custo menor e planos mensais acessíveis</li>
      </ul>

      <h2>Quanto custa um sistema PDV para lanchonete?</h2>
      <p>O mercado oferece opções para todos os bolsos:</p>
      <ul>
        <li><strong>Gratuito ou freemium:</strong> versões com funcionalidades básicas, boas para quem está começando</li>
        <li><strong>R$ 50 a R$ 150/mês:</strong> sistemas completos para pequenas operações, com suporte incluso</li>
        <li><strong>R$ 200 a R$ 500/mês:</strong> soluções mais robustas, com módulos de estoque, multi-estabelecimentos e integrações</li>
      </ul>
      <p>Para a maioria das lanchonetes independentes, um sistema entre R$ 0 e R$ 100/mês já resolve bem. Não vale pagar por funcionalidades que você não vai usar.</p>

      <h2>O Zelo PDV foi feito para lanchonetes como a sua</h2>
      <p>O Zelo PDV é um sistema PDV online desenvolvido especificamente para lanchonetes, hamburguerias e pequenos estabelecimentos de alimentação. Funciona direto no navegador, sem instalação, com interface pensada para velocidade no atendimento e clareza no fechamento.</p>
      <p>Cobre vendas, fiado, despesas, fechamento de caixa e histórico — tudo em um só lugar. Para quem está saindo do caderninho ou da planilha, é o ponto de partida mais prático para organizar a gestão sem complicar a operação.</p>
      <p>Veja os detalhes específicos para o seu tipo de negócio em <a href="/para-lanchonetes">Zelo PDV para lanchonetes</a>, compare com outras opções do mercado em <a href="/vs-saipos">Zelo PDV vs. Saipos</a> ou consulte os fatos completos do produto em <a href="/sobre">Fatos sobre o Zelo PDV</a>.</p>
    `
  },
  {
    slug: 'controle-de-caixa-para-hamburgueria',
    title: 'Controle de caixa para hamburgueria: como fazer do jeito certo',
    description:
      'Guia completo de controle de caixa para hamburgueria: abertura, sangria, fechamento e como identificar diferenças antes que virem problema.',
    keyword: 'controle de caixa para hamburgueria',
    coverVariant: 'slate',
    publishedAt: '2026-05-17',
    updatedAt: '2026-09-24',
    readingTime: '7 min',
    cover: { alt: 'Gaveta de caixa aberta com dinheiro e cartões ao lado de um balcão de hamburgueria' },
    tldr: [
      'Controle de caixa tem 4 etapas: abertura com fundo de caixa, registro de vendas por forma de pagamento, sangria e fechamento com conferência.',
      'A fórmula do fechamento é: fundo de caixa + vendas em dinheiro − sangrias = saldo esperado, comparado com o dinheiro físico contado.',
      'Uma diferença de 2% no caixa de uma hamburgueria com movimento médio pode representar mais de R$ 2.000/mês em perdas silenciosas.',
      'Diferenças pequenas e recorrentes costumam ser falha de processo, não desvio — mas precisam ser investigadas no mesmo dia.'
    ],
    faq: [
      {
        question: 'O que é sangria no controle de caixa?',
        answer: 'Sangria é a retirada de dinheiro do caixa durante o expediente para reduzir o valor acumulado, por segurança. Precisa ser registrada com valor, horário e responsável.'
      },
      {
        question: 'Como calcular o saldo esperado no fechamento de caixa?',
        answer: 'Some o fundo de caixa da abertura com o total de vendas em dinheiro do dia, subtraia as sangrias realizadas. O resultado deve bater com o dinheiro físico contado.'
      },
      {
        question: 'O Pix entra na conferência do caixa físico?',
        answer: 'Não. O Pix cai direto na conta bancária, não no caixa físico — por isso precisa ser registrado separado de dinheiro, débito e crédito no fechamento.'
      },
      {
        question: 'O que fazer quando o caixa não fecha certo?',
        answer: 'Investigue no mesmo dia: confira troco, vendas não registradas, despesas pagas sem lançamento e sangrias esquecidas. Diferença recorrente é sinal de processo a corrigir, não só erro pontual.'
      }
    ],
    content: `
      <p>Hamburgueria é um negócio com ritmo intenso: fila nos horários de pico, vários pedidos simultâneos, pagamentos por dinheiro, cartão, Pix e até pelo delivery. Nesse ambiente, o controle de caixa é o que impede que o dinheiro escorra por descuido, erro de troco ou desvio sem que ninguém perceba.</p>
      <p>Este guia explica como fazer o controle de caixa de uma hamburgueria do jeito correto — da abertura ao fechamento — sem precisar de contador ou de sistema caro para começar.</p>

      <h2>Por que hamburgueria precisa de controle de caixa rigoroso?</h2>
      <p>Hamburguerias têm uma característica que torna o controle de caixa ainda mais importante: ticket médio relativamente alto combinado com volume de pedidos elevado. Uma hamburgueria com 80 pedidos no dia e ticket de R$ 45 movimenta R$ 3.600 diários. Uma diferença de 2% — por erro de troco, desconto não autorizado ou esquecimento — representa R$ 72 por dia, R$ 2.160 por mês.</p>
      <p>Sem controle, essas perdas se acumulam silenciosamente e aparecem só quando o caixa está no vermelho e já é difícil identificar onde foi o problema.</p>

      <h2>As 4 etapas do controle de caixa</h2>

      <h2>1. Abertura de caixa</h2>
      <p>Antes de qualquer venda, o caixa deve ser aberto com um <strong>fundo de caixa</strong>: o valor em dinheiro físico colocado no início do turno para dar troco. Esse valor precisa ser registrado.</p>
      <ul>
        <li>Defina um valor padrão de fundo de caixa (ex: R$ 100)</li>
        <li>Confira o valor físico antes de abrir</li>
        <li>Registre o horário e o responsável pela abertura</li>
      </ul>
      <p>Parece burocracia, mas a abertura registrada é o ponto de partida do confronto no fechamento. Sem ela, qualquer diferença vira dúvida.</p>

      <h2>2. Registro de todas as vendas</h2>
      <p>Durante o dia, cada venda precisa ser registrada com forma de pagamento. Dinheiro, débito, crédito e Pix têm destinos diferentes:</p>
      <ul>
        <li><strong>Dinheiro:</strong> fica fisicamente no caixa e é contado no fechamento</li>
        <li><strong>Débito e crédito:</strong> entram via maquininha e são liquidados pela operadora</li>
        <li><strong>Pix:</strong> entra direto na conta bancária, não no caixa físico</li>
      </ul>
      <p>Misturar essas entradas no controle é o erro mais comum em hamburguerias. O sistema ou planilha precisa separar cada tipo para que o fechamento seja possível.</p>

      <h2>3. Sangria</h2>
      <p>Sangria é a retirada de dinheiro do caixa durante o dia para evitar acúmulo excessivo. É uma prática de segurança: quanto menos dinheiro fica no caixa, menor o risco em caso de roubo ou erro.</p>
      <ul>
        <li>Defina um limite de valor no caixa físico (ex: R$ 300)</li>
        <li>Quando ultrapassar, retire o excedente e registre como sangria</li>
        <li>Guarde o valor retirado em local seguro</li>
        <li>Anote horário e responsável pela retirada</li>
      </ul>
      <p>A sangria não é saída de despesa — é movimentação interna. No fechamento, o valor sangrado entra na conta do total de dinheiro do dia.</p>

      <h2>4. Fechamento de caixa</h2>
      <p>O fechamento é o momento mais importante do controle. É quando você compara o que o sistema diz que deveria estar no caixa com o que está fisicamente.</p>
      <p>A fórmula é:</p>
      <ul>
        <li><strong>Fundo de caixa</strong> (abertura)</li>
        <li><strong>+ Total de vendas em dinheiro</strong></li>
        <li><strong>− Sangrias realizadas</strong></li>
        <li><strong>= Saldo esperado em caixa</strong></li>
      </ul>
      <p>Conte o dinheiro físico. Se bater com o saldo esperado, o caixa fechou certo. Se houver diferença — para mais ou para menos — é preciso identificar o motivo antes de fechar.</p>

      <h2>O que fazer quando o caixa não fecha</h2>
      <p>Diferença no caixa pode ter várias origens:</p>
      <ul>
        <li><strong>Troco errado:</strong> o atendente deu mais troco do que deveria</li>
        <li><strong>Venda não registrada:</strong> alguém recebeu em dinheiro e não lançou</li>
        <li><strong>Despesa paga sem registro:</strong> alguém tirou do caixa para pagar algo e não anotou</li>
        <li><strong>Desvio:</strong> menos comum, mas precisa ser investigado se as diferenças forem recorrentes</li>
      </ul>
      <p>O importante é registrar a diferença, buscar a causa e corrigir o processo. Uma diferença de R$ 5 pode ser erro; diferenças repetidas de R$ 50 são problema de processo — ou de pessoa.</p>

      <h2>Erros comuns que sabotam o controle de caixa em hamburguerias</h2>
      <ul>
        <li>Deixar o caixa aberto sem responsável definido</li>
        <li>Fazer compras com dinheiro do caixa sem registrar como saída</li>
        <li>Não separar o faturamento por forma de pagamento</li>
        <li>Fazer o fechamento de memória, sem comparar com registro</li>
        <li>Não registrar descontos dados no balcão</li>
      </ul>

      <h2>Como o Zelo PDV ajuda no controle de caixa</h2>
      <p>O Zelo PDV tem um módulo específico de controle de caixa desenvolvido para o ritmo de hamburguerias e lanchonetes. Abertura com fundo de caixa, registro de vendas por forma de pagamento, sangria, despesas e fechamento com relatório de diferença — tudo em uma tela simples, acessível pelo navegador sem instalação.</p>
      <p>O objetivo não é complicar a operação. É garantir que, no fim do dia, o dono saiba exatamente quanto entrou, quanto saiu e quanto deveria estar no caixa — em menos de cinco minutos de fechamento.</p>
      <p>Veja como o Zelo PDV se encaixa numa hamburgueria em <a href="/para-hamburguerias">Zelo PDV para hamburguerias</a> ou confira os fatos completos do produto em <a href="/sobre">Fatos sobre o Zelo PDV</a>.</p>
    `
  },
  {
    slug: 'como-controlar-fiado-em-lanchonete',
    title: 'Como controlar o fiado na lanchonete sem perder dinheiro nem cliente',
    description:
      'Aprenda a controlar o fiado na sua lanchonete de forma organizada: como registrar, cobrar sem constranger e definir limites sem perder clientes.',
    keyword: 'como controlar fiado em lanchonete',
    coverVariant: 'orbital',
    publishedAt: '2026-05-20',
    updatedAt: '2026-09-24',
    readingTime: '7 min',
    cover: { alt: 'Caderno de anotações de fiado ao lado de um celular em um balcão de lanchonete' },
    tldr: [
      'Fiado sem registro é o problema, não a prática em si: sem anotar cliente, valor e data, o dono perde controle de quanto está "na rua".',
      'Regras simples resolvem a maior parte do problema: limite por cliente, prazo combinado e registro obrigatório antes de qualquer venda fiada.',
      'Cobrar com lembrete amigável e mostrando o registro reduz o constrangimento e aumenta a taxa de recebimento.',
      'Fiado com mais de 60 dias tem baixa chance de recuperação — foque energia nos valores maiores e nos clientes que ainda frequentam o negócio.'
    ],
    faq: [
      {
        question: 'Como definir um limite de fiado por cliente?',
        answer: 'Escolha um valor máximo (por exemplo, entre R$ 50 e R$ 100, conforme o ticket médio do seu negócio) e não libere fiado novo para quem já atingiu o limite até que pague ou reduza o saldo.'
      },
      {
        question: 'Como cobrar fiado sem constranger o cliente?',
        answer: 'Troque a cobrança direta ("você deve R$ 60") por um lembrete do combinado ("chegou o dia que a gente combinou, consegue acertar essa semana?"), e mostre o registro para dar transparência sem parecer desconfiança.'
      },
      {
        question: 'Vale a pena controlar fiado em papel ou planilha?',
        answer: 'Funciona no começo, mas depende de disciplina para nunca ficar incompleto. Um sistema com histórico por cliente reduz erro e acelera a consulta na hora da cobrança.'
      },
      {
        question: 'O que fazer com fiado muito antigo, de meses atrás?',
        answer: 'Priorize os valores mais altos e os clientes que ainda aparecem no estabelecimento. Para valores pequenos muito antigos, muitas vezes o desgaste da cobrança não compensa o valor a recuperar.'
      }
    ],
    content: `
      <p>Fiado é uma prática antiga no comércio de bairro. Em lanchonetes, é quase inevitável: o cliente esqueceu a carteira, o pagamento caiu mas não apareceu na conta, o conhecido de sempre pediu para pagar depois. Na maioria das vezes, é bem-intencionado. Mas sem controle, o fiado acumula silenciosamente e vira um buraco no caixa que ninguém consegue explicar direito.</p>
      <p>Este artigo mostra como controlar o fiado na lanchonete de forma organizada, sem constrangimento e sem perder clientes que pagam honestamente.</p>

      <h2>Por que o fiado sem controle é perigoso</h2>
      <p>O problema do fiado não é a prática em si — é a falta de registro. Quando não tem controle:</p>
      <ul>
        <li>Você não sabe quanto está emprestando no total</li>
        <li>Não sabe quem deve, quanto e desde quando</li>
        <li>A cobrança depende de memória e acaba sendo esquecida</li>
        <li>Clientes "entendem" que podem ficar sem pagar por muito tempo</li>
        <li>No fechamento de caixa, o valor do fiado não aparece — e a conta não fecha</li>
      </ul>
      <p>Uma lanchonete com 15 clientes no fiado, cada um devendo em média R$ 40, tem R$ 600 "na rua" — às vezes há meses. Multiplicado por 12 meses, pode representar mais de R$ 7.000 em crédito não recebido por ano.</p>

      <h2>O primeiro passo: registrar tudo por escrito (ou no sistema)</h2>
      <p>A única forma de controlar fiado é registrar cada lançamento. Isso significa:</p>
      <ul>
        <li><strong>Nome do cliente</strong></li>
        <li><strong>Data da compra</strong></li>
        <li><strong>Valor fiado</strong></li>
        <li><strong>O que foi comprado</strong> (opcional, mas ajuda na cobrança)</li>
        <li><strong>Data e valor de cada pagamento recebido</strong></li>
      </ul>
      <p>Pode ser num caderno específico, numa planilha ou num sistema como o Zelo PDV. O que não pode é ser "de cabeça" ou misturado com outras anotações. O registro de fiado precisa ser fácil de consultar na hora que o cliente chegar para pagar.</p>

      <h2>Como definir regras claras de fiado</h2>
      <p>Antes de controlar melhor, é importante definir regras. Sem política, cada situação vira uma negociação diferente — e o dono sempre perde porque não quer constranger o cliente.</p>
      <p>Algumas regras simples que funcionam bem:</p>
      <ul>
        <li><strong>Limite por cliente:</strong> defina um valor máximo que um cliente pode dever (ex: R$ 80). Quando atingir, só recebe após quitar ou reduzir o saldo.</li>
        <li><strong>Prazo de pagamento:</strong> combine um prazo. "Quinzenal", "todo dia de pagamento" ou "até sexta" são acordos que normalizam a cobrança.</li>
        <li><strong>Registro obrigatório:</strong> se não tiver no cadastro, não tem fiado. Isso evita clientes de passagem que nunca voltam.</li>
        <li><strong>Sem acúmulo com prazo vencido:</strong> se o prazo passou e não pagou, não abre novo fiado até regularizar.</li>
      </ul>

      <h2>Como cobrar o fiado sem constranger o cliente</h2>
      <p>A parte mais difícil para a maioria dos donos de lanchonete é a cobrança. Muita gente prefere deixar o fiado crescer a ter uma conversa desconfortável. Mas a forma como você cobra faz toda a diferença.</p>
      <p>Dicas que funcionam na prática:</p>
      <ul>
        <li><strong>Lembre antes de perguntar:</strong> ao invés de "você deve R$ 60", experimente "oi, tá chegando o dia que a gente combinou — você consegue acertar ainda essa semana?"</li>
        <li><strong>Mostre o registro:</strong> ter o caderno ou o sistema mostra profissionalismo e tira o constrangimento de "eu não devia isso"</li>
        <li><strong>Seja consistente:</strong> cobrar um e ignorar outro cria desequilíbrio. Com todo mundo tratado igual, a cobrança deixa de parecer perseguição</li>
        <li><strong>Ofereça parcelamento informal:</strong> clientes com fiado alto às vezes ficam com vergonha de voltar. Propor pagar metade agora e metade depois dissolve a situação</li>
      </ul>

      <h2>O que fazer com fiado antigo que não foi pago</h2>
      <p>Fiado com mais de 60 dias tem baixa chance de recebimento. A recomendação prática é:</p>
      <ul>
        <li>Até 30 dias: cobrança ativa, lembre na próxima visita</li>
        <li>30 a 60 dias: contato direto, por mensagem ou pessoalmente</li>
        <li>Acima de 60 dias: avalie o custo-benefício. Para valores pequenos, às vezes o desgaste não vale. Para valores altos, considere uma conversa direta sobre o acordo.</li>
      </ul>
      <p>Não adianta tentar recuperar todos os fiados antigos de uma vez. Foque nos maiores e nos clientes que ainda frequentam o estabelecimento.</p>

      <h2>Como o Zelo PDV controla o fiado automaticamente</h2>
      <p>O Zelo PDV tem um módulo de fiado que permite cadastrar clientes, registrar o que foi fiado em cada visita e marcar os pagamentos recebidos. Em vez de folhear um caderno ou lembrar de cabeça, você abre o sistema, busca o nome do cliente e vê o histórico completo: quanto deve, desde quando e o que foi pago.</p>
      <p>Na hora da cobrança, isso muda tudo. Não é mais você dizendo "acho que você deve uns R$ 50" — é o sistema mostrando R$ 47,50 registrados em três compras nas datas específicas. Profissionalismo que facilita a cobrança e evita discussão.</p>
      <p>Para lanchonetes que convivem com fiado no dia a dia, ter esse controle organizado é a diferença entre uma prática sustentável e um vazamento constante de caixa.</p>
      <p>Veja como isso funciona na prática em <a href="/para-lanchonetes">Zelo PDV para lanchonetes</a> ou confira os fatos completos do produto em <a href="/sobre">Fatos sobre o Zelo PDV</a>.</p>
    `
  },
  {
    slug: 'como-calcular-taxa-aplicativo-delivery',
    title: 'Taxas de aplicativos de delivery: quanto iFood, Rappi e outros cobram do restaurante em 2026',
    description:
      'Guia atualizado em abril de 2026 com as taxas reais de iFood, Rappi, 99Food e Aiqfome. Aprenda a calcular se plataformas de delivery estão dando lucro ou prejuízo.',
    keyword: 'taxa ifood restaurante',
    coverVariant: 'ember',
    publishedAt: '2026-04-01',
    updatedAt: '2026-09-24',
    readingTime: '8 min',
    cover: { alt: 'Sacolas de entrega de delivery organizadas sobre um balcão ao lado de um celular com tela de aplicativo' },
    tldr: [
      'iFood cobra 12% (Plano Básico) ou 23% (Plano Entrega) de comissão, mais 3,2% de taxa de pagamento online e mensalidade de R$110 ou R$150 (isenta abaixo de R$1.800/mês de faturamento).',
      'Rappi não divulga um percentual fixo publicamente — a comissão é informada durante o cadastro e pode variar por contrato.',
      'Aiqfome cobra 14,99% (entrega própria) ou 19,99% (entrega pelo app), com mensalidade de R$89,90 isenta até R$1.500/mês de faturamento.',
      'Uber Eats encerrou a operação de delivery de restaurantes no Brasil em 2022 e não voltou.',
      'Antes de aceitar qualquer pedido pelo app, calcule o valor líquido depois das taxas e compare com o custo real do produto — é isso que mostra se a venda dá lucro ou prejuízo.'
    ],
    faq: [
      {
        question: 'Quanto o iFood cobra de comissão em 2026?',
        answer: 'No Plano Básico, 12% do valor do pedido; no Plano Entrega (com logística do iFood), 23%. Em ambos, soma-se 3,2% de taxa de pagamento online sobre pedidos pagos pelo app, e mensalidade de R$110 ou R$150 quando o faturamento passa de R$1.800/mês.'
      },
      {
        question: 'Qual app de delivery cobra a menor taxa?',
        answer: 'Não existe resposta única: as taxas mudam por região, contrato e promoção vigente. Rappi e 99Food já tiveram períodos de isenção temporária de comissão; a forma mais segura de comparar é confirmar a taxa oferecida no cadastro de cada plataforma para o seu CNPJ.'
      },
      {
        question: 'O Uber Eats ainda funciona no Brasil?',
        answer: 'Não. O Uber Eats encerrou as operações de entrega de restaurantes no Brasil em 2022 e não atua mais como marketplace de delivery de comida no país.'
      },
      {
        question: 'Como saber se estou tendo lucro vendendo por aplicativo?',
        answer: 'Calcule o valor líquido do pedido (preço menos comissão e taxa de pagamento) e subtraia o custo real do produto, incluindo embalagem. Se o que sobra é muito menor do que a venda no balcão, pode ser hora de ajustar o preço no app ou reavaliar o item.'
      }
    ],
    content: `
      <p>Se você tem uma lanchonete, hamburgueria ou qualquer negócio de alimentação e vende por aplicativo, saber exatamente quanto cada plataforma cobra é essencial. Muita gente cadastra o restaurante no iFood ou no Rappi, vê os pedidos entrando e acha que está lucrando — quando, na prática, está vendendo com margem negativa em alguns itens sem perceber.</p>
      <p>A conta não é só "quanto vendi menos a taxa". Existem comissões sobre o pedido, taxas de pagamento online, mensalidades e custos escondidos que, somados, podem consumir de 15% a 35% do valor de cada venda. Sem conhecer esses números, o dono toma decisão no escuro e descobre o problema só quando o caixa aperta no fim do mês.</p>
      <p>Este artigo foi atualizado em <strong>setembro de 2026</strong> com os dados mais recentes das principais plataformas no Brasil, verificados diretamente nos canais oficiais de parceiros de cada empresa. Vamos mostrar quanto cada uma cobra, como calcular se a operação está dando lucro e o que fazer para não perder dinheiro.</p>

      <h2>Quanto cada plataforma cobra do restaurante</h2>
      <p>Antes de qualquer cálculo, é importante entender a estrutura de cobrança. A maioria das plataformas combina três tipos de custo:</p>
      <ul>
        <li><strong>Comissão sobre o pedido</strong> — percentual sobre o valor total da venda</li>
        <li><strong>Taxa de pagamento online</strong> — percentual sobre pedidos pagos pelo app (no iFood, 3,2%; varia por plataforma)</li>
        <li><strong>Mensalidade</strong> — valor fixo mensal, em alguns casos isento para faturamentos baixos</li>
      </ul>
      <p>Abaixo, os valores praticados por cada plataforma em 2025/2026:</p>

      <h2>iFood</h2>
      <p>O iFood é a maior plataforma de delivery do Brasil e oferece dois planos principais:</p>
      <ul>
        <li><strong>Plano Básico (entrega própria):</strong> comissão de <strong>12%</strong> sobre o valor do pedido, mensalidade de R$ 110 (isenta abaixo de R$ 1.800/mês de faturamento)</li>
        <li><strong>Plano Entrega (logística do iFood):</strong> comissão de <strong>23%</strong> sobre o valor do pedido, mensalidade de R$ 150 (mesma regra de isenção)</li>
      </ul>
      <p>Em ambos os planos, existe também a <strong>taxa de pagamento online</strong> de 3,2% sobre pedidos pagos pelo aplicativo. Isso significa que, no Plano Entrega, o custo real pode chegar a <strong>26,2%</strong> da venda. Valores confirmados na <a href="https://blog-parceiros.ifood.com.br/taxas-ifood/" target="_blank" rel="noopener noreferrer">página oficial de taxas do iFood para parceiros</a> (atualização de 23/06/2026) — como a política pode mudar por região e categoria, vale conferir direto no Portal do Parceiro antes de decidir.</p>

      <h2>Rappi</h2>
      <p>A Rappi anunciou em 2025 um investimento de R$ 1,4 bilhão no Brasil, com <strong>isenção de comissão de intermediação por até 3 anos</strong> para restaurantes parceiros (cobrando só a taxa de adquirência de pagamento, na faixa de 3,5%). A empresa, porém, <strong>não divulga um percentual fixo de comissão publicamente</strong> fora desse programa: segundo a própria <a href="https://merchants.rappi.com/pt-br/quanto-a-rappi-cobra-de-comissao-das-lojas-que-vendem-em-sua-plataforma" target="_blank" rel="noopener noreferrer">página oficial do Rappi Partners</a>, "a comissão que a Rappi cobra dos restaurantes vai depender de vários fatores" e só é informada durante o cadastro.</p>
      <p>Na prática, isso significa que não dá para citar um número único e confiável sem consultar o cadastro para o seu CNPJ e região — desconfie de qualquer fonte que apresente uma taxa fixa da Rappi como definitiva.</p>

      <h2>99Food</h2>
      <p>A 99Food chegou ao Brasil com uma estratégia de taxas competitivas para atrair restaurantes, incluindo períodos promocionais de isenção total de comissão no primeiro ano de parceria em algumas praças. Fora da promoção, a faixa reportada pela própria 99Food fica em torno de <strong>8,9% a 12%</strong> de comissão, dependendo de quem faz a entrega (logística própria da 99Food ou do restaurante), mais uma taxa de pagamento de aproximadamente 3,2% sobre pedidos pagos pelo app.</p>
      <p>Como essas condições mudam por cidade e por período promocional, confirme a taxa vigente diretamente no <a href="https://99app.com/99food/restaurantes/guias/entendendo-as-cobrancas-da-99food/" target="_blank" rel="noopener noreferrer">guia oficial da 99Food sobre cobranças</a> antes de decidir.</p>

      <h2>Aiqfome</h2>
      <p>O Aiqfome tem forte presença em cidades do interior do Brasil. Segundo o <a href="https://www.parceiros.aiqfome.com/" target="_blank" rel="noopener noreferrer">portal oficial de parceiros</a>, a plataforma unificou a cobrança em uma taxa única por modalidade:</p>
      <ul>
        <li><strong>Entrega feita pelo próprio restaurante:</strong> taxa única de <strong>14,99%</strong> sobre o pedido</li>
        <li><strong>Entrega feita pelo Aiqfome:</strong> taxa única de <strong>19,99%</strong> sobre o pedido</li>
        <li><strong>Mensalidade:</strong> R$ 89,90, isenta para faturamento até R$ 1.500/mês</li>
        <li>Sem taxa de adesão nem de rescisão; repasses semanais sem custo adicional</li>
      </ul>

      <h2>Uber Eats ainda existe no Brasil?</h2>
      <p><strong>Não.</strong> O Uber Eats encerrou as operações de entrega de restaurantes no Brasil em 2022. Ainda existe o aplicativo para outros serviços, mas não atua mais como marketplace de delivery de comida.</p>

      <h2>Como calcular se a venda pelo app está dando lucro</h2>
      <p>A conta mais importante que todo dono de lanchonete precisa fazer é simples: <strong>quanto realmente entra no meu bolso depois de todas as taxas?</strong></p>
      <p>Vamos usar um exemplo prático. Imagine que você vendeu um lanche por <strong>R$ 30,00</strong> no iFood com o Plano Entrega:</p>
      <ul>
        <li>Comissão do iFood (23%): <strong>−R$ 6,90</strong></li>
        <li>Taxa de pagamento online (3,2%): <strong>−R$ 0,96</strong></li>
        <li><strong>Valor líquido recebido: R$ 22,14</strong></li>
      </ul>
      <p>Agora pergunte: qual é o custo desse lanche para produzir? Se o custo do ingrediente + embalagem é R$ 12,00, sua margem real é:</p>
      <ul>
        <li>R$ 22,14 (líquido) − R$ 12,00 (custo) = <strong>R$ 10,14 de lucro bruto</strong></li>
        <li>Isso representa uma margem de <strong>33,8%</strong> sobre o valor da venda</li>
      </ul>
      <p>Agora compare com o mesmo lanche vendido no balcão, sem taxa nenhuma:</p>
      <ul>
        <li>R$ 30,00 − R$ 12,00 = <strong>R$ 18,00 de lucro bruto (60%)</strong></li>
      </ul>
      <p>A diferença é de quase R$ 8,00 por pedido. Se você vende 20 lanches por dia pelo app, está deixando cerca de <strong>R$ 157,00 por dia</strong> em comissões — mais de <strong>R$ 4.700,00 por mês</strong>.</p>

      <h2>Quando vale a pena vender por aplicativo</h2>
      <p>Apesar dos custos, plataformas de delivery podem valer a pena em situações específicas:</p>
      <ul>
        <li><strong>Visibilidade:</strong> Você aparece para milhares de pessoas que não conheceriam seu negócio de outra forma</li>
        <li><strong>Capacidade ociosa:</strong> Se a cozinha tem ociosidade em certos horários, pedidos de app usam capacidade que já existe</li>
        <li><strong>Volume:</strong> Mesmo com margem menor, um volume alto de pedidos pode compensar</li>
        <li><strong>Aquisição de clientes:</strong> Clientes que te conhecem pelo app podem virar compradores diretos depois</li>
      </ul>
      <p>O que <strong>não</strong> vale a pena é vender pelo app sem saber quanto está entrando e quanto está saindo. Isso é o que separa quem lucra de quem trabalha de graça.</p>

      <h2>5 dicas para lucrar vendendo por aplicativo</h2>

      <h2>1. Tenha preço diferente para o app</h2>
      <p>Muitos restaurantes vendem no iFood pelo mesmo preço do balcão. Isso significa que toda a margem que seria lucro vai para a plataforma. Considere aumentar o preço no app entre 10% e 20% para compensar as taxas. A maioria dos clientes de delivery já espera isso.</p>

      <h2>2. Conheça o custo real de cada produto</h2>
      <p>Antes de colocar um item no cardápio do app, faça a conta: custo do ingrediente + embalagem + taxa da plataforma. Se o que sobra é muito baixo ou negativo, esse item não deveria estar no delivery — ou precisa de reajuste de preço.</p>

      <h2>3. Registre as vendas de plataforma separado</h2>
      <p>Se as vendas do app se misturam com as do balcão no seu controle, você nunca vai saber qual canal dá mais lucro. Separe os registros por forma de pagamento: iFood, Rappi, balcão, Pix. Assim fica claro o que cada canal traz de verdade.</p>

      <h2>4. Monitore o percentual que vai em taxa todo mês</h2>
      <p>No fim de cada mês, calcule: total faturado nas plataformas vs. total recebido líquido. Se a diferença está acima de 25%, reavalie os planos contratados e os itens mais vendidos por delivery. Pode haver espaço para negociar ou trocar de plano.</p>

      <h2>5. Compare plataformas e diversifique</h2>
      <p>Não fique preso a um só app. Se iFood cobra 23% e 99Food cobra 9%, talvez valha ter presença nos dois e direcionar esforço de marketing para onde a margem é melhor. A promoção de isenção do Rappi, por exemplo, pode ser uma oportunidade de curto prazo.</p>

      <h2>Como o Zelo PDV ajuda no controle das taxas de plataformas</h2>
      <p>O Zelo PDV agora permite que você <strong>configure as plataformas de delivery diretamente no seu perfil</strong>, definindo a taxa de comissão de cada uma. Na hora de finalizar a venda, basta selecionar a plataforma e o sistema calcula automaticamente quanto vai para a taxa e quanto é seu valor líquido.</p>
      <p>Isso significa que, ao registrar uma venda pelo iFood no caixa, você já vê na tela: "Taxa iFood 23% = −R$ 6,90 → Líquido: R$ 23,10". Sem surpresa, sem conta de cabeça, sem confusão no fechamento.</p>
      <p>Para quem vende pelo balcão e também por aplicativos, essa visibilidade muda o jogo. Você deixa de descobrir a margem real só quando o extrato do app chega e passa a enxergar, no mesmo dia, quanto cada canal de venda está trazendo de verdade para o negócio.</p>
      <p>O resultado é simples: mais controle sobre a operação e menos dinheiro perdido por falta de informação. Para quem já vende por plataforma — e principalmente para quem está pensando em começar — saber exatamente quanto fica é o primeiro passo para não trabalhar de graça.</p>
      <p>Se a maior parte do seu movimento já vem de delivery próprio ou de apps, veja como o Zelo PDV se encaixa em <a href="/para-delivery">Zelo PDV para delivery próprio</a>, ou confira o preço de cada módulo em <a href="/sobre">Fatos sobre o Zelo PDV</a>.</p>
    `
  },
  {
    slug: 'como-fechar-caixa-lanchonete',
    title: 'Como fechar o caixa de uma lanchonete do jeito certo',
    description:
      'Aprenda o passo a passo para fechar o caixa da sua lanchonete com segurança, sem erro e sem perder dinheiro.',
    keyword: 'como fechar caixa lanchonete',
    coverVariant: 'aqua',
    publishedAt: '2026-03-12',
    updatedAt: '2026-09-24',
    readingTime: '6 min',
    cover: { alt: 'Pessoa contando notas de dinheiro sobre o balcão ao final do expediente de uma lanchonete' },
    tldr: [
      'Fechar o caixa é comparar o que deveria estar ali (fundo inicial + vendas em dinheiro − sangrias − despesas pagas em espécie) com o dinheiro físico contado.',
      'Separe sempre dinheiro, cartão, Pix e fiado — misturar formas de pagamento é o erro mais comum e some com a rastreabilidade.',
      'Registre sangrias e pequenas despesas no momento em que acontecem, nunca "para lembrar depois".',
      'Fechamento feito todo dia, no mesmo horário, é o que permite investigar diferença enquanto a informação ainda está fresca.'
    ],
    faq: [
      {
        question: 'Quais formas de pagamento entram na contagem do caixa físico?',
        answer: 'Só o dinheiro em espécie entra na contagem física. Cartão é liquidado pela operadora e Pix cai direto na conta bancária — nenhum dos dois deve ser somado ao dinheiro contado na gaveta.'
      },
      {
        question: 'O que fazer se o fechamento tiver diferença?',
        answer: 'Investigue no mesmo dia, enquanto a operação está fresca: confira troco dado, sangrias e despesas registradas, e se alguma venda em dinheiro deixou de ser lançada.'
      },
      {
        question: 'É preciso fechar o caixa todos os dias?',
        answer: 'Sim. Fechamento atrasado (semanal, por exemplo) dificulta muito identificar a causa de uma diferença, porque a informação do dia específico já se perdeu na memória da equipe.'
      }
    ],
    content: `
      <p>Fechar o caixa corretamente parece uma tarefa simples, mas é justamente aí que muita lanchonete pequena começa a perder dinheiro sem perceber. A venda acontece, o movimento foi bom, o balcão girou e, no fim do dia, ainda sobra aquela dúvida: entrou tudo o que deveria? Faltou alguma coisa? O dinheiro no caixa bate com o que foi vendido? Quando esse fechamento é feito na correria, de cabeça ou com anotações espalhadas, o dono passa a conviver com pequenos furos que se repetem semana após semana.</p>
      <p>O problema é que erro pequeno em fechamento de caixa quase nunca aparece como um grande susto de uma vez. Ele aparece como troco mal calculado, despesa que não foi lançada, venda no Pix sem registro, sangria esquecida ou anotação que ficou para depois e nunca foi conferida. No papel, parece detalhe. Na prática, vira margem indo embora. Para uma lanchonete, que normalmente trabalha com operação enxuta, isso pesa direto no lucro.</p>
      <p>Se você quer aprender como fechar o caixa de uma lanchonete do jeito certo, o caminho não é complicar. É criar um processo claro, repetível e fácil de conferir. Neste artigo, vamos organizar esse passo a passo para você sair do improviso e ter mais segurança no fim de cada dia.</p>

      <h2>O que é o fechamento de caixa e por que não dá para fazer de cabeça</h2>
      <p>Fechamento de caixa é a conferência final de tudo o que entrou e saiu do caixa durante um período. Em uma lanchonete, isso inclui dinheiro, Pix, cartão, troco inicial, sangrias, despesas pagas no dia e, dependendo da operação, até vendas no fiado. O objetivo é responder uma pergunta simples: o valor que está no caixa e nos registros bate com o movimento real do negócio?</p>
      <p>Quando essa conferência é feita de cabeça, o risco aumenta muito. A memória da equipe não substitui registro. Em dia corrido, ninguém lembra com precisão quanto saiu de troco, qual despesa foi paga em dinheiro, se houve retirada para fornecedor ou se uma venda no balcão foi registrada como cartão quando, na prática, o cliente pagou no Pix. A cabeça tenta preencher lacunas e quase sempre erra.</p>
      <p>Além disso, o fechamento de caixa não serve apenas para descobrir erro. Ele serve para dar visão. Uma lanchonete que fecha o caixa direito começa a perceber padrões: horários de maior movimento, formas de pagamento mais usadas, furos recorrentes e despesas que estão consumindo o resultado do dia. Sem fechamento correto, o dono até vende, mas administra no escuro.</p>

      <h2>Passo a passo para fechar o caixa da sua lanchonete</h2>
      <p>O primeiro passo é separar o troco inicial do restante do caixa. Isso evita confundir dinheiro que já estava ali antes de abrir com o que entrou durante o expediente. Se o caixa começou com um valor para troco, esse valor precisa estar identificado e ser considerado na conferência final.</p>
      <p>Depois, confira o dinheiro físico disponível. Conte as notas e moedas com calma e registre o valor encontrado. Essa etapa parece básica, mas é onde muita conferência começa errada: a pessoa olha rapidamente o caixa, assume o total e já pula para os próximos números. Sem essa base, todo o restante fica comprometido.</p>
      <p>Na sequência, confira as vendas registradas no sistema ou nas anotações do dia. O ideal é separar por forma de pagamento: dinheiro, cartão, Pix e, se existir, fiado. O importante aqui é não jogar tudo em um único bolo. Cada forma de pagamento precisa ser comparada com o que realmente aconteceu. Se o sistema mostra determinado valor em dinheiro, esse valor precisa conversar com o montante contado no caixa, descontando troco inicial, sangrias e despesas pagas em espécie.</p>
      <p>Outro ponto essencial é calcular o troco do dia. O troco inicial permanece no caixa ao final? Houve necessidade de reforço? Faltou dinheiro trocado em algum momento? Esse controle evita o erro comum de achar que sobrou mais dinheiro do que realmente sobrou. Muita lanchonete mistura o troco operacional com a receita do dia e acaba lendo o caixa de forma errada.</p>
      <p>Também é importante registrar sangrias. Se parte do dinheiro foi retirada do caixa ao longo do dia para reduzir risco, pagar algo urgente ou guardar no cofre, isso precisa aparecer no fechamento. A sangria não é desaparecimento de dinheiro; ela é uma saída planejada do caixa. Quando não entra no controle, vira "diferença" na hora da conferência.</p>
      <p>O mesmo vale para pequenas despesas pagas no dia. Comprou gelo, pagou entrega, repôs algo de última hora, fez uma retirada para resolver uma compra operacional? Tudo isso precisa estar lançado. O caixa não pode ser tratado como uma gaveta onde o dinheiro entra e sai sem rastro. Cada saída sem registro vira ruído no fechamento.</p>
      <p>Por fim, feche o caixa comparando o valor esperado com o valor encontrado. Se houver diferença, não ignore. Investigue no mesmo dia, enquanto a operação ainda está fresca. Diferença pequena recorrente quase nunca é azar. Normalmente é falha de processo, erro de registro ou desorganização que está se repetindo.</p>

      <h2>Erros comuns no fechamento de caixa de lanchonete</h2>
      <p>Um dos erros mais comuns é deixar para fechar tudo no fim da semana. Quando isso acontece, o dono perde a chance de identificar o problema no momento em que ele aconteceu. Fechamento atrasado vira tentativa de reconstruir o passado, e isso é muito mais difícil do que conferir o dia ainda recente.</p>
      <p>Outro erro frequente é não separar formas de pagamento. Quando dinheiro, Pix e cartão entram todos no mesmo cálculo sem distinção, a conferência fica superficial. O número até pode parecer plausível, mas não mostra onde o problema está se uma diferença aparecer.</p>
      <p>Muita lanchonete também erra ao não registrar sangria e despesas pequenas. O pensamento costuma ser: "Foi só uma saída rápida, depois eu lembro". Só que no fim do dia ninguém lembra com precisão. E quando soma várias pequenas saídas, a sensação é de dinheiro faltando sem explicação.</p>
      <p>Outro ponto crítico é depender de papel solto. Papel some, rasura, molha, fica no bolso, vai para a gaveta ou simplesmente se perde no meio da correria. Isso não significa que toda operação precisa virar uma burocracia enorme. Significa apenas que o registro precisa ficar centralizado em um lugar que dê para consultar depois.</p>
      <p>Também vale citar o erro de considerar faturamento como lucro. Fechar caixa não é só descobrir quanto entrou. É entender quanto ficou depois das saídas do dia. Quando o fechamento para no faturamento, o gestor da lanchonete ganha sensação de movimento, mas não ganha visão real do resultado.</p>

      <h2>Como um sistema PDV elimina esses erros</h2>
      <p>Um sistema PDV bem organizado reduz muito o espaço para improviso porque centraliza os registros do dia. Em vez de depender de memória, anotações soltas e conferência manual espalhada, a operação passa a registrar venda, forma de pagamento, fiado e despesas no mesmo ambiente. Isso já simplifica a rotina de quem precisa fechar o caixa com mais confiança.</p>
      <p>No caso do Zelo PDV, a proposta não é transformar a lanchonete em uma operação complicada. É justamente o contrário. O sistema ajuda a registrar as vendas rapidamente, lançar despesas, acompanhar o fiado e enxergar o resultado com mais clareza. Isso faz diferença porque o fechamento deixa de ser uma conta feita no susto e passa a seguir um fluxo previsível.</p>
      <p>Quando o dono sabe quanto entrou em dinheiro, quanto veio por Pix, o que saiu em sangria e quais despesas foram pagas no dia, o caixa deixa de ser uma incógnita. E quando isso acontece diariamente, a gestão melhora junto. Você reduz erro, encontra furos mais cedo e para de descobrir perda só no fim do mês, quando já ficou tarde demais.</p>
      <p>Fechar o caixa corretamente não é exagero administrativo. É uma forma de proteger o lucro da sua lanchonete. Quanto mais simples e consistente for esse processo, mais segurança você ganha para tomar decisão, corrigir problema e crescer sem ficar refém do improviso.</p>
      <p>Veja como esse fechamento funciona na prática em <a href="/para-lanchonetes">Zelo PDV para lanchonetes</a> ou compare com outras opções em <a href="/vs-goomer">Zelo PDV vs. Goomer</a>.</p>
    `
  },
  {
    slug: 'controle-de-fiado-lanchonete',
    title: 'Controle de fiado: como parar de perder dinheiro na lanchonete',
    description:
      'Veja como organizar o fiado da sua lanchonete sem caderninho, com histórico, limite e cobrança mais clara.',
    keyword: 'controle de fiado lanchonete',
    coverVariant: 'sunrise',
    publishedAt: '2026-03-12',
    updatedAt: '2026-09-24',
    readingTime: '6 min',
    cover: { alt: 'Balconista anotando o nome de um cliente em um sistema digital de controle de fiado' },
    tldr: [
      'Fiado mal controlado vira capital preso: dinheiro que a lanchonete já considera vendido, mas que ainda não voltou para o caixa.',
      'Um controle eficiente precisa de identificação clara do cliente, histórico de cada movimento, limite de crédito e acompanhamento de vencimento.',
      'O caderninho depende de disciplina manual; um controle digital dá visão imediata do total em aberto e de quem deve o quê.',
      'Fiado organizado não afasta cliente — pelo contrário, costuma aumentar o respeito pela regra e reduzir mal-entendido na cobrança.'
    ],
    faq: [
      {
        question: 'Qual a diferença entre fiado com controle e sem controle?',
        answer: 'Com controle, cada compra e pagamento fica registrado por cliente, com data e valor. Sem controle, o dono depende de memória ou anotações soltas, o que gera divergência e dificulta a cobrança.'
      },
      {
        question: 'Fiado digital substitui a relação de confiança com o cliente?',
        answer: 'Não. O controle digital só torna a relação mais transparente — o cliente continua comprando fiado, mas o histórico fica claro para os dois lados, o que reduz discussão na hora de acertar.'
      },
      {
        question: 'Quanto dinheiro uma lanchonete pode ter parado em fiado?',
        answer: 'Varia muito por negócio, mas mesmo uma carteira pequena de clientes fiéis pode representar centenas ou milhares de reais "na rua" ao longo do ano quando não há limite nem cobrança ativa.'
      }
    ],
    content: `
      <p>O fiado ainda faz parte da rotina de muitas lanchonetes. Ele nasce da confiança, da relação com cliente antigo e daquela vontade de não perder a venda por falta de dinheiro na hora. O problema é que, sem controle, o fiado deixa de ser um gesto comercial e vira um buraco no bolso. O cliente leva, promete pagar depois, alguém anota em um caderno, em um papel qualquer ou até no WhatsApp, e poucos dias depois já existe dúvida sobre valores, datas e quem realmente está devendo.</p>
      <p>Esse cenário é mais comum do que parece. Muita lanchonete pequena aceita fiado como parte natural da operação, mas trata o controle como algo secundário. O resultado é previsível: cobrança constrangedora, dívida esquecida, cliente confuso e dono sem saber quanto dinheiro está parado na rua em vez de estar no caixa.</p>
      <p>Se você quer melhorar o controle de fiado da sua lanchonete, o objetivo não é acabar com a proximidade com o cliente. É organizar a confiança para que ela não vire prejuízo. Neste artigo, vamos olhar para o que o fiado faz na prática com o caixa e como um controle mais profissional muda a rotina do negócio.</p>

      <h2>Quanto dinheiro lanchonetes perdem com fiado mal controlado</h2>
      <p>O prejuízo do fiado mal controlado raramente aparece de uma vez só. Ele vem em pequenas perdas acumuladas. Um cliente esquece uma compra, outra anotação fica incompleta, alguém pagou parte da dívida e ninguém registrou direito, um nome foi escrito sem data e depois ninguém lembra qual pedido era aquele. Separadamente, isso parece detalhe. Junto, vira dinheiro que deixa de voltar para o caixa.</p>
      <p>Além da perda direta, existe um custo de desorganização. Quando o dono não sabe quem deve, quanto deve e há quanto tempo deve, a cobrança fica mais difícil. Muitas vezes a pessoa evita cobrar por receio de errar ou de passar vergonha. Em outros casos, cobra com insegurança e o cliente questiona o valor. A operação perde tempo, autoridade e clareza.</p>
      <p>Também existe impacto no planejamento. Se uma parte relevante das vendas está no fiado, mas o controle é ruim, o faturamento do período parece maior do que a disponibilidade real de caixa. Isso atrapalha compra de insumo, reposição, pagamento de despesas e até leitura do lucro. Afinal, uma venda anotada como realizada, mas ainda não recebida, não ajuda a pagar conta naquele momento.</p>

      <h2>Como o fiado funciona na prática para cliente e para dono</h2>
      <p>Na prática, o fiado funciona como um crédito informal concedido ao cliente. Para ele, é conveniência. Para o dono da lanchonete, é uma forma de manter relacionamento e não perder venda. Em bairros e negócios com clientela recorrente, isso faz bastante sentido. O problema começa quando essa relação de confiança não vem acompanhada de regra.</p>
      <p>Sem regra, o cliente compra várias vezes sem saber seu saldo exato e o dono aceita porque acredita que depois resolve. Só que "depois" costuma chegar em um momento ruim: caixa apertado, mês virando, fornecedor cobrando ou necessidade de fazer reposição urgente. Nessa hora, o fiado deixa de ser uma facilidade comercial e vira capital preso fora da operação.</p>
      <p>Isso não significa que todo fiado seja ruim. Significa que o risco precisa ser administrado. Um fiado bem controlado pode continuar existindo como parte do modelo da lanchonete. O que não pode existir é fiado sem histórico, sem limite, sem data e sem acompanhamento.</p>

      <h2>O que é um controle de fiado eficiente</h2>
      <p>O primeiro elemento de um controle eficiente é identificar o cliente corretamente. Nome solto nem sempre basta. O ideal é ter um cadastro básico com dados que permitam localizar a pessoa sem ambiguidade. Isso evita confusão entre clientes com nomes parecidos e ajuda na hora de consultar histórico.</p>
      <p>O segundo ponto é manter histórico de movimentação. Não basta saber o saldo final. É importante registrar cada compra, cada pagamento e a data de cada movimento. Isso protege tanto o dono quanto o cliente, porque reduz discussão e cria rastreabilidade.</p>
      <p>Outro componente importante é definir limite de crédito. Muitas lanchonetes deixam o fiado crescer sem critério até o momento em que a cobrança fica delicada demais. Quando existe um limite claro, a operação continua amigável, mas passa a ter regra. Isso impede que uma relação informal se transforme em valor alto demais para recuperar depois.</p>
      <p>Também faz diferença acompanhar vencimento e frequência de cobrança. Cobrar cedo, com clareza e sem constrangimento, costuma ser mais eficaz do que deixar acumular por muito tempo. Quando o cliente percebe que o controle é sério e organizado, a relação tende a ficar até mais saudável.</p>
      <p>Por fim, um bom controle de fiado precisa estar integrado ao restante da gestão. Se o fiado fica separado do caixa e das vendas, o negócio perde visão. O ideal é que a venda no fiado já impacte o histórico do cliente e permita leitura clara do que foi vendido, recebido e ainda está pendente.</p>

      <h2>Fiado digital versus caderninho: o que muda na prática</h2>
      <p>O caderninho é rápido para começar, mas fraco para sustentar crescimento. Ele depende da caligrafia de quem anotou, da disciplina de registrar tudo, de estar sempre no mesmo lugar e de ninguém esquecer de atualizar quando o cliente paga. Se uma dessas etapas falha, a informação fica comprometida.</p>
      <p>No digital, o ganho principal é rastreabilidade. O histórico do cliente fica organizado, com valores e movimentações mais fáceis de consultar. Isso reduz perda de informação e torna a cobrança menos desconfortável, porque o dono não precisa "achar" quanto a pessoa deve. Ele simplesmente consulta o registro.</p>
      <p>Outra mudança importante é a velocidade para enxergar o total em aberto. No caderno, descobrir o saldo real do fiado muitas vezes exige somar páginas e lembrar pagamentos avulsos. Em um controle digital, a visão vem pronta. Isso muda a tomada de decisão porque o dono deixa de trabalhar na base da impressão.</p>
      <p>Também muda a postura da operação. Quando o fiado está organizado, o cliente percebe que existe controle. Isso não afasta necessariamente a venda. Muitas vezes, pelo contrário, aumenta o respeito pela regra. O ambiente fica mais profissional e menos sujeito a mal-entendido.</p>

      <h2>Como o Zelo PDV ajuda a organizar o fiado da lanchonete</h2>
      <p>O Zelo PDV foi pensado justamente para a realidade de pequenos negócios de alimentação que ainda convivem com o fiado, mas não querem continuar dependentes do caderno. Com ele, você consegue cadastrar clientes, acompanhar histórico e saber com mais clareza quem está devendo, quanto está devendo e como essa venda conversa com o restante da operação.</p>
      <p>Isso faz diferença porque o fiado deixa de ser uma informação isolada e passa a fazer parte da gestão. O dono enxerga melhor o caixa, registra vendas no mesmo sistema e consegue tratar o relacionamento com o cliente de forma mais profissional, sem perder proximidade.</p>
      <p>Na prática, o ganho não é só cobrar melhor. É parar de perder dinheiro por falta de organização. Quando o fiado sai do improviso, a lanchonete ganha previsibilidade, protege margem e reduz aquele desconforto de cobrar sem ter certeza absoluta dos números. Para quem quer manter a confiança do cliente sem abrir mão do controle, isso muda bastante o jogo.</p>
      <p>Para ver o módulo de fiado em contexto com o resto da gestão, confira <a href="/para-lanchonetes">Zelo PDV para lanchonetes</a> ou os fatos completos do produto em <a href="/sobre">Fatos sobre o Zelo PDV</a>.</p>
    `
  },
  {
    slug: '7-erros-lanchonetes-perdem-dinheiro',
    title: '7 erros que fazem lanchonetes perder dinheiro',
    description:
      'Conheça os erros mais comuns que corroem a margem de lanchonetes e veja como corrigi-los antes que o prejuízo aumente.',
    keyword: 'erros gestão lanchonete',
    coverVariant: 'ember',
    publishedAt: '2026-01-15',
    updatedAt: '2026-09-24',
    readingTime: '7 min',
    cover: { alt: 'Dono de lanchonete revisando anotações e recibos espalhados sobre o balcão' },
    tldr: [
      'Os 7 erros mais comuns: não fechar caixa todo dia, misturar dinheiro pessoal e do negócio, ignorar despesas pequenas, aceitar fiado sem controle, não saber o custo real dos produtos, não registrar sangrias e administrar tudo de cabeça.',
      'Nenhum desses erros é sobre falta de dedicação — são sobre ausência de processo simples e repetível.',
      'Erros pequenos e recorrentes corroem a margem de forma silenciosa, muito antes de aparecerem como prejuízo visível.',
      'O ponto de partida mais eficaz costuma ser o fechamento de caixa diário: ele expõe os outros erros mais rápido.'
    ],
    faq: [
      {
        question: 'Qual é o erro mais comum na gestão de lanchonetes?',
        answer: 'Administrar de cabeça, sem nenhum registro, é o mais citado — funciona em operações pequenas, mas não escala e não permite identificar tendência ou origem de perdas.'
      },
      {
        question: 'Por que misturar dinheiro pessoal e do negócio é um problema?',
        answer: 'Porque distorce o lucro real: sem separação clara, o dono não consegue saber se o negócio está de fato dando resultado, já que retiradas pessoais aparecem misturadas com custo operacional.'
      },
      {
        question: 'Por onde começar a corrigir esses erros?',
        answer: 'Pelo fechamento de caixa diário e pelo registro de despesas pequenas — são as duas mudanças de hábito mais simples e que já revelam boa parte dos outros problemas.'
      }
    ],
    content: `
      <p>Toda lanchonete tem uma lista de coisas para resolver. Fatura, pedido, reposição, atendimento, fornecedor. No meio disso tudo, existe um conjunto de erros que passa despercebido durante meses e, às vezes, anos. Não são erros graves de uma vez só. São pequenas falhas repetidas que consomem a margem silenciosamente. Quando o dono percebe, o negócio já perdeu muito mais do que imaginava.</p>
      <p>O problema é que esses erros são comuns. Eles aparecem em lanchonetes que vendem bem, que têm movimento e clientela fiel. A operação parece saudável por fora, mas o caixa nunca fecha como deveria. Isso acontece porque vender muito não é a mesma coisa que gerir bem. E quando a gestão tem buracos, o faturamento entra por uma porta e sai por outra sem deixar rastro.</p>
      <p>Neste artigo, vamos olhar para os sete erros mais comuns que fazem lanchonetes perder dinheiro sem perceber. Se você se identificar com algum deles, já é um passo importante. Porque o problema que tem nome é muito mais fácil de resolver.</p>

      <h2>Erro 1: não fechar o caixa todos os dias</h2>
      <p>O fechamento diário de caixa não é burocracia. É a única forma de saber, com certeza, quanto entrou, quanto saiu e onde está a diferença. Quando o dono passa dias ou semanas sem fechar, as informações se misturam e o problema fica mais difícil de identificar.</p>
      <p>Sem fechamento diário, erro de troco vira hábito, saída sem registro vira dinheiro "misteriosamente sumido" e despesa avulsa vira buraco que ninguém sabe explicar. O caixa passa a refletir uma realidade distorcida e a gestão começa a trabalhar com números que não batem com o movimento real.</p>
      <p>O fechamento não precisa ser complexo. Precisa ser feito todos os dias, no mesmo horário, com o mesmo processo. Isso cria disciplina, rastreia variação e protege a margem antes que o problema acumule.</p>

      <h2>Erro 2: misturar dinheiro pessoal com o do negócio</h2>
      <p>Esse é um dos erros mais comuns e mais difíceis de reconhecer, porque acontece de forma natural. O dono precisa de dinheiro pessoal, pega do caixa. Precisa comprar algo para casa, usa o cartão do negócio. Na hora, parece pequeno. No fim do mês, é impossível saber o que foi custo da operação e o que foi gasto pessoal.</p>
      <p>Quando pessoal e negócio se misturam, o lucro real some dentro dos extratos. O dono não consegue saber se o negócio está dando resultado porque os números já não refletem só a operação. Em situações assim, muitas pessoas confundem fluxo de caixa com rentabilidade e tomam decisões baseadas em sensação, não em dados.</p>
      <p>A solução começa com separação. Conta bancária diferente, retirada definida como pró-labore e qualquer saída pessoal registrada como tal. Parece simples, mas essa separação muda completamente a clareza da gestão.</p>

      <h2>Erro 3: ignorar as despesas pequenas</h2>
      <p>Gastos com gelo, troco, embalagem avulsa, limpeza, gás de reposição urgente — esses itens parecem tão pequenos que muita lanchonete simplesmente não os registra. O pensamento é: "Depois eu lembro." Só que ninguém lembra. E quando você soma doze meses de pequenas despesas ignoradas, o resultado costuma ser maior do que qualquer um esperava.</p>
      <p>O que acontece na prática é que as despesas pequenas criam uma fuga invisível de caixa. O movimento do dia parece bom, o faturamento é o esperado, mas a sobra é menor do que deveria. A explicação está nessas saídas que nunca entraram nos registros.</p>
      <p>Controlar despesa pequena não exige tempo. Exige processo. Um lugar para registrar qualquer saída no momento em que ela acontece. Com o tempo, esse hábito revela padrões e mostra onde é possível reduzir custo sem comprometer a operação.</p>

      <h2>Erro 4: aceitar fiado sem controle</h2>
      <p>O fiado faz parte da cultura de muitas lanchonetes e, quando bem gerido, pode ser uma ferramenta de fidelização. O problema começa quando ele existe sem regra: sem limite, sem histórico, sem data de pagamento e sem cobrança consistente.</p>
      <p>Nessas condições, o fiado vira capital preso. A lanchonete vendeu, registrou o movimento, mas o dinheiro está na rua. E quando não existe histórico claro, a cobrança fica constrangedora porque o dono não tem certeza dos valores e o cliente questiona qualquer número apresentado.</p>
      <p>O impacto vai além do valor em aberto. Uma carteira de fiado descontrolada distorce o faturamento, cria falsa sensação de caixa cheio e pode comprometer o pagamento de fornecedores em meses em que a inadimplência aumenta.</p>

      <h2>Erro 5: não saber o custo real dos produtos</h2>
      <p>Muitos donos de lanchonete definem preço de venda baseado no que o concorrente cobra ou no que parece razoável. Sem conhecer o custo real de cada item, fica impossível saber se a margem está protegida ou se alguns produtos estão sendo vendidos com prejuízo embutido.</p>
      <p>Custo real inclui ingrediente, embalagem, gás, perdas e, em alguns casos, tempo de preparo. Quando só o ingrediente entra no cálculo, a precificação fica comprometida. E quando o preço está errado, pode ser que quanto mais você vende, mais você perde — sem perceber.</p>
      <p>Calcular custo de produto não precisa ser uma análise complexa. Mas precisa ser feito ao menos uma vez por produto, revisado quando os insumos encarecem e considerado na hora de montar cardápio e definir promoção.</p>

      <h2>Erro 6: não registrar sangrias e retiradas</h2>
      <p>Toda saída de dinheiro do caixa precisa de registro, independente do motivo. Sangria para reduzir risco, retirada para pagar fornecedor ou qualquer outro movimento de saída que não tenha nota — tudo isso precisa aparecer no controle do dia.</p>
      <p>Quando sangria não é registrada, ela se transforma em diferença inexplicável no fechamento de caixa. O total esperado não bate com o encontrado e ninguém consegue rastrear o que aconteceu. Com o tempo, o dono começa a suspeitar da equipe quando, na verdade, o problema é de processo.</p>
      <p>Registrar sangria é rápido. O que exige disciplina é fazer isso toda vez, sem exceção. Uma saída não registrada hoje vira padrão amanhã.</p>

      <h2>Erro 7: administrar de cabeça, sem nenhum registro</h2>
      <p>Esse talvez seja o erro mais comum entre pequenos negócios de alimentação. O dono conhece a operação, tem anos de experiência e sente que consegue controlar tudo na memória. Até consegue, em muitos casos. Mas memória não é dado. E quando o negócio cresce, a complexidade aumenta e nenhuma memória humana sustenta o volume de informação que uma operação produz todo dia.</p>
      <p>Gerir de cabeça significa que qualquer decisão é baseada em impressão, não em histórico. Isso não protege contra erro e não permite identificar tendência. O dono que administra assim não sabe, com precisão, quais produtos têm melhor margem, em quais dias o movimento cai, quanto sobra depois de pagar as despesas do mês ou se o negócio está crescendo ou apenas vendendo mais do mesmo.</p>
      <p>A transição de gestão intuitiva para gestão com dados não precisa acontecer de uma vez. Pode começar com um registro simples do caixa diário. Mas precisa começar.</p>

      <h2>Como evitar esses erros na prática</h2>
      <p>A maioria desses erros não tem origem em falta de dedicação. Eles surgem da ausência de processo. E processo não precisa ser complicado para funcionar. Pode começar pequeno: um fechamento de caixa diário, um registro simples de despesas, um limite de fiado por cliente.</p>
      <p>O Zelo PDV foi criado para tornar esse processo acessível para quem toca lanchonete, hamburgueria ou negócio de alimentação sem tempo para burocracia. O sistema ajuda a registrar vendas, acompanhar fiado, lançar despesas e enxergar o resultado com mais clareza — tudo em um só lugar, no navegador, sem instalar nada.</p>
      <p>Reconhecer os erros é o primeiro passo. O segundo é criar uma rotina que impeça que eles se repitam. Quando isso acontece, o dono para de trabalhar para cobrir buracos e começa a trabalhar para crescer.</p>
      <p>Veja como o Zelo PDV ajuda a evitar esses erros em <a href="/para-lanchonetes">Zelo PDV para lanchonetes</a> ou como calcular o custo real de cada produto em <a href="/precificacao">Precificação com o Zelo PDV</a>.</p>
    `
  },
  {
    slug: '5-coisas-lanchonete-deveria-controlar',
    title: '5 coisas que toda lanchonete deveria controlar',
    description:
      'Descubra as cinco áreas de controle que mais impactam o resultado de uma lanchonete e como começar a monitorá-las.',
    keyword: 'controle gestão lanchonete',
    coverVariant: 'violet',
    publishedAt: '2026-01-22',
    updatedAt: '2026-09-24',
    readingTime: '6 min',
    cover: { alt: 'Dono de lanchonete olhando para uma tela com gráficos simples de vendas e estoque' },
    tldr: [
      'As 5 áreas prioritárias de controle: caixa diário, despesas operacionais, estoque de insumos, fiado/carteira de clientes e lucro real (não só faturamento).',
      'Não é preciso controlar tudo ao mesmo tempo — comece pelo caixa diário, que é a base para os outros controles funcionarem.',
      'Faturamento alto não garante lucro: despesas crescendo sem acompanhamento podem fechar o mês no negativo mesmo com bom movimento.',
      'Registrar vendas e despesas no mesmo lugar evita ter que cruzar planilha, caderno e memória para entender o resultado.'
    ],
    faq: [
      {
        question: 'Quais são as 5 coisas que toda lanchonete deveria controlar?',
        answer: 'Caixa diário, despesas operacionais (fixas e variáveis), estoque de insumos, fiado e carteira de clientes, e o lucro real do período — não apenas o faturamento.'
      },
      {
        question: 'Por que faturamento não é a mesma coisa que lucro?',
        answer: 'Faturamento é quanto entrou em vendas. Lucro é o que sobra depois de descontar todas as despesas do período. Uma lanchonete pode faturar bem e ainda assim fechar o mês no vermelho.'
      },
      {
        question: 'Por onde uma lanchonete deveria começar a se organizar?',
        answer: 'Pelo caixa diário. É o controle mais simples de implementar e o que dá base para os demais — despesas, estoque e fiado ficam mais fáceis de acompanhar quando o caixa já está organizado.'
      }
    ],
    content: `
      <p>Controlar um negócio de alimentação não é só vender bem e atender rápido. É saber o que está acontecendo com o dinheiro, com o estoque, com os clientes e com o resultado real no fim do mês. Muitas lanchonetes operam com movimento bom mas sem visão clara sobre o que está indo bem e o que está consumindo a margem.</p>
      <p>A boa notícia é que não é preciso controlar tudo ao mesmo tempo. Existe um conjunto de áreas prioritárias que, quando bem monitoradas, já mudam completamente a qualidade da gestão. Cinco controles que, juntos, dão ao dono clareza suficiente para tomar decisão com mais segurança e parar de descobrir problema só depois que ele já causou prejuízo.</p>
      <p>Neste artigo, vamos detalhar cada um desses controles e mostrar por que eles fazem diferença na prática do dia a dia de uma lanchonete.</p>

      <h2>1. Caixa diário</h2>
      <p>O caixa é o coração financeiro de qualquer negócio. Saber quanto entrou, quanto saiu e quanto ficou é o ponto de partida de qualquer controle. Sem essa visão, tudo o que vem depois é construído em cima de incerteza.</p>
      <p>Controlar o caixa diariamente significa registrar vendas por forma de pagamento, lançar despesas pagas no dia, registrar sangrias e retiradas e conferir o saldo ao fechar. Isso não precisa tomar horas. Um processo bem definido pode levar menos de quinze minutos por dia.</p>
      <p>A disciplina do caixa diário também permite identificar variação rapidamente. Se um dia o caixa fecha com diferença, o problema está fresco e pode ser investigado. Se isso passa semanas sem ser conferido, a causa já é quase impossível de rastrear.</p>

      <h2>2. Despesas operacionais</h2>
      <p>Todo negócio tem despesas fixas e variáveis. As fixas são aquelas que chegam independente do movimento: aluguel, internet, plano de gestão. As variáveis mudam com a operação: insumos, embalagem, gás, limpeza, manutenção pontual.</p>
      <p>O problema de não controlar despesas é simples: você passa a gerir pelo faturamento em vez de pelo lucro. Uma lanchonete pode faturar bem em determinado mês e ainda assim fechar negativo se as despesas cresceram sem controle e ninguém acompanhou.</p>
      <p>Registrar despesa não precisa ser separado do fluxo de caixa. Idealmente, cada saída é lançada no mesmo sistema onde as vendas são registradas. Isso dá visão integrada e evita que o dono precise cruzar várias fontes de informação para entender o resultado do mês.</p>

      <h2>3. Estoque de insumos</h2>
      <p>Estoque descontrolado tem dois custos. O primeiro é o desperdício: insumo que vence, quantidade comprada além do necessário, produto esquecido no fundo da geladeira. O segundo é a ruptura: falta de ingrediente no meio do pico de movimento, compra emergencial a preço maior, perda de venda por falta de item.</p>
      <p>Controlar estoque não exige um sistema sofisticado de inventário. Para a maioria das lanchonetes, o suficiente é saber quais são os insumos críticos, qual o ponto de reposição de cada um e quanto sai por dia ou semana. Com isso, a compra deixa de ser reativa e passa a ser planejada.</p>
      <p>Um controle básico de estoque também ajuda a detectar desvio. Quando a saída de insumo não bate com as vendas registradas no período, algo merece atenção. Pode ser desperdício, pode ser erro de registro, pode ser outra coisa. Mas sem controle, isso nunca aparece.</p>

      <h2>4. Fiado e carteira de clientes</h2>
      <p>O fiado é uma prática comum em lanchonetes com clientela recorrente. Bem gerido, pode ser um diferencial de relacionamento. Mal gerido, vira dinheiro preso e relacionamento que se complica na hora da cobrança.</p>
      <p>Controlar fiado significa manter histórico de cada cliente: o que foi comprado, quando, quanto foi pago e quanto ainda está em aberto. Esse histórico protege tanto o dono quanto o cliente, porque elimina dúvida e torna a cobrança direta e transparente.</p>
      <p>Além do fiado, acompanhar a carteira de clientes frequentes permite entender padrões de consumo, identificar quem compra mais e criar vínculo mais profissional. Um cliente que sabe que seu histórico está organizado tende a respeitar mais as regras do negócio e manter a relação mais saudável.</p>

      <h2>5. Lucro real, não apenas faturamento</h2>
      <p>Esse talvez seja o controle mais ignorado e, ao mesmo tempo, o mais importante. Faturamento é o quanto entrou. Lucro é o quanto ficou depois de pagar tudo. São coisas completamente diferentes e confundi-las é um dos erros mais comuns em pequenos negócios de alimentação.</p>
      <p>Uma lanchonete que só acompanha faturamento pode celebrar um mês cheio de movimento e descobrir, no fim, que sobrou pouco ou nada. Isso acontece quando despesas crescem invisíveis, quando a precificação está errada ou quando os erros de gestão estão corroendo a margem.</p>
      <p>Calcular lucro real significa subtrair todas as despesas do período — fixas, variáveis, retiradas — do faturamento total. É esse número que mostra se o negócio é viável, se está crescendo de verdade e se as decisões tomadas estão funcionando.</p>

      <h2>Por onde começar</h2>
      <p>Esses cinco controles não precisam ser implementados ao mesmo tempo. O mais indicado é começar pelo que causa mais dor no dia a dia. Para a maioria das lanchonetes, isso é o caixa. Com o caixa organizado, as despesas entram mais naturalmente. E com essas duas áreas funcionando, o lucro real começa a aparecer com mais clareza.</p>
      <p>O Zelo PDV foi desenvolvido justamente para tornar esses controles acessíveis para quem toca negócio de alimentação sem equipe de gestão. No sistema, você registra vendas, acompanha fiado, lança despesas e vê o resultado do dia sem precisar cruzar planilha, caderno e memória para entender o que está acontecendo com o caixa.</p>
      <p>Controlar não é complicar. É criar o mínimo de organização que separa o dono que gere com clareza do que gere no escuro.</p>
      <p>Veja esses cinco controles em ação em <a href="/para-lanchonetes">Zelo PDV para lanchonetes</a> ou explore o <a href="/extensoes">módulo de Mesas e Acessos</a> se a operação já envolve equipe ou atendimento de mesa.</p>
    `
  },
  {
    slug: '10-dicas-organizar-caixa-restaurante',
    title: '10 dicas para organizar o caixa do seu restaurante',
    description:
      'Dicas práticas para organizar o caixa de restaurantes e lanchonetes, reduzir diferenças no fechamento e ter mais controle financeiro.',
    keyword: 'organizar caixa restaurante lanchonete',
    coverVariant: 'orbital',
    publishedAt: '2026-01-28',
    updatedAt: '2026-09-24',
    readingTime: '5 min',
    cover: { alt: 'Balcão de restaurante organizado com máquina de cartão, dinheiro em gaveta e comandas' },
    tldr: [
      'Troco inicial fixo, registro no momento da venda e separação por forma de pagamento resolvem a maior parte da desorganização de caixa.',
      'Sangria e pequenas despesas precisam ser registradas na hora, nunca "para lembrar depois".',
      'Fechar o caixa todo dia, sem exceção, é o que permite investigar qualquer diferença enquanto ainda é possível descobrir a causa.',
      'Um sistema simples que centraliza vendas, despesas, sangrias e fiado reduz o risco de dado perdido entre planilha, caderno e memória.'
    ],
    faq: [
      {
        question: 'Por que separar as formas de pagamento no controle de caixa?',
        answer: 'Porque dinheiro, cartão, Pix e fiado têm destinos diferentes. Misturar tudo torna impossível localizar a origem de uma diferença quando o caixa não fecha.'
      },
      {
        question: 'Com que frequência devo fechar o caixa do restaurante?',
        answer: 'Todos os dias, sem exceção. Fechamento semanal ou mensal dificulta muito identificar a causa de uma diferença, porque a informação do dia específico já se perdeu.'
      },
      {
        question: 'Vale a pena usar planilha para organizar o caixa?',
        answer: 'Funciona no início, mas planilha e caderno dependem de disciplina manual e multiplicam fontes de informação. Um sistema que centraliza vendas, despesas e fechamento no mesmo lugar reduz erro e acelera a conferência.'
      }
    ],
    content: `
      <p>Caixa desorganizado é um dos problemas mais comuns em pequenos restaurantes e lanchonetes. O movimento é bom, o atendimento funciona, mas no fim do dia o número não bate, a diferença não tem explicação e a gestão vira um exercício de tentativa e erro. Isso se repete mês após mês até o dono decidir mudar a rotina.</p>
      <p>A boa notícia é que organizar o caixa não exige nenhuma transformação radical. Na maioria dos casos, basta aplicar algumas práticas simples com consistência. Pequenas mudanças no processo diário já fazem diferença suficiente para reduzir erro, ganhar clareza e proteger o resultado do negócio.</p>
      <p>Abaixo estão dez dicas práticas para organizar o caixa do seu restaurante ou lanchonete, sem precisar virar especialista financeiro ou investir em processos complexos.</p>

      <h2>Dica 1: defina um troco inicial fixo</h2>
      <p>Sempre comece o dia com o mesmo valor em troco no caixa. Isso elimina variável desnecessária na hora de fechar. Se o troco inicial é sempre o mesmo e está sempre identificado, a conferência final fica mais simples porque você já sabe quanto estava ali antes de qualquer venda acontecer.</p>

      <h2>Dica 2: registre cada venda no momento que ela acontece</h2>
      <p>Deixar para registrar depois é um dos hábitos que mais compromete o caixa. A correria do movimento faz com que detalhes se percam. A forma de pagamento fica confusa, o valor exato escapa, o produto vendido não entra no controle. Registrar no momento — ou o mais próximo possível — é o que mantém o caixa em dia.</p>

      <h2>Dica 3: separe as formas de pagamento</h2>
      <p>Dinheiro, cartão, Pix e fiado precisam ser tratados separadamente. Quando tudo entra no mesmo bolo, fica impossível identificar onde está a diferença se o caixa não fechar. Com cada forma separada, a conferência é mais rápida e o problema é localizado antes de virar uma confusão difícil de resolver.</p>

      <h2>Dica 4: registre toda sangria imediatamente</h2>
      <p>Sangria é qualquer retirada de dinheiro do caixa durante o dia — para guardar no cofre, pagar algo urgente ou reduzir risco. Toda sangria precisa ser registrada na hora com valor e motivo. Sangria não registrada vira diferença inexplicável no fechamento.</p>

      <h2>Dica 5: lance despesas no mesmo sistema das vendas</h2>
      <p>Quando as despesas do dia ficam em um caderno separado, numa nota qualquer ou só na memória, o caixa não reflete o resultado real. O ideal é que despesas pagas durante o dia entrem no mesmo controle das vendas. Isso integra a visão e simplifica o fechamento.</p>

      <h2>Dica 6: feche o caixa todo dia, sem exceção</h2>
      <p>O fechamento diário não é opcional. É o momento de conferir o que estava no caixa com o que deveria estar, baseado no registro do dia. Quando isso é feito todo dia, erros são identificados enquanto ainda é possível investigar. Quando é feito semanalmente ou mensalmente, a causa já está enterrada sob dias de operação.</p>

      <h2>Dica 7: investigue qualquer diferença no mesmo dia</h2>
      <p>Se o caixa fechou com diferença — para mais ou para menos — investigue antes de encerrar o dia. Uma diferença pequena ignorada hoje vira hábito de não investigar amanhã. Com o tempo, essas diferenças se acumulam e ninguém mais questiona. Trate qualquer variação como sinal a ser verificado.</p>

      <h2>Dica 8: evite misturar dinheiro do negócio com o pessoal</h2>
      <p>Parece óbvio, mas é um dos erros mais comuns. Qualquer retirada pessoal do caixa precisa ser registrada e tratada como retirada do dono — não como despesa operacional, não como sangria normal. Sem essa separação, o lucro real do negócio nunca aparece com clareza.</p>

      <h2>Dica 9: mantenha o caixa físico organizado</h2>
      <p>Notas misturadas com troco antigo, comprovantes de cartão soltos, dinheiro em bolso e caixa — esse tipo de desorganização física contribui para erro de conferência. Um caixa físico organizado, com gaveta de troco separada e comprovantes guardados por dia, reduz variável desnecessária e acelera o fechamento.</p>

      <h2>Dica 10: use um sistema simples para centralizar tudo</h2>
      <p>Planilha, caderno e memória não combinam bem com operação em movimento. Quanto mais fontes de informação, maior o risco de dado perdido ou inconsistente. Um sistema simples que centraliza vendas, despesas, sangrias e fiado em um só lugar torna o processo mais confiável e o fechamento mais rápido.</p>

      <h2>Coloque em prática</h2>
      <p>Não é preciso implementar todas as dez de uma vez. Escolha as que resolvem o maior problema da sua operação hoje e comece por elas. Consistência vale mais do que perfeição no começo.</p>
      <p>O Zelo PDV foi criado para ser esse sistema simples que centraliza o caixa de lanchonetes e pequenos restaurantes. No sistema, você registra vendas, lança despesas, acompanha fiado e fecha o caixa sem precisar de planilha ou caderno paralelo. Tudo no navegador, sem instalar nada, disponível quando você precisar.</p>
      <p>Caixa organizado não é privilégio de quem tem equipe financeira. É resultado de processo. E processo começa com a primeira mudança de hábito.</p>
      <p>Veja como isso funciona para restaurantes com mesas e comandas em <a href="/para-restaurantes">Zelo PDV para restaurantes</a> ou conheça o <a href="/extensoes">módulo de Mesas</a>.</p>
    `
  },
  {
    slug: '6-sinais-lanchonete-desorganizada',
    title: '6 sinais de que sua lanchonete está desorganizada',
    description:
      'Reconheça os sinais de que a gestão da sua lanchonete precisa de atenção antes que os problemas aumentem.',
    keyword: 'sinais desorganização lanchonete gestão',
    coverVariant: 'linen',
    publishedAt: '2026-02-05',
    updatedAt: '2026-09-24',
    readingTime: '6 min',
    cover: { alt: 'Dono de lanchonete preocupado olhando para papéis e recibos desorganizados sobre a mesa' },
    tldr: [
      'Os 6 sinais de desorganização: caixa que nunca fecha certo, não saber quanto sobrou no mês, despesas de surpresa, fiado sem controle, reposição de estoque no susto e decisões só por intuição.',
      'Nenhum desses sinais desaparece sozinho — eles se acumulam até virar prejuízo visível.',
      'O primeiro passo não é resolver tudo de uma vez, é escolher o sinal que mais impacta a operação hoje e agir sobre ele.',
      'Reconhecer o problema com honestidade é o que abre caminho para corrigir antes que ele fique maior.'
    ],
    faq: [
      {
        question: 'Como saber se a gestão da minha lanchonete está desorganizada?',
        answer: 'Observe se você reconhece algum destes sinais: caixa que nunca fecha exato, não saber quanto sobrou no mês, despesas que sempre pegam de surpresa, fiado sem controle, falta de insumo no meio do movimento ou decisões tomadas só por intuição.'
      },
      {
        question: 'Qual sinal de desorganização costuma ser o mais grave?',
        answer: 'Não saber quanto sobrou no mês é o mais crítico, porque significa que a operação está sendo gerida por sensação, sem nenhum número para confirmar se o negócio é viável.'
      },
      {
        question: 'É preciso resolver todos os sinais de uma vez?',
        answer: 'Não. O mais eficaz é escolher o sinal que mais atrapalha o dia a dia agora — geralmente o fechamento de caixa — e organizar esse ponto primeiro antes de avançar para os demais.'
      }
    ],
    content: `
      <p>Nem sempre é fácil perceber quando a gestão de uma lanchonete está saindo do controle. O movimento continua, o balcão gira, os clientes voltam — mas existe uma série de sinais que aparecem antes do problema virar crise. Sinais que, na correria do dia a dia, são fáceis de ignorar ou de interpretar como algo normal da operação.</p>
      <p>O problema é que nenhum desses sinais some sozinho. Quando não são tratados, eles crescem e se multiplicam. O que começa como uma diferença pequena no caixa pode, meses depois, se transformar em prejuízo acumulado, fornecedor em atraso e sensação constante de que o negócio vende mas nunca sobra nada.</p>
      <p>Se você reconhecer um ou mais desses sinais na sua lanchonete, não é hora de pânico. É hora de agir antes que o problema fique maior. Vamos aos seis sinais mais comuns.</p>

      <h2>Sinal 1: o caixa nunca fecha certo</h2>
      <p>Diferença de caixa todo dia — às vezes para mais, às vezes para menos, sem explicação clara — é um dos primeiros sinais de que algo está errado no processo. Pode ser erro de troco, venda não registrada, despesa esquecida ou sangria sem anotação.</p>
      <p>O que preocupa não é a diferença em si. É quando ela se torna normal. Quando o dono fecha o caixa com cinco, dez reais de diferença e pensa "é normal assim", ele parou de investigar. E parar de investigar é o que permite que o problema cresça sem barreira.</p>
      <p>Caixa que não fecha é sintoma. A causa pode ser simples, mas só aparece para quem decide procurá-la.</p>

      <h2>Sinal 2: você não sabe quanto sobrou no mês</h2>
      <p>Você sabe quanto a lanchonete faturou no mês passado? Quanto sobrou depois de pagar aluguel, fornecedor, funcionário e todas as despesas do período? Se a resposta for "mais ou menos" ou "acho que foi bem", essa é uma fala de desorganização.</p>
      <p>Não saber o lucro real significa que a operação está sendo gerida por sensação. O movimento parece bom, o caixa parece cheio, mas não existe número para confirmar. E sensação positiva não paga conta em mês ruim.</p>
      <p>Lanchonete organizada tem esse número. Pode não ser calculado em planilha elaborada. Mas o dono sabe, com razoável precisão, o que sobrou no mês. Isso é o mínimo para tomar qualquer decisão de crescimento ou investimento com segurança.</p>

      <h2>Sinal 3: despesas aparecem de surpresa</h2>
      <p>Todo mês surge alguma despesa que "não estava no plano". Manutenção de equipamento, reposição urgente, conta que chegou mais alta do que o esperado. Em alguma medida isso é normal. O problema é quando toda despesa chega de surpresa porque não existe nenhum acompanhamento de quanto sai por mês.</p>
      <p>Quando despesas surpresa são frequentes, significa que o controle financeiro está ausente ou muito superficial. O dono reage às saídas em vez de antecipá-las. E reagir a tudo é muito mais caro e desgastante do que ter previsão mínima sobre o que está por vir.</p>

      <h2>Sinal 4: o fiado cresceu demais e você não sabe exatamente quanto</h2>
      <p>Se a resposta para "quanto está em fiado hoje?" é um número vago ou um encogimento de ombros, o controle de fiado está comprometido. Fiado sem rastreamento é capital parado que não aparece em nenhum relatório e não ajuda a pagar nenhuma conta.</p>
      <p>O problema do fiado descontrolado não é só o valor em aberto. É que o dono passa a evitar cobrar porque não tem certeza dos valores. A cobrança fica constrangedora, o cliente percebe a insegurança e a dívida vai crescendo sem enfrentamento direto.</p>
      <p>Saber o total do fiado, quem deve e há quanto tempo, é o ponto de partida para organizar essa parte da operação. Sem esse dado, qualquer tentativa de cobrança fica no improviso.</p>

      <h2>Sinal 5: você repõe estoque no susto, não no planejamento</h2>
      <p>Chegou perto do meio do dia e faltou ingrediente. O fornecedor precisou ser chamado com urgência. Um produto sumiu do estoque sem que ninguém tivesse percebido. Esses são sintomas de estoque descontrolado.</p>
      <p>Quando a reposição é sempre reativa — ou seja, acontece só quando a falta já causou problema — o custo aumenta. Compra emergencial costuma sair mais caro. Ruptura no meio do movimento custa venda perdida e cliente frustrado.</p>
      <p>Um controle básico de estoque não precisa ser sofisticado. Basta saber quais são os itens críticos e qual o ponto de reposição de cada um. Com isso, a compra deixa de ser apagão e passa a ser rotina previsível.</p>

      <h2>Sinal 6: decisões são sempre intuitivas, nunca baseadas em dados</h2>
      <p>Vai aumentar o cardápio? A intuição diz que sim. Vai mudar o horário de funcionamento? A impressão é de que vai ajudar. Vai contratar mais alguém? Parece necessário. Todas as decisões importantes baseadas em sensação, sem nenhum número para sustentá-las.</p>
      <p>Intuição tem valor. Donos experientes de lanchonete desenvolvem um senso apurado da operação. Mas intuição sem dado é fraca para decisões de impacto. Quando você combina experiência com informação, as chances de acerto aumentam muito.</p>
      <p>Decisão baseada em dado não precisa ser complexa. Saber qual produto tem mais saída, em qual período o movimento cai, qual forma de pagamento domina e quanto sobrou nos últimos três meses já é suficiente para tomar decisões melhores do que na base do achismo.</p>

      <h2>O que fazer quando você se identifica com esses sinais</h2>
      <p>Reconhecer o problema é o primeiro passo real. O segundo é não tentar resolver tudo de uma vez. Escolha o sinal que mais impacta o seu dia a dia agora e comece por ele. Caixa não fecha? Estabeleça um fechamento diário. Fiado fora de controle? Comece a cadastrar os clientes e registrar movimento. Despesa de surpresa? Passe uma semana lançando tudo e veja o padrão.</p>
      <p>O Zelo PDV foi desenvolvido para ajudar lanchonetes que estão nesse momento de transição — de gestão intuitiva para gestão com mais clareza. O sistema centraliza vendas, despesas, fiado e fechamento de caixa em um lugar só, acessível no navegador sem instalação. Não resolve todos os problemas de uma vez, mas elimina boa parte do ruído que impede o dono de enxergar o que está acontecendo com o negócio.</p>
      <p>Negócio organizado começa com honestidade sobre onde está o problema. E os seis sinais acima são um bom ponto de partida para essa conversa.</p>
      <p>Veja como o Zelo PDV endereça esses sinais em <a href="/para-lanchonetes">Zelo PDV para lanchonetes</a>, como calcular o custo real de cada item em <a href="/precificacao">Precificação com o Zelo PDV</a> ou os fatos completos do produto em <a href="/sobre">Fatos sobre o Zelo PDV</a>.</p>
    `
  },
  {
    slug: 'como-diminuir-dependencia-ifood-sem-perder-vendas',
    title: 'Como diminuir a dependência do iFood sem perder vendas',
    description:
      'O iFood traz visibilidade, mas cobra caro por isso. Veja como reduzir a dependência da plataforma aos poucos, sem abrir mão do volume de pedidos.',
    keyword: 'como diminuir dependência do ifood',
    coverVariant: 'ember',
    publishedAt: '2026-09-24',
    readingTime: '9 min',
    cover: { alt: 'Entregador retirando sacolas de delivery no balcão de uma lanchonete pequena' },
    tldr: [
      'Reduzir a dependência do iFood não significa sair da plataforma — significa fazer com que uma fatia maior dos pedidos volte a acontecer direto com você, sem comissão.',
      'A comissão do iFood (12% a 23% mais 3,2% de taxa de pagamento) só some do seu bolso quando o cliente pede pela plataforma; pedido feito por WhatsApp, cardápio próprio ou no balcão não paga nada disso.',
      'Cardápio digital próprio, atendimento organizado no WhatsApp e um cartão de fidelidade simples são os três jeitos mais realistas de trazer o cliente do app para o canal direto.',
      'A meta não é abandonar o iFood de uma vez — é medir, mês a mês, quanto do faturamento já não depende mais da plataforma.'
    ],
    faq: [
      {
        question: 'Sair do iFood é uma boa ideia?',
        answer: 'Para a maioria dos negócios, não de uma vez. O iFood ainda traz visibilidade e clientes novos que talvez não te conhecessem de outra forma. O mais realista é reduzir a fatia de pedidos que passam pela plataforma, não eliminá-la.'
      },
      {
        question: 'Como faço o cliente do iFood pedir direto comigo da próxima vez?',
        answer: 'Coloque um cartão ou adesivo na sacola com seu WhatsApp e um cardápio digital próprio, ofereça uma vantagem simples (desconto ou brinde) para quem pedir direto, e deixe claro que o atendimento direto é tão rápido quanto o do app.'
      },
      {
        question: 'Vale a pena ter cardápio digital próprio além do iFood?',
        answer: 'Sim, principalmente se parte do seu delivery já vem por WhatsApp ou redes sociais. Um cardápio digital organiza o pedido, reduz erro de anotação e permite receber pedido sem depender só de mensagem de texto.'
      },
      {
        question: 'Como sei se estou conseguindo reduzir a dependência do iFood?',
        answer: 'Acompanhe, mês a mês, o percentual do faturamento total que veio da plataforma versus balcão, WhatsApp e cardápio próprio. Se separar os canais no registro de vendas, esse número fica visível sem precisar de planilha paralela.'
      }
    ],
    content: `
      <p>Reduzir a dependência do iFood não é sair da plataforma da noite para o dia — é fazer com que uma fatia cada vez maior dos seus pedidos volte a acontecer direto com você, sem passar pela comissão do app. Como mostramos em detalhe no artigo sobre <a href="/blog/como-calcular-taxa-aplicativo-delivery">taxas de aplicativos de delivery</a>, o iFood cobra entre 12% e 23% de comissão mais 3,2% de taxa de pagamento online — valores que só existem quando o pedido passa pela plataforma.</p>
      <p>Isso não significa que o iFood seja ruim. Para muitos negócios, ele é a porta de entrada de clientes que nunca teriam conhecido o estabelecimento de outra forma. O problema aparece quando <strong>100% do delivery depende dele</strong>: qualquer mudança de taxa, de algoritmo de visibilidade ou de política da plataforma afeta diretamente o seu faturamento, sem que você tenha controle sobre isso.</p>

      <h2>Por que vale a pena diversificar os canais de venda</h2>
      <p>Pense nos canais de venda como uma carteira de investimentos: quanto mais concentrada em um único lugar, maior o risco. Um negócio que vende 90% pelo iFood está sujeito a decisões que a plataforma toma sem consultar ninguém — reajuste de comissão, mudança de posicionamento na busca, nova política de cancelamento.</p>
      <p>Diversificar não significa abandonar o app. Significa que, se amanhã o iFood decidir mudar as regras, seu negócio continua de pé porque uma parte relevante da clientela já pede direto com você.</p>

      ${inlineFigure({ slug: 'como-diminuir-dependencia-ifood-sem-perder-vendas', name: 'canal-direto', alt: 'Balconista embalando pedido de delivery com um cardápio digital aberto no celular ao lado', caption: 'Cada pedido que sai por um canal próprio não paga comissão de aplicativo.' })}

      <h2>Os canais que realmente competem com o iFood</h2>
      <p>Não é preciso reinventar a operação. Os três canais que mais funcionam para negócios pequenos de alimentação recuperarem pedidos são:</p>
      <ul>
        <li><strong>WhatsApp organizado:</strong> um número dedicado, cardápio fixado ou enviado por link, e um processo simples de confirmação de pedido e pagamento.</li>
        <li><strong>Cardápio digital próprio:</strong> um link ou QR code que o cliente acessa para ver o cardápio e montar o pedido sem precisar digitar tudo por mensagem — reduz erro de anotação e agiliza o atendimento em horário de pico.</li>
        <li><strong>Cliente recorrente e indicação:</strong> quem já pediu uma vez pelo app e gostou é o público mais fácil de trazer para o canal direto — com um incentivo simples na primeira compra direta.</li>
      </ul>

      <h2>Como trazer o cliente do iFood para o canal direto</h2>
      <p>A tática mais eficaz é simples: toda sacola ou embalagem que sai pelo iFood carrega uma informação sobre o canal direto. Um adesivo, um cartão ou uma nota impressa com o WhatsApp do estabelecimento e uma vantagem clara para quem pedir direto da próxima vez ("10% de desconto pedindo pelo WhatsApp") já começa a mover a agulha.</p>
      <p>O ponto central é que essa transição não precisa — e não deve — ser hostil ao cliente. Ninguém gosta de sentir que está sendo "puxado" para fora de um app que já confia. A oferta precisa ser genuína: atendimento tão rápido quanto o do app, cardápio fácil de navegar e pagamento sem fricção.</p>

      <h2>Erros comuns ao tentar reduzir a dependência do iFood</h2>
      <p>Alguns donos tentam essa transição do jeito errado e acabam desistindo antes de ver resultado. Os erros mais comuns são:</p>
      <ul>
        <li><strong>Sumir do iFood de uma vez:</strong> cortar a presença na plataforma sem antes ter um canal direto minimamente estruturado costuma derrubar o faturamento total, não só a comissão paga.</li>
        <li><strong>Oferecer vantagem no canal direto sem divulgar:</strong> um desconto para pedido pelo WhatsApp só funciona se o cliente souber que ele existe — precisa estar visível na sacola, na embalagem e no próprio cardápio do app.</li>
        <li><strong>Atendimento direto mais lento que o do app:</strong> se o cliente manda mensagem no WhatsApp e demora para ser respondido, ele volta para o app na próxima vez — a experiência direta precisa ser, no mínimo, igual em velocidade.</li>
        <li><strong>Não medir o resultado:</strong> sem separar as vendas por canal, fica impossível saber se a estratégia está funcionando ou se é só uma sensação.</li>
      </ul>

      <h2>Quanto tempo leva para ver resultado</h2>
      <p>Essa é uma mudança gradual, não um evento único. Negócios que já têm uma base de clientes recorrentes costumam ver o canal direto crescer em algumas semanas, principalmente quando o incentivo é claro e a divulgação é consistente em toda sacola que sai. Para negócios mais novos, que ainda dependem do iFood para ganhar visibilidade, esse movimento tende a ser mais lento — e não deveria ser forçado às pressas, sob risco de perder volume total sem ganhar nada em troca.</p>
      <p>O indicador mais simples de acompanhar é o percentual do faturamento mensal que vem de cada canal. Se esse número está se movendo na direção certa — mesmo que devagar — a estratégia está funcionando.</p>

      <h2>Canal por canal: o que muda no seu bolso</h2>
      <table>
        <thead>
          <tr><th>Canal</th><th>Custo por pedido</th><th>Esforço para manter</th><th>Alcance de cliente novo</th></tr>
        </thead>
        <tbody>
          <tr><td>iFood</td><td>12% a 23% + 3,2% (pagamento online)</td><td>Baixo (a plataforma cuida da visibilidade)</td><td>Alto — clientes que não te conheceriam de outra forma</td></tr>
          <tr><td>WhatsApp / direto</td><td>Sem comissão (só a taxa normal de cartão/Pix, se houver)</td><td>Médio — exige atendimento organizado</td><td>Baixo — depende de quem já te conhece ou foi indicado</td></tr>
          <tr><td>Cardápio digital próprio</td><td>Sem comissão de plataforma</td><td>Baixo depois de configurado</td><td>Médio — funciona bem combinado com QR code na mesa ou na sacola</td></tr>
        </tbody>
      </table>
      <p>Nenhum desses canais substitui o outro sozinho. A combinação — iFood para atrair, canal direto para reter — costuma trazer o melhor dos dois: alcance e margem.</p>

      <h2>Checklist para começar a reduzir a dependência do iFood</h2>
      <ul>
        <li>Separe, no seu controle de vendas, quanto veio do iFood e quanto veio de outros canais — sem esse número, é impossível medir progresso</li>
        <li>Coloque um incentivo claro para pedido direto em toda sacola que sai pelo app</li>
        <li>Monte (ou organize) um cardápio digital próprio, com link fácil de compartilhar</li>
        <li>Treine quem atende o WhatsApp para responder rápido — velocidade é o principal motivo de alguém preferir o app</li>
        <li>Reavalie a cada mês o percentual de faturamento que já não depende da plataforma</li>
      </ul>

      <h2>Quando ainda vale manter (ou aumentar) a presença no iFood</h2>
      <p>Se a cozinha tem capacidade ociosa em determinados horários, se o negócio ainda é pouco conhecido na região, ou se o volume de pedidos do app compensa a margem menor, manter uma presença forte no iFood continua fazendo sentido. O objetivo deste artigo não é convencer ninguém a sair da plataforma — é mostrar que <strong>depender 100% dela é um risco que dá para reduzir aos poucos</strong>, sem abrir mão do volume que ela traz hoje.</p>

      <h2>Um exemplo ilustrativo</h2>
      <p>Imagine uma lanchonete de bairro que vende 300 pedidos por mês pelo iFood, com ticket médio de R$ 35, no Plano Entrega (23% de comissão + 3,2% de pagamento online). O custo em taxas gira em torno de R$ 2.750 no mês — dinheiro que sai antes mesmo de qualquer despesa fixa ser paga. Se essa mesma lanchonete conseguir migrar 20% desses pedidos (60 pedidos) para o canal direto ao longo de alguns meses, o ganho líquido — considerando que o canal direto ainda tem custo de cartão ou Pix, mas nenhuma comissão de plataforma — fica próximo de R$ 550 por mês só em taxa não paga, sem contar o efeito de fidelização que um atendimento direto bem feito costuma gerar. Esse é um exemplo ilustrativo, não um resultado garantido — o efeito real depende do volume, do ticket médio e da consistência da divulgação do canal direto.</p>

      <h2>Como o Zelo PDV ajuda nessa transição</h2>
      <p>Com o ${ADDONS.menu.name}, os pedidos que chegam pelo cardápio online, pelo WhatsApp e pelo iFood caem no mesmo painel do caixa — sem precisar copiar pedido de um app para outro. Isso facilita justamente o que este artigo recomenda: acompanhar, lado a lado, quanto cada canal está trazendo de faturamento líquido, para decidir com dado (não com impressão) onde vale investir esforço.</p>
      <p>Para negócios que vendem principalmente por conta própria, veja <a href="/para-delivery">Zelo PDV para delivery próprio</a>. E se quiser conferir preço e escopo de cada módulo antes de decidir, a página <a href="/sobre">Fatos sobre o Zelo PDV</a> reúne tudo isso sem letra miúda — incluindo os ${TRIAL_DAYS} dias de teste grátis para testar antes de decidir.</p>
    `
  },
  {
    slug: 'ficha-tecnica-cmv-lanchonete',
    title: 'Ficha técnica e CMV: como calcular o custo de cada lanche',
    description:
      'Aprenda a montar a ficha técnica de um produto e calcular o CMV por item, para saber exatamente quanto cada lanche custa antes de definir o preço de venda.',
    keyword: 'ficha técnica cmv lanchonete',
    coverVariant: 'violet',
    publishedAt: '2026-09-24',
    readingTime: '10 min',
    cover: { alt: 'Ingredientes de um hambúrguer organizados sobre uma balança de cozinha ao lado de um caderno de anotações' },
    tldr: [
      'Ficha técnica é a lista de tudo que entra em um produto — ingrediente por ingrediente, com quantidade e custo — usada para calcular o custo real de cada item do cardápio.',
      'CMV por item = soma do custo de cada ingrediente usado, dividido pelo rendimento da receita (quantas porções ela gera).',
      'Embalagem, molhos e acompanhamentos entram na ficha técnica — é comum esquecer esses itens e subestimar o custo real.',
      'Sem ficha técnica por produto, você só enxerga o CMV médio do negócio, não sabe quais itens do cardápio dão mais ou menos margem.'
    ],
    faq: [
      {
        question: 'O que é ficha técnica de um produto?',
        answer: 'É a lista detalhada de todos os ingredientes que compõem um item do cardápio, com a quantidade usada e o custo de cada um, usada para calcular o custo total de produzir aquele item.'
      },
      {
        question: 'Como calcular o CMV de um único lanche?',
        answer: 'Some o custo de cada ingrediente usado na receita (na quantidade exata que entra no prato) e divida pelo número de porções que a receita rende. O resultado é o custo de produção de uma unidade.'
      },
      {
        question: 'Preciso incluir embalagem no cálculo do CMV do item?',
        answer: 'Sim, principalmente se o produto for vendido para delivery ou viagem. Embalagem, molho extra e guardanapo fazem parte do custo direto do produto e não devem ficar de fora da conta.'
      },
      {
        question: 'Com que frequência devo atualizar a ficha técnica?',
        answer: 'Sempre que o preço de um ingrediente mudar de forma relevante. Insumos como carne e queijo variam com frequência, então revisar a ficha a cada poucos meses evita vender com margem menor do que você imagina.'
      }
    ],
    content: `
      <p>Ficha técnica é a lista detalhada de tudo que entra em um produto — cada ingrediente, a quantidade exata usada e o custo de cada um — e é a ferramenta que transforma "acho que esse lanche custa uns R$ 10" em um número real e confiável. Sem ela, qualquer cálculo de CMV (Custo de Mercadoria Vendida) fica no chute, mesmo que o dono tenha anos de experiência na cozinha.</p>
      <p>Este artigo mostra como montar a ficha técnica de um produto do zero e como usar essa informação para calcular o CMV item a item — não só o CMV médio do negócio, que esconde quais produtos dão mais ou menos margem.</p>

      <h2>Por que calcular CMV por produto, e não só o CMV geral</h2>
      <p>Muita lanchonete já calcula o CMV geral do negócio: soma o total gasto com mercadoria no mês e divide pelo faturamento. Esse número é útil para saber se a operação está saudável (referência de mercado: entre 28% e 38% do faturamento), mas ele <strong>esconde variação enorme entre produtos</strong>.</p>
      <p>Um combo com batata frita e refrigerante pode ter CMV de 25%, enquanto um lanche especial com ingrediente importado pode estar em 55% sem que ninguém perceba — porque o CMV médio do mês ainda parece razoável. Só a ficha técnica por item revela isso.</p>

      <h2>O que entra em uma ficha técnica</h2>
      <p>Uma ficha técnica completa tem quatro colunas de informação para cada ingrediente da receita:</p>
      <table>
        <thead>
          <tr><th>Ingrediente</th><th>Quantidade usada</th><th>Custo por unidade de compra</th><th>Custo no item</th></tr>
        </thead>
        <tbody>
          <tr><td>Pão de hambúrguer</td><td>1 unidade</td><td>R$ 1,20 (pacote de 8 por R$ 9,60)</td><td>R$ 1,20</td></tr>
          <tr><td>Carne (blend 150g)</td><td>150g</td><td>R$ 42,00/kg</td><td>R$ 6,30</td></tr>
          <tr><td>Queijo</td><td>30g</td><td>R$ 38,00/kg</td><td>R$ 1,14</td></tr>
          <tr><td>Molho especial</td><td>20g</td><td>R$ 18,00/kg</td><td>R$ 0,36</td></tr>
          <tr><td>Alface + tomate</td><td>25g</td><td>R$ 8,00/kg (média)</td><td>R$ 0,20</td></tr>
          <tr><td>Embalagem</td><td>1 unidade</td><td>R$ 0,80</td><td>R$ 0,80</td></tr>
        </tbody>
      </table>
      <p>Somando a coluna "custo no item": R$ 1,20 + R$ 6,30 + R$ 1,14 + R$ 0,36 + R$ 0,20 + R$ 0,80 = <strong>R$ 10,00 de custo direto</strong> para esse hambúrguer. Esse é o número que entra no cálculo de CMV do produto — não uma estimativa de cabeça.</p>

      ${inlineFigure({ slug: 'ficha-tecnica-cmv-lanchonete', name: 'pesagem-ingredientes', alt: 'Mão pesando uma porção de carne em uma balança de cozinha para montar a ficha técnica de um hambúrguer', caption: 'Pesar os ingredientes reais da receita é o que torna a ficha técnica confiável.' })}

      <h2>Passo a passo para montar a ficha técnica de um item</h2>
      <ol>
        <li><strong>Pese a receita real, não a receita "ideal":</strong> prepare o item como ele sai de verdade para o cliente e pese cada ingrediente na quantidade usada, não na quantidade que "deveria" ser usada.</li>
        <li><strong>Registre o custo de compra de cada insumo:</strong> preço pago ao fornecedor, convertido para a mesma unidade da receita (grama, mililitro, unidade).</li>
        <li><strong>Calcule o custo proporcional de cada ingrediente na receita:</strong> quantidade usada × (preço de compra ÷ quantidade da embalagem).</li>
        <li><strong>Some tudo, incluindo embalagem:</strong> o total é o custo direto de produzir uma unidade do item.</li>
        <li><strong>Divida pelo rendimento, se a receita gerar mais de uma porção:</strong> por exemplo, um molho preparado em lote de 1kg que rende 50 porções de 20g — o custo do lote inteiro dividido por 50 dá o custo por porção.</li>
      </ol>

      <h2>Do CMV ao preço de venda: quanto de markup aplicar</h2>
      <p>Com o custo direto calculado, o próximo passo é decidir a margem. O erro mais comum é olhar só para o custo do ingrediente e esquecer despesas fixas, mão de obra e o pró-labore do dono — que também precisam ser cobertos pelo preço de venda.</p>
      <p>Uma referência prática: se o CMV do produto (ingrediente + embalagem) representa 30% do preço de venda, o preço final precisa ser pelo menos <strong>3,3 vezes o custo direto</strong> para deixar espaço para despesas fixas, variáveis e lucro. No exemplo do hambúrguer acima (custo de R$ 10,00), isso aponta para um preço de venda ao redor de R$ 33,00 — mas o número exato depende do resto da estrutura de custos do seu negócio, não só desse produto isolado.</p>

      <h2>Ficha técnica também serve para padronizar a receita</h2>
      <p>Além do cálculo financeiro, a ficha técnica tem um efeito colateral valioso: padroniza o produto. Quando a receita está escrita com quantidade exata de cada ingrediente, qualquer pessoa da equipe consegue preparar o item do mesmo jeito, sem depender só da memória de quem "sempre fez assim". Isso reduz variação de sabor, de porção e, por consequência, de custo — um funcionário que coloca 180g de carne em vez de 150g está, sem perceber, reduzindo a margem daquele produto a cada venda.</p>
      <p>Negócios que crescem e passam a ter mais de uma pessoa na cozinha sentem esse ganho rapidamente: a ficha técnica vira o documento de referência que substitui "pergunta para o dono" toda vez que alguém tem dúvida sobre a receita.</p>

      <h2>Como lidar com ingredientes que variam de preço</h2>
      <p>Alguns insumos — carne, óleo, hortifrúti — variam de preço com frequência, às vezes semana a semana. Isso não significa que a ficha técnica precisa ser recalculada todos os dias, mas alguns cuidados ajudam a manter o número próximo da realidade:</p>
      <ul>
        <li>Revise o preço dos insumos mais usados (os que aparecem em mais itens do cardápio) a cada quinzena ou mês, mesmo que os outros insumos revisem com menos frequência</li>
        <li>Se um ingrediente teve alta relevante (acima de 15% a 20%), recalcule a ficha técnica dos produtos que o usam antes de esperar a revisão programada</li>
        <li>Guarde um histórico simples de preço por insumo — isso ajuda a enxergar tendência e a negociar com fornecedor com mais informação</li>
      </ul>

      <h2>Erros comuns ao calcular ficha técnica e CMV</h2>
      <ul>
        <li><strong>Ignorar embalagem e molhos extras:</strong> parecem pequenos, mas em produtos de delivery podem representar 8% a 15% do custo total</li>
        <li><strong>Usar preço de compra desatualizado:</strong> insumos como carne e queijo variam com frequência — ficha técnica parada há 6 meses já não reflete a realidade</li>
        <li><strong>Não considerar perda e desperdício:</strong> aparas, validade vencida e erro de preparo também são custo, mesmo sem virar produto vendido</li>
        <li><strong>Calcular só o CMV médio do mês:</strong> esconde quais produtos específicos estão com margem apertada ou negativa</li>
      </ul>

      <h2>Ficha técnica também ajuda a decidir o que tirar do cardápio</h2>
      <p>Depois de calcular a ficha técnica de todos os itens principais, é comum encontrar produtos com margem muito abaixo da média do cardápio — às vezes até negativa quando somado o custo de promoção ou desconto recorrente naquele item. Esse tipo de descoberta só aparece quando o cálculo é feito item a item, não no CMV médio do negócio.</p>
      <p>Isso não significa necessariamente remover o item: pode ser um prato de entrada que atrai cliente para o resto do pedido, ou um item de identidade da marca. Mas conhecer a margem real permite decidir isso de forma consciente — reajustar o preço, reduzir a porção, trocar um ingrediente por uma alternativa mais barata sem perder qualidade, ou simplesmente aceitar a margem menor sabendo o motivo.</p>

      <h2>Como o Zelo PDV ajuda a manter esse controle</h2>
      <p>Depois de montar a ficha técnica, o trabalho não acaba — ela precisa ser revisada sempre que um insumo mudar de preço. O Zelo PDV registra o custo dos seus produtos e o resultado das vendas no mesmo lugar, o que facilita comparar o preço praticado com o CMV real ao longo do tempo, sem depender de planilha paralela para lembrar quanto cada item custa.</p>
      <p>Veja com mais detalhe como organizar preço e margem por produto na página de <a href="/precificacao">Precificação com o Zelo PDV</a>, e conheça o restante da gestão para hamburguerias em <a href="/para-hamburguerias">Zelo PDV para hamburguerias</a>.</p>
    `
  },
  {
    slug: 'cardapio-digital-qr-code-vale-a-pena',
    title: 'Cardápio digital com QR code: vale a pena para lanchonete e restaurante pequeno?',
    description:
      'Entenda como funciona o cardápio digital com QR code, quando ele realmente vale a pena para negócios pequenos de alimentação e quando o cardápio impresso ainda é suficiente.',
    keyword: 'cardápio digital qr code vale a pena',
    coverVariant: 'aqua',
    publishedAt: '2026-09-24',
    readingTime: '9 min',
    cover: { alt: 'Cliente apontando o celular para um QR code sobre a mesa de um restaurante pequeno' },
    tldr: [
      'Cardápio digital com QR code substitui o cardápio impresso: o cliente aponta a câmera do celular, o cardápio abre no navegador e ele escolhe os itens sem precisar de app.',
      'Existem dois níveis: QR "vitrine" (só mostra o cardápio, o pedido continua sendo feito com o garçom ou no balcão) e QR com pedido integrado (o cliente monta o pedido e ele já cai no sistema do caixa).',
      'Vale mais a pena em negócios com mesas e cardápio que muda com frequência; para operação 100% balcão de giro rápido, o ganho é menor.',
      'O principal benefício não é só a imagem moderna — é reduzir erro de anotação e tempo de espera entre o pedido e o lançamento no caixa.'
    ],
    faq: [
      {
        question: 'Como funciona o cardápio digital com QR code na prática?',
        answer: 'O cliente aponta a câmera do celular para um código impresso na mesa ou na entrada, que abre um link com o cardápio direto no navegador — sem precisar baixar nenhum aplicativo.'
      },
      {
        question: 'Cardápio digital com QR code vale a pena para lanchonete pequena?',
        answer: 'Depende do formato da operação. Para negócios com mesas e cardápio que muda com frequência, sim — reduz erro e agiliza o atendimento. Para operação só de balcão com giro muito rápido, o ganho é menor e o cardápio físico ou o quadro no balcão ainda resolve bem.'
      },
      {
        question: 'Qual a diferença entre cardápio digital só de vitrine e com pedido integrado?',
        answer: 'O modelo vitrine só mostra os itens e preços — o pedido ainda é feito com o garçom ou no caixa. O modelo integrado permite que o cliente monte o pedido pelo celular e ele já entre direto no sistema, sem intervenção manual.'
      },
      {
        question: 'É preciso trocar o cardápio impresso completamente?',
        answer: 'Não necessariamente. Muitos negócios mantêm os dois por um tempo, usando o QR code como complemento até a equipe e os clientes se acostumarem com o novo formato.'
      }
    ],
    content: `
      <p>Cardápio digital com QR code é aquele código quadrado impresso na mesa, na entrada ou na sacola que, ao ser apontado pela câmera do celular, abre o cardápio direto no navegador — sem precisar instalar aplicativo nem esperar o garçom trazer o cardápio físico. Para negócios pequenos de alimentação, ele vale a pena quando resolve um problema real de operação, não só porque "todo mundo está usando".</p>
      <p>Este artigo explica como o cardápio digital com QR code funciona na prática, os dois formatos que existem hoje no mercado e em quais situações ele realmente compensa o investimento — e em quais não compensa.</p>

      <h2>Como funciona o cardápio digital com QR code</h2>
      <p>O processo é simples do lado do cliente: aponta a câmera, o link abre no navegador do celular (sem app), e o cardápio aparece com fotos, descrições e preços. A partir daí, existem dois caminhos possíveis, e essa diferença é o que mais importa na hora de decidir se vale a pena:</p>
      <ul>
        <li><strong>QR vitrine:</strong> o cliente só consulta o cardápio pelo celular. O pedido continua sendo feito verbalmente com o garçom ou no balcão — o QR code substitui apenas o cardápio de papel.</li>
        <li><strong>QR com pedido integrado:</strong> o cliente monta o pedido direto pelo celular, e ele cai automaticamente no sistema que organiza a cozinha e o caixa — sem ninguém anotar manualmente.</li>
      </ul>
      <p>A maior parte do ganho operacional está no segundo formato. O primeiro resolve um problema estético e de praticidade (menos cardápio sujo ou desgastado), mas não elimina o gargalo de anotação manual do pedido.</p>

      ${inlineFigure({ slug: 'cardapio-digital-qr-code-vale-a-pena', name: 'mesa-pedido-qr', alt: 'Mesa de restaurante com um cartão de QR code ao lado de pratos servidos', caption: 'O QR code na mesa substitui o cardápio impresso e, em alguns casos, também o pedido anotado à mão.' })}

      <h2>Quando o cardápio digital com QR code vale a pena</h2>
      <table>
        <thead>
          <tr><th>Situação</th><th>Vale a pena?</th><th>Por quê</th></tr>
        </thead>
        <tbody>
          <tr><td>Restaurante com mesas e cardápio que muda com frequência</td><td>Sim</td><td>Atualizar preço e disponibilidade no cardápio digital é instantâneo, sem reimprimir</td></tr>
          <tr><td>Negócio com pico de movimento e equipe pequena de atendimento</td><td>Sim, principalmente com pedido integrado</td><td>Reduz o tempo entre o cliente decidir e o pedido chegar na cozinha</td></tr>
          <tr><td>Lanchonete 100% balcão, pedido rápido e cardápio simples</td><td>Ganho menor</td><td>O cardápio no balcão ou no cardápio físico já resolve bem, sem fricção adicional</td></tr>
          <tr><td>Público de idade mais avançada ou pouco familiarizado com celular</td><td>Avaliar com cautela</td><td>Manter uma opção física em paralelo evita excluir parte da clientela</td></tr>
        </tbody>
      </table>

      <h2>Os benefícios reais, além da imagem moderna</h2>
      <p>O ganho mais citado é estético — "parece mais moderno" — mas o benefício que realmente aparece no resultado é outro: <strong>menos erro de anotação e menos tempo entre o pedido e o lançamento no sistema</strong>. Quando o cliente monta o próprio pedido pelo celular, elimina-se a etapa de um garçom anotar à mão e depois digitar no caixa — cada etapa manual é uma chance de erro (item errado, quantidade errada, esquecimento).</p>
      <p>Outro ganho menos falado, mas relevante: o cardápio digital permite indicar em tempo real quando um item está em falta, sem precisar avisar cada garçom individualmente ou deixar o cliente pedir algo que não existe mais naquele dia.</p>

      <h2>Cardápio digital muda a forma como o cliente decide o que pedir</h2>
      <p>Um efeito pouco discutido, mas relevante, é o comportamento de compra. No cardápio impresso, o cliente geralmente olha uma vez e decide rápido, limitado ao que cabe na página. No cardápio digital, é mais fácil incluir fotos de cada prato, descrição mais completa e destacar itens específicos (promoção do dia, prato mais pedido) sem precisar reimprimir nada. Isso pode aumentar o ticket médio quando bem utilizado — mas também pode confundir se o cardápio tiver itens demais ou navegação complicada.</p>
      <p>A recomendação prática é simples: comece com uma versão organizada por categoria, com fotos apenas dos itens mais importantes, e ajuste com base no que os clientes realmente usam — não tente replicar o cardápio impresso pixel a pixel dentro do formato digital.</p>

      <h2>Implantação: o que muda na rotina da equipe</h2>
      <p>Adotar cardápio digital com pedido integrado exige um pequeno ajuste de rotina, mas não uma reestruturação completa da operação:</p>
      <ul>
        <li><strong>Treinar a equipe para orientar o cliente:</strong> principalmente nas primeiras semanas, alguns clientes vão precisar de ajuda para escanear o QR code e navegar pelo cardápio</li>
        <li><strong>Definir o fluxo de confirmação do pedido:</strong> quem confirma que o pedido feito pelo celular chegou corretamente na cozinha, e como o cliente sabe que o pedido foi recebido</li>
        <li><strong>Manter uma alternativa para quem não usa celular com facilidade:</strong> um cardápio físico ou um atendente disponível para anotar o pedido evita excluir parte do público</li>
        <li><strong>Revisar o cardápio digital com a mesma disciplina do físico:</strong> item fora de estoque ou preço desatualizado no digital gera a mesma frustração que no papel — só que mais rápido de corrigir</li>
      </ul>

      <h2>O que considerar antes de adotar</h2>
      <ul>
        <li><strong>Conectividade do local:</strong> se o Wi-Fi ou o sinal de celular é ruim no ambiente, o cardápio digital pode frustrar mais do que ajudar</li>
        <li><strong>Perfil do público:</strong> negócios com público mais velho ou menos familiarizado com tecnologia se beneficiam de manter uma versão física em paralelo, ao menos no início</li>
        <li><strong>Integração com a cozinha e o caixa:</strong> um cardápio digital que não conversa com o sistema de pedidos só resolve metade do problema — o pedido ainda precisa ser redigitado manualmente em algum ponto</li>
        <li><strong>Atualização de cardápio e preço:</strong> se o cardápio muda com frequência (promoções, sazonalidade), o ganho de não precisar reimprimir compensa rápido o investimento inicial</li>
      </ul>

      <h2>Checklist para decidir se vale a pena no seu negócio</h2>
      <ul>
        <li>O cardápio muda de preço ou de itens com alguma frequência?</li>
        <li>O atendimento tem gargalo de tempo entre pedido e lançamento no sistema?</li>
        <li>A conexão de internet no local é estável?</li>
        <li>O público do negócio está confortável usando o celular para esse tipo de tarefa?</li>
        <li>Existe interesse em reduzir erro de anotação manual, não só modernizar a aparência?</li>
      </ul>
      <p>Se a maioria das respostas for "sim", o cardápio digital com QR code — principalmente no formato com pedido integrado — tende a valer o investimento. Se as respostas forem majoritariamente "não", talvez o cardápio impresso ainda seja a solução mais simples e eficiente para o seu momento.</p>

      <h2>Um exemplo de decisão prática</h2>
      <p>Imagine um restaurante pequeno com 10 mesas, movimento constante no almoço e um cardápio que muda semanalmente conforme a disponibilidade de ingredientes. Hoje, toda mudança de prato exige reimprimir o cardápio ou colar um adesivo por cima do item riscado — o que passa uma imagem de improviso para o cliente. Nesse cenário, o cardápio digital resolve dois problemas ao mesmo tempo: atualização instantânea do cardápio da semana e, se combinado a pedido integrado, redução do tempo entre o cliente decidir o prato e a cozinha começar o preparo.</p>
      <p>Já um quiosque de suco e açaí com cardápio fixo há anos e atendimento 100% no balcão provavelmente não sente o mesmo ganho — o cardápio físico ou o quadro na parede já cumpre bem o papel, e o investimento de tempo em configurar o QR code pode não valer a pena no momento.</p>

      <h2>Como o Zelo PDV integra o cardápio digital ao caixa e às mesas</h2>
      <p>Com o ${ADDONS.menu.name}, o pedido feito pelo cliente no QR code cai direto no painel de pedidos e na fila da cozinha — sem alguém precisar copiar de um lugar para outro. Combinado ao <a href="/extensoes#mesas">Módulo Mesas</a>, o pedido feito por QR code já entra vinculado à comanda da mesa certa, o que facilita o fechamento no fim do atendimento.</p>
      <p>Para ver o módulo de cardápio digital em detalhe, incluindo integração com pedidos do iFood e do WhatsApp no mesmo painel, visite <a href="/extensoes#menu">ZeloMenu</a>.</p>
    `
  },
  {
    slug: 'mei-alimentacao-limite-faturamento-das-2026',
    title: 'MEI de alimentação: limite de faturamento, DAS e o que controlar em 2026',
    description:
      'Guia atualizado em setembro de 2026 sobre o limite de faturamento do MEI de alimentação, o valor do DAS e o que controlar no dia a dia para não ultrapassar o teto sem perceber.',
    keyword: 'mei alimentação limite faturamento',
    coverVariant: 'sunrise',
    publishedAt: '2026-09-24',
    readingTime: '9 min',
    cover: { alt: 'Dono de uma pequena lanchonete MEI organizando notas e um boleto de pagamento sobre o balcão' },
    tldr: [
      'O limite de faturamento anual do MEI em 2026 é R$ 81.000 — cerca de R$ 6.750/mês em média, verificado no portal oficial gov.br/MEMP.',
      'Uma proposta em tramitação (PLP 186/2026) prevê subir o teto para R$ 110 mil em 2027 e R$ 140 mil em 2028, mas ainda não está em vigor.',
      'O DAS-MEI em 2026 soma R$ 81,05 de INSS, mais R$ 5,00 de ISS e/ou R$ 1,00 de ICMS conforme a atividade do MEI.',
      'Vendas por iFood, Rappi e outros apps entram no cálculo do faturamento do MEI normalmente — não existe exceção para delivery.',
      'Este artigo não substitui orientação de contador: para decisões específicas sobre enquadramento, nota fiscal e migração, procure um profissional.'
    ],
    faq: [
      {
        question: 'Qual é o limite de faturamento do MEI em 2026?',
        answer: 'R$ 81.000 por ano, o que dá uma média de R$ 6.750 por mês — valor confirmado no portal oficial gov.br/MEMP em setembro de 2026. Esse limite é anual: meses de venda maior podem ser compensados por meses mais fracos, desde que o total do ano não ultrapasse o teto.'
      },
      {
        question: 'O que acontece se o MEI ultrapassar o limite de faturamento?',
        answer: 'Ultrapassar o teto pode gerar desenquadramento do MEI e a necessidade de migrar para microempresa (ME), com outro regime de tributação. Um contador é a pessoa certa para orientar os passos específicos desse processo.'
      },
      {
        question: 'Quanto é o DAS do MEI em 2026?',
        answer: 'O DAS-MEI soma R$ 81,05 de INSS (5% do salário mínimo de R$ 1.621,00), mais R$ 5,00 de ISS para atividade de serviço ou R$ 1,00 de ICMS para atividade de comércio, conforme a atividade cadastrada.'
      },
      {
        question: 'As vendas feitas por iFood ou outros apps entram no limite do MEI?',
        answer: 'Sim. Todo faturamento do negócio, independente do canal de venda (balcão, delivery próprio ou aplicativos), soma para o cálculo do limite anual do MEI.'
      },
      {
        question: 'O limite do MEI vai mudar em breve?',
        answer: 'Existe uma proposta (PLP 186/2026) em tramitação no Congresso para elevar o teto a R$ 110 mil em 2027 e R$ 140 mil em 2028, mas ela ainda não está em vigor — o limite vigente continua sendo R$ 81 mil.'
      }
    ],
    content: `
      <p>O limite de faturamento anual do MEI (Microempreendedor Individual) em 2026 é <strong>R$ 81.000</strong> — o equivalente a uma média de R$ 6.750 por mês, segundo o portal oficial <a href="https://www.gov.br/memp/pt-br/teto-do-mei" target="_blank" rel="noopener noreferrer">gov.br/MEMP</a>. Para quem toca uma lanchonete, food truck ou pequeno negócio de alimentação como MEI, saber onde esse teto está — e controlar o faturamento mês a mês para não ultrapassá-lo sem perceber — é tão importante quanto controlar o caixa do dia a dia.</p>
      <p>Este artigo reúne, com fonte oficial, o limite de faturamento vigente, o valor do DAS em 2026 e o que controlar na prática para não ser pego de surpresa. <strong>Importante: este conteúdo não substitui orientação contábil.</strong> Regras de enquadramento, nota fiscal e migração de regime têm particularidades por atividade e por município — para decisões específicas, procure um contador.</p>

      <h2>Qual é o limite de faturamento do MEI em 2026?</h2>
      <p>O teto vigente é de R$ 81.000 por ano. Esse número é anual, não mensal: um mês de venda mais forte (por exemplo, dezembro) pode ser compensado por um mês mais fraco, desde que a soma do ano não ultrapasse o limite. Na prática, isso dá um espaço médio de R$ 6.750 por mês, mas negócios sazonais podem distribuir esse total de forma desigual ao longo do ano.</p>
      <p>Existe uma proposta em tramitação no Congresso — o Projeto de Lei Complementar (PLP) 186/2026 — que prevê elevar esse teto para R$ 110 mil em 2027 e R$ 140 mil em 2028. <strong>Essa mudança ainda não está em vigor.</strong> Até que o processo legislativo termine, o limite de R$ 81 mil continua sendo o valor oficial e vigente.</p>

      ${inlineFigure({ slug: 'mei-alimentacao-limite-faturamento-das-2026', name: 'controle-financeiro-mei', alt: 'Empreendedora MEI conferindo o total de vendas do mês em um celular dentro de um food truck', caption: 'Acompanhar o faturamento acumulado do ano evita ultrapassar o teto do MEI sem perceber.' })}

      <h2>Quanto é o DAS do MEI de alimentação em 2026?</h2>
      <p>O DAS-MEI (Documento de Arrecadação do Simples Nacional) é o boleto mensal fixo que o MEI paga, independente de quanto faturou naquele mês. Segundo a <a href="https://www8.receita.fazenda.gov.br/simplesnacional/Noticias/NoticiaCompleta.aspx?id=c3b2044c-ff97-432a-b33c-ecf2a3df6dc3" target="_blank" rel="noopener noreferrer">Receita Federal / Simples Nacional</a>, em 2026 o DAS-MEI é composto por:</p>
      <table>
        <thead>
          <tr><th>Componente</th><th>Valor</th><th>Quando se aplica</th></tr>
        </thead>
        <tbody>
          <tr><td>INSS</td><td>R$ 81,05 (5% do salário mínimo de R$ 1.621,00)</td><td>Sempre, para todo MEI</td></tr>
          <tr><td>ISS</td><td>R$ 5,00</td><td>MEI de prestação de serviço (ex.: parte de negócios de alimentação com serviço associado)</td></tr>
          <tr><td>ICMS</td><td>R$ 1,00</td><td>MEI de comércio ou indústria (a maioria das lanchonetes e negócios de venda de comida se enquadra aqui)</td></tr>
        </tbody>
      </table>
      <p>Na prática, a maior parte dos negócios de alimentação paga INSS + ICMS, totalizando <strong>R$ 82,05 por mês</strong> — mas o enquadramento exato depende da atividade (CNAE) cadastrada no seu MEI, e isso é algo para confirmar com um contador ou no próprio Portal do Empreendedor.</p>
      <p>Esse valor do INSS está diretamente ligado ao salário mínimo vigente: como o cálculo é sempre 5% do salário mínimo do ano, o DAS tende a subir todo início de ano junto com o reajuste do mínimo. Vale conferir o valor atualizado em janeiro, já que boletos gerados no fim do ano anterior às vezes ainda trazem o valor antigo.</p>

      <h2>O que controlar no dia a dia para não ultrapassar o limite</h2>
      <p>O erro mais comum não é faturar muito em um mês isolado — é <strong>não somar o acumulado do ano</strong> e descobrir perto de dezembro que o negócio já passou do teto sem que ninguém tivesse percebido. Alguns pontos de atenção:</p>
      <ul>
        <li><strong>Some todos os canais:</strong> vendas de balcão, delivery próprio, iFood, Rappi e qualquer outro aplicativo entram no cálculo do faturamento do MEI. Não existe exceção para vendas feitas por plataforma de delivery.</li>
        <li><strong>Acompanhe o acumulado mês a mês:</strong> ter uma visão do total faturado desde janeiro evita a surpresa de só descobrir o estouro do limite no fechamento do ano.</li>
        <li><strong>Separe conta PF e PJ:</strong> misturar o dinheiro pessoal com o do negócio dificulta saber, com precisão, quanto o MEI realmente faturou.</li>
        <li><strong>Guarde o histórico de vendas:</strong> em caso de fiscalização ou de decisão de migrar de regime, ter o registro organizado dos últimos meses facilita qualquer conversa com o contador.</li>
      </ul>

      <h2>MEI precisa emitir nota fiscal nas vendas de alimentação?</h2>
      <p>A obrigatoriedade de emissão de nota fiscal para o MEI varia conforme o tipo de cliente e a atividade. De forma geral, venda para consumidor final (pessoa física) muitas vezes dispensa a emissão obrigatória, dependendo do estado e do município, mas venda para outra empresa (pessoa jurídica) costuma exigir nota. Como essa regra muda por localidade e por atividade cadastrada, a orientação mais segura é confirmar diretamente com um contador ou no portal da prefeitura/estado onde o MEI está registrado — este artigo não substitui essa verificação.</p>

      <h2>Separar conta pessoal da conta do negócio</h2>
      <p>Mesmo sem a complexidade contábil de uma empresa maior, o MEI se beneficia de manter uma conta bancária dedicada ao negócio, separada da conta pessoal. Isso não é só uma boa prática — é o que permite saber, com precisão, quanto o negócio de fato faturou no mês, sem misturar entrada de venda com transferência pessoal, PIX de amigo ou qualquer outra movimentação que não tem relação com a operação.</p>
      <p>Sem essa separação, calcular o faturamento acumulado do ano (o número que importa para não estourar o limite do MEI) fica muito mais sujeito a erro.</p>

      <h2>O que acontece se o limite for ultrapassado</h2>
      <p>Ultrapassar o teto pode levar ao desenquadramento do MEI e à necessidade de migrar para outro regime, como microempresa (ME) no Simples Nacional. As regras exatas — se a migração é automática, retroativa ou depende de ação do empreendedor, e quais impostos passam a incidir — variam conforme o quanto o limite foi ultrapassado e a atividade do negócio. Esse é exatamente o tipo de decisão que exige orientação de um contador, e não uma resposta genérica de um artigo de blog.</p>

      <h2>Quando considerar migrar de MEI para microempresa</h2>
      <p>Alguns sinais indicam que vale a pena conversar com um contador sobre migrar de regime antes mesmo de atingir o teto: faturamento crescendo de forma consistente mês a mês e já próximo do limite anual, necessidade de contratar mais de um funcionário (o MEI tem limite de contratação), ou a necessidade de emitir nota fiscal com mais frequência para clientes pessoa jurídica. Migrar antes de ser forçado pelo estouro do limite costuma ser mais tranquilo do que fazer isso de forma reativa, sob pressão de prazo.</p>
      <p>De novo: essa decisão depende de detalhes específicos do seu negócio, atividade e planejamento tributário — não existe uma resposta genérica que sirva para todo MEI de alimentação, e um contador é quem vai avaliar isso com precisão.</p>

      <h2>Checklist rápido do MEI de alimentação</h2>
      <ul>
        <li>Sei o total faturado desde janeiro, somando todos os canais de venda?</li>
        <li>Minha conta bancária do negócio está separada da conta pessoal?</li>
        <li>Sei qual componente do DAS se aplica à minha atividade (ISS ou ICMS)?</li>
        <li>Tenho o registro das vendas organizado, caso precise mostrar para um contador?</li>
        <li>Se estou perto do limite anual, já conversei com um contador sobre os próximos passos?</li>
      </ul>

      <h2>Como o Zelo PDV ajuda no controle financeiro do MEI</h2>
      <p>O Zelo PDV registra as vendas do balcão, do delivery e das plataformas em um só lugar, o que facilita acompanhar o faturamento acumulado do ano sem precisar somar recibo por recibo. Para quem já está perto do limite do MEI, essa visão mês a mês é o que permite se antecipar — e não descobrir o problema só quando o contador liga em dezembro.</p>
      <p>Veja como o sistema se encaixa na rotina de quem toca o negócio sozinho, no celular ou no notebook, em <a href="/para-mei">Zelo PDV para MEI</a>, ou confira os fatos completos do produto em <a href="/sobre">Fatos sobre o Zelo PDV</a>.</p>
    `
  }
];

export const publishedPosts = posts.filter((post) => post.content !== '<p>Em breve.</p>');

export function getPostBySlug(slug) {
  return posts.find((post) => post.slug === slug);
}
