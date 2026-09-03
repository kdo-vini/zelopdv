import { describe, expect, it } from 'vitest';
import { appendOptionsAsText, extractQuickReplies } from '../src/lib/server/gerente/quickReplies.js';

describe('extractQuickReplies', () => {
  it('separa a linha de opções do texto e limpa espaços', () => {
    const r = extractQuickReplies('Quer que eu pause o refri também?\n[[opcoes: Sim | Não]]');
    expect(r).toEqual({ reply: 'Quer que eu pause o refri também?', options: ['Sim', 'Não'] });
  });

  it('aceita acentos, remove duplicadas e limita a cinco', () => {
    const r = extractQuickReplies('Em qual categoria? [[Opções: Lanches | Bebidas | lanches | Doces | Sobremesas | Bolos | Outra]]');
    expect(r.reply).toBe('Em qual categoria?');
    expect(r.options).toEqual(['Lanches', 'Bebidas', 'Doces', 'Sobremesas', 'Bolos']);
  });

  it('devolve o texto intacto quando não há marcador', () => {
    expect(extractQuickReplies('Ontem você fez R$ 1.240,00.')).toEqual({ reply: 'Ontem você fez R$ 1.240,00.', options: [] });
    expect(extractQuickReplies(null)).toEqual({ reply: '', options: [] });
  });

  it('ignora marcador vazio', () => {
    expect(extractQuickReplies('Certo. [[opcoes: ]]')).toEqual({ reply: 'Certo.', options: [] });
  });
});

describe('appendOptionsAsText', () => {
  it('numera as opções para canais sem pills', () => {
    expect(appendOptionsAsText('Qual deles?', ['Coca 2L', 'Guaraná 2L'])).toBe('Qual deles?\n1. Coca 2L\n2. Guaraná 2L');
    expect(appendOptionsAsText('Ok.', [])).toBe('Ok.');
  });
});
