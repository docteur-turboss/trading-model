import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { createReq, createRes } from '../../helpers/express'

const mockValidInstanceToken = jest.fn<(token: string, instanceId: string) => boolean>()
const mockUpdateHeartbeat = jest.fn<(serviceName: string, instanceId: string) => number | false>()
const mockUpdateToken = jest.fn<(instanceId: string) => string>()

jest.mock('../../../src/core/ServiceRegistry', () => ({
  registry: {
    validInstanceToken: mockValidInstanceToken,
    updateHeartbeat: mockUpdateHeartbeat,
    updateToken: mockUpdateToken,
  },
}))

jest.mock('@trading-model/common/middleware/catchError', () => ({
  catchSync: (fn: any) => fn,
}))

jest.mock('@trading-model/common/middleware/responseException', () => ({
  ResponseException: jest.fn((body: any) => ({
    BadRequest: () => ({ type: 'BadRequest' as const, error: body }),
    Unauthorized: () => ({ type: 'Unauthorized' as const, error: body }),
    NotFound: () => ({ type: 'NotFound' as const, error: body }),
    Success: () => ({ type: 'Success' as const, ...body }),
  })),
}))

jest.mock('@trading-model/common/validation/primitives', () => ({
  isObject: (v: any) => v !== null && typeof v === 'object',
  isNonEmptyString: (v: any) => typeof v === 'string' && v.trim().length > 0,
}))

import { heartbeat, rotateToken } from '../../../src/controllers/Heartbeat.controller'

describe('Heartbeat.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('heartbeat', () => {
    it('should reject non-object body with BadRequest', async () => {
      const req = createReq({ body: 'invalid' })
      await expect(heartbeat(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'BadRequest',
        error: 'Invalid request body',
      })
    })

    it('should reject missing serviceName with BadRequest', async () => {
      const req = createReq({ body: { instanceId: 'i1' } })
      await expect(heartbeat(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'BadRequest',
        error: 'serviceName is required',
      })
    })

    it('should reject missing instanceId with BadRequest', async () => {
      const req = createReq({ body: { serviceName: 'svc' } })
      await expect(heartbeat(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'BadRequest',
        error: 'instanceId is required',
      })
    })

    it('should reject missing token header with Unauthorized', async () => {
      const req = createReq({ body: { serviceName: 'svc', instanceId: 'i1' } })
      await expect(heartbeat(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Unauthorized',
        error: 'Missing or invalid instance token',
      })
    })

    it('should reject invalid token with Unauthorized', async () => {
      mockValidInstanceToken.mockReturnValue(false)
      const req = createReq({
        body: { serviceName: 'svc', instanceId: 'i1' },
        headers: { 'x-instance-token': 'bad' },
      })
      await expect(heartbeat(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Unauthorized',
        error: 'Invalid instance token',
      })
    })

    it('should reject unknown instance with NotFound', async () => {
      mockValidInstanceToken.mockReturnValue(true)
      mockUpdateHeartbeat.mockReturnValue(false)
      const req = createReq({
        body: { serviceName: 'svc', instanceId: 'i1' },
        headers: { 'x-instance-token': 'ok' },
      })
      await expect(heartbeat(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'NotFound',
        error: 'Instance not found',
      })
    })

    it('should return TTL on successful heartbeat', async () => {
      mockValidInstanceToken.mockReturnValue(true)
      mockUpdateHeartbeat.mockReturnValue(15000)
      const req = createReq({
        body: { serviceName: 'svc', instanceId: 'i1' },
        headers: { 'x-instance-token': 'ok' },
      })
      await expect(heartbeat(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Success',
        ttl: 15000,
      })
    })
  })

  describe('rotateToken', () => {
    it('should reject non-object body with BadRequest', async () => {
      const req = createReq({ body: null })
      await expect(rotateToken(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'BadRequest',
        error: 'Invalid request body',
      })
    })

    it('should reject missing instanceId with BadRequest', async () => {
      const req = createReq({ body: {} })
      await expect(rotateToken(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'BadRequest',
        error: 'instanceId is required',
      })
    })

    it('should reject missing token header with Unauthorized', async () => {
      const req = createReq({ body: { instanceId: 'i1' } })
      await expect(rotateToken(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Unauthorized',
        error: 'Missing or invalid instance token',
      })
    })

    it('should reject invalid token with Unauthorized', async () => {
      mockValidInstanceToken.mockReturnValue(false)
      const req = createReq({
        body: { instanceId: 'i1' },
        headers: { 'x-instance-token': 'bad' },
      })
      await expect(rotateToken(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Unauthorized',
        error: 'Invalid instance token',
      })
    })

    it('should return new token on successful rotation', async () => {
      mockValidInstanceToken.mockReturnValue(true)
      mockUpdateToken.mockReturnValue('new-token-value')
      const req = createReq({
        body: { instanceId: 'i1' },
        headers: { 'x-instance-token': 'old-token' },
      })
      await expect(rotateToken(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Success',
        token: 'new-token-value',
      })
    })
  })
})
