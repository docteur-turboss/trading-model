// wallet-manager.test.ts
import {describe, expect, test} from '@jest/globals';
import {createWallet} from './wallet-manager';

describe('Wallet module', () => {

  describe('Initialization', () => {
    test('should create wallet with valid initial values', () => {
      const wallet = createWallet({initialCash: 1000, initialPrice: 50});
      expect(wallet.getCash()).toBe(1000);
      expect(wallet.getPrice()).toBe(50);
      expect(wallet.getPosition()).toBe(0);
      expect(wallet.getValuation()).toBe(1000);
    });

    test('should throw error for invalid initial cash', () => {
      expect(() => createWallet({initialCash: -10, initialPrice: 50})).toThrow('Invalid initial cash amount.');
      expect(() => createWallet({initialCash: NaN, initialPrice: 50})).toThrow('Invalid initial cash amount.');
    });

    test('should throw error for invalid initial price', () => {
      expect(() => createWallet({initialCash: 1000, initialPrice: 0})).toThrow('Invalid initial price.');
      expect(() => createWallet({initialCash: 1000, initialPrice: -5})).toThrow('Invalid initial price.');
    });
  });

  describe('Buying behavior', () => {
    test('should buy successfully if enough cash', () => {
      const wallet = createWallet({initialCash: 1000, initialPrice: 50});
      const result = wallet.buy(5); // cost = 250
      expect(result).toBe(true);
      expect(wallet.getPosition()).toBe(5);
      expect(wallet.getCash()).toBe(750);
      expect(wallet.getValuation()).toBe(1000); // 750 + 5*50
    });

    test('should fail to buy if insufficient cash', () => {
      const wallet = createWallet({initialCash: 100, initialPrice: 50});
      const result = wallet.buy(3); // cost = 150
      expect(result).toBe(false);
      expect(wallet.getPosition()).toBe(0);
      expect(wallet.getCash()).toBe(100);
    });

    test('should fail to buy with invalid amount (zero or negative)', () => {
      const wallet = createWallet({initialCash: 1000, initialPrice: 50});
      expect(wallet.buy(0)).toBe(false);
      expect(wallet.buy(-2)).toBe(false);
    });
  });

  describe('Selling behavior', () => {
    test('should sell successfully when enough position', () => {
      const wallet = createWallet({initialCash: 1000, initialPrice: 50});
      wallet.buy(5);
      const result = wallet.sell(2);
      expect(result).toBe(true);
      expect(wallet.getPosition()).toBe(3);
      expect(wallet.getCash()).toBe(1000 - 5 * 50 + 2 * 50); // 1000 - 250 + 100 = 850
      expect(wallet.getValuation()).toBe(850 + 3 * 50); // 1000
    });

    test('should fail to sell more than current position', () => {
      const wallet = createWallet({initialCash: 1000, initialPrice: 50});
      wallet.buy(2);
      const result = wallet.sell(5);
      expect(result).toBe(false);
      expect(wallet.getPosition()).toBe(2);
    });

    test('should fail to sell invalid amount (zero or negative)', () => {
      const wallet = createWallet({initialCash: 1000, initialPrice: 50});
      wallet.buy(3);
      expect(wallet.sell(0)).toBe(false);
      expect(wallet.sell(-1)).toBe(false);
    });
  });

  describe('Price management', () => {
    test('should update price correctly', () => {
      const wallet = createWallet({initialCash: 1000, initialPrice: 50});
      wallet.setPrice(75);
      expect(wallet.getPrice()).toBe(75);
    });

    test('should ignore invalid price updates (negative or non-numeric)', () => {
      const wallet = createWallet({initialCash: 1000, initialPrice: 50});
      wallet.setPrice(-10);
      expect(wallet.getPrice()).toBe(50);
      wallet.setPrice(NaN);
      expect(wallet.getPrice()).toBe(50);
    });
  });

  describe('Valuation and state tracking', () => {
    test('should calculate valuation correctly after buy/sell/price changes', () => {
      const wallet = createWallet({initialCash: 1000, initialPrice: 50});
      wallet.buy(5); // spend 250, cash=750, pos=5
      wallet.sell(2); // gain 100, cash=850, pos=3
      wallet.setPrice(60);
      expect(wallet.getValuation()).toBeCloseTo(850 + 3 * 60); // 1030
    });

    test('should remain consistent across multiple operations', () => {
      const wallet = createWallet({initialCash: 500, initialPrice: 20});
      wallet.buy(10); // cost 200, cash 300, pos 10
      wallet.setPrice(25);
      wallet.sell(4); // +100, cash 400, pos 6
      expect(wallet.getPosition()).toBe(6);
      expect(wallet.getCash()).toBe(400);
      expect(wallet.getValuation()).toBe(400 + 6 * 25); // 550
    });
  });
});
