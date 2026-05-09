/**
 * Onboarding email templates for ZeloPDV trial sequence.
 *
 * Each function returns { subject, html } for that email day.
 * All emails are in Portuguese, signed by Vinicius (founder).
 *
 * Email days: 0, 1, 3, 7, 14, 25, 28
 */

const APP_URL = 'https://zelopdv.com.br';
const WHATSAPP_NUMBER = '5514991537503'; // Public support WhatsApp number

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
// DAY 0 — Boas-vindas
// ---------------------------------------------------------------------------
export function emailDay0(nome) {
  const primeiroNome = (nome || 'você').split(' ')[0];
  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Oi, ${primeiroNome}! 👋</p>

<p style="margin:0 0 16px;">Seu acesso ao Zelo PDV está pronto. Você tem <strong>30 dias gratuitos</strong> para testar tudo sem precisar colocar o cartão.</p>

<p style="margin:0 0 16px;">Para começar, é simples:</p>

<ol style="margin:0 0 16px;padding-left:24px;color:#374151;">
  <li style="margin-bottom:8px;">Cadastre seus <strong>produtos</strong> (Gestão → Produtos)</li>
  <li style="margin-bottom:8px;">Abra um <strong>caixa</strong> (Gestão → Caixa → Abrir)</li>
  <li style="margin-bottom:8px;">Faça sua <strong>primeira venda</strong> no PDV</li>
</ol>

<p style="margin:0 0 16px;">Qualquer dúvida, pode responder este email ou me chamar diretamente no WhatsApp — sou o Vinicius, fundador do Zelo, e acompanho cada novo usuário de perto.</p>

${ctaButton('Acessar o Zelo PDV →', `${APP_URL}/login`)}

${signature()}
`);

  return {
    subject: '👋 Bem-vindo ao Zelo! Seu acesso está pronto',
    html,
  };
}

// ---------------------------------------------------------------------------
// DAY 1 — Ativação
// ---------------------------------------------------------------------------
export function emailDay1(nome) {
  const primeiroNome = (nome || 'você').split(' ')[0];
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Oi Vinicius! Criei minha conta no Zelo PDV mas estou com dúvidas para começar. Pode me ajudar?`)}`;

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Você já registrou sua primeira venda? 🛒</p>

<p style="margin:0 0 16px;">Oi, ${primeiroNome}! Vi que você criou sua conta no Zelo PDV ontem.</p>

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
// DAY 3 — Valor escondido: relatório financeiro
// ---------------------------------------------------------------------------
export function emailDay3(nome) {
  const primeiroNome = (nome || 'você').split(' ')[0];

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Você já viu o relatório financeiro do Zelo? 📊</p>

<p style="margin:0 0 16px;">Oi, ${primeiroNome}! Existe uma funcionalidade que a maioria dos usuários descobre só depois de algumas semanas — e eu quero te mostrar agora.</p>

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
// DAY 7 — Prova social: estoque
// ---------------------------------------------------------------------------
export function emailDay7(nome) {
  const primeiroNome = (nome || 'você').split(' ')[0];

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Como a Dona Maria organiza o estoque com o Zelo 🏪</p>

<p style="margin:0 0 16px;">Oi, ${primeiroNome}! Quero te contar uma história rápida.</p>

<p style="margin:0 0 16px;">A Dona Maria tem uma lanchonete em São Paulo. Antes do Zelo, ela anotava o estoque num caderno e, toda semana, descobria que tinha ficado sem ingrediente porque ninguém atualizou a lista.</p>

<p style="margin:0 0 16px;">Depois de uma semana usando o Zelo, ela configurou o estoque dos itens principais. Agora, toda vez que uma venda é registrada, o sistema desconta automaticamente. Quando o estoque chega no nível mínimo, ela recebe um aviso.</p>

<blockquote style="margin:16px 0;padding:16px 20px;background-color:#f0f9ff;border-left:4px solid #1d4ed8;border-radius:0 4px 4px 0;">
  <p style="margin:0;color:#1e3a5f;font-style:italic;font-size:14px;">"Parece bobagem, mas saber que não vou ficar sem pão de queijo no meio do sábado mudou completamente minha semana."</p>
  <p style="margin:8px 0 0;color:#374151;font-size:13px;">— Dona Maria, lanchonete em Campinas/SP</p>
</blockquote>

<p style="margin:16px 0;">Se você ainda não configurou o estoque no Zelo, é um bom momento. Vai em <strong>Gestão → Estoque</strong>, cadastra os produtos que você mais vende e define o estoque mínimo.</p>

${ctaButton('Configurar meu estoque →', `${APP_URL}/gestao/estoque`)}

${signature()}
`);

  return {
    subject: 'Como um cliente real organiza o estoque com o Zelo 🏪',
    html,
  };
}

