"use client";

import { useEffect, useId, useRef } from "react";
import "./spatial-scene.css";

type SpatialSceneProps = {
  paused?: boolean;
  activeId?: string;
  revealKey?: number;
};

const deckLines = Array.from({ length: 19 }, (_, index) => index * 50 - 450);
const ticks = Array.from({ length: 48 }, (_, index) => index * 7.5);

/** Decorative model only. The surrounding navigation owns all focus targets. */
export default function SpatialScene({ paused = false, activeId = "counter", revealKey = 0 }: SpatialSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const previousReveal = useRef(revealKey);
  const uid = `spatial-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ref = (name: string) => `url(#${uid}-${name})`;

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (previousReveal.current !== revealKey) {
      delete scene.dataset.entered;
      previousReveal.current = revealKey;
    }
    // A remembered pause preference should show the finished model instead of
    // trapping its construction at an almost invisible first animation frame.
    if (paused) scene.dataset.entered = "true";
  }, [paused, revealKey]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let intersecting = true;
    const update = () => { scene.dataset.inactive = String(!intersecting || document.visibilityState !== "visible"); };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    }, { threshold: 0.05 });
    observer?.observe(scene);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return <div ref={sceneRef} className="spatial-scene" data-paused={paused} data-active={activeId} aria-hidden="true">
    <div className="spatial-scene__art" key={revealKey}>
      <svg className="spatial-scene__drawing" viewBox="0 0 1200 850" fill="none">
        <defs>
          <pattern id={`${uid}-crosses`} width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M24 28h8M28 24v8" stroke="#9e54c0" strokeWidth="1.2" opacity=".58" />
          </pattern>
          <linearGradient id={`${uid}-deck`} x1="320" y1="410" x2="865" y2="690" gradientUnits="userSpaceOnUse">
            <stop stopColor="#37253f" /><stop offset=".42" stopColor="#754756" /><stop offset=".76" stopColor="#ee9e70" /><stop offset="1" stopColor="#ffb37c" />
          </linearGradient>
          <linearGradient id={`${uid}-side`} x1="270" y1="535" x2="923" y2="650" gradientUnits="userSpaceOnUse">
            <stop stopColor="#20152c" /><stop offset=".5" stopColor="#6b397c" /><stop offset="1" stopColor="#e777a9" />
          </linearGradient>
          <linearGradient id={`${uid}-edge`} x1="277" y1="415" x2="927" y2="705" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c4abff" /><stop offset=".38" stopColor="#fae7ff" /><stop offset=".7" stopColor="#ffd0a4" /><stop offset="1" stopColor="#ffacde" />
          </linearGradient>
          <linearGradient id={`${uid}-metal`} x1="0" y1="-90" x2="70" y2="65" gradientUnits="userSpaceOnUse">
            <stop stopColor="#b88b9f" /><stop offset=".4" stopColor="#5d4367" /><stop offset="1" stopColor="#251e38" />
          </linearGradient>
          <linearGradient id={`${uid}-pillar`} x1="0" y1="-80" x2="0" y2="25" gradientUnits="userSpaceOnUse">
            <stop stopColor="#dfa07a" /><stop offset=".65" stopColor="#a75c6e" /><stop offset="1" stopColor="#44243e" />
          </linearGradient>
          <radialGradient id={`${uid}-warm`}>
            <stop stopColor="#ffb68b" stopOpacity=".48" /><stop offset="1" stopColor="#ff947b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-violet`}>
            <stop stopColor="#a17aff" stopOpacity=".35" /><stop offset="1" stopColor="#a17aff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${uid}-deck-clip`}><ellipse cx="600" cy="530" rx="330" ry="167" /></clipPath>
          <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g className="spatial-scene__floor">
          <path d="M-120 225 600-90 1320 225 600 800Z" fill={ref("crosses")} />
          <path d="M-60 225 1260 803M-120 640 1260 35M-80 63 1240 641M-60 803 1260 225" stroke="#79516c" strokeWidth="1" opacity=".36" />
          <ellipse cx="600" cy="625" rx="385" ry="135" fill="#03020a" opacity=".45" />
          <ellipse cx="600" cy="590" rx="440" ry="205" fill={ref("violet")} />
        </g>

        <g className="spatial-scene__platform">
          <path d="M270 530V551a330 167 0 0 0 660 0v-21a330 167 0 0 1-660 0Z" fill={ref("side")} />
          <ellipse cx="600" cy="530" rx="330" ry="167" fill={ref("deck")} />
          <g clipPath={ref("deck-clip")} opacity=".19">
            {deckLines.map((line) => <path key={`a${line}`} d={`M${600 + line} 290l550 330`} stroke="#291b34" strokeWidth="1.2" />)}
            {deckLines.map((line) => <path key={`b${line}`} d={`M${600 + line} 290l-550 330`} stroke="#291b34" strokeWidth="1.2" />)}
          </g>
          <ellipse cx="600" cy="531" rx="330" ry="167" stroke={ref("edge")} strokeWidth="3" filter={ref("glow")} />
          <ellipse cx="600" cy="531" rx="311" ry="157" stroke="#ffc4cf" strokeWidth=".7" opacity=".5" />
          <path d="M313 615a330 167 0 0 0 560 12" stroke="#e5b5ff" strokeWidth="1.2" opacity=".65" />
          <ellipse cx="600" cy="509" rx="182" ry="86" fill={ref("warm")} />
          <path d="m419 553 67 32m-37-94 49 24m166-27 84-42m-13 97 56 27" stroke="#f9c89b" strokeWidth="2" opacity=".48" />
          <g className="spatial-scene__deck-sweep">
            <ellipse cx="600" cy="530" rx="320" ry="162" stroke="#ffe4c6" strokeWidth="2" strokeDasharray="105 1450" />
          </g>
        </g>

        <g transform="translate(410 430)">
          <g className="spatial-scene__module spatial-scene__module--back" data-node="practice">
            <path d="m-42 0 42-22 42 22v69L0 92l-42-23Z" fill="#33263f" />
            <path d="m-42 0 42 22 42-22L0-22Z" fill="#94778d" />
            <path d="M0 22v70l42-23V0Z" fill="#553c64" />
            <path d="m-28 12 17 9v8l-17-9Zm0 19 17 9v8l-17-9Zm0 19 17 9v8l-17-9Z" fill="#bc78a4" />
            <path d="m10 30 22-12m-22 30 22-12m-22 30 22-12" stroke="#ffbc8d" strokeWidth="3" opacity=".8" />
            <path d="M-35 1v67" stroke="#eaba94" strokeWidth="2" opacity=".7" />
            <path d="m-23-10 23-12 23 12L0 2Z" fill="#b9a4b8" />
          </g>
        </g>

        <g transform="translate(781 432)">
          <g className="spatial-scene__module spatial-scene__module--back" data-node="about">
            <path d="m-44 5 44-22 44 22v68L0 96l-44-23Z" fill="#2a2339" />
            <path d="m-44 5 44 22 44-22L0-17Z" fill="#765173" />
            <path d="M0 27v69l44-23V5Z" fill="#463253" />
            <path d="m-29 24 18 9v34l-18-9Z" fill="#a06584" />
            <path d="m10 35 23-12v8L10 43Zm0 17 23-12v8L10 60Zm0 17 23-12v8L10 77Z" fill="#e7a785" />
            <path d="m-27-4 27-14L27-4 0 10Z" fill="#c58e9e" />
          </g>
        </g>

        <g className="spatial-scene__foundation">
          <ellipse cx="600" cy="514" rx="113" ry="52" fill="#a46d76" />
          <path d="M487 504v13a113 52 0 0 0 226 0v-13a113 52 0 0 1-226 0Z" fill="#3e2a46" />
          <ellipse cx="600" cy="504" rx="113" ry="52" fill="#372c44" stroke="#d1a3b0" strokeWidth="1.2" />
          <ellipse cx="600" cy="504" rx="82" ry="36" fill="#151020" stroke="#bc7eb1" strokeWidth="1.1" />
          <ellipse cx="600" cy="502" rx="57" ry="25" fill={ref("warm")} />
          <path d="m528 464 12-36 14 7-8 39m108 0-8-39 14-7 12 36" fill={ref("pillar")} stroke="#c7959f" strokeWidth="1" />
          <path d="M543 435v35m114-35v35" stroke="#f0b68c" strokeWidth="2" filter={ref("glow")} />
          <path d="m568 528 15 7 15-7m7 0 15 7 15-7" stroke="#f4b19d" strokeWidth="2" />
        </g>

        <g transform="translate(383 555)">
          <g className="spatial-scene__module spatial-scene__module--front" data-node="counter">
            <path d="m-43 0 43-23 43 23v27L0 51l-43-24Z" fill="#42304c" />
            <path d="m-43 0 43 23 43-23L0-23Z" fill="#997182" />
            <path d="m-28-2 28-15L28-2 0 13Z" fill="#292639" stroke="#deb3a2" strokeWidth="1.5" />
            <path d="m-15-2 8-4m1 8 8-4m1 8 8-4" stroke="#f8c59d" strokeWidth="3" />
            <path d="M-36 8v14m8-10v14m8-10v14m8-10v14" stroke="#cb7ba5" strokeWidth="3" />
            <path d="m12 27 23-12" stroke="#ffce9e" strokeWidth="2" filter={ref("glow")} />
          </g>
        </g>

        <g transform="translate(795 559)">
          <g className="spatial-scene__module spatial-scene__module--front" data-node="math">
            <path d="m-47 0 47-24 47 24v28L0 52l-47-24Z" fill="#3e2742" />
            <path d="m-47 0 47 24 47-24L0-24Z" fill="#c18785" />
            <path d="m-32-1 32-16L32-1 0 16Z" fill="#362b40" stroke="#e5a7b4" strokeWidth="1.2" />
            <path d="m-12-1 24 0M0-7v12" stroke="#ffd3a4" strokeWidth="2.5" />
            <path d="m8 29 29-14v8L8 38Z" fill="#f2a082" />
            <path d="m-36 8 27 14" stroke="#ad64a0" strokeWidth="2" />
          </g>
        </g>

        <g transform="translate(595 637)">
          <g className="spatial-scene__module spatial-scene__module--front" data-node="profile">
            <path d="m-28-9 28-15 28 15v11L0 17-28 2Z" fill="#875d79" />
            <path d="m-28-9 28 14L28-9 0-24Z" fill="#e0a8a1" />
            <path d="m-17-9 17-9 17 9L0 0Z" fill="#392c48" />
            <path d="m-17-9 17-9 17 9" stroke="#f6d3ae" strokeWidth="1.5" />
          </g>
        </g>

        <g className="spatial-scene__markers" stroke="#9b719c" strokeWidth="1" opacity=".6">
          <path d="m280 486-34-17h-46m720 14 34-17h46M460 707l-22 12h-46m360-12 22 12h46" />
          <path d="M194 465v8m812-11v8m-620 245v8m440-8v8" />
        </g>
      </svg>

      <div className="spatial-scene__ring-position">
        <div className="spatial-scene__ring-reveal">
          <div className="spatial-scene__ring-turn">
            <svg viewBox="0 0 400 400" className="spatial-scene__ring-svg" fill="none">
              <defs>
                <linearGradient id={`${uid}-ring-face`} x1="70" y1="50" x2="340" y2="350" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#fbd9b5" /><stop offset=".23" stopColor="#ffb28e" /><stop offset=".52" stopColor="#764981" /><stop offset=".77" stopColor="#d69ed8" /><stop offset="1" stopColor="#fff1d4" />
                </linearGradient>
                <linearGradient id={`${uid}-ring-inner`} x1="75" y1="330" x2="340" y2="75" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ffe0a6" /><stop offset=".4" stopColor="#e099c1" /><stop offset=".7" stopColor="#8c69c8" /><stop offset="1" stopColor="#f2bc9c" />
                </linearGradient>
              </defs>
              <circle cx="206" cy="205" r="150" stroke="#38223f" strokeWidth="35" />
              <circle cx="200" cy="200" r="150" stroke={ref("ring-face")} strokeWidth="26" />
              <circle cx="200" cy="200" r="166" stroke="#f1b4ce" strokeWidth="1.2" opacity=".8" />
              <circle cx="200" cy="200" r="134" stroke={ref("ring-inner")} strokeWidth="3" />
              <g stroke="#21192e" strokeWidth="2" opacity=".6">
                {ticks.map(angle => <path key={angle} d="M200 36v12" transform={`rotate(${angle} 200 200)`} />)}
              </g>
              <circle cx="200" cy="200" r="151" stroke="#fff2c9" strokeWidth="3" strokeDasharray="145 805" strokeLinecap="round" />
              <circle cx="200" cy="200" r="135" stroke="#deb1ff" strokeWidth="2" strokeDasharray="100 749" transform="rotate(180 200 200)" />
            </svg>
          </div>
          <div className="spatial-scene__inner-ring">
            <svg viewBox="0 0 400 400" fill="none"><circle cx="200" cy="200" r="103" stroke="#d6b6fa" strokeWidth="1.2" strokeDasharray="30 15" /><circle cx="200" cy="200" r="96" stroke="#f7c5a3" strokeWidth=".8" opacity=".6" /></svg>
          </div>
          <div className="spatial-scene__core"><span /><i /><b /></div>
        </div>
      </div>

      <div className="spatial-scene__signal spatial-scene__signal--one" />
      <div className="spatial-scene__signal spatial-scene__signal--two" />
    </div>
  </div>;
}
