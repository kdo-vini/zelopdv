/**
 * Onboarding email templates for ZeloPDV trial sequence.
 *
 * Each function returns { subject, html } for that email day.
 * All emails are in Portuguese, signed by Vinicius (founder).
 *
 * Email days: 0, 2, 5, 9, 11, 13 (ver EMAIL_DAYS no fim do arquivo)
 *
 * Um template pode devolver `null` para dizer "não faz sentido pra esta empresa";
 * nesse caso o cron pula o envio e não grava log. Hoje só `emailDay9` faz isso.
 *
 * A sequência tem que caber dentro de TRIAL_DAYS. O cron só busca assinaturas com
 * status 'trialing' e current_period_end no futuro, então qualquer dia agendado
 * depois do fim do trial simplesmente nunca dispara — falha silenciosa.
 */

import { TRIAL_DAYS } from '$lib/pricing';

const APP_URL = 'https://zelopdv.com.br';
const WHATSAPP_NUMBER = '5514991537503'; // Public support WhatsApp number

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * O `nome` que os templates recebem é `empresa_perfil.nome_exibicao`: o nome da LOJA,
 * não o de uma pessoa (em `start-trial` a variável se chama literalmente `nomeLoja`).
 * O código antigo fazia `.split(' ')[0]` e tratava como primeiro nome, então
 * "Lanchonete do Zé" virava "Oi, Lanchonete!". Agora o valor é usado pelo que é, já
 * escapado — nome de loja é entrada do usuário e ia cru pro HTML do e-mail.
 * Retorna '' quando não há nome, e cada template cai numa saudação sem nome.
 */
function lojaLabel(nome) {
  const limpo = String(nome || '').trim();
  return limpo ? escapeHtml(limpo) : '';
}

