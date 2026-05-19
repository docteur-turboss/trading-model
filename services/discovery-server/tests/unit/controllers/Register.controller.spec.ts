import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { createReq, createRes, createNext } from '../../helpers/express'
import { validRegisterPayload } from '../../fixtures/index'

const mockVerifyInstanceName = jest.fn<(name: string) => boolean>()
const mockGenerateInstanceId = jest.fn<(name: string, ip: string, port: number) => string>()
const mockRegisterInstance = jest.fn<(instance: any) => any>()
const mockListServiceNames = jest.fn<() => string[]>()
const mockGetInstances = jest.fn<(name: string) => any[]>()
const mockGetInstance = jest.fn<(name: string, id: string) => any | undefined>()

jest.mock('../../../src/core/ServiceRegistry', () => ({
  registry: {
    verifyInstanceName: mockVerifyInstanceName,
    generateInstanceId: mockGenerateInstanceId,
    registerInstance: mockRegisterInstance,
    listServiceNames: mockListServiceNames,
    getInstances: mockGetInstances,
    getInstance: mockGetInstance,
  },
}))

jest.mock('@trading-model/common/middleware/catchError', () => ({
  catchSync: (fn: any) => fn,
}))

jest.mock('@trading-model/common/middleware/responseException', () => ({
  ResponseException: jest.fn((body: any) => ({
    BadRequest: () => ({ type: 'BadRequest' as const, error: body }),
    NotFound: () => ({ type: 'NotFound' as const, error: body }),
    OK: () => ({ type: 'OK' as const, ...body }),
    Success: () => ({ type: 'Success' as const, ...body }),
  })),
}))

jest.mock('@trading-model/common/validation/primitives', () => ({
  isObject: (v: any) => v !== null && typeof v === 'object',
  isNonEmptyString: (v: any) => typeof v === 'string' && v.trim().length > 0,
  isValidIP: (v: any) => typeof v === 'string' && v.length > 0,
  isValidPort: (v: any) => typeof v === 'number' && v > 0,
}))

import { register, listServices, getServiceInstances, getInstance } from '../../../src/controllers/Register.controller'

describe('Register.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('register', () => {
    it('should reject null body with BadRequest', async () => {
      await expect(
        register(createReq({ body: null }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'Invalid request body' })
    })

    it('should reject missing serviceName with BadRequest', async () => {
      await expect(
        register(createReq({ body: { ip: '1.1.1.1', port: 80 } }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'serviceName is required' })
    })

    it('should reject invalid service name with BadRequest', async () => {
      mockVerifyInstanceName.mockReturnValue(false)
      await expect(
        register(createReq({ body: validRegisterPayload }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'Invalid service name' })
    })

    it('should reject invalid IP with BadRequest', async () => {
      mockVerifyInstanceName.mockReturnValue(true)
      await expect(
        register(createReq({ body: { ...validRegisterPayload, ip: null } }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'Invalid IP address' })
    })

    it('should reject invalid port with BadRequest', async () => {
      mockVerifyInstanceName.mockReturnValue(true)
      await expect(
        register(createReq({ body: { ...validRegisterPayload, port: -1 } }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'Invalid port' })
    })

    it('should register a new instance and return OK with generated instanceId', async () => {
      mockVerifyInstanceName.mockReturnValue(true)
      mockGenerateInstanceId.mockReturnValue('gen-id-123')
      mockRegisterInstance.mockReturnValue({ instanceId: 'gen-id-123', token: 'tok-abc' })

      await expect(
        register(createReq({ body: validRegisterPayload }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'OK', instanceId: 'gen-id-123' })

      expect(mockGenerateInstanceId).toHaveBeenCalledWith(
        validRegisterPayload.serviceName,
        validRegisterPayload.ip,
        validRegisterPayload.port,
      )
    })

    it('should pass provided instanceId to registry', async () => {
      mockVerifyInstanceName.mockReturnValue(true)
      mockRegisterInstance.mockReturnValue({ instanceId: 'custom-id', token: 'tok-abc' })

      const body = { ...validRegisterPayload, instanceId: 'custom-id' }
      await expect(
        register(createReq({ body }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'OK', instanceId: 'custom-id' })

      expect(mockGenerateInstanceId).not.toHaveBeenCalled()
    })
  })

  describe('listServices', () => {
    it('should return list of service names', async () => {
      mockListServiceNames.mockReturnValue(['svc-a', 'svc-b'])
      await expect(
        listServices(createReq(), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'Success', 0: 'svc-a', 1: 'svc-b' })
    })
  })

  describe('getServiceInstances', () => {
    it('should reject missing serviceName with BadRequest', async () => {
      await expect(
        getServiceInstances(createReq({ params: {} }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'BadRequest' })
    })

    it('should reject unknown service with NotFound', async () => {
      mockVerifyInstanceName.mockReturnValue(false)
      await expect(
        getServiceInstances(createReq({ params: { serviceName: 'unknown' } }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'NotFound' })
    })

    it('should return instances for known service', async () => {
      mockVerifyInstanceName.mockReturnValue(true)
      mockGetInstances.mockReturnValue([{ instanceId: 'i1' }])
      await expect(
        getServiceInstances(createReq({ params: { serviceName: 'svc' } }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'Success', 0: { instanceId: 'i1' } })
    })
  })

  describe('getInstance', () => {
    it('should reject missing params with BadRequest', async () => {
      await expect(
        getInstance(createReq({ params: { serviceName: 'svc' } }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'BadRequest' })
    })

    it('should reject unknown instance with NotFound', async () => {
      mockGetInstance.mockReturnValue(undefined)
      await expect(
        getInstance(createReq({ params: { serviceName: 'svc', instanceId: 'i1' } }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'NotFound' })
    })

    it('should return instance when found', async () => {
      mockGetInstance.mockReturnValue({ instanceId: 'i1', serviceName: 'svc' })
      await expect(
        getInstance(createReq({ params: { serviceName: 'svc', instanceId: 'i1' } }), createRes(), createNext),
      ).rejects.toMatchObject({ type: 'Success', instanceId: 'i1' })
    })
  })
})
