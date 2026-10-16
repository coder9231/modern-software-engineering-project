"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, CircleAlert, FilePenLine, ImageOff, ListChecks, LoaderCircle, RotateCcw, ScanLine, Upload } from "lucide-react";
import "./math-ocr-panel.css";

type Language = "zh" | "en";
type ServiceStatus = "checking" | "unconfigured" | "unavailable" | "ready";
type Grade = {
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  results: { id: string; expression: string; submitted: string; expected: string; correct: boolean; message?: string }[];
};

const maximumRows = 100;
const maximumImageBytes = 4 * 1024 * 1024;
const sample = "12 + 8 * 2 = 28\n(9 - 3) / 2 = 4\n1 / 2 + 1 / 4 = 3/4";

async function imageBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

export default function MathOCRPanel({ language }: { language: Language }) {
  const inputId = useId();
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>("checking");
  const [statusRetry, setStatusRetry] = useState(0);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [recognitionError, setRecognitionError] = useState("");
  const [recognitionNotice, setRecognitionNotice] = useState<{ rows: number; uncertain: number[] } | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "grade" | "recognize">("");
  const requestRef = useRef<AbortController | null>(null);
  const t = (zh: string, en: string) => language === "zh" ? zh : en;
  const lineCount = input.split(/\r?\n/).filter((line) => line.trim()).length;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/math/ocr", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("status");
      const status = await response.json() as { configured?: boolean };
      setServiceStatus(status.configured === true ? "ready" : status.configured === false ? "unconfigured" : "unavailable");
    }).catch((failure) => {
      if (!(failure instanceof Error) || failure.name !== "AbortError") setServiceStatus("unavailable");
    });
    return () => controller.abort();
  }, [statusRetry]);

  useEffect(() => () => requestRef.current?.abort(), []);

  function changeInput(value: string) {
    setInput(value);
    setGrade(null);
    setError("");
  }

  function chooseImage(nextFile: File | undefined) {
    setRecognitionError("");
    setFile(null);
    if (!nextFile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(nextFile.type) || !nextFile.size || nextFile.size > maximumImageBytes) {
      setRecognitionError(t("请选择不超过 4 MiB 的 PNG、JPEG 或 WebP 图片。", "Choose a PNG, JPEG, or WebP image up to 4 MiB."));
      return;
    }
    setFile(nextFile);
  }

  async function recognize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current || serviceStatus !== "ready" || !file || !accessCode.trim()) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    setBusy("recognize");
    setRecognitionError("");
    try {
      const encoded = await imageBase64(file);
      if (controller.signal.aborted) return;
      const response = await fetch("/api/math/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ocr-access-code": accessCode.trim() },
        body: JSON.stringify({ imageBase64: encoded, mimeType: file.type }),
        signal: controller.signal,
      });
      const result = await response.json() as { rows?: { expression: string; submitted: string; uncertain: boolean }[]; requiresReview?: boolean; error?: string | { code?: string; message?: string } };
      if (!response.ok) {
        const message = typeof result.error === "string" ? result.error : result.error?.message;
        if (typeof result.error === "object" && result.error?.code === "ocr_not_configured") setServiceStatus("unconfigured");
        throw new Error(language === "zh" && message ? message : response.status === 403 ? "The access code was rejected." : "Recognition could not be completed. Please retry later.");
      }
      if (!Array.isArray(result.rows) || !result.rows.length || result.rows.length > maximumRows || result.requiresReview !== true || result.rows.some((row) => !row || typeof row.expression !== "string" || row.expression.length > 256 || typeof row.submitted !== "string" || row.submitted.length > 256 || typeof row.uncertain !== "boolean")) {
        throw new Error(t("识别返回的内容无法使用，请手动录入或稍后重试。", "The recognition result could not be used. Enter the exercises manually or retry later."));
      }
      changeInput(result.rows.map(({ expression, submitted }) => `${expression.replace(/[\r\n]/g, " ")} = ${submitted.replace(/[\r\n]/g, " ")}`).join("\n"));
      setRecognitionNotice({ rows: result.rows.length, uncertain: result.rows.flatMap((row, index) => row.uncertain ? [index + 1] : []) });
    } catch (failure) {
      setRecognitionError(failure instanceof Error && failure.name === "AbortError"
        ? t("识别请求已取消或超时，请重试。", "Recognition was cancelled or timed out. Please retry.")
        : failure instanceof Error ? failure.message : t("识别失败，请稍后重试。", "Recognition failed. Please retry later."));
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      setBusy("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current) return;
    setError("");
    setGrade(null);
    const lines = input.split(/\r?\n/).map((text, index) => ({ text: text.trim(), line: index + 1 })).filter(({ text }) => text);
    if (!lines.length || lines.length > maximumRows) {
      setError(t(`请录入 1～${maximumRows} 道题，每行一道。`, `Enter 1–${maximumRows} questions, one per line.`));
      return;
    }
    const questions: { id: string; expression: string; kind: "normal" | "remainder" }[] = [];
    const answers: Record<string, string> = {};
    for (const { text, line } of lines) {
      const parts = text.replaceAll("＝", "=").split("=");
      if (parts.length !== 2 || !parts[0].trim()) {
        setError(t(`第 ${line} 行请使用“算式 = 答案”格式；未作答可留空答案。`, `Line ${line}: use expression = answer. Leave the answer blank if unanswered.`));
        return;
      }
      const expression = parts[0].trim();
      const answer = parts[1].trim();
      if (expression.length > 256 || answer.length > 256) {
        setError(t(`第 ${line} 行的算式和答案各不能超过 256 个字符。`, `Line ${line}: the expression and answer must each be at most 256 characters.`));
        return;
      }
      const id = `manual-${line}`;
      questions.push({ id, expression, kind: /^\d+\s*(?:r|余数?|…|\.{3})\s*\d+$/iu.test(answer) ? "remainder" : "normal" });
      answers[id] = answer;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setBusy("grade");
    try {
      const response = await fetch("/api/math/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, answers }),
        signal: controller.signal,
      });
      const result = await response.json() as Grade & { error?: string | { message?: string } };
      if (!response.ok) {
        const message = typeof result.error === "string" ? result.error : result.error?.message;
        throw new Error(language === "zh" && message ? message : "Please check that each expression is valid and retry.");
      }
      setGrade(result);
    } catch (failure) {
      setError(failure instanceof Error && failure.name === "AbortError"
        ? t("批改请求已取消或超时，输入内容已保留。", "The grading request was cancelled or timed out. Your input is preserved.")
        : language === "zh" && failure instanceof Error
          ? `${t("未能完成批改：", "Grading failed: ")}${failure.message}`
          : "Grading could not be completed. Check each expression and your connection, then retry.");
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      setBusy("");
    }
  }

  const serviceMessage = serviceStatus === "checking"
    ? t("正在检查识别服务状态…", "Checking recognition service status…")
    : serviceStatus === "unconfigured"
      ? t("AI 识别尚未配置，当前可手动录入批改。", "AI recognition is not configured. Manual entry and grading are available.")
      : serviceStatus === "unavailable"
        ? t("暂时无法确认识别服务状态，当前可手动录入批改。", "Recognition status is unavailable. Manual entry and grading are available.")
        : t("识别服务已配置。上传后请逐行核对识别内容，再提交批改。", "Recognition is configured. Review every extracted line before grading.");

  return <div className="math-ocr-layout">
    <aside className="math-panel math-ocr-service">
      <div className="math-panel-title"><span className="math-step"><ScanLine size={17} /></span><div><h2>{t("拍照识别与批改", "Photo recognition & grading")}</h2><p>{t("从纸面练习到可核验的结果", "From paper exercises to verifiable results")}</p></div></div>
      <div className="math-ocr-placeholder">{serviceStatus === "ready" ? <ScanLine size={39} strokeWidth={1.3} /> : <ImageOff size={39} strokeWidth={1.3} />}<span>{serviceStatus === "ready" ? t("识别 · 核对 · 批改", "Recognize · review · grade") : t("图片识别待配置", "Image recognition is pending")}</span><p>{t("识别印刷体或手写算式后，先由你核对内容，再用数学服务判断答案。", "Review extracted printed or handwritten expressions before the math service checks the answers.")}</p></div>
      <div className="math-ocr-status" role="status">{serviceStatus === "checking" ? <LoaderCircle className="math-spin" size={16} /> : <CircleAlert size={16} />}<p>{serviceMessage}</p></div>
      {serviceStatus === "ready" ? <form className="math-ocr-upload" onSubmit={recognize}>
        <label htmlFor={`${inputId}-image`}>{t("选择练习图片", "Choose an exercise image")}</label>
        <input id={`${inputId}-image`} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage(event.target.files?.[0])} disabled={!!busy} />
        <p>{file ? file.name : t("PNG / JPEG / WebP，最大 4 MiB", "PNG / JPEG / WebP, up to 4 MiB")}</p>
        <label htmlFor={`${inputId}-access`}>{t("识别访问码", "Recognition access code")}</label>
        <input id={`${inputId}-access`} type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} maxLength={256} autoComplete="off" disabled={!!busy} />
        <small>{t("访问码由站点维护者提供，仅在当前面板内存中使用。", "Provided by the site maintainer and kept only in this panel's memory.")}</small>
        <button className="math-btn math-btn-primary" type="submit" disabled={!!busy || !file || !accessCode.trim()}>{busy === "recognize" ? <LoaderCircle className="math-spin" size={16} /> : <Upload size={16} />}{busy === "recognize" ? t("识别中…", "Recognizing…") : t("上传并识别", "Upload & recognize")}</button>
        <p>{t("点击后图片会经本站发送给 OpenAI 识别服务，新的识别内容将替换右侧文本。", "Clicking sends the image through this site to OpenAI for recognition. Extracted text replaces the current entries.")}</p>
      </form> : <button className="math-btn math-btn-soft math-ocr-disabled" type="button" disabled><ScanLine size={16} />{t("识别图片（尚未开放）", "Recognize image (unavailable)")}</button>}
      {recognitionError && <div className="math-message math-error math-ocr-error" role="alert"><CircleAlert size={17} /><span>{recognitionError}</span></div>}
      {serviceStatus !== "checking" && <button type="button" className="math-inline math-ocr-retry" disabled={!!busy} onClick={() => { setServiceStatus("checking"); setStatusRetry((value) => value + 1); }}><RotateCcw size={13} />{t("重新检查服务状态", "Check service status again")}</button>}
      <p className="math-ocr-privacy">{serviceStatus === "ready" ? t("选择文件不会自动上传。识别结果可能有误，请核对后批改。", "Choosing a file does not upload it. Recognition may be inaccurate; review before grading.") : t("识别未开放时不会上传图片或调用 AI 服务。", "When recognition is unavailable, no images are uploaded and no AI service is called.")}{" "}{t("手动录入内容仅发送给本站数学服务，面板不保存批改记录。", "Manual entries are sent only to this site's math service. This panel does not save grading history.")}</p>
    </aside>

    <section className="math-panel math-ocr-manual">
      <div className="math-panel-title"><span className="math-step"><FilePenLine size={17} /></span><div><h2>{t("手动录入，立即批改", "Enter exercises and check answers")}</h2><p>{t("标准答案由服务器重新计算，不依赖输入的答案。", "The server calculates the expected answers from the expressions.")}</p></div></div>
      {recognitionNotice && <div className="math-ocr-review" role="status"><CircleAlert size={17} /><p>{t(`已提取 ${recognitionNotice.rows} 行，请逐行核对并修改后，再点击批改。`, `${recognitionNotice.rows} lines extracted. Review and correct every line before grading.`)}{recognitionNotice.uncertain.length > 0 && <strong>{t(` 第 ${recognitionNotice.uncertain.join("、")} 行识别不确定，请重点核对。`, ` Uncertain lines: ${recognitionNotice.uncertain.join(", ")}. Please review carefully.`)}</strong>}</p></div>}
      <form onSubmit={submit}>
        <label htmlFor={inputId}>{t("每行输入“算式 = 答案”", "Enter expression = answer, one per line")}</label>
        <p id={`${inputId}-help`} className="math-ocr-input-help">{t("支持 + − × ÷、括号和分数。未作答请保留等号；带余数答案用“2 R 1”，仅用于非负整数单次除法。", "Use + − × ÷, parentheses, and fractions. Keep = for an unanswered question. Use 2 R 1 for remainders in a single non-negative integer division.")}</p>
        <textarea id={inputId} value={input} onChange={(event) => changeInput(event.target.value)} placeholder={sample} aria-describedby={`${inputId}-help`} maxLength={60_000} spellCheck={false} autoComplete="off" disabled={!!busy} rows={9} />
        <div className="math-ocr-input-footer"><span className={lineCount > maximumRows ? "is-over-limit" : ""}>{lineCount} / {maximumRows} {t("题", "questions")}</span><button type="button" className="math-inline" disabled={!!busy} onClick={() => { changeInput(sample); setRecognitionNotice(null); }}>{t("填入演示文本", "Fill sample text")}</button></div>
        <div className="math-ocr-submit"><p>{t("可编辑后重新提交；分数与等值小数按精确数值比较。", "Edit and submit again. Fractions and equivalent decimals are compared exactly.")}</p><button className="math-btn math-btn-primary" type="submit" disabled={!!busy || !input.trim()}>{busy === "grade" ? <LoaderCircle className="math-spin" size={17} /> : <ListChecks size={17} />}{busy === "grade" ? t("批改中…", "Checking…") : t("批改录入内容", "Check entries")}{!busy && <ArrowRight size={16} />}</button></div>
      </form>
      {error && <div className="math-message math-error math-ocr-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
      {grade && <section className="math-ocr-results" aria-label={t("手动批改结果", "Manual grading results")}>
        <div className="math-ocr-summary" role="status"><div><span>{t("批改完成", "Grading complete")}</span><h3>{grade.correct} / {grade.total} {t("题正确", "correct")}</h3><p>{t(`已作答 ${grade.answered} 题`, `${grade.answered} answered`)}</p></div><strong>{Math.round(grade.accuracy * 100)}<small>%</small></strong></div>
        <ol>{grade.results.map((row) => <li key={row.id} className={row.correct ? "is-correct" : "is-wrong"}><div className="math-ocr-row-state">{row.correct ? <Check size={15} /> : <CircleAlert size={15} />}<span>{row.correct ? t("正确", "Correct") : !row.submitted ? t("未作答", "Unanswered") : t("需订正", "Review")}</span></div><div className="math-ocr-row-expression">{row.expression.replace(/\*/g, "×").replace(/\//g, "÷")} = <b>{row.submitted || "—"}</b></div><p>{t("标准答案", "Expected answer")}<strong>{row.expected}</strong>{row.message && row.submitted && <span>{language === "zh" ? row.message : "Check the answer format."}</span>}</p></li>)}</ol>
      </section>}
    </section>
  </div>;
}
