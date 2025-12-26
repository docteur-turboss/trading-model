export const mockRegistry = {
  verifyInstanceName: jest.fn(),
  generateInstanceId: jest.fn(),
  registerInstance: jest.fn(),
  listServiceNames: jest.fn(),
  getInstances: jest.fn(),
  getInstance: jest.fn(),
  dump: jest.fn(),

  validInstanceToken: jest.fn(),
  updateHeartbeat: jest.fn(),
  updateToken: jest.fn(),
};

jest.mock("../../core/ServiceRegistry", () => ({
  registry: mockRegistry,
}));