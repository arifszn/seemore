import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Theme } from '../config/schema.js';

export interface ShellColours {
  light: Record<string, string>;
  dark: Record<string, string>;
}

const TOKENS = [
  'background',
  'foreground',
  'muted-foreground',
  'card',
  'border',
  'primary',
  'primary-foreground',
  'ring',
  'error',
] as const;

/** Only reached if fumadocs' presets cannot be read at all. */
const FALLBACK: Record<(typeof TOKENS)[number], string> = {
  background: 'hsl(0, 0%, 96%)',
  foreground: 'hsl(0, 0%, 3.9%)',
  'muted-foreground': 'hsl(0, 0%, 45.1%)',
  card: 'hsl(0, 0%, 94.7%)',
  border: 'hsla(0, 0%, 80%, 50%)',
  primary: 'hsl(0, 0%, 9%)',
  'primary-foreground': 'hsl(0, 0%, 98%)',
  ring: 'hsl(0, 0%, 63.9%)',
  error: 'oklch(63.7% 0.237 25.331)',
};

const require_ = createRequire(import.meta.url);

/**
 * The lock shell's colours, read from the configured fumadocs preset so the lock screen looks
 * like the site behind it. The shell cannot load the app's stylesheet — it is encrypted — so
 * the handful of tokens it uses are inlined.
 *
 * A preset that defines a colour through variables the shell does not have (`shadcn` points
 * at the project's own `--background`) keeps fumadocs' default for that colour instead.
 */
export function shellColours(theme: Theme): ShellColours {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  let dir: string | undefined;
  try {
    dir = join(dirname(require_.resolve('fumadocs-ui/package.json')), 'css');
  } catch {
    dir = undefined;
  }

  for (const file of dir === undefined ? [] : [join(dir, 'lib', 'default-colors.css'), join(dir, `${theme}.css`)]) {
    let css: string;
    try {
      css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    } catch {
      continue;
    }

    for (const [, prelude = '', block = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      // The prelude runs back to the previous block, so it can carry an `@import …;` line.
      const selectors = (prelude.split(';').pop() ?? '').split(',').map((selector) => selector.trim());
      const targets: Record<string, string>[] = [];
      if (selectors.some((selector) => selector.startsWith('@theme') || selector === ':root')) targets.push(light);
      if (selectors.includes('.dark')) targets.push(dark);

      for (const [, name = '', value = ''] of block.matchAll(/--color-fd-([\w-]+)\s*:\s*([^;]+);/g)) {
        if (value.includes('var(')) continue;
        for (const target of targets) target[name] = value.trim();
      }
    }
  }

  const pick = (tokens: Record<string, string>, fallback: Record<string, string>) =>
    Object.fromEntries(TOKENS.map((token) => [token, tokens[token] ?? fallback[token] ?? FALLBACK[token]]));

  // Tokens a preset only sets once (`@theme static`) apply to both schemes.
  return { light: pick(light, {}), dark: pick(dark, light) };
}
