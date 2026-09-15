import { normalizeBrazilianPhone } from './masks.js';
import { buildZeloWhatsAppHref } from './zeloContact.js';

export const ONBOARDING_TOTAL_STEPS = 2;

const ERRORS = {
  nome: 'Coloque o nome da loja.',
  contato: 'Faltou o DDD. Escreva os 11 números: (11) 98765-4321',
};

export function validateOnboardingStep(step, { nome = '', contato = '' } = {}) {
  if (step === 1 && !nome.trim()) {
    return { valid: false, field: 'nome', error: ERRORS.nome };
  }

  if (step === 2 && !normalizeBrazilianPhone(contato)) {
    return { valid: false, field: 'contato', error: ERRORS.contato };
  }

  return { valid: true, field: null, error: '' };
}

export function buildOnboardingStepPayload({
  step,
  userId,
  nome = '',
  contato = '',
  origemAquisicao = null,
  updatedAt = new Date().toISOString(),
} = {}) {
  const payload = {
    user_id: userId,
    nome_exibicao: nome.trim(),
    updated_at: updatedAt,
  };

  if (origemAquisicao) payload.origem_aquisicao = origemAquisicao;

  if (step === 2) {
    payload.contato = normalizeBrazilianPhone(contato);
    payload.largura_bobina = '80mm';
  }

  return payload;
}

export function deriveOnboardingResumeStep({ nome_exibicao = '', contato = '' } = {}) {
  if (nome_exibicao.trim() && !normalizeBrazilianPhone(contato)) return 2;
  return 1;
}

// Estado de cada bolinha de progresso do wizard: 'completed' (preenchida),
// 'current' (contorno, miolo vazio) ou 'future' (cor neutra). No estado de
// chegada (arrived) todas as bolinhas ficam completed — não existe passo
// "atual" depois que o trial já foi ativado.
export function computeOnboardingDotsState({ step, totalSteps = ONBOARDING_TOTAL_STEPS, arrived = false } = {}) {
  return Array.from({ length: totalSteps }, (_, i) => {
    if (arrived) return 'completed';
    if (i < step - 1) return 'completed';
    if (i === step - 1) return 'current';
    return 'future';
  });
}

// Mensagem exata do estado de chegada pro botão "Ajuda no WhatsApp" — nunca
// muda a copy, só interpola o nome da loja já preenchido no wizard.
export function buildOnboardingWhatsAppHelpMessage(nome = '') {
  return `Oi! Acabei de criar a conta da ${nome} e quero ajuda pra cadastrar os produtos.`;
}

export function buildOnboardingWhatsAppHelpHref(nome = '') {
  return buildZeloWhatsAppHref(buildOnboardingWhatsAppHelpMessage(nome));
}
