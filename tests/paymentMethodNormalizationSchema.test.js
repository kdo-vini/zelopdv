import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const migrationPath = path.resolve(
  'supabase/migrations/20260829134640_payment_method_alias_normalization.sql',
);

describe('payment method normalization migration', () => {
  test('normalizes online and legacy display labels before they reach financial tables', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('normalize_payment_method_id');
    expect(migration).toContain('Cartão de crédito');
    expect(migration).toContain('Cartão de débito');

    for (const [alias, canonical] of [
      ['dinheiro', 'dinheiro'],
      ['cash', 'dinheiro'],
      ['pix', 'pix'],
      ['pix online', 'pix'],
      ['debito', 'cartao_debito'],
      ['cartao de debito', 'cartao_debito'],
      ['credito', 'cartao_credito'],
      ['cartao de credito', 'cartao_credito'],
      ['cartao', 'cartao'],
      ['vale refeicao', 'vale_refeicao'],
      ['fiado', 'fiado'],
      ['multiplo', 'multiplo'],
    ]) {
      expect(migration).toContain(`when '${alias}' then '${canonical}'`);
    }

    expect(migration).toMatch(
      /create trigger vendas_normalize_payment_method[\s\S]+before insert or update of forma_pagamento on public\.vendas/,
    );
    expect(migration).toMatch(
      /create trigger vendas_pagamentos_normalize_payment_method[\s\S]+before insert or update of forma_pagamento on public\.vendas_pagamentos/,
    );
    expect(migration).not.toMatch(/^\s*(?:insert|update|delete)\s+[^;]*public\.(?:vendas|vendas_pagamentos)/im);
  });
});
