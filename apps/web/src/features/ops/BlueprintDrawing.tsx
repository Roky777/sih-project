import { Fragment } from "react";
import type { ArchitectureComponent, StructureKind } from "./componentArchitecture";
import { architectureColor } from "./componentArchitecture";
import { stateLabel } from "./format";

// Authored conceptual projections, not installation coordinates or measured dimensions.
const sizes: Record<StructureKind, [number, number]> = {
  compressor: [100, 36], turbine: [62, 34], reservoir: [29, 17], valve: [28, 16],
  pump: [25, 21], actuator: [52, 12], filter: [29, 16], generator: [35, 20],
  electronics: [30, 20], battery: [31, 20], brake: [22, 19], strut: [42, 11],
  tyre: [22, 18], sensor: [25, 9], cooling: [32, 22],
};
const locations: Record<string, [number, number]> = {
  "AVN-SNS": [135, 269], "AVN-FCC": [215, 269], "AVN-DSP": [266, 265], "ECS-PRC": [307, 250],
  "ELE-BUS": [344, 249], "ELE-BAT": [344, 291], "HYD-FLT": [389, 247], "HYD-PMP": [425, 247],
  "ECS-PCK": [389, 292], "ELE-GEN": [441, 294], "ENG-CMP": [472, 270], "ENG-TRB": [569, 270],
  "ENG-OIL": [508, 237], "ENG-FCU": [508, 304], "HYD-ACT": [560, 178], "FUE-QTY": [562, 370],
  "FUE-BST": [510, 354], "LG-BRK": [503, 208], "LG-TYR": [503, 332], "LG-STR": [277, 290],
};
function Assembly({ kind }: { kind: StructureKind }) {
  const [w, h] = sizes[kind];
  const engine = kind === "compressor" || kind === "turbine";
  const round = ["pump", "generator", "brake", "tyre", "reservoir", "filter"].includes(kind);
  return <>
    {engine ? <path className="bp-part-fill" d={`M${-w/2} ${-h*.34}Q0 ${-h*.65} ${w/2} ${-h*.34}V${h*.34}Q0 ${h*.65} ${-w/2} ${h*.34}Z`}/>
      : <rect className="bp-part-fill" x={-w/2} y={-h/2} width={w} height={h} rx={round ? h*.3 : 2}/>}
    <g className="bp-part-detail" fill="none" strokeWidth=".65">
      {engine ? <>
        <path d={`M${-w/2-5} 0H${w/2+5} M${-w/2+4} ${-h*.34}V${h*.34}M${w/2-4} ${-h*.34}V${h*.34}`}/>
        {Array.from({length:kind === "compressor" ? 9 : 5},(_,i) => {
          const x = -w*.36+i*w*.72/(kind === "compressor" ? 8 : 4);
          return <path key={i} d={`M${x-2} ${-h*.38}L${x+2} ${h*.38}M${x+2} ${-h*.38}L${x-2} ${h*.38}`}/>;
        })}
      </> : kind === "electronics" ? <><rect x="-10" y="-6" width="20" height="12" rx="1"/><path d="M-6-3h8v6h-8Z M5-3h3M5 0h3M5 3h3M-13-4h3m-3 4h3m-3 4h3M10-4h3m-3 4h3m-3 4h3"/></>
        : kind === "battery" ? <path d="M-10-6h5v12h-5Zm7 0h5v12h-5Zm7 0h5v12H4ZM-7-10v4M7-10v4"/>
          : kind === "cooling" ? <>{Array.from({length:8},(_,i)=><path key={i} d={`M${-11+i*3}-8V8`}/>)}<path d="M-17-7h6M11 7h6"/></>
            : ["actuator", "strut"].includes(kind) ? <path d={`M${-w*.3}-3H${w*.22}V3H${-w*.3}Z M${w*.22}-1H${w*.68}V1H${w*.22} M${-w*.6}-3v6M${w*.7}-3v6`}/>
              : ["brake", "tyre"].includes(kind) ? <><ellipse rx="7" ry="7"/><ellipse rx="3" ry="3"/><path d="M-11 0h5M6 0h5M0-9v3M0 6v3"/></>
                : kind === "sensor" ? <path d="M-15 0H15M-6-3v6M7-3v6"/>
                  : kind === "valve" ? <path d="M-10 0H10M-5-6V6M5-6V6M0-10v4M0 6v4"/>
                    : kind === "reservoir" ? <path d="M-9-5H9M-9 5H9M0-8V8M-3-10h6"/>
                      : kind === "filter" ? <>{[-8,-4,0,4,8].map(x=><path key={x} d={`M${x}-6V6`}/>)}<path d="M-18 0h6M12 0h6"/></>
                        : <><ellipse rx="7" ry="7"/><path d="M-5-5L5 5M5-5L-5 5M-17 0h6M11 0h6"/></>}
    </g>
  </>;
}
export function BlueprintDrawing({ components, onSelect }: { components: ArchitectureComponent[]; onSelect: (id: string) => void }) {
  const mapped = components.filter(item => item.layout);
  return <>
    <rect className="bp-sheet-frame" x="18" y="18" width="864" height="564" rx="2"/>
    <g className="bp-airframe" fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
      {/* Symmetrical delta-wing plan: smooth skin, distinct leading/trailing edges and elevons. */}
      <path className="bp-skin" d="M89 270Q160 249 220 243L320 239Q344 220 370 209L422 178L574 78L593 80L614 224L624 241L659 248V291L624 298L614 315L593 459L574 461L422 362L370 331Q344 320 320 301L220 297Q160 292 89 270Z"/>
      <path className="bp-outline" d="M89 270Q168 256 223 254L335 251Q372 238 426 237L582 241L636 248L659 248V291H636L582 298L426 303Q372 302 335 290L223 286Q168 283 89 270Z"/>
      <path className="bp-outline" d="M320 239L422 178L574 78L593 80L614 224L624 241M320 301L422 362L574 461L593 459L614 315L624 298"/>
      <path d="M348 237L436 200L581 104L598 216L608 242M348 303L436 341L581 435L598 323L608 298 M437 200L474 237M437 341L474 303 M553 123L574 238M553 416L574 301"/>
      <path d="M455 189L562 119L580 211L477 231ZM455 351L562 421L580 329L477 309Z" className="bp-internal"/>
      {[0,1,2,3,4,5,6].map(i=><path key={i} className="bp-internal" d={`M${452+i*18} ${192-i*12}L${475+i*17} 232 M${452+i*18} ${348+i*12}L${475+i*17} 308`}/>)}
      <path d="M573 190L603 215L608 242L582 238ZM573 350L603 325L608 298L582 302Z M638 249V291M645 249V291M651 249V291"/>
      {/* Cockpit glazing, two canopy hoops, ejection seat and instrument hood. */}
      <path className="bp-canopy" d="M231 269Q232 250 255 248H291Q316 250 325 269Q312 287 286 288H256Q234 285 231 269Z"/>
      <path d="M249 249Q240 269 249 287M293 249Q307 269 293 287M257 257h22v24h-22ZM260 260h16v6h-16ZM261 270l13 7m0-7-13 7M315 263v13M320 265v9"/>
      <path className="bp-internal" d="M194 257V283M224 254V286M335 251V290M368 244V297M409 238V302M541 240V300M616 244V295 M93 270H673"/>
      <path className="bp-centerline" d="M65 270H680 M277 229V310"/>
      {/* Front elevation: airframe cross-section, intake lips and extended landing gear. */}
      <g transform="translate(767 174)">
        <path className="bp-outline" d="M0-65L5-25Q22-19 24 3L87 9L91 13L45 23L17 15Q0 30-17 15L-45 23L-91 13L-87 9L-24 3Q-22-19-5-25Z"/>
        <ellipse cy="-7" rx="12" ry="18"/><path d="M-9-17Q0-29 9-17M-8-6H8V7H-8ZM-23 2L-30 13L-16 13M23 2L30 13L16 13 M-38 20V48M38 20V48M0 23V57"/>
        <rect x="-43" y="43" width="10" height="19" rx="4"/><rect x="33" y="43" width="10" height="19" rx="4"/><rect x="-4" y="54" width="8" height="16" rx="3"/>
        <path className="bp-centerline" d="M-98 0H98M0-73V77"/>
      </g>
      {/* Side elevation with intake, canopy, fin, nozzle and actual wheel silhouettes. */}
      <g transform="translate(0 502)">
        {/* Preserve vertical proportions: a deep intake/wing root rather than a flattened tube. */}
        <path className="bp-skin" d="M89 27Q143 10 216 8L241 4Q252-15 277-16Q301-15 319 7L433 11Q490 11 547 18L570-27L585-29L607 20L638 23H659V41L627 44L578 46L492 45L427 49L335 48L283 44L221 39Q157 36 89 27Z"/>
        <path className="bp-outline" d="M89 27Q143 10 216 8L241 4Q252-15 277-16Q301-15 319 7L433 11Q490 11 547 18L570-27L585-29L607 20L638 23H659V41L627 44L578 46L492 45L427 49L335 48L283 44L221 39Q157 36 89 27Z"/>
        {/* Radome break, canopy sill, windscreen and reclining ejection seat. */}
        <path d="M190 12Q184 26 191 37M244 7Q257-10 277-10Q297-9 311 9L319 15H238Z M258-7L253 10M292-7L300 11M271-3l-6 9h15l5-9Z M263 8v6h24M307 11l7 2 M221 39L238 15"/>
        {/* Splitter plate and intake fairing; swept wing and elevon visible in profile. */}
        <path className="bp-outline" d="M331 20L370 18L421 32L411 44L335 42Z M337 22V39 M356 20L353 41 M375 31L480 24L565 41L489 49L391 45Z"/>
        <path d="M381 34L479 29L542 41L486 45L402 42 M487 45L492 49M536 22L577 24L620 36L578 40 M552 17L576-23L583-24L598 19M638 23V43M645 23V42M651 23V42"/>
        {/* Extended gear: doors, twin-line oleos, fork and circular tyres on one ground line. */}
        <path d="M265 43H286L292 48H267Z M276 46L282 60M279 46L285 59M283 57L290 62 M494 47H522L529 51H499Z M505 49L513 58M509 49L518 58M513 56H524V62"/>
        <circle cx="288" cy="62" r="7"/><circle cx="288" cy="62" r="3"/><circle cx="521" cy="59" r="10"/><circle cx="521" cy="59" r="4"/>
        <path className="bp-internal" d="M269 69H536 M434 12V22M464 13V23M610 22V43"/>
        <path className="bp-centerline" d="M65 27H680"/>
      </g>
      <path className="bp-dimension" d="M77 83V457M72 83H82M72 457H82M92 430H659M92 425V435M659 425V435"/>
    </g>
    <g className="bp-view-labels"><text x="44" y="46">01 — PLAN / ASSEMBLY LAYOUT</text><text x="694" y="46">02 — FRONT ELEVATION</text><text x="44" y="467">03 — SIDE ELEVATION</text><text x="256" y="221">PILOT CABIN</text></g>
    {mapped.map(item => {
      const [x,y] = locations[item.type] ?? [400-item.layout!.position[2]*56,270+item.layout!.position[0]*59];
      const [w,h] = sizes[item.layout!.kind];
      return <Fragment key={item.id}>
        <g className={`bp-assembly${item.attention ? " is-alert" : ""}`} data-component-id={item.id} data-attention={item.attention} data-projection="plan" style={{color:architectureColor(item)}} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`Inspect ${item.name}: ${stateLabel[item.state]}`} onClick={()=>onSelect(item.id)} onKeyDown={event=>{if(["Enter"," "].includes(event.key)){event.preventDefault();onSelect(item.id);}}}>
          <title>{item.number}. {item.name} · {stateLabel[item.state]}</title><Assembly kind={item.layout!.kind}/>
          <text className="bp-part-number" x={-w/2} y={-h/2-5}>{String(item.number).padStart(2,"0")}</text>
        </g>
        {["ENG-CMP","ENG-TRB"].includes(item.type) && <g className={`bp-side-assembly${item.attention ? " is-alert" : ""}`} style={{color:architectureColor(item)}} transform={`translate(${x} 532) scale(1 .72)`} aria-hidden="true" onClick={()=>onSelect(item.id)}><Assembly kind={item.layout!.kind}/></g>}
      </Fragment>;
    })}
    <g className="bp-title-block"><path d="M694 448H864V567H694ZM694 477H864M694 537H864M799 537V567"/><text x="706" y="467">AIRFRAME INSPECTION</text><text x="706" y="497">SYNTHETIC ASSEMBLIES</text><text x="706" y="513">CONCEPTUAL · NOT TO SCALE</text><text x="706" y="555">SHEET 01</text><text x="811" y="555">REV B</text></g>
  </>;
}
