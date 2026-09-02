// Ambient declarations for the modules the seemore Vite plugin generates.
// Types are referenced with `import(...)` because relative imports are not allowed inside an
// ambient module declaration.

declare module 'virtual:seemore/tree' {
  export function getTree(): import('fumadocs-core/source/client').SerializedPageTree;
  export function subscribeTree(listener: () => void): () => void;
}

declare module 'virtual:seemore/routes' {
  export function getRoutes(): import('../shared/types.js').RouteEntry[];
  export function subscribeRoutes(listener: () => void): () => void;
}

declare module 'virtual:seemore/config' {
  export const config: import('../shared/types.js').ClientConfig;
}
