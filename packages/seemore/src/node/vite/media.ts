import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { visit } from 'unist-util-visit';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import type { Expression, Property } from 'estree-jsx';
import type { Transformer } from 'unified';
import type { VFile } from 'vfile';
import { toPosix } from '../content/slug.js';

export interface SeemoreMediaOptions {
  contentRoot: string;
  onWarning: (message: string) => void;
}

/** The media tags whose file attributes point at a sibling file, and which attributes those are. */
const MEDIA: Record<string, readonly string[]> = {
  video: ['src', 'poster'],
  audio: ['src'],
  source: ['src'],
  track: ['src'],
};

interface JsxAttribute {
  type: 'mdxJsxAttribute';
  name: string;
  value?: string | null | { type: 'mdxJsxAttributeValueExpression'; value: string; data: { estree: unknown } };
}

interface JsxElement {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
  name: string | null;
  attributes: (JsxAttribute | { type: 'mdxJsxExpressionAttribute' })[];
  children: ElementContent[];
}

/**
 * Sibling media files referenced from `<video>`, `<audio>`, `<source>` and `<track>`.
 *
 * Images get this from fumadocs' `remark-image`, which turns each one into a bundler import.
 * Hand-written media tags get nothing: the browser resolves the relative `src` against the
 * page's route, which the dev server and a static host both answer with the SPA's HTML, so
 * the player loads and sits at 0:00. Even a server that did serve the content folder would
 * get it wrong for an `index.md`, whose route has no trailing slash.
 *
 * So the same treatment is applied here, at the hast stage — the only place raw HTML in a
 * `.md` exists as elements (after `rehype-raw`). Each local file becomes an `import`, and
 * the tag becomes JSX whose attribute reads it, so Vite serves it in dev and emits it hashed
 * in a build. Remote and root-absolute URLs are left alone; a file that is not on disk is a
 * warning, as with images.
 */
export function rehypeSeemoreMedia(options: SeemoreMediaOptions): Transformer<Root, Root> {
  return (tree, file: VFile) => {
    const path = file.path ?? '';
    if (path === '') return;
    const dir = dirname(path.split('?')[0] ?? path);
    const from = toPosix(relative(options.contentRoot, path.split('?')[0] ?? path));
    const imports = new Map<string, string>();

    /** The identifier a local reference is imported as, or undefined to leave it as written. */
    const importFor = (url: string): string | undefined => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url) || url === '') return undefined;
      const raw = url.split(/[?#]/)[0] ?? '';
      let decoded: string;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        decoded = raw;
      }
      if (!existsSync(resolve(dir, decoded))) {
        options.onWarning(`Missing asset ${url} referenced by ${from}.`);
        return undefined;
      }
      const specifier = /^\.{1,2}\//.test(decoded) ? decoded : `./${decoded}`;
      let name = imports.get(specifier);
      if (name === undefined) {
        name = `__seemoreMedia${imports.size}`;
        imports.set(specifier, name);
      }
      return name;
    };

    visit(tree, (node, index, parent) => {
      if (parent === undefined || index === undefined) return;

      if (node.type === 'element') {
        const fields = MEDIA[node.tagName];
        if (fields === undefined) return;
        const bound = new Map<string, string>();
        for (const field of fields) {
          const value = node.properties[field];
          if (typeof value !== 'string') continue;
          const name = importFor(value);
          if (name !== undefined) bound.set(field, name);
        }
        if (bound.size === 0) return;
        parent.children[index] = toJsx(node, bound) as unknown as RootContent;
        return;
      }

      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        const element = node as unknown as JsxElement;
        const fields = element.name === null ? undefined : MEDIA[element.name];
        if (fields === undefined) return;
        for (const attribute of element.attributes) {
          if (attribute.type !== 'mdxJsxAttribute' || !fields.includes(attribute.name)) continue;
          if (typeof attribute.value !== 'string') continue;
          const name = importFor(attribute.value);
          if (name !== undefined) attribute.value = identifierValue(name);
        }
      }
    });

    if (imports.size === 0) return;
    tree.children.unshift(
      ...[...imports].map(([specifier, name]) => importNode(specifier, name) as unknown as RootContent),
    );
  };
}

/**
 * The element as JSX. Only the media tag itself changes form: its children stay hast, which
 * the MDX compiler renders inside JSX the same way it renders them anywhere else.
 */
function toJsx(node: Element, bound: Map<string, string>): JsxElement {
  const attributes: JsxAttribute[] = [];
  for (const [key, value] of Object.entries(node.properties)) {
    if (value === undefined || value === null || value === false) continue;
    const name = attributeName(key);
    const imported = bound.get(key);
    if (imported !== undefined) {
      attributes.push({ type: 'mdxJsxAttribute', name, value: identifierValue(imported) });
    } else if (key === 'style' && typeof value === 'string') {
      attributes.push({ type: 'mdxJsxAttribute', name, value: styleValue(value) });
    } else if (value === true) {
      attributes.push({ type: 'mdxJsxAttribute', name, value: null });
    } else {
      attributes.push({ type: 'mdxJsxAttribute', name, value: Array.isArray(value) ? value.join(' ') : String(value) });
    }
  }
  return {
    type: node.children.some((child) => child.type === 'element' && child.tagName === 'p')
      ? 'mdxJsxFlowElement'
      : 'mdxJsxTextElement',
    name: node.tagName,
    attributes,
    children: node.children,
  };
}

/** hast keeps React's spelling for most properties; `data-*` and `aria-*` are the exception. */
function attributeName(key: string): string {
  const match = /^(data|aria)([A-Z].*)$/.exec(key);
  if (match === null) return key;
  return `${match[1]}${(match[2] ?? '').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function identifierValue(name: string): JsxAttribute['value'] {
  return expressionValue(name, { type: 'Identifier', name });
}

/** React takes `style` as an object, so a written `style="…"` string has to become one. */
function styleValue(css: string): JsxAttribute['value'] {
  const properties: Property[] = [];
  for (const declaration of css.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon === -1) continue;
    const property = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (property === '' || value === '') continue;
    const key = property.startsWith('--')
      ? property
      : property.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    properties.push({
      type: 'Property',
      kind: 'init',
      method: false,
      shorthand: false,
      computed: false,
      key: { type: 'Literal', value: key },
      value: { type: 'Literal', value },
    });
  }
  return expressionValue(JSON.stringify(css), { type: 'ObjectExpression', properties });
}

function expressionValue(source: string, expression: Expression): JsxAttribute['value'] {
  return {
    type: 'mdxJsxAttributeValueExpression',
    value: source,
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [{ type: 'ExpressionStatement', expression }],
      },
    },
  };
}

function importNode(specifier: string, name: string): unknown {
  return {
    type: 'mdxjsEsm',
    value: '',
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [
          {
            type: 'ImportDeclaration',
            attributes: [],
            specifiers: [{ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name } }],
            source: { type: 'Literal', value: specifier },
          },
        ],
      },
    },
  };
}
