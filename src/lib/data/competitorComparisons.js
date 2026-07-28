// Páginas comparativas "Zelo PDV vs <concorrente>".
//
// REGRAS DE CONTEÚDO (não remover — protegem juridicamente):
// 1. Todo número de preço de concorrente vem do site OFICIAL dele, com data de
//    consulta em `priceCheckedAt`. Preço muda; trate como "a partir de" e datado.
// 2. Reclamações de clientes são SEMPRE atribuídas como relatos de terceiros
//    (ex: Reclame Aqui) com link em `sources`, nunca como fato afirmado por nós.
// 3. Claims sobre o concorrente ("não funciona offline") devem ser verdadeiros e
//    verificáveis. Quando o concorrente só "não anuncia" algo, use linguagem de
//    ausência de claim, não de fato testado.
// 4. O preço do Zelo (R$ 59) sai de pricing.js — não inventar outro número aqui.

export { softwareApplicationSchema } from './segmentLandingPages';

export const competitorComparisons = {
  saipos: {
    slug: 'vs-saipos',
    competitor: 'Saipos',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs Saipos: Alternativa Mais Barata e Offline | Zelo PDV',
      description:
        'Saipos a partir de R$ 240/mês e 100% online. Zelo PDV custa R$ 59/mês, funciona offline e você paga só pelos módulos que usa. Compare e teste 14 dias grátis.',
      canonical: 'https://zelopdv.com.br/vs-saipos'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs Saipos',
    h1: 'Zelo PDV vs Saipos: a alternativa mais barata, modular e que funciona offline',
    subtitle:
      'A Saipos é um sistema robusto para restaurantes, mas o preço começa em mais de R$ 240/mês, depende de internet o tempo todo e o valor final passa por uma conversa com o time de vendas. O Zelo PDV entrega frente de caixa, fiado, estoque e financeiro por R$ 59/mês, funcionando até sem internet.',
    editorialThesis:
      'A Saipos atende bem operações maiores de restaurante e delivery que justificam um pacote robusto. O Zelo PDV serve melhor a lanchonetes, hamburguerias e pequenos negócios que precisam de caixa, fiado e financeiro por um preço público menor, mas fica abaixo em recursos avançados de operação grande.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'a partir de R$ 240,79/mês',
      note: 'Preço da Saipos consultado no site oficial (saipos.com/planos-e-precos) em junho de 2026. O valor final é segmentado por faturamento e passa por demonstração comercial; sujeito a alteração.'
    },
    introTitle: 'Quando a Saipos é mais sistema (e mais conta) do que o seu negócio precisa',
    introParagraphs: [
      'A Saipos se posiciona como plataforma completa para bares e restaurantes, com mais de 70 recursos e forte integração com iFood. É um bom produto — mas é construído para uma operação que justifica pagar a partir de R$ 240 por mês, e cujo preço real só aparece depois de informar seu faturamento e falar com um vendedor.',
      'Para uma lanchonete de bairro, uma hamburgueria enxuta ou um delivery próprio, isso costuma ser caro demais e complexo demais. Você acaba pagando por um pacote inteiro de funcionalidades que talvez nunca use, com mensalidade que pesa logo no começo, quando o caixa ainda é apertado.',
      'O Zelo PDV nasceu para o outro lado dessa conta: começar barato, mostrar o preço de forma transparente e crescer por módulos. Você paga R$ 59/mês pela base e adiciona só o que faz sentido (mesas, pedidos/cozinha, acessos) — sem assinar uma plataforma cara para depois descobrir que usa um terço dela.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e Saipos, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      {
        feature: 'Preço de entrada',
        competitor: 'A partir de R$ 240,79/mês',
        zelo: 'R$ 59/mês',
        advantage: 'zelo'
      },
      {
        feature: 'Preço transparente no site',
        competitor: 'Segmentado por faturamento, via demonstração comercial',
        zelo: 'Preço fixo e público, sem falar com vendedor',
        advantage: 'zelo'
      },
      {
        feature: 'Funciona sem internet (offline)',
        competitor: '100% em nuvem, exige conexão estável',
        zelo: 'Continua vendendo offline e sincroniza depois',
        advantage: 'zelo'
      },
      {
        feature: 'Modelo de cobrança',
        competitor: 'Pacote único com +70 recursos',
        zelo: 'Base + módulos opcionais (paga só o que usa)',
        advantage: 'zelo'
      },
      {
        feature: 'Teste sem cartão',
        competitor: 'Demonstração agendada com time comercial',
        zelo: '14 dias grátis, sem cartão, criando a conta na hora',
        advantage: 'zelo'
      },
      {
        feature: 'Robustez para grandes redes',
        competitor: 'Forte para operações grandes e múltiplas lojas',
        zelo: 'Focado em pequeno e médio negócio',
        advantage: 'competitor'
      }
    ],
    reasonsTitle: 'Por que pequenos negócios trocam (ou nem chegam a assinar a Saipos)',
    reasons: [
      {
        icon: '💸',
        title: 'Cerca de 4x mais barato no piso',
        description:
          'R$ 59/mês contra a partir de R$ 240,79/mês. Para quem está começando ou tem margem apertada, essa diferença é a conta do mês inteiro de um sistema sobrando no caixa.'
      },
      {
        icon: '📶',
        title: 'Vende mesmo sem internet',
        description:
          'A Saipos é 100% em nuvem e depende de conexão estável. O Zelo PDV continua registrando vendas offline e sincroniza quando a internet volta — essencial em bairro com sinal instável ou em horário de pico.'
      },
      {
        icon: '🧩',
        title: 'Você paga só pelos módulos que usa',
        description:
          'Em vez de um pacote fechado de mais de 70 recursos, o Zelo começa na base de R$ 59 e você ativa mesas, pedidos/cozinha ou controle de acessos só quando precisar.'
      },
      {
        icon: '🏷️',
        title: 'Preço claro, sem passar por vendas',
        description:
          'O valor final da Saipos é segmentado por faturamento e fechado em demonstração comercial. No Zelo, o preço está na tela: você cria a conta e testa 14 dias sem falar com ninguém.'
      }
    ],
    fairnessNote:
      'Para ser justo: a Saipos é um sistema maduro e completo, com integrações fortes para redes e operações grandes. Se você opera várias lojas e precisa de um ERP de restaurante robusto, ela pode fazer sentido. Este comparativo é para quem busca simplicidade e preço de pequeno negócio.',
    faqSpecific: [
      {
        question: 'Quanto custa a Saipos comparada ao Zelo PDV?',
        answer:
          'Em junho de 2026, a Saipos divulga preço a partir de R$ 240,79/mês no site oficial, com valor final segmentado por faturamento e fechado em demonstração. O Zelo PDV custa R$ 59/mês fixos, com preço público e teste de 14 dias sem cartão.'
      },
      {
        question: 'O Zelo PDV funciona offline e a Saipos não?',
        answer:
          'O Zelo PDV foi feito para continuar vendendo mesmo sem internet, sincronizando depois. A Saipos é uma plataforma 100% em nuvem e, conforme a própria página "como funciona", depende de conexão estável para operar.'
      },
      {
        question: 'Preciso falar com vendedor para saber o preço?',
        answer:
          'No Zelo PDV não. O preço de R$ 59/mês é público e você cria a conta na hora. Na Saipos, o valor final depende do seu faturamento e é apresentado em uma demonstração com o time comercial.'
      },
      {
        question: 'O Zelo PDV substitui a Saipos para um restaurante grande?',
        answer:
          'Depende do porte. O Zelo PDV cobre muito bem lanchonetes, hamburguerias, delivery próprio e MEIs de alimentação. Para redes grandes com necessidades de ERP avançado, a Saipos tem recursos voltados a esse perfil. Para a maioria dos pequenos e médios, o Zelo resolve por uma fração do preço.'
      }
    ],
    sources: [
      { label: 'Saipos — Planos e preços (oficial)', url: 'https://saipos.com/planos-e-precos' },
      { label: 'Saipos — Como funciona (oficial)', url: 'https://saipos.com/como-funciona' },
      { label: 'Saipos — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/saipos/' }
    ],
    finalCtaTitle: 'Compare na prática: teste o Zelo PDV 14 dias grátis',
    finalCtaText:
      'Antes de assinar um sistema de R$ 240/mês, veja se o seu negócio não resolve tudo com R$ 59. Crie a conta, use a frente de caixa de verdade por 14 dias, sem cartão e sem demonstração agendada.'
  },

  goomer: {
    slug: 'vs-goomer',
    competitor: 'Goomer',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs Goomer: PDV Completo x Cardápio Digital | Zelo PDV',
      description:
        'A Goomer é cardápio digital e ainda precisa integrar a um PDV externo. O Zelo PDV já é a frente de caixa completa por R$ 59/mês, com fiado, estoque e financeiro. Compare.',
      canonical: 'https://zelopdv.com.br/vs-goomer'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs Goomer',
    h1: 'Zelo PDV vs Goomer: PDV completo de verdade x cardápio digital',
    subtitle:
      'A Goomer é uma boa plataforma de cardápio digital, mas ela não é um PDV — para ter frente de caixa você ainda precisa integrar a um sistema externo. O Zelo PDV já é o caixa completo: vendas, fiado, estoque e financeiro em um só lugar, por R$ 59/mês.',
    editorialThesis:
      'A Goomer é forte quando a prioridade é cardápio digital, QR Code e autoatendimento. O Zelo PDV é mais direto para quem precisa primeiro de frente de caixa, fiado, estoque e financeiro; não tenta substituir uma plataforma especializada em totem.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'plano com PDV a partir de R$ 224,92/mês',
      note: 'Preço da Goomer consultado no site oficial (goomer.com.br/planos) em junho de 2026: plano "Integrar" R$ 299,90/mês (R$ 224,92 no anual). O plano grátis cobra R$ 1,39 por pedido acima de 30/mês. Sujeito a alteração.'
    },
    introTitle: 'Cardápio digital não é frente de caixa',
    introParagraphs: [
      'A Goomer resolve bem uma parte do problema: cardápio digital por QR Code na mesa, totem de autoatendimento e pedidos por link. Mas ela é, por desenho, uma camada de atendimento que se integra a um PDV — não o PDV em si. Ou seja, depois de assinar a Goomer, você ainda precisa de um sistema separado para controlar caixa, estoque, fiado e o financeiro do dia.',
      'Na prática, isso vira duas assinaturas e duas ferramentas para fazer o que muitos negócios precisam que seja uma só. E o plano da Goomer que inclui integração com PDV ("Integrar") parte de R$ 224,92/mês no anual, sem contar add-ons como QR Code e Delivery, que são cobrados à parte.',
      'O Zelo PDV vai pela outra ponta: ele é a frente de caixa completa desde o primeiro dia, por R$ 59/mês. Você registra vendas, controla fiado, acompanha estoque e fecha o caixa sem precisar amarrar um segundo sistema por cima.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e Goomer, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      {
        feature: 'É um PDV / frente de caixa completo?',
        competitor: 'Não — é cardápio digital que integra a um PDV externo',
        zelo: 'Sim — caixa, vendas e fechamento nativos',
        advantage: 'zelo'
      },
      {
        feature: 'Preço para ter PDV',
        competitor: 'Plano "Integrar" a partir de R$ 224,92/mês (anual)',
        zelo: 'R$ 59/mês, já com a frente de caixa',
        advantage: 'zelo'
      },
      {
        feature: 'Controle de fiado e estoque',
        competitor: 'Depende do PDV que você integrar',
        zelo: 'Nativo, incluso na base',
        advantage: 'zelo'
      },
      {
        feature: 'Cobrança por pedido',
        competitor: 'Plano grátis cobra R$ 1,39 por pedido acima de 30/mês',
        zelo: 'Sem cobrança por pedido',
        advantage: 'zelo'
      },
      {
        feature: 'Add-ons',
        competitor: 'QR Code e Delivery cobrados à parte (+R$ 70 a R$ 99,90/mês)',
        zelo: 'Módulos opcionais, você paga só o que usa',
        advantage: 'tie'
      },
      {
        feature: 'Cardápio digital com totem de autoatendimento',
        competitor: 'Forte nesse ponto (QR, tablet e totem)',
        zelo: 'Foco em frente de caixa, não em totem',
        advantage: 'competitor'
      }
    ],
    reasonsTitle: 'Por que escolher o Zelo PDV em vez de só um cardápio digital',
    reasons: [
      {
        icon: '🧾',
        title: 'Um sistema, não dois',
        description:
          'Com a Goomer você ainda precisa de um PDV separado para caixa, estoque e fiado. O Zelo PDV já é esse PDV — uma assinatura, uma ferramenta, sem amarrar integrações.'
      },
      {
        icon: '💸',
        title: 'R$ 59 contra R$ 224+ pelo plano com PDV',
        description:
          'O plano da Goomer que integra PDV parte de R$ 224,92/mês no anual. O Zelo entrega a frente de caixa completa por R$ 59/mês, sem cobrança por pedido.'
      },
      {
        icon: '🙋',
        title: 'Suporte humano direto',
        description:
          'Há relatos de clientes na Reclame Aqui sobre dificuldade de falar com um humano na Goomer (atendimento por chatbot). No Zelo, você fala direto com o time pelo WhatsApp.'
      },
      {
        icon: '📦',
        title: 'Fiado e estoque já inclusos',
        description:
          'Controle de fiado e acompanhamento de estoque vêm na base do Zelo. Na Goomer, isso depende de qual PDV externo você acabar contratando por cima.'
      }
    ],
    fairnessNote:
      'Para ser justo: a Goomer é forte em cardápio digital, QR Code na mesa e totem de autoatendimento — se o seu foco é exatamente experiência de autoatendimento, ela é especializada nisso. O ponto deste comparativo é que cardápio digital não substitui uma frente de caixa, e o Zelo PDV resolve a frente de caixa por muito menos.',
    faqSpecific: [
      {
        question: 'A Goomer é um PDV?',
        answer:
          'A Goomer é primariamente uma plataforma de cardápio digital (QR Code, totem, delivery) que se integra a um PDV externo, conforme o próprio material dela. Ou seja, para ter frente de caixa completa você precisa de um PDV à parte. O Zelo PDV já é essa frente de caixa.'
      },
      {
        question: 'Quanto custa a Goomer com PDV comparada ao Zelo?',
        answer:
          'Em junho de 2026, o plano "Integrar" da Goomer (que inclui integração com PDV) parte de R$ 224,92/mês no anual, segundo o site oficial, fora add-ons como QR Code e Delivery. O Zelo PDV custa R$ 59/mês com a frente de caixa inclusa.'
      },
      {
        question: 'A Goomer cobra por pedido?',
        answer:
          'No plano grátis da Goomer, conforme o site oficial, há cobrança de R$ 1,39 por pedido acima de 30 pedidos no mês. O Zelo PDV não cobra por pedido.'
      },
      {
        question: 'Posso usar cardápio digital com o Zelo PDV?',
        answer:
          'O foco do Zelo PDV é a frente de caixa e a gestão do negócio (vendas, fiado, estoque, financeiro). Se o seu objetivo principal é totem de autoatendimento, a Goomer é especializada nisso; se é controlar o caixa e o financeiro de forma barata, o Zelo resolve por R$ 59/mês.'
      }
    ],
    sources: [
      { label: 'Goomer — Planos (oficial)', url: 'https://goomer.com.br/planos' },
      { label: 'Goomer — Integração com PDV (oficial)', url: 'https://goomer.com.br/blog/integracao-cardapio-digital-com-pdv' },
      { label: 'Goomer — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/goomer/' }
    ],
    finalCtaTitle: 'Comece com a frente de caixa completa por R$ 59/mês',
    finalCtaText:
      'Em vez de pagar por um cardápio digital e ainda contratar um PDV à parte, comece com o Zelo PDV — caixa, fiado, estoque e financeiro juntos. Teste 14 dias grátis, sem cartão.'
  },

  anotaAi: {
    slug: 'vs-anota-ai',
    competitor: 'Anota AI',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs Anota AI: PDV Completo Sem Robô de IA Caro | Zelo PDV',
      description:
        'A Anota AI parte de mais de R$ 219/mês com robô de IA. O Zelo PDV é a frente de caixa completa por R$ 59/mês, com estoque e cozinha sem precisar do plano mais caro. Compare.',
      canonical: 'https://zelopdv.com.br/vs-anota-ai'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs Anota AI',
    h1: 'Zelo PDV vs Anota AI: frente de caixa completa sem pagar por uma plataforma de IA',
    subtitle:
      'A Anota AI é uma plataforma forte de atendimento por robô de IA no WhatsApp — mas o preço começa em mais de R$ 219/mês e recursos como estoque e cozinha (KDS) só aparecem no plano mais caro. Se você quer mesmo é uma frente de caixa boa e barata, o Zelo PDV entrega por R$ 59/mês.',
    editorialThesis:
      'A Anota AI faz sentido para quem quer automação forte de atendimento por WhatsApp. O Zelo PDV é a opção mais enxuta para quem quer bater caixa, controlar estoque e ver lucro sem pagar por uma suíte de IA; se o robô de WhatsApp é o centro da operação, a Anota AI leva vantagem.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'a partir de R$ 219,99/mês',
      note: 'Preço da Anota AI consultado em fontes oficiais (anota.ai) em junho de 2026: planos de entrada divulgados entre R$ 219,99 e R$ 299,99/mês e topo entre R$ 329,99 e R$ 399,99/mês, com promoções temporárias à parte. Sujeito a alteração.'
    },
    introTitle: 'Você precisa mesmo de um robô de IA, ou só de um bom caixa?',
    introParagraphs: [
      'A Anota AI nasceu e ficou conhecida como robô de atendimento por IA no WhatsApp para delivery. Com o tempo ela ganhou módulos de PDV, mas o produto continua sendo, no centro, uma suíte de automação de atendimento — e o preço reflete isso, começando acima de R$ 219/mês.',
      'O detalhe que pesa no bolso: recursos básicos de operação como gestor de estoque e cozinha (KDS) só aparecem no plano mais caro (Gestão Avançada). Ou seja, para ter uma frente de caixa realmente completa, você acaba no topo da tabela. Some a isso a renovação automática com aviso prévio de 7 dias úteis e sem reembolso, descrita nos termos.',
      'O Zelo PDV vai direto ao ponto que o pequeno negócio precisa: caixa, fiado, estoque e financeiro por R$ 59/mês, funcionando até offline. Se um dia você quiser camadas extras, ativa por módulo — sem ter que assinar uma plataforma inteira de IA para conseguir bater o caixa.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e Anota AI, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Preço de entrada', competitor: 'A partir de R$ 219,99/mês', zelo: 'R$ 59/mês', advantage: 'zelo' },
      { feature: 'Estoque e cozinha (KDS)', competitor: 'Só no plano mais caro (Gestão Avançada)', zelo: 'Estoque na base; sem pagar o topo', advantage: 'zelo' },
      { feature: 'Funciona sem internet (offline)', competitor: 'Não anuncia operação offline', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Renovação e cancelamento', competitor: 'Renovação automática, aviso prévio de 7 dias úteis, sem reembolso', zelo: 'Cancele quando quiser', advantage: 'zelo' },
      { feature: 'Produto central', competitor: 'Suíte de atendimento por robô de IA', zelo: 'Frente de caixa e gestão do negócio', advantage: 'tie' },
      { feature: 'Robô de IA no WhatsApp', competitor: 'Forte nesse ponto', zelo: 'Não é o foco', advantage: 'competitor' }
    ],
    reasonsTitle: 'Por que muitos preferem o Zelo PDV à Anota AI',
    reasons: [
      { icon: '💸', title: 'A partir de R$ 59 contra R$ 219+', description: 'O plano de entrada da Anota AI passa de R$ 219/mês. O Zelo entrega a frente de caixa completa por R$ 59/mês, sem cobrança por pedido nem comissão.' },
      { icon: '📦', title: 'Estoque e cozinha sem pagar o plano top', description: 'Na Anota AI, gestor de estoque e KDS ficam só na Gestão Avançada. No Zelo, o controle vem na base — você não precisa subir para o plano mais caro só para isso.' },
      { icon: '📶', title: 'Vende mesmo sem internet', description: 'A Anota AI não anuncia operação offline. O Zelo PDV continua registrando vendas sem conexão e sincroniza quando a internet volta.' },
      { icon: '🔓', title: 'Sem trava de renovação', description: 'Os termos da Anota AI descrevem renovação automática com aviso de 7 dias úteis e sem reembolso. No Zelo, você cancela quando quiser.' }
    ],
    fairnessNote:
      'Para ser justo: se o seu foco é um robô de IA avançado atendendo no WhatsApp e recuperando pedidos, a Anota AI é especializada nisso. Este comparativo é para quem quer, antes de tudo, uma frente de caixa completa e barata.',
    faqSpecific: [
      { question: 'Quanto custa a Anota AI comparada ao Zelo PDV?', answer: 'Em junho de 2026, a Anota AI divulga planos de entrada entre R$ 219,99 e R$ 299,99/mês e topo entre R$ 329,99 e R$ 399,99/mês (há promoções temporárias à parte). O Zelo PDV custa R$ 59/mês fixos.' },
      { question: 'Preciso do plano mais caro da Anota AI para ter estoque?', answer: 'Conforme a tabela de planos da Anota AI, recursos como gestor de estoque e cozinha (KDS) ficam no plano Gestão Avançada, o mais caro. No Zelo PDV, o controle de estoque vem na base de R$ 59/mês.' },
      { question: 'O Zelo PDV tem robô de IA no WhatsApp como a Anota AI?', answer: 'Não é o foco do Zelo PDV. O Zelo é uma frente de caixa e sistema de gestão. Se o seu objetivo principal é automação de atendimento por IA, a Anota AI é especializada nisso; se é bater caixa e controlar o negócio barato, o Zelo resolve por R$ 59/mês.' },
      { question: 'A Anota AI funciona offline?', answer: 'A Anota AI não anuncia operação offline e depende de internet e da API do WhatsApp. O Zelo PDV foi feito para continuar vendendo mesmo sem internet.' }
    ],
    sources: [
      { label: 'Anota AI — Planos (oficial)', url: 'https://anota.ai/blog/planos-principal/' },
      { label: 'Anota AI — FAQ / renovação (oficial)', url: 'https://anota.ai/blog/faq-anota-ai/' },
      { label: 'Anota AI — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/anota-ai/lista-reclamacoes/' }
    ],
    finalCtaTitle: 'Comece com a frente de caixa completa por R$ 59/mês',
    finalCtaText:
      'Antes de assinar uma plataforma de IA de R$ 219+ por mês, veja se o seu negócio não resolve com R$ 59. Teste o Zelo PDV por 14 dias grátis, sem cartão.'
  },

  whatsmenu: {
    slug: 'vs-whatsmenu',
    competitor: 'WhatsMenu',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs WhatsMenu: PDV Offline e Modular por R$ 59 | Zelo PDV',
      description:
        'WhatsMenu custa R$ 97/mês em plano único e online. Zelo PDV é R$ 59/mês, funciona offline e você paga só pelos módulos que usa. Compare e teste 14 dias grátis.',
      canonical: 'https://zelopdv.com.br/vs-whatsmenu'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs WhatsMenu',
    h1: 'Zelo PDV vs WhatsMenu: caixa que funciona offline, por menos',
    subtitle:
      'O WhatsMenu é uma boa opção de cardápio digital com caixa para delivery via WhatsApp, em plano único de R$ 97/mês. O Zelo PDV custa R$ 59/mês, é modular e foi feito para continuar vendendo mesmo quando a internet cai.',
    editorialThesis:
      'O WhatsMenu é uma alternativa honesta para delivery por WhatsApp em plano único. O Zelo PDV pesa menos no mês e é melhor para quem quer começar pelo caixa offline e ativar módulos só quando precisar; se o foco é pedido por WhatsApp, o WhatsMenu tem mais especialização.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'R$ 97/mês (plano único)',
      note: 'Preço do WhatsMenu consultado no site oficial (whatsmenu.com.br) em junho de 2026: plano único de R$ 97/mês. Sujeito a alteração.'
    },
    introTitle: 'Plano único pode custar caro pelo que você não usa',
    introParagraphs: [
      'O WhatsMenu resolve bem o delivery por WhatsApp e inclui sistema de caixa, estoque e app de garçom em um plano único de R$ 97/mês. É uma proposta honesta — mas "plano único" significa que você paga por tudo, mesmo que use só uma parte.',
      'Para um negócio enxuto, isso é o oposto do ideal: você quer começar barato e crescer conforme a necessidade. E há um ponto que o WhatsMenu não destaca: a operação é via navegador e não há menção a modo offline, então uma queda de internet no horário de pico pode travar o caixa.',
      'O Zelo PDV parte de R$ 59/mês e é modular — você ativa mesas, pedidos/cozinha ou acessos só quando fizer sentido. E continua registrando vendas offline, sincronizando quando a conexão volta.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e WhatsMenu, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Preço', competitor: 'R$ 97/mês (plano único)', zelo: 'R$ 59/mês', advantage: 'zelo' },
      { feature: 'Funciona sem internet (offline)', competitor: 'Não anuncia operação offline', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Modelo de cobrança', competitor: 'Plano único com tudo junto', zelo: 'Base + módulos opcionais (paga só o que usa)', advantage: 'zelo' },
      { feature: 'Controle de fiado', competitor: 'Não destacado', zelo: 'Nativo, incluso na base', advantage: 'zelo' },
      { feature: 'Foco em pedidos por WhatsApp', competitor: 'Forte nesse ponto', zelo: 'Frente de caixa e gestão geral', advantage: 'tie' }
    ],
    reasonsTitle: 'Por que o Zelo PDV faz mais sentido para um negócio enxuto',
    reasons: [
      { icon: '💸', title: 'R$ 59 contra R$ 97 por mês', description: 'O Zelo é mais barato no mês e ainda permite crescer por módulo, em vez de pagar um plano único cheio desde o começo.' },
      { icon: '📶', title: 'Não para quando a internet cai', description: 'O WhatsMenu não anuncia operação offline. O Zelo PDV continua vendendo sem internet e sincroniza depois — essencial em horário de pico.' },
      { icon: '🧩', title: 'Modular de verdade', description: 'Você começa na base de R$ 59 e ativa mesas, pedidos/cozinha ou acessos só quando precisar. Sem pagar por recurso que não usa.' },
      { icon: '📒', title: 'Fiado e gestão na base', description: 'Controle de fiado, estoque e financeiro já vêm no Zelo. Você organiza o caixa do negócio inteiro, não só os pedidos de delivery.' }
    ],
    fairnessNote:
      'Para ser justo: o WhatsMenu é uma opção sólida e sem comissão para quem foca em delivery por WhatsApp. O ponto deste comparativo é preço, modularidade e operação offline — onde o Zelo PDV leva vantagem.',
    faqSpecific: [
      { question: 'O Zelo PDV é mais barato que o WhatsMenu?', answer: 'Sim. Em junho de 2026, o WhatsMenu cobra R$ 97/mês em plano único, segundo o site oficial. O Zelo PDV custa R$ 59/mês e ainda é modular, então você paga só pelos módulos que usar.' },
      { question: 'O WhatsMenu funciona offline?', answer: 'O WhatsMenu não anuncia operação offline; é um sistema baseado em navegador. O Zelo PDV foi feito para continuar registrando vendas mesmo sem internet.' },
      { question: 'O Zelo PDV faz pedidos por WhatsApp como o WhatsMenu?', answer: 'O foco do Zelo é a frente de caixa e a gestão do negócio (vendas, fiado, estoque, financeiro). O WhatsMenu é especializado em pedidos por WhatsApp; se esse é o seu único objetivo, ele atende bem. Para controlar o caixa inteiro de forma barata e offline, o Zelo resolve.' },
      { question: 'Posso testar o Zelo PDV antes de pagar?', answer: 'Sim. São 14 dias grátis, sem cartão de crédito. Você cria a conta e usa a operação real do balcão durante o período.' }
    ],
    sources: [
      { label: 'WhatsMenu — Site oficial', url: 'https://www.whatsmenu.com.br/' },
      { label: 'WhatsMenu — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/whatsmenu/' }
    ],
    finalCtaTitle: 'Caixa offline e modular por R$ 59/mês',
    finalCtaText:
      'Compare na prática: teste o Zelo PDV por 14 dias grátis, sem cartão, e veja como é vender com um caixa que não para quando a internet cai.'
  },

  cardapioWeb: {
    slug: 'vs-cardapio-web',
    competitor: 'Cardápio Web',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs Cardápio Web: Alternativa Mais Barata e Offline | Zelo PDV',
      description:
        'Cardápio Web parte de R$ 169/mês com add-ons à parte. Zelo PDV é R$ 59/mês, funciona offline e você paga só pelos módulos que usa. Compare e teste 14 dias grátis.',
      canonical: 'https://zelopdv.com.br/vs-cardapio-web'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs Cardápio Web',
    h1: 'Zelo PDV vs Cardápio Web: comece em R$ 59, sem add-on em cima de add-on',
    subtitle:
      'O Cardápio Web é uma plataforma robusta de cardápio digital e automação de delivery, mas os planos partem de R$ 169/mês e funções como financeiro, fiscal e estoque avançado são cobradas à parte. O Zelo PDV começa em R$ 59/mês e funciona até offline.',
    editorialThesis:
      'O Cardápio Web é mais completo para cardápio digital e automação de delivery. O Zelo PDV é mais adequado quando o problema principal é caixa, fiado, estoque básico e preço previsível; não promete a mesma camada de automação de pedido online.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'a partir de R$ 169,99/mês',
      note: 'Preço do Cardápio Web consultado em junho de 2026: planos R$ 169,99 a R$ 269,99/mês na central de ajuda oficial (a home anuncia "a partir de ~R$ 135/mês"), com módulos adicionais cobrados à parte. Sujeito a alteração.'
    },
    introTitle: 'O preço que aparece não é o preço que você paga',
    introParagraphs: [
      'O Cardápio Web entrega cardápio digital, chatbot e automação de delivery — e faz isso bem. Mas o plano de entrada padrão fica em R$ 169,99/mês, e recursos como Gestão Financeira, Fiscal, Gestão de Entregas e Estoque Avançado são módulos pagos por cima do plano.',
      'Na prática, o valor que você vê no anúncio cresce conforme você ativa o que precisa. Para um negócio pequeno, isso vira uma conta difícil de prever. Some a isso que a plataforma é baseada em navegador, com relatos públicos de lentidão em fins de semana de pico.',
      'O Zelo PDV parte de R$ 59/mês com a frente de caixa, o fiado e o estoque já inclusos, e segue modular para quando você quiser crescer. E continua vendendo offline, sem depender de a internet aguentar o movimento do fim de semana.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e Cardápio Web, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Preço de entrada', competitor: 'A partir de R$ 169,99/mês', zelo: 'R$ 59/mês', advantage: 'zelo' },
      { feature: 'Financeiro, fiscal e estoque avançado', competitor: 'Módulos pagos à parte', zelo: 'Financeiro e estoque inclusos na base', advantage: 'zelo' },
      { feature: 'Funciona sem internet (offline)', competitor: 'Baseado em navegador; não anuncia offline', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Previsibilidade de preço', competitor: 'Cresce conforme add-ons', zelo: 'Base baixa + módulos claros', advantage: 'zelo' },
      { feature: 'Cardápio digital e automação de delivery', competitor: 'Forte nesse ponto', zelo: 'Foco em frente de caixa', advantage: 'competitor' }
    ],
    reasonsTitle: 'Por que pequenos negócios começam pelo Zelo PDV',
    reasons: [
      { icon: '💸', title: 'A partir de R$ 59 contra R$ 169+', description: 'O piso do Zelo é bem mais baixo que o plano de entrada do Cardápio Web — e já vem com caixa, fiado e estoque.' },
      { icon: '🧩', title: 'Menos add-on surpresa', description: 'No Cardápio Web, financeiro, fiscal e estoque avançado são pagos à parte. No Zelo, o essencial vem na base e os módulos são claros.' },
      { icon: '📶', title: 'Vende mesmo sem internet', description: 'O Cardápio Web é baseado em navegador, com relatos públicos de lentidão em fins de semana. O Zelo continua vendendo offline.' },
      { icon: '🙋', title: 'Suporte humano direto', description: 'No Zelo você fala direto com o time pelo WhatsApp para configurar e resolver dúvidas do dia a dia.' }
    ],
    fairnessNote:
      'Para ser justo: o Cardápio Web é bem avaliado e forte em cardápio digital e automação de delivery, com selo RA1000. Se a sua prioridade é exatamente isso, é uma boa ferramenta. Este comparativo é sobre preço, previsibilidade e operação offline.',
    faqSpecific: [
      { question: 'Quanto custa o Cardápio Web comparado ao Zelo PDV?', answer: 'Em junho de 2026, os planos do Cardápio Web vão de R$ 169,99 a R$ 269,99/mês (a home anuncia a partir de ~R$ 135/mês), com módulos extras cobrados à parte. O Zelo PDV custa R$ 59/mês com caixa, fiado e estoque inclusos.' },
      { question: 'No Cardápio Web eu pago a mais por financeiro e estoque?', answer: 'Conforme a central de ajuda oficial, Gestão Financeira, Fiscal, Gestão de Entregas e Estoque Avançado são módulos adicionais pagos sobre o plano. No Zelo PDV, o financeiro e o estoque já vêm na base.' },
      { question: 'O Zelo PDV funciona offline?', answer: 'Sim. O Zelo foi feito para continuar vendendo mesmo sem internet, sincronizando depois. O Cardápio Web é baseado em navegador e não anuncia modo offline.' },
      { question: 'O Zelo PDV faz cardápio digital como o Cardápio Web?', answer: 'O foco do Zelo é a frente de caixa e a gestão do negócio. Se o seu objetivo principal é cardápio digital e automação de delivery, o Cardápio Web é especializado nisso; se é controlar o caixa barato e offline, o Zelo resolve.' }
    ],
    sources: [
      { label: 'Cardápio Web — Planos (central de ajuda oficial)', url: 'https://ajuda.cardapioweb.com/boas-vindas/planos-funcionalidades-e-modulos-adicionais' },
      { label: 'Cardápio Web — Site oficial', url: 'https://cardapioweb.com/' },
      { label: 'Cardápio Web — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/cardapio-web-servicos-de-tecnologia/lista-reclamacoes/' }
    ],
    finalCtaTitle: 'Comece em R$ 59/mês, com o essencial já incluso',
    finalCtaText:
      'Teste o Zelo PDV por 14 dias grátis, sem cartão, e veja quanto você economiza começando com caixa, fiado e estoque já na base.'
  },

  yooga: {
    slug: 'vs-yooga',
    competitor: 'Yooga',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs Yooga: Sistema para Restaurante por R$ 59/mês | Zelo PDV',
      description:
        'Yooga parte de R$ 249/mês e é 100% online. Zelo PDV é R$ 59/mês, funciona offline e tem preço transparente. Compare e teste 14 dias grátis.',
      canonical: 'https://zelopdv.com.br/vs-yooga'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs Yooga',
    h1: 'Zelo PDV vs Yooga: a mesma operação de restaurante por uma fração do preço',
    subtitle:
      'A Yooga é um sistema de restaurante completo, mas o plano de entrada custa R$ 249/mês e a operação é 100% online. O Zelo PDV entrega frente de caixa, mesas, fiado e financeiro por R$ 59/mês, com preço transparente e funcionando offline.',
    editorialThesis:
      'A Yooga é um sistema maduro para restaurantes com operação mais estruturada. O Zelo PDV é mais simples e barato para pequeno negócio que precisa vender, controlar fiado e fechar caixa; em recursos avançados para redes, a Yooga fica à frente.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'a partir de R$ 249/mês',
      note: 'Preço da Yooga consultado no site oficial (yooga.com.br/planos) em junho de 2026: planos de R$ 249 a R$ 349/mês (plano Premium sob consulta). Sujeito a alteração.'
    },
    introTitle: 'Quando o sistema de restaurante custa mais que o necessário',
    introParagraphs: [
      'A Yooga é um produto maduro para restaurantes, com PDV, delivery, mesas e fiscal. Mas o ponto de partida é alto: o plano Básico custa R$ 249/mês e o Completo chega a R$ 349/mês. Para muita lanchonete, hamburgueria ou delivery próprio, isso é caro logo no começo.',
      'A operação também é cloud, sem modo offline documentado — e há relatos públicos de clientes no Reclame Aqui sobre cobrança acima do valor anunciado. Para um negócio pequeno, previsibilidade de preço e operar sem depender de internet fazem toda a diferença.',
      'O Zelo PDV parte de R$ 59/mês, com preço público e transparente, e funciona offline. Você tem a frente de caixa, o controle de fiado e o financeiro sem precisar pagar quatro vezes mais nem torcer para a internet não cair no pico.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e Yooga, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Preço de entrada', competitor: 'A partir de R$ 249/mês', zelo: 'R$ 59/mês', advantage: 'zelo' },
      { feature: 'Funciona sem internet (offline)', competitor: 'Não anuncia operação offline', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Previsibilidade de preço', competitor: 'Relatos públicos de cobrança acima do anunciado', zelo: 'Preço público fixo, sem surpresa', advantage: 'zelo' },
      { feature: 'Modelo de cobrança', competitor: 'Escada de planos por funcionalidade', zelo: 'Base + módulos opcionais', advantage: 'zelo' },
      { feature: 'Recursos avançados para rede (KDS, IA)', competitor: 'Disponível no plano Premium', zelo: 'Foco em pequeno e médio negócio', advantage: 'competitor' }
    ],
    reasonsTitle: 'Por que trocar a Yooga pelo Zelo PDV',
    reasons: [
      { icon: '💸', title: 'Cerca de 4x mais barato no piso', description: 'R$ 59/mês contra R$ 249/mês do plano de entrada da Yooga. Para quem está começando, é a conta de meses de sistema economizada.' },
      { icon: '📶', title: 'Vende mesmo sem internet', description: 'A Yooga não anuncia operação offline. O Zelo PDV continua registrando vendas sem conexão e sincroniza quando a internet volta.' },
      { icon: '🏷️', title: 'Preço transparente', description: 'Há relatos públicos de clientes da Yooga no Reclame Aqui sobre cobrança acima do anunciado. O Zelo comunica R$ 59/mês fixos, sem pegadinha.' },
      { icon: '🧩', title: 'Modular', description: 'Você ativa mesas, pedidos/cozinha ou acessos só quando precisar, em vez de subir de plano inteiro por uma função.' }
    ],
    fairnessNote:
      'Para ser justo: a Yooga é um sistema completo e tem recursos avançados (como KDS e IA no Premium) para operações maiores. Este comparativo é para quem busca preço de pequeno negócio, transparência e operação offline.',
    faqSpecific: [
      { question: 'Quanto custa a Yooga comparada ao Zelo PDV?', answer: 'Em junho de 2026, a Yooga divulga planos de R$ 249 a R$ 349/mês no site oficial (Premium sob consulta). O Zelo PDV custa R$ 59/mês fixos, com preço público.' },
      { question: 'A Yooga funciona offline?', answer: 'A Yooga não documenta modo offline; é um sistema cloud. O Zelo PDV foi feito para continuar vendendo mesmo sem internet.' },
      { question: 'O preço da Yooga é transparente?', answer: 'A Yooga publica seus planos, mas há relatos de clientes no Reclame Aqui sobre cobrança acima do valor anunciado. O Zelo PDV trabalha com preço público fixo de R$ 59/mês.' },
      { question: 'O Zelo PDV serve para restaurante com mesas?', answer: 'Sim. O Zelo tem módulo de mesas e comandas, além de frente de caixa, fiado e financeiro. Para redes grandes com necessidades muito específicas, a Yooga tem recursos voltados a esse perfil.' }
    ],
    sources: [
      { label: 'Yooga — Planos (oficial)', url: 'https://yooga.com.br/planos/' },
      { label: 'Yooga — Planos e preços (blog oficial)', url: 'https://blog.yooga.com.br/planos-e-precos/' },
      { label: 'Yooga — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/yooga-tecnologia/lista-reclamacoes/' }
    ],
    finalCtaTitle: 'Sistema de restaurante por R$ 59/mês, sem surpresa',
    finalCtaText:
      'Teste o Zelo PDV por 14 dias grátis, sem cartão, e compare na prática com o que você pagaria em um sistema de R$ 249/mês.'
  },

  sisfood: {
    slug: 'vs-sisfood',
    competitor: 'SisFood',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs SisFood: PDV Offline e Mais Barato | Zelo PDV',
      description:
        'SisFood parte de R$ 149/mês e é 100% cloud, dependendo de internet. Zelo PDV é R$ 59/mês e funciona offline. Compare e teste 14 dias grátis.',
      canonical: 'https://zelopdv.com.br/vs-sisfood'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs SisFood',
    h1: 'Zelo PDV vs SisFood: caixa que não para sem internet, por menos',
    subtitle:
      'O SisFood é um sistema completo para food service, mas parte de R$ 149,90/mês e, segundo a própria empresa, é 100% cloud e depende de internet estável. O Zelo PDV custa R$ 59/mês e foi feito para continuar vendendo mesmo offline.',
    editorialThesis:
      'O SisFood combina PDV, cardápio digital, robô de WhatsApp e módulos fiscais para food service. O Zelo PDV aposta em uma base menor, mais barata e com contingência offline para o balcão; quem precisa de fiscal/totem pode preferir o SisFood.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'a partir de R$ 149,90/mês',
      note: 'Preço do SisFood consultado no site oficial (sisfood.com.br) em junho de 2026: a partir de R$ 149,90/mês (a própria empresa cita planos superiores até cerca de R$ 249,90/mês). NFC-e, NF-e e totem são módulos à parte. Sujeito a alteração.'
    },
    introTitle: 'Internet estável nem sempre existe no horário de pico',
    introParagraphs: [
      'O SisFood entrega PDV, cardápio digital, robô de WhatsApp e fiscal em um pacote para restaurantes, partindo de R$ 149,90/mês. É um produto competente — mas a própria empresa descreve o sistema como 100% cloud, com dependência de internet estável e capacidade offline limitada.',
      'Para quem opera em bairro com sinal instável, ou enfrenta picos de movimento em que a rede engasga, isso é um risco real: se a internet cai, o caixa para. Além disso, módulos como NFC-e, NF-e e totem de autoatendimento são cobrados à parte.',
      'O Zelo PDV parte de R$ 59/mês e foi desenhado para o cenário oposto: continuar registrando vendas offline e sincronizar quando a conexão volta. Você não fica refém da internet nem do plano mais caro para ter o básico funcionando.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e SisFood, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Preço de entrada', competitor: 'A partir de R$ 149,90/mês', zelo: 'R$ 59/mês', advantage: 'zelo' },
      { feature: 'Funciona sem internet (offline)', competitor: '100% cloud, depende de internet estável (info da própria empresa)', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Modelo de cobrança', competitor: 'Núcleo "tudo incluído" + fiscal/totem à parte', zelo: 'Base + módulos opcionais', advantage: 'zelo' },
      { feature: 'Fidelidade', competitor: 'Sem fidelidade obrigatória', zelo: 'Cancele quando quiser', advantage: 'tie' },
      { feature: 'Totem de autoatendimento', competitor: 'Disponível (módulo à parte)', zelo: 'Foco em frente de caixa', advantage: 'competitor' }
    ],
    reasonsTitle: 'Por que o Zelo PDV é a escolha mais segura para o caixa',
    reasons: [
      { icon: '📶', title: 'Não para quando a internet cai', description: 'O próprio SisFood descreve o sistema como 100% cloud, dependente de internet estável. O Zelo PDV continua vendendo offline e sincroniza depois — sem caixa travado no pico.' },
      { icon: '💸', title: 'A partir de R$ 59 contra R$ 149,90', description: 'O piso do Zelo é menos da metade do plano de entrada do SisFood, já com a frente de caixa completa.' },
      { icon: '🧩', title: 'Modular', description: 'Você paga só pelos módulos que usa, em vez de um pacote "tudo incluído" mais caro com fiscal e totem cobrados à parte.' },
      { icon: '⚡', title: 'Simples de começar', description: 'O Zelo roda no navegador, em computador, notebook ou tablet básico, sem montar uma estrutura cara para vender.' }
    ],
    fairnessNote:
      'Para ser justo: o SisFood é um sistema completo de food service, com bom suporte e sem fidelidade obrigatória. O foco deste comparativo é preço de entrada e, principalmente, a operação offline — onde o Zelo PDV leva vantagem.',
    faqSpecific: [
      { question: 'Quanto custa o SisFood comparado ao Zelo PDV?', answer: 'Em junho de 2026, o SisFood parte de R$ 149,90/mês no site oficial (a própria empresa cita planos superiores até cerca de R$ 249,90/mês), com fiscal e totem à parte. O Zelo PDV custa R$ 59/mês com a frente de caixa inclusa.' },
      { question: 'O SisFood funciona offline?', answer: 'Segundo a própria empresa, o SisFood é 100% cloud e depende de internet estável, com capacidade offline limitada. O Zelo PDV foi feito para continuar vendendo mesmo sem internet, sincronizando depois.' },
      { question: 'No SisFood eu pago a mais por nota fiscal?', answer: 'Conforme o material do SisFood, NFC-e, NF-e e totem de autoatendimento são módulos cobrados à parte. No Zelo PDV, você ativa apenas os módulos que precisar sobre a base de R$ 59/mês.' },
      { question: 'Posso testar o Zelo PDV antes?', answer: 'Sim. São 14 dias grátis, sem cartão de crédito. Você cria a conta e usa a operação real do balcão durante o período.' }
    ],
    sources: [
      { label: 'SisFood — Site oficial', url: 'https://www.sisfood.com.br/' },
      { label: 'SisFood — Sistema PDV (oficial)', url: 'https://sisfood.com.br/saiba-mais/sistema-pdv/melhor-sistema-restaurante-otimizado' }
    ],
    finalCtaTitle: 'Um caixa que continua vendendo offline, por R$ 59/mês',
    finalCtaText:
      'Teste o Zelo PDV por 14 dias grátis, sem cartão, e veja a diferença de um sistema que não trava quando a internet cai.'
  },

  contaAzul: {
    slug: 'vs-conta-azul',
    competitor: 'Conta Azul',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs Conta Azul: PDV de Balcão x ERP Financeiro | Zelo PDV',
      description:
        'Conta Azul é um ERP financeiro/contábil a partir de R$ 159/mês e 100% online. Zelo PDV é frente de caixa de balcão por R$ 59/mês, offline. Entenda a diferença.',
      canonical: 'https://zelopdv.com.br/vs-conta-azul'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs Conta Azul',
    h1: 'Zelo PDV vs Conta Azul: PDV de balcão de verdade x ERP financeiro',
    subtitle:
      'A Conta Azul é um ERP forte em financeiro, fiscal e contábil — mas não é uma frente de caixa de balcão, e parte de R$ 159,90/mês (plano anual). O Zelo PDV é o caixa do seu comércio: vendas, fiado e estoque por R$ 59/mês, funcionando offline.',
    editorialThesis:
      'A Conta Azul é melhor quando a necessidade principal é ERP financeiro, fiscal e integração com contador. O Zelo PDV é melhor quando o problema está no balcão: vender rápido, controlar fiado e fechar caixa; não tenta substituir um ERP contábil completo.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'a partir de R$ 159,90/mês (plano anual)',
      note: 'Preço da Conta Azul consultado no site oficial (contaazul.com/planos) em junho de 2026: a partir de R$ 159,90/mês no plano anual, escalando a R$ 309,90, R$ 399,90 e R$ 719,90/mês por faixa de usuários. Sujeito a alteração.'
    },
    introTitle: 'ERP financeiro e PDV de balcão resolvem coisas diferentes',
    introParagraphs: [
      'A Conta Azul é conhecida e bem posicionada — mas é importante entender o que ela é: um ERP em nuvem com foco em gestão financeira, fiscal e contábil, integrada ao contador. Ela não é um terminal de venda de balcão pensado para bater caixa rápido no atendimento.',
      'Para o financeiro de uma empresa estruturada, faz sentido. Para um comércio que precisa registrar venda, controlar fiado e fechar o caixa no balcão, é uma ferramenta de outra finalidade — e mais cara, partindo de R$ 159,90/mês no plano anual e escalando rápido por faixa de usuários.',
      'O Zelo PDV é a frente de caixa do seu negócio: vendas ágeis, fiado, estoque e financeiro do dia a dia por R$ 59/mês, funcionando offline. Não é um ERP contábil — é o caixa que o balcão precisa, pelo preço que o pequeno negócio comporta.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e Conta Azul, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Frente de caixa de balcão', competitor: 'Não é o foco (ERP financeiro/contábil)', zelo: 'Sim — caixa, venda e fechamento nativos', advantage: 'zelo' },
      { feature: 'Preço de entrada', competitor: 'A partir de R$ 159,90/mês (anual)', zelo: 'R$ 59/mês', advantage: 'zelo' },
      { feature: 'Funciona sem internet (offline)', competitor: '100% nuvem, online-only', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Como o preço cresce', competitor: 'Salta por faixa de usuários (até R$ 719,90)', zelo: 'Base + módulos opcionais', advantage: 'zelo' },
      { feature: 'Gestão contábil e integração com contador', competitor: 'Forte nesse ponto', zelo: 'Foco em PDV e gestão do comércio', advantage: 'competitor' }
    ],
    reasonsTitle: 'Por que um comércio de balcão escolhe o Zelo PDV',
    reasons: [
      { icon: '🧾', title: 'É um PDV, não um ERP contábil', description: 'O Zelo foi feito para bater caixa no balcão: venda rápida, fiado e fechamento. A Conta Azul é um ERP financeiro/contábil, de outra finalidade.' },
      { icon: '💸', title: 'A partir de R$ 59 contra R$ 159,90', description: 'O Zelo custa menos da metade do plano de entrada da Conta Azul (anual) e não salta de preço a cada usuário a mais.' },
      { icon: '📶', title: 'Vende mesmo sem internet', description: 'A Conta Azul é 100% nuvem, online-only. O Zelo PDV continua registrando vendas offline e sincroniza quando a internet volta.' },
      { icon: '🙋', title: 'Suporte humano direto', description: 'No Zelo você fala direto com o time pelo WhatsApp para configurar e tirar dúvidas do dia a dia.' }
    ],
    fairnessNote:
      'Para ser justo: se a sua necessidade é gestão financeira, fiscal e contábil integrada ao contador, a Conta Azul é construída exatamente para isso. O ponto deste comparativo é que ela não substitui uma frente de caixa de balcão — e é aí que o Zelo PDV entra, por muito menos.',
    faqSpecific: [
      { question: 'A Conta Azul é um PDV de balcão?', answer: 'Não no sentido tradicional. A Conta Azul é um ERP com foco em gestão financeira, fiscal e contábil. Para bater caixa no balcão, controlar fiado e fechar o dia, o Zelo PDV é a ferramenta específica para isso.' },
      { question: 'Quanto custa a Conta Azul comparada ao Zelo PDV?', answer: 'Em junho de 2026, a Conta Azul parte de R$ 159,90/mês no plano anual, escalando a R$ 309,90, R$ 399,90 e R$ 719,90/mês por faixa de usuários. O Zelo PDV custa R$ 59/mês.' },
      { question: 'A Conta Azul funciona offline?', answer: 'Não. A Conta Azul é um ERP 100% em nuvem, online-only. O Zelo PDV foi feito para continuar vendendo mesmo sem internet.' },
      { question: 'Posso usar o Zelo PDV junto com um contador?', answer: 'O Zelo organiza o caixa, as vendas e o financeiro do dia a dia do comércio. Para a contabilidade em si, muitos negócios mantêm o contador com seus relatórios. O Zelo cobre a operação de balcão; a Conta Azul cobre a gestão contábil.' }
    ],
    sources: [
      { label: 'Conta Azul — Planos (oficial)', url: 'https://contaazul.com/planos/' },
      { label: 'Conta Azul — Sistema ERP (oficial)', url: 'https://contaazul.com/sistema-erp/' },
      { label: 'Conta Azul — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/contaazul/lista-reclamacoes/' }
    ],
    finalCtaTitle: 'A frente de caixa do seu balcão por R$ 59/mês',
    finalCtaText:
      'Teste o Zelo PDV por 14 dias grátis, sem cartão, e tenha um caixa rápido e offline — sem pagar por um ERP contábil que você não vai usar no balcão.'
  },

  gestaoClick: {
    slug: 'vs-gestaoclick',
    competitor: 'GestãoClick',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs GestãoClick: Comece em R$ 59, Modular e Offline | Zelo PDV',
      description:
        'GestãoClick parte de R$ 119/mês (sem nota fiscal no plano de entrada). Zelo PDV é R$ 59/mês, modular e funciona offline. Compare e teste 14 dias grátis.',
      canonical: 'https://zelopdv.com.br/vs-gestaoclick'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs GestãoClick',
    h1: 'Zelo PDV vs GestãoClick: PDV de balcão a partir de R$ 59, modular',
    subtitle:
      'A GestãoClick é um ERP bem avaliado para gestão de empresas, mas o plano de entrada custa R$ 119/mês e nem emite nota fiscal. O Zelo PDV foca na frente de caixa do comércio e do food service por R$ 59/mês, modular e funcionando offline.',
    editorialThesis:
      'A GestãoClick é um ERP amplo para gestão de empresa. O Zelo PDV é uma frente de caixa mais enxuta para comércio e food service, com preço menor e offline; se você precisa de contratos, orçamentos e gestão empresarial completa, a GestãoClick cobre mais terreno.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'a partir de R$ 119/mês',
      note: 'Preço da GestãoClick consultado no site oficial (gestaoclick.com.br/planos-erp) em junho de 2026: Bronze R$ 119/mês (sem emissão de NF-e), Prata R$ 199, Ouro R$ 289, Platina R$ 379/mês. Sujeito a alteração.'
    },
    introTitle: 'Um ERP completo nem sempre é o que o balcão precisa',
    introParagraphs: [
      'A GestãoClick é um ERP brasileiro amplo e bem avaliado, com gestão comercial, financeira, estoque e NF-e. O plano de entrada (Bronze) custa R$ 119/mês — e nesse plano a emissão de nota fiscal nem está inclusa, o que empurra muitos negócios para o Prata, a R$ 199/mês.',
      'Para um comércio de bairro ou food service que quer, antes de tudo, uma frente de caixa simples e barata, começar em R$ 119 (ou R$ 199 com nota) é um ponto de partida alto. E a operação é 100% online — não há menção a modo offline.',
      'O Zelo PDV parte de R$ 59/mês com a frente de caixa, o fiado e o estoque inclusos, e é modular: você ativa o que precisar conforme cresce. E continua vendendo offline, sem depender de a internet aguentar o movimento.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e GestãoClick, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Preço de entrada', competitor: 'A partir de R$ 119/mês (sem NF-e)', zelo: 'R$ 59/mês', advantage: 'zelo' },
      { feature: 'Funciona sem internet (offline)', competitor: '100% online; não anuncia offline', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Modelo de cobrança', competitor: 'Degraus de plano por usuários/empresas', zelo: 'Base baixa + módulos opcionais', advantage: 'zelo' },
      { feature: 'Foco', competitor: 'ERP de gestão amplo', zelo: 'Frente de caixa para comércio e food service', advantage: 'tie' },
      { feature: 'Gestão completa de empresa (contratos, orçamentos)', competitor: 'Forte nesse ponto', zelo: 'Foco no caixa e no essencial', advantage: 'competitor' }
    ],
    reasonsTitle: 'Por que começar pelo Zelo PDV',
    reasons: [
      { icon: '💸', title: 'Piso de R$ 59 contra R$ 119', description: 'O Zelo começa por menos da metade do plano de entrada da GestãoClick — e já vem com caixa, fiado e estoque.' },
      { icon: '🧩', title: 'Modular de verdade', description: 'Você paga só pelos módulos que usa, em vez de subir de degrau de ERP para liberar funções.' },
      { icon: '📶', title: 'Vende mesmo sem internet', description: 'A GestãoClick é 100% online e não anuncia modo offline. O Zelo PDV continua vendendo sem conexão e sincroniza depois.' },
      { icon: '🍔', title: 'Pensado para balcão e food service', description: 'O Zelo é focado na frente de caixa de comércio e alimentação, não em ser um ERP de gestão amplo.' }
    ],
    fairnessNote:
      'Para ser justo: a GestãoClick é um ERP bem avaliado, com suporte de boa reputação e preço fixo que não cresce com o seu faturamento. Se você precisa de um ERP de gestão completo, é uma boa opção. Este comparativo é para quem quer, antes de tudo, uma frente de caixa simples, barata e offline.',
    faqSpecific: [
      { question: 'Quanto custa a GestãoClick comparada ao Zelo PDV?', answer: 'Em junho de 2026, a GestãoClick parte de R$ 119/mês (Bronze, sem NF-e), indo a R$ 199, R$ 289 e R$ 379/mês. O Zelo PDV custa R$ 59/mês com caixa, fiado e estoque inclusos.' },
      { question: 'O plano de entrada da GestãoClick emite nota fiscal?', answer: 'Conforme a página oficial de planos, o plano Bronze (R$ 119/mês) não inclui emissão de NF-e — ela passa a estar disponível a partir do Prata (R$ 199/mês). No Zelo PDV, o foco é a frente de caixa completa por R$ 59/mês.' },
      { question: 'A GestãoClick funciona offline?', answer: 'A GestãoClick se posiciona como 100% online e não anuncia operação offline. O Zelo PDV foi feito para continuar vendendo mesmo sem internet.' },
      { question: 'O Zelo PDV substitui um ERP completo?', answer: 'O Zelo cobre muito bem a frente de caixa, o fiado, o estoque e o financeiro do dia a dia do comércio. Se você precisa de um ERP de gestão amplo, com contratos e orçamentos, a GestãoClick é mais abrangente. Para o balcão, o Zelo resolve por muito menos.' }
    ],
    sources: [
      { label: 'GestãoClick — Planos (oficial)', url: 'https://gestaoclick.com.br/planos-erp/' },
      { label: 'GestãoClick — Sistema PDV (oficial)', url: 'https://gestaoclick.com.br/sistema-pdv-completo/' },
      { label: 'GestãoClick — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/gestao-click/lista-reclamacoes/' }
    ],
    finalCtaTitle: 'Frente de caixa a partir de R$ 59/mês, modular',
    finalCtaText:
      'Teste o Zelo PDV por 14 dias grátis, sem cartão, e veja como começar barato com caixa, fiado e estoque já inclusos.'
  },

  bling: {
    slug: 'vs-bling',
    competitor: 'Bling',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs Bling: Caixa Offline e Preço Previsível | Zelo PDV',
      description:
        'O Bling é online e o custo escala por volume de pedidos. Zelo PDV é R$ 59/mês, funciona offline e tem preço previsível. Compare e teste 14 dias grátis.',
      canonical: 'https://zelopdv.com.br/vs-bling'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs Bling',
    h1: 'Zelo PDV vs Bling: caixa offline e preço que não escala por trás',
    subtitle:
      'O Bling é um ERP forte para e-commerce, mas o PDV é 100% online e o custo cresce conforme o volume de pedidos. O Zelo PDV é uma frente de caixa de balcão por R$ 59/mês, com preço previsível e funcionando offline.',
    editorialThesis:
      'O Bling é forte para marketplace, e-commerce e integração multicanal. O Zelo PDV faz mais sentido para balcão e food service que precisam de caixa offline e preço previsível; se marketplace é o centro do negócio, o Bling é mais completo.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'de R$ 55 a R$ 650+/mês, conforme o volume',
      note: 'Preço do Bling consultado no site oficial (bling.com.br/planos-e-precos) em junho de 2026: Cobalto R$ 55, Titânio a partir de R$ 120, Diamante R$ 650/mês, com o plano determinado pelo volume de pedidos importados por mês. Sujeito a alteração.'
    },
    introTitle: 'O preço de entrada barato pode não continuar barato',
    introParagraphs: [
      'O Bling é um dos ERPs mais conhecidos do Brasil, especialmente para quem vende em marketplaces e e-commerce. O plano de entrada (Cobalto) custa R$ 55/mês — mas o que define o seu plano é o volume de pedidos importados por mês, então o custo sobe em degraus conforme o negócio cresce, podendo chegar a R$ 650/mês no Diamante.',
      'Há um ponto crítico para quem usa o PDV no balcão: o Bling é um sistema online e, conforme a documentação da própria empresa, não possui módulo offline ou de contingência — a ponto de recomendar uma segunda conexão de internet de backup. Se a internet cai, o caixa para.',
      'O Zelo PDV é o contrário em dois pontos que importam para o balcão: o preço é previsível (R$ 59/mês, sem escalar por volume de pedidos por trás) e a operação continua funcionando offline, sincronizando quando a internet volta.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e Bling, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Funciona sem internet (offline)', competitor: 'Sem módulo offline; recomenda 2ª internet de backup', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Previsibilidade de preço', competitor: 'Custo escala por volume de pedidos (até R$ 650+)', zelo: 'R$ 59/mês previsível', advantage: 'zelo' },
      { feature: 'Foco', competitor: 'ERP de e-commerce/marketplace', zelo: 'Frente de caixa de balcão e food service', advantage: 'zelo' },
      { feature: 'Preço de entrada', competitor: 'Cobalto R$ 55/mês', zelo: 'R$ 59/mês', advantage: 'tie' },
      { feature: 'Integração com marketplaces (Mercado Livre, Shopee...)', competitor: 'Forte nesse ponto', zelo: 'Não é o foco', advantage: 'competitor' }
    ],
    reasonsTitle: 'Por que o Zelo PDV é melhor para o balcão',
    reasons: [
      { icon: '📶', title: 'Vende mesmo sem internet', description: 'Conforme a própria documentação, o Bling não tem módulo offline e recomenda uma segunda internet de backup. O Zelo PDV continua vendendo offline e sincroniza depois.' },
      { icon: '🏷️', title: 'Preço previsível', description: 'No Bling, o custo cresce por volume de pedidos importados, com histórico de upgrades de plano. O Zelo é R$ 59/mês, sem escalar por trás.' },
      { icon: '🍔', title: 'Feito para o balcão', description: 'O Bling é um ERP orientado a e-commerce e marketplace. O Zelo é focado na frente de caixa de comércio e food service — simples e direto.' },
      { icon: '🧩', title: 'Modular', description: 'Você ativa só os módulos que precisa, sobre uma base barata, em vez de subir de tier por volume.' }
    ],
    fairnessNote:
      'Para ser justo: se você vende em vários marketplaces e precisa de emissão fiscal e integração multicanal, o Bling é forte exatamente nisso. Este comparativo é para quem quer uma frente de caixa de balcão, com preço previsível e operação offline.',
    faqSpecific: [
      { question: 'O Bling funciona offline?', answer: 'Conforme a documentação da própria empresa, o Bling é um sistema online, sem módulo offline ou de contingência, e chega a recomendar uma segunda conexão de internet de backup. O Zelo PDV foi feito para continuar vendendo mesmo sem internet.' },
      { question: 'Quanto custa o Bling comparado ao Zelo PDV?', answer: 'Em junho de 2026, o Bling vai de R$ 55/mês (Cobalto) a R$ 650/mês (Diamante), com o plano determinado pelo volume de pedidos importados. O Zelo PDV custa R$ 59/mês, com preço previsível que não escala por volume.' },
      { question: 'O preço do Bling sobe sozinho?', answer: 'O plano do Bling é definido pelo volume de pedidos importados por mês; ao ultrapassar o limite, o cliente sobe de plano. Há relatos públicos de clientes no Reclame Aqui sobre aumentos de mensalidade. O Zelo PDV mantém R$ 59/mês previsíveis.' },
      { question: 'O Zelo PDV integra com marketplaces como o Bling?', answer: 'Integração multicanal com marketplaces é a especialidade do Bling. O Zelo é focado na frente de caixa de balcão e food service; ele permite registrar vendas de plataformas com a taxa configurada, mas não é um hub de marketplace.' }
    ],
    sources: [
      { label: 'Bling — Planos e preços (oficial)', url: 'https://www.bling.com.br/planos-e-precos' },
      { label: 'Bling — Frente de caixa (oficial)', url: 'https://www.bling.com.br/funcionalidades/frente-de-caixa' },
      { label: 'Bling — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/bling/lista-reclamacoes/' }
    ],
    finalCtaTitle: 'Um caixa offline e previsível por R$ 59/mês',
    finalCtaText:
      'Teste o Zelo PDV por 14 dias grátis, sem cartão, e tenha uma frente de caixa que não para sem internet nem sobe de preço por trás.'
  },

  tiny: {
    slug: 'vs-tiny',
    competitor: 'Tiny',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs Tiny (Olist): PDV de Balcão Offline por R$ 59 | Zelo PDV',
      description:
        'O Tiny escala de R$ 66 a R$ 948/mês e é online. Zelo PDV é R$ 59/mês, funciona offline e foca no balcão. Compare e teste 14 dias grátis.',
      canonical: 'https://zelopdv.com.br/vs-tiny'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs Tiny',
    h1: 'Zelo PDV vs Tiny: frente de caixa de balcão, sem ERP de marketplace',
    subtitle:
      'O Tiny (Olist) é um ERP completo para quem vende em marketplace e e-commerce, com planos que escalam de R$ 66 a R$ 948/mês. O Zelo PDV é a frente de caixa de balcão do seu comércio por R$ 59/mês, funcionando offline.',
    editorialThesis:
      'O Tiny é construído para operação de marketplace e e-commerce com emissão fiscal multicanal. O Zelo PDV é mais simples para o balcão físico e food service, com caixa offline e preço baixo; não substitui um hub multicanal.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'de R$ 66 a R$ 948/mês',
      note: 'Preço do Tiny (Olist) consultado no site oficial (olist.com/planos) em junho de 2026: planos de R$ 66 (Avance) a R$ 948/mês (Domine), com faixa topo sob consulta. Sujeito a alteração.'
    },
    introTitle: 'Um ERP de e-commerce é mais do que um balcão precisa',
    introParagraphs: [
      'O Tiny, hoje Olist Tiny, é um ERP forte para quem vende em marketplaces: emissão fiscal, estoque multicanal e integração com dezenas de plataformas. Mas isso tem um preço que escala em saltos grandes — de R$ 66/mês no plano de entrada até R$ 948/mês nos planos maiores, conforme volume de anúncios e armazenamento.',
      'Para um comércio de balcão ou food service que só quer registrar vendas, controlar fiado e fechar o caixa, boa parte desse ERP é recurso que você paga e não usa. E a operação é online, sem modo offline documentado para a frente de caixa.',
      'O Zelo PDV é focado no balcão: caixa, fiado, estoque e financeiro do dia a dia por R$ 59/mês, com preço previsível e funcionando offline. Você não paga por hub de marketplace e governança fiscal que o seu balcão não precisa.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e Tiny, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Preço', competitor: 'De R$ 66 a R$ 948/mês', zelo: 'R$ 59/mês', advantage: 'zelo' },
      { feature: 'Funciona sem internet (offline)', competitor: 'Online; não documenta offline', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Foco', competitor: 'ERP de e-commerce/marketplace', zelo: 'Frente de caixa de balcão e food service', advantage: 'zelo' },
      { feature: 'Como o preço cresce', competitor: 'Saltos por anúncios e armazenamento', zelo: 'Base + módulos opcionais', advantage: 'zelo' },
      { feature: 'Integração com marketplaces e NF multicanal', competitor: 'Forte nesse ponto', zelo: 'Não é o foco', advantage: 'competitor' }
    ],
    reasonsTitle: 'Por que o Zelo PDV faz mais sentido para o balcão',
    reasons: [
      { icon: '💸', title: 'R$ 59 fixos contra R$ 66 a R$ 948', description: 'O Zelo tem piso menor e não escala em saltos grandes de plano conforme o seu volume.' },
      { icon: '📶', title: 'Vende mesmo sem internet', description: 'O Tiny opera online e não documenta modo offline para a frente de caixa. O Zelo PDV continua vendendo sem conexão e sincroniza depois.' },
      { icon: '🍔', title: 'Feito para o balcão', description: 'O Tiny é um ERP de e-commerce e marketplace. O Zelo é focado na frente de caixa de comércio e food service — sem cobrar pelo que o balcão não usa.' },
      { icon: '🧩', title: 'Modular', description: 'Você ativa só os módulos que precisa, sobre uma base barata, em vez de subir de plano por anúncios e armazenamento.' }
    ],
    fairnessNote:
      'Para ser justo: se o seu negócio vive de marketplace e e-commerce, com NF multicanal e integração com dezenas de plataformas, o Tiny é construído para isso. Este comparativo é para quem quer uma frente de caixa de balcão, barata e offline.',
    faqSpecific: [
      { question: 'Quanto custa o Tiny comparado ao Zelo PDV?', answer: 'Em junho de 2026, o Tiny (Olist) vai de R$ 66/mês (Avance) a R$ 948/mês (Domine), com faixa topo sob consulta, escalando por anúncios e armazenamento. O Zelo PDV custa R$ 59/mês com preço previsível.' },
      { question: 'O Tiny funciona offline?', answer: 'O Tiny opera 100% online e não documenta operação offline para a frente de caixa. O Zelo PDV foi feito para continuar vendendo mesmo sem internet.' },
      { question: 'O Zelo PDV serve para quem vende em marketplace?', answer: 'O Tiny é especializado em e-commerce e marketplace, com integração multicanal. O Zelo é focado no balcão e no food service; ele registra vendas de plataformas com a taxa configurada, mas não é um hub de marketplace.' },
      { question: 'Posso testar o Zelo PDV antes?', answer: 'Sim. São 14 dias grátis, sem cartão de crédito. Você cria a conta e usa a operação real do balcão durante o período.' }
    ],
    sources: [
      { label: 'Tiny / Olist — Planos (oficial)', url: 'https://olist.com/planos/' },
      { label: 'Tiny — Nota fiscal (oficial)', url: 'https://tiny.com.br/recursos/nota-fiscal' },
      { label: 'Olist / Tiny — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/olist-oficial/lista-reclamacoes/' }
    ],
    finalCtaTitle: 'Frente de caixa de balcão por R$ 59/mês',
    finalCtaText:
      'Teste o Zelo PDV por 14 dias grátis, sem cartão, e tenha um caixa offline e barato, sem pagar por um ERP de marketplace.'
  },

  omie: {
    slug: 'vs-omie',
    competitor: 'Omie',
    priceCheckedAt: 'junho de 2026',
    meta: {
      title: 'Zelo PDV vs Omie: Preço Público x Cotação por Faturamento | Zelo PDV',
      description:
        'A Omie não publica preço e cobra por faixa de faturamento, com módulos à parte. Zelo PDV é R$ 59/mês público e funciona offline. Compare e teste 14 dias grátis.',
      canonical: 'https://zelopdv.com.br/vs-omie'
    },
    heroBadge: 'Comparativo honesto · Zelo PDV vs Omie',
    h1: 'Zelo PDV vs Omie: preço público de R$ 59 x cotação por faturamento',
    subtitle:
      'A Omie é um ERP completo para PME, mas não publica preço: o valor é cotado por faixa de faturamento e cresce com módulos. O Zelo PDV é uma frente de caixa de balcão por R$ 59/mês, com preço público e funcionando offline.',
    editorialThesis:
      'A Omie é um ERP robusto para PME estruturada, com fiscal, financeiro e contador no centro. O Zelo PDV é uma escolha mais direta para pequeno negócio que quer preço público, frente de caixa e offline; quem precisa de ERP completo pode ficar melhor na Omie.',
    priceAnchor: {
      zelo: 'R$ 59/mês',
      competitor: 'preço sob cotação por faturamento',
      note: 'A Omie não publica valor na página de preços (omie.com.br/precos): o preço é cotado por faixa de faturamento e cresce com módulos pagos. Material da própria empresa cita entrada a partir de cerca de R$ 99/mês; análises de terceiros estimam custo real bem maior. Consultado em junho de 2026, sujeito a alteração.'
    },
    introTitle: 'Quando você nem sabe o preço sem falar com vendas',
    introParagraphs: [
      'A Omie é um ERP robusto, com financeiro, fiscal, vendas e integração com contador. Mas há uma barreira logo no começo: a página de preços não mostra valor — você informa o faturamento e o preço é cotado por faixa, crescendo conforme você ativa módulos adicionais.',
      'Para um pequeno comércio ou food service, isso é o oposto de transparente. Você não consegue comparar o custo sem passar por um processo comercial, e o produto é um ERP amplo, online, dimensionado para uma gestão que o balcão simples não precisa.',
      'O Zelo PDV mostra o preço na tela: R$ 59/mês, público, sem cotação por faturamento. É a frente de caixa do seu negócio, funcionando offline, e você testa 14 dias sem falar com ninguém.'
    ],
    comparisonIntro:
      'Comparação ponto a ponto entre Zelo PDV e Omie, com base no que cada um divulga publicamente em junho de 2026.',
    comparisonRows: [
      { feature: 'Preço público no site', competitor: 'Não — cotação por faixa de faturamento', zelo: 'R$ 59/mês, público', advantage: 'zelo' },
      { feature: 'Como o preço cresce', competitor: 'Por faturamento + módulos pagos', zelo: 'Base + módulos opcionais claros', advantage: 'zelo' },
      { feature: 'Funciona sem internet (offline)', competitor: '100% online', zelo: 'Continua vendendo offline e sincroniza depois', advantage: 'zelo' },
      { feature: 'Foco', competitor: 'ERP de gestão amplo por porte', zelo: 'Frente de caixa de balcão e food service', advantage: 'zelo' },
      { feature: 'Gestão fiscal e contábil robusta para PME estruturada', competitor: 'Forte nesse ponto', zelo: 'Foco no caixa e no essencial', advantage: 'competitor' }
    ],
    reasonsTitle: 'Por que o pequeno negócio prefere o Zelo PDV',
    reasons: [
      { icon: '🏷️', title: 'Preço público, sem cotação', description: 'A Omie não publica preço e cota por faturamento. O Zelo mostra R$ 59/mês na tela e você cria a conta na hora, sem falar com vendas.' },
      { icon: '💸', title: 'Custo previsível', description: 'Na Omie, o preço cresce por faturamento e por módulos pagos. O Zelo mantém uma base baixa e módulos opcionais claros.' },
      { icon: '📶', title: 'Vende mesmo sem internet', description: 'A Omie é 100% online. O Zelo PDV continua registrando vendas offline e sincroniza quando a internet volta.' },
      { icon: '🍔', title: 'Feito para o balcão', description: 'A Omie é um ERP amplo, dimensionado por porte. O Zelo é focado na frente de caixa de comércio e food service — sem overkill.' }
    ],
    fairnessNote:
      'Para ser justo: se você é uma PME estruturada que precisa de gestão fiscal e contábil robusta integrada ao contador, a Omie é construída para isso. Este comparativo é para o pequeno negócio que quer preço transparente, uma frente de caixa simples e operação offline.',
    faqSpecific: [
      { question: 'Quanto custa a Omie comparada ao Zelo PDV?', answer: 'A Omie não publica preço: o valor é cotado por faixa de faturamento e cresce com módulos. Material da própria empresa cita entrada a partir de cerca de R$ 99/mês, e análises de terceiros estimam custo real bem maior. O Zelo PDV custa R$ 59/mês, com preço público.' },
      { question: 'Preciso falar com vendedor para saber o preço da Omie?', answer: 'Na prática sim: a página de preços da Omie pede o faturamento e cota o valor por faixa. No Zelo PDV o preço de R$ 59/mês é público e você cria a conta na hora.' },
      { question: 'A Omie funciona offline?', answer: 'A Omie é um ERP 100% online. O Zelo PDV foi feito para continuar vendendo mesmo sem internet, sincronizando depois.' },
      { question: 'O Zelo PDV substitui um ERP como a Omie?', answer: 'O Zelo cobre a frente de caixa, o fiado, o estoque e o financeiro do dia a dia do comércio. Se você precisa de um ERP completo de gestão fiscal e contábil por porte, a Omie é mais abrangente. Para o balcão, o Zelo resolve com preço transparente e muito mais barato.' }
    ],
    sources: [
      { label: 'Omie — Preços (oficial)', url: 'https://www.omie.com.br/precos/' },
      { label: 'Omie — Sistema ERP (oficial)', url: 'https://www.omie.com.br/sistema-erp/' },
      { label: 'Omie — Reclame Aqui (relatos de clientes)', url: 'https://www.reclameaqui.com.br/empresa/omiexperience/lista-reclamacoes/' }
    ],
    finalCtaTitle: 'Preço público de R$ 59/mês, sem cotação',
    finalCtaText:
      'Teste o Zelo PDV por 14 dias grátis, sem cartão, e tenha uma frente de caixa transparente e offline — sem precisar pedir orçamento para saber quanto custa.'
  }
};

export function buildComparisonFaqSchema(comparison) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: comparison.faqSpecific.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };
}
