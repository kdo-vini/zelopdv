// Lógica pura do card "Terminar de configurar" (checklist pós-onboarding em
// /gestao). Ver docs/projects/onboarding-dois-passos.md, Fase 4.1: CPF/CNPJ,
// logo e largura da bobina saem do wizard e passam a morar aqui, sem travar
// nada — este card nunca bloqueia o caixa.
import { billingProfileOk } from './profileUtils.js';

/** Formata o valor efetivo da bobina para a copy fechada do checklist. */
export function formatLarguraBobinaLabel(larguraBobina) {
  const normalized = (larguraBobina || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  return normalized === '58mm' || normalized === '58' ? '58 mm' : '80 mm';
}

/**
 * Monta os itens e o progresso do checklist.
 *
 * Os quatro itens seguem a copy fechada do plano. Bobina é uma tarefa normal:
 * o valor efetivo já nasce em 80 mm por default, então ela aparece concluída
 * quando o perfil usa o default ou uma das larguras válidas.
 */
export function buildChecklistState({ hasProdutos, documento, logoUrl, larguraBobina }) {
  const hasDocumento = billingProfileOk({ documento });
  const hasLogo = Boolean((logoUrl || '').trim());
  const normalizedLargura = (larguraBobina || '').toString().trim().toLowerCase().replace(/\s+/g, '');
  const hasLargura = !normalizedLargura || ['58', '58mm', '80', '80mm'].includes(normalizedLargura);

  const items = [
    {
      key: 'produto',
      label: 'Cadastrar seu primeiro produto',
      done: Boolean(hasProdutos),
      href: '/gestao/produtos',
    },
    {
      key: 'documento',
      label: 'CPF ou CNPJ no recibo',
      done: hasDocumento,
      href: '/perfil#documento',
    },
    {
      key: 'logo',
      label: 'Logo da loja no recibo',
      done: hasLogo,
      href: '/perfil#logo',
    },
    {
      key: 'bobina',
      label: `Largura da bobina — hoje em ${formatLarguraBobinaLabel(larguraBobina)}`,
      done: hasLargura,
      href: '/perfil#largura-bobina',
    },
  ];

  const doneCount = items.filter((item) => item.done).length;
  const totalSteps = items.length;
  const allDone = totalSteps > 0 && doneCount === totalSteps;

  return { items, doneCount, totalSteps, allDone };
}
