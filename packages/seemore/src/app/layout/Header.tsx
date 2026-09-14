import { Link, useLocation } from 'react-router';
import { LogOut, Moon, PanelLeft, Search, Sun } from 'lucide-react';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { SidebarTrigger } from 'fumadocs-ui/components/sidebar/base';
import { useTheme } from 'fumadocs-ui/provider/base';
import { config } from 'virtual:seemore/config';
import { lockSite } from '../lib/auth.js';
import { useSidebarCollapse } from './Sidebar.js';

export function Header() {
  const search = useSearchContext();
  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();
  const { collapsed, toggle } = useSidebarCollapse();

  return (
    <header className="seemore-header">
      {/* Two triggers, one slot: below `md` the sidebar is a drawer this opens over the page,
          and at `md` and up it is a rail this hides, leaving the article the room. */}
      <SidebarTrigger className="seemore-sidebar-trigger" aria-label="Toggle navigation">
        <PanelLeft />
      </SidebarTrigger>

      <button
        type="button"
        className="seemore-sidebar-collapse"
        aria-label={collapsed ? 'Show navigation' : 'Hide navigation'}
        aria-expanded={!collapsed}
        onClick={toggle}
      >
        <PanelLeft aria-hidden="true" />
      </button>

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

      {/* Read directly, not through a helper, so an unprotected bundle folds this away. */}
      {import.meta.env.SEEMORE_AUTH ? (
        <button type="button" className="seemore-lock" aria-label="Sign out" title="Sign out" onClick={() => void lockSite()}>
          <LogOut aria-hidden="true" />
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
