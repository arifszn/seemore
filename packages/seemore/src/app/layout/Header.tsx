import { Link, useLocation } from 'react-router';
import { Moon, PanelLeft, Search, Sun } from 'lucide-react';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { SidebarTrigger } from 'fumadocs-ui/components/sidebar/base';
import { useTheme } from 'fumadocs-ui/provider/base';
import { config } from 'virtual:seemore/config';

export function Header() {
  const search = useSearchContext();
  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();

  return (
    <header className="seemore-header">
      <SidebarTrigger className="seemore-sidebar-trigger" aria-label="Toggle navigation">
        <PanelLeft />
      </SidebarTrigger>

      <Link to="/" className="seemore-brand" viewTransition>
        {config.title}
      </Link>

      <nav className="seemore-nav" aria-label="Site">
        {(config.nav ?? []).map((item) =>
          item.link === undefined ? (
            <span key={item.text}>{item.text}</span>
          ) : (
            <Link
              key={item.text}
              to={item.link}
              viewTransition
              aria-current={location.pathname === item.link ? 'page' : undefined}
            >
              {item.text}
            </Link>
          ),
        )}
      </nav>

      {search.enabled ? (
        <button type="button" className="seemore-search-trigger" onClick={() => search.setOpenSearch(true)}>
          <Search aria-hidden="true" />
          <span>Search</span>
          <kbd>{'⌘K'}</kbd>
        </button>
      ) : undefined}

      <button
        type="button"
        className="seemore-theme-toggle"
        aria-label="Toggle dark mode"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        <Sun className="seemore-icon-light" aria-hidden="true" />
        <Moon className="seemore-icon-dark" aria-hidden="true" />
      </button>
    </header>
  );
}
