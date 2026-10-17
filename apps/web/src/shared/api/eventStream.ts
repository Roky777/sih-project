import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiUrl } from './client';

const eventTypes = ['resync', 'job.queued', 'job.running', 'job.requeued', 'job.cancellation_requested', 'job.cancelled', 'job.failed', 'job.succeeded', 'alert.review_required', 'plan.approved', 'work.start', 'work.complete', 'work.cancel'] as const;
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function EventStreamBridge() {
  const client = useQueryClient();
  useEffect(() => {
    let source: EventSource | null = null;
    const refresh = (event: MessageEvent<string>) => {
      if (event.type === 'resync') { void client.invalidateQueries(); return; }
      let value: unknown;
      try { value = JSON.parse(event.data); } catch { return; }
      if (!object(value) || !object(value.payload)) return;
      const payload = value.payload;
      const component = typeof payload.component_id === 'string' ? payload.component_id : typeof payload.scope_component_id === 'string' ? payload.scope_component_id : undefined;
      const trial = component?.startsWith('trial-') ? component.replace(/-engine$/, '') : undefined;
      if (event.type.startsWith('job.')) {
        if (typeof payload.kind !== 'string' || typeof payload.job_id !== 'string') return;
        void client.invalidateQueries({ queryKey: ['jobs', payload.kind] });
        void client.invalidateQueries({ queryKey: ['comparison-job', payload.job_id] });
        if (trial) void client.invalidateQueries({ queryKey: ['trial-jobs', trial] });
        if (!['job.succeeded', 'job.failed', 'job.cancelled'].includes(event.type)) return;
        if (payload.kind === 'planning') {
          void client.invalidateQueries({ queryKey: ['plans'] });
          if (trial) void client.invalidateQueries({ queryKey: ['trial-plans', trial] });
        } else if (payload.kind === 'assessment') {
          void client.invalidateQueries({ queryKey: ['component', component] });
          void client.invalidateQueries({ queryKey: ['trial-component', component] });
          void client.invalidateQueries({ queryKey: ['alerts'] });
        } else if (payload.kind === 'plan_simulation') {
          void client.invalidateQueries({ queryKey: ['plan-comparison', payload.plan_id] });
        } else if (payload.kind === 'simulation') {
          void client.invalidateQueries({ queryKey: ['scenario-runs'] });
          const scenario = typeof payload.scenario_id === 'string' ? payload.scenario_id.replace(/-(ready|supply)$/, '') : '';
          if (scenario.startsWith('trial-')) void client.invalidateQueries({ queryKey: ['trial-runs', scenario] });
        }
      } else if (event.type === 'alert.review_required') {
        void client.invalidateQueries({ queryKey: ['alerts'] });
      } else {
        for (const key of ['plans', 'inventory', 'resources', 'arrivals', 'plan-commitment']) void client.invalidateQueries({ queryKey: [key] });
        if (trial) {
          void client.invalidateQueries({ queryKey: ['trial-plans', trial] });
          void client.invalidateQueries({ queryKey: ['trial-commitment', payload.plan_id] });
        }
      }
    };
    const expired = () => { source?.close(); window.dispatchEvent(new Event('fleet:session-expired')); };
    const connect = () => {
      if (source || document.hidden) return;
      source = new EventSource(apiUrl('/events'), { withCredentials: true });
      source.addEventListener('auth.required', expired);
      for (const type of eventTypes) source.addEventListener(type, refresh as EventListener);
    };
    const disconnect = () => {
      if (!source) return;
      for (const type of eventTypes) source.removeEventListener(type, refresh as EventListener);
      source.removeEventListener('auth.required', expired);
      source.close(); source = null;
    };
    const visibility = () => {
      if (document.hidden) disconnect();
      else { void client.invalidateQueries(); connect(); }
    };
    document.addEventListener('visibilitychange', visibility);
    connect();
    return () => { document.removeEventListener('visibilitychange', visibility); disconnect(); };
  }, [client]);
  return null;
}
