# AI Maintenance Copilot

An optional assistant that answers questions about the fleet using AeroCare's own records and services. It runs an open model (Qwen3-8B by default) through Ollama, behind the existing backend and its authentication.

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
