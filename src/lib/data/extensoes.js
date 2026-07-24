// Marketing data for the consolidated /extensoes page.
// Each entry feeds one section of the single-scroll page (anchor = slug).
//
// Two kinds of entries:
//   - kind: 'addon'  → cobrado como SubscriptionItem extra no Stripe (Mesas, Pedidos)
//   - kind: 'plan'   → produto separado (ZeloChat, vira upgrade pro Bundle)
//
// To add a new addon: append an entry here and ensure pricing.js + the
// toggle/webhook addon map are in sync.

import { ADDONS, PLANS } from '$lib/pricing';

const BASE_URL = 'https://zelopdv.com.br';

export const extensoes = {
  mesas: {
    slug: 'mesas',
    addonId: 'mesas',
    meta: {
      title: 'Módulo Mesas — Comandas, Divisão de Conta e Mapa de Salão | Zelo PDV',
      description:
        'Add-on do Zelo PDV para bares, hamburguerias e restaurantes pequenos. Mapa de mesas, comanda acumulativa, divisão entre N pessoas, taxa de serviço, couvert e pré-conta. +R$ 30/mês sobre o plano base.',
      canonical: `${BASE_URL}/extensoes#mesas`
    },
    heroBadge: 'Add-on Zelo PDV',
    h1: 'Módulo Mesas: Comanda, Divisão de Conta e Mapa de Salão',
    subtitle:
      'Para bares, hamburguerias e restaurantes pequenos que precisam organizar mesas e comandas sem virar refém de um sistema gigante. Habilita no checkout ou direto na sua assinatura.',
    forSegments: ['Bares', 'Hamburguerias', 'Restaurantes pequenos', 'Açaiterias', 'Pizzarias'],
    highlights: [
      'Mapa visual de mesas com status livre, ocupada e fechando',
      'Comanda acumulativa por mesa — adiciona itens durante a permanência',
      'Taxa de serviço, couvert e desconto por comanda',
      'Divisão igual entre N pessoas com um clique'
    ],
    problemTitle: 'Quando a casa enche e a comanda vira papel rasgado',
    problemParagraphs: [
      'Em bar pequeno e hamburgueria de bairro, a operação corre bem até a casa lotar. Aí o garçom passa a anotar pedido em folha solta, o caixa precisa decifrar a letra de quem atendeu, e dividir a conta entre quatro amigos vira contabilidade na calculadora.',
      'Sistema grande de restaurante resolve isso, mas cobra R$ 200, R$ 300 por mês — preço que não cabe pra quem vende almoço executivo, lanche de balcão ou cerveja em mesa de calçada.',
      'O Módulo Mesas do Zelo PDV resolve só essa dor: organizar comanda, dividir conta e fechar a mesa. Sem te empurrar 50 features que você não precisa, sem mensalidade absurda, e sem instalar nada.'
    ],
    problemPoints: [
      { label: 'Comanda no papel', value: 'Letra borrada, folha rasgada, item esquecido na hora de fechar.' },
      { label: 'Dividir conta', value: 'Quatro amigos pediram coisas diferentes — dá pra dividir igual? Calculadora na mão e prejuízo embutido.' },
      { label: 'Mapa do salão', value: 'Garçom não sabe se a mesa 6 já fechou, cliente espera de pé, atendimento atrasa.' }
    ],
    featuresTitle: 'O que muda na rotina com o Módulo Mesas',
    featuresIntro:
      'Tudo no navegador, integrado com o caixa do Zelo PDV. Os pedidos da mesa entram na frente de caixa, o estoque baixa automático e o fechamento sai com a venda já registrada.',
    features: [
      {
        icon: '🗺️',
        title: 'Mapa visual do salão',
        description:
          'Veja todas as mesas em uma tela, com status colorido (livre, ocupada, fechando). O garçom abre, lança item e fecha pelo celular ou tablet sem voltar pro caixa.'
      },
      {
        icon: '📋',
        title: 'Comanda acumulativa',
        description:
          'A mesa fica aberta enquanto o cliente está lá. Cada novo pedido entra na mesma comanda, com horário, item e preço. Na hora de fechar, sai tudo somado.'
      },
      {
        icon: '➗',
        title: 'Divisão de conta entre N pessoas',
        description:
          'Um clique divide a comanda igual entre o número de pessoas que sentaram. Cada pessoa paga sua parte, com troco se for em dinheiro.'
      },
      {
        icon: '🍷',
        title: 'Taxa de serviço, couvert e desconto',
        description:
          'Configura a taxa de 10% (opcional, gorjeta do garçom), couvert artístico para casas com música ao vivo, e dá desconto na comanda toda quando precisa.'
      },
      {
        icon: '🧾',
        title: 'Pré-conta antes de fechar',
        description:
          'Imprime ou envia pelo WhatsApp uma pré-conta para o cliente conferir. Reduz reclamação e devolve a mesa pro próximo cliente mais rápido.'
      },
      {
        icon: '🔄',
        title: 'Transferência de mesa',
        description:
          'Cliente quer mudar pra mesa maior? Um clique transfere a comanda inteira. Sem perda de itens, sem reabertura, sem confusão.'
      }
    ],
    howTitle: 'Como funciona na rotina do bar ou restaurante',
    howIntro:
      'Em até 10 minutos a casa começa a usar. O atendimento melhora no primeiro turno.',
    steps: [
      {
        title: 'Cadastre suas mesas',
        description:
          'Em /gestao/mesas você define numeração e capacidade. Pode usar nomes ("Mesa do canto", "Varanda 1") ou números — o que faz sentido pra sua casa.'
      },
      {
        title: 'Abra a mesa quando o cliente sentar',
        description:
          'Toca na mesa no mapa, define o número de pessoas e começa a lançar itens. Cada item acumula na comanda com horário registrado.'
      },
      {
        title: 'Feche pelo PDV',
        description:
          'Manda imprimir a pré-conta, recebe pagamento (pode dividir entre N pessoas, em formas mistas), e a venda entra direto no fechamento de caixa.'
      }
    ],
    testimonial: {
      name: 'Rafael S.',
      business: 'Bar do Rafa',
      city: 'Bauru, SP',
      quote:
        'Antes a gente perdia comanda toda sexta. Agora a casa enche, divide a conta no clique e o caixa fecha redondo.',
      note: 'Usa o Zelo com Mesas em duas casas, mesa pelo tablet do garçom e fechamento no caixa do balcão.'
    },
    faqSpecific: [
      {
        question: 'O Módulo Mesas substitui um sistema de bar grande?',
        answer:
          'Para a maioria dos bares pequenos e hamburguerias de bairro, sim. Ele cobre o essencial: comanda, divisão, taxa de serviço, couvert, mapa de mesas e pré-conta. Quem precisa de KDS de cozinha completo, gestão de garçons por comissão e integração com balança de prato pesa por kg pode precisar de algo mais robusto. Para o resto, o Módulo Mesas resolve.'
      },
      {
        question: 'Funciona em tablet do garçom?',
        answer:
          'Sim. O atendimento foi pensado mobile-first — o garçom abre a mesa, lança item e fecha tudo pelo celular ou tablet. Não precisa instalar app, é direto pelo navegador.'
      },
      {
        question: 'Posso ativar e desativar a qualquer momento?',
        answer:
          'Pode. Liga e desliga direto na sua página /assinatura. Liga em festa de fim de ano, desliga depois. A cobrança é proporcional pelo Stripe.'
      },
      {
        question: 'Quanto custa?',
        answer:
          '+R$ 30/mês sobre o plano base de R$ 59. Total fica R$ 89/mês. Não tem taxa de adesão e o primeiro mês é grátis durante o trial de 30 dias.'
      }
    ],
    finalCtaTitle: 'Teste o Zelo PDV com Mesas por 30 dias grátis',
    finalCtaText:
      'Cria conta sem cartão, ativa o Módulo Mesas no checkout e usa por trinta dias completos. Se não fizer sentido pra sua casa, é só deixar o trial expirar.'
  },

  'pedidos-cozinha': {
    slug: 'pedidos-cozinha',
    addonId: 'pedidos',
    meta: {
      title: 'Pedidos + Cozinha — Atendente, Caixa e Painel de Preparo | Zelo PDV',
      description:
        'Add-on do Zelo PDV para lanchonetes e hamburguerias com atendimento separado de caixa. Atendente lança o pedido, cozinha vê na tela em tempo real, caixa recebe sem pegar o ticket de volta. +R$ 30/mês.',
      canonical: `${BASE_URL}/extensoes#pedidos-cozinha`
    },
    heroBadge: 'Add-on Zelo PDV',
    h1: 'Pedidos + Cozinha: Atendente Anota, Cozinha Prepara, Caixa Cobra',
    subtitle:
      'Quando a sua operação tem atendente de balcão, cozinha de fundo e caixa separado, o pedido precisa fluir entre eles sem ticket de papel. Esse add-on resolve.',
    forSegments: ['Lanchonetes', 'Hamburguerias', 'Açaiterias', 'Pequenos deliveries', 'Quentinhas'],
    highlights: [
      'Atendente lança pedido pelo celular sem pegar dinheiro',
      'Cozinha acompanha em painel kiosk em tempo real',
      'Caixa recebe os pedidos prontos e cobra direto',
      'Funciona em mesa também (envia item pra cozinha pela comanda)'
    ],
    problemTitle: 'Quando o ticket de papel vira o gargalo da operação',
    problemParagraphs: [
      'Em hamburgueria pequena que separa atendimento de caixa, o fluxo costuma ser: atendente anota num bloquinho, leva o papel pra cozinha, cozinha faz, traz de volta pro caixa, cliente paga. Cada papel que troca de mão é uma chance de pedido errado, item esquecido e fila parada.',
      'Sistema de delivery completo (WhatsMenu, KCMS, iFood PDV) resolve, mas custa R$ 150 a R$ 300 por mês — caro pra quem fatura R$ 15 mil/mês numa lanchonete de bairro.',
      'O Pedidos + Cozinha do Zelo PDV é a versão enxuta dessa ideia: três telas conversando entre si (atendente, cozinha, caixa) com pedido digital fluindo em tempo real, sem papel e sem mensalidade absurda.'
    ],
    problemPoints: [
      { label: 'Ticket de papel', value: 'Some, borra, fica ilegível na hora do pico. Já causou item errado mais vezes do que gostaríamos de admitir.' },
      { label: 'Cozinha "às escuras"', value: 'Sem visualizar a fila, a cozinha trabalha por intuição. Pedido velho fica esperando, o novo fura na frente.' },
      { label: 'Caixa esperando', value: 'O caixa fica parado pegando ticket de papel pra cobrar. Cliente entra, sai, e a fila não anda.' }
    ],
    featuresTitle: 'O que muda na rotina com Pedidos + Cozinha',
    featuresIntro:
      'Três telas otimizadas pra cada papel da operação. Tudo no navegador, sem instalar app, sem KDS proprietário, sem licença extra.',
    features: [
      {
        icon: '📲',
        title: 'Tela do atendente',
        description:
          'Atendente lança pedidos pelo celular, tablet ou computador. Pode dar nome ao pedido ("João", "retirada balcão", "mesa externa") e marcar quais itens vão pra cozinha — porque suco e refri não precisam preparar.'
      },
      {
        icon: '🍳',
        title: 'Painel da cozinha',
        description:
          'Display kiosk em tela escura, otimizado pra ficar pendurado na parede da cozinha. Pedidos abertos à esquerda, prontos à direita. Toca no item pra marcar como pronto. Atualiza em tempo real via Supabase Realtime.'
      },
      {
        icon: '💵',
        title: 'Fila do caixa',
        description:
          'O caixa vê só os pedidos com status "aberto" ou "pronto" — atendente já fez o trabalho de digitar tudo. O caixa só seleciona, abre o modal de pagamento e cobra. Estoque baixa, venda vai pro fechamento.'
      },
      {
        icon: '🔗',
        title: 'Integra com Mesas',
        description:
          'Se você tem o Módulo Mesas também, pode mandar item da comanda direto pra cozinha pelo botão "Enviar pra cozinha". Fica numa fila só do cozinheiro, indiferente da origem (balcão ou mesa).'
      },
      {
        icon: '📊',
        title: 'Histórico completo',
        description:
          'Cada pedido fica registrado com horário de criação, horário de fecho, atendente (futuro), itens, observações e quem cobrou. Reconciliação fácil no fim do dia.'
      },
      {
        icon: '⚡',
        title: 'Tempo real, zero polling pesado',
        description:
          'A cozinha usa Supabase Realtime — não fica recarregando a tela. O caixa atualiza a cada 3s. Funciona em rede WiFi do estabelecimento normalmente.'
      }
    ],
    howTitle: 'Como funciona na rotina da lanchonete ou hamburgueria',
    howIntro:
      'Pra casa que tem atendente, cozinha e caixa separados, isso muda o ritmo da fila no primeiro turno.',
    steps: [
      {
        title: 'Atendente lança o pedido',
        description:
          'No celular ou tablet, em /app/pedidos/novo. Coloca o nome do cliente, seleciona itens e marca quais vão pra cozinha. Cria o pedido em segundos.'
      },
      {
        title: 'Cozinha prepara',
        description:
          'O painel /app/pedidos/cozinha (display escuro montado na parede) mostra a fila. O cozinheiro toca no item quando termina. Quando todos os itens do pedido estão prontos, o pedido vira "pronto" automaticamente.'
      },
      {
        title: 'Caixa cobra',
        description:
          'Em /app/pedidos, o caixa vê a fila ordenada. Seleciona o pedido pronto, abre o modal de pagamento (PIX, cartão, dinheiro, fiado, múltiplo), recebe e fecha. Estoque baixa, venda registra, dia avança.'
      }
    ],
    testimonial: {
      name: 'Camila P.',
      business: 'Hamburgueria Zé Camila',
      city: 'Belo Horizonte, MG',
      quote:
        'Antes a gente perdia 15 minutos no pico só batendo papel da cozinha. Agora atende, cozinha, paga, próximo. Triplicou a fila sem aumentar o atendente.',
      note: 'Usa Pedidos + Cozinha em uma hamburgueria com 1 atendente, 2 cozinheiros e 1 caixa.'
    },
    faqSpecific: [
      {
        question: 'Vale a pena se eu sou só eu no balcão?',
        answer:
          'Provavelmente não. Se você é o atendente, cozinheiro e caixa ao mesmo tempo, o PDV simples já resolve. Esse add-on faz sentido quando você tem pelo menos duas pessoas cuidando de papéis diferentes (atendente e cozinha, por exemplo) e o ticket de papel está atrapalhando.'
      },
      {
        question: 'Preciso de TV ou monitor extra na cozinha?',
        answer:
          'Recomendamos sim — uma TV ou monitor de 24" pendurado em altura visível. O painel é otimizado pra display kiosk e se atualiza sozinho. Mas funciona em tablet também, se for o que tiver à mão.'
      },
      {
        question: 'Funciona em delivery?',
        answer:
          'Funciona pra delivery próprio (sem iFood). Você lança o pedido como atendente normal, marca como retirada ou entrega, e o fluxo segue igual. Integração com iFood/WhatsApp é roadmap, não está pronta hoje.'
      },
      {
        question: 'Posso usar com Mesas ao mesmo tempo?',
        answer:
          'Pode e é a combinação ideal pra hamburgueria com salão. O Mesas cuida da comanda da mesa; o Pedidos + Cozinha manda item pra cozinha (vindo do balcão ou da mesa). Os dois add-ons custam R$ 30 cada — total R$ 119/mês com plano base.'
      },
      {
        question: 'Quanto custa?',
        answer:
          '+R$ 30/mês sobre o plano base de R$ 59. Total fica R$ 89/mês. Sem taxa de adesão. Primeiro mês grátis durante o trial.'
      }
    ],
    finalCtaTitle: 'Teste Pedidos + Cozinha por 30 dias grátis',
    finalCtaText:
      'Cria conta sem cartão, ativa o add-on no checkout e usa por trinta dias completos. Se não fizer diferença na sua fila, é só deixar o trial expirar.'
  },

  acessos: {
    slug: 'acessos',
    addonId: 'acessos',
    meta: {
      title: 'Controle de Acessos — Equipe com Cargos e Permissões | Zelo PDV',
      description:
        'Add-on do Zelo PDV para negócios com equipe. Crie até 5 subusuários por e-mail, organize em cargos como Caixa, Atendente e Gerente, e controle quem pode fazer o quê no sistema. +R$ 30/mês.',
      canonical: `${BASE_URL}/extensoes#acessos`
    },
    heroBadge: 'Add-on Zelo PDV',
    h1: 'Controle de Acessos: Equipe com Cargos e Permissões',
    subtitle:
      'Para negócios com mais de uma pessoa na operação. Convide sua equipe por e-mail, defina o que cada cargo pode fazer, e mantenha o dono no controle de tudo que importa.',
    forSegments: ['Restaurantes com equipe', 'Hamburguerias', 'Lanchonetes', 'Bares', 'Pequenos comércios'],
    highlights: [
      'Até 5 subusuários com login próprio — sem compartilhar senha',
      'Cargos padrão prontos: Caixa, Atendente e Gerente',
      'Permissões por checkbox por grupo de funcionalidade',
      'Log de auditoria automático para ações sensíveis'
    ],
    problemTitle: 'Quando todo mundo usa a mesma senha e ninguém sabe quem fez o quê',
    problemParagraphs: [
      'Lanchonete com dois ou três funcionários quase sempre começa com todo mundo logado na mesma conta. No começo funciona. Com o tempo o caixa fecha errado, uma venda some, e ninguém lembra quem estava no turno.',
      'Sistemas de controle de acesso empresarial cobram R$ 100, R$ 200 por funcionalidade, com permissões complexas que demoram uma tarde inteira pra configurar — e ainda cobram por usuário.',
      'O Controle de Acessos do Zelo PDV é a versão prática disso: convide a equipe por e-mail, escolha o cargo (Caixa, Atendente, Gerente), ajuste o que cada um pode fazer, e pronto. Cada pessoa entra com login próprio, sem compartilhar senha, e tudo fica rastreado.'
    ],
    problemPoints: [
      { label: 'Senha compartilhada', value: 'Caixa abre, atendente fecha, gerente cancela venda — tudo na mesma conta. Se algo der errado, não tem como saber quem fez.' },
      { label: 'Sem controle de operação', value: 'Funcionário aplica desconto sem autorização, cancela venda no caixa, ou acessa relatórios financeiros sem precisar. O dono só descobre no fechamento.' },
      { label: 'Auditoria manual', value: 'Verificar o que aconteceu num turno vira trabalho de detetive — checando WhatsApp, caderno e memória do caixa.' }
    ],
    featuresTitle: 'O que muda na operação com Controle de Acessos',
    featuresIntro:
      'Cada funcionário entra com e-mail e senha próprios. As permissões do cargo determinam exatamente o que ele vê e faz — sem configuração por script, sem tela técnica, só checkboxes.',
    features: [
      {
        icon: '👥',
        title: 'Até 5 subusuários',
        description:
          'Convide até cinco pessoas da equipe por e-mail. Cada uma recebe um link de acesso, cria a própria senha e entra no sistema com o contexto da sua empresa — sem criar uma conta avulsa.'
      },
      {
        icon: '🎭',
        title: 'Cargos com permissões',
        description:
          'Três cargos prontos: Caixa (vende, recebe, abre e fecha caixa), Atendente (lança pedidos e mesas) e Gerente (gestão operacional completa, sem acessar assinatura). Edite as permissões de cada cargo por checkboxes.'
      },
      {
        icon: '🔒',
        title: 'Dono sempre no controle',
        description:
          'Assinatura, extensões, configurações de acesso e PIN de segurança são exclusivos do dono da conta. Nenhum cargo, nem Gerente, pode alterar isso.'
      },
      {
        icon: '📋',
        title: 'Log de auditoria automático',
        description:
          'Toda ação sensível fica registrada com operador, horário e detalhe: venda, cancelamento, abertura de caixa, sangria, despesa, ajuste de estoque. Você sabe o que aconteceu em cada turno.'
      },
      {
        icon: '🧩',
        title: 'Permissões por módulo',
        description:
          'As permissões de Mesas e Pedidos/Cozinha só aparecem na matriz se você tiver esses add-ons ativos. Se desativar um módulo, as permissões ficam salvas pra quando reativar.'
      },
      {
        icon: '✉️',
        title: 'Convite por e-mail',
        description:
          'O funcionário recebe um e-mail com link pra criar senha e entrar. Sem burocracia de CPF ou formulário longo. O dono pode bloquear ou remover o acesso a qualquer momento.'
      }
    ],
    howTitle: 'Como funciona na prática',
    howIntro:
      'Três passos e a equipe já opera com login próprio. O dono configura uma vez, a rotina muda no próximo turno.',
    steps: [
      {
        title: 'Ative o add-on em Extensões',
        description:
          'Em /gestao/extensoes, clique em "Ativar" no card Controle de Acessos. O item "Acessos" aparece no menu lateral da gestão.'
      },
      {
        title: 'Configure os cargos e permissões',
        description:
          'Em /gestao/acessos, veja os cargos padrão (Caixa, Atendente, Gerente) e ajuste as permissões por checkbox conforme a sua operação. Pode renomear ou criar novos cargos.'
      },
      {
        title: 'Convide a equipe por e-mail',
        description:
          'Na aba Usuários, adicione o e-mail de cada funcionário, escolha o cargo e clique em Convidar. Cada pessoa recebe o link de acesso e entra com senha própria.'
      }
    ],
    testimonial: {
      name: 'Patrícia R.',
      business: 'Lanchonete da Pat',
      city: 'Campinas, SP',
      quote:
        'Antes todo mundo usava minha senha. Hoje cada um entra com o próprio login, eu sei quem cancelou o quê, e minha equipe não acessa os relatórios financeiros.',
      note: 'Usa Controle de Acessos com 3 funcionários — 1 caixa, 1 atendente e 1 gerente de turno.'
    },
    faqSpecific: [
      {
        question: 'Quantos subusuários posso criar?',
        answer:
          'O MVP suporta até 5 subusuários ativos por empresa. Se você precisar de mais, entre em contato — estamos planejando opções para equipes maiores.'
      },
      {
        question: 'O funcionário vai ver os meus relatórios financeiros?',
        answer:
          'Depende do cargo. Por padrão, Caixa e Atendente não têm acesso a relatórios. O Gerente tem, mas você pode desmarcar essa permissão no checkbox do cargo. O dono sempre mantém acesso total.'
      },
      {
        question: 'O que acontece se eu desativar o add-on?',
        answer:
          'Os subusuários perdem acesso imediatamente, mas os dados (cargos, vínculos, histórico) ficam salvos. Se você reativar, tudo volta como estava — sem precisar reconvidar.'
      },
      {
        question: 'Funciona com Mesas e Pedidos + Cozinha ao mesmo tempo?',
        answer:
          'Sim. As permissões de Mesas e Pedidos/Cozinha aparecem na matriz de cada cargo quando esses add-ons estão ativos. Você controla quem pode abrir mesa, lançar pedido, acessar o painel da cozinha e receber no caixa.'
      },
      {
        question: 'Quanto custa?',
        answer:
          '+R$ 30/mês sobre o plano base de R$ 59. Total fica R$ 89/mês. Sem taxa de adesão. Primeiro mês grátis durante o trial.'
      }
    ],
    finalCtaTitle: 'Teste o Controle de Acessos por 30 dias grátis',
    finalCtaText:
      'Cria conta sem cartão, ativa o add-on no checkout e convide sua equipe. Se não fizer sentido pra sua operação, é só deixar o trial expirar.'
  },

  chat: {
    slug: 'chat',
    kind: 'plan',
    addonId: null,
    external: true,
    externalUrl: 'https://chat.zelopdv.com.br',
    upgradeHref: '/cadastro?plan=bundle',
    standalonePrice: PLANS.chat.price,
    bundleDelta: PLANS.bundle.price - PLANS.pdv.price,
    meta: {
      title: 'Zelo Chat — Atendimento WhatsApp com IA | Zelo PDV',
      description:
        'Atendimento automático via WhatsApp com IA. Responde clientes, anota pedidos, dispara alertas humanos quando precisar. Inclui ZeloMenu. Disponível como upgrade do Zelo PDV (+R$ 139/mês no pacote completo) ou standalone R$ 149.',
      canonical: `${BASE_URL}/extensoes#chat`
    },
    h1: 'Zelo Chat: WhatsApp atendido por IA + ZeloMenu incluso',
    subtitle:
      'Para quem perde venda no WhatsApp porque ninguém responde a tempo. A IA atende, anota o pedido e te chama só quando precisar de humano. ZeloMenu incluso — cardápio digital, pedidos online e painel de cozinha.',
    forSegments: ['Lanchonetes', 'Hamburguerias', 'Pequenos deliveries', 'Restaurantes', 'Pizzarias'],
    highlights: [
      'IA responde clientes 24/7 com tom da sua marca',
      'Anota pedido, calcula valor, confirma endereço',
      'Dispara alerta humano quando o caso pede',
      'Pedido cai direto no caixa do Zelo PDV'
    ],
    problemTitle: 'WhatsApp parado é venda perdida',
    problemParagraphs: [
      'A maioria das lanchonetes pequenas vende muito mais pelo WhatsApp do que admite. O problema é que ninguém consegue responder no horário do almoço, no pico da noite, ou nos dias que o atendente faltou.',
      'Cliente manda "tem hambúrguer hoje?" às 12h05. Você responde 12h47. Ele já comeu em outro lugar. Multiplique isso por 30 mensagens por dia e tá aí o motivo do mês ter fechado fraco.',
      'O Zelo Chat coloca uma IA na sua conta de WhatsApp Business que responde no segundo zero, anota o pedido com cardápio em mãos, e te chama só quando o cliente pede algo fora do roteiro.'
    ],
    problemPoints: [
      { label: 'Resposta lenta', value: 'Cliente sai pra outro estabelecimento enquanto você termina o lanche da mesa 4.' },
      { label: 'Cardápio repetido', value: 'Mesma pergunta, mesma resposta, dez vezes por dia. Atendente cansa, erra preço, esquece sabor.' },
      { label: 'Pedido perdido', value: 'Mensagem que entrou no meio de outra conversa. Cliente espera, você não viu, vira reclamação.' }
    ],
    featuresTitle: 'O que o Zelo Chat faz no seu WhatsApp',
    featuresIntro:
      'IA treinada com seu cardápio, seu tom de marca e suas regras de negócio. Integra direto com o Zelo PDV — pedido fechado vira venda no caixa.',
    features: [
      {
        icon: 'chat',
        title: 'Atende 24/7 sem demora',
        description:
          'Responde no segundo zero, com tom da sua marca. Trabalha enquanto você está na cozinha, no banco, ou dormindo. Cliente nunca fica esperando.'
      },
      {
        icon: 'menu',
        title: 'Anota pedido com cardápio em mãos',
        description:
          'Sabe o que tem no cardápio, calcula valor com adicionais, confirma endereço pra delivery, calcula taxa de entrega. Pedido sai pronto pra cozinha.'
      },
      {
        icon: 'alert',
        title: 'Chama humano quando precisa',
        description:
          'Se o cliente pede algo fora do roteiro (alergia, observação fora do padrão, troca complexa), a IA pausa e te avisa pra entrar na conversa.'
      },
      {
        icon: 'sync',
        title: 'Integrado com o Zelo PDV',
        description:
          'Pedido confirmado no chat vira venda direto no caixa. Estoque baixa, fechamento sai redondo, e você não precisa redigitar nada.'
      },
      {
        icon: 'tone',
        title: 'Treinado com sua marca',
        description:
          'Configura tom (informal, formal, descontraído), gírias regionais, e expressões que você usa com cliente. A IA fala como você falaria.'
      },
      {
        icon: 'shield',
        title: 'WhatsApp Business oficial',
        description:
          'Usa a API oficial do WhatsApp Business — sem risco de banimento. Você mantém o número, o histórico, os contatos.'
      }
    ],
    howTitle: 'Como funciona',
    howIntro: 'Setup em 30 minutos. Você fala com o cliente que quiser; a IA cobre o resto.',
    steps: [
      {
        title: 'Conecte seu WhatsApp Business',
        description:
          'Em chat.zelopdv.com.br você liga seu número via API oficial do WhatsApp. Não precisa trocar de número, não perde histórico.'
      },
      {
        title: 'Treine a IA com seu cardápio',
        description:
          'Sobe o cardápio, define tom da marca, configura faixa de entrega, taxa, formas de pagamento. Em alguns minutos a IA tá afiada.'
      },
      {
        title: 'Receba pedido pronto no Zelo PDV',
        description:
          'Cliente conversou no WhatsApp, a IA fechou o pedido, o pedido caiu no seu /app/pedidos. Cozinha prepara, caixa cobra, dia avança.'
      }
    ],
    testimonial: {
      name: 'Diego M.',
      business: 'Hamburgueria Don Diego',
      city: 'Curitiba, PR',
      quote:
        'Antes a gente respondia WhatsApp na correria entre pedido e pedido. Hoje a IA responde tudo, e a gente só entra quando ela passa o caso. Faturamento subiu uns 25% só de não perder cliente que ficava sem resposta.',
      note: 'Usa Zelo Chat conectado ao Zelo PDV — pedido do WhatsApp cai direto na cozinha.'
    },
    faqSpecific: [
      {
        question: 'Zelo Chat é o mesmo plano do Zelo PDV?',
        answer:
          'Não. O Zelo Chat é um produto separado, mas que se conecta ao Zelo PDV. O Zelo Chat já inclui o ZeloMenu (cardápio digital, pedidos online e painel de cozinha). Quem já assina o PDV pode adicionar o Chat fazendo upgrade pro Pacote Gestão + Atendimento por +R$ 139/mês (em vez de R$ 149 standalone). O Chat funciona sem PDV também, se for o caso.'
      },
      {
        question: 'Posso testar antes de assinar?',
        answer:
          'Sim. Em chat.zelopdv.com.br você cria uma conta e faz a configuração inicial. O período inicial é gratuito pra você ver a IA respondendo no seu WhatsApp antes de cobrar.'
      },
      {
        question: 'A IA vai responder coisa errada e perder cliente?',
        answer:
          'A IA é treinada com seu cardápio, suas regras, seu tom. Quando ela detecta que está fora do roteiro, pausa e te avisa antes de mandar resposta errada. Você pode revisar todas as conversas no painel.'
      },
      {
        question: 'Funciona com WhatsApp pessoal ou só Business?',
        answer:
          'Só com WhatsApp Business via API oficial. É a única forma sem risco de banimento e que permite IA. Se você usa WhatsApp pessoal hoje, a gente ajuda na migração — você não perde número nem contatos.'
      }
    ],
    finalCtaTitle: 'Conheça o Zelo Chat em chat.zelopdv.com.br',
    finalCtaText:
      'Site oficial com demo, configurador e cadastro. Ou ative direto no Zelo PDV escolhendo o Pacote Gestão + Atendimento no checkout.'
  },

  menu: {
    slug: 'menu',
    addonId: 'menu',
    meta: {
      title: 'ZeloMenu — Cardápio Online com Publicação para Clientes | Zelo PDV',
      description:
        'Publique o cardápio do seu negócio online. +R$ 40/mês como add-on do Zelo PDV. Clientes acessam produtos, preços e variações pelo celular.',
      canonical: `${BASE_URL}/extensoes#menu`
    },
    heroBadge: 'Add-on Zelo PDV',
    h1: 'ZeloMenu: cardápio digital, pedidos online e painel de cozinha',
    subtitle:
      'A extensão mais completa do Zelo PDV. Publique seu cardápio online, receba pedidos do WhatsApp e iFood, e acompanhe a fila da cozinha em tempo real. Tudo integrado, sem taxa por pedido.',
    forSegments: ['Hamburguerias', 'Lanchonetes', 'Pizzarias', 'Restaurantes pequenos', 'Açaiterias', 'Deliveries'],
    highlights: [
      'Cardápio online publicado direto do estoque — sem redigitar',
      'Pedidos do WhatsApp, Instagram e iFood integrados',
      'Cozinha acompanha em painel em tempo real com fila organizada',
      'Caixa recebe pedidos prontos e cobra direto — tudo sincronizado',
      'Publicação em lote de vários produtos de uma vez'
    ],
    problemTitle: 'Cardápio impresso desatualizado? Cliente não confia',
    problemParagraphs: [
      'Lanchonete que imprime cardápio no começo do mês convive com preço riscado a caneta, item em falta que o cliente pede e descobre na hora, e sabor sazonal que nunca entra no papel porque "vai que volta". O cliente que pesquisa pelo celular antes de sair de casa vê um cardápio diferente do que está na cozinha.',
      'Sistema de cardápio digital separado (WhatsMenu, iFood Cardápio) custa R$ 100, R$ 200 por mês ou depende de marketplace que cobra comissão por pedido. O ZeloMenu publica o que já está no seu estoque, online, sem cadastro paralelo, sem taxa extra por pedido. R$ 40 extras no plano que já gerencia seu negócio.'
    ],
    problemPoints: [
      { label: 'Cardápio desatualizado', value: 'Preço riscado a caneta, item que acabou e cliente só descobre na hora de pedir.' },
      { label: 'Pedido perdido no vai e vem', value: 'Ticket de papel some entre atendente e cozinha. Item esquecido, fila parada, cliente esperando.' },
      { label: 'Sem presença digital', value: 'Cliente pesquisa "lanche perto de mim" no celular e não encontra seu cardápio. Perde pro concorrente que tem.' }
    ],
    featuresTitle: 'Cardápio digital + pedidos online + painel de cozinha',
    featuresIntro:
      'O ZeloMenu agora unifica cardápio digital, pedidos online e painel de cozinha. O cliente vê o cardápio, faz o pedido, a cozinha prepara e o caixa fecha — tudo no mesmo ecossistema.',
    features: [
      {
        icon: '📦',
        title: 'Publique o que já está no estoque',
        description:
          'Os produtos que você cadastrou no Zelo PDV viram cardápio online sem redigitar nada. Preço, descrição, categoria e variações — tudo sai do cadastro que você já mantém.'
      },
      {
        icon: '📱',
        title: 'Pedidos integrados (WhatsApp, Instagram, iFood)',
        description:
          'Cliente pede pelo WhatsApp, Instagram ou cardápio digital. O pedido cai direto no sistema — atendente vê, cozinha prepara, caixa cobra. Integração com Anota AI, WhatsMenu e iFood.'
      },
      {
        icon: '👨‍🍳',
        title: 'Painel da cozinha em tempo real',
        description:
          'Cozinha acompanha a fila de pedidos em uma tela dedicada. Cada pedido aparece com itens, observações e horário. Quando fica pronto, o caixa é avisado na hora.'
      },
      {
        icon: '🔄',
        title: 'Sincronizado em tempo real',
        description:
          'Alterou preço, esgotou um item ou criou uma variação nova? O cardápio online reflete na hora. Pedido entra, cozinha prepara, caixa fecha — tudo sincronizado.'
      },
      {
        icon: '🔗',
        title: 'Link único para compartilhar',
        description:
          'Cada negócio ganha uma URL pública de cardápio. Coloca no Instagram, no WhatsApp, no QR code da mesa. O cliente abre no celular sem baixar app.'
      },
      {
        icon: '⚡',
        title: 'Publicação em lote',
        description:
          'Seleciona vários produtos de uma vez no estoque e publica todos no cardápio digital. Ideal para quem tem dezenas de itens e não quer publicar um por um.'
      }
    ],
    howTitle: 'Em três passos seu cardápio e pedidos estão no ar',
    howIntro:
      'Nada de configuração técnica. Ativou, publicou, seus pedidos começam a fluir.',
    steps: [
      {
        title: 'Ative o ZeloMenu',
        description:
          'Adicione o ZeloMenu como extensão na sua assinatura (R$ 40/mês). A ativação é instantânea e o primeiro mês é grátis durante o trial.'
      },
      {
        title: 'Publique os produtos do estoque',
        description:
          'Em Gestão > Produtos, marque os itens que quer no cardápio online e clique em "Publicar no menu". Pode publicar um por um ou em lote.'
      },
      {
        title: 'Compartilhe e receba pedidos',
        description:
          'O cardápio está no ar. Compartilhe o link no WhatsApp e Instagram. Pedidos entram direto no sistema — atendente recebe, cozinha prepara, caixa cobra sem papel.'
      }
    ],
    testimonial: {
      name: 'Marcos V.',
      business: 'Hamburgueria do Marcos',
      city: 'São José dos Campos, SP',
      quote:
        'Antes eu tirava foto de cardápio impresso e mandava no WhatsApp toda semana. Agora o cliente abre o link e vê exatamente o que tem hoje. Acabou o "tem X?" no direct.',
      note: 'Usa ZeloMenu + Zelo PDV. Publicou 40 produtos em lote direto do estoque.'
    },
    faqSpecific: [
      {
        question: 'O ZeloMenu substitui o cardápio impresso?',
        answer:
          'Pode substituir ou complementar. Muitos negócios mantêm o cardápio impresso pros clientes que estão no salão e usam o ZeloMenu como cardápio digital pro WhatsApp, Instagram e QR code. O cliente vê o cardápio atualizado antes mesmo de sair de casa.'
      },
      {
        question: 'Precisa de site ou domínio próprio?',
        answer:
          'Não. O ZeloMenu gera uma URL pública dentro do domínio zelopdv.com.br. Você pode compartilhar o link em qualquer lugar — Instagram, WhatsApp, QR code — sem precisar de site próprio.'
      },
      {
        question: 'Funciona com Mesas?',
        answer:
          'Sim. O ZeloMenu é compatível com o Módulo Mesas. O cliente vê o cardápio no QR code da mesa, faz o pedido, que vai direto pro painel da cozinha e fecha no caixa. Tudo integrado.'
      },
      {
        question: 'O ZeloMenu inclui pedidos e painel de cozinha?',
        answer:
          'Sim. O ZeloMenu agora unifica cardápio digital, pedidos online e painel de cozinha em uma única extensão. O cliente vê o cardápio, faz o pedido pelo WhatsApp ou cardápio digital, a cozinha acompanha a fila em tempo real e o caixa recebe o pedido pronto para cobrar — tudo integrado, sem papel, sem redigitar.'
      },
      {
        question: 'Quanto custa?',
        answer:
          '+R$ 40/mês sobre o plano base de R$ 59. Total fica R$ 99/mês. Sem taxa de adesão. Primeiro mês grátis durante o trial.'
      }
    ],
    finalCtaTitle: 'Teste o ZeloMenu por 30 dias grátis',
    finalCtaText:
      'Cria conta sem cartão, ativa o ZeloMenu no checkout e publique seu cardápio online. Se não fizer diferença pros seus clientes, é só deixar o trial expirar.',
    testimonial: {
      name: 'Marcos V.',
      business: 'Hamburgueria do Marcos',
      city: 'São José dos Campos, SP',
      quote:
        'Antes eu tirava foto de cardápio impresso e mandava no WhatsApp toda semana. Agora o cliente abre o link e vê exatamente o que tem hoje. Acabou o "tem X?" no direct.',
      note: 'Usa ZeloMenu + Zelo PDV. Publicou 40 produtos em lote direto do estoque.'
    },
    faqSpecific: [
      {
        question: 'O ZeloMenu substitui o cardápio impresso?',
        answer:
          'Pode substituir ou complementar. Muitos negócios mantêm o cardápio impresso pros clientes que estão no salão e usam o ZeloMenu como cardápio digital pro WhatsApp, Instagram e QR code. O cliente vê o cardápio atualizado antes mesmo de sair de casa.'
      },
      {
        question: 'Precisa de site ou domínio próprio?',
        answer:
          'Não. O ZeloMenu gera uma URL pública dentro do domínio zelopdv.com.br. Você pode compartilhar o link em qualquer lugar — Instagram, WhatsApp, QR code — sem precisar de site próprio.'
      },
      {
        question: 'Funciona com Mesas?',
        answer:
          'Sim. O ZeloMenu é compatível com o Módulo Mesas. O cliente vê o cardápio no QR code da mesa, faz o pedido, que vai direto pro painel da cozinha e fecha no caixa. Tudo integrado.'
      },
      {
        question: 'O ZeloMenu inclui pedidos e painel de cozinha?',
        answer:
          'Sim. O ZeloMenu agora unifica cardápio digital, pedidos online e painel de cozinha em uma única extensão. O cliente vê o cardápio, faz o pedido pelo WhatsApp ou cardápio digital, a cozinha acompanha a fila em tempo real e o caixa recebe o pedido pronto para cobrar — tudo integrado, sem papel, sem redigitar.'
      },
      {
        question: 'Quanto custa?',
        answer:
          '+R$ 40/mês sobre o plano base de R$ 59. Total fica R$ 99/mês. Sem taxa de adesão. Primeiro mês grátis durante o trial.'
      }
    ],
    finalCtaTitle: 'Teste o ZeloMenu por 30 dias grátis',
    finalCtaText:
      'Cria conta sem cartão, ativa o ZeloMenu no checkout e publique seu cardápio online. Se não fizer diferença pros seus clientes, é só deixar o trial expirar.'
  }
};

export function getAddonPrice(addonId) {
  const addon = ADDONS[addonId];
  return addon ? Number(addon.price) : 30;
}

// Preço da extensão Chat quando agregada ao Zelo PDV (delta no Bundle)
export function getChatBundleDelta() {
  return PLANS.bundle.price - PLANS.pdv.price;
}
