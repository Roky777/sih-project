# AI Maintenance Copilot

An optional assistant that answers questions about the fleet using FleetAvail's own records and services. It runs an open model (Qwen3-8B by default) through Ollama, behind the existing backend and its authentication.

## Configuration (server-side only)

| Variable | Default | Meaning |
|---|---|---|
| `FLEET_ASSISTANT_ENABLED` | `true` | `false` hides every copilot control and the API returns 404; the site is unchanged. |
| `FLEET_ASSISTANT_OLLAMA_URL` | `http://localhost:11434` (compose: `http://host.docker.internal:11434`) | Ollama endpoint. Never sent to the browser. |
| `FLEET_ASSISTANT_MODEL` | `qwen3:8b` | Any Ollama model with tool calling. |
| `FLEET_ASSISTANT_TIMEOUT_SECONDS` | `120` | Per model call; a turn may take at most twice this. |
| `FLEET_ASSISTANT_MAX_TOOL_ITERATIONS` | `4` | Tool-calling rounds before a final answer is forced. |
| `FLEET_ASSISTANT_CONTEXT_TOKENS` | `8192` | Model context window. Larger values raise memory use. |

The AWS demo overlay sets `FLEET_ASSISTANT_ENABLED=false` (no model service is deployed there).

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
- Answer checks: inline citations must match record IDs returned by tools (others are unlinked and reported). Numbers that cannot be traced to tool output are listed in a warning.
- What-if requests run as a separate saved Simulator scenario (same Monte Carlo settings as the Simulator page: 30 days, 300 runs, seed 7). They never change records, the plan or dashboard metrics. Supported changes are spare delivery delay (modelled as a longer replenishment lead time), extra bay capacity (+1 to 5), early replacement of findings, and scheduling a replacement. Technician availability, reducing bay capacity and changing spare quantities are not modelled; the copilot says so.
- If the model service is down, the panel says it is unavailable with a Retry button. No canned answer is shown.

## Limitations

- Local 8B-model answers take roughly 20–70 s per question on an M2 / 16 GB machine.
- The model can still phrase things imprecisely or compute its own figures. The traceability warning flags untraced numbers, but it is a heuristic and not a proof of correctness.
- "Reset scenario" removes the scenario from the conversation context; the saved run stays in the Simulator list (there is no delete endpoint).
- Conversation history is kept in the browser session only; nothing is stored server-side except Simulator runs the copilot started (audited like any Simulator run).
