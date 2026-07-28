import { describe, it, expect } from 'vitest';
import {
  deveDisparar,
  diasDesdeInicio,
  diasRestantes,
  MAX_CATCHUP_DAYS,
} from '../src/lib/server/onboardingSchedule.js';
import { EMAIL_DAYS } from '../src/lib/server/emailTemplates.js';

const AGORA = new Date('2026-07-27T12:00:00.000Z');
const emDias = (n) => new Date(AGORA.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

/** Assinatura de trial com N dias de idade e M dias restantes. */
const trial = (idade, restantes) => ({
  created_at: emDias(-idade),
  current_period_end: emDias(restantes),
});

describe('diasDesdeInicio / diasRestantes', () => {
  it('conta idade e saldo do trial', () => {
    const sub = trial(10, 20);
    expect(diasDesdeInicio(sub, AGORA)).toBe(10);
    expect(diasRestantes(sub, AGORA), AGORA).toBe(20);
  });

  it('extensão manual manda no saldo', () => {
    const sub = { ...trial(5, 9), manually_extended_until: emDias(40) };
    expect(diasRestantes(sub, AGORA)).toBe(40);
  });

  it('devolve null quando não dá pra calcular', () => {
    expect(diasDesdeInicio({}, AGORA)).toBeNull();
    expect(diasDesdeInicio({ created_at: 'xx' }, AGORA)).toBeNull();
    expect(diasRestantes({}, AGORA)).toBeNull();
  });
});

describe('deveDisparar — dias ancorados no início', () => {
  const agenda = (idade) => ({ daysSince: idade, daysLeft: 99 });

  it('não dispara antes da hora', () => {
    expect(deveDisparar(5, agenda(4))).toBe(false);
  });

  it('dispara no dia exato', () => {
    expect(deveDisparar(5, agenda(5))).toBe(true);
  });

  it('ainda dispara dentro da janela de catch-up', () => {
    expect(deveDisparar(5, agenda(5 + MAX_CATCHUP_DAYS))).toBe(true);
  });

  it('não dispara depois da janela de catch-up', () => {
    expect(deveDisparar(5, agenda(5 + MAX_CATCHUP_DAYS + 1))).toBe(false);
  });
});

describe('deveDisparar — dia 13 ancorado no fim do trial', () => {
  it('dispara na véspera de um trial de 14 dias', () => {
    expect(deveDisparar(13, { daysSince: 13, daysLeft: 1 })).toBe(true);
  });

  it('dispara no último dia', () => {
    expect(deveDisparar(13, { daysSince: 13, daysLeft: 0 })).toBe(true);
  });

  it('NÃO anuncia o fim para a conta legada de 30 dias no dia 13', () => {
    // Conta criada antes de 2026-07-27: 13 dias de idade, mas ainda faltam 17.
    // Ancorado no início, isto mandaria "seu teste encerra amanhã" duas semanas cedo.
    const legada = trial(13, 17);
    expect(deveDisparar(13, {
      daysSince: diasDesdeInicio(legada, AGORA),
      daysLeft: diasRestantes(legada, AGORA),
    })).toBe(false);
  });

  it('dispara para a conta legada na véspera real, no dia 29', () => {
    const legada = trial(29, 1);
    expect(deveDisparar(13, {
      daysSince: diasDesdeInicio(legada, AGORA),
      daysLeft: diasRestantes(legada, AGORA),
    })).toBe(true);
  });

  it('respeita trial esticado à mão pelo admin', () => {
    const estendida = { ...trial(13, 1), manually_extended_until: emDias(30) };
    expect(deveDisparar(13, {
      daysSince: diasDesdeInicio(estendida, AGORA),
      daysLeft: diasRestantes(estendida, AGORA),
    })).toBe(false);
  });

  it('não dispara sem saldo calculável', () => {
    expect(deveDisparar(13, { daysSince: 13, daysLeft: null })).toBe(false);
  });
});

describe('coorte legada de 30 dias na cadência nova', () => {
  // O que uma conta de 30 dias recebe em cada idade, agora que o dia 13 é ancorado
  // no fim. Nenhuma idade pode disparar o aviso de encerramento cedo demais.
  it('nenhuma idade de 0 a 28 dispara o aviso de fim', () => {
    for (let idade = 0; idade <= 28; idade += 1) {
      const sub = trial(idade, 30 - idade);
      const disparou = deveDisparar(13, {
        daysSince: diasDesdeInicio(sub, AGORA),
        daysLeft: diasRestantes(sub, AGORA),
      });
      expect(disparou, `idade ${idade} avisou o fim cedo demais`).toBe(false);
    }
  });

  it('o dia 29 dispara, e só ele', () => {
    const sub = trial(29, 1);
    expect(deveDisparar(13, {
      daysSince: diasDesdeInicio(sub, AGORA),
      daysLeft: diasRestantes(sub, AGORA),
    })).toBe(true);
  });

  it('todo dia de EMAIL_DAYS tem regra definida', () => {
    for (const day of EMAIL_DAYS) {
      expect(typeof deveDisparar(day, { daysSince: day, daysLeft: 1 })).toBe('boolean');
    }
  });
});
