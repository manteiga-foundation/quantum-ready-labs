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
  concurrency cap). Deployed as `qrl-engine` on Fly Machines (iad, two shared-cpu-2x 512 MB machines,
  one always warm, the second wakes under load; `ENGINE_MAX_CONCURRENT=32` per machine, proxy
  soft 20 / hard 30). Token in `~/.config/quantum-ready-labs/engine-token` on the maintainer's machine and in
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
- The PDF report (`engine/report-html.ts`, pure; `render/server.ts`, Chromium kept warm): five
  landscape Letter pages in the spirit of the medet.ink archetypes (cover, executive summary,
  where the host stands, technical details, method and standards), bundled fonts, deterministic
  bytes for the same result. Deployed as `qrl-render` on Fly (Playwright image, 1 GB, stops when
  idle); the edge serves `/api/report/<id>.pdf` and caches it for a week. Download report in the
  web offers the PDF when the result has an id. Page images for review: `scripts/report-pages.ts`.
- Studies: a named population scanned by the maintainer through `POST /api/study/scan`
  (STUDY_TOKEN; no rate limit, no cache read), rows tagged `study:<slug>` and excluded from every
  organic figure on `/metrics`, which gained a Studies table. `scripts/study.ts <slug> <list.csv>`
  verifies each domain (DNS, home page title) then scans and writes `studies/<slug>/results.csv`
  with share and PDF links. First study: `florida-financial-2026q4`, 81 Florida-headquartered
  banks and credit unions (10 Exposed, 17 At risk, 30 Protected, 24 Ready; median 85).
- Letters (`engine/letter-html.ts`, pure, tested; renderer `POST /letters.pdf`): one portrait
  Letter page per institution to its information security officer: letterhead, the result card
  (ring, stage, score, the one next step, QR code and unlisted link), five short paragraphs
  (who we are, what was observed and when, why it matters, the one change, where the report is),
  signature and a footer stating the letter holds no private data. `scripts/letters.ts <slug>`
  builds one PDF for a study's Exposed and At risk hosts (27 pages for Florida), `--pages` writes
  a PNG per letter with a DOM measure of the signature against the footer.
- The API, open: `GET /api/scan?host=` and `POST /api/scan` with `Accept: application/json`
  answer once with `{id, url, pdf, cached, result}` (the stream stays the default for the page);
  CORS `*` on every `/api` response with a preflight; unknown `/api` paths answer 404 with the
  documentation links. `/api` page in the console's style, `/openapi.json` (3.1, checked against
  the worker's routes and the engine's stage enum by `tests/openapi.test.ts`) and `/llms.txt`.
- The terminal (`engine/terminal.ts`, pure, tested; `engine/cli.ts`): a QREADY banner in the
  Artemis launcher's manner (gold faces, blue shadows; one line when narrow), then per host the
  stage word and score, the verdict, the one next step, the three cards, the probes as a grid
  (RSA key transport amber when accepted), `--verbose` for the chain and the score's parts,
  `--share` for the public links, `--json` for machines, a worst-first summary for several hosts.
  Truecolor, 256 or none by NO_COLOR, FORCE_COLOR, COLORTERM and the TTY; every line fits the
  terminal's width (tested at 80).
- README: install and run in four steps (verified locally end to end); `docs/readme/cli.png` from
  `scripts/readme-cli.ts` (a real scan, truecolor ANSI to HTML in a terminal frame, Chromium at 2x).
- Version 1.1.0, one source: package.json, read by the engine (`ENGINE_VERSION`), checked against
  openapi.json by a test; tag v1.1.0 and a GitHub release. README badges: CI, release, licence,
  test your host, API. Landing page: a Questions section under the field (eight answers, the
  certificate one first).
- README: executive summary first, then a hero still and a GIF of a scan (`docs/readme/`, made by
  `scripts/readme-media.ts`), pinned by `tests/readme.test.ts`.
- Studies published: `/studies` lists them; `/studies/<slug>` is the state-of-readiness note for
  one population: the lead figures (computed from `results.csv` by `web/src/study-model.ts`,
  never typed; a test pins the lead sentence to the file), a calm paragraph stating that nothing
  is broken today, four counts and a distribution bar, every institution alphabetically with
  stage, score, next step, result page, PDF and a Test again link, filter chips by stage, the
  method (date, fourteen handshakes, the OpenSSL and curl cross-check of the Exposed results),
  the standards, a corrections address. The edge rewrites the page's title, description, canonical
  and Open Graph image (`og/study-<slug>.png`, drawn by `scripts/og-images.ts` from the same
  figures); study pages are indexable, unlike shared results.
