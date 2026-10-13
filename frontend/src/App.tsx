import { Route, Routes } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { AboutPage } from "./pages/AboutPage";
import { DeckEditorPage } from "./pages/DeckEditorPage";
import { PlayPage } from "./pages/PlayPage";
import { EmptyState } from "./components/EmptyState";
import { Link } from "react-router-dom";

export function App() {
  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/editor" element={<DeckEditorPage />} />
          <Route path="/editor/:deckId" element={<DeckEditorPage />} />
          <Route path="/play/:modeId/:deckId" element={<PlayPage />} />
          <Route
            path="*"
            element={
              <div className="shell page">
                <EmptyState
                  title="Page not found"
                  description="That page does not exist."
                  action={
                    <Link className="link-button" to="/">
                      Back to home
                    </Link>
                  }
                />
              </div>
            }
          />
        </Route>
      </Routes>
      <Analytics />
    </>
  );
}
