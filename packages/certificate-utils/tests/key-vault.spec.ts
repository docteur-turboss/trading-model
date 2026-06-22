import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockReadFile = jest.fn<any>();
const mockWriteFile = jest.fn<any>();
const mockMkdir = jest.fn<any>();
const mockAccess = jest.fn<any>();

jest.mock('node:fs/promises', () => ({
  readFile: (...args: any[]) => mockReadFile(...args),
  writeFile: (...args: any[]) => mockWriteFile(...args),
  mkdir: (...args: any[]) => mockMkdir(...args),
  access: (...args: any[]) => mockAccess(...args),
}));

jest.mock('@trading-model/common/config/logger', () => ({
  logger: {
    warn: jest.fn<any>(),
  },
}));

jest.mock('@trading-model/common/utils/errors', () => ({
  normalizeError: jest.fn((err: any) => (err instanceof Error ? err : new Error(String(err)))),
}));

jest.mock('../src/generate-key-pair', () => ({
  generateKeyPairWithId: jest.fn(() => ({ publicKey: 'pk', privateKey: 'sk', id: 'key-id' })),
  KeyAlgorithm: { RSA_4096: 'rsa', EC_P384: 'ec' },
}));

import { FileKeyVault } from '../src/key-vault';
import { generateKeyPairWithId } from '../src/generate-key-pair';

describe('FileKeyVault', () => {
  let vault: FileKeyVault;

  beforeEach(() => {
    jest.clearAllMocks();
    vault = new FileKeyVault();
  });

  it('generate should call generateKeyPairWithId', async () => {
    const result = await vault.generate();

    expect(generateKeyPairWithId).toHaveBeenCalledWith('ec');
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk', id: 'key-id' });
  });

  it('generate should pass algorithm to generateKeyPairWithId', async () => {
    const result = await vault.generate('rsa');

    expect(generateKeyPairWithId).toHaveBeenCalledWith('rsa');
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk', id: 'key-id' });
  });

  it('read should read private key from file', async () => {
    mockReadFile.mockResolvedValue('private-key-content');
    const result = await vault.read('/path/to/key.pem');

    expect(mockReadFile).toHaveBeenCalledWith('/path/to/key.pem', 'utf8');
    expect(result).toEqual({ publicKey: '', privateKey: 'private-key-content' });
  });

  it('write should create directory and write file', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await vault.write('/keys/my-key.pem', { publicKey: 'pk', privateKey: 'sk' });

    expect(mockMkdir).toHaveBeenCalledWith('/keys', { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith('/keys/my-key.pem', 'sk', { mode: 0o600 });
  });

  it('write should accept custom mode', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await vault.write('/keys/my-key.pem', { publicKey: 'pk', privateKey: 'sk' }, { mode: 0o400 });

    expect(mockWriteFile).toHaveBeenCalledWith('/keys/my-key.pem', 'sk', { mode: 0o400 });
  });

  it('exists should return true when file is accessible', async () => {
    mockAccess.mockResolvedValue(undefined);
    const result = await vault.exists('/path/to/key.pem');

    expect(mockAccess).toHaveBeenCalledWith('/path/to/key.pem', 4);
    expect(result).toBe(true);
  });

  it('exists should return false when file is not accessible', async () => {
    const fsError = new Error('ENOENT');
    (fsError as any).code = 'ENOENT';
    mockAccess.mockRejectedValue(fsError);

    const result = await vault.exists('/path/to/key.pem');

    expect(mockAccess).toHaveBeenCalledWith('/path/to/key.pem', 4);
    expect(result).toBe(false);
  });
});