/** Shared HTML wrapper — applies branding and works in Gmail/Outlook/Apple Mail */
function wrapEmail(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- HEADER -->
          <tr>
            <td style="background-color:#0b1220;padding:28px 40px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Zelo PDV</span>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:40px;color:#111827;font-size:15px;line-height:1.7;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
                Você recebeu este email porque criou uma conta no Zelo PDV.<br />
                <a href="${APP_URL}" style="color:#6b7280;">zelopdv.com.br</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Reusable CTA button */
function ctaButton(label, url, color = '#1d4ed8') {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0;">
    <tr>
      <td style="background-color:${color};border-radius:6px;">
        <a href="${url}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

/** Divider */
const divider = '<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />';

/** Signature block */
function signature(extra = '') {
  return `${divider}
<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">
  <strong>Vinicius</strong><br />
  Fundador do Zelo PDV<br />
  <a href="https://wa.me/${WHATSAPP_NUMBER}" style="color:#1d4ed8;">WhatsApp</a> · <a href="${APP_URL}" style="color:#1d4ed8;">zelopdv.com.br</a>
  ${extra}
</p>`;
}

// ---------------------------------------------------------------------------
// DAY 0 — Boas-vindas + oferta de configurar junto
//
// A mesma oferta vai no WhatsApp de boas-vindas, mas aquele só dispara quando o
// perfil tem `contato` preenchido e o ZeloChat está configurado. Sem a oferta aqui,
// quem cadastrou sem telefone não recebe convite nenhum no dia 0.
// ---------------------------------------------------------------------------
export function emailDay0(nome) {
  const loja = lojaLabel(nome);
  // Texto que o CLIENTE envia ao tocar no botão. Curto e falado, do jeito que uma
  // pessoa realmente escreve no WhatsApp.
  const setupMsg = encodeURIComponent(
    `Oi Vinicius! Criei minha conta agora e queria aquela ajuda pra deixar tudo configurado. Quando dá pra gente falar?`
  );
  const whatsappSetupUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${setupMsg}`;
  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Tudo pronto pra começar! 👋</p>

<p style="margin:0 0 16px;">${loja ? `A conta da <strong>${loja}</strong> no Zelo PDV já está ativa` : 'Seu acesso ao Zelo PDV está pronto'}. São <strong>${TRIAL_DAYS} dias gratuitos</strong> para testar tudo sem precisar colocar o cartão.</p>

<p style="margin:0 0 16px;">Para começar, é simples:</p>

<ol style="margin:0 0 16px;padding-left:24px;color:#374151;">
  <li style="margin-bottom:8px;">Cadastre seus <strong>produtos</strong> (Gestão → Produtos)</li>
  <li style="margin-bottom:8px;">Abra um <strong>caixa</strong> (Gestão → Caixa → Abrir)</li>
  <li style="margin-bottom:8px;">Faça sua <strong>primeira venda</strong> no PDV</li>
</ol>

<p style="margin:0 0 16px;">E se não quiser fazer isso sozinho, <strong>a gente faz junto com você</strong>. São uns 15 minutos no WhatsApp: eu ou alguém do time senta com você, cadastra os produtos e deixa tudo pronto pra usar no balcão. Não custa nada.</p>

${ctaButton('Configurar junto com o time →', whatsappSetupUrl, '#16a34a')}

<p style="margin:24px 0 16px;">Ou, se quiser começar por conta:</p>

${ctaButton('Acessar o Zelo PDV →', `${APP_URL}/login`)}

<p style="margin:24px 0 0;">Qualquer dúvida, pode responder este email ou me chamar diretamente no WhatsApp. Sou o Vinicius, fundador do Zelo, e acompanho cada novo usuário de perto.</p>

${signature()}
`);

  return {
    subject: '👋 Bem-vindo ao Zelo! Seu acesso está pronto',
    html,
  };
}

// ---------------------------------------------------------------------------
// DAY 2 — Ativação
// ---------------------------------------------------------------------------
export function emailDay2(nome) {
  const loja = lojaLabel(nome);
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Oi Vinicius! Criei minha conta no Zelo PDV mas estou com dúvidas para começar. Pode me ajudar?`)}`;

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Você já registrou sua primeira venda? 🛒</p>

<p style="margin:0 0 16px;">Oi! Vi que ${loja ? `a conta da <strong>${loja}</strong> foi criada` : 'você criou sua conta'} no Zelo PDV há alguns dias.</p>

<p style="margin:0 0 16px;">A primeira venda é sempre um marco — e quero saber se você já chegou lá. Se ainda não registrou nada, é bem rápido:</p>

<ol style="margin:0 0 16px;padding-left:24px;color:#374151;">
  <li style="margin-bottom:8px;">Entre em <a href="${APP_URL}/gestao/produtos" style="color:#1d4ed8;">Gestão → Produtos</a> e cadastre 2 ou 3 itens</li>
  <li style="margin-bottom:8px;">Vá em <a href="${APP_URL}/app" style="color:#1d4ed8;">PDV</a> e selecione os produtos</li>
  <li style="margin-bottom:8px;">Finalize com qualquer forma de pagamento</li>
</ol>

<p style="margin:0 0 16px;">Se travar em qualquer passo, é só me responder aqui ou me chamar no WhatsApp. Estou disponível para ajudar você a configurar tudo.</p>

${ctaButton('Ir para o PDV →', `${APP_URL}/app`)}

${signature(`<br /><a href="${whatsappUrl}" style="color:#1d4ed8;">Me chame no WhatsApp se travar em algo</a>`)}
`);

  return {
    subject: 'Você já registrou sua primeira venda? 🛒',
    html,
  };
}

// ---------------------------------------------------------------------------
// DAY 5 — Toque humano: configurar junto (o que realmente converte em ticket baixo)
//
// Fica na PRIMEIRA semana de propósito. Convite pra configurar junto no fim do
// trial não serve: não sobra tempo de configurar nem de ver resultado.
// ---------------------------------------------------------------------------
export function emailDay5(nome) {
  const loja = lojaLabel(nome);
  const callMsg = encodeURIComponent(
    `Oi Vinicius! Recebi seu email. Queria marcar aqueles 15 minutos pra configurar o sistema junto. Quando dá?`
  );
  const whatsappCallUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${callMsg}`;

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Quer que a gente configure o Zelo com você? 🤝</p>

<p style="margin:0 0 16px;">Oi! ${loja ? `A <strong>${loja}</strong> começou o teste` : 'Você começou o teste'} faz alguns dias, e eu queria repetir uma oferta que fiz lá no começo, porque quase ninguém aceita de primeira.</p>

<p style="margin:0 0 16px;">A parte chata de trocar de sistema é sempre o começo: cadastrar produto, montar categoria, acertar preço. Ninguém tem tempo pra isso entre um pedido e outro. Então <strong>a gente faz junto com você</strong>, numa conversa de 15 minutos por WhatsApp ou chamada.</p>

<p style="margin:0 0 16px;">Nesses 15 minutos a gente:</p>

<ul style="margin:0 0 16px;padding-left:24px;color:#374151;">
  <li style="margin-bottom:8px;">Cadastra seus produtos e categorias junto com você</li>
  <li style="margin-bottom:8px;">Deixa o estoque e os preços prontos pra usar no balcão</li>
  <li style="margin-bottom:8px;">Mostra o fechamento de caixa e o relatório de lucro real</li>
  <li style="margin-bottom:8px;">Responde qualquer dúvida que ficou</li>
</ul>

<p style="margin:0 0 16px;">Não custa nada e não tem compromisso nenhum de assinar depois. A ideia é você passar o resto do teste usando o sistema de verdade, com tudo já cadastrado, e aí decidir com conhecimento de causa.</p>

${ctaButton('Marcar os 15 minutos →', whatsappCallUrl, '#16a34a')}

${signature()}
`);

  return {
    subject: 'Quer que a gente configure o Zelo com você? 🤝',
    html,
  };
}

// ---------------------------------------------------------------------------
// DAY 9 — Extensões, só pra quem faz sentido
//
// Duas travas de relevância, porque oferta genérica em base pequena queima confiança:
// 1. Quem não registrou nenhuma venda não recebe. Ainda não usou o básico, oferecer
//    add-on é ruído.
// 2. Extensão já ativa não aparece.
// Se sobrar nada pra oferecer, `montarEmailExtensoes` devolve null e o cron pula.
//
// O add-on Pedidos + Cozinha foi aposentado (2026-07-28) e saiu do catálogo, então não
// existe mais para oferecer. ZeloChat não é add-on: é troca de plano, e vai por último.
// ---------------------------------------------------------------------------

/** Bloco visual de uma extensão dentro do e-mail. */
function blocoExtensao({ titulo, preco, paraQuem, descricao, url }) {
  return `
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px;border-collapse:collapse;">
  <tr>
    <td style="padding:16px 18px;border:1px solid #e5e7eb;border-radius:8px;background-color:#ffffff;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#111827;">${titulo} <span style="font-weight:400;color:#6b7280;font-size:14px;">${preco}</span></p>
      <p style="margin:0 0 8px;font-size:13px;color:#1d4ed8;font-weight:600;">${paraQuem}</p>
      <p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">${descricao}</p>
      <a href="${url}" style="font-size:14px;color:#1d4ed8;font-weight:600;text-decoration:none;">Ver detalhes &rarr;</a>
    </td>
  </tr>
</table>`;
}

/**
 * @param {string} nome
 * @param {{ vendas?: number, produtos?: number, acessos?: number,
 *           temMesas?: boolean, temAcessos?: boolean, temMenu?: boolean,
 *           planoChat?: boolean }} [ctx]
 * @returns {{ subject: string, html: string } | null} null = não faz sentido pra esta empresa
 */
export function emailDay9(nome, ctx = {}) {
  const loja = lojaLabel(nome);
  const vendas = Number(ctx.vendas || 0);
  const produtos = Number(ctx.produtos || 0);

  // Trava 1: sem venda registrada, não oferece nada.
  if (vendas < 1) return null;

  const blocos = [];

  if (!ctx.temMenu && !ctx.planoChat) {
    blocos.push({
      peso: produtos >= 8 ? 0 : 2,
      html: blocoExtensao({
        titulo: 'ZeloMenu',
        preco: '+R$ 40/mês',
        paraQuem: 'Pra quem quer receber pedido sem atender telefone',
        descricao: 'Cardápio digital com link próprio. O cliente pede pelo celular e o pedido cai direto na sua tela de pedidos, já com os itens e a montagem. Sem app, sem comissão por pedido.',
        url: `${APP_URL}/extensoes#menu`,
      }),
    });
  }

  if (!ctx.temMesas) {
    blocos.push({
      peso: 3,
      html: blocoExtensao({
        titulo: 'Módulo Mesas',
        preco: '+R$ 30/mês',
        paraQuem: 'Pra quem tem salão, e não só balcão',
        descricao: 'Mapa de mesas, comanda que vai acumulando, divisão de conta entre pessoas, taxa de serviço e pré-conta. Fecha a comanda e vira venda no caixa, sem digitar de novo.',
        url: `${APP_URL}/extensoes#mesas`,
      }),
    });
  }

  if (!ctx.temAcessos) {
    const temEquipe = Number(ctx.acessos || 0) >= 1 || vendas >= 40;
    blocos.push({
      peso: temEquipe ? 1 : 4,
      html: blocoExtensao({
        titulo: 'Controle de Acessos',
        preco: '+R$ 30/mês',
        paraQuem: 'Pra quem não fica sozinho no caixa',
        descricao: 'Até 5 usuários com login próprio, organizados em cargos como Caixa, Atendente e Gerente. Você decide quem pode dar desconto, cancelar venda ou ver o financeiro.',
        url: `${APP_URL}/extensoes#acessos`,
      }),
    });
  }

  if (!ctx.planoChat) {
    blocos.push({
      peso: 5,
      html: blocoExtensao({
        titulo: 'ZeloChat',
        preco: 'plano de R$ 149/mês, já com o ZeloMenu',
        paraQuem: 'Pra quem perde pedido por demorar a responder no WhatsApp',
        descricao: 'Atendimento automatizado no WhatsApp: responde cardápio, tira dúvida e registra o pedido sozinho, a qualquer hora. É troca de plano, não add-on.',
        url: `${APP_URL}/extensoes#chat`,
      }),
    });
  }

  // Trava 2: já tem tudo que dava pra oferecer.
  if (!blocos.length) return null;

  blocos.sort((a, b) => a.peso - b.peso);

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Tem peça extra que talvez encaixe no seu negócio 🧩</p>

