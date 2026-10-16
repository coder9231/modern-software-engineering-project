"use client";

import { useEffect, useRef, useState } from "react";
import "./cinematic-intro.css";

type CinematicIntroProps = {
  replayToken?: number;
  onActiveChange?: (active: boolean) => void;
};

const storageKey = "se-lab-cinematic-intro-v1";
const duration = 4800;
let seenInMemory = false;

/** An original, silent film-leader opening. Closed dialogs never cover the SSR page. */
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
        <p id="cinematic-description" className="cinematic-sr-only">现代软件工程实践平台。无声开场将在约五秒后结束，可按 Escape 或点击按钮跳过。</p>
        <div className="cinematic-film-rail cinematic-film-rail-left" aria-hidden="true" />
        <div className="cinematic-film-rail cinematic-film-rail-right" aria-hidden="true" />
        <div className="cinematic-grid" aria-hidden="true" />
        <div className="cinematic-orbit" aria-hidden="true"><i /><i /><span /></div>

        <div className="cinematic-topline" aria-hidden="true">
          <span><i /> SE / LAB <b>ORIGINAL OPENING</b></span>
          <span className="cinematic-edition">VOL. 01 <i /> EST. 2026</span>
        </div>

        <div className="cinematic-countdown" aria-hidden="true">
          <div className="cinematic-countdown-cross" />
          <span className="cinematic-count cinematic-count-three">3</span>
          <span className="cinematic-count cinematic-count-two">2</span>
          <span className="cinematic-count cinematic-count-one">1</span>
          <small>A NEW TAKE ON LEARNING</small>
        </div>

        <div className="cinematic-title-card">
          <p className="cinematic-kicker"><span /> EVERY GREAT IDEA BEGINS WITH A FIRST FRAME <span /></p>
          <h2 id="cinematic-title">SE <em>LAB</em><span className="cinematic-title-dot">.</span></h2>
          <p className="cinematic-motto">BUILD <i /> LEARN <i /> IMPROVE</p>
          <div className="cinematic-divider" aria-hidden="true"><span /><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="m8 5-6 7 6 7M16 5l6 7-6 7M14 3l-4 18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg><span /></div>
          <p className="cinematic-caption">让每一次构建，都有迹可循。</p>
          <p className="cinematic-subcaption">现代软件工程 · 从想法到作品</p>
        </div>

        <div className="cinematic-bottomline">
          <div className="cinematic-production"><span className="cinematic-production-label">A SMALL TEAM. AN OPEN POSSIBILITY.</span><span>原创片头 <i /> 无声播放</span></div>
          <button ref={skipRef} type="button" className="cinematic-skip" onClick={() => stopRef.current?.()} aria-label={staticCard ? "进入 SE Lab 实验室" : "跳过开场动画，进入 SE Lab 实验室"}>
            <span>{staticCard ? "进入实验室" : "跳过片头"}</span><svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg><kbd>ESC</kbd>
          </button>
        </div>
        <div className="cinematic-progress" aria-hidden="true"><span /></div>
      </div>
    </dialog>
  );
}
