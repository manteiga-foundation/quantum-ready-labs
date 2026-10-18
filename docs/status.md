# Status

What is built, what is emulated, what comes next, and the open questions. Updated with every
slice that changes it; `AGENTS.md` stays the contract.

## Built

- Spike 001 (validated): raw TLS ClientHello probes in Bun read a server's supported groups
  from HelloRetryRequest or alert, in clear, no PQ cryptography. 130-300 ms per host.
- Engine (`engine/`): target parser and refusal list; hello builders and reply parser; one-record
  exchange with timeouts; resolution; the ladder (`assess.ts`, rubric in `docs/scoring.md`);
  chain details with signature algorithms read from the DER; the scan (14 probes concurrently
  plus one real connection, events streamed); the HTTP face (`server.ts`: NDJSON, bearer token,
  concurrency cap). Deployed as `qrl-engine` on Fly Machines (iad, shared-cpu-1x, stops when
  idle). Token in `~/.config/quantum-ready-labs/engine-token` on the maintainer's machine and in
  Fly secrets.
- Edge (`worker/`): validation with the engine's parser, DNS-over-HTTPS resolution and the
  refusal list again, rate limits per caller and per host (D1 counters), a 24 h result cache,
  streaming pass-through with the share id appended, shared pages with rewritten previews,
  metrics aggregation, subscriptions. D1 schema in `worker/schema.sql`.
- Web (`web/`): entry; the live report (the ring climbing from worse to better as probes answer,
  verdict, the one next step, download via print with an optional email, share, recommendations,
  three cards, probe matrix, chain, rubric folded); shared results with the call to action; the
  private metrics view. One-column phone layout. Static SEO and Open Graph, JSON-LD, link-preview
  images per stage (`scripts/og-images.ts`).
- Tests: 65 (`bun run test`): 58 offline (unit, fixture TLS server, engine HTTP, edge policy,
  report model), 7 in real Chromium against emulated scans. CI (Linux) runs check, the unit
  tests and the build.

Measured on real hosts (2026-10-18): cloudflare.com, google.com, manteiga.org PROTECTED 85;
github.com AT RISK 49; tls-v1-2.badssl.com:1012 EXPOSED 27. 20-530 ms per scan from the Mac,
20-150 ms from the engine in iad.

## Emulated / not yet

- The edge is verified locally (`wrangler dev` against the live engine: streaming, cache hit,
  refusals recorded, previews) and not yet deployed: the Cloudflare login, the D1 database, the
  secret and the custom domain are the next steps.
- Metrics view: per-day p50/p95 are placeholders (the 24 h figures are real); the "signals" list
  has two computed lines, not the richer emulated set. Cloudflare Access on `/metrics` is a
  dashboard step; until then the header check keeps it closed.
- Quarterly reports: addresses are stored; nothing is sent, and the dialog says so.
- Real-client lines ("what Chrome gets"): the server's preference among Chrome's offered groups
  is measured (`preferredModernGroup`); a true Chromium probe over CDP is optional, later.
- Chain validation uses the runtime's trust store (`authorized`); a vendored, dated Mozilla
  bundle with completeness and order checks is a later slice.
- Single-label hosts (`localhost`, `intranet`) are refused by the parser; the CLI will need them.
- Ports: 443 only at the edge (`ALLOWED_PORTS`); other requests are recorded as demand.

## Next, in order

1. Deploy the edge: `wrangler login`, D1 create and schema, `ENGINE_TOKEN` secret, deploy, the
   custom domain, Access on `/metrics`.
2. Publish the repository (manteiga-foundation/quantum-ready-labs, MIT).
3. Per-day p50/p95 and the real signals in metrics.
4. CLI (`qready`): same engine, terminal renderer, `bun build --compile` for three OSes, Homebrew.

## Open questions

- Ready threshold: leaf certificates of 100 days or less count as automated. Right line?
- Should RSA key transport reachable keep a host out of Ready (today: yes)? Cloudflare and
  Google both still accept it for old clients.
- Which ports the public tool allows beyond 443 (8443? 993/465 for mail?). The edge records demand.
- Shared result pages are `noindex` (unlisted, in the spirit of no public scan list); the landing
  page is indexed. Keep?
