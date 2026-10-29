# M0 文档验证证据

状态：已通过 M0 文档验证。观察日期：2026-10-29（Asia/Hong_Kong）。

## 验证边界

本报告对应 [M0 执行计划](../plans/m0-documentation.md) 的 `T-DOC-01`。校验覆盖根目录及 `docs/` 下的 Markdown，包括未跟踪的新文件。链接检查验证本地目标和标题/源码行号；外部 URL 仅检查语法，一手资料的实际读取情况另行记录。

以下检查不安装依赖，不创建 workspace，不执行历史业务构建、lint、Vitest 或浏览器测试。通过文档校验不表示新版功能已实现。

## 执行与结果

工作目录：`D:/source/alchemion`。Node.js：`v24.14.0`。实际 HEAD 与业务代码基准均为 `06784cf0a61d09c76906086bebac773459f5b33d`；本轮未创建提交。

| 检查 | 实际结果 |
|---|---|
| 本报告所附只读校验器 | 退出码 0，errors 为空；覆盖 22 份 Markdown。 |
| 本地链接 | 215 处目标存在，包含源码行号 6 处；Markdown 标题锚点通过。 |
| 外部 URL | 18 处引用语法正确；不等于逐个联网 HTTP 可用性检查。 |
| 需求覆盖 | R-001–R-024 恰好 24 条定义，每条包含阶段和测试映射，无未定义引用。 |
| 测试场景 | 恰好 20 条场景定义，每条映射需求，无未定义引用；这是文档定义校验，未执行业务测试。 |
| 执行计划 | M0–M6 共 7 份，必要栏目完整。 |
| 指令体积 | 根 AGENTS.md 3,278 字节，docs/AGENTS.md 1,640 字节，仓库指令链合计 4,918 字节。 |
| 文本结构 | UTF-8、末尾换行、尾随空白与代码围栏检查通过。 |
| Git 改动范围 | `git diff --name-only HEAD` 为空；新增文件恰好 22 份 Markdown，原有跟踪文件零改动。 |
| `git diff --check` | 退出码 0；未跟踪新文件另由本报告校验器检查，不依赖 diff 忽略新文件的结果。 |
| 依赖状态 | `Test-Path -LiteralPath node_modules` 返回 False；没有安装依赖。 |

人工与独立子代理复核了接管路径、阶段映射、源码证据、公开边界、格式损失、load 提交前后失败语义及性能采样。发现并修正了干净 checkout 中消费者检查依赖 SDK 声明/Worker 产物的顺序问题。M1、M2 可从文档直接开始，M2 仍须实测后定案。

规划阶段已读取 OpenAI AGENTS/ExecPlans、IUCr CIF、BIOVIA CTfile、VASP POSCAR、Three.js 和 Babylon.js 一手资料，用于指令组织、格式范围与候选能力说明；没有据此宣称本项目已符合标准或达到性能目标。数据文件的来源/许可外部核验仍保持待核实。

## 可重复执行的方法

工作目录为仓库根目录，需要 Node.js。下面的 PowerShell 命令从本报告提取只读校验器并执行：

```powershell
$taskReportText = Get-Content -LiteralPath docs/evidence/m0-validation.md -Raw -Encoding utf8
$taskValidatorCode = [regex]::Match($taskReportText, '(?s)<!-- validator:start -->\s*```javascript\s*(.*?)\s*```\s*<!-- validator:end -->').Groups[1].Value
if (-not $taskValidatorCode) { throw 'Validation code not found' }
$taskValidatorCode | node -
```

校验器同时覆盖 UTF-8、末尾换行、尾随空白、代码围栏、相对链接、标题和源码行号、需求编号、测试编号、计划栏目、指令体积及改动范围。它仅适用于本次“原有跟踪文件零改动、全部新增内容为 Markdown”的 M0 交付；以后实施阶段有正常业务改动时，应使用当时的工程检查，不能套用这里的零改动约束。

