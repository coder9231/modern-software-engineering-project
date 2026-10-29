"use client";

import { useEffect, useRef, useState } from "react";
import "./cinematic-intro.css";

type CinematicIntroProps = {
  replayToken?: number;
  onActiveChange?: (active: boolean) => void;
};

const storageKey = "se-lab-cinematic-intro-v3";
const duration = 4200;
let seenInMemory = false;

/** A spatial ring unfolds above the workspace. Closed dialogs never cover the SSR page. */
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
        <p id="cinematic-description" className="cinematic-sr-only">SE LAB 工作空间开场。一个圆环在网格空间中旋转、分层展开，再呈现项目名称。无声开场约四秒后结束，可按 Escape 或点击按钮跳过。</p>
        <div className="cinematic-floor" aria-hidden="true">
          <svg viewBox="0 0 1200 1200" preserveAspectRatio="none">
            <defs><pattern id="cinematic-cross-grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M23 27h8m-4-4v8" /></pattern></defs>
            <rect width="1200" height="1200" fill="url(#cinematic-cross-grid)" />
            <path className="cinematic-floor-axis" d="M0 600h1200M600 0v1200" />
          </svg>
        </div>
        <div className="cinematic-light-wash" aria-hidden="true" />
        <div className="cinematic-apparatus" aria-hidden="true">
          <div className="cinematic-ring-rig">
            <div className="cinematic-ring-platform"><span /><i /></div>
            {[0, 1, 2].map(layer => <div className={`cinematic-ring-plane cinematic-ring-plane--${layer}`} key={layer}>
              <svg className="cinematic-ring-spin" viewBox="0 0 400 400">
                <circle className="cinematic-ring-edge" cx="200" cy="200" r="164" />
                <circle className="cinematic-ring-track" cx="200" cy="200" r="154" />
                <circle className="cinematic-ring-light" cx="200" cy="200" r="164" />
                <circle className="cinematic-ring-dashes" cx="200" cy="200" r="177" />
              </svg>
            </div>)}
            <div className="cinematic-ring-connections"><i /><i /><i /><i /></div>
          </div>
        </div>

        <div className="cinematic-topline" aria-hidden="true">
          <span><i /> SE / LAB <b>AN OPEN WORKSPACE</b></span>
          <span className="cinematic-edition">FORM / 001 <i /> EST. 2026</span>
        </div>

        <div className="cinematic-title-card">
          <p className="cinematic-kicker"><span /> IDEAS INTO STRUCTURE <span /></p>
          <h2 id="cinematic-title">SE <em>LAB</em></h2>
          <p className="cinematic-caption">让想法，逐步成形。</p>
          <p className="cinematic-subcaption">连接代码、练习与作品的工作空间</p>
        </div>

        <div className="cinematic-bottomline">
          <div className="cinematic-production"><span className="cinematic-production-label">A SPACE TAKING SHAPE.</span><span>旋转 <i /> 展开 <i /> 呈现</span></div>
          <button ref={skipRef} type="button" className="cinematic-skip" onClick={() => stopRef.current?.()} aria-label={staticCard ? "进入工作空间" : "跳过开场，进入工作空间"}>
            <span>{staticCard ? "进入空间" : "跳过片头"}</span><svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg><kbd>ESC</kbd>
          </button>
        </div>
        <div className="cinematic-progress" aria-hidden="true"><span /></div>
      </div>
    </dialog>
  );
}
