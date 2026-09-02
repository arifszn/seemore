import type { AnchorHTMLAttributes, ComponentProps } from 'react';
import { Link } from 'react-router';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { config } from 'virtual:seemore/config';
import { isExternalHref, stripBase } from '../../shared/base.js';
import { feature } from '../lib/features.js';
import { D2 } from './D2.js';
import { Mermaid } from './Mermaid.js';
import { Pdf } from './Pdf.js';

/**
 * Internal links go through React Router so navigation stays client-side.
 *
 * remark rewrote content links to *based* hrefs, and React Router re-applies the
 * basename itself, so the base is stripped here to keep it from appearing twice.
 */
function MdxLink({ href = '', children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (isExternalHref(href)) {
    const external = /^[a-z][a-z0-9+.-]*:|^\/\//i.test(href);
    return (
      <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link to={stripBase(config.base, href)} viewTransition {...props}>
      {children}
    </Link>
  );
}

function isPdf(src: string | undefined): src is string {
  if (typeof src !== 'string') return false;
  // A small PDF is inlined by the bundler, so the extension is gone and the mime type is
  // the only thing left to go on.
  return /\.pdf(?:[?#].*)?$/i.test(src) || src.startsWith('data:application/pdf');
}

/** Sibling assets: images inline (click-to-zoom, unless switched off), PDFs in a viewer. */
function MdxImage({ src, alt, ...props }: ComponentProps<'img'>) {
  const source = typeof src === 'string' ? src : undefined;
  if (isPdf(source)) {
    return <Pdf src={source} title={alt} />;
  }
  if (feature('content.image.zoom')) {
    return <ImageZoom src={src} alt={alt} {...props} />;
  }
  const Image = defaultMdxComponents.img;
  return <Image src={src} alt={alt} {...props} />;
}

export const mdxComponents = {
  ...defaultMdxComponents,
  a: MdxLink,
  img: MdxImage,
  // `remark-mdx-mermaid` rewrites ```mermaid fences to <Mermaid chart="…" />, but supplies no
  // component of its own — this is ours.
  Mermaid,
  // Our own `remarkSeemoreD2` does the same for ```d2 fences.
  D2,
  Pdf,
};