- Tests: 114 (`bun run test`): 98 offline (unit, fixture TLS server, engine HTTP, edge policy,
  report model, pacer, README shape, report and letter HTML, study model), 11 web tests in real
  Chromium, 5 renderer tests. CI (Linux) runs check, the unit tests and the build.

Measured on real hosts (2026-10-18): cloudflare.com, google.com, manteiga.org PROTECTED 85;
github.com AT RISK 49; tls-v1-2.badssl.com:1012 EXPOSED 27. 20-530 ms per scan from the Mac,
20-150 ms from the engine in iad.

## Emulated / not yet

- Metrics view: per-day p50/p95 are placeholders (the 24 h figures are real); the "signals" list
  has two computed lines, not the richer emulated set. Cloudflare Access is in front of `/metrics`
  and `/api/metrics` (verified: both redirect to the Access login).
- Reports downloaded: every `/api/report/<id>.pdf` served (cached or rendered, demo ids excluded)
  writes a row to `downloads`; `/metrics` shows the 30-day count beside shared-link opens. Counting
  began 20 October 2026 (edge 3a184161); earlier downloads are not in it.
- Quarterly reports: addresses are stored; nothing is sent, and the dialog says so. `/metrics`
  lists them under "Quarterly report requests" (email, host, time; newest first, 200 most recent).
- PDF cold start: the render machine stops when idle; a cold request took 13 to 20 s. Now a view
  of any result page or a scan wakes it (and Chromium starts with the process), so the first PDF
  after a wake measures about 2 s; the dialog prepares the PDF while open, with a progress bar
  and a note after 2.5 s, and downloads a blob so the tab never navigates to a blank page (the
  mobile symptom). Truly cold with no page view first is still about 20 s.
- Letters: postal addresses are not in the list yet (`addressLines` exists in the template); the
  signer defaults to the maintainer and is an argument.
- PDF: the cover has room for a client name (`preparedFor`); no UI asks for it yet. The first
  render after idle takes about 14 s (machine start + Chromium); warm renders under a second.
- Real-client lines ("what Chrome gets"): the server's preference among Chrome's offered groups
  is measured (`preferredModernGroup`); a true Chromium probe over CDP is optional, later.
- Chain validation uses the runtime's trust store (`authorized`); a vendored, dated Mozilla
  bundle with completeness and order checks is a later slice.
- Single-label hosts (`localhost`, `intranet`) are refused by the parser; the CLI will need them.
- Ports: 443 only at the edge (`ALLOWED_PORTS`); other requests are recorded as demand.

## Next, in order

1. The study page is deployed and the press release (docs/press/2026-10-20-florida-release,
   led by the Florida figure, Manteiga Foundation as issuer) is paid and scheduled on PR Newswire
   via eReleases for Tuesday 20 October 2026, 8:00 ET. After it is live: the wire URL and the
   pickups into n30.ai's Press section; Show HN and LinkedIn pointing at the note; watch the
   engine for the first hours (`fly status -a qrl-engine`, the failures table on /metrics).
2. Mail the 27 letters (postal addresses still to be gathered; the letter can now cite the note).
3. Cloudflare Access on `/metrics`; per-day p50/p95 and the real signals in metrics.
4. Engine capacity, done for the launch: `scripts/load-test.ts` (tagged rows through the study
   path, deleted afterwards) measured one shared-cpu-1x at 24 simultaneous scans: 6 refused with
   429 on the warm round. After scaling to two shared-cpu-2x machines: 48 simultaneous, three
   rounds, all answered, p95 under 1 s; 96 simultaneous, all answered, p95 0.8 s. Edge now turns
   the engine's one-word "busy" into the sentence and a 429 with Retry-After on both scan paths.
5. CLI (`qready`): same engine, terminal renderer, `bun build --compile` for three OSes, Homebrew.
6. Quarterly re-scan of the Florida population (`florida-financial-2027q1`), the first trend.

## Open questions

- Ready threshold: leaf certificates of 100 days or less count as automated. Right line?
- Should RSA key transport reachable keep a host out of Ready (today: yes)? Cloudflare and
  Google both still accept it for old clients.
- Which ports the public tool allows beyond 443 (8443? 993/465 for mail?). The edge records demand.
- Shared result pages are `noindex` (unlisted, in the spirit of no public scan list); the landing
  page is indexed. Keep?