<p style="margin:0 0 16px;">${loja ? `A <strong>${loja}</strong> já está usando` : 'Você já está usando'} o Zelo de verdade, então vale conhecer o que dá pra plugar em cima do plano base. Não precisa de nada disso pra operar, e nenhuma é obrigatória.</p>

<p style="margin:0 0 20px;">Dá pra ligar e desligar quando quiser, e durante o teste elas saem de graça:</p>

${blocos.map((bloco) => bloco.html).join('\n')}

<p style="margin:20px 0 16px;">Se ficar em dúvida sobre qual faz sentido pro seu caso, me responde este email contando como é a sua operação (balcão, salão, delivery, quantas pessoas trabalham) que eu te digo com sinceridade se compensa ou não.</p>

${ctaButton('Ver todas as extensões →', `${APP_URL}/extensoes`)}

${signature()}
`);

  return {
    // Assunto sem nome: `nome_exibicao` é nome de loja e fica esquisito como vocativo.
    subject: 'Tem peça extra que talvez encaixe no seu negócio 🧩',
    html,
  };
}

// ---------------------------------------------------------------------------
// DAY 11 — Valor escondido: relatório financeiro
// ---------------------------------------------------------------------------
export function emailDay11(nome) {
  const loja = lojaLabel(nome);

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Você já viu o relatório financeiro do Zelo? 📊</p>

<p style="margin:0 0 16px;">Oi! Existe uma funcionalidade que a maioria dos usuários descobre só depois de algumas semanas, e eu quero te mostrar agora.</p>

<p style="margin:0 0 16px;">É o <strong>Relatório Financeiro</strong>. Ele te mostra:</p>

<ul style="margin:0 0 16px;padding-left:24px;color:#374151;">
  <li style="margin-bottom:8px;"><strong>Faturamento por período</strong> — quanto entrou de verdade</li>
  <li style="margin-bottom:8px;"><strong>Lucro real</strong> — faturamento menos despesas cadastradas</li>
  <li style="margin-bottom:8px;"><strong>Forma de pagamento</strong> — quanto veio de PIX, dinheiro, cartão, fiado</li>
  <li style="margin-bottom:8px;"><strong>Produtos mais vendidos</strong> — o que está girando no seu cardápio</li>
</ul>

<p style="margin:0 0 16px;">Muitos donos de lanchonete me dizem que só descobriram quanto realmente lucravam depois de usar o relatório. Antes disso, era tudo na estimativa.</p>

<p style="margin:0 0 16px;">Se você já fez algumas vendas nos últimos dias, o relatório já tem dados pra você ver. Vale a pena dar uma olhada.</p>

${ctaButton('Ver meu relatório →', `${APP_URL}/relatorios`)}

${signature()}
`);

  return {
    subject: 'Você conhece o relatório financeiro do Zelo? 📊',
    html,
  };
}

