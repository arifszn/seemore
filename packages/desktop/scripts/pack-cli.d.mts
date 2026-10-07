// Types for the tests, which pack archives with the real script.
export const ARCHIVE: string;
export const MANIFEST: string;
export function packCli(stageDir: string, outDir: string, options?: { quality?: number }): Promise<{ archive: string; sha256: string }>;
