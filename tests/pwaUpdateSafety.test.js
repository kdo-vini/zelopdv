import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { draftHasPendingWork, evaluateBootUpdateSafety, isWithinBootWindow } from '../src/lib/pwa/updateSafety.js';

const SAFE_SIGNALS = Object.freeze({
  online: true,
  hasPendingQueue: false,
  hasActiveComanda: false,
  hasPendingDraft: false,
  inputFocused: false,
  withinBootWindow: true,
  alreadyApplied: false
});

describe('evaluateBootUpdateSafety — decisao pura de atualizar sozinho no boot', () => {
  it('tudo limpo: seguro, sem bloqueadores', () => {
    const result = evaluateBootUpdateSafety(SAFE_SIGNALS);
    expect(result.safe).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('fila offline pendente bloqueia', () => {
    const result = evaluateBootUpdateSafety({ ...SAFE_SIGNALS, hasPendingQueue: true });
    expect(result.safe).toBe(false);
    expect(result.blockers).toContain('pending-queue');
  });

  it('comanda em andamento bloqueia', () => {
    const result = evaluateBootUpdateSafety({ ...SAFE_SIGNALS, hasActiveComanda: true });
    expect(result.safe).toBe(false);
    expect(result.blockers).toContain('active-comanda');
  });

  it('rascunho do PDV com itens ou submission pendente bloqueia', () => {
    const result = evaluateBootUpdateSafety({ ...SAFE_SIGNALS, hasPendingDraft: true });
    expect(result.safe).toBe(false);
    expect(result.blockers).toContain('pending-draft');
  });

  it('offline bloqueia', () => {
    const result = evaluateBootUpdateSafety({ ...SAFE_SIGNALS, online: false });
    expect(result.safe).toBe(false);
    expect(result.blockers).toContain('offline');
  });

  it('input focado (pessoa ja comecou a interagir) bloqueia', () => {
    const result = evaluateBootUpdateSafety({ ...SAFE_SIGNALS, inputFocused: true });
    expect(result.safe).toBe(false);
    expect(result.blockers).toContain('input-focused');
  });

  it('fora da janela de boot bloqueia (evita aplicar fora do momento seguro)', () => {
    const result = evaluateBootUpdateSafety({ ...SAFE_SIGNALS, withinBootWindow: false });
    expect(result.safe).toBe(false);
    expect(result.blockers).toContain('boot-window-closed');
  });

  it('guarda de loop: versao ja aplicada nesta sessao bloqueia nova aplicacao', () => {
    const result = evaluateBootUpdateSafety({ ...SAFE_SIGNALS, alreadyApplied: true });
    expect(result.safe).toBe(false);
    expect(result.blockers).toContain('already-applied');
  });

  it('multiplos bloqueadores simultaneos aparecem todos na lista', () => {
    const result = evaluateBootUpdateSafety({
      ...SAFE_SIGNALS,
      hasPendingQueue: true,
      hasActiveComanda: true,
      online: false
    });
    expect(result.safe).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['pending-queue', 'active-comanda', 'offline']));
    expect(result.blockers).toHaveLength(3);
  });

  it('signals ausente/undefined nunca e tratado como seguro', () => {
    expect(evaluateBootUpdateSafety(undefined).safe).toBe(false);
    expect(evaluateBootUpdateSafety({}).safe).toBe(false);
  });
});

describe('isWithinBootWindow — janela curta antes da primeira interacao', () => {
  it('dentro da janela e sem interacao: verdadeiro', () => {
    expect(isWithinBootWindow(0, 3000, false, 8000)).toBe(true);
  });

  it('no limite exato da janela: falso (janela e exclusiva no fim)', () => {
    expect(isWithinBootWindow(0, 8000, false, 8000)).toBe(false);
  });

  it('depois da janela: falso', () => {
    expect(isWithinBootWindow(0, 8001, false, 8000)).toBe(false);
  });

  it('qualquer interacao (pointerdown/keydown) fecha a janela na hora, mesmo dentro do tempo', () => {
    expect(isWithinBootWindow(0, 1000, true, 8000)).toBe(false);
  });

  it('timestamps invalidos nunca contam como dentro da janela', () => {
    expect(isWithinBootWindow(NaN, 1000, false, 8000)).toBe(false);
    expect(isWithinBootWindow(0, NaN, false, 8000)).toBe(false);
  });
});

describe('draftHasPendingWork — quando um rascunho do PDV representa trabalho nao salvo', () => {
  it('sem rascunho: nao ha trabalho pendente', () => {
    expect(draftHasPendingWork(null)).toBe(false);
    expect(draftHasPendingWork(undefined)).toBe(false);
  });

  it('rascunho vazio (sem itens, sem submission): nao ha trabalho pendente', () => {
    expect(draftHasPendingWork({ items: [], intent: null, submission: null })).toBe(false);
  });

  it('rascunho com itens na comanda: ha trabalho pendente', () => {
    expect(draftHasPendingWork({ items: [{ id: 1 }], submission: null })).toBe(true);
  });

  it('rascunho sem itens mas com submission (pagamento em andamento): ha trabalho pendente', () => {
    expect(draftHasPendingWork({ items: [], submission: { status: 'pending' } })).toBe(true);
  });

  it('formato inesperado (nao objeto) e tratado como sem trabalho pendente', () => {
    expect(draftHasPendingWork('not-an-object')).toBe(false);
    expect(draftHasPendingWork(42)).toBe(false);
  });
});

