import { expect, it } from 'vitest';
import { reorderMesas, sortMesasByNumero, sortMesasForMap } from '../src/lib/mesasSort.js';

it('puts pure numbers in numeric order before named mesas', () => {
  const sorted = sortMesasByNumero([
    { id: 'z', numero: '10' },
    { id: 'v', numero: 'Varanda' },
    { id: 'a', numero: '2' },
    { id: 'b', numero: '1' },
    { id: 'm', numero: 'Bar' },
    { id: 'f', numero: '50' },
  ]);
  expect(sorted.map((m) => m.numero)).toEqual(['1', '2', '10', '50', 'Bar', 'Varanda']);
});

it('treats mixed labels as names, not numbers', () => {
  const sorted = sortMesasByNumero([
    { id: '1', numero: 'M1' },
    { id: '2', numero: '3' },
    { id: '3', numero: '2' },
  ]);
  expect(sorted.map((m) => m.numero)).toEqual(['2', '3', 'M1']);
});

it('sortMesasForMap prefers mapa_ordem over natural numero', () => {
  const sorted = sortMesasForMap([
    { id: 'a', numero: '1', mapa_ordem: 2 },
    { id: 'b', numero: '2', mapa_ordem: 0 },
    { id: 'c', numero: 'Varanda', mapa_ordem: 1 },
  ]);
  expect(sorted.map((m) => m.numero)).toEqual(['2', 'Varanda', '1']);
});

it('sortMesasForMap puts null mapa_ordem after numbered ones', () => {
  const sorted = sortMesasForMap([
    { id: 'n', numero: '9' },
    { id: 'a', numero: '1', mapa_ordem: 0 },
  ]);
  expect(sorted.map((m) => m.id)).toEqual(['a', 'n']);
});

it('reorderMesas moves item and renumbers mapa_ordem', () => {
  const before = [
    { id: 'a', numero: '1', mapa_ordem: 0 },
    { id: 'b', numero: '2', mapa_ordem: 1 },
    { id: 'c', numero: '3', mapa_ordem: 2 },
  ];
  const after = reorderMesas(before, 0, 2);
  expect(after.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  expect(after.map((m) => m.mapa_ordem)).toEqual([0, 1, 2]);
});
