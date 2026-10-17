import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { useSession } from './SessionGate';
import { useQueryClient } from '@tanstack/react-query';
import { engineQueryOptions } from '../ops/api';
import { EventStreamBridge } from '../../shared/api/eventStream';
import { roles, useRole, type RoleId } from '../ops/roles';
import { AccessFrame } from './AccessFrame';

export const entryStorageKey = 'fleet:workspace-entry';
export const hoverEntryDuration = 2000;

export function RoleEntryGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const { role, canSwitch, setRole } = useRole();
  const identity = session?.authentication === 'server session' ? `${session.id}:${session.role}` : 'local-demo';
  const [entered, setEntered] = useState(() => {
    try { return sessionStorage.getItem(entryStorageKey) === identity; } catch { return false; }
  });
  useEffect(() => {
    if (!entered) void queryClient.prefetchQuery(engineQueryOptions);
  }, [entered, queryClient]);
  const [selected, setSelected] = useState<RoleId | null>(canSwitch ? null : role.id);
  const [hoverRole, setHoverRole] = useState<RoleId | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entering = useRef(entered);
  const hoverTarget = useRef<RoleId | null>(null);
  const cancelHover = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null; hoverTarget.current = null;
    setHoverRole(null);
  };
  useEffect(() => {
    const cancel = () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
      hoverTimer.current = null; hoverTarget.current = null; setHoverRole(null);
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const reset = () => {
      try { sessionStorage.removeItem(entryStorageKey); } catch { /* Memory state still resets. */ }
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
      hoverTimer.current = null; hoverTarget.current = null; setHoverRole(null); entering.current = false;
      setSelected(canSwitch ? null : role.id); setEntered(false);
    };
    window.addEventListener('fleet:choose-workspace', reset);
    window.addEventListener('fleet:session-expired', reset);
    return () => { window.removeEventListener('fleet:choose-workspace', reset); window.removeEventListener('fleet:session-expired', reset); };
  }, [canSwitch, role.id]);
  const enter = (target: RoleId | null = selected) => {
    if (!target || entering.current || (!canSwitch && target !== role.id)) return;
    entering.current = true;
    cancelHover();
    if (canSwitch) setRole(target);
    try { sessionStorage.setItem(entryStorageKey, identity); } catch { /* No storage is required for entry. */ }
    setEntered(true);
    // Keep bookmarked records; normal entry opens the existing role-relevant workspace.
    if (['/', '/login', '/home', '/dashboard', '/welcome'].includes(location.pathname)) navigate(roles.find(r => r.id === target)!.home, { replace: true });
  };
  const completeHover = (target: RoleId, element: HTMLButtonElement) => {
    if (hoverTarget.current !== target || !element.isConnected || !element.matches(':hover') || document.hidden) return;
    cancelHover();
    setSelected(target);
  };
  const beginHover = (target: RoleId, element: HTMLButtonElement, pointerType: string) => {
    cancelHover();
    if (pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches
      || element.disabled || entering.current || document.hidden) return;
    hoverTarget.current = target; setHoverRole(target);
    // Completing the animation selects only; entry always requires the confirmation button.
    hoverTimer.current = setTimeout(() => completeHover(target, element), hoverEntryDuration + 100);

  };
  if (entered) return <>{children}<EventStreamBridge/></>;
  const choice = roles.find(r => r.id === selected);
  return <AccessFrame workspaceSelection title={canSwitch ? 'Your role.\nYour workspace.' : 'Welcome back.\nYour team is ready.'} description="Follow aircraft health evidence through maintenance, parts and fleet availability. Start with the work that matters to your team." eyebrow={canSwitch ? 'LOCAL DEMONSTRATION' : 'SIGNED-IN WORKSPACE'}>
    <div className="entry-role-content">
    <div className="entry-panel-heading"><h2>{canSwitch ? 'How do you work with the fleet?' : 'Your assigned workspace'}</h2><p>{canSwitch ? 'Choose a role to explore the same shared fleet through your team’s priorities. No password is required in this local demo.' : `Signed in as ${session?.id}. Access follows your server-assigned role.`}</p></div>
    <p id="entry-interaction-hint" className="entry-hover-hint">Hover or tap to choose a role, then select your workspace to enter.</p>
    <div className="entry-role-grid" role="group" aria-label="Choose your workspace role">
      {roles.map(item => { const active = selected === item.id; const locked = !canSwitch && item.id !== role.id; return <button type="button" className={`entry-role-card${active ? ' selected' : ''}${hoverRole === item.id ? ' is-filling' : ''}`} style={{ '--entry-fill-duration': `${hoverEntryDuration}ms` } as CSSProperties} key={item.id} aria-pressed={active} aria-describedby="entry-interaction-hint" disabled={locked} onPointerEnter={event => beginHover(item.id, event.currentTarget, event.pointerType)} onAnimationEnd={event => { if (event.animationName === 'entry-liquid-rise') completeHover(item.id, event.currentTarget); }} onPointerLeave={cancelHover} onPointerCancel={cancelHover} onKeyDown={event => { if (event.key === 'Escape') cancelHover(); }} onClick={() => { cancelHover(); setSelected(item.id); }}>
        <span className="entry-role-icon"><Icon name={item.icon} size={22}/></span><span className="entry-role-check" aria-hidden="true">{active ? <Icon name="check" size={13}/> : locked ? <Icon name="shield" size={13}/> : null}</span>
        <strong>{item.label}</strong><span>{item.does[0]}</span><small>{locked ? 'Requires assigned access' : item.homeLabel + ' →'}</small>
      </button>; })}
    </div>
    </div>
    <div className="entry-actions">
    <div className="entry-selection" aria-live="polite">{choice ? <><strong>{choice.short} workspace</strong><span>{choice.question}</span></> : <span>Select a workspace to continue.</span>}</div>
    <button type="button" className="entry-continue" disabled={!selected} onClick={() => enter()}>Select workspace <Icon name="arrow" size={18}/></button>
    <p className="entry-access-note">{canSwitch ? 'Demo role selection changes available actions locally. Shared fleet records stay the same.' : 'Other team roles require administrator-assigned access. Choosing a card cannot change account permissions.'}</p>
    </div>
  </AccessFrame>;
}
