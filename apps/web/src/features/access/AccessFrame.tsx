import { useRef, type ReactNode } from 'react';
import { WorkspaceGrid } from '../ops/WorkspaceGrid';
import { Icon } from '../../shared/ui/Icon';
import './workspace-entry.css';
import { BrandLogo } from '../../shared/ui/BrandLogo';

export function AccessFrame({ children, title, description, eyebrow = 'CONNECTED MAINTENANCE', workspaceSelection = false }: { children: ReactNode; title: string; description: string; eyebrow?: string; workspaceSelection?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  return <div className={`workspace-entry${workspaceSelection ? ' workspace-selection' : ''}`} ref={host}>
    <WorkspaceGrid host={host} paused={false}/>
    <header className="entry-header"><a href="/" className="entry-brand"><BrandLogo/></a></header>
    <main className="entry-layout">
      <section className="entry-intro"><p className="entry-eyebrow">{eyebrow}</p><h1>{workspaceSelection ? title.split("\n").map((line, index) => <span className={index === 1 ? "entry-title-accent" : undefined} key={line}>{line}</span>) : title}</h1><p className="entry-description">{description}</p>
        {workspaceSelection ? <dl className="entry-capabilities">
          <div><dt><Icon name="activity" size={18}/>Monitor aircraft health</dt><dd>Spot changes in component condition and review the evidence behind each finding.</dd></div>
          <div><dt><Icon name="wrench" size={18}/>Coordinate maintenance</dt><dd>Bring crews, workshop capacity and spare parts into the same plan.</dd></div>
          <div><dt><Icon name="aircraft" size={18}/>Understand fleet availability</dt><dd>See aircraft status today and compare projected downtime across plans.</dd></div>
        </dl> : <>
          <div className="entry-journey" aria-label="Connected maintenance workflow"><span><Icon name="activity" size={17}/>Understand</span><i>→</i><span><Icon name="wrench" size={17}/>Coordinate</span><i>→</i><span><Icon name="aircraft" size={17}/>Keep ready</span></div>
          <p className="entry-shared"><span aria-hidden="true"/>One shared fleet. A focused workspace for every team.</p>
        </>}
      </section>
      <section className="entry-panel">{children}</section>
    </main>
  </div>;
}
