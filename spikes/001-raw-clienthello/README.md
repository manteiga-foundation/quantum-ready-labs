# Spike 001: raw ClientHello group probes in Bun

Question: can Bun learn which TLS key-exchange groups a server supports with a hand-built
ClientHello over `Bun.connect`, without finishing the handshake and without any PQ cryptography?

Method: `supported_groups = [one group]`, `key_share` empty, `supported_versions = [1.3]`. A
server that supports the group answers HelloRetryRequest naming it (its random is the HRR
constant); one that does not sends alert 40. A TLS 1.2 hello offering only RSA key-transport
suites measures the legacy fallback.

Run: `bun run spikes/001-raw-clienthello/probe.ts [host[:port] ...]`.

## Results (2026-10-16, home connection)

| host | X25519MLKEM768 | SecP256r1MLKEM768 | Kyber draft | x25519 | P-256 | P-384 | ffdhe2048 | TLS 1.2 RSA transport | matrix |
|---|---|---|---|---|---|---|---|---|---|
| cloudflare.com | YES | no | YES | YES | YES | YES | no | YES (0x9c) | 159 ms |
| google.com | YES | no | no | YES | YES | no | no | YES (0x9c) | 186 ms |
| github.com | no | no | no | YES | YES | no | no | YES (0x9c) | 195 ms |
| example.com | YES | no | YES | YES | YES | YES | no | YES (0x9c) | 128 ms |
| tls-v1-2.badssl.com:1012 | no | no | no | no | no | no | no | YES (0x9d) | 305 ms |

Cross-check with OpenSSL 3.6.5 `s_client -tls1_3 -groups X25519MLKEM768`: cloudflare.com and
example.com negotiate X25519MLKEM768; github.com alert 40. Identical.

## Verdict: VALIDATED

What worked: eight group probes in parallel plus one TLS 1.2 probe, 130-300 ms per host, nine
connections, no cryptography. Cloudflare-fronted hosts answer (a Cloudflare Worker's TCP API
would have refused them, which decided the engine's hosting).

Caveats: the TLS 1.2-only host answers alert 40, not 70 (protocol_version), so "no TLS 1.3"
needs its own probe (all groups offered, 1.3 only) rather than a reading of the alert code. Any
alert means "not supported"; record the code. The empty key_share relies on HelloRetryRequest; if
every group reads "no" but a real x25519 share succeeds, the host is inconclusive, not Exposed.

Recommendation: raw probes for the support matrix; one `Bun.tls` connection for the negotiated
parameters and the chain; OpenSSL in tests only. Budget about twelve connections per scan, under
half a second on a good path, capped at 5 s with per-probe timeouts and partial results reported.
