"use client";

import { ArrowRight, ArrowUpRight, BookOpen, Code2, GitBranch, Layers } from "lucide-react";
import { PlanetOrb } from "./planet-orb";
import "./origin-profile.css";

const repository = "https://github.com/coder9231/modern-software-engineering-project";

export default function OriginProfile({ onNavigate }: { onNavigate: (destination: "counter" | "math" | "practice") => void }) {
  return <div className="origin-profile">
    <section className="origin-hero">
      <div className="origin-orb" aria-hidden="true"><PlanetOrb kind="origin" /><span>ORIGIN / 04</span></div>
      <div><p className="origin-kicker">EXPLORER PROFILE · 起源星</p><h1>每一个作品，<br />都从一次好奇开始。</h1><div className="origin-identity"><span className="origin-avatar" aria-hidden="true">C</span><div><h2>coder9231</h2><p>GitHub / 现代软件工程课程项目</p></div></div><p className="origin-bio">把课堂里的软件工程方法，变成可以运行的工具。<br />在一次次构建、验证与迭代中，让这个小宇宙慢慢生长。</p><a href="https://github.com/coder9231" target="_blank" rel="noreferrer" className="origin-link"><GitBranch size={16} />访问 GitHub<ArrowUpRight size={15} /></a></div>
    </section>
    <div className="origin-section-title"><div><span>BUILT SO FAR</span><h2>已经点亮的作品</h2></div><p>从想法走到可以亲手使用的功能。</p></div>
    <div className="origin-works">
      <button onClick={() => onNavigate("counter")} className="origin-work"><span className="origin-work-symbol"><Code2 size={24} /></span><small>01 / DATA</small><h3>代码量统计</h3><p>读懂项目的代码、注释与空白行，保留清楚的统计规则和可导出的结果。</p><span className="origin-work-action">前往数据星<ArrowRight size={16} /></span></button>
      <button onClick={() => onNavigate("math")} className="origin-work"><span className="origin-work-symbol gold"><Layers size={24} /></span><small>02 / LOGIC</small><h3>四则运算实验室</h3><p>可定制的练习、精确批改与 24 点挑战，让同一个数学核心支持不同体验。</p><span className="origin-work-action">前往逻辑星<ArrowRight size={16} /></span></button>
      <button onClick={() => onNavigate("practice")} className="origin-work"><span className="origin-work-symbol violet"><BookOpen size={24} /></span><small>03 / BUILD</small><h3>工程实践记录</h3><p>把需求、设计选择和验证证据连接起来，理解软件为什么这样构建。</p><span className="origin-work-action">前往建造星<ArrowRight size={16} /></span></button>
    </div>
    <section className="origin-journal"><div><span className="origin-kicker">A STORY STILL UNFOLDING</span><h2>档案仍在书写。</h2><p>个人介绍、成员职责与更多作品将随项目继续补充。<br />目前展示的是这个团队课程项目已经实现的内容。</p></div><a href={`${repository}/tree/main/docs/decisions`} target="_blank" rel="noreferrer">阅读设计记录<ArrowUpRight size={16} /></a></section>
  </div>;
}
