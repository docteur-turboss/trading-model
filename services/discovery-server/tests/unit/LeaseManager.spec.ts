import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import type { ServiceInstance } from '../../src/core/types'

const mockDump = jest.fn<() => Record<string, ServiceInstance[]>>()
const mockRemoveInstance = jest.fn<(serviceName: string, instanceId: string) => boolean>()

jest.mock('../../src/core/ServiceRegistry', () => ({
  registry: {
    dump: mockDump,
    removeInstance: mockRemoveInstance,
  },
}))

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('../../src/config/env', () => ({
  env: { CLEANUP_SERVICE_INTERVAL_MS: 5000 },
}))

jest.useFakeTimers()

import { LeaseManager } from '../../src/core/LeaseManager'
import { validServiceInstance } from '../fixtures/index'

describe('LeaseManager', () => {
  let leaseManager: LeaseManager

  beforeEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
    leaseManager = new LeaseManager()
  })

  afterEach(() => {
    leaseManager.stop()
  })

  describe('start', () => {
    it('should set an interval', () => {
      const spy = jest.spyOn(global, 'setInterval')
      leaseManager.start()
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(expect.any(Function), 5000)
      spy.mockRestore()
    })

    it('should be idempotent', () => {
      const spy = jest.spyOn(global, 'setInterval')
      leaseManager.start()
      leaseManager.start()
      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    })
  })

  describe('stop', () => {
    it('should clear the interval', () => {
      const spy = jest.spyOn(global, 'clearInterval')
      leaseManager.start()
      leaseManager.stop()
      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    })

    it('should be idempotent when not started', () => {
      expect(() => leaseManager.stop()).not.toThrow()
    })
  })

  describe('isAlive', () => {
    it('should return true for recent heartbeat', () => {
      const alive = leaseManager.isAlive(validServiceInstance({ lastHeartbeat: Date.now() }))
      expect(alive).toBe(true)
    })

    it('should return false for expired heartbeat', () => {
      const instance = validServiceInstance({ lastHeartbeat: Date.now() - 60_000 })
      const expired = leaseManager.isAlive(instance)
      expect(expired).toBe(false)
    })

    it('should return true at TTL boundary', () => {
      const instance = validServiceInstance({ lastHeartbeat: Date.now() - 30_000 })
      const boundary = leaseManager.isAlive(instance)
      expect(boundary).toBe(true)
    })
  })
})
