# AeroCare operator pilot handover

Prepared 14 October 2026 from the current implementation. **Status: preparation package; no operator
pilot authorised or real-aircraft qualification established.** This package makes the next engagement
concrete without presenting the synthetic demonstration as an operational release.

## What is usable now

- Aircraft identity, installed-component and source-record onboarding.
- Supported immutable FD001 histories, bounded live replay, validation, assessment jobs and evidence.
- Reviewed cases, constrained planning, supply readiness, approval and verified work records.
- Reproducible synthetic availability comparisons and local recovery rehearsal.
- Illustrative 3D/2D engine mapping linked to the same assessment and component identity.

The live `/telemetry` simulator is demo-only. Its frame shape, 180-cycle bound, 30-cycle snapshots,
15-second staleness threshold and archived FD001 input are **not** a production aircraft interface.
The installed `customer-trial-v1` model remains `not_qualified`. A new aircraft registration does not
make its sensors eligible for that model. Reads currently share one agency's authenticated workspace.

## Handover contents

| File | Purpose |
|---|---|
| [Adapter handover](adapter-handover.md) | Data request, identity/unit/time mapping, transport/security decisions and connector acceptance cases. |
| [Model and geometry qualification](qualification.md) | Independent model/alert evaluation and verified visual mapping; separates a visual twin from a physical twin. |
| [Operational evaluation](operational-evaluation.md) | Shadow operation, fair baseline, metric definitions, attribution and acceptance procedure. |
| [Pilot manifest template](templates/pilot-manifest.example.json) | Versioned record of scope, owners, approvals, budgets and evidence. Nulls mean unresolved, not passed. |
| [Signal mapping template](templates/signal-mapping.example.json) | Source-to-canonical mapping fields; contains no invented aircraft signals. |
| [Acceptance register](templates/acceptance-register.example.json) | Proposed gates, evidence required, owner and current status. |

## Stage gates

1. **Agree one bounded use case.** Select aircraft configuration, component, maintenance decision,
   operating regimes and authorised users. Identify who owns data, engineering decisions and access.
2. **Obtain a permitted representative sample.** Complete the adapter handover and manifest. Keep
   samples/secrets outside Git; retain approved hashes/references. No aircraft access is implied.
3. **Implement and test the agreed connector in isolation.** Preserve source identities, units,
   timestamps and corrections. Production transport and scoped service identity need implementation
   against that agreed interface. Do not repurpose local demo headers as device credentials.
4. **Qualify the specific model and installation mapping.** Freeze evaluation and acceptance criteria
   before independent evaluation; complete the qualification document. Unsupported evidence stays
   withheld. Mandatory maintenance and existing operator procedures remain authoritative.
5. **Run shadow operation.** Validate ingestion, useful warnings, data quality, user interpretation,
   workload and recovery while the existing operational process remains the decision authority.
6. **Conduct a separately authorised prospective evaluation.** Only accepted human decisions enter
   actual work. Retain comparable workload, confounders and outcomes before claiming impact.
7. **Review evidence and decide.** The designated operator owners accept, restrict or reject the
   release. An application supervisor approving a plan is not the operator accepting the product.

No fixed delivery duration, guaranteed accuracy or availability increase is committed here. Those
require the selected interface, representative evidence, agreed workload and acceptance decisions.

## Immediate operator request

> We have an integrated maintenance decision demonstrator using labelled simulated engine data.
> For a bounded evaluation, please identify one fleet/component use case and the authorised technical
> and data owners. We need a permitted sample of health observations, installation/configuration
> history, maintenance events, parts/resource constraints and authoritative availability states,
> together with units, timestamp semantics and interface documentation. Please also identify the
> allowed deployment environment and who may agree evaluation criteria. We can then finalise an
> adapter and shadow-evaluation plan. We are not requesting control of aircraft or changes to
> mandatory maintenance.

This is a draft request for the team; it has not been sent to anyone.

Implementation references: [live replay](../engineering/live_telemetry_demo.md),
[onboarding](../engineering/aircraft_registration.md), [evaluation protocol](../research/evaluation_protocol.md),
[permissions](../engineering/permissions.md), [release boundaries](../operations/production_readiness.md).