describe('combinacoes completas (fila, comanda, draft, offline, foco, loop guard)', () => {
  const scenarios = [
    { nome: 'tudo seguro', overrides: {}, safe: true },
    { nome: 'fila + comanda juntas', overrides: { hasPendingQueue: true, hasActiveComanda: true }, safe: false },
    { nome: 'draft + offline juntos', overrides: { hasPendingDraft: true, online: false }, safe: false },
    { nome: 'foco + loop guard juntos', overrides: { inputFocused: true, alreadyApplied: true }, safe: false },
    { nome: 'apenas fora da janela de boot, resto limpo', overrides: { withinBootWindow: false }, safe: false }
  ];

  for (const scenario of scenarios) {
    it(scenario.nome, () => {
      const result = evaluateBootUpdateSafety({ ...SAFE_SIGNALS, ...scenario.overrides });
      expect(result.safe).toBe(scenario.safe);
    });
  }
});

describe('ModalAbrirCaixa.svelte — marcado como seguro para nao bloquear o aviso de atualizacao', () => {
  const source = readFileSync('src/lib/components/modals/ModalAbrirCaixa.svelte', 'utf8');

  it('a raiz do modal tem data-update-safe="true"', () => {
    expect(source).toMatch(/class="modal-backdrop"[\s\S]*?data-update-safe="true"/);
  });
});

describe('UpdateAvailable.svelte — atualizacao automatica no boot e aviso ao voltar', () => {
  const source = readFileSync('src/lib/components/UpdateAvailable.svelte', 'utf8');

  it('importa a logica pura de updateSafety.js em vez de reimplementar a decisao', () => {
    expect(source).toContain(
      "import { evaluateBootUpdateSafety, isWithinBootWindow, draftHasPendingWork } from '$lib/pwa/updateSafety';"
    );
  });

  it('hasOpenModal ignora qualquer modal dentro de [data-update-safe="true"]', () => {
    expect(source).toMatch(/hasOpenModal\(\)[\s\S]*?closest\('\[data-update-safe="true"\]'\)/);
  });

  it('forca registration.update() logo apos registrar, e nao depende so do intervalo de 5 min', () => {
    expect(source).toMatch(/onRegisteredSW\(_swUrl, registration\)[\s\S]*?registration\?\.update\(\)\.catch/);
  });

  it('quando ja ha um worker esperando no registro, tambem verifica a versao imediatamente', () => {
    expect(source).toMatch(/onRegisteredSW\(_swUrl, registration\)[\s\S]*?registration\?\.waiting[\s\S]*?checkForUpdate\('service-worker'\)/);
  });

  it('tryBootAutoUpdate so age dentro da janela de boot e usa evaluateBootUpdateSafety', () => {
    expect(source).toContain('async function tryBootAutoUpdate(version) {');
    expect(source).toMatch(/async function tryBootAutoUpdate\(version\) \{\s*if \(!withinBootWindow\(\)\) return false;/);
    expect(source).toContain('evaluateBootUpdateSafety({');
  });

  it('a checagem de fila offline no boot trata falha de consulta como NAO seguro', () => {
    expect(source).toMatch(/hasPendingOfflineWorkForBoot[\s\S]*?catch \(err\) \{[\s\S]*?return true;/);
  });

  it('a checagem de rascunho do PDV no boot trata falha de consulta como NAO seguro', () => {
    expect(source).toMatch(/hasPendingPdvDraftForBoot[\s\S]*?catch \(err\) \{[\s\S]*?return true;/);
  });

  it('aplicar a atualizacao silenciosa reaproveita SESSION_REFRESH_TARGET/AT (guarda de loop)', () => {
    expect(source).toMatch(/async function applyUpdate\(version\) \{\s*safeSet\(sessionStorage, SESSION_REFRESH_TARGET, version\);\s*safeSet\(sessionStorage, SESSION_REFRESH_AT, String\(now\(\)\)\);/);
  });

  it('tryBootAutoUpdate inclui o guarda de loop (wasRecentlyRefreshedFor) entre os signals', () => {
    expect(source).toMatch(/alreadyApplied: wasRecentlyRefreshedFor\(version\)/);
  });

  it('announceUpdate tenta o boot automatico antes de agendar o aviso manual', () => {
    expect(source).toMatch(/if \(await tryBootAutoUpdate\(normalized\)\) return;\s*schedulePromptWhenSafe\(normalized\);/);
  });

  it('ao voltar do segundo plano (visibilitychange/focus) continua so verificando, nunca recarregando direto', () => {
    expect(source).toContain("const onVisibility = () => {");
    expect(source).toContain("checkForUpdate('visibility')");
    expect(source).toContain("const onFocus = () => checkForUpdate('focus');");
  });

  it('nunca apaga o IndexedDB inteiro — clearAppCaches continua restrito a caches de Cache API por nome', () => {
    expect(source).not.toContain('indexedDB.deleteDatabase');
    expect(source).toMatch(/cacheNames\s*\.filter\(\(name\) => \/workbox\|precache\|sveltekit\|vite-pwa\/i\.test\(name\)\)/);
  });

  it('navigateFallback/registerType/estrategia offline nao foram tocados neste componente', () => {
    expect(source).not.toContain('registerType');
    expect(source).not.toContain('navigateFallback');
  });
});
