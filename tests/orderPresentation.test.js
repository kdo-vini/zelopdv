import { describe, expect, it } from 'vitest';
import {
  getOrderDeliveryPresentation,
  getOrderPaymentPresentation
} from '../src/lib/orderPresentation.js';

describe('order presentation', () => {
  it('formats a delivery snapshot into readable address details', () => {
    const presentation = getOrderDeliveryPresentation({
      fulfillment: {
        type: 'delivery',
        asap: true,
        deliveryAddress: 'Avenida General Eurico Gaspar Dutra, 438, Centro',
        deliveryStreet: 'Avenida General Eurico Gaspar Dutra',
        deliveryNumber: '438',
        deliveryComplement: 'Centro',
        deliveryNeighborhood: 'Centro',
        deliveryCity: 'Promissão',
        deliveryState: 'SP',
        deliveryPostalCode: '16370041',
        deliveryDistanceM: 2535,
        deliveryFee: 8
      }
    });

    expect(presentation).toEqual({
      kind: 'delivery',
      label: 'Entrega',
      address: 'Avenida General Eurico Gaspar Dutra, 438',
      complement: 'Centro',
      neighborhood: 'Centro',
      cityState: 'Promissão - SP',
      postalCode: '16370-041',
      distanceM: 2535,
      fee: 8,
      asap: true,
      pickupDate: null,
      pickupTime: null
    });
  });

  it('keeps pickup orders distinct from delivery orders', () => {
    expect(getOrderDeliveryPresentation({
      fulfillment: { type: 'pickup', pickupDate: '2026-09-05', pickupTime: '09:00' }
    })).toEqual({
      kind: 'pickup',
      label: 'Retirada',
      address: null,
      complement: null,
      neighborhood: null,
      cityState: null,
      postalCode: null,
      distanceM: null,
      fee: 0,
      asap: false,
      pickupDate: '2026-09-05',
      pickupTime: '09:00'
    });
  });

  it('exposes cash received and change only when the order snapshot provides them', () => {
    expect(getOrderPaymentPresentation({
      payment: { declaredMethod: 'Dinheiro', cashReceived: 50, change: 3 }
    })).toEqual({
      id: 'dinheiro',
      label: 'Dinheiro',
      isCash: true,
      received: 50,
      change: 3,
      hasCashSettlement: true
    });

    expect(getOrderPaymentPresentation({
      payment: { declaredMethod: 'Dinheiro', change: null }
    })).toEqual({
      id: 'dinheiro',
      label: 'Dinheiro',
      isCash: true,
      received: null,
      change: null,
      hasCashSettlement: false
    });

    expect(getOrderPaymentPresentation({
      payment: { declaredMethod: 'Dinheiro' }
    }).change).toBeNull();
  });
});
