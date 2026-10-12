import { Fragment, type ReactNode } from "react";
import type { ArchitectureComponent, StructureKind } from "./componentArchitecture";
import { architectureColor } from "./componentArchitecture";
import type { AirframeSpec } from "./airframes";
import { stationAt } from "./airframeKit";
import { resample, sectionPoint, type Airfoil, type Section } from "./fighterGeometry";
import { stateLabel } from "./format";

/* Engineering three-view generated from the same airframe definition as the 3D model: plan,
   side and front elevations to a common scale, dimension lines, fuselage stations, zone
   border, title block and numbered component callouts at their installation zones. Synthetic
   public-data approximation — not a manufacturer drawing. */
const W = 900, H = 600;
const glyph: Record<StructureKind, [number, number]> = {
  compressor: [100, 36], turbine: [62, 34], reservoir: [29, 17], valve: [28, 16], pump: [25, 21], actuator: [52, 12], filter: [29, 16], generator: [35, 20],
  electronics: [30, 20], battery: [31, 20], brake: [22, 19], strut: [42, 11], tyre: [22, 18], sensor: [25, 9], cooling: [32, 22],
};
function Assembly({ kind }: { kind: StructureKind }) {
  const [w, h] = glyph[kind];
  const engine = kind === "compressor" || kind === "turbine";
  const round = ["pump", "generator", "brake", "tyre", "reservoir", "filter"].includes(kind);
  return <>
    {engine ? <path className="bp-part-fill" d={`M${-w / 2} ${-h * .34}Q0 ${-h * .65} ${w / 2} ${-h * .34}V${h * .34}Q0 ${h * .65} ${-w / 2} ${h * .34}Z`}/>
      : <rect className="bp-part-fill" x={-w / 2} y={-h / 2} width={w} height={h} rx={round ? h * .3 : 2}/>}
    <g className="bp-part-detail" fill="none" strokeWidth=".65">
      {engine ? <><path d={`M${-w / 2 - 5} 0H${w / 2 + 5}`}/>{Array.from({ length: kind === "compressor" ? 9 : 5 }, (_, i) => { const x = -w * .36 + i * w * .72 / (kind === "compressor" ? 8 : 4); return <path key={i} d={`M${x - 2} ${-h * .38}L${x + 2} ${h * .38}M${x + 2} ${-h * .38}L${x - 2} ${h * .38}`}/>; })}</>
        : kind === "electronics" ? <path d="M-10-6h20v12h-20Z M5-3h3M5 0h3M5 3h3"/>
          : kind === "battery" ? <path d="M-10-6h5v12h-5Zm7 0h5v12h-5Zm7 0h5v12H4Z"/>
            : kind === "cooling" ? <>{Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${-11 + i * 3}-8V8`}/>)}</>
              : ["actuator", "strut"].includes(kind) ? <path d={`M${-w * .3}-3H${w * .22}V3H${-w * .3}Z M${w * .22}-1H${w * .68}V1H${w * .22}`}/>
                : ["brake", "tyre"].includes(kind) ? <><ellipse rx="7" ry="7"/><ellipse rx="3" ry="3"/></>
                  : <><ellipse rx="6" ry="6"/><path d="M-12 0h24"/></>}
    </g>
  </>;
}

const pts = (points: [number, number][], close = true) => points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("") + (close ? "Z" : "");
const mm = (m: number) => Math.round(m * 1000).toLocaleString("en-GB").replace(/,/g, " ");
const naca = (x: number, t: number) => 5 * t * (.2969 * Math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4);
/** Chordwise profile of a lifting-surface station as [z, y] pairs (upper then lower). */
function profile(st: Airfoil, n = 18): [number, number][] {
  const chord = st.le - st.te, upper: [number, number][] = [], lower: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const x = (1 - Math.cos(i / n * Math.PI)) / 2, t = naca(x, st.tc) * chord; upper.push([st.le - x * chord, st.h + t]); lower.push([st.le - x * chord, st.h - t]); }
  return [...upper, ...lower.reverse()];
}
/** Planform area of a starboard planform mirrored, extended to the centreline (m²). */
function planformArea(planform: Airfoil[]) {
  const list = [{ ...planform[0], s: 0 }, ...planform];
  let area = 0;
  for (let i = 0; i < list.length - 1; i++) area += (list[i + 1].s - list[i].s) * ((list[i].le - list[i].te) + (list[i + 1].le - list[i + 1].te)) / 2;
  return area * 2;
}

export function BlueprintDrawing({ airframe: a, components, onSelect, aircraftId }: { airframe: AirframeSpec; components: ArchitectureComponent[]; onSelect: (id: string) => void; aircraftId?: string }) {
  const mapped = components.filter(item => item.layout);
  const fus = resample(a.fuselage, 6);
  const nose = a.fuselage[0].z, tail = a.fuselage[a.fuselage.length - 1].z, length = nose - tail;
  const halfSpan = a.dimensions.spanM / 2, top = a.groundY + a.dimensions.heightM;
  // Each view is drawn to its own scale (stated in its label and the title block) so that
  // long, wide and tall airframes all use the sheet.
  const k = Math.min(500 / length, 236 / a.dimensions.spanM), ks = Math.min(500 / length, 128 / a.dimensions.heightM);
  const kf = Math.min(212 / a.dimensions.spanM, 190 / a.dimensions.heightM);
  const toScale = (pxPerM: number) => Math.round(1000 / (pxPerM * (420 / W)) / 5) * 5;
  const scale = toScale(k), scaleSide = toScale(ks), scaleFront = toScale(kf);
  const px = 70 + (500 - length * k) / 2, sx0 = 70 + (500 - length * ks) / 2, planY = 196, sideG = 540, fx = 762, fG = 330;
  const P = (z: number, x: number): [number, number] => [px + (nose - z) * k, planY - x * k];
  const S = (z: number, y: number): [number, number] => [sx0 + (nose - z) * ks, sideG - (y - a.groundY) * ks];
  const F = (x: number, y: number): [number, number] => [fx - x * kf, fG - (y - a.groundY) * kf];
  const mirrorPlan = (side: number, planform: Airfoil[]) => pts([...planform.map(st => P(st.le, side * st.s)), ...[...planform].reverse().map(st => P(st.te, side * st.s))]);
  const sectionOutline = (s: Section, map: (x: number, y: number) => [number, number], steps = 48) => pts(Array.from({ length: steps }, (_, i) => { const [x, y] = sectionPoint(s, i / steps * Math.PI * 2); return map(x, y); }));
  const widest = fus.reduce((best, s) => s.w + s.top > best.w + best.top ? s : best, fus[0]);
  const hasWing = a.wing.length > 1, wingRoot = a.wing[1], wingTip = a.wing[a.wing.length - 1], fin = a.fins[0], rotor = a.rotor;
  const jet = a.engines.kind === "jet" ? a.engines : null, jetXs = jet ? jet.xs ?? [0] : [];
  const stations = Array.from({ length: 6 }, (_, i) => nose - length * (i + 1) / 7);

  const plan: ReactNode = <>
    <path className="bp-skin" d={pts([...fus.map(s => P(s.z, (s.cx ?? 0) + s.w)), ...[...fus].reverse().map(s => P(s.z, (s.cx ?? 0) - s.w))])}/>
    {[-1, 1].map(side => <Fragment key={side}>
      {hasWing && <><path className="bp-outline" d={mirrorPlan(side, a.wing)}/>
      <path className="bp-internal" strokeDasharray="5 3" d={pts([wingRoot.s + .05, wingTip.s - .05].map(s => { const st = stationAt(a.wing, s); return P(st.te + a.controlChord, side * s); }), false)}/>
      {[.25, .5, .75].map(t => { const s = wingRoot.s + (wingTip.s - wingRoot.s) * t, st = stationAt(a.wing, s); return <path key={t} className="bp-internal" d={pts([P(st.le, side * s), P(st.te, side * s)], false)}/>; })}</>}
      {a.canard && <path className="bp-outline" d={mirrorPlan(side, a.canard)}/>}
      {a.tailplane && <path className="bp-outline" d={mirrorPlan(side, a.tailplane)}/>}
      {a.intake && <path className="bp-outline" d={pts([...resample(a.intake(side), 4).map(s => P(s.z, (s.cx ?? 0) + side * s.w)), ...[...resample(a.intake(side), 4)].reverse().map(s => P(s.z, (s.cx ?? 0) - side * s.w))])}/>}
      {a.sponson && <path className="bp-outline" d={pts([...resample(a.sponson(side), 4).map(s => P(s.z, (s.cx ?? 0) + side * s.w)), ...[...resample(a.sponson(side), 4)].reverse().map(s => P(s.z, (s.cx ?? 0) - side * s.w))])}/>}
    </Fragment>)}
    {a.canopy && <path className="bp-canopy" d={pts([...a.canopy.map(s => P(s.z, s.w)), ...[...a.canopy].reverse().map(s => P(s.z, -s.w))])}/>}
    {a.fins.map((item, i) => <path key={i} className="bp-outline" d={pts([P(item[0].le, item[0].h + .06), P(item[0].te, item[0].h + .06), P(item[0].te, item[0].h - .06), P(item[0].le, item[0].h - .06)])}/>)}
    {rotor && <><circle className="bp-internal" strokeDasharray="8 4" cx={P(rotor.z, 0)[0]} cy={planY} r={rotor.radius * k}/>
      {Array.from({ length: rotor.blades }, (_, i) => { const ang = i / rotor.blades * Math.PI * 2; return <path key={i} className="bp-outline" d={pts([P(rotor.z, 0), P(rotor.z + Math.cos(ang) * rotor.radius, Math.sin(ang) * rotor.radius)], false)}/>; })}
      <path className="bp-outline" d={pts([P(rotor.tail.z + rotor.tail.radius, rotor.tail.x), P(rotor.tail.z - rotor.tail.radius, rotor.tail.x)], false)}/></>}
    {a.engines.kind === "jet" ? jetXs.map(x => jet && <path key={x} className="bp-internal" strokeDasharray="4 3" d={pts([P(jet.faceZ, x + jet.radius), P(jet.exitZ + .3, x + jet.radius * .85), P(jet.exitZ + .3, x - jet.radius * .85), P(jet.faceZ, x - jet.radius)])}/>)
      : a.engines.kind === "turboshaft" ? a.engines.units.map(u => <rect key={u.x} className="bp-internal" strokeDasharray="4 3" x={P(u.front, 0)[0]} y={P(0, u.x + u.radius)[1]} width={(u.front - u.rear) * k} height={u.radius * 2 * k}/>)
      : a.engines.nacelles.map(n => <Fragment key={n.side}>
        <path className="bp-outline" d={pts([P(n.front, n.x + .38), P(n.front - .6, n.x + .55), P(.6, n.x + .6), P(n.rear, n.x + .2), P(n.rear, n.x - .2), P(.6, n.x - .6), P(n.front - .6, n.x - .55), P(n.front, n.x - .38)])}/>
        {a.engines.kind === "turboprop" && <path className="bp-internal" d={pts([P(a.engines.prop.z, n.x + a.engines.prop.radius), P(a.engines.prop.z, n.x - a.engines.prop.radius)], false)}/>}
      </Fragment>)}
    {[-1, 1].flatMap(side => a.mainGear.z.map(z => <rect key={`${side}${z}`} className="bp-internal" x={P(z, 0)[0] - a.mainGear.tyreRadius * k} y={P(z, side * a.mainGear.x)[1] - a.mainGear.tyreWidth * k / 2} width={a.mainGear.tyreRadius * 2 * k} height={a.mainGear.tyreWidth * k}/>))}
    <path className="bp-centerline" d={`M${px - 14} ${planY}H${P(tail, 0)[0] + 14}`}/>
    {/* Span dimension. */}
    <path className="bp-dimension" d={`M${P(tail, 0)[0] + 28} ${P(0, halfSpan)[1]}V${P(0, -halfSpan)[1]}M${P(tail, 0)[0] + 22} ${P(0, halfSpan)[1]}h12M${P(tail, 0)[0] + 22} ${P(0, -halfSpan)[1]}h12`}/>
    <text className="bp-dim-text" transform={`translate(${P(tail, 0)[0] + 40} ${planY}) rotate(-90)`} textAnchor="middle">{rotor ? "ROTOR Ø" : "SPAN"} {mm(a.dimensions.spanM)}</text>
  </>;

  const finSide = pts([...fin.map(st => S(st.le, st.s)), ...[...fin].reverse().map(st => S(st.te, st.s))]);
  const side: ReactNode = <>
    <path className="bp-skin" d={pts([...fus.map(s => S(s.z, s.cy + s.top)), ...[...fus].reverse().map(s => S(s.z, s.cy - s.bot))])}/>
    {a.canopy && <path className="bp-canopy" d={pts([...a.canopy.map(s => S(s.z, s.cy + s.top)), ...[...a.canopy].reverse().map(s => S(s.z, s.cy))])}/>}
    {a.intake && <path className="bp-outline" d={pts([...resample(a.intake(1), 4).map(s => S(s.z, s.cy + s.top)), ...[...resample(a.intake(1), 4)].reverse().map(s => S(s.z, s.cy - s.bot))])}/>}
    {a.sponson && <path className="bp-outline" d={pts([...resample(a.sponson(1), 4).map(s => S(s.z, s.cy + s.top)), ...[...resample(a.sponson(1), 4)].reverse().map(s => S(s.z, s.cy - s.bot))])}/>}
    {hasWing && <><path className="bp-outline" d={pts(profile(wingRoot).map(([z, y]) => S(z, y)))}/>
    <path className="bp-internal" d={pts(profile(wingTip).map(([z, y]) => S(z, y)))}/></>}
    {a.canard && <path className="bp-outline" d={pts(profile(a.canard[0]).map(([z, y]) => S(z, y)))}/>}
    {rotor && <><path className="bp-outline" d={pts([S(rotor.z + rotor.radius, rotor.y + .02), S(rotor.z - rotor.radius, rotor.y + .02)], false)}/>
      <path className="bp-internal" d={pts([S(rotor.z, 1.3), S(rotor.z, rotor.y + .1)], false)}/>
      <circle className="bp-internal" strokeDasharray="5 3" cx={S(rotor.tail.z, 0)[0]} cy={S(0, rotor.tail.y)[1]} r={rotor.tail.radius * ks}/></>}
    <path className="bp-outline" d={finSide}/>
    {a.tailplane && <path className="bp-outline" d={pts(profile(a.tailplane[0]).map(([z, y]) => S(z, y)))}/>}
    {a.engines.kind === "jet" ? <path className="bp-internal" strokeDasharray="4 3" d={pts([S(a.engines.faceZ, a.engines.axisY + a.engines.radius), S(a.engines.exitZ + .3, a.engines.axisY + a.engines.radius * .85), S(a.engines.exitZ + .3, a.engines.axisY - a.engines.radius * .85), S(a.engines.faceZ, a.engines.axisY - a.engines.radius)])}/>
      : a.engines.kind === "turboshaft" ? <path className="bp-outline" d={pts([S(1.9, 1.0), S(1.2, 1.44), S(-1.4, 1.42), S(-2.5, 1.13), S(-2.5, .95), S(1.9, .95)])}/>
      : (() => { const n = a.engines.nacelles[1], p = a.engines.prop; return <>
        <path className="bp-outline" d={pts([S(n.front, n.y), S(n.front - .6, n.y + .56), S(.6, n.y + .82), S(n.rear, n.y + .5), S(n.rear, n.y + .05), S(.6, n.y - .54), S(n.front - .6, n.y - .58)])}/>
        <path className="bp-internal" strokeDasharray="6 3" d={pts([S(p.z, n.y + p.radius), S(p.z, n.y - p.radius)], false)}/></>; })()}
    {/* Gear: tyres on the ground line, struts to the airframe. */}
    {a.mainGear.z.map(z => <Fragment key={z}><circle className="bp-outline" cx={S(z, 0)[0]} cy={S(0, a.groundY + a.mainGear.tyreRadius)[1]} r={a.mainGear.tyreRadius * ks}/><circle className="bp-internal" cx={S(z, 0)[0]} cy={S(0, a.groundY + a.mainGear.tyreRadius)[1]} r={a.mainGear.tyreRadius * ks * .5}/>
      <path className="bp-internal" d={pts([S(z, a.groundY + a.mainGear.tyreRadius), S(z + .1, a.groundY + a.mainGear.tyreRadius * 2 + .4)], false)}/></Fragment>)}
    <circle className="bp-outline" cx={S(a.noseGear.z, 0)[0]} cy={S(0, a.groundY + a.noseGear.tyreRadius)[1]} r={a.noseGear.tyreRadius * ks}/>
    <path className="bp-internal" d={pts([S(a.noseGear.z, a.groundY + a.noseGear.tyreRadius), S(a.noseGear.z + .05, a.groundY + a.noseGear.tyreRadius * 2 + .5)], false)}/>
    <path className="bp-ground" d={`M${S(nose, 0)[0] - 20} ${sideG}H${S(tail, 0)[0] + 20}`}/>
    {/* Fuselage stations from the nose datum. */}
    {stations.map(z => <g key={z} className="bp-station"><path d={pts([S(z, top + .2), S(z, a.groundY)], false)}/><text x={S(z, 0)[0] + 2} y={S(0, top + .1)[1]}>FS {mm(nose - z)}</text></g>)}
    {/* Length and height dimensions. */}
    <path className="bp-dimension" d={`M${S(nose, 0)[0]} ${sideG + 14}H${S(tail, 0)[0]}M${S(nose, 0)[0]} ${sideG + 8}v12M${S(tail, 0)[0]} ${sideG + 8}v12`}/>
    <text className="bp-dim-text" x={(S(nose, 0)[0] + S(tail, 0)[0]) / 2} y={sideG + 26} textAnchor="middle">OVERALL LENGTH {mm(a.dimensions.lengthM)}</text>
    <path className="bp-dimension" d={`M${S(tail, 0)[0] + 28} ${S(0, top)[1]}V${sideG}M${S(tail, 0)[0] + 22} ${S(0, top)[1]}h12`}/>
    <text className="bp-dim-text" transform={`translate(${S(tail, 0)[0] + 40} ${(S(0, top)[1] + sideG) / 2}) rotate(-90)`} textAnchor="middle">HEIGHT {mm(a.dimensions.heightM)}</text>
  </>;

  const finFront = (item: Airfoil[]) => { const r = item[0], tip = item[item.length - 1], t0 = r.tc * (r.le - r.te) * .5; return pts([F(r.h + t0, r.s), F(tip.h + .02, tip.s), F(tip.h - .02, tip.s), F(r.h - t0, r.s)]); };
  const band = (planform: Airfoil[], sideSign: number) => pts([...planform.map(st => F(sideSign * st.s, st.h + naca(.3, st.tc) * (st.le - st.te))), ...[...planform].reverse().map(st => F(sideSign * st.s, st.h - naca(.3, st.tc) * (st.le - st.te)))]);
  const front: ReactNode = <>
    {[-1, 1].map(sd => <Fragment key={sd}>
      {hasWing && <path className="bp-outline" d={band(a.wing, sd)}/>}
      {a.canard && <path className="bp-internal" d={band(a.canard, sd)}/>}
      {a.tailplane && <path className="bp-internal" d={band(a.tailplane, sd)}/>}
      {a.intake && <path className="bp-outline" d={sectionOutline(a.intake(sd)[0], F)}/>}
      {a.sponson && <path className="bp-outline" d={sectionOutline(resample(a.sponson(sd), 2)[3], F)}/>}
      {a.mainGear.z.slice(0, 1).map(z => <Fragment key={z}><rect className="bp-outline" x={F(sd * a.mainGear.x, 0)[0] - a.mainGear.tyreWidth * kf / 2} y={F(0, a.groundY + a.mainGear.tyreRadius * 2)[1]} width={a.mainGear.tyreWidth * kf} height={a.mainGear.tyreRadius * 2 * kf} rx="2"/><path className="bp-internal" d={pts([F(sd * a.mainGear.x, a.groundY + a.mainGear.tyreRadius * 2), F(sd * (a.mainGear.x - .25), a.groundY + a.mainGear.tyreRadius * 2 + .5)], false)}/></Fragment>)}
    </Fragment>)}
    <path className="bp-skin" d={sectionOutline(widest, F, 64)}/>
    {a.canopy && (() => { const c = a.canopy.reduce((best, s) => s.top > best.top ? s : best); return <path className="bp-canopy" d={pts(Array.from({ length: 25 }, (_, i) => { const [x, y] = sectionPoint(c, i / 24 * Math.PI); return F(x, y); }))}/>; })()}
    {a.fins.map((item, i) => <path key={i} className="bp-outline" d={finFront(item)}/>)}
    {rotor && <><path className="bp-outline" d={pts([F(rotor.radius, rotor.y + .02), F(-rotor.radius, rotor.y + .02)], false)}/><path className="bp-internal" d={pts([F(0, 1.3), F(0, rotor.y)], false)}/>
      <path className="bp-outline" d={pts([F(rotor.tail.x, rotor.tail.y + rotor.tail.radius), F(rotor.tail.x, rotor.tail.y - rotor.tail.radius)], false)}/></>}
    {a.engines.kind === "jet" ? jetXs.map(x => jet && <circle key={x} className="bp-internal" cx={F(x, 0)[0]} cy={F(0, jet.axisY)[1]} r={jet.radius * kf * .9} strokeDasharray="3 2"/>)
      : a.engines.kind === "turboshaft" ? a.engines.units.map(u => <circle key={u.x} className="bp-internal" cx={F(u.x, 0)[0]} cy={F(0, u.y)[1]} r={u.radius * kf} strokeDasharray="3 2"/>)
      : a.engines.nacelles.map(n => <Fragment key={n.side}><circle className="bp-outline" cx={F(n.x, 0)[0]} cy={F(0, n.y)[1]} r={.6 * kf}/>{a.engines.kind === "turboprop" && <circle className="bp-internal" cx={F(n.x, 0)[0]} cy={F(0, n.y)[1]} r={a.engines.prop.radius * kf} strokeDasharray="6 3"/>}</Fragment>)}
    {(a.noseGear.twin ? [-.17, .17] : [0]).map(x => <rect key={x} className="bp-outline" x={F(x, 0)[0] - a.noseGear.tyreWidth * kf / 2} y={F(0, a.groundY + a.noseGear.tyreRadius * 2)[1]} width={a.noseGear.tyreWidth * kf} height={a.noseGear.tyreRadius * 2 * kf} rx="2"/>)}
    <path className="bp-centerline" d={`M${fx} ${F(0, top + .3)[1]}V${fG + 6}M${F(halfSpan + .3, 0)[0]} ${F(0, widest.cy)[1]}H${F(-halfSpan - .3, 0)[0]}`}/>
    <path className="bp-dimension" d={`M${F(halfSpan, 0)[0]} ${fG + 16}H${F(-halfSpan, 0)[0]}M${F(halfSpan, 0)[0]} ${fG + 10}v12M${F(-halfSpan, 0)[0]} ${fG + 10}v12`}/>
    <text className="bp-dim-text" x={fx} y={fG + 28} textAnchor="middle">{rotor ? "ROTOR Ø" : "SPAN"} {mm(a.dimensions.spanM)}</text>
  </>;

  // Callout balloons: starboard components above the plan view, port below, centreline items
  // shared between both; each balloon sits as close as possible above/below its component.
  const centre = mapped.filter(item => Math.abs(item.layout!.position[0]) < .15).sort((p, q) => q.layout!.position[2] - p.layout!.position[2]);
  const laneOf = (item: ArchitectureComponent) => Math.abs(item.layout!.position[0]) >= .15 ? (item.layout!.position[0] > 0 ? "top" : "bottom") : centre.indexOf(item) % 2 ? "bottom" : "top";
  const balloon = new Map<string, [number, number]>();
  for (const lane of ["top", "bottom"] as const) {
    const list = mapped.filter(item => laneOf(item) === lane).map(item => ({ id: item.id, x: P(item.layout!.position[2], 0)[0] })).sort((p, q) => p.x - q.x);
    const gap = 17, lo = 52, hi = 610;
    list.forEach((item, i) => { item.x = Math.max(item.x, i ? list[i - 1].x + gap : lo); });
    // Pull back from the right edge, keeping the spacing.
    for (let i = list.length - 1; i >= 0; i--) list[i].x = Math.min(list[i].x, i === list.length - 1 ? hi : list[i + 1].x - gap);
    list.forEach(item => balloon.set(item.id, [item.x, lane === "top" ? 52 : planY + 146]));
  }
  const area = hasWing ? planformArea(a.wing) : Math.PI * (rotor?.radius ?? 0) ** 2;
  return <>
    <rect className="bp-sheet-frame" x="18" y="18" width={W - 36} height={H - 36} rx="2"/>
    <g className="bp-zones">{Array.from({ length: 8 }, (_, i) => <Fragment key={i}><text x={18 + (i + .5) * (W - 36) / 8} y="14" textAnchor="middle">{i + 1}</text><text x={18 + (i + .5) * (W - 36) / 8} y={H - 6} textAnchor="middle">{i + 1}</text></Fragment>)}
      {"ABCDEF".split("").map((letter, i) => <Fragment key={letter}><text x="8" y={18 + (i + .5) * (H - 36) / 6} textAnchor="middle">{letter}</text><text x={W - 8} y={18 + (i + .5) * (H - 36) / 6} textAnchor="middle">{letter}</text></Fragment>)}</g>
    <g className="bp-airframe" fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">{plan}{side}{front}</g>
    <g className="bp-view-labels">
      <text x="44" y="38">01 — PLAN VIEW · SCALE 1:{scale}</text><text x="44" y="378">03 — SIDE ELEVATION (STARBOARD) · SCALE 1:{scaleSide}</text><text x="640" y="38">02 — FRONT ELEVATION · SCALE 1:{scaleFront}</text>
    </g>
    {mapped.map(item => {
      const [x, , z] = item.layout!.position, [cx, cy] = P(z, x), [bx, by] = balloon.get(item.id)!;
      const [gw, gh] = glyph[item.layout!.kind], fit = Math.max(.12, Math.min(.6, item.layout!.size * k / Math.max(gw, gh)));
      const [sx, sy] = S(z, item.layout!.position[1]), sideFit = fit * ks / k;
      return <Fragment key={item.id}>
        <g className={`bp-assembly${item.attention ? " is-alert" : ""}`} data-component-id={item.id} data-attention={item.attention} data-projection="plan" style={{ color: architectureColor(item) }} role="button" tabIndex={0} aria-label={`Inspect ${item.name}: ${stateLabel[item.state]}`} onClick={() => onSelect(item.id)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); onSelect(item.id); } }}>
          <title>{item.number}. {item.name} · {stateLabel[item.state]}</title>
          <path className="bp-leader" d={`M${cx} ${cy}L${bx} ${by}`}/>
          <g transform={`translate(${cx} ${cy}) scale(${fit})`}><Assembly kind={item.layout!.kind}/></g>
          <circle className="bp-balloon" cx={bx} cy={by} r="7.5"/>
          <text className="bp-part-number" x={bx} y={by + 3} textAnchor="middle">{String(item.number).padStart(2, "0")}</text>
        </g>
        <g className={`bp-side-assembly${item.attention ? " is-alert" : ""}`} style={{ color: architectureColor(item) }} transform={`translate(${sx} ${sy}) scale(${Math.min(.6, sideFit) * .8})`} aria-hidden="true" onClick={() => onSelect(item.id)}><Assembly kind={item.layout!.kind}/></g>
      </Fragment>;
    })}
    <g className="bp-title-block">
      <path d="M640 420H882V582H640ZM640 444H882M640 474H882M640 496H882M640 518H882M640 540H882M640 562H882M760 474V582"/>
      <text x="650" y="436" className="bp-title-main">{a.title.toUpperCase()}</text>
      <text x="650" y="458">GENERAL ARRANGEMENT · THREE-VIEW</text><text x="650" y="469">{aircraftId ? `TAIL ${aircraftId} · ` : ""}SYNTHETIC FLEET RECORD</text>
      <text x="650" y="488">DWG NO</text><text x="770" y="488">{a.drawingNumber}</text>
      <text x="650" y="510">SCALE (A3)</text><text x="770" y="507">P 1:{scale} · S 1:{scaleSide}</text><text x="770" y="515">F 1:{scaleFront} (PLAN/SIDE/FRONT)</text>
      <text x="650" y="532">UNITS</text><text x="770" y="532">MILLIMETRES</text>
      <text x="650" y="554">{hasWing ? "WING AREA (MODEL)" : "ROTOR DISC AREA"}</text><text x="770" y="554">{area.toFixed(1)} m²</text>
      <text x="650" y="575">SHEET 01 OF 01 · REV C</text><text x="770" y="575">NOT FOR MANUFACTURE</text>
    </g>
    <g className="bp-notes"><text x="640" y="388">NOTES</text><text x="640" y="399">1. OVERALL DIMENSIONS PER PUBLISHED FIGURES.</text><text x="640" y="409">2. DETAIL IS A PUBLIC-DATA APPROXIMATION.</text></g>
  </>;
}
