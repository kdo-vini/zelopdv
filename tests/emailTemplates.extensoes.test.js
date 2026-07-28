import { describe, it, expect } from 'vitest';
import { emailDay9, EMAIL_DAYS, EMAIL_SEQUENCE } from '../src/lib/server/emailTemplates.js';
import { TRIAL_DAYS } from '../src/lib/pricing.js';

const ATIVO = { vendas: 12, produtos: 20, acessos: 0 };

describe('emailDay9 — oferta de extensões', () => {
  it('não envia para quem nunca registrou uma venda', () => {
    expect(emailDay9('Vini', { ...ATIVO, vendas: 0 })).toBeNull();
  });

  it('não envia quando o contexto vem vazio', () => {
    expect(emailDay9('Vini')).toBeNull();
  });

  it('envia para quem já está operando', () => {
    const result = emailDay9('Vini', ATIVO);
    expect(result).not.toBeNull();
    // Assunto sem vocativo: o valor disponível é nome de loja, não de pessoa.
    expect(result.subject).toBeTruthy();
    expect(result.html).toContain('ZeloMenu');
    expect(result.html).toContain('Módulo Mesas');
    expect(result.html).toContain('Controle de Acessos');
    expect(result.html).toContain('ZeloChat');
  });

  it('omite extensão que a empresa já assina', () => {
    const result = emailDay9('Vini', { ...ATIVO, temMesas: true, temAcessos: true });
    expect(result.html).not.toContain('Módulo Mesas');
    expect(result.html).not.toContain('Controle de Acessos');
    expect(result.html).toContain('ZeloMenu');
  });

  it('não envia quando não sobra nada para oferecer', () => {
    const result = emailDay9('Vini', {
      ...ATIVO,
      temMesas: true,
      temAcessos: true,
      temMenu: true,
      planoChat: true,
    });
    expect(result).toBeNull();
  });

  it('plano chat já inclui ZeloMenu, então nenhum dos dois é oferecido', () => {
    const result = emailDay9('Vini', { ...ATIVO, planoChat: true });
    expect(result.html).not.toContain('ZeloChat');
    expect(result.html).not.toContain('ZeloMenu');
    expect(result.html).toContain('Módulo Mesas');
  });

  it('põe o ZeloMenu na frente quando o cardápio já está cadastrado', () => {
    const html = emailDay9('Vini', { vendas: 5, produtos: 30, acessos: 0 }).html;
    expect(html.indexOf('ZeloMenu')).toBeLessThan(html.indexOf('Módulo Mesas'));
  });

  it('põe Acessos na frente quando já existe equipe', () => {
    const html = emailDay9('Vini', { vendas: 5, produtos: 2, acessos: 3 }).html;
    expect(html.indexOf('Controle de Acessos')).toBeLessThan(html.indexOf('ZeloMenu'));
  });

  it('não oferece Pedidos + Cozinha, que é entitlement legado', () => {
    expect(emailDay9('Vini', ATIVO).html).not.toContain('Pedidos + Cozinha');
  });
});

describe('nome da loja nas mensagens', () => {
  it('não corta o nome da loja na primeira palavra', () => {
    const html = emailDay9('Lanchonete do Zé', ATIVO).html;
    expect(html).toContain('Lanchonete do Zé');
    // O bug antigo: .split(' ')[0] virava "Oi, Lanchonete!"
    expect(html).not.toMatch(/Oi,? Lanchonete!/);
  });

  it('escapa nome de loja com HTML', () => {
    const html = emailDay9('<script>alert(1)</script>', ATIVO).html;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('cai numa saudação sem nome quando o perfil não tem nome_exibicao', () => {
    for (const [day, fn] of EMAIL_SEQUENCE) {
      const rendered = fn('', ATIVO);
      if (rendered === null) continue;
      expect(rendered.html, `dia ${day} vazou placeholder`).not.toContain('undefined');
      expect(rendered.html, `dia ${day} caiu no "você" genérico`).not.toMatch(/Oi,? você!/);
    }
  });
});

describe('cadência de onboarding', () => {
  it('todo dia da sequência cabe dentro do trial', () => {
    for (const day of EMAIL_DAYS) {
      expect(day).toBeLessThan(TRIAL_DAYS);
    }
  });

  it('EMAIL_DAYS e EMAIL_SEQUENCE não divergem', () => {
    expect(EMAIL_DAYS).toEqual([...EMAIL_SEQUENCE.keys()]);
    for (const day of EMAIL_DAYS) {
      expect(typeof EMAIL_SEQUENCE.get(day)).toBe('function');
    }
  });

  it('todo template renderiza assunto e html', () => {
    for (const [day, fn] of EMAIL_SEQUENCE) {
      const rendered = fn('Vini da Silva', ATIVO);
      if (rendered === null) continue; // só emailDay9 pode recusar
      expect(rendered.subject, `dia ${day} sem assunto`).toBeTruthy();
      expect(rendered.html, `dia ${day} sem html`).toContain('<!DOCTYPE html>');
    }
  });
});
