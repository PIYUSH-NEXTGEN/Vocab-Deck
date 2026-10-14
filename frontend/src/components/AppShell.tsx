import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { AppFooter } from "./AppFooter";
import { ThemeToggle } from "./ThemeToggle";

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
          <nav className="app-nav app-nav-floating" aria-label="Primary">
            {navLinks}
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <AppFooter />
    </div>
  );
}
