# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** through this
repository's **Security tab → "Report a vulnerability"** (GitHub private
vulnerability reporting), so maintainers can triage the report and coordinate
a fix before any public disclosure.

If the private reporting button is unavailable to you, open a regular issue
that describes the area of concern **only** — with no exploitable detail —
and ask a maintainer for a secure reporting channel.

## Please do not publish exploits

Do **not** open public issues, pull requests, or discussions containing
exploitable details, proof-of-concept attacks, or sensitive personal data.
Public reports of this kind may be redacted or removed to protect users.

## What to include in a report

- Affected component (for example: backend deck loader, API route,
  frontend custom-deck import, theme/storage handling).
- Impact: what an attacker or faulty input could cause, and who is affected.
- Step-by-step reproduction, including minimal input or deck content that
  triggers the issue.
- Version or commit tested (`git rev-parse --short HEAD`), OS, browser,
  Python (`python --version`), and Node.js (`node --version`) versions.
- Any logs or error output, with secrets and personal data redacted.

## What happens after you report

1. Maintainers acknowledge receipt of the report.
2. Maintainers assess the issue, may ask follow-up questions, and decide on
   a fix and disclosure approach.
3. If a fix is accepted, it is developed, tested, and released; reporters
   are credited only if they request it.

No specific response times or resolution guarantees are promised — this
project is maintained on a best-effort basis. Reports made in good faith
are welcome regardless of outcome.

## Scope notes

This project intentionally has no authentication, no user accounts, and no
server-side storage. The most security-relevant surfaces are deck-file
validation (backend startup and runtime), custom-deck import validation in
the browser, CORS configuration (`CORS_ORIGINS`), and dependency hygiene.
General bugs without a security impact should be filed as regular bug
reports using the issue template.
