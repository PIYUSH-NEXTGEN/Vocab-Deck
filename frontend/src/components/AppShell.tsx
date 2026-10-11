import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useSession } from "../session/useSession";

const NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/library", label: "Deck library" },
];

export function AppShell() {
  const isCompact = useMediaQuery("(max-width: 640px)");
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { restart } = useSession();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const navLinks = NAV_ITEMS.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
    >
      {item.label}
    </NavLink>
  ));

  const restartButton = (
    <button type="button" className="nav-action" onClick={restart}>
      Restart session
    </button>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="shell app-header-inner">
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
                className={`app-nav app-nav-drawer${menuOpen ? " is-open" : ""}`}
                aria-label="Primary"
                hidden={!menuOpen}
              >
                {navLinks}
                <hr className="drawer-divider" />
                {restartButton}
              </nav>
            </>
          ) : (
            <div className="app-nav-floating">
              <nav className="app-nav" aria-label="Primary">
                {navLinks}
              </nav>
              {restartButton}
            </div>
          )}
        </div>
      </header>

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