<!-- validator:start -->
```javascript
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = process.cwd();
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
const files = ['AGENTS.md','README.md','PLANS.md',...walk('docs').filter(f=>f.endsWith('.md'))];
const errors = [];
const texts = new Map();
let localLinks=0, externalLinks=0, sourceLineLinks=0;
for (const f of files) {
  const bytes=fs.readFileSync(f);
  let s='';
  try { s=new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { errors.push(f+': invalid UTF-8'); }
  texts.set(f.replaceAll('\\','/'),s);
  if (!s.endsWith('\n')) errors.push(f+': missing final newline');
  s.split(/\r?\n/).forEach((l,i)=>{ if (/[ \t]+$/.test(l)) errors.push(f+':'+(i+1)+': trailing whitespace'); });
  if ((s.match(/^\x60{3}/gm)||[]).length%2) errors.push(f+': unbalanced code fences');
}
const slug = s => s.toLowerCase().replace(/<[^>]*>/g,'').replace(/[\x60*_]/g,'').replace(/[^\p{L}\p{N}_\-\s]/gu,'').trim().replace(/\s/g,'-');
for (const [f,s] of texts) {
  for (const m of s.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const raw=m[1].trim().replace(/^<|>$/g,'');
    if (/^https?:/.test(raw)) { externalLinks++; try { new URL(raw); } catch { errors.push(f+': malformed URL '+raw); } continue; }
    if (/^(mailto|data|codex):/.test(raw)) continue;
    localLinks++;
    const [dest,anchor]=raw.split('#');
    let decoded;
    try { decoded=decodeURIComponent(dest); } catch { errors.push(f+': malformed path '+raw); continue; }
    const target=decoded ? path.resolve(path.dirname(path.resolve(f)),decoded) : path.resolve(f);
    if (!target.startsWith(root+path.sep) && target!==root) errors.push(f+': link outside repo '+raw);
    if (!fs.existsSync(target)) { errors.push(f+': broken link '+raw); continue; }
    if (!anchor || !fs.statSync(target).isFile()) continue;
    const content=fs.readFileSync(target,'utf8');
    if (/^L\d+(?:-L?\d+)?$/.test(anchor)) {
      sourceLineLinks++;
      const nums=anchor.match(/\d+/g).map(Number);
      if (nums.some(n=>n<1 || n>content.split(/\r?\n/).length)) errors.push(f+': bad source line '+raw);
    } else if (target.endsWith('.md')) {
      const headings=[...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(x=>slug(x[1]));
      if (!headings.includes(decodeURIComponent(anchor))) errors.push(f+': missing anchor '+raw);
    }
  }
}
const req = new Set([...texts.get('docs/product.md').matchAll(/\bR-\d{3}\b/g)].map(m=>m[0]));
for(let i=1;i<=24;i++) { const id='R-'+String(i).padStart(3,'0'); if (!req.has(id)) errors.push('product missing '+id); }
if(req.size!==24) errors.push('product requirement count '+req.size);
const requirementRows=[...texts.get('docs/product.md').matchAll(/^\|\s*(R-\d{3})\s*\|.*$/gm)];
if(requirementRows.length!==24 || new Set(requirementRows.map(m=>m[1])).size!==24) errors.push('expected exactly 24 unique requirement definition rows');
for(const m of requirementRows) {
  if(!/\bM[0-6]\b/.test(m[0])) errors.push(m[1]+': no implementation stage');
  if(!/\bT-[A-Z]+-\d{2}\b/.test(m[0])) errors.push(m[1]+': no acceptance scenario');
}
const quality=texts.get('docs/quality.md');
const testIds=new Set([...quality.matchAll(/\bT-[A-Z]+-\d{2}\b/g)].map(m=>m[0]));
const testRows=[...quality.matchAll(/^\|\s*(T-[A-Z]+-\d{2})\b.*$/gm)];
if(testRows.length!==20 || new Set(testRows.map(m=>m[1])).size!==20) errors.push('expected exactly 20 unique test definition rows');
for(const m of testRows) if(!/\bR-\d{3}\b/.test(m[0])) errors.push(m[1]+': no mapped requirement');
for(const [f,s] of texts) {
  for(const m of s.matchAll(/\bR-\d{3}\b/g)) if(!req.has(m[0])) errors.push(f+': undefined requirement '+m[0]);
  for(const m of s.matchAll(/\bT-[A-Z]+-\d{2}\b/g)) if(!testIds.has(m[0])) errors.push(f+': undefined test '+m[0]);
}
const plans=[...texts.keys()].filter(f=>/^docs\/plans\/m[0-6]-.*\.md$/.test(f));
if(plans.length!==7) errors.push('expected 7 stage plans, found '+plans.length);
for(const p of plans) {
  const s=texts.get(p);
  for(const section of ['Progress','Surprises & Discoveries','Decision Log','Outcomes & Retrospective']) if(!s.includes(section)) errors.push(p+': missing '+section);
  for(const re of [/^## .*目的/m,/^## .*入口/m,/^## .*实施/m,/^## .*验证/m,/^## .*恢复/m]) if(!re.test(s)) errors.push(p+': missing section '+re);
}
const instructions=['AGENTS.md','docs/AGENTS.md'].map(f=>({file:f,bytes:fs.statSync(f).size}));
if(instructions.reduce((n,x)=>n+x.bytes,0)>=32768) errors.push('instruction chain exceeds default 32KiB');
const changed=cp.execFileSync('git',['diff','--name-only','HEAD'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
if(changed.length) errors.push('tracked files changed: '+changed.join(', '));
const untracked=cp.execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
for(const f of untracked) if(!f.endsWith('.md')) errors.push('non-document addition '+f);
const diffcheck=cp.spawnSync('git',['diff','--check'],{encoding:'utf8'});
if(diffcheck.status!==0) errors.push('git diff --check: '+diffcheck.stdout+diffcheck.stderr);
console.log(JSON.stringify({documents:files.length,localLinks,externalLinks,sourceLineLinks,requirements:req.size,requirementDefinitions:requirementRows.length,testScenarios:testIds.size,testDefinitions:testRows.length,stagePlans:plans.length,instructions,trackedChanges:changed.length,newMarkdown:untracked.length,node:process.version,errors},null,2));
process.exitCode=errors.length?1:0;
```
<!-- validator:end -->

