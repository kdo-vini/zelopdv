export const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Zelo PDV',
  url: 'https://zelopdv.com.br',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web Browser',
  offers: {
    '@type': 'Offer',
    price: '59.00',
    priceCurrency: 'BRL',
    priceValidUntil: '2027-12-31'
  },
  description: 'Sistema de gestão e frente de caixa para pequenos negócios.'
};

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
    meta: {
      title: 'Sistema PDV para Lanchonete — Caixa, Fiado e Lucro Real | Zelo PDV',
      description:
        'Sistema PDV para lanchonete simples e sem mensalidade surpresa. Controle caixa, fiado e veja o lucro real do seu negócio. Teste grátis 14 dias, sem cartão de crédito, sem instalar nada.',
      canonical: 'https://zelopdv.com.br/para-lanchonetes'
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
    meta: {
      title: 'Sistema para Restaurante — Mesas, Comandas e Caixa | Zelo PDV',
      description:
        'Sistema para restaurante pequeno e médio: controle mesas, comandas, caixa e lucro real. R$ 59/mês + módulo de mesas opcional. Teste grátis 14 dias, sem cartão.',
      canonical: 'https://zelopdv.com.br/para-restaurantes'
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
    meta: {
      title: 'PDV para Hamburgueria — Controle Pedidos e Lucro Sem Complicação | Zelo PDV',
      description:
        'Sistema PDV para hamburgueria: registre pedidos rápido, controle estoque e saiba quanto sobrou no fim do dia. R$ 59/mês, 14 dias grátis, sem cartão.',
      canonical: 'https://zelopdv.com.br/para-hamburguerias'
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
    meta: {
      title: 'Sistema para Delivery Próprio — Gerencie Pedidos e Finanças Sem iFood | Zelo PDV',
      description:
        'Para quem faz delivery por conta própria. Controle pedidos, despesas e lucro sem pagar taxa de marketplace. Sistema simples, R$ 59/mês.',
      canonical: 'https://zelopdv.com.br/para-delivery'
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
    meta: {
      title: 'Sistema de Gestão para MEI — Caixa e Despesas no Celular | Zelo PDV',
      description:
        'Sistema de gestão para MEI de alimentação. Substitua planilha e caderno por controle de caixa, despesas e lucro real. R$ 59/mês, teste grátis.',
      canonical: 'https://zelopdv.com.br/para-mei'
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
  }
};

export function buildFaqSchema(page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqSpecific.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };
}