// ---------------------------------------------------------------------------
// DAY 13 — Último aviso
// ---------------------------------------------------------------------------
export function emailDay13(nome) {
  const loja = lojaLabel(nome);

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#dc2626;">⚠️ Último aviso: seu trial encerra amanhã</p>

<p style="margin:0 0 16px;">Amanhã o período de teste ${loja ? `da <strong>${loja}</strong> ` : ''}no Zelo PDV encerra.</p>

<p style="margin:0 0 16px;">Se você não assinar até amanhã, perde acesso ao sistema — incluindo todo o histórico de vendas, relatórios e configurações que você criou nesses ${TRIAL_DAYS} dias.</p>

<p style="margin:0 0 16px;"><strong>Plano único: R$ 59/mês.</strong><br />Aceita PIX, boleto e cartão de crédito.</p>

<p style="margin:0 0 16px;">Você pode cancelar quando quiser. Sem fidelidade, sem multa.</p>

${ctaButton('Assinar agora e não perder acesso →', `${APP_URL}/assinatura`, '#dc2626')}

<p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Se decidir não continuar, não tem problema. Mas se mudar de ideia depois, todos os seus dados estarão preservados por 30 dias após o encerramento.</p>

${signature()}
`);

  return {
    subject: '⚠️ Último aviso: seu trial encerra amanhã',
    html,
  };
}

// ---------------------------------------------------------------------------
// NUDGE — Complete registration (no empresa_perfil yet)
// ---------------------------------------------------------------------------
export function emailNudgeCompleteProfile(email) {
  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Você criou uma conta no Zelo PDV — mas não terminou o cadastro 👀</p>

<p style="margin:0 0 16px;">Oi! Vi aqui que você criou sua conta, mas ainda não configurou o perfil da sua empresa. Isso leva menos de 2 minutos e é o único passo que falta para ativar seu <strong>teste gratuito de ${TRIAL_DAYS} dias</strong>.</p>

<p style="margin:0 0 16px;">Depois de completar o cadastro você já pode registrar vendas, controlar o caixa e ver os relatórios financeiros — sem pagar nada agora.</p>

<p style="margin:0 0 16px;">Se tiver qualquer dúvida ou travar em algum campo, pode responder diretamente neste email. Estou acompanhando cada novo usuário de perto.</p>

${ctaButton('Completar meu cadastro →', `${APP_URL}/onboarding`)}

${signature()}
`);

  return {
    subject: 'Seu cadastro no Zelo PDV está incompleto — finalize em 2 minutos',
    html,
  };
}

