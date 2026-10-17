import type { RoleId } from './roles';

export type OverviewStep = { title: string; target: string; text: string };
const assistant: OverviewStep = {
  title: 'Ask for help in context', target: 'assistant',
  text: 'Ask AI can help explore records when the assistant is available. Check its sources and supporting evidence. Your account permissions and human approval requirements still apply.',
};

/** Guidance for the existing four product roles; does not grant permissions or change records. */
export const overviewTours: Record<RoleId, OverviewStep[]> = {
  engineer: [
    { title: 'Inspect the aircraft and component', target: '/aircraft', text: 'Start in Aircraft. Choose the affected aircraft and inspect its digital twin, component condition and recorded maintenance history.' },
    { title: 'Review the AI evidence', target: '/advisories', text: 'In Findings, inspect the sensor trends, remaining-life estimate, uncertainty and data quality. A model explanation is evidence to review, not a confirmed mechanical fault.' },
    { title: 'Hand a reviewed finding to maintenance', target: '/maintenance', text: 'Confirm or dismiss findings with a reason where your account permits. Maintenance lets you follow the resulting work; scheduling, parts checks and approval remain separate responsibilities.' },
    assistant,
  ],
  supervisor: [
    { title: 'Prioritise and schedule maintenance', target: '/maintenance', text: 'Start in Maintenance. Review confirmed findings and mandatory work, then check deadlines, qualified crew and bay capacity before proposing a schedule.' },
    { title: 'Check parts before committing', target: '/spares?view=requests', text: 'Use Spares to inspect required stock, shortages and delivery status. A proposed plan is not a stock reservation; received usable parts must support the work.' },
    { title: 'Approve and track the exact work', target: '/maintenance', text: 'Review the exact proposal and its current constraints before approval where authorised. Track work through start and completion, retaining the decision and maintenance history.' },
    { title: 'Compare maintenance choices', target: '/analysis', text: 'Use Simulator to compare timing, supply and capacity choices. Inspect its downtime inputs and assumptions; a preventive intervention can also reduce projected availability.' },
    assistant,
  ],
  logistics: [
    { title: 'Find the parts that need attention', target: '/spares?view=requests', text: 'Start in Spares. Review requests linked to maintenance work and identify the parts needed, quantities, shortages and required dates.' },
    { title: 'Check stock and expected arrivals', target: '/spares?view=requests', text: 'Compare usable stock with demand and expected deliveries. An expected arrival is not received stock; keep shortages and lead-time concerns visible.' },
    { title: 'Coordinate parts with scheduled work', target: '/maintenance', text: 'Use Maintenance to understand when parts are needed. Where authorised, manage requests, orders and receipts in Spares so the team can reassess readiness before work starts.' },
    assistant,
  ],
  fleet_manager: [
    { title: 'Your fleet at a glance', target: '/dashboard', text: 'Start in Overview. Review fleet availability, grounded aircraft and urgent findings to understand what is limiting the fleet today.' },
    { title: 'Understand why an aircraft is down', target: '/aircraft', text: 'Open Aircraft to inspect a specific aircraft, its component condition, findings and maintenance history. Follow the underlying record before setting priorities.' },
    { title: 'Review maintenance progress', target: '/maintenance', text: 'Use Maintenance to follow scheduled and recorded work. Coordinate engineering, planning and logistics around the same records and visible blockers.' },
    { title: 'Compare fleet-level consequences', target: '/analysis', text: 'Use Simulator to compare maintenance, supply and capacity decisions. Read the assumptions and downtime formula: simulated availability is not a measured operational improvement.' },
    assistant,
  ],
};
