import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProfileAnchor } from '../src/lib/profileAnchors.js';

describe('profile checklist anchors', () => {
  it('seleciona a aba que contém cada configuração', () => {
    expect(resolveProfileAnchor('#logo')).toEqual({ anchor: 'logo', tab: 'perfil' });
    expect(resolveProfileAnchor('#documento')).toEqual({ anchor: 'documento', tab: 'empresa' });
    expect(resolveProfileAnchor('#largura-bobina')).toEqual({ anchor: 'largura-bobina', tab: 'preferencias' });
  });

  it('ignora hashes desconhecidos', () => {
    expect(resolveProfileAnchor('#email-do-cliente')).toBeNull();
    expect(resolveProfileAnchor('')).toBeNull();
  });

  it('as três seções existem de fato na página de Perfil', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/perfil/+page.svelte'), 'utf8');
    expect(source).toContain('id="logo"');
    expect(source).toContain('id="documento"');
    expect(source).toContain('id="largura-bobina"');
    expect(source).toContain('on:hashchange={syncProfileAnchor}');
  });
});
