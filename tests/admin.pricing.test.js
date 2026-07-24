import { describe, expect, it } from 'vitest'
import { calculateValue, subscriptionValue } from '../admin-dashboard/src/lib/pricing.js'

describe('admin pricing catalog', () => {
  it('does not charge legacy Pedidos on a bundle that already includes ZeloMenu', () => {
    expect(calculateValue('bundle', { pedidos: true, menu: true })).toBe(198)
  })

  it('charges ZeloMenu only when it is an add-on for ZeloPDV', () => {
    expect(calculateValue('pdv', { menu: true })).toBe(99)
    expect(calculateValue('chat', { menu: true })).toBe(149)
  })

  it('uses the stored monthly value when it exists', () => {
    expect(subscriptionValue({ plan_tier: 'bundle', monthly_value_cents: 22800 })).toBe(228)
  })
})
