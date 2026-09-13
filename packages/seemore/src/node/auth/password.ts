import { normalisePassword } from '../../shared/auth/crypto.js';

export const PASSWORD_ENV = 'SEEMORE_PASSWORD';

/**
 * The site password, from the environment and nowhere else: never the config file, which is
 * committed, and never a CLI flag, which lands in shell history and process listings.
 *
 * Nothing here — or anywhere else — echoes the password or any part of it.
 */
export function readPassword(command: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[PASSWORD_ENV];
  if (raw === undefined || raw === '') {
    throw new Error(
      `\`auth\` is on, but ${PASSWORD_ENV} is not set. Pass the password through the environment — in CI, from a secret:\n\n` +
        `  ${PASSWORD_ENV}='a-long-passphrase' ${command}\n\n` +
        `Never put it in seemore.config.ts.`,
    );
  }

  // Normalised before derivation, exactly as the lock screen does.
  return normalisePassword(raw);
}
