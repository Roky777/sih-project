# AI Maintenance Copilot

An optional assistant that answers questions about the fleet using AeroCare's own records and services. It runs an open model (Qwen3-8B by default) through Ollama, behind the existing backend and its authentication.

Greeting handling includes complete phrases such as “Hello, how are you?”, “Who are
you?” and the incomplete “hello are you”. These return explicit site guidance without
loading the model or querying fleet records. A greeting followed by an operational
question is not truncated into this response. This improves greeting latency only;
it does not increase CPU inference throughput for model-generated explanations.

### General conversation and evidence correction — 20 October 2026

Unmatched questions are interpreted by the configured model, rather than expanded
phrase lists. The conversational prompt distinguishes ordinary conversation, basic
product guidance and application-record questions. It includes the product navigation
and registration reference; `get_product_help` supplies detailed versioned guidance.
Conversation and product help do not load the fleet bundle. Record tools still retrieve
the snapshot themselves and enforce the selected historical cutoff and role permissions.
The first model response streams provisional drafts, including conversation without tools.

A retrieved answer that omits citation markers gets one bounded, tool-free correction
pass using the same evidence and allowed source IDs. The corrected answer still goes
through number, citation and clearance checks. A failed correction remains withheld;
it does not repeat scenario creation or relax grounding. This can add an inference call.

Verification: 116 focused assistant unit tests passed. Real local `qwen3:4b-instruct`
checks at a 4096-token context answered an unfamiliar introduction, gave the correct
Aircraft > Add aircraft workflow, and retrieved/cited counts from a labelled synthetic
test fixture. These are bounded smoke checks, not proof of general model accuracy or
remote VM latency. No new identity/pronoun phrase routes were added.
Reproduce the opt-in real-model checks in the backend test environment:

```bash
FLEET_TEST_OLLAMA_URL=http://127.0.0.1:11434 \
  python -m pytest tests/integration/test_assistant_model_live.py -q
```

Use the private Ollama address reachable from that environment (for Docker Desktop,
`http://host.docker.internal:11434`). The checks do not use production records or credentials.

### Common wording and slow-model handling — 20 October 2026

Bounded variants of fleet counts/availability, urgent findings, spare shortages,
selected-aircraft summaries/open work, sensor history and the default availability
forecast route to existing services without inference. Greeting/polite prefixes are
normalized while full-match routing preserves dates, aircraft identities, compound
actions and hypothetical conditions for interpretation. Results retain the selected
snapshot date; “available” does not mean flight clearance. “Flights”, “fights” and
“fighters” requests ask whether the visitor means demonstration aircraft rather than
inventing flight bookings or a fighter-specific count. Missing record selections
prompt for context. A missing spare record is reported as missing, not zero stock.

The browser now displays the backend's model interpretation/explanation status;
timeout, truncated stream and cancellation paths remain explicit. This is not a
promise of fast responses to arbitrary questions. The operator-supplied CPU benchmark
showed 31.98 seconds cold (18.77 seconds loading) and 13.40 seconds warm, approximately
2.5 generated tokens/second, for a short standalone prompt. Those observations are
not a complete application latency benchmark. Longer tool-mediated answers still
need measured inference capacity.

Local verification: 99 focused assistant tests and Ruff passed, including common
wording, ambiguous/missing context, dates, evidence grounding and authorization
regressions. Web lint/typecheck/build and 30 unit tests passed. Browser stream
fixtures cover final-answer replacement, malformed/truncated responses, timeout,
cancellation, status and mobile layout; deployed Qwen speed remains to be checked.
No schema migration or model-weight replacement is required for this repair.

The backend also supports Groq hosted inference. Local Ollama remains the default; there is no automatic provider switch or silent paid fallback. Exact fleet-count/current-availability questions and explicit part-stock questions use existing services without inference. Other questions retain the allowlisted tool loop. The browser uses authenticated `POST /api/assistant/chat/stream`: newline-delimited status, reset, draft-text delta, final checked response, error and heartbeat events. Draft text is marked provisional until citation/number checks complete; the final response replaces it. Truncated streams are errors. Disconnects stop subsequent tool rounds, but do not undo an already saved scenario or instantly interrupt a blocking provider call.

### Private inference

