import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { useSession } from './SessionGate';
import { useQueryClient } from '@tanstack/react-query';
import { engineQueryOptions } from '../ops/api';
import { EventStreamBridge } from '../../shared/api/eventStream';
import { roles, useRole, type RoleId } from '../ops/roles';
import { AccessFrame } from './AccessFrame';
import { api } from '../../shared/api/client';

export const entryStorageKey = 'fleet:workspace-entry';
export const hoverEntryDuration = 2000;

export function RoleEntryGate({ children, onRequestSignIn }: { children: ReactNode; onRequestSignIn?: (role: RoleId) => void | Promise<void> }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const { role, canSwitch, setRole } = useRole();
  const identity = session?.authentication === 'server session' ? `${session.id}:${session.role}` : 'local-demo';
  const [entered, setEntered] = useState(() => {
    if (onRequestSignIn) return false;
    if (session?.authentication === "server session") return true;
    try { return sessionStorage.getItem(entryStorageKey) === identity; } catch { return false; }
  });
  useEffect(() => {
    if (!entered && !onRequestSignIn) void queryClient.prefetchQuery(engineQueryOptions);
  }, [entered, queryClient, onRequestSignIn]);
  const [selected, setSelected] = useState<RoleId | null>(canSwitch ? null : role.id);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
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
    const reset = (event: Event) => {
      try { sessionStorage.removeItem(entryStorageKey); } catch { /* Memory state still resets. */ }
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
      hoverTimer.current = null; hoverTarget.current = null; setHoverRole(null); entering.current = false;
      const requested = event instanceof CustomEvent ? roles.find(item => item.id === event.detail?.role)?.id : undefined;
      setSelected(canSwitch ? requested ?? null : role.id); setEntered(false);
    };
    window.addEventListener('fleet:choose-workspace', reset);
    window.addEventListener('fleet:session-expired', reset);
    return () => { window.removeEventListener('fleet:choose-workspace', reset); window.removeEventListener('fleet:session-expired', reset); };
  }, [canSwitch, role.id]);
  const requestWorkspace = async (target: RoleId) => {
    cancelHover();
    if (onRequestSignIn) {
      if (switching) return;
      setSelected(target);
      return;
    }
    if (canSwitch || target === role.id) { setSelected(target); return; }
    if (switching) return;
    setSwitching(true); setSwitchError('');
    try {
      await api('/access/session', { method: 'DELETE' });
      try { sessionStorage.removeItem(entryStorageKey); } catch { /* Storage is optional. */ }
      navigate(`/login?workspace=${target}`, { replace: true });
      window.dispatchEvent(new Event('fleet:session-expired'));
    } catch (cause) {
      setSwitchError(cause instanceof Error ? cause.message : 'Unable to switch workspace. Try again.');
      setSwitching(false);
    }
  };
  const enter = (target: RoleId | null = selected) => {
    if (!target || entering.current || switching) return;
    if (!canSwitch && target !== role.id) { void requestWorkspace(target); return; }
    if (onRequestSignIn) {
      cancelHover(); setSwitching(true); setSwitchError('');
      Promise.resolve().then(() => onRequestSignIn(target)).catch(cause => {
        setSwitchError(cause instanceof Error ? cause.message : 'Unable to open sign in. Try again.');
      }).finally(() => setSwitching(false));
      return;
    }
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
  return <AccessFrame workspaceSelection title={'Know your fleet.\nPlan with clarity.'} description="Aircraft health, maintenance and spare parts—connected in one workspace. See what needs attention and coordinate your team’s next move." eyebrow="ABOUT AEROCARE">
    <div className="entry-role-content">
    <div className="entry-panel-heading"><h2>How do you work with the fleet?</h2><p>Choose your team, then sign in or create an account for its workspace.</p></div>
    <div className="entry-role-grid" role="group" aria-label="Choose your workspace role">
      {roles.map(item => { const active = selected === item.id; return <button type="button" className={`entry-role-card${active ? ' selected' : ''}${hoverRole === item.id ? ' is-filling' : ''}`} style={{ '--entry-fill-duration': `${hoverEntryDuration}ms` } as CSSProperties} key={item.id} aria-pressed={active} disabled={switching} onPointerEnter={event => beginHover(item.id, event.currentTarget, event.pointerType)} onAnimationEnd={event => { if (event.animationName === 'entry-liquid-rise') completeHover(item.id, event.currentTarget); }} onPointerLeave={cancelHover} onPointerCancel={cancelHover} onKeyDown={event => { if (event.key === 'Escape') cancelHover(); }} onClick={() => { void requestWorkspace(item.id); }}>
        <span className="entry-role-icon"><Icon name={item.icon} size={22}/></span><span className="entry-role-check" aria-hidden="true">{active ? <Icon name="check" size={13}/> : null}</span>
        <strong>{item.label}</strong><span>{item.does[0]}</span><small>{item.homeLabel + ' →'}</small>
      </button>; })}
    </div>
    </div>
    {switchError && <p role="alert" className="form-error">{switchError}</p>}
    <div className="entry-actions">
    <div className="entry-selection" aria-live="polite">{choice && <strong>{choice.short} workspace</strong>}</div>
    <button type="button" className="entry-continue" disabled={!selected || switching} onClick={() => enter()}>Select workspace <Icon name="arrow" size={18}/></button>
    </div>
  </AccessFrame>;
}
