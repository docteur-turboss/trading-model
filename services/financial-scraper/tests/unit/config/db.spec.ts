import { describe, it, expect, jest } from '@jest/globals';

process.env.TLS_KEY_PATH = '/etc/tls/key.pem';
process.env.TLS_CERT_PATH = '/etc/tls/cert.pem';
process.env.TLS_CA_PATH = '/etc/tls/ca.pem';
process.env.APP_NAME = 'financial-scraper';
process.env.SERVICE_NAME = 'financial-scrapper-service';
process.env.INSTANCE_ID = 'instance-1';
process.env.ADDRESS_MANAGER_URL = 'https://address-manager.example.com';

const mockCreatePool = jest.fn<any>().mockReturnValue({});

jest.mock('mysql2', () => ({
  createPool: mockCreatePool,
}));

jest.mock('ts-sql-query/connections/MySqlConnection', () => ({
  MySqlConnection: class {
    constructor() {}
  },
}));

jest.mock('ts-sql-query/queryRunners/MySql2PoolQueryRunner', () => ({
  MySql2PoolQueryRunner: jest.fn(),
}));

import { DBConnection, database } from '../../../src/config/db';

describe('config/db', () => {
  it('should export database pool', () => {
    expect(database).toBeDefined();
  });

  it('should export DBConnection class', () => {
    expect(DBConnection).toBeDefined();
    const instance = new DBConnection();
    expect(instance).toBeDefined();
  });

  it('should create pool with expected config', () => {
    expect(mockCreatePool).toHaveBeenCalledWith(expect.objectContaining({ connectionLimit: 10 }));
  });
});
