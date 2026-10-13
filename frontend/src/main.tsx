import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { injectSpeedInsights } from "@vercel/speed-insights";
import { SessionProvider } from "./session/SessionProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/motion.css";

injectSpeedInsights();

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
