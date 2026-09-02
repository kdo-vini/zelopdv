import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { canUndo, describeStatus } from '../src/lib/gerente/agentActions.js';

describe('agent actions helpers', () => {
  it('só permite desfazer pausa e ocultar executadas com before_state', () => {
    expect(canUndo({ tool_name: 'pausar_no_cardapio', status: 'executed', before_state: { pausado_manualmente: false } })).toBe(true);
    expect(canUndo({ tool_name: 'ocultar_no_pdv', status: 'executed', before_state: { ocultar_no_pdv: false } })).toBe(true);
    expect(canUndo({ tool_name: 'criar_produto', status: 'executed', before_state: null })).toBe(false);
    expect(canUndo({ tool_name: 'pausar_no_cardapio', status: 'pending', before_state: null })).toBe(false);
    expect(canUndo({ tool_name: 'pausar_no_cardapio_undo', status: 'executed', before_state: { pausado_manualmente: true } })).toBe(false);
  });

  it('descreve status em português', () => {
    expect(describeStatus('executed')).toBe('Feita');
    expect(describeStatus('pending')).toBe('Aguardando confirmação');
    expect(describeStatus('cancelled')).toBe('Cancelada');
    expect(describeStatus('expired')).toBe('Expirada');
    expect(describeStatus('failed')).toBe('Falhou');
  });
});

describe('gerente page renders actions list', () => {
  it('importa e usa AgentActionsList', async () => {
    const page = await readFile(new URL('../src/routes/gestao/gerente/+page.svelte', import.meta.url), 'utf8');
    expect(page).toContain("import AgentActionsList from '$lib/components/gerente/AgentActionsList.svelte'");
    expect(page).toContain('<AgentActionsList');
  });
});
