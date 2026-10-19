// The API page: what an agent or another service needs to scan a host, read a result and fetch
// the PDF, in one screen. The machine-readable twins are /openapi.json and /llms.txt.

const ORIGIN = 'https://quantumreadylabs.com';

export function Api() {
  return (
    <main className="metrics api">
      <h1>The API</h1>
      <p className="notice">
        Open, no key. The same scanner the page uses, for scripts, services and agents. The scan opens TLS connections to the host you name exactly as a browser visit would; only test hosts you are allowed to connect to. Machine-readable:{' '}
        <a href="/openapi.json">openapi.json</a> and <a href="/llms.txt">llms.txt</a>.
      </p>

      <section className="section" data-testid="api-scan">
        <h2>Scan a host</h2>
        <p>
          <span className="mono">POST /api/scan</span> with <span className="mono">{'{"host": "example.com"}'}</span>. By default the answer is a stream of newline-delimited JSON events, which is what the live page draws from. Send <span className="mono">Accept: application/json</span> to wait for the end and receive one object; or use the GET form from a shell.
        </p>
        <pre className="code">{`curl '${ORIGIN}/api/scan?host=example.com'

curl -X POST ${ORIGIN}/api/scan \\
  -H 'content-type: application/json' -H 'accept: application/json' \\
  -d '{"host": "example.com"}'`}</pre>
        <p>The one-object answer:</p>
        <pre className="code">{`{
  "id": "MC0EZMRdbWSP",
  "url": "${ORIGIN}/r/MC0EZMRdbWSP",
  "pdf": "${ORIGIN}/api/report/MC0EZMRdbWSP.pdf",
  "cached": false,
  "result": {
    "target": { "host": "example.com", "port": 443 },
    "address": "…", "startedAt": "…", "ms": 412,
    "findings": { "groups": { "X25519MLKEM768": "yes", … }, "tls13": true, … },
    "assessment": {
      "stage": "protected",          // exposed | at-risk | protected | ready | unreachable | inconclusive
      "score": 85,                    // 0-100, quantum readiness only
      "verdict": "…",
      "nextStep": { "id": "…", "title": "Retire RSA key transport cipher suites", "detail": "…" },
      "keyExchange": { … }, "certificate": { … }, "foundations": { … }, "points": { … }
    }
  }
}`}</pre>
        <p>
          The stream form, <span className="mono">application/x-ndjson</span>, carries one event per line: <span className="mono">start</span>, one <span className="mono">probe</span> per key-exchange group or protocol, <span className="mono">connection</span>, <span className="mono">result</span> (the same object as above) and <span className="mono">saved</span> (the id). Partial results can be assessed as they arrive; the page does exactly that to make the ring climb.
        </p>
      </section>

      <section className="section" data-testid="api-result">
        <h2>Read a stored result</h2>
        <p>
          <span className="mono">GET /api/result/&lt;id&gt;</span> returns the result as stored. Results never change; a new scan makes a new id. The human page for the same id is <span className="mono">/r/&lt;id&gt;</span>, unlisted, with an Open Graph preview for sharing.
        </p>
        <pre className="code">{`curl ${ORIGIN}/api/result/MC0EZMRdbWSP | jq .assessment.stage`}</pre>
      </section>

      <section className="section" data-testid="api-report">
        <h2>Fetch the PDF</h2>
        <p>
          <span className="mono">GET /api/report/&lt;id&gt;.pdf</span>: the five-page report (cover, executive summary, where the host stands, technical details, method and standards), landscape Letter. The first render after a quiet spell can take up to twenty seconds while the renderer starts; afterwards it is cached.
        </p>
        <pre className="code">{`curl -OJ ${ORIGIN}/api/report/MC0EZMRdbWSP.pdf`}</pre>
      </section>

      <section className="section" data-testid="api-limits">
        <h2>Limits and conduct</h2>
        <ul className="plain">
          <li>20 scans per caller address and 6 per host in any 10 minutes. Over the limit: 429 with Retry-After in seconds.</li>
          <li>A result under 24 hours old is answered from cache (cached: true). A host does not need re-scanning more often than that; to watch many hosts, scan each once a day.</li>
          <li>Public hosts on port 443 only. Private, loopback, link-local and multicast addresses are refused at resolution, before any connection is made.</li>
          <li>CORS is open: Access-Control-Allow-Origin: * on every /api response, so a page on any origin can call it.</li>
          <li>Errors are JSON with an error field and the matching status: 400 for input and refused hosts, 429 for limits, 502 when the engine could not finish.</li>
          <li>No key today. If the open API is abused, keys will come first for high volumes; the free tier will remain.</li>
        </ul>
      </section>

      <section className="section">
        <h2>Reading a stage</h2>
        <ul className="plain">
          <li><span className="mono">exposed</span>: TLS 1.3 is not available, so no post-quantum key exchange is possible; sessions recorded today can be decrypted later. Next step: enable TLS 1.3.</li>
          <li><span className="mono">at-risk</span>: TLS 1.3 with forward secrecy and no post-quantum key exchange; safe today, harvestable. Next step: enable X25519MLKEM768.</li>
          <li><span className="mono">protected</span>: hybrid post-quantum key exchange accepted; confidentiality protected against future decryption.</li>
          <li><span className="mono">ready</span>: protected, with no RSA key transport and short-lived automated certificates.</li>
          <li>The certificate is reported and never alarmed: no certificate on the public web can be quantum-safe yet, and a signature cannot be forged retroactively.</li>
        </ul>
        <p>
          The rubric is in <a href="https://github.com/manteiga-foundation/quantum-ready-labs/blob/main/docs/scoring.md">docs/scoring.md</a>; the engine is a dependency-free module in the same repository, if running it yourself suits better than calling it.
        </p>
      </section>
    </main>
  );
}
