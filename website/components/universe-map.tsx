"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, Calculator, Code2, Info, Pause, Play, RotateCcw, UserRound } from "lucide-react";
import SpatialScene from "./spatial-scene";
import "./universe-map.css";

type Destination = "counter" | "math" | "practice" | "profile" | "about";
const DESTINATIONS = [
  { id: "counter" as Destination, title: "代码统计", english: "CODE METRICS", description: "把源码变成清楚的数据。查看代码、注释与空白行，探索语言分布，导出项目报告。", short: "读懂每一行代码", icon: Code2, color: "#ffb390" },
  { id: "math" as Destination, title: "四则运算", english: "MATH LAB", description: "定制属于你的练习。出题、作答与精确批改，在同一个工作台探索 24 点挑战。", short: "让思考自由生长", icon: Calculator, color: "#d5b0fc" },
  { id: "practice" as Destination, title: "工程实践", english: "BUILD JOURNAL", description: "从需求到可运行的软件。把设计选择、复用与验证，写进每一次迭代。", short: "记录构建的过程", icon: BookOpen, color: "#bdb7ef" },
  { id: "profile" as Destination, title: "个人主页", english: "THE CREATOR", description: "认识作品背后的创作者。这里展示个人介绍、项目作品与持续积累的学习记录。", short: "认识作品与创作者", icon: UserRound, color: "#e6aaca" },
  { id: "about" as Destination, title: "关于项目", english: "PROJECT NOTES", description: "一个持续生长的课程项目。了解项目背景、已经完成的功能与开源协作方式。", short: "了解这个工作空间", icon: Info, color: "#c5bfd7" },
];
const motionStorageKey = "se-lab-spatial-motion-v1";

export default function UniverseMap({ onNavigate, introActive = false }: {
  onNavigate: (destination: Destination) => void;
  introActive?: boolean;
}) {
  const [highlighted, setHighlighted] = useState<Destination>("counter");
  const [travelling, setTravelling] = useState<Destination | null>(null);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const destination = DESTINATIONS.find(item => item.id === highlighted) ?? DESTINATIONS[0];
  const DestinationIcon = destination.icon;
  const motionOff = reducedMotion || !animationEnabled;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(preference.matches);
    const cancelNavigation = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      pending.current = false;
      setTravelling(null);
    };
    const visibility = () => {
      setPageVisible(document.visibilityState === "visible");
      if (document.visibilityState !== "visible") cancelNavigation();
    };
    const frame = window.requestAnimationFrame(() => {
      updateMotion();
      visibility();
      try { setAnimationEnabled(window.sessionStorage.getItem(motionStorageKey) !== "paused"); }
      catch { /* The control also works when session storage is unavailable. */ }
    });
    preference.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("hashchange", cancelNavigation);
    return () => {
      window.cancelAnimationFrame(frame);
      preference.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("hashchange", cancelNavigation);
      if (timer.current !== null) clearTimeout(timer.current);
      pending.current = false;
    };
  }, []);

  function toggleAnimation() {
    const enabled = !animationEnabled;
    setAnimationEnabled(enabled);
    try { window.sessionStorage.setItem(motionStorageKey, enabled ? "playing" : "paused"); }
    catch { /* This visit still keeps the current setting. */ }
  }

  function navigate(id: Destination) {
    if (pending.current) return;
    setHighlighted(id);
    if (motionOff || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onNavigate(id);
      return;
    }
    pending.current = true;
    setTravelling(id);
    timer.current = setTimeout(() => {
      timer.current = null;
      pending.current = false;
      onNavigate(id);
    }, 420);
  }

  return <section className={`space-hub${travelling ? " space-hub--leaving" : ""}`} aria-labelledby="space-hub-title"
    data-motion={motionOff ? "off" : "on"} data-paused={!pageVisible || introActive} style={{ "--hub-accent": destination.color } as CSSProperties}>
    <div className="space-hub-frame" key={revealKey}>
      <div className="space-hub-stage">
        <header className="space-hub-hero">
          <p className="space-hub-kicker"><span /> AN OPEN SPACE FOR IDEAS</p>
          <h1 id="space-hub-title">让想法，<br /><span>逐步成形。</span></h1>
          <p className="space-hub-introduction">从一行代码开始，<br />展开你的下一次创造。</p>
        </header>
        <div className="space-hub-scene" aria-hidden="true">
          {!introActive && <SpatialScene paused={motionOff || !pageVisible || travelling !== null} activeId={highlighted} revealKey={revealKey} />}
        </div>
        <div className="space-hub-controls">
          <span className="space-hub-live"><i /> {motionOff ? "STILL FRAME" : "LIVE SPACE"}</span>
          <button type="button" onClick={toggleAnimation} aria-label={animationEnabled ? "暂停空间动态" : "播放空间动态"} aria-pressed={!animationEnabled}>
            {animationEnabled ? <Pause size={14} /> : <Play size={14} />}<span>{animationEnabled ? "暂停" : "播放"}</span>
          </button>
          <button type="button" onClick={() => setRevealKey(value => value + 1)} aria-label="重新展开空间" title="重新展开空间"><RotateCcw size={14} /></button>
        </div>
        <button className="space-hub-invitation" type="button" onClick={() => navigate(highlighted)} disabled={travelling !== null}>
          <span className="space-hub-hand-arrow" aria-hidden="true">↙</span>
          <span><small>CLICK TO EXPLORE</small><strong>{travelling ? "正在进入…" : `进入${destination.title}`}</strong><span>{destination.short}<ArrowUpRight size={15} /></span></span>
        </button>
        <div className="space-hub-coordinates" aria-hidden="true"><span>SE / LAB — 001</span><i /><span>DESIGNED TO UNFOLD</span></div>
        <div className="space-hub-index" aria-hidden="true"><span>{String(DESTINATIONS.findIndex(item => item.id === highlighted) + 1).padStart(2, "0")}</span><small>/ 05</small></div>
      </div>
      <nav className="space-hub-dock" aria-label="工作空间入口">
        {DESTINATIONS.map((item, index) => <button type="button" key={item.id}
          className={`space-hub-node${highlighted === item.id ? " is-selected" : ""}`}
          style={{ "--node-color": item.color, "--node-delay": `${1.6 + index * .12}s` } as CSSProperties}
          aria-label={`进入${item.title}`} disabled={travelling !== null}
          onMouseEnter={() => setHighlighted(item.id)} onFocus={() => setHighlighted(item.id)} onClick={() => navigate(item.id)}>
          <span className="space-hub-node-top"><small>{String(index + 1).padStart(2, "0")}</small><item.icon size={19} strokeWidth={1.5} /><ArrowUpRight size={13} /></span>
          <strong>{item.title}</strong><span className="space-hub-node-english">{item.english}</span>
        </button>)}
      </nav>
      <div className="space-hub-readout" aria-live="polite" aria-atomic="true">
        <div className="space-hub-readout-symbol"><DestinationIcon size={21} strokeWidth={1.5} /></div>
        <div><p>{destination.english}</p><h2>{destination.title}</h2></div>
        <p className="space-hub-description">{destination.description}</p>
        <button type="button" onClick={() => navigate(highlighted)} disabled={travelling !== null} aria-label={`打开${destination.title}`}>打开工作台<ArrowRight size={17} /></button>
      </div>
    </div>
    <span className="space-hub-status" role="status">{travelling ? `正在打开${DESTINATIONS.find(item => item.id === travelling)?.title}` : ""}</span>
  </section>;
}