// ---------------------------------------------------------------------------
// DAY 14 — Urgência suave: o que você perde sem o Zelo
// ---------------------------------------------------------------------------
export function emailDay14(nome) {
  const primeiroNome = (nome || 'você').split(' ')[0];

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Faltam 16 dias do trial — o que você teria que abrir mão 👀</p>

<p style="margin:0 0 16px;">Oi, ${primeiroNome}! Você já está há duas semanas usando o Zelo PDV. Metade do trial foi.</p>

<p style="margin:0 0 16px;">Quero ser direto: se o trial acabar sem assinatura, você perde acesso a tudo isso:</p>

<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px;border-collapse:collapse;">
  <tr style="background-color:#fef2f2;">
    <td style="padding:12px 16px;border:1px solid #fecaca;font-size:14px;color:#991b1b;">❌ Histórico de vendas e relatórios</td>
  </tr>
  <tr style="background-color:#fef2f2;">
    <td style="padding:12px 16px;border:1px solid #fecaca;border-top:none;font-size:14px;color:#991b1b;">❌ Controle de fiado e saldo dos clientes</td>
  </tr>
  <tr style="background-color:#fef2f2;">
    <td style="padding:12px 16px;border:1px solid #fecaca;border-top:none;font-size:14px;color:#991b1b;">❌ Fechamento de caixa e registro de despesas</td>
  </tr>
  <tr style="background-color:#fef2f2;">
    <td style="padding:12px 16px;border:1px solid #fecaca;border-top:none;font-size:14px;color:#991b1b;">❌ Controle de estoque automático</td>
  </tr>
  <tr style="background-color:#fef2f2;">
    <td style="padding:12px 16px;border:1px solid #fecaca;border-top:none;font-size:14px;color:#991b1b;">❌ Relatório de lucro real (faturamento - despesas)</td>
  </tr>
</table>

<p style="margin:0 0 16px;">Voltar para caderno, planilha ou "na memória" é uma opção. Mas com <strong>R$ 59/mês</strong> — menos de R$ 2 por dia — você mantém tudo funcionando.</p>

<p style="margin:0 0 16px;">Não precisa decidir agora. Você ainda tem 16 dias. Mas se já sabe que quer continuar, pode assinar agora e garantir que não vai perder nada.</p>

${ctaButton('Assinar por R$ 59/mês →', `${APP_URL}/assinatura`)}

${signature()}
`);

  return {
    subject: 'Faltam 16 dias do seu trial — veja o que você teria que abrir mão 👀',
    html,
  };
}

// ---------------------------------------------------------------------------
// DAY 25 — Toque humano: oferta de call
// ---------------------------------------------------------------------------
export function emailDay25(nome) {
  const primeiroNome = (nome || 'você').split(' ')[0];
  const callMsg = encodeURIComponent(
    `Oi Vinicius! Recebi seu email sobre o trial do Zelo PDV. Gostaria de agendar uma call de 15 minutos para você me ajudar a configurar tudo antes do encerramento. Qual horário funciona pra você?`
  );
  const whatsappCallUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${callMsg}`;

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Seu trial termina em 5 dias — posso te ajudar pessoalmente 🤝</p>

<p style="margin:0 0 16px;">Oi, ${primeiroNome}! São 5 dias para o fim do seu trial.</p>

<p style="margin:0 0 16px;">Quero fazer uma oferta direta: se você ainda tem dúvidas ou não configurou tudo como queria, eu me coloco à disposição para uma <strong>call de 15 minutos</strong> com você.</p>

<p style="margin:0 0 16px;">Nessa call eu:</p>

<ul style="margin:0 0 16px;padding-left:24px;color:#374151;">
  <li style="margin-bottom:8px;">Ajudo a configurar produtos, categorias e estoque</li>
  <li style="margin-bottom:8px;">Explico como funciona o fechamento de caixa</li>
  <li style="margin-bottom:8px;">Mostro o relatório de lucro real na prática</li>
  <li style="margin-bottom:8px;">Respondo qualquer dúvida que você tiver</li>
</ul>

<p style="margin:0 0 16px;">Para agendar, é só clicar no botão abaixo e me mandar uma mensagem no WhatsApp. Respondo na hora.</p>

${ctaButton('Agendar call com Vinicius →', whatsappCallUrl, '#16a34a')}

<p style="margin:24px 0 0;color:#6b7280;font-size:14px;">Ou, se já decidiu continuar:</p>

${ctaButton('Assinar por R$ 59/mês →', `${APP_URL}/assinatura`)}

${signature()}
`);

  return {
    subject: 'Seu trial termina em 5 dias — posso te ajudar pessoalmente 🤝',
    html,
  };
}

// ---------------------------------------------------------------------------
// DAY 28 — Último aviso
// ---------------------------------------------------------------------------
export function emailDay28(nome) {
  const primeiroNome = (nome || 'você').split(' ')[0];

  const html = wrapEmail(`
<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#dc2626;">⚠️ Último aviso: seu trial encerra amanhã</p>

<p style="margin:0 0 16px;">${primeiroNome}, amanhã seu período de teste no Zelo PDV encerra.</p>

<p style="margin:0 0 16px;">Se você não assinar até amanhã, perde acesso ao sistema — incluindo todo o histórico de vendas, relatórios e configurações que você criou nesses 30 dias.</p>

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
// Registry — maps email day → template function
// ---------------------------------------------------------------------------

/** @type {Map<number, (nome: string) => { subject: string, html: string }>} */
export const EMAIL_SEQUENCE = new Map([
  [0, emailDay0],
  [1, emailDay1],
  [3, emailDay3],
  [7, emailDay7],
  [14, emailDay14],
  [25, emailDay25],
  [28, emailDay28],
]);

export const EMAIL_DAYS = [0, 1, 3, 7, 14, 25, 28];
