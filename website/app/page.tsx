"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Calculator, Check, Orbit, UserRound, ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, Code2, Download, FileCode2, Files, FolderOpen, GitBranch as Github, Info, Layers, LoaderCircle, Menu, Play, RotateCcw, Search, Settings2, ShieldCheck, Terminal, Upload, X } from "lucide-react";
import { formatReport } from "../lib/code-counter/report.mjs";
import MathWorkspace from "../components/math-workspace";
import CinematicIntro from "../components/cinematic-intro";
import UniverseMap from "../components/universe-map";
import OriginProfile from "../components/origin-profile";
import { PlanetOrb } from "../components/planet-orb";
import "../components/universe-shell.css";

type Counts = { files: number; total: number; code: number; comment: number; blank: number };
type FileCount = Omit<Counts, "files"> & { path: string; language: string };
type LanguageCount = Counts & { language: string };
type Report = { version: 1; input: string; generatedAt: string; totals: Counts; languages: LanguageCount[]; files: FileCount[]; skipped: { path: string; reason: string }[]; errors: { path: string; message: string }[] };
type Config = { languages: { name: string; extensions: string[] }[]; defaultExcludes: string[]; limits: { maxFilesPerBatch: number; maxBytesPerBatch: number; maxFileBytes: number }; rules: string[] };
type Selected = { path: string; file: File };
type Recent = { name: string; date: string; files: number; code: number };
type Section = "counter" | "math" | "overview" | "practice" | "about" | "profile";
const zero: Counts = { files: 0, total: 0, code: 0, comment: 0, blank: 0 };
const repo = "https://github.com/coder9231/modern-software-engineering-project";
const storageKey = "se-lab-count-history-v1";
const palette = ["#217c65", "#508fbd", "#d6a958", "#8a79b1", "#73a7a0", "#a3afbd"];
const number = (value: number) => value.toLocaleString("zh-CN");
const byteSize = (value: number) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`;
const when = (value: string) => new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const reasonText: Record<string, string> = { unsupported: "不支持的文件类型", unsupported_extension: "不支持的文件类型", excluded: "符合目录排除规则", excluded_extension: "不在扩展名筛选范围", extension_filter: "不在扩展名筛选范围", binary: "二进制文件", binary_file: "二进制文件", too_large: "超过单文件 4 MB 限制", empty: "空文件", symlink: "符号链接", symbolic_link: "符号链接", unsupported_file_type: "不支持的特殊文件", invalid_encoding: "无法按所选编码读取，请尝试切换文件编码" };

function emptyReport(input: string): Report {
  return { version: 1, input, generatedAt: new Date().toISOString(), totals: { ...zero }, languages: [], files: [], skipped: [], errors: [] };
}

function mergeReport(target: Report, incoming: Report) {
  for (const key of Object.keys(zero) as (keyof Counts)[]) target.totals[key] += incoming.totals[key];
  for (const language of incoming.languages) {
    const existing = target.languages.find((item) => item.language === language.language);
    if (existing) for (const key of Object.keys(zero) as (keyof Counts)[]) existing[key] += language[key];
    else target.languages.push({ ...language });
  }
  target.files.push(...incoming.files);
  target.skipped.push(...incoming.skipped);
  target.errors.push(...incoming.errors);
}

function errorMessage(value: unknown, fallback: string) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") return value.message;
  return fallback;
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
  return btoa(binary);
}

export default function Home() {
  const [introReplay, setIntroReplay] = useState(0);
  const [introActive, setIntroActive] = useState(false);
  const [section, setSection] = useState<Section>("overview");
  const [mapVisit, setMapVisit] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState(false);
  const [configRetry, setConfigRetry] = useState(0);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [encoding, setEncoding] = useState("auto");
  const [useDefaultExcludes, setUseDefaultExcludes] = useState(true);
  const [excludes, setExcludes] = useState("");
  const [extensionOption, setExtensionOption] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [reportName, setReportName] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [tab, setTab] = useState("files");
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<Recent[]>([]);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const navigationFrame = useRef<number | null>(null);

  useEffect(() => {
    const restoreSection = () => {
      const target = window.location.hash.slice(1);
      setSection(target === "counter" || target === "math" || target === "practice" || target === "about" || target === "profile" ? target : "overview");
      setMobileNav(false);
    };
    const frame = window.requestAnimationFrame(restoreSection);
    window.addEventListener("hashchange", restoreSection);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", restoreSection);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/code-count/config", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("configuration failed");
      setConfig(await response.json() as Config);
    }).catch((failure) => { if (failure.name !== "AbortError") setConfigError(true); });
    return () => controller.abort();
  }, [configRetry]);

  useEffect(() => {
    // Restore optional local summaries after the first paint, keeping server hydration stable.
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (Array.isArray(saved)) setHistory(saved.filter((item) => item && typeof item.name === "string" && typeof item.date === "string" && Number.isFinite(item.files) && Number.isFinite(item.code)).slice(0, 4));
      } catch { /* Browsers may disable local storage. Counting remains available. */ }
    });
    return () => { window.cancelAnimationFrame(frame); if (navigationFrame.current !== null) window.cancelAnimationFrame(navigationFrame.current); abortRef.current?.abort(); };
  }, []);

  const selectedBytes = useMemo(() => selected.reduce((total, item) => total + item.file.size, 0), [selected]);
  const filteredFiles = useMemo(() => (report?.files || []).filter((item) => (!languageFilter || item.language === languageFilter) && item.path.toLowerCase().includes(search.toLowerCase())), [report, languageFilter, search]);
  const skippedFiles = useMemo(() => (report?.skipped || []).filter((item) => item.path.toLowerCase().includes(search.toLowerCase())), [report, search]);
  const errorFiles = useMemo(() => (report?.errors || []).filter((item) => item.path.toLowerCase().includes(search.toLowerCase())), [report, search]);
  const rowCount = tab === "files" ? filteredFiles.length : tab === "skipped" ? skippedFiles.length : errorFiles.length;
  const pageCount = Math.max(1, Math.ceil(rowCount / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleFiles = filteredFiles.slice((currentPage - 1) * 10, currentPage * 10);
  const visibleSkipped = skippedFiles.slice((currentPage - 1) * 10, currentPage * 10);
  const visibleErrors = errorFiles.slice((currentPage - 1) * 10, currentPage * 10);
  const distribution = report && report.totals.total > 0 ? `conic-gradient(#217c65 0 ${(report.totals.code / report.totals.total) * 100}%, #72ac99 ${(report.totals.code / report.totals.total) * 100}% ${((report.totals.code + report.totals.comment) / report.totals.total) * 100}%, #e1e8e5 ${((report.totals.code + report.totals.comment) / report.totals.total) * 100}% 100%)` : "#edf1ef";

  function navigate(next: Section) {
    setMapVisit((visit) => visit + 1);
    setSection(next);
    setMobileNav(false);
    if (window.location.hash !== `#${next}`) window.history.pushState(window.history.state, "", `${window.location.pathname}${window.location.search}#${next}`);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (navigationFrame.current !== null) window.cancelAnimationFrame(navigationFrame.current);
    navigationFrame.current = window.requestAnimationFrame(() => { workspaceRef.current?.focus({ preventScroll: true }); navigationFrame.current = null; });
  }

  function pickFiles(fileList: FileList | File[], folder = false) {
    const incoming = Array.from(fileList);
    if (!incoming.length) return;
    let commonRoot = "";
    if (folder) {
      const roots = incoming.map((file) => file.webkitRelativePath.split("/")[0]);
      if (roots.every((root) => root === roots[0])) commonRoot = roots[0];
    }
    const unique = new Map<string, Selected>();
    for (const file of incoming) {
      const originalPath = file.webkitRelativePath || file.name;
      const path = commonRoot && originalPath.startsWith(`${commonRoot}/`) ? originalPath.slice(commonRoot.length + 1) : originalPath;
      if (!unique.has(path)) unique.set(path, { path, file });
    }
    setSelected([...unique.values()]);
    setSourceName(commonRoot || (incoming.length === 1 ? incoming[0].name : `${unique.size} 个文件`));
    setError("");
    setNotice(`已选择 ${number(unique.size)} 个文件${unique.size < incoming.length ? "，同名路径已去重" : ""}，点击「开始统计」生成报告。`);
  }

  function onInput(event: ChangeEvent<HTMLInputElement>, folder = false) {
    if (event.target.files) pickFiles(event.target.files, folder);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    if (Array.from(event.dataTransfer.items).some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
      setError("请使用「选择文件夹」导入整个目录，以完整保留目录结构。");
      return;
    }
    pickFiles(event.dataTransfer.files);
  }

  function remember(result: Report, name: string) {
    setHistory((previous) => {
      const next = [{ name, date: result.generatedAt, files: result.totals.files, code: result.totals.code }, ...previous].slice(0, 4);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Optional browser-local history. */ }
      return next;
    });
  }

  function showResult(result: Report, name: string, demo: boolean) {
    result.languages.sort((a, b) => b.code - a.code || a.language.localeCompare(b.language));
    result.files.sort((a, b) => a.path.localeCompare(b.path));
    setReport(result);
    setReportName(name);
    setIsDemo(demo);
    setSearch("");
    setLanguageFilter("");
    setTab("files");
    setPage(1);
    if (!demo) remember(result, name);
  }

  async function analyze() {
    if (!selected.length || !config || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    setProgress({ done: 0, total: selected.length });
    setReport(null);
    setIsDemo(false);
    const result = emptyReport(sourceName);
    const knownExtensions = new Set(config.languages.flatMap((language) => language.extensions.map((ext) => ext.toLowerCase().replace(/^\.?/, "."))));
    const wantedExtensions = config.languages.find((language) => language.name === extensionOption)?.extensions || [];
    const options = { encoding, exclude: excludes.split(/[\n,，]/).map((value) => value.trim()).filter(Boolean), useDefaultExcludes, extensions: wantedExtensions };
    let chunk: { path: string; contentBase64: string }[] = [];
    let chunkBytes = 0;
    let completed = 0;
    async function sendChunk() {
      if (!chunk.length) return;
      const count = chunk.length;
      const response = await fetch("/api/code-count", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: chunk, options }), signal: controller.signal });
      const payload = await response.json() as Report & { error?: unknown };
      if (!response.ok) throw new Error(errorMessage(payload.error, `统计请求失败（${response.status}）`));
      mergeReport(result, payload);
      completed += count;
      setProgress({ done: completed, total: selected.length });
      chunk = [];
      chunkBytes = 0;
    }
    try {
      for (const item of selected) {
        if (controller.signal.aborted) throw new DOMException("cancelled", "AbortError");
        const lastDot = item.path.lastIndexOf(".");
        const supported = lastDot >= 0 && knownExtensions.has(item.path.slice(lastDot).toLowerCase());
        if (supported && item.file.size > config.limits.maxFileBytes) {
          result.skipped.push({ path: item.path, reason: "too_large" });
          completed += 1;
          setProgress({ done: completed, total: selected.length });
          continue;
        }
        const bytes = supported ? item.file.size : 0;
        if (chunk.length >= config.limits.maxFilesPerBatch || (chunk.length > 0 && chunkBytes + bytes > config.limits.maxBytesPerBatch)) await sendChunk();
        let contentBase64 = "";
        if (supported) {
          try { contentBase64 = toBase64(await item.file.arrayBuffer()); }
          catch {
            if (controller.signal.aborted) throw new DOMException("cancelled", "AbortError");
            result.errors.push({ path: item.path, message: "无法读取文件，请重新选择后重试。" });
            completed += 1;
            setProgress({ done: completed, total: selected.length });
            continue;
          }
        }
        if (controller.signal.aborted) throw new DOMException("cancelled", "AbortError");
        chunk.push({ path: item.path, contentBase64 });
        chunkBytes += bytes;
      }
      await sendChunk();
      if (controller.signal.aborted) throw new DOMException("cancelled", "AbortError");
      result.generatedAt = new Date().toISOString();
      showResult(result, sourceName, false);
      setNotice(result.errors.length ? `已统计 ${number(result.totals.files)} 个源码文件；${number(result.errors.length)} 个文件读取失败，结果不完整，请查看「异常」。` : result.totals.files ? `统计完成：${number(result.totals.files)} 个源码文件，${number(result.totals.total)} 行。` : "处理完成，没有符合当前条件的源码文件。请查看跳过记录或调整筛选条件。");
    } catch (failure) {
      if (failure instanceof Error && failure.name === "AbortError") setNotice("统计已取消。未生成本次报告，可重新开始。");
      else setError(errorMessage(failure, "统计未完成，请重试。"));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function loadDemo() {
    if (busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    setNotice("正在读取示例项目…");
    setProgress({ done: 0, total: 0 });
    try {
      const response = await fetch("/api/code-count/demo", { signal: controller.signal });
      const data = await response.json() as Report & { error?: unknown };
      if (!response.ok) throw new Error(errorMessage(data.error, "示例加载失败"));
      showResult(data, "示例项目", true);
      setNotice("正在查看内置示例的真实统计结果。选择你的项目，即可生成自己的报告。");
    } catch (failure) {
      if (failure instanceof Error && failure.name === "AbortError") setNotice("已取消加载示例。");
      else setError(errorMessage(failure, "示例加载失败，请稍后重试。"));
    } finally { setBusy(false); abortRef.current = null; }
  }

  async function exportReport(format: "json" | "csv") {
    if (!report || exporting) return;
    setExporting(format);
    setError("");
    try {
      const requestBody = JSON.stringify({ format, report });
      const largeReport = [report.files, report.skipped, report.errors].some((rows) => rows.length > 20000) || new Blob([requestBody]).size > 6 * 1024 * 1024;
      let blob: Blob;
      if (largeReport) {
        // Large aggregated reports reuse the same pure serializer without an extra upload.
        blob = new Blob([formatReport(report, format)], { type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" });
      } else {
        const response = await fetch("/api/code-count/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody });
        if (!response.ok) { const payload = await response.json() as { error?: unknown }; throw new Error(errorMessage(payload.error, "导出失败")); }
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `code-count-${new Date(report.generatedAt).toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`${format.toUpperCase()} 报告已导出。${largeReport ? "报告较大，已在当前浏览器生成完整文件。" : ""}`);
    } catch (failure) { setError(errorMessage(failure, "导出失败，请重试。")); }
    finally { setExporting(""); }
  }

  function reset() {
    setSelected([]); setSourceName(""); setReport(null); setReportName(""); setNotice(""); setError(""); setIsDemo(false); setSearch(""); setLanguageFilter(""); setPage(1); setEncoding("auto"); setUseDefaultExcludes(true); setExcludes(""); setExtensionOption("");
  }

  const navItems = [
    { id: "overview" as Section, label: "星系总览", planet: "SE LAB UNIVERSE", icon: Orbit },
    { id: "counter" as Section, label: "代码统计", planet: "数据星", icon: BarChart3 },
    { id: "math" as Section, label: "四则运算", planet: "逻辑星", icon: Calculator },
    { id: "practice" as Section, label: "工程实践", planet: "建造星", icon: BookOpen },
    { id: "profile" as Section, label: "个人主页", planet: "起源星", icon: UserRound },
    { id: "about" as Section, label: "关于项目", planet: "档案星", icon: Info },
  ];
  const activeLabel = navItems.find((item) => item.id === section)?.label;
  const currentPlanet = ({ counter: { name: "数据星", kind: "data", sector: "01 / DATA" }, math: { name: "逻辑星", kind: "logic", sector: "02 / LOGIC" }, practice: { name: "建造星", kind: "build", sector: "03 / BUILD" }, profile: { name: "起源星", kind: "origin", sector: "04 / ORIGIN" }, about: { name: "档案星", kind: "archive", sector: "05 / ARCHIVE" } } as const)[section === "overview" ? "counter" : section];

  return <><CinematicIntro replayToken={introReplay} onActiveChange={setIntroActive} /><div className={`app-shell space-shell ${section === "overview" ? "is-universe" : "in-planet"}`} id="se-lab-content">
    {mobileNav && <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}
    <aside id="planet-navigation" className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <button className="brand" onClick={() => navigate("overview")} aria-label="返回 SE Lab 星系总览"><span className="brand-mark"><Code2 size={25} strokeWidth={2} /></span><span><strong>SE Lab<span className="brand-dot">.</span></strong><small>软件工程 · 探索宇宙</small></span></button>
      <div className="workspace-label">探索目的地 <span>DESTINATIONS</span></div>
      <nav aria-label="主导航">{navItems.map(({ id, label, planet, icon: Icon }) => <button key={id} className={`nav-item ${section === id ? "active" : ""}`} onClick={() => navigate(id)} aria-current={section === id ? "page" : undefined}><Icon size={19} /><span>{label}<small>{planet}</small></span>{id === "counter" && <span className="nav-badge">工具</span>}</button>)}</nav>
      <div className="sidebar-project"><div className="project-symbol"><Orbit size={19} /></div><p>让想法，拥有自己的引力。</p><span>每一次工程迭代，<br />点亮一片新的星域。</span><button onClick={() => navigate("practice")}>查看实践路线 <ArrowUpRight size={15} /></button></div>
      <a className="sidebar-repo" href={repo} target="_blank" rel="noreferrer"><Github size={18} /><span>项目代码仓库</span><ArrowUpRight size={14} /></a>
      <div className="sidebar-footer"><span className="avatar"><Code2 size={17} /></span><div><strong>现代软件工程</strong><small>课程团队项目</small></div><span className="footer-dot" /></div>
    </aside>

    <div className="main-shell">
      <header className="topbar">{section === "overview" ? <button className="universe-brand-link" onClick={() => navigate("overview")} aria-label="SE Lab 星系总览"><Orbit size={23} /><span>SE LAB.</span><small>工程宇宙</small></button> : <div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label={mobileNav ? "关闭导航" : "打开导航"} aria-expanded={mobileNav} aria-controls="planet-navigation"><Menu size={20} /></button><button className="icon-button" onClick={() => navigate("overview")} aria-label="返回星图"><Orbit size={18} /></button><span>{currentPlanet.name}</span><ChevronRight size={13} /><strong>{activeLabel}</strong></div>}<div className="topbar-end"><button className="intro-replay-button" type="button" onClick={() => setIntroReplay((value) => value + 1)} aria-label="重播星系开场" aria-expanded={introActive} aria-haspopup="dialog" title="重播星系开场"><Play size={13} /><span>重播开场</span></button><span className={`service-status ${configError ? "offline" : ""}`}><i />{config ? "工作空间已就绪" : configError ? "统计服务暂不可用" : "正在连接工作空间"}</span><span className="course-tag">现代软件工程 · 实践</span></div></header>

      <main className="workspace" ref={workspaceRef} tabIndex={-1} aria-label={section === "overview" ? "SE Lab 宇宙星图" : `${currentPlanet.name} · ${activeLabel}`}>
        {section !== "overview" && <div className="planet-arrival"><PlanetOrb kind={currentPlanet.kind} /><div><strong>{currentPlanet.name}</strong><span>{currentPlanet.sector}</span></div><button className="planet-return" onClick={() => navigate("overview")}><ArrowLeft size={14} />返回星图</button></div>}
        <MathWorkspace active={section === "math"} />
        {section === "counter" ? <>
          <div className="page-heading"><div><div className="eyebrow"><span /> DEVELOPER TOOLKIT</div><div className="title-row"><h1>代码统计</h1><span className="version-tag">v1.0</span></div><p>读懂代码规模，让每一次工程实践都有据可循。</p></div><button className="button secondary demo-button" onClick={loadDemo} disabled={busy}><Play size={15} />体验示例项目<ArrowUpRight size={14} /></button></div>

          <div className="tool-workbench">
            <section className="panel source-panel" aria-labelledby="source-title"><div className="panel-heading"><div className="panel-title"><span className="step-number">01</span><h2 id="source-title">选择代码来源</h2></div><span className="subtle-label">支持文件与完整项目</span></div>
              <div className={`drop-zone ${dragging ? "dragging" : ""} ${selected.length ? "has-files" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
                <div className="upload-symbol">{selected.length ? <FolderOpen size={28} strokeWidth={1.6} /> : <Upload size={26} strokeWidth={1.6} />}</div>
                <strong>{selected.length ? sourceName : "将代码文件拖放到这里"}</strong><p>{selected.length ? <>已选择 <b>{number(selected.length)}</b> 个文件 · {byteSize(selectedBytes)}</> : "也可以选择文件夹，保留项目目录结构"}</p>
                <div className="upload-buttons"><button className="button primary small" onClick={() => folderInput.current?.click()} disabled={busy}><FolderOpen size={15} />{selected.length ? "更换文件夹" : "选择文件夹"}</button><button className="button secondary small" onClick={() => filesInput.current?.click()} disabled={busy}><FileCode2 size={15} />选择文件</button></div>
              </div>
              <input ref={filesInput} className="visually-hidden" aria-label="选择代码文件" type="file" multiple onChange={(event) => onInput(event)} />
              <input ref={folderInput} className="visually-hidden" aria-label="选择代码文件夹" type="file" multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(event) => onInput(event, true)} />
              <div className="source-footnote"><ShieldCheck size={14} /><span>文件仅用于本次统计，不保存源码。单文件上限 {config ? byteSize(config.limits.maxFileBytes) : "4 MB"}。</span></div>
            </section>

            <section className="panel options-panel" aria-labelledby="options-title"><div className="panel-heading"><div className="panel-title"><span className="step-number">02</span><h2 id="options-title">统计选项</h2></div><Settings2 size={17} className="muted-icon" /></div>
              <div className="option-row"><label htmlFor="encoding">文件编码</label><select id="encoding" value={encoding} onChange={(event) => setEncoding(event.target.value)} disabled={busy}><option value="auto">自动识别</option><option value="utf8">UTF-8</option><option value="gb18030">GB18030</option></select></div>
              <label className="checkbox-row"><input type="checkbox" checked={useDefaultExcludes} onChange={(event) => setUseDefaultExcludes(event.target.checked)} disabled={busy} /><span><strong>排除依赖与构建目录</strong><small>让统计更聚焦于项目源码</small></span></label>
              <div className="exclude-tags" title={config?.defaultExcludes.join("、")}><span>node_modules</span><span>.git</span><span>dist</span><span>…</span></div>
              <details className="advanced-options"><summary>更多筛选条件 <ChevronRight size={14} /></summary><div className="advanced-body"><label htmlFor="extension-option">统计语言</label><select id="extension-option" value={extensionOption} onChange={(event) => setExtensionOption(event.target.value)} disabled={busy}><option value="">全部支持的语言</option>{config?.languages.map((language) => <option key={language.name} value={language.name}>{language.name} ({language.extensions.join(", ")})</option>)}</select><label htmlFor="exclude-patterns">自定义排除规则</label><textarea id="exclude-patterns" value={excludes} onChange={(event) => setExcludes(event.target.value)} disabled={busy} rows={3} placeholder={"例如：vendor、generated/**\n多个规则用逗号或换行分隔"} /><small>目录名或相对路径匹配规则，支持 * 和 **。</small></div></details>
            </section>
          </div>

          <div className="action-bar"><div className="supported-languages"><span>支持</span>{(config?.languages || [{ name: "C / C++" }, { name: "Java" }, { name: "Python" }, { name: "JS / TS" }]).slice(0, 5).map((language) => <span key={language.name} className="language-chip">{language.name}</span>)}<span className="language-more">等源码类型</span></div><div className="action-buttons"><button className="button text-button" onClick={reset} disabled={busy || (!selected.length && !report)}><RotateCcw size={14} />重置</button>{busy ? <button className="button primary" onClick={() => abortRef.current?.abort()}><X size={16} />取消统计</button> : <button className="button primary analyze-button" onClick={analyze} disabled={!selected.length || !config}><BarChart3 size={17} />开始统计<ArrowRight size={16} /></button>}</div></div>

          {configError && <div className="message error-message" role="alert"><CircleAlert size={17} /><span>暂时无法连接统计服务，请稍后重试。</span><button onClick={() => { setConfigError(false); setConfigRetry((value) => value + 1); }}>重新连接</button></div>}
          {error && <div className="message error-message" role="alert"><CircleAlert size={17} /><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError("")}><X size={15} /></button></div>}
          {notice && !error && <div className="message notice-message" role="status"><Info size={15} /><span>{notice}</span></div>}
          {busy && <div className="processing-state" role="status" aria-live="polite"><LoaderCircle size={18} className="spin" /><span>{progress.total ? `正在统计 ${number(progress.done)} / ${number(progress.total)} 个文件` : "正在加载示例"}</span>{progress.total > 0 && <><div className="processing-track"><i style={{ width: `${progress.done / progress.total * 100}%` }} /></div><b>{Math.round(progress.done / progress.total * 100)}%</b></>}<small>全部文件处理完成后生成报告</small></div>}

          <div className="results-section">
            <div className="results-heading"><div><h2>统计结果 {isDemo && <span className="demo-tag">示例数据</span>}</h2><p>{report ? <>{reportName} <span className="middle-dot">·</span> {when(report.generatedAt)} 生成</> : "导入项目后，在这里查看完整的代码分析"}</p></div><div className="export-actions"><button className="button secondary small" onClick={() => exportReport("json")} disabled={!report || busy || !!exporting}>{exporting === "json" ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}JSON</button><button className="button secondary small" onClick={() => exportReport("csv")} disabled={!report || busy || !!exporting}>{exporting === "csv" ? <LoaderCircle size={14} className="spin" /> : <ArrowDownToLine size={14} />}导出 CSV</button></div></div>
            <div className="metric-grid">
              {[{ label: "代码行数", key: "code" as const, icon: Code2, detail: "有效代码的物理行数", highlight: true }, { label: "注释行数", key: "comment" as const, icon: BookOpen, detail: "仅包含注释的行" }, { label: "空白行数", key: "blank" as const, icon: Layers, detail: "仅包含空白字符的行" }, { label: "源码文件", key: "files" as const, icon: Files, detail: report ? `总计 ${number(report.totals.total)} 行` : "成功识别并统计的文件" }].map(({ label, key, icon: Icon, detail, highlight }) => <div className={`metric-card ${highlight ? "metric-highlight" : ""}`} key={key}><div className="metric-top"><span>{label}</span><Icon size={18} strokeWidth={1.7} /></div><div className="metric-value">{report ? number(report.totals[key]) : <span className="empty-number">—</span>}<small>{key === "files" ? "个" : "行"}</small></div><span className="metric-detail">{detail}</span></div>)}
            </div>

            <section className="panel distribution-panel"><div className="language-distribution"><div className="chart-heading"><h3>语言分布</h3><span>按代码行数</span></div>{report && report.languages.length ? <div className="language-bars">{report.languages.slice(0, 6).map((language, index) => <div className="language-bar-row" key={language.language}><div className="language-bar-label"><span><i style={{ background: palette[index % palette.length] }} />{language.language}</span><span><b>{number(language.code)}</b><small>{report.totals.code ? `${(language.code / report.totals.code * 100).toFixed(1)}%` : "0%"}</small></span></div><div className="bar-track"><div style={{ width: `${report.totals.code ? Math.max(0.5, language.code / report.totals.code * 100) : 0}%`, background: palette[index % palette.length] }} /></div></div>)}{report.languages.length > 6 && <p className="tiny-note">另有 {report.languages.length - 6} 种语言，完整明细见导出报告。</p>}</div> : <div className="chart-empty"><BarChart3 size={31} strokeWidth={1.2} /><p>{report ? "暂无可统计的语言" : "等待你的第一个项目"}</p><span>{report ? "检查文件类型、编码与排除条件" : "分析完成后，查看各语言的代码占比"}</span></div>}</div><div className="line-composition"><div className="chart-heading"><h3>代码构成</h3><span>物理行统计</span></div><div className="composition-content"><div className="donut" style={{ background: distribution }} role="img" aria-label={report ? `总计${report.totals.total}行，代码${report.totals.code}行，注释${report.totals.comment}行，空白${report.totals.blank}行` : "尚无统计数据"}><div><strong>{report ? number(report.totals.total) : "—"}</strong><small>总行数</small></div></div><div className="composition-legend">{[{ label: "代码", color: "#217c65", key: "code" as const }, { label: "注释", color: "#72ac99", key: "comment" as const }, { label: "空白", color: "#e1e8e5", key: "blank" as const }].map((item) => <div key={item.key}><span><i style={{ background: item.color }} />{item.label}</span><b>{report && report.totals.total ? `${(report.totals[item.key] / report.totals.total * 100).toFixed(1)}%` : "—"}</b></div>)}</div></div></div></section>

            <section className="panel files-panel"><div className="files-toolbar"><div className="result-tabs" role="tablist" aria-label="文件统计明细"><button role="tab" aria-selected={tab === "files"} onClick={() => { setTab("files"); setPage(1); }} className={tab === "files" ? "active" : ""}>文件明细 <span>{report ? number(report.files.length) : 0}</span></button><button role="tab" aria-selected={tab === "skipped"} onClick={() => { setTab("skipped"); setPage(1); }} className={tab === "skipped" ? "active" : ""}>已跳过 <span>{report ? number(report.skipped.length) : 0}</span></button><button role="tab" aria-selected={tab === "errors"} onClick={() => { setTab("errors"); setPage(1); }} className={tab === "errors" ? "active" : ""}>异常 <span>{report ? number(report.errors.length) : 0}</span></button></div><div className="table-filters"><div className="search-input"><Search size={15} /><input aria-label="搜索文件名" placeholder="搜索文件…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} disabled={!report} /></div>{tab === "files" && <select aria-label="筛选文件语言" value={languageFilter} onChange={(event) => { setLanguageFilter(event.target.value); setPage(1); }} disabled={!report}><option value="">全部语言</option>{report?.languages.map((language) => <option key={language.language} value={language.language}>{language.language}</option>)}</select>}</div></div>
              <div className="table-scroll"><table><thead><tr><th>文件路径</th>{tab === "files" ? <><th>语言</th><th>总行数</th><th>代码</th><th>注释</th><th>空白</th></> : <th>{tab === "skipped" ? "跳过原因" : "异常说明"}</th>}</tr></thead><tbody>{tab === "files" ? visibleFiles.map((file) => <tr key={file.path}><td><span className="file-path" title={file.path}><FileCode2 size={15} />{file.path}</span></td><td><span className="table-language">{file.language}</span></td><td>{number(file.total)}</td><td className="code-cell">{number(file.code)}</td><td>{number(file.comment)}</td><td>{number(file.blank)}</td></tr>) : tab === "skipped" ? visibleSkipped.map((file, index) => <tr key={`${file.path}-${index}`}><td><span className="file-path" title={file.path}><FileCode2 size={15} />{file.path}</span></td><td className="reason-cell">{reasonText[file.reason] || file.reason}</td></tr>) : visibleErrors.map((file, index) => <tr key={`${file.path}-${index}`}><td><span className="file-path" title={file.path}><CircleAlert size={15} />{file.path}</span></td><td className="reason-cell">{file.message}</td></tr>)}</tbody></table></div>
              {!rowCount && <div className="table-empty"><div className="empty-file-icon"><FileCode2 size={24} strokeWidth={1.3} /></div><strong>{!report ? "你的代码报告，从这里开始" : search || languageFilter ? "没有找到匹配的文件" : tab === "skipped" ? "没有跳过的文件" : tab === "errors" ? "没有处理异常" : "没有可统计的源码文件"}</strong><p>{!report ? "选择一个项目，或者先体验示例，看看代码的全貌。" : search || languageFilter ? "试试其他关键词或语言筛选。" : tab === "files" ? "请确认文件类型受支持，并在「已跳过」中查看原因。" : "全部处理记录已在报告中保留。"}</p>{!report && <button className="empty-demo-link" onClick={loadDemo} disabled={busy}>体验示例项目 <ArrowRight size={14} /></button>}</div>}
              <div className="table-footer"><span>{report ? `共 ${number(rowCount)} 条记录${rowCount > 0 ? `，当前显示 ${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, rowCount)}` : ""}` : "准备好时，开始你的第一次统计"}</span><div className="pagination"><button aria-label="上一页" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} /></button><span>{currentPage} / {pageCount}</span><button aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={15} /></button></div></div>
            </section>
          </div>

          <div className="bottom-grid"><section className="panel rules-panel"><div className="small-panel-heading"><ShieldCheck size={17} /><h3>清晰的规则，可信的结果</h3></div><p>按物理行分类，每一行只计入一种类型。</p><ul>{(config?.rules?.length ? config.rules : ["同一行同时包含代码和注释，归为代码行。", "注释中的空行按空白行处理。", "不支持的类型与二进制文件会单独记录。"]).map((rule, index) => <li key={index}><Check size={13} /><span>{rule}</span></li>)}</ul></section><section className="panel recent-panel"><div className="small-panel-heading"><Terminal size={17} /><h3>最近统计</h3>{history.length > 0 && <button onClick={() => { setHistory([]); try { localStorage.removeItem(storageKey); } catch { /* Optional storage. */ } }} className="clear-history">清空</button>}</div><p>仅在当前浏览器保存摘要，不保存源码。</p>{history.length ? <div className="recent-list">{history.map((item, index) => <div key={`${item.date}-${index}`}><span className="recent-icon"><FolderOpen size={15} /></span><div><strong title={item.name}>{item.name}</strong><small>{when(item.date)} · {number(item.files)} 个文件</small></div><span>{number(item.code)} <small>代码行</small></span></div>)}</div> : <div className="recent-empty">完成一次项目统计后，摘要会显示在这里。</div>}</section></div>
        </> : section === "overview" ? <UniverseMap key={mapVisit} onNavigate={navigate} /> : section === "profile" ? <OriginProfile onNavigate={navigate} /> : section === "practice" ? <>
          <div className="page-heading"><div><div className="eyebrow"><span /> BUILD WITH INTENTION</div><h1>让工程思想，成为日常做法。</h1><p>以课程照片与项目需求为依据，在每一轮迭代中积累可检验的成果。</p></div></div>
          <div className="practice-grid">{[{ n: "01", title: "需求与验收", text: "说明谁在什么场景使用功能，并写出怎样才算完成。", example: "四则运算：按配置出题，答案可独立核验；默认规则可生成一万道不重复题目。" }, { n: "02", title: "任务拆分与估算", text: "把目标拆成可交付的小任务，对照预计与实际耗时调整下一轮计划。", example: "将出题核心、接口、练习界面与识别服务拆开交付，保留各阶段的验证结果。" }, { n: "03", title: "模块化与复用", text: "让领域逻辑与界面分离，明确模块之间的输入、输出和职责。", example: "命令行和网站共享出题核心；逆波兰求值与精确分数计算也用于 24 点的答案验证。" }, { n: "04", title: "测试与质量", text: "通过明确的样例和边界情况验证行为，记录失败与异常，保留问题证据。", example: "覆盖括号与优先级、分数、除零和非法输入；服务端根据算式重新计算答案。" }, { n: "05", title: "版本与协作", text: "使用 Git 和仓库中的 Issue、PR 模板记录需求、变更原因和验证结果。", example: "公开仓库采用 MIT 许可，借助自动检查与清晰的变更说明共同完善功能。" }, { n: "06", title: "反馈与持续迭代", text: "从真实使用中收集反馈，逐步扩展能力，复盘设计与估算上的偏差。", example: "先验证功能与本地请求表现，再根据实测数据评估更多用户同时访问的能力。" }].map((item) => <section className="panel practice-card" key={item.n}><span className="practice-number">{item.n}</span><h2>{item.title}</h2><p>{item.text}</p><div>{item.example}</div></section>)}</div>
          <section className="panel course-case"><span className="status-pill">课程案例 · 持续实现</span><h2>四则运算：一次需求演进的练习</h2><p>基础出题 → 答案与正确性 → 去重与可定制 → 网站练习与打印 →「24点」复用。AI 识别需配置服务后使用。</p><div className="case-facts"><div><strong>300 道</strong><span>每周练习题的起始场景</span></div><div><strong>10,000 道</strong><span>默认规则支持的不重复题目数量</span></div><div><strong>上万并发</strong><span>课程中的服务扩展场景，尚未验证</span></div></div><p className="tiny-note">一万道题、一万名学生每天使用与上万用户同时访问是不同指标。当前提供题目生成与练习功能，不代表已达到上万并发服务能力。</p></section>
        </> : section === "about" ? <>
          <div className="page-heading"><div><div className="eyebrow"><span /> ABOUT THIS WORKSPACE</div><h1>一个持续生长的课程项目。</h1><p>用可运行的功能和可追溯的过程，展示现代软件工程的学习与实践。</p></div></div>
          <section className="panel about-card"><span className="about-mark"><Code2 size={42} /></span><div><span className="hero-kicker">SOFTWARE ENGINEERING LAB</span><h2>SE Lab · 软件工程实践平台</h2><p>本项目围绕《现代软件工程》课程逐步建设：先实现代码量统计工具，再完成自主设计功能，最终通过个人主页展示项目成果与学习过程。</p><p>当前网站提供项目代码统计与报告导出，以及可定制的四则运算练习、答案核验、计时、浏览器历史、打印与 24 点游戏。个人主页的真实资料与成果内容将随课程进度继续完善。</p><a className="button primary" href={repo} target="_blank" rel="noreferrer"><Github size={17} />访问 GitHub 仓库<ArrowUpRight size={15} /></a><small className="private-repo-note">项目已在 GitHub 公开，采用 MIT 许可，欢迎通过 Issue 和 Pull Request 参与协作。</small></div></section>
          <div className="about-grid"><section className="panel about-detail"><ShieldCheck size={23} /><h3>统计数据如何处理</h3><p>选择的文件在开始统计后发送到统计服务。源码不做持久保存，页面中的报告保留在当前会话；最近统计仅在当前浏览器保存摘要。</p></section><section className="panel about-detail"><Layers size={23} /><h3>共同构建，逐步完善</h3><p>围绕需求、设计、代码审查和验证开展协作，使用清楚的任务记录与版本变更，让每位成员都能理解项目的演进。</p></section></div>
        </> : null}
        <footer className="workspace-footer"><span><span className="footer-brand">SE Lab.</span> 让软件工程，从实践开始。</span><span>现代软件工程 · 团队课程项目</span></footer>
      </main>
    </div>
  </div></>;
}