// ---------------------------------------------------------------------------
// ACCESS CONTROL — Sub-user invite
// ---------------------------------------------------------------------------
export function emailAccessControlInvite({ companyName, roleName, inviteUrl }) {
  const safeCompanyName = escapeHtml(companyName || 'sua equipe');
  const safeRoleName = roleName ? escapeHtml(roleName) : '';
  const safeInviteUrl = escapeHtml(inviteUrl);

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Seu acesso ao Zelo PDV foi liberado</p>

<p style="margin:0 0 16px;">Você recebeu um convite para entrar na operação da <strong>${safeCompanyName}</strong> no Zelo PDV.</p>

${safeRoleName
    ? `<p style="margin:0 0 16px;">Seu perfil inicial será <strong>${safeRoleName}</strong>, com as permissões definidas pela empresa.</p>`
    : '<p style="margin:0 0 16px;">Seu acesso já está separado com as permissões definidas pela empresa.</p>'}

<p style="margin:0 0 16px;">Clique no botão abaixo para aceitar o convite e definir sua senha de acesso.</p>

${ctaButton('Aceitar convite e criar senha →', safeInviteUrl)}

<p style="margin:24px 0 8px;color:#6b7280;font-size:13px;">Se o botão não abrir, use este link direto:</p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.7;word-break:break-all;">
  <a href="${safeInviteUrl}" style="color:#1d4ed8;">${safeInviteUrl}</a>
</p>

<p style="margin:0 0 16px;">Depois da confirmação, você poderá entrar normalmente no sistema com este mesmo e-mail.</p>

${signature()}
`);

  return {
    subject: `Convite para acessar ${companyName || 'sua empresa'} no Zelo PDV`,
    html,
  };
}

// ---------------------------------------------------------------------------
// Registry — maps email day → template function
// ---------------------------------------------------------------------------

/** @type {Map<number, (nome: string) => { subject: string, html: string }>} */
export const EMAIL_SEQUENCE = new Map([
  [0, emailDay0],   // boas-vindas + oferta de configurar junto
  [2, emailDay2],   // ativação: primeira venda
  [5, emailDay5],   // toque humano: configurar junto (primeira semana, de propósito)
  [9, emailDay9],   // extensões: condicional, pode devolver null
  [11, emailDay11], // valor: relatório de lucro real
  [13, emailDay13], // último aviso: encerra amanhã
]);

export const EMAIL_DAYS = [0, 2, 5, 9, 11, 13];
