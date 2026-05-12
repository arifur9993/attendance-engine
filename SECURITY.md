# Security Policy

`@attendance-engine/core` is a pure-function library: no network, no filesystem, no child processes, no runtime dependencies. Its attack surface is small — essentially "can a crafted input crash or hang the parser, or produce a wildly wrong result that a caller trusts."

That said, if you find something, please report it responsibly.

## Reporting a vulnerability

- **Preferred:** open a private advisory via GitHub Security Advisories on this repo (`Security` → `Report a vulnerability`).
- **Or:** email **arifur.rahman210@gmail.com** with details and, if possible, a reproducing input.

Please don't open a public issue for a security report. We'll acknowledge within a few days and keep you updated on the fix and disclosure timeline.

## Supported versions

Until `1.0.0`, only the latest published `0.x` minor receives fixes. After `1.0.0`, the latest major's latest minor.

## Scope notes

- Inputs are assumed to come from the integrating application, not directly from untrusted end users. Still, malformed ISO timestamps must fail fast with `TimeParseError` rather than producing garbage — if you find an input that doesn't, that's a bug worth reporting.
- Dependency vulnerabilities: there are no runtime dependencies. Dev-dependency advisories are tracked via Dependabot.
