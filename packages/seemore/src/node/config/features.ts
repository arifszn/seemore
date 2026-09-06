import type { Feature, FeatureFlag, FeatureMap, FeaturesInput, ResolvedFeatures } from '../../shared/types.js';

/**
 * Feature flags: dotted names, each with a default, written as a map of the ones you are
 * changing. The map is applied over the defaults, so an unmentioned flag keeps its default
 * and you never restate the whole set.
 *
 * The array form — bare names, `!name` for off — is the shape this started as and still
 * parses, but it loses silently on a repeated flag where an object literal is a type error.
 */

export { FEATURES } from '../../shared/types.js';
export type { Feature, FeatureFlag, FeatureMap, FeaturesInput, ResolvedFeatures } from '../../shared/types.js';

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
  // On by default, but only ever active in dev: the stamping that makes a block editable is
  // not emitted by `seemore build`, and the endpoint that writes is registered only by the
  // dev server. Switch it off with `'content.edit': false`.
  'content.edit': true,
  'content.image.zoom': true,
  'search.suggest': true,
  'search.highlight': true,
  'social.cards': false,
};

export function isFeatureEnabled(features: ResolvedFeatures, feature: Feature): boolean {
  return features[feature];
}

/**
 * Rules the flag set must satisfy. Enforced in the config loader, with the fix in the
 * message, rather than left to prose that only explains the broken site after the fact.
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
  input: FeaturesInput,
  implicit: Partial<ResolvedFeatures> = {},
): ResolvedFeatures {
  // What the user wrote wins over `implicit`, which is inferred from other config options.
  const resolved: ResolvedFeatures = { ...FEATURE_DEFAULTS, ...implicit, ...toMap(input) };

  const problems: string[] = [];
  for (const rule of RULES) {
    if (rule.kind === 'conflict') {
      if (!resolved[rule.a] || !resolved[rule.b]) continue;
      // Phrased in the map form even for an array config: it is valid there too, and it is
      // the form we want the config moving towards.
      const fix = `Set \`'${rule.b}': false\` in \`features\`.`;
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

/**
 * The array form says the same thing as the map, so it folds down to one. The config schema
 * folds before validating, which is what lets every message there name a flag.
 */
export function featuresFromFlags(flags: readonly FeatureFlag[]): FeatureMap {
  const map: FeatureMap = {};
  for (const flag of flags) {
    const off = flag.startsWith('!');
    map[(off ? flag.slice(1) : flag) as Feature] = !off;
  }
  return map;
}

function toMap(input: FeaturesInput): FeatureMap {
  if (Array.isArray(input)) return featuresFromFlags(input as readonly FeatureFlag[]);

  // An explicit `undefined` reads as "not mentioned", not "off", so the default survives it.
  const set = Object.entries(input as FeatureMap).filter(([, on]) => on !== undefined);
  return Object.fromEntries(set) as FeatureMap;
}
