# Site flow audit — 11 October 2026

The site mixed two navigation systems and duplicated review, schedule, supply and availability screens. It also mixed the synthetic fleet-health workspace with the engine dataset's constraint-planning and trial tools. This change gives each workspace a purpose and preserves selection across handoffs.

## Decisions

- Keep the detailed findings table and its evidence/review panel; remove the duplicate card queue.
- Keep maintenance planning, readiness and lifecycle actions in one work board. Retain bays/timeline and recorded work as adjacent views; remove competing archive mutations.
- Keep inventory forecasts and actual supply transactions as two views of one supply workspace.
- Keep overview charts; move unique grounding reasons and urgent available-aircraft findings into the dashboard instead of retaining another status page.
- Keep the aircraft showroom, blueprint and integrated records. Add handoffs into the same findings/work/supply flow.
- Keep research evidence, exact constraint approvals, retained inventory and trial tools in a clearly separate context because they operate on different records. Do not merge their data with fleet replay.
- Remove the unused alternate shell and duplicate marketing start page. Keep `/welcome` as an optional guide.
- Use one navigation inventory for desktop, mobile and command search. Preserve old bookmarks with context-carrying redirects.

## Audit coverage

Source and route review covered the dashboard, aircraft register/detail, component health, findings, maintenance, spares, simulator, notifications, analytics, data, guide, engine register/component evidence, constraint planning, research inventory, scenarios, alerts, AI, spatial inspection and trial. Browser route sweeps cover desktop and mobile containment and common navigation; focused checks cover handoffs, aliases, review-to-confirmation, inventory deep links and retained research approval behaviour.

See [UI verification](ui_verification.md) for executed checks and limits, and [user flow](../product/user_flow.md) for the canonical route responsibilities. This is an implemented presentation/workflow consolidation, not a usability-study result or a claim of improved operational availability. No backend schema or scientific model changes are part of this consolidation.
