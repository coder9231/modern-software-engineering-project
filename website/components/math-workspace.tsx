"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, Download, Eraser, History, Languages, Lightbulb, ListChecks, LoaderCircle, Play, Printer, RotateCcw, Settings2, Shuffle, Sparkles, Trash2, X } from "lucide-react";
import MathOCRPanel from "./math-ocr-panel";
import "./math-workspace.css";

type Language = "zh" | "en";
type Options = { count: number; min: number; max: number; operators: string[]; operatorCount: number; parentheses: boolean; allowNegative: boolean; fractions: boolean; divisionMode: "exact" | "fraction" | "remainder"; resultMin: number; resultMax: number; denominatorMax: number; seed?: string };
type Question = { id: string; expression: string; answer: string; kind: "normal" | "remainder"; canonical: string };
type Worksheet = { seed: string; options: Options; questions: Question[] };
type Grade = { total: number; answered: number; correct: number; accuracy: number; results: { id: string; expression: string; submitted: string; expected: string; correct: boolean; message?: string }[] };
type Config = { defaults: Options; limits: { maxQuestions: number }; rules: string[]; ocr: { configured: boolean; provider: string } };
type Attempt = { id: string; date: string; count: number; correct: number; accuracy: number; elapsed: number; seed: string; options: Options };
type Section = "practice" | "history" | "24" | "ocr";
type Evaluation = { expression: string; answer: string; rpn: string[] };
const initialOptions: Options = { count: 20, min: 0, max: 100, operators: ["+", "-"], operatorCount: 2, parentheses: false, allowNegative: false, fractions: false, divisionMode: "exact", resultMin: 0, resultMax: 100, denominatorMax: 12 };
const historyKey = "se-lab-math-history-v1";
const pageSize = 12;
const timeText = (milliseconds: number) => { const seconds = Math.floor(milliseconds / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; };
const displayExpression = (expression: string) => expression.replace(/\*/g, "×").replace(/\//g, "÷");
// These values are read only by event handlers and timer callbacks, never during render.
const eventTimestamp = () => Date.now();
const newAttemptId = () => crypto.randomUUID();
function localizedMessage(message: string, language: Language) {
  if (language === "zh") return message;
  const translations: Record<string, string> = {
    "除数不能为零。": "Division by zero is not allowed.", "不支持的运算符。": "This operator is not supported.",
    "算式须为 1–256 个字符。": "The expression must contain 1–256 characters.", "算式仅支持数字、四则运算符及括号。": "Use numbers, arithmetic operators, and parentheses only.",
    "单个数字最多包含 9 位数字。": "Each number may contain at most 9 digits.", "算式最多包含 64 个记号。": "An expression may contain at most 64 tokens.",
    "请输入算式。": "Enter an expression.", "数字之间缺少运算符。": "An operator is missing between numbers.", "括号前缺少运算符。": "An operator is missing before a parenthesis.",
    "括号内缺少操作数。": "An operand is missing inside parentheses.", "左右括号不匹配。": "The parentheses do not match.", "运算符前缺少操作数。": "An operand is missing before an operator.",
    "算式最多包含 12 个二元运算符。": "An expression may contain at most 12 binary operators.", "算式末尾缺少操作数。": "An operand is missing at the end.",
    "缺少操作数。": "An operand is missing.", "算式不完整。": "The expression is incomplete.", "不允许出现负数。": "Negative values are disabled.",
    "不允许负数中间结果。": "Negative intermediate results are disabled.", "当前配置要求除法整除。": "The current rules require exact integer division.",
    "最小值不能大于最大值。": "The minimum cannot exceed the maximum.", "请选择不重复的四则运算符。": "Select at least one distinct arithmetic operator.",
    "关闭负数时，操作数不能为负。": "Enable negatives before choosing negative operands.", "随机种子须为 1–64 个可见字符。": "A seed must contain 1–64 visible characters.",
    "余数模式仅支持非负整数的单次除法，请仅选除号、1 个运算符，并关闭分数和负数。": "Remainder mode requires non-negative integers, one division operator, and no fractions or negatives.",
    "未作答": "Not answered", "答案格式无效": "Invalid answer format", "余数答案请填写“商 R 余数”，例如 2 R 1。": "Use quotient R remainder, for example 2 R 1.",
    "请将给定的 4 个整数各用一次，仅使用四则运算和括号。": "Use each of the four numbers exactly once, with arithmetic operators and parentheses only.",
    "正确！结果为 24。": "Correct! The result is 24.", "数学服务暂时不可用，请稍后重试。": "The arithmetic service is temporarily unavailable. Please retry.",
  };
  if (translations[message]) return translations[message];
  const insufficient = /^(?:当前条件仅找到|在尝试上限内找到) (\d+) 道不重复的题目/.exec(message);
  if (insufficient) return `Only ${insufficient[1]} unique questions were found within the attempt limit. Widen the operand or answer range, add operators, or request fewer questions.`;
  const currentResult = /^当前结果为 (.+)，请继续尝试。$/.exec(message);
  if (currentResult) return `The result is ${currentResult[1]}. Try again.`;
  const range = /^(.+)须为 (.+) 之间的整数。$/.exec(message);
  if (range) { const fields: Record<string, string> = { "题目数量": "Question count", "最小操作数": "Minimum operand", "最大操作数": "Maximum operand", "运算符数量": "Operation count", "最小答案": "Minimum answer", "最大答案": "Maximum answer", "最大分母": "Maximum denominator" }; return `${fields[range[1]] || "This value"} must be an integer in ${range[2]}.`; }
  return message;
}

function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function api<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await response.json() as T & { error?: string | { message?: string } };
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : data?.error?.message || `Request failed (${response.status})`);
  return data as T;
}