`FLEET_ASSISTANT_LOCAL_ONLY=true` is the default. When the copilot is enabled, startup rejects a hosted provider, cloud model suffix or public endpoint. Ollama endpoints must use localhost, `host.docker.internal`, a loopback address, an RFC1918 IPv4 address or an IPv6 unique-local address. A private server can use its private IP; this guard does not replace authentication, TLS or network access controls between hosts.

On the inference host, set `{"disable_ollama_cloud": true}` in the persistent `~/.ollama/server.json` configuration and restart Ollama. Keep any other existing configuration keys. The Mac's model listener must remain on localhost; never publish port 11434 through the web proxy or a tunnel. The public application reaches the private model through its backend. Restrict access to the backend using the deployment's real session profile rather than local demonstration role headers. Local inference avoids external model-service fees; it still uses the machine's resources and requires a running inference host.

The standard availability-drop, 30-day forecast, selected sensor-history and open-maintenance suggestions now return exact service-backed statements and charts without inference. Counts and stock queries use the same direct path. Bounded aliases such as “current availability” and “show fleet availability” also bypass inference. “Explain this finding with evidence” uses the selected finding service directly: recorded assessment, forecast risk and life interval, priority and the proposed action remain distinct. Requests with additional dates, future conditions or compound instructions are not guessed into these direct routes. Other explanation requests retain model-selected tools. Each turn retrieves fresh data; previous replies are never substituted for current evidence. The client validates completed answer fields, tool records and internal citation links before rendering them. Percentage checks cannot treat aircraft-days or other large quantities as percentage evidence.

### Tested smaller local profile

Use the explicit instruction variant, not the generic `qwen3:4b` tag (which resolved to a thinking variant during verification):

```bash
ollama pull qwen3:4b-instruct
```

```dotenv
FLEET_ASSISTANT_PROVIDER=ollama
FLEET_ASSISTANT_LOCAL_ONLY=true
FLEET_ASSISTANT_MODEL=qwen3:4b-instruct
```

Recreate the API with the running deployment's Compose files. Keep the larger local model available for comparison. The smaller profile is verified only against bounded synthetic-data examples; it does not establish diagnostic accuracy or eliminate model errors. Latency depends on prompt length, cache, load and the inference hardware. For remote deployment, the private model host must stay running; local inference does not provide free always-on server hosting.

### Hosted free-tier setup

