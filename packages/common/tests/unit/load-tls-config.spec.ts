import { describe, it, expect } from '@jest/globals';
import { loadTlsConfig } from '../../src/server/load-tls-config';

describe('loadTlsConfig', () => {
  it('should return TLS config from env object', () => {
    const env = {
      TLS_KEY_PATH: '/etc/tls/key.pem',
      TLS_CERT_PATH: '/etc/tls/cert.pem',
      TLS_CA_PATH: '/etc/tls/ca.pem',
    };

    const result = loadTlsConfig(env);

    expect(result).toEqual({
      key: '/etc/tls/key.pem',
      cert: '/etc/tls/cert.pem',
      ca: '/etc/tls/ca.pem',
    });
  });

  it('should return empty strings when paths are empty', () => {
    const env = {
      TLS_KEY_PATH: '',
      TLS_CERT_PATH: '',
      TLS_CA_PATH: '',
    };

    const result = loadTlsConfig(env);

    expect(result).toEqual({ key: '', cert: '', ca: '' });
  });

  it('should return TLS config with special characters in paths', () => {
    const env = {
      TLS_KEY_PATH: 'C:\\Program Files\\app\\tls\\key.pem',
      TLS_CERT_PATH: '/path/with spaces/cert.pem',
      TLS_CA_PATH: '/path/with/dashes/ca.pem',
    };

    const result = loadTlsConfig(env);

    expect(result).toEqual({
      key: 'C:\\Program Files\\app\\tls\\key.pem',
      cert: '/path/with spaces/cert.pem',
      ca: '/path/with/dashes/ca.pem',
    });
  });
});
