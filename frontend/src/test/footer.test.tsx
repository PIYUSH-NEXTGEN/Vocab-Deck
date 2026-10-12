/**
 * Product footer: brand note, project links, dynamic year, and guards that
 * removed sections (logo mark, README/documentation, resources) stay out.
 */

import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppFooter } from "../components/AppFooter";
import { SessionProvider } from "../session/SessionProvider";

function renderFooter() {
  return render(
    <MemoryRouter>
      <SessionProvider>
        <AppFooter />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe("footer structure", () => {
  test("shows the brand note and the project links only", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");

    expect(within(footer).getByRole("heading", { name: "Vocab Deck" })).toBeInTheDocument();
    expect(
      within(footer).getByText(/pick a deck in any language pair and practice/i),
    ).toBeInTheDocument();

    const project = within(footer).getByRole("navigation", { name: "Project" });
    expect(within(project).getAllByRole("link")).toHaveLength(2);

    // Removed sections must not come back.
    expect(within(footer).queryByRole("navigation", { name: "Resources" })).not.toBeInTheDocument();
    expect(within(footer).queryByRole("link", { name: /readme/i })).not.toBeInTheDocument();
    expect(within(footer).queryByRole("link", { name: /documentation/i })).not.toBeInTheDocument();
    expect(within(footer).queryByRole("link", { name: /how to use/i })).not.toBeInTheDocument();
    expect(footer.querySelector(".footer-logo")).toBeNull();
    expect(footer.textContent).not.toMatch(/fastapi|localstorage|source on github/i);
  });

  test("shows the current year dynamically", () => {
    renderFooter();
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${year} Vocab Deck`))).toBeInTheDocument();
  });

  test("external links open safely in a new tab", () => {
    renderFooter();
    const project = screen.getByRole("navigation", { name: "Project" });
    for (const label of ["GitHub repository", "Report an issue"]) {
      const link = within(project).getByRole("link", { name: label });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("href")).toMatch(/^https:\/\/github\.com\/PIYUSH-NEXTGEN\/Vocab-Deck/);
    }
  });

  test("no license or invented claims", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).not.toMatch(/MIT|Apache|GPL|licen[cs]e/i);
    expect(footer.textContent).not.toMatch(/all rights reserved/i);
    expect(footer.textContent).not.toMatch(/newsletter|subscribe/i);
  });

  test("keeps a back-to-top control", () => {
    renderFooter();
    expect(screen.getByRole("button", { name: /back to top/i })).toBeInTheDocument();
  });
});
