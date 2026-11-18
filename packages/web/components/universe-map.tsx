'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, BookOpen, Calculator, Code2, Info } from 'lucide-react';
import { CinematicArtwork } from './cinematic-intro';
import './universe-map.css';

type Destination = 'counter' | 'math' | 'practice' | 'about';
const DESTINATIONS = [
  {
    id: 'counter' as Destination,
    title: '代码统计',
    english: 'CODE METRICS',
    description: '把源码变成清楚的数据。查看代码、注释与空白行，探索语言分布，导出项目报告。',
    short: '读懂每一行代码',
    icon: Code2,
    color: '#ffb390',
  },
  {
    id: 'math' as Destination,
    title: '四则运算',
    english: 'MATH LAB',
    description: '定制属于你的练习。出题、作答与精确批改，在同一个工作台探索 24 点挑战。',
    short: '让思考自由生长',
    icon: Calculator,
    color: '#d5b0fc',
  },
  {
    id: 'practice' as Destination,
    title: '工程实践',
    english: 'BUILD JOURNAL',
    description: '从需求到可运行的软件。把设计选择、复用与验证，写进每一次迭代。',
    short: '记录构建的过程',
    icon: BookOpen,
    color: '#bdb7ef',
  },
  {
    id: 'about' as Destination,
    title: '关于项目',
    english: 'PROJECT NOTES',
    description: '一个持续生长的课程项目。了解项目背景、已经完成的功能与开源协作方式。',
    short: '了解这个工作空间',
    icon: Info,
    color: '#c5bfd7',
  },
];

const openingKey = 'se-lab-home-opening-v1';
let openingSeen = false;

export default function UniverseMap({
  onNavigate,
}: {
  onNavigate: (destination: Destination) => void;
  introActive?: boolean;
}) {
  const [phase, setPhase] = useState<'loading' | 'playing' | 'settled'>('loading');
  const [highlighted, setHighlighted] = useState<Destination | null>(null);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timeout);
      openingSeen = true;
      try {
        window.sessionStorage.setItem(openingKey, 'seen');
      } catch {
        /* Memory fallback. */
      }
      setPhase('settled');
    };
    finishRef.current = finish;
    const frame = requestAnimationFrame(() => {
      let seen = openingSeen;
      try {
        seen ||= window.sessionStorage.getItem(openingKey) === 'seen';
      } catch {
        /* Memory fallback. */
      }
      if (seen || motion.matches || document.documentElement.dataset.motion === 'still') finish();
      else {
        // Mark at playback start so leaving and returning cannot replay the opening.
        openingSeen = true;
        try {
          window.sessionStorage.setItem(openingKey, 'seen');
        } catch {
          /* Memory fallback. */
        }
        setPhase('playing');
        timeout = setTimeout(finish, 4200);
      }
    });
    const motionChanged = () => {
      if (motion.matches) finish();
    };
    const preferenceObserver = new MutationObserver(() => {
      if (document.documentElement.dataset.motion === 'still') finish();
    });
    preferenceObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion'],
    });
    motion.addEventListener('change', motionChanged);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      preferenceObserver.disconnect();
      motion.removeEventListener('change', motionChanged);
      finishRef.current = () => {};
    };
  }, []);

  return (
    <section className="home-portal" data-phase={phase} aria-labelledby="home-portal-title">
      <div className="home-cinematic" aria-hidden="true">
        <div className="cinematic-scene">
          <CinematicArtwork />
        </div>
      </div>
      <div className="home-portal-shade" aria-hidden="true" />
      {phase === 'playing' && (
        <button className="home-skip" onClick={() => finishRef.current()}>
          跳过开场 <span>↗</span>
        </button>
      )}
      <div className="home-portal-center">
        <header className="home-portal-heading">
          <p className="home-portal-eyebrow">
            <span /> YOUR NEXT IDEA STARTS HERE
          </p>
          <h1 id="home-portal-title">
            让想法，<em>逐步成形。</em>
          </h1>
          <p className="home-portal-subtitle">代码、思考与作品，在这里相遇。</p>
        </header>
        <nav className="home-portal-entries" aria-label="工作空间入口">
          {DESTINATIONS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="home-entry"
              style={{ '--entry-accent': item.color } as CSSProperties}
              aria-label={`进入${item.title}`}
              onMouseEnter={() => setHighlighted(item.id)}
              onMouseLeave={() => setHighlighted(null)}
              onFocus={() => setHighlighted(item.id)}
              onBlur={() => setHighlighted(null)}
              onClick={() => onNavigate(item.id)}
            >
              <span className="home-entry-top">
                <span>0{index + 1}</span>
                <ArrowUpRight size={16} />
              </span>
              <item.icon className="home-entry-icon" size={27} strokeWidth={1.35} />
              <strong>{item.title}</strong>
              <span className="home-entry-english">{item.english}</span>
            </button>
          ))}
        </nav>
        <p className="home-portal-caption">
          {DESTINATIONS.find((item) => item.id === highlighted)?.short ?? '选择一个入口，继续你的创造。'}
        </p>
      </div>
      <div className="home-portal-edition" aria-hidden="true">
        <span>SE LAB / OPEN WORKSPACE</span>
        <span>IDEAS INTO STRUCTURE · 2026</span>
      </div>
    </section>
  );
}
