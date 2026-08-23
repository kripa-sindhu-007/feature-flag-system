# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in FlagPlane, please report it
**privately** — do not open a public issue, pull request, or discussion.

Preferred channels:

1. **GitHub private advisory** — open a report via
   **Security → Advisories → Report a vulnerability** on this repository
   ([how to](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).
2. **Email** — **sindhukripa007@gmail.com** with the details below.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (a proof of concept is ideal)
- Affected component(s) and version/commit
- Any suggested remediation

**Response targets** (best effort — this is a solo-maintained project):

- Acknowledgement within **5 business days**
- An assessment and remediation plan within **15 business days** of triage

Please give us reasonable time to investigate and release a fix before any public
disclosure. We will credit reporters who wish to be acknowledged.

## Supported versions

FlagPlane is an actively developed project without formal release versioning yet.
Security fixes land on the **`main`** branch; please test against the latest `main`
before reporting.

| Version | Supported          |
|---------|--------------------|
| `main`  | :white_check_mark: |
| older commits | :x:          |

## Security notes for operators

FlagPlane is designed to be **self-hosted**. A few things to know before exposing
it beyond a trusted local environment:

- **Default credentials are for local development only.** The `ADMIN_API_KEY`
  (`admin-secret-key`) and `SDK_KEY` (`sdk-secret-key`) shipped in
  `docker-compose.yml` and the config defaults **must** be overridden via
  environment variables in any shared or production deployment.
- **The admin key stays server-side.** The dashboard proxies admin calls through a
  Next.js BFF (`frontend/app/api/admin/*`) that attaches `ADMIN_API_KEY` on the
  server, so the key is never included in the browser bundle. Keep it that way — do
  not reintroduce `NEXT_PUBLIC_ADMIN_API_KEY`.
- **The dashboard/BFF is unauthenticated by design** in this self-hosted setup:
  anyone who can reach the dashboard can mutate flags. This is appropriate for a
  single-operator, trusted-network deployment. **Do not expose it directly to the
  public internet** without adding your own authentication/authorization in front
  (auth + RBAC is on the backlog). See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
- **Client SDK keys travel in the SSE query string** (`?key=`) because the browser
  `EventSource` API cannot set headers. Treat SDK keys as low-sensitivity read
  tokens and serve over TLS in production.

Thank you for helping keep FlagPlane and its users safe.
