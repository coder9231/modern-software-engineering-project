"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, Calculator, CornerDownRight, Crosshair, Orbit, Pause, Play } from "lucide-react";
import { PlanetOrb, type PlanetKind } from "./planet-orb";
import "./universe-map.css";

type Destination = "counter" | "math" | "practice" | "profile" | "about";
type World = { id: Destination; kind: PlanetKind; name: string; title: string; english: string; description: string; coordinates: string; x: number; y: number; size: number; color: string; features: string[] };

const WORLDS: World[] = [
  { id: "counter", kind: "data", name: "数据星", title: "代码统计", english: "DATA", description: "读懂每一行代码。上传源码，探索语言分布、代码与注释的组成。", coordinates: "01 / DATA OBSERVATORY", x: 23, y: 28, size: 119, color: "#8cc8ed", features: ["多语言分析", "图表与报告", "文件与目录"] },
  { id: "math", kind: "logic", name: "逻辑星", title: "四则运算", english: "LOGIC", description: "让思维沿着轨道运行。定制练习、检验答案，再向 24 点卫星发起挑战。", coordinates: "02 / LOGIC STATION", x: 75, y: 23, size: 99, color: "#eac58e", features: ["定制出题", "练习与批改", "24 点挑战"] },
  { id: "practice", kind: "build", name: "建造星", title: "工程实践", english: "BUILD", description: "从需求走向可运行的系统。沿着迭代足迹，了解设计、复用与验证。", coordinates: "03 / ENGINEERING BASE", x: 81, y: 65, size: 79, color: "#91dec6", features: ["需求与设计", "测试与验证", "持续迭代"] },
  { id: "profile", kind: "origin", name: "起源星", title: "个人主页", english: "ORIGIN", description: "每次探索，都有一个起点。这里为个人介绍、作品与学习记录留下一片空间。", coordinates: "04 / PERSONAL ORIGIN", x: 50, y: 79, size: 77, color: "#c9d2af", features: ["个人介绍", "作品展示", "资料待完善"] },
  { id: "about", kind: "archive", name: "档案星", title: "关于项目", english: "ARCHIVE", description: "保存这个宇宙的来历。了解课程项目、开源仓库，以及我们正在构建的未来。", coordinates: "05 / PROJECT ARCHIVE", x: 19, y: 69, size: 87, color: "#c7b9e8", features: ["项目背景", "开源协作", "版本记录"] },
];

const STARS = [
  [4, 13, 1], [8, 58, 2], [12, 30, 1], [15, 8, 1], [17, 47, 1], [20, 90, 1], [25, 58, 1], [29, 12, 2], [31, 42, 1], [33, 88, 1],
  [36, 29, 1], [39, 68, 1], [42, 9, 1], [44, 37, 1], [48, 62, 1], [51, 18, 2], [54, 92, 1], [57, 32, 1], [59, 71, 2], [62, 8, 1],
  [64, 48, 1], [67, 84, 1], [69, 16, 1], [72, 57, 1], [75, 92, 1], [78, 38, 2], [82, 10, 1], [85, 79, 1], [88, 48, 1], [91, 22, 1],
  [93, 65, 1], [96, 91, 1], [6, 83, 1], [11, 71, 1], [27, 76, 1], [40, 54, 1], [56, 48, 1], [65, 64, 1], [87, 33, 1], [95, 5, 1],
];

const motionStorageKey = "se-lab-universe-motion-v1";
const summaries: Record<Destination, string> = {
  counter: "源码规模，一目了然",
  math: "定制练习，检验答案",
  practice: "让设计与验证有迹可循",
  profile: "作品与学习的起点",
  about: "了解项目与开源协作",
};

