import { Link } from "react-router-dom";
import { GAME_MODES } from "../game/modes";
import { Panel } from "../components/Panel";

/**
 * About page: what the project is, how to use it and how it works. Plain
 * documentation inside the product, no marketing copy.
 */
export function AboutPage() {
  return (
    <div className="shell page about-page">
      <header className="about-header">
        <div className="about-hero">
          <p className="about-label">About</p>
          <h1 className="hero-title">Vocab Deck</h1>
          <p className="hero-description">
            A vocabulary trainer for any language pair. Four practice modes, built-in decks,
            your own decks, and nothing to sign up for.
          </p>
        </div>
        <nav className="about-toc" aria-label="On this page">
          <ul>
            <li><a href="#about-what">What it is</a></li>
            <li><a href="#about-how-to-use">How to use it</a></li>
            <li><a href="#about-modes">The four modes</a></li>
            <li><a href="#about-decks">Decks and your data</a></li>
            <li><a href="#about-details">Details worth knowing</a></li>
          </ul>
        </nav>
      </header>

      <hr className="rule" />

      <section className="section" aria-labelledby="about-what">
        <h2 id="about-what">What it is</h2>
        <p className="muted measure">
          Vocab Deck helps you learn vocabulary through active recall. You pick a deck
          containing word and translation pairs such as French to English or German to Japanese,
          then practice with flashcards, a multiple-choice quiz, typing, or matching.
          Scoring separates what you actively recalled (quiz, typing) from what you
          recognized or self-assessed (flashcards, matching).
        </p>
      </section>

      <section className="section" aria-labelledby="about-how-to-use">
        <h2 id="about-how-to-use">How to use it</h2>
        <ol className="about-steps measure">
          <li>
            <strong>Choose a deck</strong> on the home screen. Use the language-pair filter to
            narrow the list, then click anywhere on a card to select it.
          </li>
          <li>
            <strong>Pick a practice mode</strong> from the four options that appear below your
            selection.
          </li>
          <li>
            <strong>Practise.</strong> Each mode shows progress and gives immediate feedback.
            The session summary under the board tracks quiz, typing, flashcard and matching
            results separately.
          </li>
          <li>
            <strong>Restart when you want a clean slate.</strong> The restart button next to
            the session summary clears the session. Leaving or reloading the tab does the same.
          </li>
        </ol>
        <p className="muted measure">
          Need your own material? Open the{" "}
          <Link to="/library">deck library</Link> to create a deck, import one, or export a
          backup.
        </p>
      </section>

      <section className="section" aria-labelledby="about-modes">
        <h2 id="about-modes">The four modes</h2>
        <ul className="about-cards">
          {GAME_MODES.map((mode) => (
            <Panel as="li" key={mode.id} id={`mode-${mode.id}`} className="stack-tight about-card">
              <h3>{mode.label}</h3>
              <p className="muted">{mode.blurb}</p>
            </Panel>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="about-decks">
        <h2 id="about-decks">Decks and your data</h2>
        <div className="about-columns">
          <Panel className="stack-tight">
            <h3>Built-in decks</h3>
            <p className="muted">
              Served by the FastAPI vocabulary service from version-controlled files. They are
              read-only and identical for everyone.
            </p>
          </Panel>
          <Panel className="stack-tight">
            <h3>Custom decks</h3>
            <p className="muted">
              Created in the browser and stored in this browser's local storage. Import and
              export JSON or the comment-header CSV format to move them between devices.
            </p>
          </Panel>
          <Panel className="stack-tight">
            <h3>Progress</h3>
            <p className="muted">
              Session-only and memory-resident: quiz, typing, flashcard and matching activity
              is never saved, synced or sent anywhere. There are no accounts and no database.
            </p>
          </Panel>
        </div>
      </section>

      <section className="section" aria-labelledby="about-details">
        <h2 id="about-details">Details worth knowing</h2>
        <ul className="about-details measure">
          <li>Any language pair works. Enter full language names like <code>english</code>, <code>hindi</code>, <code>french</code> or <code>japanese</code>.</li>
          <li>Typing accepts alternative translations and can ignore accents and diacritics.</li>
          <li>Matching drops entries whose translation is duplicated elsewhere in the deck, so every pair stays unambiguous.</li>
          <li>Animations respect your system's reduced-motion setting.</li>
          <li>Everything is operable by keyboard, with visible focus indicators.</li>
        </ul>
      </section>

      <p className="faint">
        Ready to start? <Link to="/">Choose a deck</Link>.
      </p>
    </div>
  );
}