export default function MathWorkspace({ active = true }: { active?: boolean }) {
  const [language, setLanguage] = useState<Language>("zh");
  const [section, setSection] = useState<Section>("practice");
  const [options, setOptions] = useState<Options>({ ...initialOptions });
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState(false);
  const [configRetry, setConfigRetry] = useState(0);
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<Grade | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [page, setPage] = useState(1);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ zh: string; en: string } | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [printAnswers, setPrintAnswers] = useState(false);
  const [printColumns, setPrintColumns] = useState(3);
  const [printGap, setPrintGap] = useState(22);
  const [printing, setPrinting] = useState(false);
  const [cards, setCards] = useState<number[]>([]);
  const [cardSeed, setCardSeed] = useState("");
  const [cardExpression, setCardExpression] = useState("");
  const [cardResult, setCardResult] = useState<{ correct: boolean; answer: string; message: string; rpn?: string[] } | null>(null);
  const [hint, setHint] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const touchedOptions = useRef(false);
  const t = (zh: string, en: string) => language === "zh" ? zh : en;
  const remainder = options.divisionMode === "remainder";
  const maximum = config?.limits.maxQuestions || 10000;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/math/config", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("config");
      const data = await response.json() as Config;
      setConfig(data); setConfigError(false);
      if (!touchedOptions.current) setOptions({ ...initialOptions, ...data.defaults });
    }).catch((failure) => { if (failure.name !== "AbortError") setConfigError(true); });
    return () => controller.abort();
  }, [configRetry]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const data = JSON.parse(localStorage.getItem(historyKey) || "[]");
        if (Array.isArray(data)) setAttempts(data.filter((item) => item && typeof item.id === "string" && typeof item.seed === "string" && typeof item.date === "string" && Number.isFinite(item.count) && Number.isFinite(item.correct) && Number.isFinite(item.accuracy) && Number.isFinite(item.elapsed) && item.options && typeof item.options === "object").slice(0, 50));
      } catch { /* History is optional; restricted browser storage must not block practice. */ }
    });
    const finishPrint = () => { setPrinting(false); document.body.classList.remove("math-print-mode"); };
    window.addEventListener("afterprint", finishPrint);
    return () => { cancelAnimationFrame(frame); requestRef.current?.abort(); window.removeEventListener("afterprint", finishPrint); document.body.classList.remove("math-print-mode"); };
  }, []);

  useEffect(() => {
    if (!startedAt || grade) return;
    const interval = window.setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, grade]);

  useEffect(() => {
    if (!evaluation || !active) return;
    const previousFocus = document.activeElement;
    const frame = requestAnimationFrame(() => modalCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEvaluation(null);
      if (event.key === "Tab") { event.preventDefault(); modalCloseRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", onKeyDown); if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, [evaluation, active]);

  const resultMap = useMemo(() => new Map(grade?.results.map((item) => [item.id, item]) || []), [grade]);
  const questionList = useMemo(() => worksheet?.questions.filter((question) => !onlyWrong || (grade && !resultMap.get(question.id)?.correct)) || [], [worksheet, onlyWrong, grade, resultMap]);
  const pages = Math.max(1, Math.ceil(questionList.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleQuestions = questionList.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const answered = Object.values(answers).filter((answer) => answer.trim()).length;

  function changeOptions(update: Partial<Options>) { touchedOptions.current = true; setOptions((previous) => ({ ...previous, ...update })); }
  function switchSection(next: Section) { setSection(next); setError(""); setNotice(null); }
  function storeAttempts(next: Attempt[]) { setAttempts(next); try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { setNotice({ zh: "浏览器未允许保存历史，本次练习仍可正常使用。", en: "Browser storage is unavailable. This practice session still works." }); } }

  async function request<T>(label: string, url: string, body: unknown): Promise<T | null> {
    if (requestRef.current) return null;
    const controller = new AbortController(); requestRef.current = controller;
    setBusy(label); setError(""); setNotice(null);
    try { return await api<T>(url, body, controller.signal); }
    catch (failure) {
      if (failure instanceof Error && failure.name === "AbortError") setNotice({ zh: "请求已取消，当前内容已保留。", en: "Request cancelled. Your current work is preserved." });
      else setError(failure instanceof Error ? failure.message : t("请求失败，请重试。", "Request failed. Please try again."));
      return null;
    } finally { requestRef.current = null; setBusy(""); }
  }

  async function generate(nextOptions: Options = options) {
    const submitted: Options = { ...nextOptions, seed: nextOptions.seed?.trim() || undefined };
    const data = await request<Worksheet>("generate", "/api/math/generate", { options: submitted });
    if (!data) return;
    setWorksheet(data); setAnswers({}); setGrade(null); setPage(1); setOnlyWrong(false); setShowAnswers(false); setEvaluation(null);
    setStartedAt(eventTimestamp()); setElapsed(0); setSection("practice");
    setNotice({ zh: `已生成 ${data.questions.length.toLocaleString()} 道题，计时已开始。`, en: `${data.questions.length.toLocaleString()} questions ready. The timer has started.` });
  }

  async function submitAnswers() {
    if (!worksheet || grade) return;
    const data = await request<Grade>("grade", "/api/math/grade", { questions: worksheet.questions.map(({ id, expression, kind }) => ({ id, expression, kind })), answers });
    if (!data) return;
    const duration = startedAt ? eventTimestamp() - startedAt : elapsed;
    setGrade(data); setElapsed(duration); setPage(1);
    const attempt: Attempt = { id: newAttemptId(), date: new Date().toISOString(), count: data.total, correct: data.correct, accuracy: data.accuracy, elapsed: duration, seed: worksheet.seed, options: worksheet.options };
    storeAttempts([attempt, ...attempts].slice(0, 50));
  }

  function restart() {
    setAnswers({}); setGrade(null); setOnlyWrong(false); setPage(1); setShowAnswers(false); setEvaluation(null); setStartedAt(eventTimestamp()); setElapsed(0); setError(""); setNotice(null);
  }

  async function explain(expression: string) {
    const data = await request<{ answer: string; rpn: string[] }>("evaluate", "/api/math/evaluate", { expression });
    if (data) setEvaluation({ expression, answer: data.answer, rpn: data.rpn });
  }

  function printWorksheet() {
    if (!worksheet) return;
    setPrinting(true); document.body.classList.add("math-print-mode");
    window.setTimeout(() => { window.print(); }, 150);
  }

  async function newCards() {
    const data = await request<{ numbers: number[]; seed: string }>("24-new", "/api/math/24", { action: "new" });
    if (data) { setCards(data.numbers); setCardSeed(data.seed); setCardExpression(""); setCardResult(null); setHint(""); }
  }

  async function checkCards() {
    const data = await request<{ correct: boolean; answer: string; message: string; rpn?: string[] }>("24-check", "/api/math/24", { action: "check", numbers: cards, expression: cardExpression });
    if (data) setCardResult(data);
  }

  async function revealHint() {
    const data = await request<{ solution: string | null }>("24-hint", "/api/math/24", { action: "hint", numbers: cards });
    if (data) setHint(data.solution || t("这组数字没有可用解答。", "No solution was found for these numbers."));
  }

  const tabs = [{ id: "practice" as Section, label: t("出题与练习", "Generate & practice"), icon: ListChecks }, { id: "history" as Section, label: t("练习记录", "History"), icon: History }, { id: "24" as Section, label: t("24 点挑战", "24 challenge"), icon: Shuffle }, { id: "ocr" as Section, label: t("AI 识别改卷", "AI grading"), icon: Sparkles }];

  return <div className="math-workspace" hidden={!active} lang={language === "zh" ? "zh-CN" : "en"}>
    <div className="math-heading"><div><div className="math-eyebrow">LEARN · PRACTICE · UNDERSTAND</div><h1>{t("四则运算实验室", "Arithmetic lab")}<span>01 / MATH</span></h1><p>{t("从一张练习纸开始，探索正确、可定制、可复用的软件。", "Start with a worksheet. Explore software that is correct, configurable, and reusable.")}</p></div><button className="math-btn math-btn-soft" onClick={() => setLanguage(language === "zh" ? "en" : "zh")} aria-label={t("切换为英文", "Switch to Chinese")}><Languages size={17} />{language === "zh" ? "English" : "中文"}</button></div>
    <nav className="math-tabs" aria-label={t("四则运算功能", "Arithmetic features")}>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active" : ""} onClick={() => switchSection(id)} aria-current={section === id ? "page" : undefined}><Icon size={17} />{label}{id === "history" && attempts.length > 0 && <span>{attempts.length}</span>}</button>)}</nav>

    {configError && <div className="math-message math-error" role="alert"><CircleAlert size={18} /><span>{t("无法连接运算服务，请重试后生成题目。", "The arithmetic service could not be reached.")}</span><button onClick={() => { setConfigError(false); setConfigRetry((value) => value + 1); }}>{t("重试连接", "Retry")}</button></div>}
    {error && <div className="math-message math-error" role="alert"><CircleAlert size={18} /><span>{localizedMessage(error, language)}</span><button aria-label={t("关闭提示", "Dismiss error")} onClick={() => setError("")}><X size={16} /></button></div>}
    {notice && <div className="math-message math-notice" role="status"><Check size={17} /><span>{notice[language]}</span></div>}
    {busy && <div className="math-message math-loading" role="status"><LoaderCircle size={18} className="spin" /><span>{busy === "generate" ? t("正在生成并校验唯一题目…大批量题目可能需要稍等。", "Generating and validating unique questions… Large worksheets may take a moment.") : t("正在处理，请稍候…", "Working, please wait…")}</span><button onClick={() => requestRef.current?.abort()}><X size={15} />{t("取消", "Cancel")}</button></div>}

    {section === "practice" && <>
      <div className="math-workbench">
        <section className="math-panel math-settings"><div className="math-panel-title"><span className="math-step">01</span><div><h2>{t("定制你的练习", "Make it your own")}</h2><p>{t("先选规则，再生成题目。", "Choose the rules, then generate.")}</p></div><Settings2 size={19} /></div>
          <div className="math-field"><label htmlFor="math-count">{t("题目数量", "Question count")}</label><div className="math-count-input"><input id="math-count" type="number" min={1} max={maximum} value={options.count} onChange={(event) => changeOptions({ count: Number(event.target.value) })} disabled={!!busy} /><span>{t("道", "items")}</span></div><div className="math-presets">{[20, 300, 10000].map((count) => <button key={count} disabled={!!busy} className={options.count === count ? "selected" : ""} onClick={() => changeOptions({ count })}>{count === 20 ? t("日常 20 题", "Daily · 20") : count === 300 ? t("周练 300 题", "Weekly · 300") : t("挑战 10,000 题", "10,000 unique")}</button>)}</div></div>
          <div className="math-field"><label>{t("运算符", "Operations")}</label><div className="math-operators">{["+", "-", "*", "/"].map((operator) => <button key={operator} className={options.operators.includes(operator) ? "selected" : ""} aria-pressed={options.operators.includes(operator)} disabled={!!busy || remainder} onClick={() => changeOptions({ operators: options.operators.includes(operator) ? options.operators.filter((item) => item !== operator) : [...options.operators, operator] })}>{displayExpression(operator)}</button>)}</div></div>
          <div className="math-fields-two"><div className="math-field"><label htmlFor="math-min">{t("数值下限", "Minimum operand")}</label><input id="math-min" type="number" min={-1000000} max={1000000} value={options.min} onChange={(event) => changeOptions({ min: Number(event.target.value) })} disabled={!!busy} /></div><div className="math-field"><label htmlFor="math-max">{t("数值上限", "Maximum operand")}</label><input id="math-max" type="number" min={-1000000} max={1000000} value={options.max} onChange={(event) => changeOptions({ max: Number(event.target.value) })} disabled={!!busy} /></div></div>
          <div className="math-fields-two"><div className="math-field"><label htmlFor="math-operator-count">{t("每题运算符数", "Operations per question")}</label><select id="math-operator-count" value={options.operatorCount} onChange={(event) => changeOptions({ operatorCount: Number(event.target.value) })} disabled={!!busy || remainder}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select></div><div className="math-field"><label htmlFor="math-division">{t("除法规则", "Division mode")}</label><select id="math-division" value={options.divisionMode} onChange={(event) => { const mode = event.target.value as Options["divisionMode"]; changeOptions(mode === "remainder" ? { divisionMode: mode, operators: ["/"], operatorCount: 1, fractions: false, allowNegative: false, parentheses: false, min: Math.max(0, options.min), max: Math.max(1, options.max) } : { divisionMode: mode, fractions: mode === "exact" ? false : options.fractions }); }} disabled={!!busy}><option value="exact">{t("整除", "Exact integer")}</option><option value="fraction">{t("允许分数结果", "Fraction result")}</option><option value="remainder">{t("商与余数", "Quotient & remainder")}</option></select></div></div>
          {remainder && <p className="math-help">{t("余数模式仅生成两个非负整数的除法题。答题格式：商 r 余数，例如 3 r 1。", "Remainder mode uses two non-negative integers and one division. Enter quotient r remainder, e.g. 3 r 1.")}</p>}
          <div className="math-checkboxes"><label><input type="checkbox" checked={options.parentheses} disabled={!!busy || remainder} onChange={(event) => changeOptions({ parentheses: event.target.checked })} />{t("允许括号", "Allow parentheses")}</label><label><input type="checkbox" checked={options.allowNegative} disabled={!!busy || remainder} onChange={(event) => changeOptions({ allowNegative: event.target.checked })} />{t("允许负数及负中间结果", "Allow negatives & intermediate results")}</label><label><input type="checkbox" checked={options.fractions} disabled={!!busy || remainder} onChange={(event) => changeOptions({ fractions: event.target.checked, divisionMode: event.target.checked ? "fraction" : options.divisionMode })} />{t("生成分数操作数", "Include fraction operands")}</label></div>
          <details className="math-advanced"><summary>{t("答案范围与复现设置", "Answer range & reproducibility")}<ChevronRight size={15} /></summary><div className="math-fields-two"><div className="math-field"><label htmlFor="math-result-min">{t("答案下限", "Minimum answer")}</label><input id="math-result-min" type="number" value={options.resultMin} disabled={!!busy} onChange={(event) => changeOptions({ resultMin: Number(event.target.value) })} /></div><div className="math-field"><label htmlFor="math-result-max">{t("答案上限", "Maximum answer")}</label><input id="math-result-max" type="number" value={options.resultMax} disabled={!!busy} onChange={(event) => changeOptions({ resultMax: Number(event.target.value) })} /></div></div><div className="math-field"><label htmlFor="math-denominator">{t("分数分母上限", "Maximum denominator")}</label><input id="math-denominator" type="number" min={2} max={12} value={options.denominatorMax} disabled={!!busy || !options.fractions} onChange={(event) => changeOptions({ denominatorMax: Number(event.target.value) })} /></div><div className="math-field"><label htmlFor="math-seed">{t("复现种子（可选）", "Seed (optional)")}</label><input id="math-seed" value={options.seed || ""} maxLength={64} disabled={!!busy} onChange={(event) => changeOptions({ seed: event.target.value })} placeholder={t("留空生成新一组题", "Leave empty for a new worksheet")} /></div><p className="math-help">{t("相同规则与种子可复现同一组题。规则过窄时可能无法生成指定数量，系统会明确报错。", "The same rules and seed reproduce a worksheet. A range that is too narrow may not provide enough unique questions.")}</p></details>
          <button className="math-btn math-btn-primary math-generate" disabled={!!busy || !config} onClick={() => generate()}>{busy === "generate" ? <LoaderCircle size={17} className="spin" /> : <Play size={17} />}{t("生成练习", "Generate worksheet")}<ArrowRight size={17} /></button>
          <p className="math-settings-note">{t("以有理数精确计算，服务器校验结果与去重。", "Exact rational arithmetic, validated and deduplicated on the server.")}</p>
        </section>

        <section className="math-practice-area">
          <div className="math-practice-heading"><div><span className="math-kicker">YOUR PRACTICE SPACE</span><h2>{worksheet ? t("专注这一题，进步一点点。", "One question. One step forward.") : t("准备好，开始一次小练习。", "Ready for a little practice?")}</h2></div><div className="math-timer"><Clock3 size={17} /><strong>{timeText(elapsed)}</strong><span>{grade ? t("已结束", "Finished") : worksheet ? t("练习计时", "Elapsed") : t("等待开始", "Ready")}</span></div></div>
          {worksheet ? <>
            <div className="math-session-bar"><span><b>{worksheet.questions.length.toLocaleString()}</b> {t("道不重复题目", "unique questions")}</span><span>{t("已作答", "Answered")} <b>{answered}</b> / {worksheet.questions.length}</span><button className="math-inline" onClick={restart} disabled={!!busy}><RotateCcw size={14} />{t("重做此卷", "Start over")}</button></div>
            {grade && <div className="math-grade-summary" aria-live="polite"><div className="math-score-ring" style={{ "--score": `${Math.max(0, Math.min(100, grade.accuracy * 100))}%` } as CSSProperties}><strong>{(grade.accuracy * 100).toFixed(1)}<small>%</small></strong></div><div><span>{t("本次准确率", "This attempt")}</span><h3>{t(`答对 ${grade.correct} / ${grade.total} 道`, `${grade.correct} of ${grade.total} correct`)}</h3><p>{t(`作答 ${grade.answered} 道 · 用时 ${timeText(elapsed)} · 未作答计为未正确`, `${grade.answered} answered · ${timeText(elapsed)} elapsed · Blanks count as incorrect`)}</p></div><Check size={27} /></div>}
            <div className="math-worksheet-toolbar"><div>{grade && <button className={onlyWrong ? "active" : ""} onClick={() => { setOnlyWrong(!onlyWrong); setPage(1); }}>{t("只看错题", "Incorrect only")}</button>}<button className={showAnswers ? "active" : ""} onClick={() => setShowAnswers(!showAnswers)}>{showAnswers ? t("隐藏答案", "Hide answers") : t("显示答案", "Show answers")}</button></div><span>{t("分数可输入 1/2；小数按精确值比较", "Fractions: 1/2. Decimals are compared exactly.")}</span></div>
            <div className="math-question-grid">{visibleQuestions.map((question) => { const result = resultMap.get(question.id); const originalIndex = worksheet.questions.indexOf(question); return <div className={`math-question ${result ? result.correct ? "is-correct" : "is-wrong" : ""}`} key={question.id}><div className="math-question-top"><span>{String(originalIndex + 1).padStart(2, "0")}</span>{result && <span className="math-result-tag">{result.correct ? <Check size={13} /> : <X size={13} />}{result.correct ? t("正确", "Correct") : t("待订正", "Review")}</span>}</div><label htmlFor={`answer-${question.id}`} className="math-expression">{displayExpression(question.expression)} <span>=</span></label><input id={`answer-${question.id}`} aria-label={t(`第 ${originalIndex + 1} 题答案`, `Answer ${originalIndex + 1}`)} autoComplete="off" spellCheck={false} value={answers[question.id] || ""} maxLength={100} disabled={!!busy || !!grade} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))} placeholder={question.kind === "remainder" ? "3 r 1" : t("输入答案", "Your answer")} /><div className="math-question-bottom">{showAnswers || (result && !result.correct) ? <span>{t("答案", "Answer")}: <b>{result?.expected ?? question.answer}</b></span> : <span>{question.kind === "remainder" ? t("求商与余数", "Quotient & remainder") : ""}</span>}<button onClick={() => explain(question.expression)} disabled={!!busy || question.kind === "remainder"} title={t("查看逆波兰表达式与计算结果", "View reverse Polish notation and result")}>{t("解析", "Explain")}<ChevronRight size={12} /></button></div>{result?.message && !result.correct && <p className="math-answer-note">{localizedMessage(result.message, language)}</p>}</div>; })}</div>
            {!questionList.length && <div className="math-all-correct"><Check size={30} /><h3>{t("本次没有错题", "No incorrect answers")}</h3><p>{t("可以换一组规则，继续挑战。", "Try another set of rules for your next challenge.")}</p></div>}
            <div className="math-pagination"><span>{t(`第 ${currentPage} / ${pages} 页 · 每页 ${pageSize} 题`, `Page ${currentPage} of ${pages} · ${pageSize} per page`)}</span><div><button aria-label={t("上一页", "Previous page")} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button><button aria-label={t("下一页", "Next page")} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></div></div>
            <div className="math-submit-row"><p>{t("批改会检查整张练习卷，包含其他分页中的题目。", "Grading checks the entire worksheet, including other pages.")}</p><button className="math-btn math-btn-primary" onClick={submitAnswers} disabled={!!busy || !!grade}><ListChecks size={17} />{grade ? t("批改已完成", "Graded") : t("提交整卷批改", "Grade worksheet")}</button></div>
            <div className="math-export-panel"><div><h3><Printer size={17} />{t("带走这张练习纸", "Take your worksheet with you")}</h3><p>{t("打印全部题目，或导出可复现的 JSON 文件。", "Print every question or export a reproducible JSON file.")}</p></div><div className="math-print-options"><label>{t("列数", "Columns")}<select value={printColumns} onChange={(event) => setPrintColumns(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option value={value} key={value}>{value}</option>)}</select></label><label>{t("行间距", "Row gap")}<select value={printGap} onChange={(event) => setPrintGap(Number(event.target.value))}>{[12, 22, 36, 52].map((value) => <option value={value} key={value}>{value} px</option>)}</select></label><label className="math-print-check"><input type="checkbox" checked={printAnswers} onChange={(event) => setPrintAnswers(event.target.checked)} />{t("附答案", "Answers")}</label><button className="math-btn math-btn-soft" onClick={printWorksheet} disabled={printing}><Printer size={15} />{t("打印", "Print")}</button></div><div className="math-downloads"><button className="math-inline" onClick={() => downloadJson(`worksheet-${worksheet.seed}.json`, { seed: worksheet.seed, options: worksheet.options, questions: worksheet.questions.map(({ id, expression, kind }) => ({ id, expression, kind })) })}><Download size={15} />{t("题目 JSON", "Questions JSON")}</button><button className="math-inline" onClick={() => downloadJson(`answers-${worksheet.seed}.json`, { seed: worksheet.seed, options: worksheet.options, questions: worksheet.questions })}><Download size={15} />{t("题目与答案 JSON", "Questions & answers JSON")}</button><code title={worksheet.seed}>Seed: {worksheet.seed}</code></div></div>
          </> : <div className="math-empty-practice"><div className="math-empty-art" aria-hidden="true"><div className="math-mini-paper"><span>01 &nbsp; 24 + 18 = <i /></span><span>02 &nbsp; 8 × 6 − 9 = <i /></span><span>03 &nbsp; (36 + 4) ÷ 5 = <i /></span><b><Check size={23} /></b></div><span className="math-floating-symbol">÷</span><span className="math-floating-plus">+</span></div><h3>{t("每一份练习，都可以刚刚好。", "A worksheet that fits.")}</h3><p>{t("调整左侧规则，生成一份属于你的练习。\n支持 300 道周练，也支持一万道不重复题目。", "Choose your rules to create a worksheet.\nFrom 300 weekly exercises to 10,000 unique questions.")}</p><div className="math-empty-features"><span><Check size={14} />{t("精确分数", "Exact fractions")}</span><span><Check size={14} />{t("自动批改", "Auto grading")}</span><span><Check size={14} />{t("打印与导出", "Print & export")}</span></div></div>}
        </section>
      </div>
      <section className="math-engine-note"><BookOpen size={21} /><div><h3>{t("从表达式，到可解释的结果", "From an expression to an explainable result")}</h3><p>{t("表达式使用调度场算法转换为逆波兰表达式，再用精确有理数求值。四则运算与 24 点复用同一计算核心。", "The shunting-yard algorithm converts expressions to reverse Polish notation. Exact rational evaluation is shared by worksheets and the 24 challenge.")}</p></div></section>
    </>}

    {section === "history" && <section className="math-panel math-history"><div className="math-panel-title"><History size={21} /><div><h2>{t("看见每一次练习", "See your practice over time")}</h2><p>{t("最多保存 50 条当前浏览器的练习摘要，不是云端同步。重做会按原规则与种子重新出题。", "Up to 50 summaries are stored in this browser only. Retry regenerates the original rules and seed.")}</p></div><button className="math-inline" disabled={!attempts.length || !!busy} onClick={() => storeAttempts([])}><Eraser size={16} />{t("清空记录", "Clear history")}</button></div>{attempts.length ? <div className="math-history-list">{attempts.map((attempt) => <article key={attempt.id}><div className="math-history-icon"><ListChecks size={20} /></div><div className="math-history-info"><h3>{t(`${attempt.count.toLocaleString()} 道四则运算`, `${attempt.count.toLocaleString()} arithmetic questions`)}</h3><p>{new Date(attempt.date).toLocaleString(language === "zh" ? "zh-CN" : "en-GB")}<span>·</span>{timeText(attempt.elapsed)}</p><small title={attempt.seed}>Seed: {attempt.seed}</small></div><div className="math-history-score"><strong>{(attempt.accuracy * 100).toFixed(1)}%</strong><span>{attempt.correct} / {attempt.count}</span></div><button className="math-btn math-btn-soft" disabled={!!busy || !config} onClick={() => { const retryOptions = { ...attempt.options, seed: attempt.seed }; changeOptions(retryOptions); void generate(retryOptions); }}><RotateCcw size={15} />{t("重做", "Retry")}</button><button className="math-icon-button" disabled={!!busy} aria-label={t("删除此记录", "Delete this record")} onClick={() => storeAttempts(attempts.filter((item) => item.id !== attempt.id))}><Trash2 size={17} /></button></article>)}</div> : <div className="math-blank"><History size={36} /><h3>{t("你的下一次进步，从这里留下记录。", "Your next step forward starts here.")}</h3><p>{t("完成整卷批改后，会自动保存准确率、用时和复现信息。", "After grading, the score, time, and reproducibility details are saved here.")}</p><button className="math-btn math-btn-primary" onClick={() => switchSection("practice")}>{t("开始练习", "Start practice")}<ArrowRight size={16} /></button></div>}</section>}

    {section === "24" && <div className="math-24-layout"><section className="math-panel math-24-board"><div className="math-panel-title"><span className="math-step">24</span><div><h2>{t("四个数字，一个目标。", "Four numbers. One goal.")}</h2><p>{t("每个数字恰好使用一次，用 + − × ÷ 和括号算出 24。", "Use each number exactly once with + − × ÷ and parentheses to make 24.")}</p></div></div><div className="math-playing-cards">{(cards.length ? cards : [null, null, null, null]).map((value, index) => <div className={`math-playing-card ${index % 2 ? "red" : ""}`} key={index}><small>{value ?? "·"}<span>{index % 2 ? "♦" : "♠"}</span></small><strong>{value ?? "?"}</strong><small>{value ?? "·"}<span>{index % 2 ? "♦" : "♠"}</span></small></div>)}</div><div className="math-24-actions"><button className="math-btn math-btn-primary" onClick={newCards} disabled={!!busy || !config}><Shuffle size={17} />{cards.length ? t("换一组", "New numbers") : t("抽取四个数字", "Draw four numbers")}</button>{cards.length > 0 && <button className="math-btn math-btn-soft" onClick={revealHint} disabled={!!busy}><Lightbulb size={17} />{t("查看一个解法", "Reveal a solution")}</button>}</div><form className="math-24-form" onSubmit={(event) => { event.preventDefault(); if (cards.length && cardExpression.trim()) void checkCards(); }}><label htmlFor="math-24-expression">{t("你的表达式", "Your expression")}</label><div><input id="math-24-expression" value={cardExpression} onChange={(event) => { setCardExpression(event.target.value); setCardResult(null); }} disabled={!cards.length || !!busy} maxLength={256} autoComplete="off" spellCheck={false} placeholder={t("例如：(8 − 2) × (3 + 1)", "Example: (8 - 2) * (3 + 1)")} /><button className="math-btn math-btn-primary" type="submit" disabled={!cards.length || !cardExpression.trim() || !!busy}>{t("验证", "Check")}<ArrowRight size={17} /></button></div><p>{t("支持键盘 * / 或 × ÷；不能拼接数字、使用幂运算或一元负号替代卡片。", "Use * / or × ÷. Concatenation, exponents, and unary signs are not allowed.")}</p></form>{cardResult && <div className={`math-card-result ${cardResult.correct ? "correct" : "incorrect"}`} role="status">{cardResult.correct ? <Check size={20} /> : <CircleAlert size={20} />}<div><strong>{cardResult.correct ? t("恰好是 24，挑战成功！", "Exactly 24. Well solved!") : t("再试一试", "Try again")}</strong><p>{cardResult.message ? localizedMessage(cardResult.message, language) : `${t("结果", "Result")}: ${cardResult.answer}`}</p>{cardResult.rpn && <code>RPN: {cardResult.rpn.join(" ")}</code>}</div></div>}{hint && <div className="math-hint"><Lightbulb size={18} /><div><span>{t("一种可行思路", "One possible solution")}</span><strong>{displayExpression(hint)}</strong></div></div>}{cardSeed && <p className="math-seed-label">Seed: {cardSeed}</p>}</section><aside className="math-24-note"><span className="math-kicker">THE SAME CORE, A NEW EXPERIENCE</span><h3>{t("复用，而不是重新发明。", "Reuse the core. Create a new experience.")}</h3><p>{t("24 点和四则运算共享表达式解析、运算优先级与精确求值能力。新的玩法，建立在已经验证的模块之上。", "The 24 challenge shares expression parsing, precedence, and exact evaluation with arithmetic practice. New features build on tested modules.")}</p><div><span>01</span>{t("验证四张数字各使用一次", "Validate each number is used once")}</div><div><span>02</span>{t("转换为逆波兰表达式", "Convert to reverse Polish notation")}</div><div><span>03</span>{t("精确判断结果是否等于 24", "Check the result equals 24 exactly")}</div></aside></div>}

    {section === "ocr" && <MathOCRPanel language={language} />}
    {evaluation && <div className="math-modal-backdrop" onClick={() => setEvaluation(null)}><section className="math-modal" role="dialog" aria-modal="true" aria-labelledby="math-evaluation-title" onClick={(event) => event.stopPropagation()}><div className="math-panel-title"><BookOpen size={20} /><h2 id="math-evaluation-title">{t("这道题如何计算", "How this expression is evaluated")}</h2><button ref={modalCloseRef} className="math-icon-button" onClick={() => setEvaluation(null)} aria-label={t("关闭解析", "Close explanation")}><X size={19} /></button></div><div className="math-evaluation-expression">{displayExpression(evaluation.expression)} = <b>{evaluation.answer}</b></div><h3>{t("逆波兰表达式 RPN", "Reverse Polish notation")}</h3><code>{evaluation.rpn.join(" ")}</code><p>{t("依次读取数字并入栈，遇到运算符时取出操作数计算，再把结果压回栈。括号与优先级已在转换阶段处理。", "Read each number onto a stack. For each operator, pop its operands, calculate, then push the result. Parentheses and precedence were resolved during conversion.")}</p></section></div>}
    {printing && worksheet && <section className="math-print-sheet" style={{ "--math-print-columns": printColumns, "--math-print-gap": `${printGap}px` } as CSSProperties}><h1>{t("四则运算练习", "Arithmetic worksheet")}</h1><div className="math-print-meta"><span>{t("姓名：____________", "Name: ____________")}</span><span>{t("日期：____________", "Date: ____________")}</span><span>{worksheet.questions.length} {t("题", "questions")}</span></div><div className="math-print-questions">{worksheet.questions.map((question, index) => <div key={question.id}><span>{index + 1}. {displayExpression(question.expression)} = {printAnswers ? question.answer : "________"}</span></div>)}</div><footer>SE Lab · {t("复现种子", "Seed")}: {worksheet.seed}</footer></section>}
  </div>;
}