export default function UniverseMap({ onNavigate }: { onNavigate: (destination: Destination) => void }) {
  const [highlighted, setHighlighted] = useState<Destination>("counter");
  const [travelling, setTravelling] = useState<Destination | null>(null);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [flightOrigin, setFlightOrigin] = useState({ x: 50, y: 50 });
  const stageRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const destination = WORLDS.find(world => world.id === highlighted) ?? WORLDS[0];
  const flight = WORLDS.find(world => world.id === travelling);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setAnimationEnabled(window.sessionStorage.getItem(motionStorageKey) !== "paused"); }
      catch { /* Storage is optional; the animation control still works. */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const cancel = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      pending.current = false;
      setTravelling(null);
    };
    const onVisibility = () => {
      setPageVisible(!document.hidden);
      if (document.hidden) cancel();
    };
    const initialVisibility = window.requestAnimationFrame(onVisibility);
    window.addEventListener("hashchange", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(initialVisibility);
      if (timer.current !== null) clearTimeout(timer.current);
      pending.current = false;
      window.removeEventListener("hashchange", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    const initialPreference = window.requestAnimationFrame(updatePreference);
    preference.addEventListener("change", updatePreference);
    return () => {
      window.cancelAnimationFrame(initialPreference);
      preference.removeEventListener("change", updatePreference);
    };
  }, []);

  function toggleAnimation() {
    const enabled = !animationEnabled;
    setAnimationEnabled(enabled);
    try { window.sessionStorage.setItem(motionStorageKey, enabled ? "playing" : "paused"); }
    catch { /* Only the current visit keeps the preference when storage is blocked. */ }
  }

  function navigate(id: Destination) {
    if (pending.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onNavigate(id);
      return;
    }
    const world = stageRef.current?.querySelector<HTMLElement>(".universe-world");
    const sphere = stageRef.current?.querySelector<HTMLElement>(`[data-destination="${id}"] .se-planet__sphere`);
    if (world && sphere) {
      const bounds = world.getBoundingClientRect();
      const target = sphere.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) setFlightOrigin({
        x: Math.max(0, Math.min(100, (target.left + target.width / 2 - bounds.left) / bounds.width * 100)),
        y: Math.max(0, Math.min(100, (target.top + target.height / 2 - bounds.top) / bounds.height * 100)),
      });
    }
    pending.current = true;
    setHighlighted(id);
    setTravelling(id);
    timer.current = setTimeout(() => {
      timer.current = null;
      pending.current = false;
      onNavigate(id);
    }, 650);
  }

  return (
    <section className={`universe-map${travelling ? " universe-map--travelling" : ""}${!animationEnabled || !pageVisible || reducedMotion ? " universe-map--paused" : ""}`} aria-labelledby="universe-heading" style={{ "--flight-x": `${flightOrigin.x}%`, "--flight-y": `${flightOrigin.y}%` } as CSSProperties}>
      <header className="universe-heading">
        <div>
          <p className="universe-eyebrow"><span /> SE LAB / 工程实践空间</p>
          <h1 id="universe-heading">让想法，<span>拥有自己的引力。</span></h1>
          <p className="universe-introduction">在代码、练习与作品之间，探索属于你的工程宇宙。</p>
        </div>
        <div className="universe-hero-actions">
          <button type="button" className="universe-hero-primary" onClick={() => navigate("counter")} disabled={travelling !== null}>开始代码统计<ArrowUpRight size={17} /></button>
          <button type="button" className="universe-hero-secondary" onClick={() => navigate("math")} disabled={travelling !== null}><Calculator size={16} />四则运算练习</button>
        </div>
      </header>

      <div className="universe-exploration">
      <div className="universe-stage" ref={stageRef}>
        <div className="universe-stage-corner universe-stage-corner--top" aria-hidden="true" />
        <div className="universe-stage-corner universe-stage-corner--bottom" aria-hidden="true" />
        <div className="universe-map-caption"><Crosshair size={14} strokeWidth={1.2} /><span>探索星图</span><i /><small>5 个目的地</small></div>
        <span className="universe-map-coordinate" aria-hidden="true">SE–001 / EXPLORATION FIELD</span>
        <button type="button" className="universe-motion-toggle" onClick={toggleAnimation} disabled={reducedMotion || travelling !== null} aria-label={reducedMotion ? "星系保持静止，已遵循系统减少动态效果设置" : animationEnabled ? "暂停星系动画" : "播放星系动画"} title={reducedMotion ? "已遵循系统减少动态效果设置" : "悬停或聚焦时稳住所选星球的位置，背景继续运行。"}>
          {animationEnabled && !reducedMotion ? <Pause size={12} strokeWidth={1.5} /> : <Play size={12} strokeWidth={1.5} />}<span>{reducedMotion ? "静止模式" : animationEnabled ? "暂停动画" : "播放动画"}</span>
        </button>
        <div className="universe-world">
          <div className="universe-nebula" aria-hidden="true" />
          <div className="universe-stars" aria-hidden="true">{STARS.map(([x, y, size], index) => <i key={index} style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, "--star-opacity": .2 + (index % 5) * .13, "--star-duration": `${4 + index % 5}s`, "--star-delay": `${-index * .73}s` } as CSSProperties} />)}</div>
          <svg className="universe-orbits" viewBox="0 0 900 560" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="se-map-orbit" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#8ac4d1" stopOpacity=".04" /><stop offset=".48" stopColor="#8ac4d1" stopOpacity=".3" /><stop offset="1" stopColor="#d7c39c" stopOpacity=".07" /></linearGradient></defs>
            <g fill="none" stroke="url(#se-map-orbit)" strokeWidth=".8">
              <ellipse cx="450" cy="275" rx="325" ry="157" transform="rotate(-19 450 275)" />
              <ellipse cx="450" cy="275" rx="230" ry="106" transform="rotate(-19 450 275)" strokeDasharray="2 7" />
              <ellipse cx="450" cy="275" rx="400" ry="204" transform="rotate(-19 450 275)" />
              <path d="M450 275 207 157M450 275 675 129M450 275 729 364M450 275 450 442M450 275 171 386" strokeDasharray="2 8" strokeOpacity=".28" />
            </g>
            <g fill="#9bd4d3" opacity=".55"><circle cx="393" cy="97" r="2" /><circle cx="628" cy="381" r="1.6" /><circle cx="345" cy="459" r="1.5" /></g>
            <g className="universe-orbit-travellers" fill="none" transform="rotate(-19 450 275)" strokeLinecap="round">
              {[{ rx: 325, ry: 157, duration: 32, delay: -8, color: "#9ddad5" }, { rx: 230, ry: 106, duration: 23, delay: -13, color: "#edcd91" }, { rx: 400, ry: 204, duration: 43, delay: -27, color: "#aebfe8" }].map(orbit => (
                <g key={orbit.rx} style={{ "--orbit-duration": `${orbit.duration}s`, "--orbit-delay": `${orbit.delay}s` } as CSSProperties} stroke={orbit.color}>
                  <ellipse className="universe-orbit-motion universe-orbit-motion--trail" cx="450" cy="275" rx={orbit.rx} ry={orbit.ry} pathLength="100" strokeWidth="1.2" strokeDasharray="6 94" />
                  <ellipse className="universe-orbit-motion universe-orbit-motion--point" cx="450" cy="275" rx={orbit.rx} ry={orbit.ry} pathLength="100" strokeWidth="3.3" strokeDasharray=".08 99.92" />
                </g>
              ))}
            </g>
          </svg>
          <div className="universe-sun" aria-hidden="true"><span className="universe-sun-halo" /><span className="universe-sun-core" /><span className="universe-sun-line" /><div><span className="universe-sun-label">YOUR IDEAS. IN ORBIT.</span><strong>SE <em>LAB</em><b>✦</b></strong><span className="universe-sun-subtitle">每个世界，都始于一个想法</span></div></div>
          {WORLDS.map((world, index) => (
            <button key={world.id} type="button" data-destination={world.id} className={`universe-planet universe-planet--${world.kind}${highlighted === world.id ? " universe-planet--highlighted" : ""}`} style={{ "--planet-x": `${world.x}%`, "--planet-y": `${world.y}%`, "--planet-size": `${world.size}px`, "--destination-color": world.color, "--drift-duration": `${24 + index * 3}s`, "--drift-delay": `${-index * 4.1}s`, "--drift-x": `${6 + index % 3 * 2}px`, "--drift-y": `${5 + index % 2 * 2}px`, "--surface-duration": `${55 + index * 11}s` } as CSSProperties} onMouseEnter={() => { if (!pending.current) setHighlighted(world.id); }} onFocus={() => { if (!pending.current) setHighlighted(world.id); }} onClick={() => navigate(world.id)} disabled={travelling !== null} aria-label={`${world.name}：${world.title}，进入${world.title}`}>
              <span className="universe-planet-visual"><span className="universe-planet-drift"><PlanetOrb kind={world.kind} />{world.id === "math" && <span className="universe-moon"><i /><span>24</span></span>}</span><span className="universe-planet-selector" /></span>
              <span className="universe-planet-label"><span className="universe-planet-number">0{index + 1}</span><span><strong>{world.title}<ArrowUpRight size={13} strokeWidth={1.3} /></strong><small>{world.name}</small></span></span>
              <span className="universe-planet-mobile-description">{summaries[world.id]}</span>
            </button>
          ))}
        </div>
        <div className="universe-stage-instruction"><Orbit size={13} strokeWidth={1.2} /><span>点击星球，进入它的世界</span><span className="universe-stage-instruction-line" /></div>
      </div>

      <aside className="universe-readout" aria-labelledby="universe-destination-heading" style={{ "--destination-color": destination.color } as CSSProperties}>
        <div className="universe-readout-heading"><span>目的地档案</span><span>{String(WORLDS.indexOf(destination) + 1).padStart(2, "0")} / 05</span></div>
        <div className="universe-readout-symbol"><PlanetOrb kind={destination.kind} /></div>
        <div className="universe-readout-content"><p>{destination.coordinates}</p><h2 id="universe-destination-heading">{destination.title}<small>{destination.name}</small></h2><p className="universe-readout-description">{destination.description}</p></div>
        <div className="universe-readout-features">{destination.features.map(feature => <span key={feature}>{feature}</span>)}</div>
        <button type="button" className="universe-enter" onClick={() => navigate(destination.id)} disabled={travelling !== null}>进入{destination.title}<ArrowUpRight size={17} strokeWidth={1.4} /></button>
        <p className="universe-readout-note">选择一颗星球，发现下一段旅程。</p>
      </aside>
      </div>

      <nav className="universe-direct-navigation" aria-label="直接进入功能"><span><CornerDownRight size={14} /> 或直接前往</span>{WORLDS.map(world => <button type="button" key={world.id} onClick={() => navigate(world.id)} disabled={travelling !== null}>{world.title}<ArrowUpRight size={13} /></button>)}</nav>
      <p className="universe-flight-status" role="status" aria-live="polite">{flight ? `正在前往${flight.name}，即将进入${flight.title}。` : ""}</p>
    </section>
  );
}
