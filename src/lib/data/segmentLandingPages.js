import {
  buildFaqSchema as buildGenericFaqSchema,
  buildSoftwareApplicationSchema,
  buildWebPageSchema,
  SITE_URL
} from '$lib/seo/site';
import { ADDONS, PLANS, TRIAL_DAYS } from '$lib/pricing';

// Campo `updatedAt` (string 'YYYY-MM-DD', obrigatório em cada entrada de
// segmentPages): data da última revisão de conteúdo. Vem da data máxima de
// `git blame` sobre o bloco da entrada — não inventar. Alimenta a linha
// "Atualizado em ..." em src/routes/para-[slug]/+page.svelte, o dateModified
// do WebPage JSON-LD (buildWebPageSchemaForSegment abaixo) e o <lastmod> da
// URL em src/routes/sitemap.xml/+server.js.

// Entradas novas (açaí, pizzaria, food truck, marmitaria) interpolam preço de
// pricing.js em vez de hardcodar — ver CLAUDE.md "evite hardcoded".
const BASE_PRICE = `R$ ${PLANS.pdv.price.toFixed(0)}`;
const MENU_PRICE = `R$ ${ADDONS.menu.price.toFixed(0)}`;
const MESAS_PRICE = `R$ ${ADDONS.mesas.price.toFixed(0)}`;

// Mantido com o mesmo nome de export por compatibilidade — agora derivado de
// PLANS/ADDONS via src/lib/seo/site.js (ver CLAUDE.md: preço só sai de pricing.js).
export const softwareApplicationSchema = buildSoftwareApplicationSchema({
  description: 'Sistema de gestão e frente de caixa para pequenos negócios de alimentação.'
});

export const generalFaqs = [
  {
    question: 'Preciso de computador potente?',
    answer:
      'Não. O Zelo PDV roda direto no navegador e funciona em computador, notebook e tablet básicos. Para muitos negócios, isso já resolve sem compra de equipamento novo.'
  },
  {
    question: 'Como funciona os 14 dias grátis?',
    answer:
      'Você cria a conta e usa o sistema por quatorze dias completos, sem precisar cadastrar cartão. São duas semanas de operação real, com movimento de semana e de fim de semana, para você decidir com dado e não com achismo. Se assinar e quiser cancelar depois, pode fazer isso a qualquer momento.'
  },
  {
    question: 'Funciona no celular?',
    answer:
      'Sim. O Zelo PDV funciona em Android e iPhone pelo navegador e pode ser adicionado à tela inicial. Isso ajuda bastante quem precisa vender, conferir caixa e lançar despesas sem ficar preso ao balcão.'
  },
  {
    question: 'Se eu tiver dúvidas, tem suporte?',
    answer:
      'Sim. O suporte é feito pelo WhatsApp em horário comercial, com ajuda para configuração, dúvidas do dia a dia e adaptação da rotina do negócio.'
  }
];

