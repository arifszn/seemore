import type { Feature, FeatureFlag, ResolvedFeatures } from '../../shared/types.js';

/**
 * Feature flags.
 *
 * MkDocs Material's model — one flat list of dotted strings — but typed as a union, which
 * their YAML cannot do. Because seemore has default-on features where MkDocs has none, the
 * list is additive over the defaults and a `!` prefix turns a default-on feature off.
 */

export { FEATURES } from '../../shared/types.js';
export type { Feature, FeatureFlag, ResolvedFeatures } from '../../shared/types.js';

export const FEATURE_DEFAULTS: Record<Feature, boolean> = {
  'navigation.instant.prefetch': true,
  'navigation.instant.preview': false,
  'navigation.footer': true,
  'navigation.top': true,
  'navigation.path': false,
  'navigation.sections': false,
  'navigation.prune': false,
  'toc.follow': true,
  'toc.integrate': false,
  'content.code.copy': true,
  // Implicitly on when `editLink` is configured; there is nothing to link to otherwise.
  'content.action.edit': false,
  'search.suggest': true,
  'search.highlight': true,
  'social.cards': false,
};

export function isFeatureEnabled(features: ResolvedFeatures, feature: Feature): boolean {
  return features[feature];
}

/**
 * Rules the flag set must satisfy. MkDocs reports its equivalents in prose and lets the
 * site build wrong; we fail in the config loader with the fix in the message.
 */
type Rule =
  | { kind: 'conflict'; a: Feature; b: Feature; why: string }
  | { kind: 'requires'; flag: Feature; needs: Feature; why: string };

const RULES: Rule[] = [
  {
    kind: 'conflict',
    a: 'toc.integrate',
    b: 'toc.follow',
    why: '`toc.integrate` merges the table of contents into the sidebar, leaving no separate TOC pane for `toc.follow` to scroll.',
  },
  {
    kind: 'requires',
    flag: 'navigation.instant.preview',
    needs: 'navigation.instant.prefetch',
    why: '`navigation.instant.preview` renders the target page in a popover, which is only possible once prefetch has loaded it.',
  },
];

export function resolveFeatures(
  input: readonly FeatureFlag[],
  implicit: Partial<ResolvedFeatures> = {},
): ResolvedFeatures {
  const resolved: ResolvedFeatures = { ...FEATURE_DEFAULTS, ...implicit };

  for (const flag of input) {
    const off = flag.startsWith('!');
    const name = (off ? flag.slice(1) : flag) as Feature;
    resolved[name] = !off;
  }

  const problems: string[] = [];
  for (const rule of RULES) {
    if (rule.kind === 'conflict') {
      if (!resolved[rule.a] || !resolved[rule.b]) continue;
      const fix = FEATURE_DEFAULTS[rule.b]
        ? `Add '!${rule.b}' to \`features\` to switch it off.`
        : `Remove '${rule.b}' from \`features\`.`;
      problems.push(`\`${rule.a}\` cannot be combined with \`${rule.b}\`. ${rule.why} ${fix}`);
    } else if (resolved[rule.flag] && !resolved[rule.needs]) {
      problems.push(
        `\`${rule.flag}\` requires \`${rule.needs}\`, which is switched off. ${rule.why}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Incompatible \`features\` in seemore config:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }

  return resolved;
}
