/** Generates a cryptographically random Base64URL-encoded string. */
export const generateRandomStr = (): string =>
  Buffer.from(crypto.getRandomValues(new Uint32Array(10)).join(''), 'utf-8').toString('base64url');
