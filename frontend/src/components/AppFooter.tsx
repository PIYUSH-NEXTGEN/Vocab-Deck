import { Link } from "react-router-dom";
import { useReducedMotion } from "../lib/motion";

const REPO_URL = "https://github.com/PIYUSH-NEXTGEN/Vocab-Deck";

/** Official GitHub mark (Octicons, MIT) — inlined to avoid an icon dependency. */
function GitHubIcon() {
  return (
    <svg className="footer-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

/** Issue marker: outlined circle with a filled dot, drawn to match Octicons. */
function IssueIcon() {
  return (
    <svg className="footer-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

const PROJECT_LINKS = [
  {
    href: REPO_URL,
    label: "GitHub repository",
    icon: <GitHubIcon />,
  },
  {
    href: `${REPO_URL}/issues`,
    label: "Report an issue",
    icon: <IssueIcon />,
  },
];

/** Scroll to the top; instant when the user prefers reduced motion. */
function scrollToTop(reducedMotion: boolean): void {
  if (typeof window.scrollTo !== "function") return;
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
}

/**
 * Product footer: a short brand note, the project links, and a compact bottom
 * bar. Dark surface keeps it distinct from the paper page while reusing the
 * same borders, type scale and accent.
 */
export function AppFooter() {
  const reducedMotion = useReducedMotion();
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="shell footer-grid">
        <section className="footer-brand" aria-labelledby="footer-brand-heading">
          <h2 className="footer-brand-name" id="footer-brand-heading">
            <Link to="/" className="footer-brand-link">
              Vocab Deck
            </Link>
          </h2>
          <p className="footer-brand-text">
            Pick a deck in any language pair and practice with flashcards, a quiz, typing or
            matching. Built-in decks come from the API; the ones you make stay in your
            browser.
          </p>
        </section>

        <nav className="footer-column" aria-label="Project">
          <h2 className="footer-heading">Project</h2>
          <ul className="footer-links">
            {PROJECT_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.icon}
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="footer-bottom">
        <div className="shell footer-bottom-inner">
          <p className="footer-note">© {year} Vocab Deck</p>
          <button
            type="button"
            className="footer-top-link"
            onClick={() => scrollToTop(reducedMotion)}
          >
            Back to top
          </button>
        </div>
      </div>
    </footer>
  );
}
