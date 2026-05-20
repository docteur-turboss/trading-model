import { describe, it, expect, jest } from '@jest/globals';

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
