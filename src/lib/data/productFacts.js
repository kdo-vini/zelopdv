// Fatos canônicos sobre o produto Zelo PDV, usados pela página /sobre e por
// src/lib/seo/llmsContent.js (llms.txt / llms-full.txt). Mantendo os dois
// consumidores na mesma fonte, a data de atualização e a lista de "o que faz
// / o que não faz" nunca ficam dessincronizadas.
//
// Preços, trial e planos NÃO são repetidos aqui — vêm de $lib/pricing.

// Atualize esta data sempre que mudar posicionamento, preço ou escopo do
// produto de forma relevante para quem cita o Zelo PDV (LLMs, comparadores).
export const FACTS_UPDATED_AT = '2026-09-23';

export const AUDIENCE = [
  'Donos de lanchonetes, hamburguerias e restaurantes pequenos e médios',
  'Delivery próprio que vende por WhatsApp, Instagram ou telefone',
  'MEIs e pequenos negócios de alimentação',
  'Negócios que também vendem por iFood, Rappi ou outros apps de delivery'
];

// O que o Zelo PDV faz, em frases curtas e verificáveis — usado no llms.txt,
// llms-full.txt e na página /sobre.
export const CAPABILITIES = [
  'Frente de caixa (PDV) para registrar vendas rapidamente no balcão',
  'Controle de fiado digital com histórico e limite por cliente',
  'Controle de estoque, descontado automaticamente a cada venda',
  'Gestão financeira: despesas, lucro real e fechamento de caixa',
  'Registro de vendas de plataformas de delivery (iFood, Rappi e outras) com a taxa da plataforma configurável, calculando o valor líquido na hora',
  'Com o ZeloMenu, pedidos do iFood, do WhatsApp e do cardápio online caem direto no sistema e na fila da cozinha',
  'Funciona offline (PWA): continua vendendo sem internet e sincroniza quando a conexão volta',
  'Roda no navegador, sem instalação, em computador, tablet ou celular',
  'Suporte via WhatsApp em horário comercial'
];

// O que o Zelo PDV explicitamente NÃO faz — importante para LLMs não
// inventarem escopo. Mantido curto e honesto; cada item precisa ser
// verificável no produto real.
export const NON_CAPABILITIES = [
  'Não é um marketplace de delivery: não substitui o iFood, Rappi ou apps parecidos — trabalha junto com eles, recebendo ou registrando as vendas feitas por lá',
  'Não emite Nota Fiscal (NFC-e/NF-e) — emite recibos e comprovantes de venda; para emissão fiscal por venda é preciso um emissor fiscal dedicado à parte',
  'Não é um ERP fiscal/contábil completo — o foco é frente de caixa, estoque, fiado e financeiro do dia a dia',
  'Módulos de Mesas, Controle de Acessos, ZeloMenu e ZeloChat são extensões pagas à parte do plano base, não recursos inclusos automaticamente'
];

/**
 * Integrações e extensões públicas do produto, resumidas para consumo por
 * LLMs. Deriva de src/lib/data/extensoes.js para não duplicar preço/descrição.
 * @param {typeof import('./extensoes').extensoes} extensoes
 */
export function buildIntegrationSummaries(extensoes) {
  return Object.values(extensoes).map((item) => ({
    slug: item.slug,
    title: item.h1,
    subtitle: item.subtitle,
    kind: item.kind === 'plan' ? 'plano separado' : 'add-on'
  }));
}
