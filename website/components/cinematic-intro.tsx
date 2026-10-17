"use client";

import { useEffect, useRef, useState } from "react";
import { PlanetOrb } from "./planet-orb";
import "./cinematic-intro.css";

type CinematicIntroProps = {
  replayToken?: number;
  onActiveChange?: (active: boolean) => void;
};

const storageKey = "se-lab-cinematic-intro-v2";
const duration = 5400;
let seenInMemory = false;

const distantStars = Array.from({ length: 82 }, (_, index) => ({
  x: (index * 367 + 47) % 1600,
  y: (index * 193 + 71) % 1000,
  radius: index % 7 === 0 ? 1.6 : index % 3 === 0 ? 1 : 0.65,
  opacity: 0.2 + (index % 5) * 0.13,
}));

/** A silent discovery of the SE Lab galaxy. Closed dialogs never cover the SSR page. */
export default function CinematicIntro({ replayToken = 0, onActiveChange }: CinematicIntroProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [staticCard, setStaticCard] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let frame = 0;
    let active = false;
    let finished = false;
    let returnFocus: HTMLElement | null = null;
    let previousOverflow = "";
    let previousOverflowPriority = "";
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const finish = () => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(frame);
      if (!active) return;

      const restoreFocus = dialog.contains(document.activeElement) || document.activeElement === document.body;
      dialog.removeEventListener("close", handleNativeClose);
      dialog.removeEventListener("cancel", handleCancel);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", finish);
      window.removeEventListener("hashchange", finish);
      motion.removeEventListener("change", handleMotion);
      if (dialog.open) dialog.close();
      if (document.body.style.getPropertyValue("overflow") === "hidden") {
        if (previousOverflow) document.body.style.setProperty("overflow", previousOverflow, previousOverflowPriority);
        else document.body.style.removeProperty("overflow");
      }
      active = false;
      onActiveChange?.(false);
      if (restoreFocus && returnFocus?.isConnected && document.activeElement !== returnFocus) {
        returnFocus.focus({ preventScroll: true });
      }
    };
    const handleNativeClose = () => { if (!dialog.open) finish(); };
    const handleCancel = (event: Event) => { event.preventDefault(); finish(); };
    const handleVisibility = () => { if (document.visibilityState !== "visible") finish(); };
    const handleMotion = () => { if (motion.matches) finish(); };
    stopRef.current = finish;

    // Defer until after hydration; no JavaScript and SSR both leave the page usable.
    frame = window.requestAnimationFrame(() => {
      const replay = replayToken !== 0;
      let seen = seenInMemory;
      try { seen ||= window.sessionStorage.getItem(storageKey) === "seen"; } catch { /* Memory is the storage fallback. */ }
      const skip = !replay && (seen || Boolean(window.location.hash) || motion.matches);
      seenInMemory = true;
      try { window.sessionStorage.setItem(storageKey, "seen"); } catch { /* A blocked storage API must not block the page. */ }
      if (skip || document.visibilityState !== "visible" || typeof dialog.showModal !== "function") return;

      setStaticCard(motion.matches);
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousOverflow = document.body.style.getPropertyValue("overflow");
      previousOverflowPriority = document.body.style.getPropertyPriority("overflow");
      try { dialog.showModal(); } catch { return; }
      active = true;
      document.body.style.setProperty("overflow", "hidden");
      dialog.addEventListener("close", handleNativeClose);
      dialog.addEventListener("cancel", handleCancel);
      document.addEventListener("visibilitychange", handleVisibility);
      window.addEventListener("pagehide", finish);
      window.addEventListener("hashchange", finish);
      motion.addEventListener("change", handleMotion);
      onActiveChange?.(true);
      skipRef.current?.focus({ preventScroll: true });

      const started = performance.now();
      const runDuration = motion.matches ? 3200 : duration;
      const tick = (timestamp: number) => {
        if (finished) return;
        if (timestamp - started >= runDuration) finish();
        else frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    });

    return () => {
      finish();
      if (stopRef.current === finish) stopRef.current = null;
    };
  }, [replayToken, onActiveChange]);

  return (
    <dialog ref={dialogRef} className="cinematic-intro" data-static={staticCard} aria-labelledby="cinematic-title" aria-describedby="cinematic-description">
      <div className="cinematic-scene">
        <p id="cinematic-description" className="cinematic-sr-only">发现 SE Lab 工程宇宙：五颗星球分别通往代码统计、四则运算、工程实践、个人主页与项目档案。无声开场将在约五秒后结束，可按 Escape 或点击按钮跳过。</p>
        <div className="cinematic-nebula" aria-hidden="true" />
        <svg className="cinematic-starfield cinematic-starfield-far" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {distantStars.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.radius} fill="currentColor" fillOpacity={star.opacity} />)}
        </svg>
        <svg className="cinematic-starfield cinematic-starfield-near" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="180" cy="255" r="1.8" /><circle cx="1390" cy="345" r="1.6" /><circle cx="1040" cy="132" r="1.8" /><circle cx="565" cy="792" r="1.7" /><circle cx="1430" cy="815" r="1.2" /><circle cx="350" cy="565" r="1.2" />
        </svg>

        <div className="cinematic-system" aria-hidden="true">
          <svg className="cinematic-gravity-lines" viewBox="0 0 1000 500" preserveAspectRatio="none">
            <path d="M-150 440C80 395 190 160 500 250" /><path d="M1150 40C920 95 830 390 500 250" /><path d="M40-90C140 90 345 140 500 250" />
          </svg>
          <div className="cinematic-orbit cinematic-orbit-one" />
          <div className="cinematic-orbit cinematic-orbit-two" />
          <div className="cinematic-orbit cinematic-orbit-three" />
          <div className="cinematic-sun"><span /></div>
          <div className="cinematic-planet cinematic-planet-data"><PlanetOrb kind="data" /><span>DATA</span></div>
          <div className="cinematic-planet cinematic-planet-logic"><PlanetOrb kind="logic" /><span>LOGIC</span></div>
          <div className="cinematic-planet cinematic-planet-build"><PlanetOrb kind="build" /><span>BUILD</span></div>
          <div className="cinematic-planet cinematic-planet-origin"><PlanetOrb kind="origin" /><span>ORIGIN</span></div>
          <div className="cinematic-planet cinematic-planet-archive"><PlanetOrb kind="archive" /><span>ARCHIVE</span></div>
          <span className="cinematic-system-coordinate">SE LAB / 00.01</span>
        </div>

        <div className="cinematic-topline" aria-hidden="true">
          <span><i /> SE / LAB <b>AN ENGINEERING UNIVERSE</b></span>
          <span className="cinematic-edition">DISCOVERY 001 <i /> EST. 2026</span>
        </div>

        <div className="cinematic-title-card">
          <p className="cinematic-kicker"><span /> A UNIVERSE OF POSSIBILITIES <span /></p>
          <h2 id="cinematic-title">SE <em>LAB</em></h2>
          <p className="cinematic-caption">每一个想法，都有自己的引力。</p>
          <p className="cinematic-subcaption">探索 · 构建 · 让想法成为现实</p>
        </div>

        <div className="cinematic-bottomline">
          <div className="cinematic-production"><span className="cinematic-production-label">FIVE WORLDS. ONE SHARED CURIOSITY.</span><span>工程宇宙 <i /> 无声探索</span></div>
          <button ref={skipRef} type="button" className="cinematic-skip" onClick={() => stopRef.current?.()} aria-label={staticCard ? "进入 SE Lab 工程宇宙" : "跳过开场动画，进入 SE Lab 工程宇宙"}>
            <span>{staticCard ? "进入宇宙" : "跳过片头"}</span><svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg><kbd>ESC</kbd>
          </button>
        </div>
        <div className="cinematic-progress" aria-hidden="true"><span /></div>
      </div>
    </dialog>
  );
}
