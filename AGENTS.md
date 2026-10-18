# Working on Quantum Ready Labs

The working contract for anyone, person or agent, changing this repository. The README describes
the product; `docs/status.md` says what is built and what comes next; this file says how we build.

## What it is

A public, open-source tool that answers one question about a host: is it ready for the quantum
era? Type a host name or an IP address; the backend opens TLS connections to it, exactly as a
browser would; the report says where the host stands on the post-quantum transition and what the
next step is, with the standards cited. The audience is anyone with a minimal knowledge of the
subject, not experts. A readiness score exists, but it measures quantum readiness, not general TLS
hygiene, and it is expressed as a stage name, never a letter grade.

Two products, in this order: the hosted scanner (this repository: engine, edge, web) and later a
CLI for internal hosts, built from the same engine. The engine is one module with two renderers
from the first commit: nothing under `engine/` imports the DOM, a web framework or a server.

## Vocabulary (fixed)

- **Target** - what the operator typed, reduced to a host and a port (`engine/target.ts`). The
  only parser of operator input; nothing typed ever reaches anything but a socket.
- **Probe** - one TLS connection asking one question (does the server accept group X? does it still
  negotiate TLS 1.2 with RSA key transport?). Probes read the server's answer in clear
  (HelloRetryRequest or alert) and never finish the handshake.
- **Scan** - the set of probes for one target plus one real connection for the negotiated
  parameters and the certificate chain. Streams its findings as it goes; the report builds live.
- **Stage** - the readiness ladder: Exposed, Classical, Hybrid, Agile. The score sits under it.
- **Report** - the public result: verdict, the one next step, three cards (Key exchange,
  Certificate, Foundations), what real clients get, details folded, share/print/JSON.
- **Edge** - the Cloudflare Worker: validation, refusal list, rate limits, result cache, metrics.
- **Engine** - the Bun process on Fly Machines that owns the sockets. Never public.

## How we work

1. RED first. A failing test before the code: unit tests under `tests/` (bun test), the engine
   against a fixture TLS server, the web views in real Chromium with Playwright. Run it and see
   it fail for the right reason.
2. GREEN with the smallest change, then refactor with the tests green.
3. Gates before "done": `bun run check`, `bun run test`, `bun run build`.
4. Look at it: screenshots of the views at 1440x900 and 390x844 (phones matter here), inspected,
   and every visual lead confirmed with a DOM/CSS probe before changing code.
5. Document: README, `docs/status.md`, a commit per slice with a descriptive message. Never push
   or rewrite history unless asked.
6. Report honestly: what changed, what is verified (counts and commands), one real finding or
   trade-off, next candidates. Plain text, no emojis.

When something is uncertain, spike it in `spikes/NNN-name/` with measured numbers and a verdict,
or render every candidate in context and let the maintainer pick. Do not argue it.

## Commands

```
bun run check        # tsc --noEmit
bun run test         # bun test tests
bun run scan <host>  # the engine from the terminal (development)
bun run engine       # the engine's HTTP server (what the edge calls)
```

Cross-checks use Homebrew's OpenSSL 3 (`/opt/homebrew/opt/openssl@3/bin/openssl`); the system
`openssl` on macOS is LibreSSL and knows no ML-KEM.

## Standing decisions (do not re-litigate without the maintainer)

- The name is Quantum Ready Labs. It does not borrow from Qualys SSL Labs, in name or in grades.
- Confidentiality is urgent, authentication is not yet: the report says plainly that no public
  certificate can be made quantum-safe today and that nothing is to be done about it yet.
  Alarmism is a bug.
- Safety is in resolution, not in input filtering: resolve first, refuse non-public addresses,
  connect to the resolved address, never resolve again. IP literals are allowed.
- Palette: Egyptian blue `#1034a6` base, gold `#e0b85c` accent, Arwes frames. New CSS uses
  `var(--token)` and `color-mix`, never a literal colour in a component.
- Hosting: Cloudflare for everything that is not a handshake; Fly Machines for the engine. The
  maintainer runs every login (`fly auth login`, `wrangler login`, `gh auth`); the agent never
  handles tokens.
