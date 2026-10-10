import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SessionProvider } from "./session/SessionProvider";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/motion.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
