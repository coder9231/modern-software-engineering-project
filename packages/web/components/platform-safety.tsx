'use client';
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import './platform-safety.css';

export class PlatformBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SE Lab render error', error.name, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="platform-fallback" role="alert">
          <h1>这个工作空间遇到了一点问题。</h1>
          <p>刷新后可以重试。已保存在当前浏览器中的练习记录不会被此操作删除。</p>
          <button onClick={() => location.reload()}>重新打开页面</button>
        </main>
      );
    return this.props.children;
  }
}

export default function PlatformPreferences() {
  const [contrast, setContrast] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let storedContrast = false;
      let storedMotion: string | null = null;
      try {
        storedContrast = localStorage.getItem('se-lab-contrast') === 'high';
        storedMotion = localStorage.getItem('se-lab-motion');
      } catch {
        /* Optional settings storage. */
      }
      const device = navigator as Navigator & { deviceMemory?: number };
      const limited =
        (device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 2) ||
        (device.deviceMemory !== undefined && device.deviceMemory <= 2);
      const pause = storedMotion === 'still' || (storedMotion !== 'full' && limited);
      setContrast(storedContrast);
      setStill(pause);
      document.documentElement.dataset.contrast = storedContrast ? 'high' : 'normal';
      document.documentElement.dataset.motion = pause ? 'still' : 'full';
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function update(kind: 'contrast' | 'motion') {
    if (kind === 'contrast') {
      setContrast(!contrast);
      document.documentElement.dataset.contrast = !contrast ? 'high' : 'normal';
      try {
        localStorage.setItem('se-lab-contrast', !contrast ? 'high' : 'normal');
      } catch {
        /* Optional storage. */
      }
    } else {
      setStill(!still);
      document.documentElement.dataset.motion = !still ? 'still' : 'full';
      try {
        localStorage.setItem('se-lab-motion', !still ? 'still' : 'full');
      } catch {
        /* Optional storage. */
      }
    }
  }
  return (
    <aside className="platform-preferences" aria-label="显示设置">
      <details>
        <summary aria-label="显示设置">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-6 1v4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span>显示设置</span>
        </summary>
        <div>
          <button aria-pressed={contrast} onClick={() => update('contrast')}>
            高对比度{contrast ? '：开' : '：关'}
          </button>
          <button aria-pressed={still} onClick={() => update('motion')}>
            静态画面{still ? '：开' : '：关'}
          </button>
          <p>系统减少动态效果设置始终优先。低性能设备默认使用静态画面。</p>
        </div>
      </details>
    </aside>
  );
}
