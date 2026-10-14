import { useActorRole } from "../ops/roles";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, arrayOf } from '../../shared/api/client';

type Resource = { id: string; label: string; kind: string; capacity: number; version: number; capabilities: string[]; aircraft_ids: string[]; available: number[][]; valid_from: number; valid_until: number };
function isResource(value: unknown): value is Resource {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return ['id', 'label', 'kind'].every(key => typeof v[key] === 'string') && ['capacity', 'version', 'valid_from', 'valid_until'].every(key => typeof v[key] === 'number' && Number.isInteger(v[key])) && Array.isArray(v.capabilities) && v.capabilities.every(item => typeof item === 'string') && Array.isArray(v.aircraft_ids) && v.aircraft_ids.every(item => typeof item === 'string') && Array.isArray(v.available) && v.available.every(item => Array.isArray(item) && item.length === 2 && item.every(n => typeof n === 'number' && Number.isInteger(n)));
}
export function ResourcePanel() {
  const client = useQueryClient(), actorRole = useActorRole();
  const resources = useQuery({ queryKey: ['resources'], queryFn: () => api('/resources', undefined, arrayOf(isResource)) });
  const [id, setId] = useState(''), [kind, setKind] = useState('crew'), [label, setLabel] = useState('');
  const [windows, setWindows] = useState('0-112'), [expires, setExpires] = useState(112);
  const [capacity, setCapacity] = useState(1), [error, setError] = useState<string | null>(null);
  const selected = resources.data?.find(item => item.id === id);
  const save = useMutation({ mutationFn: () => {
    const available = windows ? windows.split(',').map(text => text.trim().split('-').map(Number).map(hour => hour / 8)) : [];
    if (available.some(row => row.length !== 2 || row.some(n => !Number.isInteger(n) || n < 0 || n > 14) || row[1] <= row[0])) throw new Error('Use ranges in multiples of 8 hours, such as 0-24,32-112. Leave blank to close the resource.');
    return api(`/resources/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ kind, label, capacity, available, capabilities: selected?.capabilities ?? ['engine'], aircraft_ids: selected?.aircraft_ids ?? [], valid_from: selected?.valid_from ?? 0, valid_until: expires / 8, expected_version: selected?.version ?? null }) });
  }, onMutate: () => setError(null), onError: e => setError(e.message), onSuccess: () => { void client.invalidateQueries({ queryKey: ['resources'] }); void client.invalidateQueries({ queryKey: ['plans'] }); } });
  const choose = (value: string) => {
    setId(value); const item = resources.data?.find(resource => resource.id === value);
    if (item) { setKind(item.kind); setLabel(item.label); setCapacity(item.capacity); setExpires(item.valid_until * 8); setWindows(item.available.map(([left, right]) => `${left * 8}-${right * 8}`).join(',')); }
  };
  return <details className="card resource-panel"><summary>Inspect crew, bays and available work windows</summary><p>Resources are qualified for the listed work and must remain available for its entire duration. Times are relative hours in this 112-hour demonstrator.</p>
    {resources.error && <p role="alert">Resources could not be loaded.</p>}
    <div className="table-scroll"><table><caption>Configured fleet resources</caption><thead><tr><th>Resource</th><th>Work compatibility</th><th>Available hours</th><th>Qualification valid hours</th></tr></thead><tbody>{resources.data?.map(item => <tr key={item.id}><td>{item.label} · {item.kind} · capacity {item.capacity}</td><td>{item.capabilities.join(', ')}</td><td>{item.available.map(([left, right]) => `${left * 8}–${right * 8}`).join(', ') || 'Closed'}</td><td>{item.valid_from * 8}–{item.valid_until * 8}</td></tr>)}</tbody></table></div>
    {actorRole === 'administrator' && <form className="trial-form" onSubmit={event => { event.preventDefault(); save.mutate(); }}><h3>Configure an engine crew or bay</h3><label>Select existing resource<select value={selected?.id ?? ''} onChange={event => choose(event.target.value)}><option value="">Create a resource</option>{resources.data?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>Resource identifier<input required maxLength={64} value={id} onChange={event => setId(event.target.value)}/></label><label>Display name<input required maxLength={160} value={label} onChange={event => setLabel(event.target.value)}/></label><label>Resource type<select value={kind} onChange={event => setKind(event.target.value)}><option value="crew">Engine crew</option><option value="bay">Compatible engine bay</option></select></label><label>Capacity<input required type="number" min={1} max={100} value={capacity} onChange={event => setCapacity(Number(event.target.value))}/></label><label>Available hour ranges<input value={windows} onChange={event => setWindows(event.target.value)} aria-describedby="resource-calendar-help"/></label><p id="resource-calendar-help">For example, 0-24,32-112 excludes hours 24–32 for a break, leave or closure. Use multiples of eight hours; blank closes the resource.</p><label>Qualification valid until hour<input required type="number" min={8} max={112} step={8} value={expires} onChange={event => setExpires(Number(event.target.value))}/></label><button disabled={save.isPending || !id}>Save resource configuration</button>{error && <p role="alert">{error}</p>}{save.isSuccess && <p role="status">Resource configuration saved. Generate a fresh proposal.</p>}</form>}
  </details>;
}
