import { describe, expect, it } from 'vitest';
import {
  decodeIfoodJwtClaims,
  merchantScopesFromClaims,
  tokenGrantsMerchantAccess
} from '../src/lib/server/ifood/http/tokenClaims.js';

function jwtWith(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.x`;
}

describe('tokenClaims', () => {
  it('decodes JWT payload without verifying signature', () => {
    const claims = decodeIfoodJwtClaims(jwtWith({ merchant_scope: ['a:order'], scope: ['order'] }));
    expect(claims).toMatchObject({ merchant_scope: ['a:order'], scope: ['order'] });
  });

  it('returns null for opaque tokens', () => {
    expect(decodeIfoodJwtClaims('access-token-canary-value')).toBeNull();
  });

  it('groups merchant_scope by merchant id', () => {
    expect(merchantScopesFromClaims({
      merchant_scope: [
        'd848b8aa-da9f-4003-9461-5c21ff47ec31:order',
        'd848b8aa-da9f-4003-9461-5c21ff47ec31:events',
        'other:merchant'
      ]
    })).toEqual([
      { merchantId: 'd848b8aa-da9f-4003-9461-5c21ff47ec31', modules: ['order', 'events'] },
      { merchantId: 'other', modules: ['merchant'] }
    ]);
  });

  it('tokenGrantsMerchantAccess accepts order/events/merchant modules', () => {
    const claims = {
      merchant_scope: ['d848b8aa-da9f-4003-9461-5c21ff47ec31:events']
    };
    expect(tokenGrantsMerchantAccess(claims, 'd848b8aa-da9f-4003-9461-5c21ff47ec31')).toBe(true);
    expect(tokenGrantsMerchantAccess(claims, '4e29e9a3-60d3-4eaa-bd0a-15795c276975')).toBe(false);
  });
});
