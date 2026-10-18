# How we score

The score measures one thing: where a host stands on the post-quantum transition. It is not a
general TLS grade. The stage name is what a reader acts on; the number is for those who want one.
The code is `engine/assess.ts`; this page and that file change together.

## The idea the score rests on

Confidentiality is urgent, authentication is not yet.

A quantum computer able to break RSA and elliptic curves does not exist. The threat today is
"harvest now, decrypt later": encrypted traffic recorded now falls when such a machine exists. That
is solved in the key exchange, and the fix (hybrid post-quantum key exchange, X25519MLKEM768) is
already shipped by every current browser, OpenSSL 3.5 and the large CDNs. A certificate, by
contrast, authenticates a connection at the moment it happens; a signature cannot be forged
retroactively, so there is no harvest-now risk, and the public Web PKI has no post-quantum roots
to move to yet. So the key exchange decides the stage, and the certificate is reported, explained,
and never alarmed.

## Stages

| Stage | Technically | Meaning |
|---|---|---|
| Exposed | No TLS 1.3 | Sessions can be recorded today and decrypted later. |
| At risk | TLS 1.3, classical key exchange only | Safe today; recordable now, decryptable when a large quantum computer exists. |
| Protected | A hybrid post-quantum group is accepted | Confidentiality is protected against future quantum decryption. |
| Ready | Protected, and the foundations are in place | No RSA key transport, a short-lived (100 days or less) trusted certificate. Ready for what comes next. |

Two more words cover the cases where the ladder does not apply: Unreachable (no TLS server
answered) and Inconclusive (the server negotiated TLS 1.3 but answered none of the single-group
probes, which points at a middlebox or a HelloRetryRequest problem; the result is not trusted).

The pre-standard Kyber draft (X25519Kyber768Draft00) alone does not count as hybrid: browsers
stopped offering it in 2024.

## Points (0 to 100)

| Part | Points | Rule |
|---|---|---|
| Key exchange | 60 | Hybrid accepted 60; TLS 1.3 classical 30; TLS 1.2 ephemeral only 10; RSA key transport only 0. |
| No RSA key transport | 10 | TLS 1.2 RSA key-transport suites refused. |
| Short-lived certificate | 8 | Leaf lifetime 100 days or less (automation, in practice). |
| Prefers hybrid | 6 | Offered what current browsers offer, the server picks the hybrid group. |
| Trusted chain | 6 | The chain validates against the trust store. |
| Certificate | 10 | Post-quantum signed chain 10; ECDSA or Ed25519 leaf 5; RSA-2048 leaf 3; other 4. |

Unreachable scores 0. The weights say what the tool believes: the key exchange is most of the
story, the foundations are the habits that make the next step cheap, and the certificate is
weighed lightly because nobody can act on it yet.

## The one next step

Each report names one step, chosen in this order: enable TLS 1.3 (Exposed); enable hybrid key
exchange (At risk); retire RSA key transport (Protected with it still reachable); shorten
certificate lifetimes and automate (Protected with a long-lived certificate); nothing to do today,
watch for post-quantum certificates (Ready).

## Standards

NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA); NIST IR 8547 (quantum-vulnerable
algorithms deprecated after 2030, disallowed after 2035); NSA CNSA 2.0; IETF
draft-ietf-tls-ecdhe-mlkem (the hybrid groups and their code points).

## Open questions

- Is 100 days the right line for "short-lived"? The CA/Browser Forum's schedule reaches 47 days
  in 2029.
- Should RSA key transport reachable keep a host out of Ready? Cloudflare and Google both still
  accept it for old clients; today it does.
