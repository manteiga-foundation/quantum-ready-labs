# Status

What is built, what is emulated, what comes next, and the open questions. Updated with every
slice that changes it; `AGENTS.md` stays the contract.

## Built

- Spike 001 (validated): raw TLS ClientHello probes in Bun read a server's supported groups
  from HelloRetryRequest or alert, in clear, no PQ cryptography. 130-300 ms per host.
- `engine/target.ts`: operator input to host and port; canonical IPv4 only, IPv6 literals, URLs
  reduced; the refusal list (private, loopback, link-local, CGNAT, multicast, documentation,
  IPv4-mapped, NAT64, 6to4, Teredo).
- `engine/hello.ts`, `engine/socket.ts`: hello builders (TLS 1.3 one-group probes, TLS 1.2 cipher
  probes), reply parser, one-record exchange with timeouts.
- `engine/resolve.ts`: resolve once, judge every address, connect to the chosen one.
- `engine/assess.ts`: the ladder (unreachable, inconclusive, exposed, at-risk, protected, ready),
  points (key exchange 60, foundations 30, certificate 10), one next step per situation, notes.
- `engine/certificate.ts`: chain links with key and signature algorithms (ML-DSA and SLH-DSA
  OIDs known), validity, CA flag.
- `engine/scan.ts`: 14 probes concurrently plus one real connection; events streamed per probe.
- `engine/server.ts`: POST /scan as NDJSON, bearer token, concurrency cap, GET /health.
- Deployed: `qrl-engine` on Fly Machines (iad, shared-cpu-1x, stops when idle). Token in
  `~/.config/quantum-ready-labs/engine-token` on the maintainer's machine and in Fly secrets.
- Tests: 47 (bun test), all offline against a fixture TLS server (Bun.serve, BoringSSL, which
  already speaks X25519MLKEM768).

Measured on real hosts (2026-10-18): cloudflare.com, google.com, manteiga.org PROTECTED 85;
github.com AT RISK 49; tls-v1-2.badssl.com:1012 EXPOSED 27. 20-530 ms per scan.

## Emulated / not yet

- The edge (Cloudflare Worker): validation, rate limits, 24 h cache in D1, metrics, Access in
  front of the private view. Not started; the engine's token is the only guard today.
- The web: entry, live report, private metrics view. Waiting for the maintainer's sketches;
  to be built from three emulated fixtures (exposed, classical, hybrid) before wiring.
- Real-client lines ("what Chrome gets"): the server's preference among Chrome's offered groups
  is measured (`preferredModernGroup`); a true Chromium probe over CDP is optional, later.
- Chain validation uses the runtime's trust store (`authorized`); a vendored, dated Mozilla
  bundle with completeness and order checks is a later slice.
- Single-label hosts (`localhost`, `intranet`) are refused by the parser; the CLI will need them.
- Ports other than 443 are accepted by the engine; the edge will limit them for the public tool.

## Next, in order

1. Edge Worker: `/api/scan` streaming proxy, refusal list repeated, per-IP and per-host rate
   limits, D1 cache, metrics rows.
2. Web: the three views against emulated fixtures, then wired to `/api/scan`.
3. Deploy the web and the Worker; DNS at quantumreadylabs.com.
4. CLI (`qready`): same engine, terminal renderer, `bun build --compile` for three OSes.

## Open questions

- Ready threshold: leaf certificates of 100 days or less count as automated. Right line?
- Should RSA key transport reachable keep a host out of Ready (today: yes)? Cloudflare and
  Google both still accept it for old clients.
- Which ports the public tool allows beyond 443 (8443? 993/465 for mail?).
