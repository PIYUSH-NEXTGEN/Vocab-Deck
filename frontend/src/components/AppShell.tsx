import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { AppFooter } from "./AppFooter";

/**
 * Every route change starts a new screen, so reset the scroll position once the
 * new page has rendered (rAF), otherwise the old scroll offset is preserved.
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip the initial render: the browser is already at the top there.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}

const NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/library", label: "Deck library" },
  { to: "/about", label: "About" },
];

export function AppShell() {
  const isCompact = useMediaQuery("(max-width: 640px)");
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

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

  return (
    <div className="app-shell">
      <ScrollToTop />
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
              </nav>
            </>
          ) : (
            <nav className="app-nav app-nav-floating" aria-label="Primary">
              {navLinks}
            </nav>
          )}
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <AppFooter />
    </div>
  );
}
