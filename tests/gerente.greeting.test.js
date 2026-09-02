import { describe, expect, it } from 'vitest';
import { buildGreeting } from '../src/lib/gerente/greeting.js';

const strip = { date: '2026-09-01', receita: 1240, receitaDeltaPct: -0.18, vendas: 38 };
const signals = [{ severity: 'critical' }, { severity: 'attention' }, { severity: 'info' }];

describe('buildGreeting', () => {
  it('saúda pelo primeiro nome e resume ontem com o dia da semana', () => {
    const g = buildGreeting({ nomeExibicao: 'Zé Lanches', dayStrip: strip, signals, hour: 9 });
    expect(g.title).toBe('Bom dia, Zé.');
    expect(g.lead).toBe('Ontem rendeu R$ 1.240 em 38 vendas, abaixo do ritmo das suas terças. 2 pontos pedem sua atenção.');
  });

  it('usa o nome inteiro quando a primeira palavra é genérica e varia a saudação pela hora', () => {
    expect(buildGreeting({ nomeExibicao: 'Lanchonete do Zé', dayStrip: null, signals: [], hour: 15 }).title).toBe('Boa tarde, Lanchonete do Zé.');
    expect(buildGreeting({ nomeExibicao: '', dayStrip: null, signals: [], hour: 20 }).title).toBe('Boa noite.');
  });

  it('cobre sem histórico, ritmo normal e nenhum ponto', () => {
    expect(buildGreeting({ nomeExibicao: 'Zé', dayStrip: null, signals: [], hour: 9 }).lead).toBe('Ainda estou reunindo seu histórico. Continue registrando as vendas e o resumo aparece aqui.');
    expect(buildGreeting({ nomeExibicao: 'Zé', dayStrip: { ...strip, receita: 1500.5, receitaDeltaPct: 0.02 }, signals: [{ severity: 'critical' }], hour: 9 }).lead).toBe('Ontem rendeu R$ 1.500,50 em 38 vendas, no ritmo de sempre. Um ponto pede sua atenção.');
    expect(buildGreeting({ nomeExibicao: 'Zé', dayStrip: { ...strip, receitaDeltaPct: null }, signals: [], hour: 9 }).lead).toBe('Ontem rendeu R$ 1.240 em 38 vendas. Nada pede sua atenção hoje.');
  });
});
