/**
 * The file names seemore looks for as a site's config, in the order it tries them.
 *
 * Its own module, free of imports, so a host (the editor extension, the desktop app) can
 * read the list from the package entry without pulling in the loader and its dependencies.
 */
export const CONFIG_NAMES: readonly string[] = [
  'seemore.config.ts',
  'seemore.config.mts',
  'seemore.config.js',
  'seemore.config.mjs',
];
