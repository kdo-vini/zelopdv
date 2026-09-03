import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { canUndo, describeStatus, describeUndo } from '../src/lib/gerente/agentActions.js';

describe('agent actions helpers', () => {
  it('só permite desfazer pausa e ocultar executadas com before_state', () => {
    expect(canUndo({ tool_name: 'pausar_no_cardapio', status: 'executed', before_state: { pausado_manualmente: false } })).toBe(true);
    expect(canUndo({ tool_name: 'ocultar_no_pdv', status: 'executed', before_state: { ocultar_no_pdv: false } })).toBe(true);
    expect(canUndo({ tool_name: 'criar_produto', status: 'executed', before_state: null })).toBe(false);
    expect(canUndo({ tool_name: 'pausar_no_cardapio', status: 'pending', before_state: null })).toBe(false);
    expect(canUndo({ tool_name: 'pausar_no_cardapio_undo', status: 'executed', before_state: { pausado_manualmente: true } })).toBe(false);
  });

  it('não permite desfazer ação que falhou, porque nada foi alterado', () => {
    expect(canUndo({ tool_name: 'pausar_no_cardapio', status: 'failed', before_state: { pausado_manualmente: false } })).toBe(false);
  });

  it('descreve status em português', () => {
    expect(describeStatus('executed')).toBe('Feita');
    expect(describeStatus('pending')).toBe('Aguardando confirmação');
    expect(describeStatus('cancelled')).toBe('Cancelada');
    expect(describeStatus('expired')).toBe('Expirada');
    expect(describeStatus('failed')).toBe('Falhou');
  });

  it('descreve o que o desfazer de pausar_no_cardapio vai fazer', () => {
    expect(describeUndo({
      tool_name: 'pausar_no_cardapio',
      arguments: { nome_produto: 'X-Bacon' },
      before_state: { pausado_manualmente: true },
    })).toBe('X-Bacon volta a ficar pausado no cardápio digital.');
    expect(describeUndo({
      tool_name: 'pausar_no_cardapio',
      arguments: { nome_produto: 'X-Bacon' },
      before_state: { pausado_manualmente: false },
    })).toBe('X-Bacon volta a aparecer no cardápio digital.');
  });

  it('descreve o que o desfazer de ocultar_no_pdv vai fazer', () => {
    expect(describeUndo({
      tool_name: 'ocultar_no_pdv',
      arguments: { nome_produto: 'Refrigerante' },
      before_state: { ocultar_no_pdv: true },
    })).toBe('Refrigerante volta a ficar escondido na frente de caixa.');
    expect(describeUndo({
      tool_name: 'ocultar_no_pdv',
      arguments: { nome_produto: 'Refrigerante' },
      before_state: { ocultar_no_pdv: false },
    })).toBe('Refrigerante volta a aparecer na frente de caixa.');
  });

  it('usa "O produto" quando falta o nome e frase genérica para outras ferramentas', () => {
    expect(describeUndo({
      tool_name: 'pausar_no_cardapio',
      arguments: {},
      before_state: { pausado_manualmente: true },
    })).toBe('O produto volta a ficar pausado no cardápio digital.');
    expect(describeUndo({
      tool_name: 'criar_produto',
      arguments: { nome_produto: 'X-Bacon' },
      before_state: {},
    })).toBe('A ação anterior volta ao estado de antes.');
  });
});

describe('gerente page renders actions list', () => {
  it('importa e usa AgentActionsList', async () => {
    const page = await readFile(new URL('../src/routes/gestao/gerente/+page.svelte', import.meta.url), 'utf8');
    expect(page).toContain("import AgentActionsList from '$lib/components/gerente/AgentActionsList.svelte'");
    expect(page).toContain('<AgentActionsList');
  });

  it('lista de ações tem pills de status e estado vazio com exemplos', async () => {
    const s = await readFile(new URL('../src/lib/components/gerente/AgentActionsList.svelte', import.meta.url), 'utf8');
    for (const t of ['Nada ainda.', 'onExample', 'cria a categoria Sobremesas', 'describeStatus', 'Desfazer']) expect(s).toContain(t);
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('desfazer pede confirmação explicando o que vai acontecer antes de chamar a API', async () => {
    const s = await readFile(new URL('../src/lib/components/gerente/AgentActionsList.svelte', import.meta.url), 'utf8');
    for (const t of ['describeUndo', 'Sim, desfazer', 'Agora não', 'confirmingId']) expect(s).toContain(t);
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
