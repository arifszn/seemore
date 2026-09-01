// Ambient declarations for the modules the openmd Vite plugin generates.
// Types are referenced with `import(...)` because relative imports are not allowed inside an
// ambient module declaration.

declare module 'virtual:openmd/tree' {
  export function getTree(): import('fumadocs-core/source/client').SerializedPageTree;
  export function subscribeTree(listener: () => void): () => void;
}

declare module 'virtual:openmd/routes' {
  export function getRoutes(): import('../shared/types.js').RouteEntry[];
  export function subscribeRoutes(listener: () => void): () => void;
}

declare module 'virtual:openmd/config' {
  export const config: import('../shared/types.js').ClientConfig;
}
