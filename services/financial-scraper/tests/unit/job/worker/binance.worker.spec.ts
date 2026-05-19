import { describe, it, expect, beforeEach, jest } from '@jest/globals'

jest.mock('../../../../src/clients/binance/binance.client', () => ({
  getOrderBook: jest.fn(),
  CandlestickData: jest.fn(),
  getRecentTrades: jest.fn(),
  getOrderBookTicker: jest.fn(),
  get24hrTickerStats: jest.fn(),
  getSymbolPriceTicker: jest.fn(),
}))

jest.mock('../../../../src/clients/binance/normalizer', () => ({
  BinanceNormalizer: {
    orderBook: jest.fn(),
    trades: jest.fn(),
    candles: jest.fn(),
    ticker24h: jest.fn(),
    priceTicker: jest.fn(),
    bookTicker: jest.fn(),
  },
}))

jest.mock('../../../../src/config/message-manager', () => ({
  MessageManager: {
    post: {
      indirect: jest.fn(),
    },
  },
}))

jest.mock('@trading-model/broker-message', () => ({
  helper: {
    MetadataBuilder: jest.fn(() => ({
      setDelivery: jest.fn().mockReturnThis(),
      setEventType: jest.fn().mockReturnThis(),
      setTopic: jest.fn().mockReturnThis(),
      setSecurity: jest.fn().mockReturnThis(),
      setIds: jest.fn().mockReturnThis(),
      setPublisher: jest.fn().mockReturnThis(),
      toJSON: jest.fn().mockReturnValue({}),
    })),
  },
}))

jest.mock('../../../../src/config/env', () => ({
  env: {
    SERVICE_NAME: 'financial-scraper-service',
    INSTANCE_ID: 'test-instance-1',
  },
}))

jest.mock('uuid', () => ({
  v4: () => '00000000-0000-0000-0000-000000000000',
}))

import * as binanceClient from '../../../../src/clients/binance/binance.client'
import { BinanceNormalizer } from '../../../../src/clients/binance/normalizer'
import { MessageManager } from '../../../../src/config/message-manager'
import { BinanceWorker } from '../../../../src/job/worker/binance.worker'

const mockGetOrderBook = jest.mocked(binanceClient.getOrderBook)
const mockCandlestickData = jest.mocked(binanceClient.CandlestickData)
const mockRecentTrades = jest.mocked(binanceClient.getRecentTrades)
const mockOrderBookTicker = jest.mocked(binanceClient.getOrderBookTicker)
const mock24hrTickerStats = jest.mocked(binanceClient.get24hrTickerStats)
const mockSymbolPriceTicker = jest.mocked(binanceClient.getSymbolPriceTicker)

const mockNormalizerOrderBook = jest.mocked(BinanceNormalizer.orderBook)
const mockNormalizerTrades = jest.mocked(BinanceNormalizer.trades)
const mockNormalizerCandles = jest.mocked(BinanceNormalizer.candles)
const mockNormalizerTicker24h = jest.mocked(BinanceNormalizer.ticker24h)
const mockNormalizerPriceTicker = jest.mocked(BinanceNormalizer.priceTicker)
const mockNormalizerBookTicker = jest.mocked(BinanceNormalizer.bookTicker)

const mockMessageManagerIndirect = jest.mocked(MessageManager.post.indirect)

describe('BinanceWorker', () => {
  let worker: BinanceWorker

  const mockNormalized = {
    orderBook: { symbol: 'BTCUSDT' },
    recentTrades: [{ tradeId: 1 }],
    candles: [{ symbol: 'BTCUSDT', interval: '1m' }],
    ticker24h: [{ symbol: 'BTCUSDT' }],
    priceTicker: { BTCUSDT: 50000 },
    bookTicker: [{ symbol: 'BTCUSDT' }],
  }

  beforeEach(() => {
    jest.clearAllMocks()

    mockGetOrderBook.mockResolvedValue({ bids: [], asks: [], lastUpdateId: 0 })
    mockCandlestickData.mockResolvedValue([])
    mockRecentTrades.mockResolvedValue([])
    mockOrderBookTicker.mockResolvedValue([])
    mock24hrTickerStats.mockResolvedValue([])
    mockSymbolPriceTicker.mockResolvedValue([])

    mockNormalizerOrderBook.mockReturnValue(mockNormalized.orderBook as never)
    mockNormalizerTrades.mockReturnValue(mockNormalized.recentTrades as never)
    mockNormalizerCandles.mockReturnValue(mockNormalized.candles as never)
    mockNormalizerTicker24h.mockReturnValue(mockNormalized.ticker24h as never)
    mockNormalizerPriceTicker.mockReturnValue(mockNormalized.priceTicker as never)
    mockNormalizerBookTicker.mockReturnValue(mockNormalized.bookTicker as never)

    worker = new BinanceWorker({
      symbol: 'BTCUSDT',
      interval: '1m',
      candleLimit: 50,
      tradeLimit: 50,
      orderBookLimit: 10,
    })
  })

  describe('run', () => {
    it('should call all 6 Binance client functions in parallel', async () => {
      await worker.run()

      expect(mockGetOrderBook).toHaveBeenCalledWith('BTCUSDT', 10)
      expect(mockRecentTrades).toHaveBeenCalledWith('BTCUSDT', 50)
      expect(mockCandlestickData).toHaveBeenCalledWith('BTCUSDT', 50, '1m')
      expect(mock24hrTickerStats).toHaveBeenCalledWith(['BTCUSDT'])
      expect(mockSymbolPriceTicker).toHaveBeenCalledWith(['BTCUSDT'])
      expect(mockOrderBookTicker).toHaveBeenCalledWith(['BTCUSDT'])
    })

    it('should normalize all raw responses', async () => {
      await worker.run()

      expect(mockNormalizerOrderBook).toHaveBeenCalled()
      expect(mockNormalizerTrades).toHaveBeenCalled()
      expect(mockNormalizerCandles).toHaveBeenCalled()
      expect(mockNormalizerTicker24h).toHaveBeenCalled()
      expect(mockNormalizerPriceTicker).toHaveBeenCalled()
      expect(mockNormalizerBookTicker).toHaveBeenCalled()
    })

    it('should return normalized result with fetchedAt', async () => {
      const result = await worker.run()

      expect(result.orderBook).toEqual(mockNormalized.orderBook)
      expect(result.recentTrades).toEqual(mockNormalized.recentTrades)
      expect(result.candles).toEqual(mockNormalized.candles)
      expect(result.ticker24h).toEqual(mockNormalized.ticker24h)
      expect(result.priceTicker).toEqual(mockNormalized.priceTicker)
      expect(result.bookTicker).toEqual(mockNormalized.bookTicker)
      expect(typeof result.fetchedAt).toBe('number')
    })

    it('should publish 6 messages via MessageManager', async () => {
      await worker.run()

      expect(mockMessageManagerIndirect).toHaveBeenCalledTimes(6)
    })

    it('should use default options when not provided', async () => {
      const defaultWorker = new BinanceWorker({ symbol: 'ETHUSDT' })
      await defaultWorker.run()

      expect(mockRecentTrades).toHaveBeenCalledWith('ETHUSDT', 100)
      expect(mockCandlestickData).toHaveBeenCalledWith('ETHUSDT', 100, '1m')
    })
  })
})
