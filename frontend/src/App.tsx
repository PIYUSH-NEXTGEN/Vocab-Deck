import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { PlayPage } from "./pages/PlayPage";
import { EmptyState } from "./components/EmptyState";
import { Link } from "react-router-dom";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/library" element={<LibraryPage />} />
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
  );
}
