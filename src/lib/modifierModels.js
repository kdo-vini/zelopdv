import { ArrowLeftRight, Plus, CircleCheck, User } from 'lucide-svelte';

export const models = [
  {
    id: 'variacao_substituir',
    description: 'O cliente escolhe uma opção e o preço muda conforme a escolha.',
    label: 'Escolha que troca o preço',
    tipo: 'variacao',
    modo_preco: 'substituir',
    permite_quantidade: false,
    example: () => `Ex.: Suco de Laranja \u2022 500ml \u2014 R$ 12,00`,
    icon: ArrowLeftRight
  },
  {
    id: 'adicional_somar',
    description: 'O cliente adiciona uma ou mais opções e o valor é somado ao preço base.',
    label: 'Adicional que soma ao preço',
    tipo: 'adicional',
    modo_preco: 'somar',
    permite_quantidade: false,
    example: () => `Ex.: Suco de Laranja + Calda de Nutella \u2014 + R$ 3,00`,
    icon: Plus
  },
  {
    id: 'adicional_incluida',
    description: 'O cliente escolhe uma opção, mas não há acréscimo no preço.',
    label: 'Opção incluída, sem custo extra',
    tipo: 'adicional',
    modo_preco: 'somar',
    permite_quantidade: false,
    example: () => `Ex.: Suco de Laranja \u2022 Sem a\u00e7\u00facar \u2014 R$ 0,00`,
    icon: CircleCheck
  },
  {
    id: 'adicional_quantidade',
    description: 'O cliente pode adicionar várias unidades da mesma opção.',
    label: 'Adicional com quantidade',
    tipo: 'adicional',
    modo_preco: 'somar',
    permite_quantidade: true,
    example: () => `Ex.: Suco de Laranja \u2022 Queijo extra \u00d7 2 \u2014 + R$ 4,00`,
    icon: User
  }
];

/**
 * Calculate min_selecoes from the _required toggle.
 * Used in both criar and editar flows.
 */
export function calcMinSel(_required) {
  return _required ? 1 : 0;
}
