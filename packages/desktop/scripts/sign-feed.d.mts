// Types for the tests, which sign feeds with the real script.
export function appPublicKey(): string;
export function buildFeed(
  version: string,
  zips: { arm64: string; x64: string },
  privateKeyPem: string,
  publicKeyPem: string,
): { payload: string; signature: string };
