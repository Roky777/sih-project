import { useRef, type ReactNode } from 'react';
import { WorkspaceGrid } from '../ops/WorkspaceGrid';
import { Icon } from '../../shared/ui/Icon';
import './workspace-entry.css';

export function AccessFrame({ children, title, description, eyebrow = 'CONNECTED MAINTENANCE', workspaceSelection = false }: { children: ReactNode; title: string; description: string; eyebrow?: string; workspaceSelection?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  return <div className={`workspace-entry${workspaceSelection ? ' workspace-selection' : ''}`} ref={host}>
    <WorkspaceGrid host={host} paused={false}/>
    <header className="entry-header"><a href="/" className="entry-brand"><span><Icon name="aircraft" size={21}/></span>FleetAvail</a><span className="entry-header-note">Aircraft health. Coordinated decisions.</span></header>
    <main className="entry-layout">
      <section className="entry-intro"><p className="entry-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="entry-description">{description}</p>
        <div className="entry-journey" aria-label="Connected maintenance workflow"><span><Icon name="activity" size={17}/>Understand</span><i>→</i><span><Icon name="wrench" size={17}/>Coordinate</span><i>→</i><span><Icon name="aircraft" size={17}/>Keep ready</span></div>
        <p className="entry-shared"><span aria-hidden="true"/>One shared fleet. A focused workspace for every team.</p>
      </section>
      <section className="entry-panel">{children}</section>
    </main>
    <footer className="entry-footer"><span>PS 26249 · Predictive maintenance & fleet availability</span><span>Demonstration data · Human decisions remain authoritative</span></footer>
  </div>;
}
