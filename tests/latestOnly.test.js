import { describe, it, expect } from 'vitest';
import { createLatestOnly } from '../src/lib/utils/latestOnly.js';

describe('createLatestOnly', () => {
	it('token from start() is not stale right away', () => {
		const guard = createLatestOnly();
		const token = guard.start();
		expect(token.isStale).toBe(false);
	});

	it('marks earlier tokens as stale once a newer one starts', () => {
		const guard = createLatestOnly();
		const first = guard.start();
		const second = guard.start();

		expect(first.isStale).toBe(true);
		expect(second.isStale).toBe(false);
	});

	it('resposta antiga que chega depois da nova nao sobrescreve o estado', async () => {
		// Reproduz o bug de /relatorios: o preset "hoje" comeca a carregar,
		// o usuario clica em "Ultimos 30" antes da primeira resposta chegar,
		// e a resposta de "hoje" (mais lenta) resolve depois da de "ultimos30".
		const guard = createLatestOnly();
		let state = null;

		async function load(value, delayMs) {
			const token = guard.start();
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			if (token.isStale) return;
			state = value;
		}

		const slowStale = load('hoje-com-despesas-zeradas', 30);
		const fastCurrent = load('ultimos30-correto', 5);

		await Promise.all([slowStale, fastCurrent]);

		expect(state).toBe('ultimos30-correto');
	});

	it('nao marca o token atual como obsoleto quando nenhuma outra chamada comecou', () => {
		const guard = createLatestOnly();
		const token = guard.start();
		expect(token.isStale).toBe(false);
		expect(token.isStale).toBe(false);
	});

	it('cada instancia tem sua propria sequencia', () => {
		const guardA = createLatestOnly();
		const guardB = createLatestOnly();

		const tokenA = guardA.start();
		guardB.start();

		expect(tokenA.isStale).toBe(false);
	});
});
