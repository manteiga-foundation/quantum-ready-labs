# Quantum Ready Labs

Quantum Ready Labs answers one question about any public host: is it ready for the quantum era?
Type a host name, and in about a second the service opens a handful of TLS connections to it,
exactly as a browser would, and reports in plain language where the host stands on the
post-quantum transition, what is urgent, what cannot be fixed yet, and the one next step. It is
built for the people who have to decide and explain, not only for the engineers who will
implement: the result is a stage word (Exposed, At risk, Protected, Ready), a score, and a report
that can be shared by link or downloaded as a print-ready PDF. Free and open source, at https://quantumreadylabs.com.

![A finished report: the ring reads PROTECTED 85, the verdict, the one next step, and the recommendations](docs/readme/hero.png)

![A scan as it runs: the host is typed, the ring climbs from AT RISK to PROTECTED as the probes answer, and the verdict settles](docs/readme/scan.gif)

## Why key exchange, and not the certificate

A quantum computer able to break RSA and elliptic curves does not exist. The threat today is
"harvest now, decrypt later": encrypted traffic recorded now falls when such a machine exists.
That is a confidentiality problem, and it is solved in the key exchange, which is why browsers,
OpenSSL and the large CDNs already negotiate hybrid post-quantum key exchange on every
connection that supports it.

Certificates (authentication) are a different matter. A signature cannot be forged retroactively,
so there is no harvest-now risk, and the public Web PKI has no post-quantum roots yet. The report
says so plainly and does not alarm about something nobody can act on today.

## The stages

| Stage | Meaning |
|---|---|
| Exposed | TLS 1.3 is not available. Sessions can be recorded today and decrypted later. |
| At risk | TLS 1.3 with forward secrecy, no post-quantum key exchange. Safe today, harvestable. |
| Protected | Hybrid post-quantum key exchange (X25519MLKEM768 or equivalent) is accepted. |
| Ready | Protected, no legacy key transport, short-lived automated certificates: ready for what comes next. |

The score (0 to 100) sits under the stage word; the rubric is `docs/scoring.md`. It measures
quantum readiness only and does not compete with the general TLS checkers.

## How it works

The engine builds TLS ClientHello messages by hand and reads the server's first reply in clear:
offer one key-exchange group with no key share, and a supporting server answers HelloRetryRequest
naming it, while a non-supporting server sends an alert. No post-quantum cryptography is
implemented, no handshake completes, and the result is identical on every platform. One ordinary
connection reads the negotiated parameters and the certificate chain. Fourteen probes per scan,
run concurrently: 20 to 500 ms per host.

The hosted service has three parts: the engine (Bun, on Fly Machines) that owns the sockets; the
edge (a Cloudflare Worker with D1) that validates, rate-limits, caches results for 24 hours,
serves shareable result pages with link previews and aggregates private metrics; and the views
(Vite, React, Arwes frames).

## Repository

```
engine/      the scanner: target parsing and refusal list, probes, assessment, HTTP server (Bun, Fly Machines)
worker/      the edge: validation, rate limits, 24 h cache, link previews, metrics (Cloudflare Worker + D1)
web/         the views: entry, live report, private metrics (Vite, React, Arwes)
tests/       bun test: offline unit and fixture-server tests, plus the views in real Chromium
spikes/      throwaway experiments with their verdicts
docs/        status, scoring rubric, screenshots, README media
```

```
bun install
bun run test                  # 84 tests (Chromium: bunx playwright install chromium)
bun run scan github.com       # scan from the terminal
bun run dev                   # the views on http://127.0.0.1:5180 (?demo=protected replays a recorded scan)
bun run engine                # the HTTP engine (ENGINE_TOKEN required)
bun run render                # the PDF renderer (RENDER_TOKEN required; Playwright Chromium)
bun run edge:dev              # the edge locally (wrangler dev; .dev.vars holds ENGINE_TOKEN)
bun run build                 # check + production bundle
```

Scoring: `docs/scoring.md`. Where things stand: `docs/status.md`. How we work: `AGENTS.md`.

## Guardrails

The public service connects only to public Internet addresses: the host is resolved first and
every address is judged against the IANA special-purpose registries (private, loopback,
link-local, CGNAT, multicast, documentation, and the IPv6 embeddings of those). Scans are
rate-limited per caller and per target, results are cached for a day, and only port 443 is
tested. A scan is a handful of TLS handshakes, the same traffic a browser visit causes; still,
only test hosts you are allowed to connect to.

## Standards referenced

NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA); NIST IR 8547 (transition
timeline: quantum-vulnerable algorithms deprecated after 2030, disallowed after 2035); NSA CNSA
2.0; IETF draft-ietf-tls-ecdhe-mlkem (the hybrid groups).

## Licence

MIT. A Manteiga Foundation project. Fonts Titillium Web and JetBrains Mono (SIL Open Font
Licence); frames by Arwes (MIT).
