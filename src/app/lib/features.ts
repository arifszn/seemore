import { config } from 'virtual:seemore/config';
import type { Feature } from '../../shared/types.js';

/** Feature flags are resolved node-side; the browser only reads them. */
export function feature(name: Feature): boolean {
  return config.features[name] === true;
}
