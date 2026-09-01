import { Fragment } from 'react';
import { Link } from 'react-router';
import { useTreePath } from 'fumadocs-ui/contexts/tree';

/** `navigation.path`. */
export function Breadcrumb() {
  const path = useTreePath();
  if (path.length === 0) return null;

  return (
    <nav className="openmd-breadcrumb" aria-label="Breadcrumb">
      {path.map((node, index) => {
        const url = node.type === 'page' ? node.url : node.type === 'folder' ? node.index?.url : undefined;
        return (
          <Fragment key={`${String(node.name)}-${index}`}>
            {index > 0 ? <span aria-hidden="true">/</span> : undefined}
            {url === undefined ? (
              <span>{node.name}</span>
            ) : (
              <Link to={url} viewTransition>
                {node.name}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
