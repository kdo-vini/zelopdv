// Marketing data for the consolidated /extensoes page.
// Each entry feeds one section of the single-scroll page (anchor = slug).
// To add a new addon: append an entry here and ensure pricing.js + the
// toggle/webhook addon map are in sync.

import { ADDONS } from '$lib/pricing';

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
  }
};

export function getAddonPrice(addonId) {
  const addon = ADDONS[addonId];
  return addon ? Number(addon.price) : 30;
}