export const segmentPages = {
  lanchonetes: {
    slug: 'para-lanchonetes',
    updatedAt: '2026-09-23',
    meta: {
      title: 'Sistema PDV para Lanchonete — Caixa, Fiado e Lucro Real | Zelo PDV',
      description:
        'Sistema PDV para lanchonete simples e sem mensalidade surpresa. Controle caixa, fiado e veja o lucro real do seu negócio. Teste grátis 14 dias, sem cartão de crédito, sem instalar nada.',
      canonical: `${SITE_URL}/para-lanchonetes`
    },
    segmentName: 'lanchonetes',
    heroBadge: 'Feito para balcão, caixa e retaguarda',
    h1: 'Sistema PDV para Lanchonete: Caixa, Estoque e Fiado em Um Só Lugar',
    subtitle:
      'Registre pedidos rápido, acompanhe o caixa, organize o fiado e saiba quanto realmente sobrou no fim do dia. Tudo no navegador, sem instalar programa e sem depender de planilha.',
    highlights: [
      'Caixa simples para balcão e retirada',
      'Fiado organizado sem caderno',
      'Lucro real com despesas lançadas',
      'Vendas por iFood, Rappi e outras plataformas de delivery com taxa configurável'
    ],
    problemTitle: 'Quando a lanchonete vende, mas o caixa continua confuso',
    problemParagraphs: [
      'Em muita lanchonete pequena, o atendimento corre bem no balcão, mas o controle fica para depois. O pedido sai, o dinheiro entra, alguém anota parte do movimento no papel e, no fim do dia, sobra a sensação de que faltou alguma coisa no fechamento.',
      'Também é comum o fiado virar dor de cabeça. Um cliente leva hoje, promete pagar amanhã, o valor vai para um caderno ou para o bloco do celular e, depois de alguns dias, ninguém sabe ao certo quem deve, quanto deve e se aquilo ainda vai voltar para o caixa.',
      'O problema não é falta de trabalho. É falta de um backoffice simples, direto e barato o suficiente para a realidade de uma lanchonete de bairro. O Zelo PDV nasce exatamente nesse ponto: organizar pedidos, caixa, despesas e fiado sem te empurrar um sistema complicado.'
    ],
    problemPoints: [
      {
        label: 'Fechamento do dia',
        value: 'Sai no papel e quase sempre fica uma dúvida sobre o que entrou de verdade.'
      },
      {
        label: 'Fiado',
        value: 'Sem histórico claro, o caderninho vira perda de dinheiro e constrangimento na cobrança.'
      },
      {
        label: 'Lucro',
        value: 'Vender bem não basta quando você não enxerga despesas, retiradas e sobra real.'
      }
    ],
    featuresTitle: 'Sistema PDV para Lanchonete: o que precisa no balcão e no caixa',
    featuresIntro:
      'A rotina da lanchonete pede agilidade no atendimento e clareza na retaguarda. Por isso, o Zelo junta frente de caixa, fiado, estoque e gestão financeira em uma operação simples de aprender.',
    features: [
      {
        icon: '⚡',
        title: 'Frente de caixa rápida',
        description:
          'Registre pedidos em poucos toques, finalize rápido e siga para o próximo atendimento. A tela foi pensada para balcão, retirada e horários de pico, quando ninguém pode perder tempo.'
      },
      {
        icon: '📒',
        title: 'Controle de fiado digital',
        description:
          'Cadastre clientes, acompanhe limite, consulte histórico e saiba exatamente quem está devendo. Assim o fiado deixa de ficar espalhado em caderno, conversa de WhatsApp ou memória.'
      },
      {
        icon: '📦',
        title: 'Produtos e estoque em ordem',
        description:
          'Monte seu cardápio, organize categorias e acompanhe os itens que precisam de mais atenção. Isso ajuda a evitar ruptura, compra no susto e confusão na hora de vender.'
      },
      {
        icon: '📱',
        title: 'Cardápio online com publicação do estoque',
        description:
          'Publique os produtos direto do estoque no cardápio digital do seu negócio. Clientes acessam o menu pelo celular, veem preços e variações. Sem cadastro paralelo, sem taxa por pedido, sem imprimir cardápio de novo.'
      },
      {
        icon: '💰',
        title: 'Lucro real no fim do dia',
        description:
          'Lance despesas, acompanhe entradas e enxergue o resultado da operação com mais clareza. Em vez de olhar só para o faturamento, você passa a entender o que realmente sobrou.'
      },
      {
        icon: '📲',
        title: 'Vendas de plataformas com taxa embutida',
        description:
          'Registre vendas do iFood, Rappi e outros apps direto no caixa, com a taxa da plataforma já configurada. Assim você sabe na hora quanto recebeu de verdade, sem surpresa no extrato.'
      }
    ],
    howTitle: 'Como funciona na rotina da sua lanchonete',
    howIntro:
      'A ideia é sair do improviso sem criar burocracia. Em poucos passos, a lanchonete começa a vender e controlar melhor a retaguarda.',
    steps: [
      {
        title: 'Cadastre cardápio e clientes principais',
        description:
          'Você coloca os produtos mais vendidos, ajusta preços e já deixa pronta a base de clientes que costumam comprar no fiado ou pedir sempre as mesmas coisas.'
      },
      {
        title: 'Registre pedidos durante o movimento',
        description:
          'No balcão, o pedido entra rápido, o pagamento fica registrado e o comprovante pode ser enviado no WhatsApp. Isso reduz fila e evita esquecimentos no caixa.'
      },
      {
        title: 'Feche o dia com mais segurança',
        description:
          'Ao lançar despesas e conferir o movimento, você enxerga vendas, fiado, retiradas e lucro com muito mais segurança do que no papel.'
      }
    ],
    faqSpecific: [
      {
        question: 'O Zelo PDV funciona para lanchonete pequena?',
        answer:
          'Sim. O Zelo PDV foi criado especialmente para lanchonetes pequenas e médias que precisam de controle de caixa simples, sem sistemas complexos ou caros.'
      },
      {
        question: 'Consigo controlar o fiado dos meus clientes?',
        answer:
          'Sim. O sistema tem carteira de clientes integrada para você acompanhar histórico, limite e saldo de cada cliente com muito mais clareza do que no caderno.'
      },
      {
        question: 'Meus clientes podem ver o cardápio pelo celular?',
        answer:
          'Sim. Se você ativar o ZeloMenu (adicional de R$ 40/mês), os produtos que você já cadastrou no estoque viram um cardápio online acessível por link. Clientes veem preços, variações e adicionais direto do celular. Sem fotografar cardápio impresso, sem publicar em rede social todo dia.'
      },
      {
        question: 'Dá para fechar o caixa sem usar papel?',
        answer:
          'Sim. As vendas, despesas e pagamentos ficam registradas no sistema, o que ajuda muito na conferência do caixa e reduz aquela dependência de anotações espalhadas.'
      },
      {
        question: 'Preciso instalar algum programa?',
        answer:
          'Não. O Zelo PDV roda direto no navegador, então você pode começar em um computador, notebook ou tablet sem instalação complicada.'
      }
    ],
    finalCtaTitle: 'Teste no seu balcão por 14 dias',
    finalCtaText:
      'Se a sua lanchonete precisa vender rápido e ter um caixa mais organizado, o Zelo PDV foi feito para esse cenário. Em poucos minutos você já consegue testar a operação real do balcão.'
  },
  restaurantes: {
    slug: 'para-restaurantes',
    updatedAt: '2026-09-23',
    meta: {
      title: 'Sistema para Restaurante — Mesas, Comandas e Caixa | Zelo PDV',
      description:
        'Sistema para restaurante pequeno e médio: controle mesas, comandas, caixa e lucro real. R$ 59/mês + módulo de mesas opcional. Teste grátis 14 dias, sem cartão.',
      canonical: `${SITE_URL}/para-restaurantes`
    },
    segmentName: 'restaurantes',
    heroBadge: 'Do salão ao fechamento do caixa',
    h1: 'Sistema para Restaurante: Mesas, Comandas e Caixa em Um Só Lugar',
    subtitle:
      'Abra comandas por mesa, registre os pedidos do salão, receba com taxa de serviço e feche o caixa sabendo quanto sobrou. Tudo no navegador, sem instalar nada e sem sistema pesado.',
    highlights: [
      'Mesas e comandas organizadas no salão',
      'Caixa e pagamentos sem papelzinho',
      'Lucro real com despesas lançadas',
      'Vendas por iFood e apps com taxa configurável'
    ],
    problemTitle: 'O salão funciona, mas o controle fica para trás',
    problemParagraphs: [
      'Em restaurante pequeno, o movimento do almoço não espera: mesa abre, pedido sai, conta junta itens de três pessoas diferentes e alguém anota tudo em papel. Quando chega a hora de fechar a conta, começa a conferência manual — e é aí que entram os erros, os esquecimentos e a fila no caixa.',
      'Depois do expediente vem a segunda rodada: somar o que entrou, separar taxa de serviço, lembrar das despesas do dia e tentar entender se o movimento bom virou resultado bom. Sem um sistema simples, esse fechamento toma tempo e quase sempre fica pela metade.',
      'O Zelo PDV foi feito para esse cenário: um sistema direto para abrir mesas, controlar comandas, receber de formas diferentes e enxergar o resultado real — sem o peso nem o preço dos sistemas grandes de restaurante.'
    ],
    problemPoints: [
      {
        label: 'Comandas no papel',
        value: 'Item esquecido, conta errada e conferência manual na hora de pico.'
      },
      {
        label: 'Fechamento demorado',
        value: 'Somar vendas, taxa de serviço e despesas no fim do dia vira segunda jornada.'
      },
      {
        label: 'Lucro invisível',
        value: 'Salão cheio não garante margem quando despesas e taxas ficam fora da conta.'
      }
    ],
    featuresTitle: 'Sistema para Restaurante: o essencial do salão ao caixa',
    featuresIntro:
      'O restaurante precisa de agilidade no salão e clareza no fechamento. O Zelo junta frente de caixa, mesas, comandas e gestão financeira em uma operação simples de aprender.',
    features: [
      {
        icon: '🍽️',
        title: 'Mesas e comandas digitais',
        description:
          'Com o módulo de Mesas, você abre comandas por mesa, lança pedidos conforme saem e acompanha o consumo de cada conta em tempo real. Sem papelzinho, sem conferência manual no fim.'
      },
      {
        icon: '💳',
        title: 'Recebimento flexível no fechamento',
        description:
          'Pix, dinheiro, cartão e pagamento dividido ficam registrados na conta da mesa, com taxa de serviço quando fizer sentido. A conta fecha rápido e o caixa fica redondo.'
      },
      {
        icon: '📦',
        title: 'Cardápio e estoque em ordem',
        description:
          'Monte o cardápio, organize categorias e acompanhe os itens que pedem atenção. Menos ruptura no meio do serviço e menos compra no susto.'
      },
      {
        icon: '📱',
        title: 'Cardápio online com publicação do estoque',
        description:
          'Publique os produtos direto do estoque no cardápio digital do seu negócio. Clientes acessam o menu pelo celular, veem preços e variações. Sem cadastro paralelo, sem taxa por pedido, sem imprimir cardápio de novo.'
      },
      {
        icon: '💰',
        title: 'Lucro real no fim do dia',
        description:
          'Lance despesas, acompanhe entradas e veja o resultado da operação com clareza. Em vez de olhar só o faturamento, você entende o que realmente sobrou.'
      },
      {
        icon: '📲',
        title: 'Vendas de apps com taxa embutida',
        description:
          'Se o restaurante também vende por iFood ou outros apps, registre essas vendas com a taxa da plataforma configurada e saiba na hora quanto entrou de verdade.'
      }
    ],
    howTitle: 'Como funciona na rotina do seu restaurante',
    howIntro:
      'A proposta é organizar o serviço sem criar burocracia. Em poucos passos, o salão e o caixa passam a falar a mesma língua.',
    steps: [
      {
        title: 'Cadastre cardápio e mesas',
        description:
          'Você monta os pratos e bebidas, ajusta preços e configura as mesas do salão. A operação fica pronta para abrir comandas no primeiro serviço.'
      },
      {
        title: 'Lance pedidos durante o serviço',
        description:
          'Cada mesa tem sua comanda: os pedidos entram conforme saem para a cozinha e o consumo fica registrado, sem depender de anotação solta.'
      },
      {
        title: 'Feche contas e o dia com segurança',
        description:
          'Na saída do cliente, a conta fecha rápido com a forma de pagamento certa. No fim do dia, vendas, despesas e taxas já estão organizadas para o fechamento.'
      }
    ],
    faqSpecific: [
      {
        question: 'O Zelo PDV controla mesas e comandas?',
        answer:
          'Sim. O módulo de Mesas (R$ 30/mês além do plano) permite abrir comandas por mesa, lançar pedidos, acompanhar consumo e fechar a conta com taxa de serviço. O plano base já cobre caixa, produtos, estoque e financeiro.'
      },
      {
        question: 'Serve para restaurante pequeno, tipo self-service ou marmitaria?',
        answer:
          'Sim. Para operação de balcão e marmita, o plano base resolve. Se o serviço é à la carte com mesas, o módulo de Mesas completa o fluxo do salão.'
      },
      {
        question: 'Consigo dividir a conta ou receber de formas diferentes na mesma mesa?',
        answer:
          'Sim. O fechamento aceita formas de pagamento combinadas, e a taxa de serviço pode ser aplicada quando fizer sentido para a casa.'
      },
      {
        question: 'Dá para ter um cardápio online acessível por QR code?',
        answer:
          'Sim. O ZeloMenu (adicional de R$ 40/mês) publica os produtos do seu cardápio direto do estoque em um link público. O cliente escaneia o QR code, vê o menu no celular e confere preços, descrições e variações. Publica uma vez, atualiza direto do sistema.'
      },
      {
        question: 'Preciso instalar algum programa ou comprar equipamento?',
        answer:
          'Não. O Zelo PDV roda no navegador, em computador, tablet ou celular. Dá para começar com o equipamento que você já tem.'
      }
    ],
    finalCtaTitle: 'Teste no seu restaurante por 14 dias',
    finalCtaText:
      'Se o seu restaurante precisa de salão organizado e fechamento claro, o Zelo foi feito para esse tamanho de operação. Teste grátis no movimento real da casa, sem cartão e sem compromisso.'
  },
  hamburguerias: {
    slug: 'para-hamburguerias',
    updatedAt: '2026-09-23',
    meta: {
      title: 'PDV para Hamburgueria — Controle Pedidos e Lucro Sem Complicação | Zelo PDV',
      description:
        'Sistema PDV para hamburgueria: registre pedidos rápido, controle estoque e saiba quanto sobrou no fim do dia. R$ 59/mês, 14 dias grátis, sem cartão.',
      canonical: `${SITE_URL}/para-hamburguerias`
    },
    segmentName: 'hamburguerias',
    heroBadge: 'Operação enxuta para pico de movimento',
    h1: 'PDV para Hamburgueria: Controle Pedidos e Lucro Sem Complicação',
    subtitle:
      'Organize pedidos, combos, caixa e despesas da sua hamburgueria sem depender de planilha nem de sistema pesado. O foco aqui é operação rápida e lucro claro no fechamento.',
    highlights: [
      'Combos e adicionais mais organizados',
      'Caixa mais ágil em noites de pico',
      'Lucro sem planilha no pós-expediente',
      'Taxa de iFood e Rappi calculada na hora'
    ],
    problemTitle: 'A hamburgueria cresce rápido, e a operação complica junto',
    problemParagraphs: [
      'Hamburgueria costuma viver dois extremos: o início do turno mais calmo e o pico da noite, quando entram vários pedidos quase ao mesmo tempo. Se o sistema atrasa, o caixa trava. Se o controle fica solto, a cozinha sente e o atendimento perde ritmo.',
      'Além disso, hamburgueria trabalha com combo, adicional, promo, retirada e, muitas vezes, pedido próprio por WhatsApp. Quando tudo isso vai para anotações separadas, fica difícil saber o que saiu mais, onde houve erro e qual foi o resultado real do dia.',
      'No fim da noite, muita gente olha o faturamento e acha que foi bem, mas ainda não descontou embalagem, reposição, gás, retirada e outras despesas. O Zelo PDV ajuda justamente a tirar essa névoa, sem transformar a hamburgueria em uma operação burocrática.'
    ],
    problemPoints: [
      {
        label: 'Pico da noite',
        value: 'Se o atendimento trava no caixa, a fila cresce e a cozinha perde cadência.'
      },
      {
        label: 'Combos e adicionais',
        value: 'Sem organização, a operação fica mais sujeita a erro e retrabalho.'
      },
      {
        label: 'Resultado real',
        value: 'Faturamento alto não garante lucro quando despesas e retiradas ficam fora da conta.'
      }
    ],
    featuresTitle: 'Sistema PDV para Hamburgueria: controle o pico sem perder margem',
    featuresIntro:
      'Na hamburgueria, o sistema precisa ajudar na velocidade do pedido e na leitura financeira da operação. O Zelo entrega isso com uma estrutura simples de aprender e manter.',
    features: [
      {
        icon: '🍔',
        title: 'Pedidos rápidos no balcão',
        description:
          'A tela de venda foi pensada para agilizar o atendimento nos horários mais apertados. Isso ajuda a registrar pedido, pagamento e retirada sem enrolar a fila.'
      },
      {
        icon: '🧾',
        title: 'Combos e cardápio organizados',
        description:
          'Você cadastra o menu da casa de um jeito limpo e deixa a operação mais previsível. Isso facilita a rotina de quem precisa vender combos, adicionais e promoções frequentes.'
      },
      {
        icon: '📱',
        title: 'Cardápio online com publicação do estoque',
        description:
          'Publique os produtos direto do estoque no cardápio digital do seu negócio. Clientes acessam o menu pelo celular, veem preços e variações. Sem cadastro paralelo, sem taxa por pedido, sem imprimir cardápio de novo.'
      },
      {
        icon: '📦',
        title: 'Acompanhamento do estoque',
        description:
          'O sistema ajuda a acompanhar os itens que precisam de atenção, evitando surpresa na reposição. É uma forma prática de manter a hamburgueria organizada sem controle paralelo.'
      },
      {
        icon: '📊',
        title: 'Lucro, despesas e taxas de plataformas',
        description:
          'Em vez de fechar o dia com achismo, registre despesas e vendas de aplicativos com a taxa já embutida. Assim você enxerga quanto realmente sobrou, mesmo nas vendas por iFood ou Rappi.'
      }
    ],
    howTitle: 'Como o Zelo entra na rotina da hamburgueria',
    howIntro:
      'A proposta é simples: preparar a casa antes do movimento, vender com fluidez durante o pico e fechar o dia com mais clareza.',
    steps: [
      {
        title: 'Monte o cardápio da operação',
        description:
          'Cadastre hambúrgueres, combos e itens principais de forma organizada para facilitar a venda e reduzir confusão na hora que o volume aumentar.'
      },
      {
        title: 'Atenda rápido nas horas críticas',
        description:
          'Quando a hamburgueria enche, a equipe registra os pedidos em poucos toques, organiza os pagamentos e mantém o caixa muito mais previsível.'
      },
      {
        title: 'Analise o dia sem planilha paralela',
        description:
          'Depois do expediente, você cruza movimento e despesas no mesmo sistema e entende melhor se a noite foi boa de verdade ou só pareceu corrida.'
      }
    ],
    faqSpecific: [
      {
        question: 'O Zelo PDV serve para hamburgueria com combos e promoções?',
        answer:
          'Sim. Você consegue organizar o cardápio, cadastrar os produtos que vende e manter a operação mais simples mesmo quando trabalha com combos, adicionais e promoções.'
      },
      {
        question: 'Consigo acompanhar estoque na hamburgueria?',
        answer:
          'Sim. O sistema ajuda a acompanhar os itens cadastrados e dá mais visibilidade para os produtos que precisam de reposição, evitando uma operação totalmente no improviso.'
      },
      {
        question: 'Funciona bem no pico da noite?',
        answer:
          'Foi pensado para operação rápida. A tela de venda é direta e ajuda a registrar pedidos e pagamentos com agilidade quando a fila aumenta.'
      },
      {
        question: 'Meus clientes conseguem ver o cardápio online?',
        answer:
          'Com o ZeloMenu (adicional de R$ 40/mês), sim. Os produtos do seu estoque viram um cardápio digital acessível por link. Clientes veem combos, preços e adicionais pelo celular, sem você precisar manter cardápio impresso atualizado.'
      },
      {
        question: 'Dá para acompanhar o lucro sem usar planilha?',
        answer:
          'Sim. Ao lançar despesas e conferir o caixa, você passa a enxergar muito melhor o que realmente sobrou depois da operação da noite.'
      }
    ],
    finalCtaTitle: 'Teste na sua hamburgueria por 14 dias',
    finalCtaText:
      'Se a sua hamburgueria precisa ganhar velocidade no atendimento e clareza no fechamento, vale testar o Zelo na rotina real da casa. O período grátis já mostra se o fluxo encaixa no seu time.'
  },
  delivery: {
    slug: 'para-delivery',
    updatedAt: '2026-09-23',
    meta: {
      title: 'Sistema para Delivery Próprio — Gerencie Pedidos e Finanças Sem iFood | Zelo PDV',
      description:
        'Para quem faz delivery por conta própria. Controle pedidos, despesas e lucro sem pagar taxa de marketplace. Sistema simples, R$ 59/mês.',
      canonical: `${SITE_URL}/para-delivery`
    },
    segmentName: 'delivery próprio',
    heroBadge: 'Backoffice simples para delivery próprio',
    h1: 'Sistema para Delivery Próprio: Gerencie Pedidos e Finanças Sem iFood',
    subtitle:
      'Para quem vende por WhatsApp, Instagram ou telefone e faz a própria entrega. O Zelo organiza pedidos, caixa e despesas para o delivery próprio funcionar sem taxa de marketplace.',
    highlights: [
      'Pedidos próprios sem taxa de aplicativo',
      'Caixa e despesas no mesmo lugar',
      'Controle simples para operação enxuta',
      'Vendas via iFood/Rappi com taxa configurável'
    ],
    problemTitle: 'Quando o pedido entra por todo lado, o financeiro some',
    problemParagraphs: [
      'No delivery próprio, os pedidos costumam chegar por canais diferentes: WhatsApp, Instagram, ligação e cliente recorrente pedindo de novo. O problema é que, sem um sistema simples no centro da operação, cada venda vai parar em um lugar e o controle some.',
      'Muita gente foge do marketplace para não pagar taxa alta, mas continua sofrendo com outro custo invisível: a bagunça do backoffice. Pedido anotado em conversa, despesa de embalagem sem registro, combustível fora da conta e pouca clareza sobre o lucro de cada dia.',
      'O Zelo PDV não tenta virar aplicativo de marketplace. A proposta é outra: dar ao delivery próprio um jeito simples de registrar pedidos, organizar pagamentos, acompanhar despesas e entender se a operação está saudável financeiramente.'
    ],
    problemPoints: [
      {
        label: 'Pedidos espalhados',
        value: 'WhatsApp, Instagram e telefone viram um fluxo difícil de fechar no fim do dia.'
      },
      {
        label: 'Despesas invisíveis',
        value: 'Embalagem, combustível e pequenas saídas corroem margem quando não entram no controle.'
      },
      {
        label: 'Lucro incerto',
        value: 'Sem backoffice organizado, fica difícil saber se vender mais também significou ganhar mais.'
      }
    ],
    featuresTitle: 'Sistema para Delivery Próprio: controle pedidos e finanças sem iFood',
    featuresIntro:
      'Quem faz delivery por conta própria precisa mais de organização financeira e operacional do que de complexidade. O Zelo resolve o essencial para quem quer vender direto ao cliente.',
    features: [
      {
        icon: '🛵',
        title: 'Registro rápido dos pedidos',
        description:
          'Os pedidos que chegam pelo WhatsApp, Instagram ou telefone podem ser lançados com rapidez, centralizando a operação em um só lugar e evitando venda perdida.'
      },
      {
        icon: '💸',
        title: 'Caixa e formas de pagamento',
        description:
          'Pix, dinheiro, cartão e combinações de pagamento ficam registrados com mais clareza. Isso ajuda bastante quem precisa fechar o dia sem depender de conversa e memória.'
      },
      {
        icon: '📱',
        title: 'Cardápio online com publicação do estoque',
        description:
          'Publique os produtos direto do estoque no cardápio digital do seu negócio. Clientes acessam o menu pelo celular, veem preços e variações. Sem cadastro paralelo, sem taxa por pedido, sem imprimir cardápio de novo.'
      },
      {
        icon: '🧾',
        title: 'Despesas do delivery sob controle',
        description:
          'Embalagens, combustível, reposições e outros custos entram na conta. Assim você deixa de olhar apenas para o valor vendido e passa a entender a margem real.'
      },
      {
        icon: '📱',
        title: 'Funciona de onde a operação acontece',
        description:
          'Você pode usar no notebook do caixa ou direto no celular, o que é ótimo para negócio enxuto que não quer montar uma estrutura cara só para começar.'
      },
      {
        icon: '🧮',
        title: 'Taxa de plataformas já no caixa',
        description:
          'Se você também vende por iFood, Rappi ou outro app, pode registrar essas vendas com a taxa da plataforma configurada. O sistema calcula quanto entra de verdade, sem surpresa no fechamento.'
      }
    ],
    howTitle: 'Como o Zelo ajuda o delivery próprio no dia a dia',
    howIntro:
      'A lógica é centralizar o pedido, registrar o financeiro e manter a operação leve para quem quer vender direto ao cliente sem depender de plataforma cara.',
    steps: [
      {
        title: 'Cadastre o cardápio e os pagamentos',
        description:
          'Você prepara os produtos mais vendidos, organiza os preços e já deixa a operação pronta para receber pedidos vindos dos seus canais próprios.'
      },
      {
        title: 'Lance os pedidos conforme eles entram',
        description:
          'Cada venda fica registrada no sistema, com forma de pagamento e cliente, o que evita pedidos soltos em conversa e facilita muito a conferência do dia.'
      },
      {
        title: 'Acompanhe despesas e resultado',
        description:
          'Ao lançar os custos do delivery, você consegue enxergar se o volume de vendas está realmente virando lucro, sem a distorção comum de olhar só o faturamento.'
      }
    ],
    faqSpecific: [
      {
        question: 'O Zelo PDV serve para quem vende por WhatsApp e Instagram?',
        answer:
          'Sim. O sistema é ótimo para quem recebe pedidos pelos próprios canais e quer centralizar o registro das vendas sem depender de anotações espalhadas.'
      },
      {
        question: 'O Zelo substitui marketplace como iFood?',
        answer:
          'Não. A proposta do Zelo é organizar o backoffice e a frente de caixa do delivery próprio, para quem vende direto ao cliente e quer fugir das taxas de marketplace.'
      },
      {
        question: 'Consigo controlar despesas do delivery?',
        answer:
          'Sim. Você pode registrar custos como embalagem, combustível e outras saídas para entender melhor a margem real da operação.'
      },
      {
        question: 'Funciona para operação pequena, com poucos pedidos por dia?',
        answer:
          'Sim. Ele foi pensado justamente para negócios enxutos que precisam de controle simples, sem montar uma estrutura cara ou complexa.'
      },
      {
        question: 'Meus clientes podem ver o cardápio online?',
        answer:
          'Com o ZeloMenu (adicional de R$ 40/mês), sim. Os produtos do seu estoque viram um cardápio digital acessível por link. Clientes veem preços e variações pelo celular, sem você precisar manter fotos de cardápio impresso no WhatsApp.'
      }
    ],
    finalCtaTitle: 'Teste no seu delivery por 14 dias',
    finalCtaText:
      'Se você faz delivery por conta própria e quer parar de depender de anotações soltas, o Zelo pode ser o centro da sua operação. Teste por 14 dias grátis, sem cartão, e veja a diferença no fechamento.'
  },
  mei: {
    slug: 'para-mei',
    updatedAt: '2026-09-24',
    meta: {
      title: 'Sistema de Gestão para MEI — Caixa e Despesas no Celular | Zelo PDV',
      description:
        'Sistema de gestão para MEI de alimentação. Substitua planilha e caderno por controle de caixa, despesas e lucro real. R$ 59/mês, teste grátis.',
      canonical: `${SITE_URL}/para-mei`
    },
    segmentName: 'MEI e pequeno negócio',
    heroBadge: 'Controle simples para quem faz tudo sozinho',
    h1: 'Sistema de Gestão para MEI: Controle Caixa e Despesas no Celular',
    subtitle:
      'Se você vende sozinho ou com uma equipe pequena, o Zelo ajuda a sair do caderno e da planilha. Controle caixa, despesas e lucro real direto no celular ou no navegador.',
    highlights: [
      'Rotina simples para MEI de alimentação',
      'Despesas e retiradas mais organizadas',
      'Lucro real sem depender de planilha'
    ],
    problemTitle: 'O MEI vende, produz, entrega e ainda precisa fechar as contas',
    problemParagraphs: [
      'Quem toca um negócio como MEI normalmente faz de tudo um pouco: compra, produz, vende, atende cliente, responde mensagem e ainda precisa entender o caixa. Quando não existe um sistema simples, o controle vira mais uma tarefa pesada no fim do expediente.',
      'É comum misturar dinheiro pessoal com dinheiro do negócio, esquecer pequenas despesas e deixar retiradas sem registro. Aí vem a falsa sensação de que entrou bastante dinheiro, quando na prática ficou difícil saber quanto era venda, quanto era custo e quanto era sobra real.',
      'O Zelo PDV ajuda o MEI a organizar essa rotina sem complicar. Em vez de uma plataforma pesada, você usa um sistema direto ao ponto para registrar vendas, despesas e acompanhar o que realmente está acontecendo no seu negócio de alimentação.'
    ],
    problemPoints: [
      {
        label: 'Caixa misturado',
        value: 'Sem registro claro, o dinheiro do negócio acaba se confundindo com gastos pessoais.'
      },
      {
        label: 'Despesas esquecidas',
        value: 'Pequenas compras e retiradas somem da conta e distorcem o resultado do mês.'
      },
      {
        label: 'Falta de tempo',
        value: 'O MEI precisa de uma solução rápida de usar, não de um sistema que vira mais trabalho.'
      }
    ],
    featuresTitle: 'Sistema de Gestão para MEI: o essencial para sair do caderno',
    featuresIntro:
      'Para MEI de alimentação, o melhor sistema não é o mais complexo. É o que permite vender, lançar despesas e entender o resultado sem tomar tempo demais da rotina.',
    features: [
      {
        icon: '📱',
        title: 'Controle no celular ou notebook',
        description:
          'Você pode acompanhar a operação onde estiver, sem depender de instalação. Isso é importante para quem vende em horários diferentes ou precisa olhar o caixa longe do balcão.'
      },
      {
        icon: '🧾',
        title: 'Despesas e retiradas organizadas',
        description:
          'Ao lançar gastos e saídas do caixa, você para de depender de lembrança e passa a construir um histórico mais confiável para o mês.'
      },
      {
        icon: '💵',
        title: 'Vendas registradas com clareza',
        description:
          'Cada venda fica anotada no sistema, o que ajuda a entender o movimento da semana e evita aquela sensação de trabalhar muito sem saber o resultado.'
      },
      {
        icon: '📈',
        title: 'Lucro real sem planilha',
        description:
          'Com as entradas e despesas no mesmo lugar, fica muito mais fácil enxergar o que realmente sobrou no negócio e tomar decisão com base em número.'
      }
    ],
    howTitle: 'Como o Zelo se encaixa na rotina do MEI',
    howIntro:
      'A proposta é ser leve o bastante para quem já faz tudo sozinho, mas útil o suficiente para trazer organização logo nos primeiros dias.',
    steps: [
      {
        title: 'Cadastre o que você vende',
        description:
          'Monte sua base de produtos e deixe a operação pronta para registrar vendas do jeito certo, sem depender de folha solta ou anotação rápida demais.'
      },
      {
        title: 'Registre vendas e saídas do caixa',
        description:
          'Durante a rotina, você lança o que entrou e o que saiu. Isso inclui despesas pequenas, retiradas e outros movimentos que costumam sumir da conta.'
      },
      {
        title: 'Veja o resultado com muito mais clareza',
        description:
          'No fechamento do dia ou do mês, você entende melhor o caixa e o lucro, sem precisar organizar tudo de novo em planilha paralela.'
      }
    ],
    faqSpecific: [
      {
        question: 'O Zelo PDV é indicado para MEI de alimentação?',
        answer:
          'Sim. O sistema foi pensado para pequenos negócios que precisam de controle simples de caixa, despesas e vendas sem investir em plataforma cara ou complexa.'
      },
      {
        question: 'Consigo lançar despesas e retiradas?',
        answer:
          'Sim. Você pode registrar os gastos do negócio e as saídas do caixa, o que ajuda muito a separar a operação da vida pessoal.'
      },
      {
        question: 'Preciso de contador ou conhecimento técnico para usar?',
        answer:
          'Não. A proposta do Zelo é ser fácil de usar no dia a dia, mesmo para quem nunca trabalhou com sistema de gestão antes.'
      },
      {
        question: 'Ajuda no fechamento do mês?',
        answer:
          'Sim. Como vendas e despesas ficam registradas no mesmo lugar, o fechamento fica muito mais claro e menos dependente de planilha paralela.'
      }
    ],
    finalCtaTitle: 'Teste no seu negócio por 14 dias',
    finalCtaText:
      'Se você é MEI e precisa de um jeito mais simples de controlar caixa, despesas e lucro, o Zelo foi feito para caber na sua rotina. Teste grátis e veja como fica mais fácil fechar o mês.'
  },
  acaiterias: {
    slug: 'para-acaiterias',
    updatedAt: '2026-09-24',
    meta: {
      title: 'Sistema PDV para Açaiteria — Copos, Adicionais e Sazonalidade | Zelo PDV',
      description:
        `Sistema PDV para açaiteria: cadastre copos por tamanho, adicionais e monte de forma simples. Controle caixa, fiado e lucro real na alta e na baixa temporada. ${BASE_PRICE}/mês, ${TRIAL_DAYS} dias grátis, sem cartão.`,
      canonical: `${SITE_URL}/para-acaiterias`
    },
    segmentName: 'açaiterias',
    heroBadge: 'Feito para o pico do verão e o vazio do inverno',
    h1: 'Sistema PDV para Açaiteria: Copos, Adicionais e Lucro Real',
    subtitle:
      'Cadastre copos por tamanho, monte adicionais e registre cada venda rápido, mesmo na fila do fim de tarde. Acompanhe o caixa, o fiado e o que realmente sobra entre a alta e a baixa temporada.',
    highlights: [
      'Copos por tamanho cadastrados como produtos, sem confusão no balcão',
      'Adicionais e montagens organizados no cardápio',
      'Fiado do cliente fiel sem caderno',
      'Vendas por iFood, Rappi e outras plataformas com taxa configurável'
    ],
    problemTitle: 'Quando a fila do açaí aperta, o controle é o primeiro a sobrar',
    problemParagraphs: [
      'Açaiteria vive de pico: fim de tarde, fim de semana e mês quente o movimento triplica, e o atendente precisa montar copo, cobrar adicional e passar pro próximo cliente rápido. Se o sistema atrasa ou obriga digitar peso e monte de opção toda vez, a fila anda mais devagar do que devia.',
      'Fora do pico, o desafio muda: vem a baixa temporada, o movimento cai, e sobra a pergunta de sempre — o negócio ainda está dando lucro nos meses fracos, ou só empatando? Sem separar bem despesa fixa de venda variável, essa conta fica no achismo.',
      'O Zelo PDV não promete pesagem automática por balança integrada — hoje isso não existe no produto. A saída prática é cadastrar cada tamanho de copo (300ml, 500ml, 700ml) como um produto com seu próprio preço, e os adicionais como itens à parte. Simples de montar, rápido de vender, e o estoque desconta certo a cada venda.'
    ],
    problemPoints: [
      { label: 'Fila do fim de tarde', value: 'Cada copo tem tamanho e adicional diferente — se o sistema é lento, a fila cresce e o cliente desiste.' },
      { label: 'Sazonalidade', value: 'Verão lota, inverno esvazia. Sem separar despesa fixa de venda variável, fica difícil saber se o mês fraco ainda dá lucro.' },
      { label: 'Adicional sem controle', value: 'Granola, leite em pó, frutas — se não tem preço fixo e claro por adicional, a margem escorre sem ninguém perceber.' }
    ],
    featuresTitle: 'Sistema PDV para Açaiteria: copo, adicional e caixa rápido',
    featuresIntro:
      'A açaiteria precisa de agilidade na montagem do copo e clareza no fechamento, principalmente quando o movimento varia demais entre estações. O Zelo junta frente de caixa, estoque e financeiro numa operação simples de aprender.',
    features: [
      {
        icon: '⚡',
        title: 'Frente de caixa rápida para o pico',
        description:
          'Registre o copo com tamanho e adicionais em poucos toques, finalize e siga para o próximo cliente. Pensado para não travar quando a fila aperta no fim de tarde.'
      },
      {
        icon: '📦',
        title: 'Copos e adicionais como produtos organizados',
        description:
          'Cadastre cada tamanho de copo (300ml, 500ml, 700ml) e cada adicional (granola, leite em pó, frutas, coberturas) como item próprio, com preço certo. Sem depender de calcular peso na hora da venda.'
      },
      {
        icon: '📒',
        title: 'Fiado do cliente fiel',
        description:
          'Muita açaiteria de bairro tem cliente que passa toda semana e paga depois. Cadastre, acompanhe limite e histórico, e organize esse fiado sem caderno.'
      },
      {
        icon: '📱',
        title: 'Cardápio online com publicação do estoque',
        description:
          `Com o ZeloMenu (adicional de +${MENU_PRICE}/mês), publique os produtos direto do estoque no cardápio digital. Cliente vê tamanhos e adicionais pelo celular, sem cardápio impresso desatualizado.`
      },
      {
        icon: '💰',
        title: 'Lucro real entre alta e baixa temporada',
        description:
          'Lance despesas fixas e variáveis e enxergue o resultado de cada mês. Isso ajuda a decidir se vale reduzir equipe ou horário nos meses mais fracos, com número na mão em vez de sensação.'
      },
      {
        icon: '📲',
        title: 'Vendas de plataformas com taxa embutida',
        description:
          'Registre vendas do iFood, Rappi e outros apps direto no caixa, com a taxa da plataforma já configurada. Você sabe na hora quanto entrou de verdade.'
      }
    ],
    howTitle: 'Como funciona na rotina da sua açaiteria',
    howIntro:
      'A ideia é organizar copo, adicional e caixa sem burocracia, e continuar vendendo do jeito certo mesmo quando o movimento muda de uma estação para outra.',
    steps: [
      {
        title: 'Cadastre tamanhos de copo e adicionais',
        description:
          'Você cria cada tamanho como um produto (por exemplo, "Açaí 500ml") e cada adicional como item separado, com preço próprio. Pronto para vender no primeiro dia.'
      },
      {
        title: 'Venda rápido no pico',
        description:
          'No balcão, monta o copo, adiciona o que o cliente pedir, cobra e segue. O comprovante pode sair pelo WhatsApp, sem enrolar a fila.'
      },
      {
        title: 'Acompanhe o resultado mês a mês',
        description:
          'Ao lançar despesas e conferir o caixa, você compara o mês forte com o mês fraco e decide com dado, não com impressão de movimento.'
      }
    ],
    faqSpecific: [
      {
        question: 'O Zelo PDV vende por peso, com balança integrada?',
        answer:
          'Não. Hoje o Zelo PDV não tem integração com balança para venda por peso. A forma prática de vender açaí é cadastrar cada tamanho de copo (por exemplo, 300ml, 500ml, 700ml) como um produto com preço fixo, e os adicionais como itens à parte. Funciona bem para a maioria das açaiterias, que já vendem por tamanho de copo ou marmita.'
      },
      {
        question: 'Consigo organizar os adicionais (granola, leite em pó, frutas) separados do copo?',
        answer:
          'Sim. Cada adicional pode ser cadastrado como um item próprio no seu catálogo de produtos, com preço definido. Assim o atendente monta o copo certo e o preço fecha automaticamente.'
      },
      {
        question: 'O sistema ajuda a entender se a baixa temporada ainda dá lucro?',
        answer:
          'Sim. Ao lançar despesas fixas e variáveis e acompanhar as vendas, você compara o resultado de meses diferentes e enxerga se o negócio segue saudável fora do pico do verão.'
      },
      {
        question: 'Consigo controlar o fiado dos clientes fiéis?',
        answer:
          'Sim. O sistema tem carteira de clientes integrada, com limite e histórico por pessoa — útil para quem tem cliente de bairro que passa toda semana.'
      },
      {
        question: 'Meus clientes podem ver o cardápio com os tamanhos pelo celular?',
        answer:
          `Sim, se você ativar o ZeloMenu (adicional de +${MENU_PRICE}/mês). Os copos e adicionais que você cadastrou no estoque viram um cardápio online acessível por link, sem cardápio impresso desatualizado.`
      },
      {
        question: 'Preciso instalar algum programa?',
        answer:
          'Não. O Zelo PDV roda direto no navegador, em computador, notebook ou tablet, sem instalação complicada.'
      }
    ],
    finalCtaTitle: `Teste na sua açaiteria por ${TRIAL_DAYS} dias`,
    finalCtaText:
      'Se a sua açaiteria precisa de um caixa rápido no pico e clareza de lucro fora dele, o Zelo PDV foi feito para esse tipo de operação. Teste grátis, sem cartão, e veja como fica a rotina do copo ao fechamento.'
  },
  pizzarias: {
    slug: 'para-pizzarias',
    updatedAt: '2026-09-24',
    meta: {
      title: 'Sistema PDV para Pizzaria — Meio a Meio, Bordas e Delivery | Zelo PDV',
      description:
        `Sistema PDV para pizzaria: organize sabores, meio a meio, bordas recheadas e delivery sem travar na sexta de pico. Controle caixa e lucro real. ${BASE_PRICE}/mês, ${TRIAL_DAYS} dias grátis.`,
      canonical: `${SITE_URL}/para-pizzarias`
    },
    segmentName: 'pizzarias',
    heroBadge: 'Feito para o forno cheio de sexta e sábado',
    h1: 'Sistema PDV para Pizzaria: Sabores, Bordas e Delivery Sem Travar',
    subtitle:
      'Organize o cardápio de sabores, meio a meio, bordas recheadas e entregas sem perder o ritmo no pico de sexta e sábado. Controle caixa, fiado e o lucro real no fim do mês.',
    highlights: [
      'Sabores, meio a meio e bordas organizados como produtos e adicionais',
      'Caixa que aguenta o pico de sexta e sábado sem travar',
      'Vendas por iFood, Rappi e outras plataformas com taxa configurável',
      'Lucro real com despesas de massa, queijo e entrega lançadas'
    ],
    problemTitle: 'Sexta e sábado lotam o forno, mas o controle não acompanha',
    problemParagraphs: [
      'Pizzaria vive um ritmo desigual: durante a semana o movimento é tranquilo, mas sexta e sábado o telefone e o WhatsApp não param, o forno enche e cada pedido tem sua combinação de sabor, meio a meio, borda recheada e forma de entrega. Se o sistema trava ou obriga digitar tudo de novo a cada pedido, o atraso na cozinha e na entrega vira reclamação.',
      'Some a isso o delivery: parte vem por aplicativo, parte por WhatsApp, parte é retirada no balcão. Sem um jeito único de registrar cada venda com a taxa certa, fica difícil saber, no fim da noite, quanto realmente sobrou depois de massa, queijo, embalagem e taxa de entrega.',
      'O Zelo PDV foi pensado para esse ritmo: cadastro rápido dos sabores mais pedidos, adicionais como borda e ingrediente extra, e caixa ágil o bastante para não travar quando o forno está cheio.'
    ],
    problemPoints: [
      { label: 'Pico de sexta e sábado', value: 'Pedido de meio a meio, borda recheada e observação especial — se o caixa é lento, a cozinha atrasa.' },
      { label: 'Delivery espalhado', value: 'iFood, WhatsApp e retirada no balcão em canais diferentes tornam difícil fechar o dia com clareza.' },
      { label: 'Lucro apertado', value: 'Massa, queijo, embalagem e taxa de entrega corroem margem quando não entram na conta.' }
    ],
    featuresTitle: 'Sistema PDV para Pizzaria: sabor, borda e entrega organizados',
    featuresIntro:
      'A pizzaria precisa de agilidade no pico e clareza no que cada pedido realmente rendeu. O Zelo junta frente de caixa, cardápio, estoque e financeiro numa operação simples de aprender.',
    features: [
      {
        icon: '🍔',
        title: 'Pedidos rápidos mesmo no pico',
        description:
          'A tela de venda foi pensada para agilizar sexta e sábado. Registra sabor, meio a meio e forma de entrega em poucos toques, sem enrolar a fila do balcão ou do telefone.'
      },
      {
        icon: '🧾',
        title: 'Sabores, combos e bordas organizados',
        description:
          'Cadastre cada sabor como produto e as combinações de meio a meio mais pedidas como itens próprios ou combos. Bordas recheadas e ingredientes extras entram como adicionais, com preço certo.'
      },
      {
        icon: '📱',
        title: 'Cardápio online com publicação do estoque',
        description:
          'Publique os sabores direto do estoque no cardápio digital do seu negócio. Cliente vê o cardápio, monta o pedido e confere preço antes de ligar ou chamar no WhatsApp.'
      },
      {
        icon: '📲',
        title: 'Vendas de plataformas com taxa embutida',
        description:
          'Registre vendas do iFood, Rappi e outros apps direto no caixa, com a taxa da plataforma já configurada. Assim você sabe na hora quanto entrou de verdade de cada canal.'
      },
      {
        icon: '📦',
        title: 'Estoque de massa, queijo e recheios',
        description:
          'Acompanhe os itens que mais saem no fim de semana e evite ficar sem ingrediente no meio do pico. O estoque desconta automático a cada venda registrada.'
      },
      {
        icon: '💰',
        title: 'Lucro real depois de massa, queijo e entrega',
        description:
          'Lance despesas de insumo, embalagem e entrega e veja o que realmente sobrou. Faturamento alto de sexta não garante lucro quando o custo de cada pizza não entra na conta.'
      }
    ],
    howTitle: 'Como o Zelo entra na rotina da sua pizzaria',
    howIntro:
      'A proposta é preparar o cardápio antes do pico, vender rápido durante ele e fechar a noite com clareza sobre o que sobrou.',
    steps: [
      {
        title: 'Cadastre sabores, combos e bordas',
        description:
          'Monte o cardápio com os sabores da casa, as combinações de meio a meio mais pedidas e as bordas recheadas como adicionais, com preço definido para cada uma.'
      },
      {
        title: 'Venda rápido na sexta e no sábado',
        description:
          'No balcão ou no atendimento por telefone/WhatsApp, o pedido entra rápido, com sabor, borda e forma de entrega já registrados, sem travar o ritmo da cozinha.'
      },
      {
        title: 'Feche a noite com o resultado real',
        description:
          'Ao lançar despesas e conferir as vendas por canal (balcão, iFood, WhatsApp), você entende se o pico de fim de semana virou lucro de verdade.'
      }
    ],
    faqSpecific: [
      {
        question: 'O Zelo PDV organiza pizza meio a meio?',
        answer:
          'O Zelo permite cadastrar as combinações de meio a meio mais pedidas como produtos ou combos próprios, com o preço que você definir (por exemplo, pela regra do sabor mais caro ou uma média). Não existe hoje um "montador" automático de meio a meio com cálculo de proporção — a forma prática é cadastrar as combinações populares da casa como itens do cardápio.'
      },
      {
        question: 'Consigo cobrar borda recheada e adicionais separados?',
        answer:
          'Sim. Bordas recheadas, ingredientes extras e outros acréscimos podem ser cadastrados como adicionais com preço próprio, aplicados no pedido junto com o sabor escolhido.'
      },
      {
        question: 'O sistema aguenta o pico de sexta e sábado sem travar?',
        answer:
          'A tela de venda foi pensada para ser rápida mesmo em horário de pico, ajudando a registrar pedidos e pagamentos sem enrolar a fila ou atrasar a cozinha.'
      },
      {
        question: 'Consigo registrar vendas do iFood junto com o delivery próprio?',
        answer:
          'Sim. Você registra vendas de plataformas como iFood e Rappi com a taxa configurada, e também pedidos que chegam por WhatsApp ou telefone, tudo no mesmo caixa.'
      },
      {
        question: 'Dá para saber se a pizzaria tem lucro real depois dos ingredientes?',
        answer:
          'Sim. Ao lançar despesas de massa, queijo, embalagem e entrega, você enxerga o que realmente sobrou, em vez de olhar só para o faturamento da noite.'
      },
      {
        question: 'Preciso instalar algum programa?',
        answer:
          'Não. O Zelo PDV roda direto no navegador, em computador, notebook ou tablet, sem instalação complicada.'
      }
    ],
    finalCtaTitle: `Teste na sua pizzaria por ${TRIAL_DAYS} dias`,
    finalCtaText:
      'Se a sua pizzaria precisa aguentar o pico de sexta e sábado sem perder o controle do lucro, vale testar o Zelo na rotina real do forno. Sem cartão, sem compromisso.'
  },
  'food-trucks': {
    slug: 'para-food-trucks',
    updatedAt: '2026-09-24',
    meta: {
      title: 'Sistema PDV para Food Truck — Funciona Sem Internet Estável | Zelo PDV',
      description:
        `Sistema PDV para food truck: continua vendendo mesmo sem internet estável e sincroniza depois. Cardápio enxuto, caixa simples para eventos. ${BASE_PRICE}/mês, ${TRIAL_DAYS} dias grátis, sem cartão.`,
      canonical: `${SITE_URL}/para-food-trucks`
    },
    segmentName: 'food trucks',
    heroBadge: 'Feito para vender sem depender de internet boa',
    h1: 'Sistema PDV para Food Truck: Vende Mesmo Sem Internet Estável',
    subtitle:
      'De feira em feira, de evento em evento, a internet nunca é garantida. O Zelo PDV continua registrando venda offline e sincroniza sozinho quando a conexão volta — para o seu caixa não travar no meio da fila.',
    highlights: [
      'Continua vendendo mesmo sem internet, sincroniza depois',
      'Cardápio enxuto, fácil de montar em cada praça',
      'Caixa simples para operação móvel e de evento',
      'Vendas por apps de delivery com taxa configurável, quando fizer sentido'
    ],
    problemTitle: 'Quando o sinal cai no meio da fila do evento',
    problemParagraphs: [
      'Food truck muda de lugar: feira de rua, evento corporativo, praça de alimentação improvisada. O sinal de internet varia de praça para praça, e no meio do rush — justamente quando mais precisa vender rápido — é comum o wi-fi do evento cair ou o 4G engasgar. Se o sistema de caixa depende de internet o tempo todo, a fila para e o cliente desiste.',
      'Outro ponto do food truck é o cardápio enxuto: diferente de um restaurante, geralmente são poucos itens, montados para produção rápida em espaço pequeno. O sistema precisa ser simples de configurar de novo a cada evento, sem virar trabalho extra antes de já estar cansado da estrada.',
      'O Zelo PDV foi desenhado com o offline como parte central do produto, não como promessa vaga: a venda continua sendo registrada mesmo sem internet, e sincroniza sozinha assim que a conexão volta — seja no wi-fi do evento, seja no 4G do celular.'
    ],
    problemPoints: [
      { label: 'Sinal instável no evento', value: 'Wi-fi de feira cai, 4G engasga, e um sistema só-online trava o caixa bem na hora do maior movimento.' },
      { label: 'Cardápio precisa ser enxuto', value: 'Poucos itens, produção rápida em espaço pequeno — o sistema não pode virar complicação extra a cada praça nova.' },
      { label: 'Resultado por evento', value: 'Sem separar despesa de deslocamento, gás e insumo por evento, fica difícil saber qual praça realmente vale a pena.' }
    ],
    featuresTitle: 'Sistema PDV para Food Truck: continua vendendo onde o sinal falha',
    featuresIntro:
      'Para operação móvel, o essencial é não parar de vender quando a internet falha e manter o cardápio simples de configurar. O Zelo entrega isso com uma estrutura leve de aprender e levar para qualquer praça.',
    features: [
      {
        icon: '📶',
        title: 'Funciona offline de verdade',
        description:
          'O Zelo roda como PWA e continua registrando vendas mesmo sem internet. Quando a conexão volta — no wi-fi do evento ou no seu 4G — tudo sincroniza sozinho, sem você precisar refazer nada.'
      },
      {
        icon: '⚡',
        title: 'Caixa rápido para o rush do evento',
        description:
          'A tela de venda foi pensada para agilizar o atendimento nos horários de maior fila, comuns em feira e evento com pouco tempo de pico.'
      },
      {
        icon: '🧾',
        title: 'Cardápio enxuto e fácil de montar',
        description:
          'Cadastre os poucos itens que o truck vende, com combos e adicionais quando fizer sentido. Simples de ajustar antes de cada praça nova.'
      },
      {
        icon: '📱',
        title: 'Roda no celular ou tablet',
        description:
          'Sem precisar de computador fixo nem estrutura cara. O Zelo funciona no celular ou tablet que já está no truck, o que é ideal para quem muda de local com frequência.'
      },
      {
        icon: '💰',
        title: 'Lucro por evento, sem planilha paralela',
        description:
          'Lance despesas de deslocamento, gás e insumo e compare o resultado entre praças. Assim você decide com número qual tipo de evento vale mais a pena repetir.'
      },
      {
        icon: '📲',
        title: 'Vendas de plataformas com taxa embutida',
        description:
          'Se o truck também aceita pedido por iFood ou outro app em pontos fixos, registre com a taxa da plataforma já configurada, sem perder o controle do caixa.'
      }
    ],
    howTitle: 'Como o Zelo acompanha o truck de praça em praça',
    howIntro:
      'A ideia é montar o cardápio uma vez, levar o sistema para qualquer lugar e não depender de internet boa para continuar vendendo.',
    steps: [
      {
        title: 'Monte o cardápio enxuto do truck',
        description:
          'Cadastre os itens principais, combos e adicionais. Leve pronto para a próxima praça, sem precisar reconfigurar tudo de novo.'
      },
      {
        title: 'Venda mesmo sem sinal',
        description:
          'No evento, o caixa continua funcionando ainda que o wi-fi caia ou o 4G engasgue. A venda fica registrada no aparelho e sincroniza quando a conexão volta.'
      },
      {
        title: 'Compare o resultado entre eventos',
        description:
          'Lance as despesas de cada praça e veja qual tipo de evento realmente compensa, com base no que sobrou depois do deslocamento e dos insumos.'
      }
    ],
    faqSpecific: [
      {
        question: 'O Zelo PDV funciona mesmo se a internet do evento cair?',
        answer:
          'Sim. O Zelo funciona como PWA e continua registrando vendas offline. Quando a conexão volta, tudo sincroniza automaticamente — você não perde venda nem precisa lançar de novo.'
      },
      {
        question: 'Preciso de computador ou consigo usar só no celular?',
        answer:
          'Dá para usar em celular ou tablet, o que é prático para quem muda de praça com frequência e não quer carregar estrutura de balcão fixo.'
      },
      {
        question: 'O Zelo PDV serve para cardápio pequeno, com poucos itens?',
        answer:
          'Sim. O sistema não exige um cardápio grande — funciona bem com poucos itens, combos e adicionais, típico da operação enxuta de food truck.'
      },
      {
        question: 'Consigo comparar o resultado entre eventos diferentes?',
        answer:
          'Sim. Lançando despesas de deslocamento, gás e insumo por período, você consegue comparar o movimento e o lucro de praças e eventos diferentes.'
      },
      {
        question: 'O Zelo PDV registra vendas por aplicativo de delivery também?',
        answer:
          'Sim, quando o truck atua em ponto fixo e recebe pedido por iFood, Rappi ou similares, dá para registrar com a taxa da plataforma já configurada.'
      }
    ],
    finalCtaTitle: `Teste no seu food truck por ${TRIAL_DAYS} dias`,
    finalCtaText:
      'Se você já perdeu venda porque a internet do evento caiu, vale testar um caixa feito para continuar funcionando nessa hora. Teste grátis, sem cartão, na próxima praça.'
  },
  marmitarias: {
    slug: 'para-marmitarias',
    updatedAt: '2026-09-24',
    meta: {
      title: 'Sistema PDV para Marmitaria — Marmita do Dia, Fiado e Entregas | Zelo PDV',
      description:
        `Sistema PDV para marmitaria: cardápio do dia, fiado do cliente fixo e entregas em empresas organizados. Controle caixa e lucro real. ${BASE_PRICE}/mês, ${TRIAL_DAYS} dias grátis, sem cartão.`,
      canonical: `${SITE_URL}/para-marmitarias`
    },
    segmentName: 'marmitarias',
    heroBadge: 'Feito para o corre da marmita do dia',
    h1: 'Sistema PDV para Marmitaria: Marmita do Dia, Fiado e Entregas Organizadas',
    subtitle:
      'Registre a marmita do dia rápido, controle o fiado do cliente fixo que almoça toda semana e organize as entregas para empresas próximas. Tudo no navegador, sem sistema pesado.',
    highlights: [
      'Cardápio do dia cadastrado rápido, sem planilha paralela',
      'Fiado do cliente fixo com histórico e limite',
      'Entregas registradas com forma de pagamento certa',
      'Vendas por iFood e apps com taxa configurável'
    ],
    problemTitle: 'A marmita do dia sai rápido, mas o controle fica para depois',
    problemParagraphs: [
      'Marmitaria vive de rotina apertada: de manhã já se sabe o que vai para a marmita do dia, e no fim da manhã começam os pedidos — parte é cliente fixo que já sabe o que quer, parte é encomenda para empresa vizinha, parte é quem chega no balcão. Sem um sistema simples, cada pedido vira uma anotação separada, difícil de conferir depois.',
      'O fiado também pesa diferente na marmitaria: é comum ter o cliente que almoça ali toda semana e paga só no fim do mês. Sem controle claro de quem deve o quê, esse fiado vira ponto cego no fechamento — e às vezes constrangimento na hora de cobrar.',
      'O Zelo PDV ajuda a organizar essa correria: cadastro rápido do prato do dia, fiado do cliente fixo com histórico, e registro de cada entrega com a forma de pagamento certa, sem sistema pesado nem mensalidade que não cabe na marmitaria.'
    ],
    problemPoints: [
      { label: 'Marmita do dia', value: 'Cardápio muda todo dia — se o cadastro é lento, vira trabalho extra bem na hora do corre do almoço.' },
      { label: 'Fiado do cliente fixo', value: 'Quem almoça toda semana e paga no fim do mês precisa de controle claro, não de memória ou caderno.' },
      { label: 'Entregas espalhadas', value: 'Pedido de empresa, encomenda do dia anterior e balcão andam juntos sem organização, e alguma entrega sempre escapa da conta.' }
    ],
    featuresTitle: 'Sistema PDV para Marmitaria: do prato do dia ao fechamento',
    featuresIntro:
      'A marmitaria precisa de agilidade para cadastrar o prato do dia e clareza para fechar o mês com fiado e entregas organizados. O Zelo junta frente de caixa, fiado, estoque e financeiro numa operação simples de aprender.',
    features: [
      {
        icon: '⚡',
        title: 'Cadastro rápido da marmita do dia',
        description:
          'Cadastre o prato ou o combo do dia como um produto e ajuste amanhã em minutos. Sem precisar montar cardápio novo do zero toda manhã.'
      },
      {
        icon: '📒',
        title: 'Fiado do cliente fixo',
        description:
          'Cadastre o cliente que almoça toda semana, acompanhe limite e histórico, e saiba exatamente quanto cada um deve — sem depender de memória ou caderno.'
      },
      {
        icon: '🧾',
        title: 'Entregas com pagamento certo',
        description:
          'Registre pedidos para empresas próximas e entregas avulsas com a forma de pagamento já definida, evitando esquecimento na hora de cobrar.'
      },
      {
        icon: '📱',
        title: 'Cardápio online com publicação do estoque',
        description:
          `Com o ZeloMenu (adicional de +${MENU_PRICE}/mês), publique o cardápio do dia direto do estoque. Cliente fixo confere o prato do dia pelo celular antes de pedir.`
      },
      {
        icon: '📦',
        title: 'Estoque de insumos do dia a dia',
        description:
          'Acompanhe os itens que precisam de reposição para não faltar ingrediente no meio da produção do prato do dia.'
      },
      {
        icon: '💰',
        title: 'Lucro real no fim do mês',
        description:
          'Lance despesas, acompanhe entradas de balcão, fiado e entregas, e veja o que realmente sobrou. Vender bastante marmita não garante lucro quando o fiado não fecha e a despesa some da conta.'
      }
    ],
    howTitle: 'Como o Zelo entra na rotina da sua marmitaria',
    howIntro:
      'A proposta é acompanhar o corre real da marmitaria: prato do dia de manhã, entregas no meio da manhã, fiado organizado no fim do mês.',
    steps: [
      {
        title: 'Cadastre o prato do dia e os clientes fixos',
        description:
          'De manhã, você ajusta o prato ou combo do dia e já tem a base de clientes fiéis pronta para vender rápido e registrar fiado quando for o caso.'
      },
      {
        title: 'Registre balcão, encomenda e entrega',
        description:
          'Cada venda entra no sistema com a forma de pagamento certa, seja cliente que chegou no balcão, empresa que encomendou ou entrega avulsa.'
      },
      {
        title: 'Feche o mês com fiado e despesas em dia',
        description:
          'No fechamento, você confere quem ainda deve, lança as despesas do período e entende com clareza o que sobrou de verdade.'
      }
    ],
    faqSpecific: [
      {
        question: 'O Zelo PDV ajuda a organizar a marmita do dia, que muda toda manhã?',
        answer:
          'Sim. Você cadastra o prato ou combo do dia como um produto e ajusta em poucos minutos sempre que o cardápio mudar, sem precisar recriar tudo do zero.'
      },
      {
        question: 'Consigo controlar o fiado dos clientes que almoçam toda semana?',
        answer:
          'Sim. O sistema tem carteira de clientes integrada, com limite e histórico por pessoa — ideal para quem tem cliente fixo que paga no fim do mês.'
      },
      {
        question: 'Dá para registrar encomendas de empresas próximas?',
        answer:
          'Você pode registrar essas vendas no sistema com a forma de pagamento definida, do mesmo jeito que uma venda de balcão. Hoje o Zelo não tem um módulo dedicado de agendamento de encomenda com data futura — a venda é registrada quando é feita ou entregue.'
      },
      {
        question: 'O sistema serve para quem também entrega marmita fora do balcão?',
        answer:
          'Sim. As entregas ficam registradas com forma de pagamento e, se quiser, você também pode registrar vendas feitas por iFood ou outros apps com a taxa da plataforma configurada.'
      },
      {
        question: 'Ajuda a saber se a marmitaria tem lucro real, mesmo com fiado?',
        answer:
          'Sim. Ao lançar despesas e acompanhar vendas de balcão, fiado e entregas juntos, você entende o que realmente sobrou no mês, sem depender de planilha paralela.'
      },
      {
        question: 'Preciso instalar algum programa?',
        answer:
          'Não. O Zelo PDV roda direto no navegador, em computador, notebook ou tablet, sem instalação complicada.'
      }
    ],
    finalCtaTitle: `Teste na sua marmitaria por ${TRIAL_DAYS} dias`,
    finalCtaText:
      'Se a sua marmitaria precisa de mais controle sobre o prato do dia, o fiado do cliente fixo e as entregas, vale testar o Zelo na rotina real da cozinha. Sem cartão, sem compromisso.'
  }
};

export function buildFaqSchema(page) {
  return buildGenericFaqSchema(page.faqSpecific);
}

// WebPage JSON-LD com dateModified real (não inventamos datePublished, pois
// não temos data de publicação original registrada para as landing pages).
export function buildWebPageSchemaForSegment(page) {
  return buildWebPageSchema({
    url: page.meta.canonical,
    name: page.meta.title,
    dateModified: page.updatedAt
  });
}