Create a private API key in the [Groq console](https://console.groq.com/keys) and add these values to the server's private environment file, never a `VITE_` variable or Git:

```dotenv
FLEET_ASSISTANT_ENABLED=true
FLEET_ASSISTANT_PROVIDER=groq
FLEET_ASSISTANT_LOCAL_ONLY=false
FLEET_ASSISTANT_GROQ_MODEL=openai/gpt-oss-20b
FLEET_ASSISTANT_GROQ_API_KEY=<private-key>
```

Recreate the API using the same Compose files and `--env-file` as the running deployment. Only the selected provider receives model requests; application tools still execute on our backend. Selected context, conversation and compact tool results are sent to Groq when enabled. Verify current [model availability](https://console.groq.com/docs/models) and [account quotas](https://console.groq.com/docs/rate-limits); free quotas are bounded, and one answer can consume multiple model calls. A 429 returns a retry-later message rather than silently charging another provider. Hosted latency and answer quality must be measured with the configured account before claiming a speed target.

## Configuration (server-side only)

| Variable | Default | Meaning |
|---|---|---|
| `FLEET_ASSISTANT_ENABLED` | `true` | `false` hides every copilot control and the API returns 404; the site is unchanged. |
| `FLEET_ASSISTANT_OLLAMA_URL` | `http://localhost:11434` (compose: `http://host.docker.internal:11434`) | Ollama endpoint. Never sent to the browser. |
| `FLEET_ASSISTANT_MODEL` | `qwen3:8b` | Any Ollama model with tool calling. |
| `FLEET_ASSISTANT_PROVIDER` | `ollama` | `ollama` or `groq`; selection is server-side. |
| `FLEET_ASSISTANT_LOCAL_ONLY` | `true` | Reject hosted/cloud/public model configuration when enabled; explicitly opt out before intentional hosted use. |
| `FLEET_ASSISTANT_GROQ_MODEL` | `openai/gpt-oss-20b` | Hosted model ID; separate from the local model. |
| `FLEET_ASSISTANT_GROQ_API_KEY` | empty | Private hosted credential; absent keys remain explicitly unavailable. |
| `FLEET_ASSISTANT_KEEP_ALIVE` | `30m` | Local model idle residency after each request. |
| `FLEET_ASSISTANT_TIMEOUT_SECONDS` | `120` | Per model call; a turn may take at most twice this. |
| `FLEET_ASSISTANT_MAX_TOOL_ITERATIONS` | `4` | Tool-calling rounds before a final answer is forced. |
| `FLEET_ASSISTANT_CONTEXT_TOKENS` | `8192` | Model context window. Larger values raise memory use. |

The AWS demo overlay defaults `FLEET_ASSISTANT_ENABLED=false`; opt in through the server environment after configuring a hosted provider and key. HTTPS and local proxies disable buffering for answer streams.

### Local setup

```bash
ollama pull qwen3:8b        # ~5.2 GB
ollama serve                # or the Ollama app
docker compose up -d --build api web
curl -s localhost:8080/api/assistant/status   # {"enabled":true,"available":true,...}
```

On a 16 GB Mac with Docker Desktop running, the model uses about 6.2 GB. Use `ollama serve` rather than the desktop app if the app restarts itself (for example, to apply an update) while a request is loading the model. The nginx route `/api/assistant/chat` allows up to 300 s.

## How it works

- `POST /api/assistant/chat` carries the conversation and the selected context (timeline date, aircraft, component, finding, part, scenario). `GET /api/assistant/status` reports whether the model service is reachable.
- The model can only call the allowlisted tools in `services/assistant/tools.py`. Each wraps an existing service (fleet summary, availability forecast, aircraft detail, advisories, component health, work orders, inventory and part requests, scenario preview, Simulator run). There is no new prediction, scheduling or simulation logic.
- Arguments are typed and validated (Pydantic, unknown fields rejected). The timeline date always comes from the chat context, never from the model. The scenario tool requires the same roles as the Simulator (fleet manager, planner, supervisor) and is hidden from other roles.
- Tools never return the hidden simulation truth table. Events after the selected date are removed, and scenarios and plan comparisons are refused while replaying a past date.
- Cards (sensor trends, predictions with intervals, tables, scenario comparisons) are built from tool output, not model text, and labelled *Observed*, *Model forecast* or *Simulated*.
- Answer checks: inline citations must match record IDs returned by tools (others are unlinked and reported). Numbers that cannot be traced to tool output are reported and the generated explanation is withheld. Retrieved-data explanations also require an individually checked citation; missing or grouped-only citations withhold the explanation.
- What-if requests run as a separate saved Simulator scenario (same Monte Carlo settings as the Simulator page: 30 days, 300 runs, seed 7). They never change records, the plan or dashboard metrics. Supported changes are spare delivery delay (modelled as a longer replenishment lead time), extra bay capacity (+1 to 5), early replacement of findings, and scheduling a replacement. Technician availability, reducing bay capacity and changing spare quantities are not modelled; the copilot says so.
- If the model service is down, the panel says it is unavailable with a Retry button. No canned answer is shown.

## Limitations

- Local 8B-model answers take roughly 20–70 s per question on an M2 / 16 GB machine.
- The model can still phrase things imprecisely or compute its own figures. The traceability warning flags untraced numbers, but it is a heuristic and not a proof of correctness.
- "Reset scenario" removes the scenario from the conversation context; the saved run stays in the Simulator list (there is no delete endpoint).
- Conversation history is kept in the browser session only; nothing is stored server-side except Simulator runs the copilot started (audited like any Simulator run).

## Chat refinement verification (13 October 2026)

The panel uses the shared light/dark surfaces with stronger contrast, a concise welcome,
page-specific starting questions, readable answer cards and collapsed technical details.
Suggestions leave the conversation area after the first turn. Streaming follows the bottom
only while the reader is already there; sending a new question follows the new turn.
Completed conversation storage is debounced rather than rewritten on each token. Sending
another question while one is pending is blocked, and IME composition does not submit on Enter.

Local checks of current availability, show-fleet-availability and the existing 30-day forecast
returned in 54–165 ms through the application proxy. This is a small local measurement of
service-backed queries, not a latency promise for arbitrary model explanations. The private
local instruction model remained available. No hosted provider or credential was introduced.
The focused backend grounding/privacy suite passed 38 tests; browser streaming tests cover
checked-final replacement, truncation, malformed responses, cancellation and mobile layout.
Number checks remain heuristic, so generated explanations still require review.

## Fast grounded answers — 2026-10-14

Versioned site guidance explains registration, the PS, workflow, prediction limits, approval,
availability and privacy without model inference. Bounded aliases also retrieve ranked findings
and at-risk stock directly from existing services; missing selections prompt clarification.
Explicit secret/permission-bypass requests and unsupported exact-failure/tomorrow-record requests
receive bounded guidance. Compound questions are not guessed into an unrelated record query.

Responses identify `answer_mode`: records, guidance or model. General inference keeps at most six
conversation messages with bounded prior text, uses deterministic temperature and a bounded output,
and reuses identical read-only tool calls within a turn only. No cross-question answer cache or paid
provider fallback is added. Large tool content preserves valid JSON, source IDs and a truncation
notice. Local model-status checks use a shorter timeout.

Unknown citation IDs or unmatched figures withhold the generated explanation while retaining
service-built cards/sources and a warning. This is stronger than displaying unverified figures,
but numerical matching is still heuristic and cannot prove semantic correctness or eliminate all
hallucinations. Provisional streaming text is not a checked final answer. Private mode remains the
default. Representative operational reliability and model qualification remain separate gates.

Registered-aircraft context uses the REG identity and a separate read-only tool. Its summaries show
user-entered usage and source requirements while keeping availability unknown and health unassessed.
The synthetic fleet's scored date/model is not assigned to that registration. Simulation tools reject
REG context. Historical work queries use historical records rather than today's open-work filter;
completion dates after the cutoff are omitted.

## CPU latency follow-up — 20 October 2026

The recorded fleet-summary tool previously called summary/trend services that also prepared
Monte Carlo projections. Recorded count, availability and downtime answers now request only
recorded data and the observed history they display. Dashboard API responses still include their
normal forecast; explicit forecast questions retain the existing calculation and labels.

Bounded self-introductions keep genuine model inference but omit unrelated tool schemas. In the
local payload measurement, this reduces the fixed introduction request from 7,224 to 2,890
characters (60%). This is a character-count comparison, not a measured VM/token/latency gain.
All other interpreted queries keep the full permitted tools. The existing answer/citation checks,
output budget, model, privacy mode and conversation history remain unchanged.

One local model turn per API process is admitted at a time. A competing turn receives an explicit
retry message, while common records/guidance answers bypass inference. This prevents this API
process from submitting competing CPU inference turns; it does not serialize multiple API
processes or external Ollama clients. No inference failure permanently holds the gate.

Run diagnostics inside the actual deployed API container:

```bash
sudo docker exec fleet-aws-demo-api-1 python -m \
  fleet_maintenance.services.assistant.diagnostics --records --benchmark
```

The explicit benchmark generates one synthetic introduction using the current model; run it
when no one else is asking a model question. It does not download a model, use hosted inference,
change application records or export the generated answer. The report includes model residency,
context settings, recorded-query timings and model load/prompt/generation/first-delta timings
when Ollama supplies them. An unavailable local model is reported as such. Without `--benchmark`
it makes no generation request. Without `--records` it reads no fleet records.

Completed model calls also write `assistant_model_timing` metadata in API logs. The fields follow
[Ollama's chat timing response](https://docs.ollama.com/api/chat); residency follows its
[running-model endpoint](https://docs.ollama.com/api/ps). The
[Ollama FAQ](https://docs.ollama.com/faq) documents CPU/GPU residency and context/keep-alive
controls. These settings have not been silently changed on the VM. A 4B CPU model on two shared
vCPUs still has finite generation throughput; its actual latency must be measured there.

Executed local evidence: all 302 backend unit/verification tests and 78 integration checks
passed; three opt-in real-model checks remain skipped. Six actual queries against copied audit
data (latest and replay) passed with inference/forecast disabled. The first bundle load took
about 844 ms; subsequent queries took 18–43 ms locally. This is not a VM throughput claim.
Logs: `artifacts/assistant-latency-full-check-fixed.log`,
`artifacts/assistant-latency-integration.log`, `artifacts/assistant-record-query-check.log`.
The configured local model remains unavailable; actual Qwen latency validation requires the VM.

### Greeting and transport follow-up

The owner clarified that even hi/hello were slow. Those inputs already use service guidance,
so model-only tuning cannot explain that symptom. The browser previously waited for transport
EOF after validating the final answer event. It now accepts that event as terminal and cancels
the remaining transport; malformed/truncated answers still fail their original checks.
Authentication read transactions are released before streaming and before synchronous model
inference, avoiding pinned DB connections during long turns. All successful answer modes log
redacted `assistant_answer_timing` compute durations; model calls retain detailed timing logs.

Both TLS proxy templates enable HTTP/2. The live site negotiated HTTP/1.1 before this update;
HTTP/1 connection limits and long event streams can queue otherwise fast requests. This is a
possible contributor, not a measured attribution of the owner's delay. See
[Nginx HTTP/2](https://nginx.org/en/docs/http/ngx_http_v2_module.html) and
[MDN event-stream connection limits](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

Final local checks: 302 backend unit/verification, 78 integration, 31 frontend unit and eight
focused assistant browser tests passed; three opt-in live-model tests remain skipped. Backend
and frontend production images built. Both proxy templates passed Nginx syntax validation;
actual TLS negotiation selected h2. Four real hi/hello POST requests through the isolated
HTTPS/HTTP2 proxy and API (no model service and no production records) completed in about
197 ms initially, then 8–12 ms. This excludes production authentication and WAN latency and
is not a measured VM improvement. Artifacts: `assistant-latency-proxy/greeting-timings.json`,
`assistant-latency-browser.log`, `assistant-latency-final-backend.log` and
`assistant-latency-final-integration.log` under local `artifacts/`.

Deploy this update by rebuilding/replacing API and web with the existing VM overlays; preserve
PostgreSQL, RabbitMQ, Ollama, env files and volumes. Recreating web regenerates its mounted TLS
template with HTTP/2. Hard-refresh the browser to load the changed answer-stream client. Then
run diagnostics and check greetings through the authenticated browser before claiming the
reported VM slowdown resolved. No schema migration or model/provider change is needed.

### Local runtime activation and status probe — 20 October 2026

The resumed session found the running local API predating the latency fixes. API and web were
rebuilt and replaced in the existing local Compose project. The status endpoint now also
releases its authentication transaction before probing model availability, preventing slow
status probes from retaining database pool connections needed by chat and other requests.

Executed checks: 108 focused assistant regressions, 31 frontend unit tests and eight browser
streaming tests passed. After the additional status fix, Ruff and all 16 latency regressions
passed. The first browser-test attempt could not bind its server inside the sandbox; the
rerun with local server/browser access passed. A documented public demo credential did not
authenticate locally; the subsequent real check used a temporary viewer and removed it and
its sessions afterwards without changing existing account credentials.

Chrome fetches through `http://localhost:8080` with a real server session completed hi/hello
in 268 ms initially and 32–89 ms subsequently; fleet count completed in 96 ms. These requests
used the actual proxy, API, authentication and saved synthetic fleet, without mocked replies.
Evidence: `artifacts/assistant-resume-timings.json` and
`artifacts/verify-assistant-resume.mjs`. This is local evidence only. No SSH configuration or
gcloud executable is available in this workspace, so no VM update or live-model measurement
was performed in this resumed session.

### VM latency update applied — 20 October 2026

Owner-supplied VM output confirms a fast-forward from `91684fe` to `4ed2818`, successful API/web
builds, healthy replacement containers, passing Nginx configuration and ready database/API.
Independent GET verification of `https://sih-34-56-39-7.sslip.io/api/health/ready` returned
HTTP 200 over HTTP/2. The status-probe follow-up in the local working tree is additional and
was not part of this deployed commit.

The supplied output ends before the diagnostics command prints its model benchmark JSON.
An attempted independent Chrome timing check could not authenticate with the documented shared
synthetic demo credentials (401); no further credential attempts were made and no live latency
claim is supported by that attempt. Authenticated greetings and actual model timings still
require the owner's signed-in check or the remaining diagnostic output. Direct SSH to the
known VM user/IP was denied with `Permission denied (publickey)`; the owner applied the update
through their existing VM terminal.
