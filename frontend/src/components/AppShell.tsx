import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { SessionStatsBar } from "./SessionStatsBar";

const NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/library", label: "Deck library" },
];

export function AppShell() {
  const isCompact = useMediaQuery("(max-width: 640px)");
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="shell app-header-inner">
          <NavLink to="/" className="brand" aria-label="Flash Card Game home">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Flash Card Game</span>
          </NavLink>

          {isCompact ? (
            <>
              <button
                type="button"
                className="nav-toggle"
                aria-expanded={menuOpen}
                aria-controls="primary-navigation"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? "Close" : "Menu"}
              </button>
              <nav
                id="primary-navigation"
                className={`app-nav${menuOpen ? " is-open" : ""}`}
                aria-label="Primary"
                hidden={!menuOpen}
              >
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </>
          ) : (
            <nav className="app-nav" aria-label="Primary">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </header>

      <div className="shell session-shell">
        <SessionStatsBar compact={isCompact} />
      </div>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        <div className="shell row row-space">
          <span className="faint">Built-in decks are served by the FastAPI vocabulary API.</span>
          <span className="faint">Custom decks stay in this browser.</span>
        </div>
      </footer>
    </div>
  );
}
