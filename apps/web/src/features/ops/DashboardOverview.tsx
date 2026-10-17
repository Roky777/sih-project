import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Icon } from "../../shared/ui/Icon";
import { useRole } from "./roles";
import { overviewTours } from "./dashboardOverviewTours";
import "./dashboard-overview.css";

type Bounds = { top: number; left: number; width: number; height: number; borderRadius: string };

/** Deliberately memory-only: every full page load starts with the invitation again. */
export function DashboardOverview() {
  const [open, setOpen] = useState(true);
  const { role } = useRole();
  const steps = overviewTours[role.id];
  const [step, setStep] = useState(-1);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const active = steps[step];
  useEffect(() => {
    if (!open || !active) return;
    const update = () => {
      const selector = active.target === 'assistant' ? '.o-header .o-ask-ai' : `.o-topnav > a[href="${active.target}"]`;
      let element = document.querySelector<HTMLElement>(selector);
      if (!element || !element.getBoundingClientRect().width) element = document.querySelector<HTMLElement>('.o-header .o-mobile-only');
      if (!element) { setBounds(null); return; }
      const r = element.getBoundingClientRect();
      setBounds({ top: r.top + 2, left: r.left + 2, width: Math.max(0, r.width - 4), height: Math.max(0, r.height - 4), borderRadius: getComputedStyle(element).borderRadius });
    };
    update();
    const observer = new ResizeObserver(update);
    const header = document.querySelector('.o-header');
    if (header) observer.observe(header);
    // Badge counts and web fonts can move a tab without resizing the header.
    header?.querySelectorAll('.o-topnav > *, .o-ask-ai, .o-mobile-only').forEach(element => observer.observe(element));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update); };
  }, [active, open]);
  const dismiss = () => { setOpen(false); document.getElementById('main-content')?.focus({ preventScroll: true }); };
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) dismiss(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className={`dashboard-overview-overlay${active ? ' is-touring' : ''}`}/>
      {active && bounds && <div aria-hidden="true" className="dashboard-overview-highlight" style={bounds} data-overview-target={active.target}/>}
      <Dialog.Content className={`dashboard-overview${active ? ' is-touring' : ''}`} onCloseAutoFocus={e => { e.preventDefault(); document.getElementById('main-content')?.focus({ preventScroll: true }); }} onPointerDownOutside={e => e.preventDefault()}>
        <div className="dashboard-overview-mark" aria-hidden="true"><Icon name={active ? 'activity' : 'aircraft'} size={25}/></div>
        <p className="dashboard-overview-eyebrow">{active ? `${role.short.toUpperCase()} OVERVIEW · ${step + 1} OF ${steps.length}` : 'WELCOME TO FLEETAVAIL'}</p>
        <Dialog.Title>{active?.title ?? 'A quick look around your dashboard'}</Dialog.Title>
        <Dialog.Description>{active?.text ?? 'Follow the journey from aircraft health and AI findings to maintenance, spares and fleet availability. Take a short overview, or go straight to your workspace.'}</Dialog.Description>
        {!active && <div className="dashboard-overview-workspace"><strong>{role.label}</strong><p>{role.question}</p><span>{role.does.join(' · ')}</span></div>}
        {active ? <><div className="dashboard-overview-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((s, i) => <span key={`${i}-${s.title}`} className={i <= step ? 'done' : ''}/>)}</div><p className="dashboard-overview-hint">The highlighted control is where you’ll find this feature. On smaller screens, use the navigation menu.</p><div className="dashboard-overview-actions"><button type="button" className="overview-skip" onClick={dismiss}>Skip</button><div><button type="button" className="overview-back" onClick={() => { if (step === 0) { setOpen(false); window.dispatchEvent(new Event("fleet:choose-workspace")); } else setStep(s => s - 1); }}>{step === 0 ? "Change workspace" : "Back"}</button><button type="button" className="overview-start" onClick={() => step === steps.length - 1 ? dismiss() : setStep(s => s + 1)}>{step === steps.length - 1 ? 'Finish overview' : 'Next'}</button></div></div></> : <div className="dashboard-overview-actions"><button type="button" className="overview-skip" onClick={dismiss}>Skip</button><button type="button" className="overview-start" onClick={() => setStep(0)}>Start overview <span aria-hidden="true">→</span></button></div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
