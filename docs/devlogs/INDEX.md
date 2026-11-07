# 工程演进总目录与系统不变量（Invariants）

本目录是 AlgoTimeMachine 的**跨版本工程记忆**。任何一次改动前都必须先读本文件与最近一篇 DevLog，
再动代码；任何一次迭代完成后必须在此追加对应里程碑文档。规则本体见根目录 `AGENT_GUIDE.md` 的
「智能体反幻觉回味与版本纪律（Iron Laws）」。

## 里程碑索引

| 里程碑 | Commit | 文档 | 一句话结论 |
| --- | --- | --- | --- |
| M1 | `6f94a32` | [M1-genesis-ast-sandbox.md](./M1-genesis-ast-sandbox.md) | Babel AST 词法作用域抓取 + 三层熔断 + Blob Worker 沙箱跑通，死循环可回收 1555 帧 |
| M2 | `638022a` | [M2-stack-unwinding-and-profiler.md](./M2-stack-unwinding-and-profiler.md) | `try...finally { __exitFn() }` 修复递归退栈，引入逐帧 `lineHits` 与双引擎诊断 |
| M3 | `41ad788` | [M3-industrial-workbench-and-2d-dp.md](./M3-industrial-workbench-and-2d-dp.md) | 100vh 工业工作台：2D DP 十字准星、帧间 Diff、火焰图轨、AST IR 透视，判据改为运行时证据 |
| M4 | `23e0a6d` | [M4-logarithmic-heuristics-and-governance.md](./M4-logarithmic-heuristics-and-governance.md) | `O(log n)` 判据闭环、滚动数组状态识别、`[FUSE_*]` 前缀标准化、实测 Benchmark Delta 与 ADR 制度 |
| M5 | `ef934b0` | [M5-call-tree-and-breakpoints.md](./M5-call-tree-and-breakpoints.md) | 带参调用栈签名、重叠子问题精确取证与 A/B 分档、可点击调用树拓扑、行级断点与 Continue to Breakpoint |
| M6 | `772ef79` | [M6-svg-call-tree-and-layout-polish.md](./M6-svg-call-tree-and-layout-polish.md) | 2D SVG 贝塞尔调用树、线性递归算子自动合成、熔断态 Benchmark 语义与 771px 分屏布局精修 |
| M7 | 本次提交 | [M7-auto-memo-and-watch-guards.md](./M7-auto-memo-and-watch-guards.md) | 通用 Top-Down 自动记忆化合成、双指针 vs 迭代累积分档、栈收益 Benchmark 锚点、SVG 树自动聚焦与 Watch 条件守卫 |

## 系统不变量（改任何一处都要三思并同步 DevLog）

1. **TDZ 安全读取**：`buildSafeRead` 生成的 `(() => { try { return x } catch { return undefined } })()` 不可退回
   `typeof x !== 'undefined' ? x : undefined`。`scope.bindings` 包含同一块内**稍后才声明**的 `let/const`，
   回退即让预设 1/2 在第二个快照处抛 ReferenceError。
2. **帧回收双写**：`__frames` 必须同时挂到 `globalThis.__mtmFrames`，`sandboxRunner` 的 catch 分支靠它回传
   熔断前现场；删掉则死循环演示显示 0 帧。
3. **顶层覆盖**：插桩 visitor 必须是 `'BlockStatement|Program'`。只留 `BlockStatement` 会让顶层语句零帧、
   stdout 永不可见，且末帧无法证明退栈。
4. **退栈契约**：函数体必须是 `enterStmt; try { enterSnap + body } finally { __exitFn() }`，
   并以 `__instrumented` 标记防止对生成的 try/finally 块重复插桩。
5. **逐帧热力**：`__trace` 内累计 `__lineHits` 且每帧 `{ ...__lineHits }` 快照；行级热力图、
   `analyzeTraceMetrics` 的热点行、火焰图 hotspot 着色全部依赖它。
6. **判据只信运行时证据**：复杂度分支禁止使用函数名字符串匹配（`includes('fib')` 已下线）。
   递归看 `maxStackDepth`，二维表看 `dp` 的真实维度形态，折半看 `low/high/mid` 三元组与帧数预算。
7. **异常前缀契约**：熔断消息统一为 `[FUSE_STEP_LIMIT]` / `[FUSE_STACK_OVERFLOW]` / `[FUSE_WATCHDOG_TIMEOUT]`，
   `src/**` 零 emoji。`aiDiagnostics` 的死循环谓词与该前缀字面量耦合——**改文案必须同步改谓词**。
8. **行号对齐前提**：`retainLines: true` 是 `frame.line` 与编辑器行号一一对应的前提，移除即热力错位。
9. **Tailwind 标度补丁**：`h-13`（52px 火焰轨）与 `py-0.2`（微徽章）来自 `extend.spacing`，
   删配置不删标记会静默丢样式（构建不报错，最难查的一类回归）。
10. **tsconfig 严格度**：`noUnusedLocals` 生效，任何未使用的 import 直接让 `npm run build` 失败。
11. **带参调用栈签名与重叠子问题计数契约**：`__enterFn(name, line, args)` 三参形态不可回退，`__callStack` 压入
    `__sig(name, args)` 生成的 `fib(5)` / `dfs(1,2)` 形态签名（无参为 `fn()`，单实参序列化截断 24 字符）。
    下游三处消费者依赖该格式，改动必须同步核对：
    （a）`analyzeTraceMetrics` 按**「函数进入」事件帧的栈顶签名**累计 `signatureHits` 与 `redundantCallCount`——
    不能用相邻帧栈深增量，兄弟调用栈深不变会整段漏计；
    （b）递归分支以 `redundantCallCount >= 2` 区分 `O(2^n) Exponential`（有重叠子问题铁证）与
    `O(n) Linear Recursion`（单链下潜，`[TAIL_RECURSION_CANDIDATE]`），只看栈深会误判线性深递归；
    （c）`buildCallTree` 用相邻帧 `callStack` 的**最长公共前缀**做 push/pop 事件建模，每个激活节点独立 id 与
    进出帧区间；按签名路径字符串建索引会让不同兄弟子树撞成同一节点。
    另外调用栈根帧恒为字符串 `main()`，`__exitFn` 仅在 `length > 1` 时 pop，任何签名改造都不得影响这两条。
12. **771px 窄视口顶栏与禁止单行滚动条契约**（M6 实测确立，截图审查是它的守门人）：
    （a）顶栏 `h-11` 与所有 `h-9` 子标题栏必须 `whitespace-nowrap` 单行，且验收标准是
    `scrollWidth == clientWidth`（不折行还不够——`overflow-hidden` 会把 Apply 按钮裁到可视区外，控件必须可达）；
    （b）**严禁在单行代码 `<span>` 上使用 `overflow-x-auto`**，横向滚动责任属于外层容器
    （`overflow-auto` + 行容器 `inline-block min-w-full`），否则 Chromium 会给每一行各画一条原生粗灰滚动条；
    滚动条外观统一由 `src/index.css` 全局给出（5px / 轨道 `#090B10` / 滑块 `#27272a` / 圆角 3px），
    窄视口可压缩区仅允许预设切换器（`min-w-0 flex-1 overflow-x-auto no-scrollbar`）；
    （c）复杂度徽章放在面板内部遥测条，不塞进 `h-9` 标题栏；长尾文案用 `xl:` 分级隐藏而非缩小字号；
    （d）熔断截断的基线与完整重跑之间**禁止计算帧数百分比**，只能显示
    `STATUS: FUSE_ABORTED → COMPLETED`；帧数变化在非截断态才可用 `FRAMES: a → b (x%)` 表述。
13. **合成一致性契约**（M7 确立，防止「判据与自家产物打架」这类反复出现的病灶）：
    （a）**源码嗅探只能服务于代码生成**——`extractFunctionInfo` / `sniffCombineOperator` 读源码定位函数体与
    合并算子；复杂度判档（A / A′ / B、log、矩阵 vs 滚动数组、双指针 vs 迭代累积）必须只看时间帧证据，
    不得新增任何 `sourceCode.includes(...)` 型判据（不变量 #6 的延伸与边界划定）。
    （b）**重叠递归的判据是「展开型重复」而非「重复进入」**：记忆化包装后重复入参照样触发 `__enterFn`
    （缓存守卫在其之后），`redundantCallCount` 不归零；只有 `expansiveRedundantCount`（下一帧栈更深）
    才能证明真的又重算了一整棵子树。改动该指标会让 A′（`O(n) Memoized Linear`）误回落到 A（`O(2^n)`）。
    （c）**合成失败必须放弃注入并说明原因**：形参含默认值/解构、或大括号配对定位失败时返回原源码，
    绝不输出语法残破的"优化代码"；`optimizedCode === sourceCode` 时 Apply 按钮自动隐藏。
    （d）**Watch 断言的白名单**：字符集不含 `[` `]`（下标访问一律 INVALID），拒绝 `ident(` 调用形态与
    `this/window/globalThis/self/document/location/Function/eval/constructor/prototype/process/require/import`
    等宿主名；作用域缺变量必须返回 ERROR 带原因，**不得谎报 FALSE**。

## 当前实测基线（M7 全预设复测，视口 770×553，`npm run build` 零 TS 报错）

| 预设 | 帧数 | 峰值栈深 | 引擎判据结果 | 取证备注 |
| --- | --- | --- | --- | --- |
| Trapping Rain Water | 40 | 1 | `O(n) Linear Two-Pointer` / `O(1) In-Place Pointers` | 热点 L9（11x）；无函数激活 → 调用树面板隐藏 |
| Min Path Sum (2D DP) | 29 | 1 | `O(M * N) Matrix DP` / `O(M * N) 2D Tabulation` | 热点 L14（6x）；Apply 重跑后 15 帧 `O(M*N) Optimal Scan` / `O(N) Rolling Buffer` |
| Binary Search Bounds | 10 | 1 | `O(log n) Logarithmic Halving` / `O(1) Constant Pointers` | 空间 11、探测 1 次、对数预算 16 |
| Naive Fibonacci Tree | 31 | 6 | `O(2^n) Exponential` / `O(n) Stack Depth 6` | 调用树 15 节点 + 9 个 DUP；铁证 `fib(1) ×5, fib(2) ×3, fib(0) ×3, fib(3) ×2`，冗余 9 次 |
| Infinite Loop Guard | 1334 | 1 | `O(∞) Non-Terminating` / `O(1) Constant Heap` | `[FUSE_STEP_LIMIT]` 横幅 + 1334 帧现场，热点 L5（666x） |
| 手写 `depth(400)` | 149 | 150 | `O(n) Linear Recursion` / `O(n) Call Stack Depth 150` | **M4 误判项已闭环**：149 个唯一签名、0 个 DUP 节点、树仅渲染前 64 个；`[FUSE_STACK_OVERFLOW]` 保留现场 |
| 手写 `fact(6)` | 7 | 7 | `O(n) Linear Recursion` / `O(n) Call Stack Depth 7` | 6 个唯一签名、冗余进入 0 次，判为单链线性而非指数 |

### M5 / M6 调试器与可视化交互实测

| 能力 | 实测结果 |
| --- | --- |
| 带参签名 | 调用栈条带显示 `main() → fib(5)`；树节点行如 `d4 fib(1) DUP ×2 #9→#10` |
| 节点跳帧 | 点击 `fib(1) DUP ×2`（entry #9）→ `FRAME 10 / 31`，active 路径回算为 `fib(5)→fib(4)→fib(3)→fib(1)` |
| 断点设置 | L7 点击后红点 `bg-rose-500 opacity-100`（6px）、行底 `rgba(244,63,94,0.13)`、按钮 title 翻转为 Remove |
| 火焰图联动 | 火焰轨出现 7 根带 `bg-rose-400` 顶部标记的竖条（对应 L7 的 7 次命中帧） |
| Continue to Breakpoint | FRAME 10 → FRAME 11（下一命中帧）；快捷键 `b` 再推进至 FRAME 17 |
| 容量保护 | 149 次激活仅渲染前 64 节点并提示总量，长链路不卡屏 |
| 单行滚动条（M6） | 代码行 span `overflow-x` 计算值 `visible`，12 / 20 行预设行高恒 28px，无一行被滚动条撑高 |
| 顶栏（M6） | 44px，`scrollWidth == clientWidth == 770`，Compile 与 Spec 按钮右边缘均在容器内；切换器压缩至 88px 可横滚 |
| AI 标题栏（M6） | 36px 单行，`scrollWidth == clientWidth == 448`，Apply 按钮完整可见；五枚徽章迁至面板内遥测条 |
| SVG 调用树（M6） | fib(5)：15 节点组 / 14 条三次贝塞尔连线 / 9 个 DUP 徽章，viewBox 636×246；DUP 数与 `redundantCallCount = 9` 互证 |
| SVG 跳帧（M6） | 点击 DUP `fib(3)` → FRAME 20 / 31；激活态回算为 2 个 `#38bdf8` 节点 + 1 条天蓝连线；Compact List 与 SVG 双向切换正常 |
| 算子合成（M6） | `fact(6)` → 乘法累积 `n * fact(n - 1)`，终端实测 `factIter(6) = 720`；`depth(400)` → 纯深度推进，实测 `iterative cursor = 400` |
| 熔断态基准（M6） | `STATUS: FUSE_ABORTED (149f) → COMPLETED (802f)` + `PEAK STACK: 150 → 1`，不再输出帧数百分比 |
| 断点回归（M6） | DP 预设 20 个行号按钮；L14 断点 Continue `FRAME 10 → 12`、F8 续跳 `→ 17`；火焰轨 6 根亮红标记 |
| 判据三档（M7） | fib(5)：冗余 9 且展开型重复 ≥ 1 → `O(2^n) Exponential`（31 帧 / 栈深 6，与 M6 基线一致，未误落 A′）；记忆化 climb：冗余 3、展开型 0 → `O(n) Memoized Linear` |
| 通用合成（M7） | 非 fib 的 `climb(5)` 由 `dominantRecursiveName` 定位，注入 `const __memo = {}` 与 `JSON.stringify([n])` 守卫，终端实测 `memoized climb(5) = 8` |
| 迭代累积分档（M7） | `factIter` → `O(n) Linear Iterative Scan` \| `O(1) Scalar Accumulator`，全文无 Two-Pointer；Rain 仍为 Two-Pointer 并附「left / right 同帧可见」证据 |
| 栈收益锚点（M7） | `STACK REDUCTION: -71.4% Call Frames` \| `PEAK STACK: 7 → 2` \| `TRACE STEPS: 7 → 13 (Unrolled Loop)` |
| SVG 自动聚焦（M7） | 跳帧时 `scrollLeft 193 → 0`、`scrollTop 0 → 26`（内容 246px / 可视 220px，clamp 正确） |
| Watch 守卫（M7） | `r === 1 && c === 2` TRUE、裸 `r` TRUE（tooltip 回显 `1`）、`dp[1][2] === 6` INVALID（白名单禁下标）、`alert(n)` INVALID、越界 `n > 5` ERROR；表达式上限 4 条 |

## 已修复问题清单（回归核对表，逐条验证过）

- [x] TDZ ReferenceError 中断采集（M1）
- [x] 熔断后时间帧全部丢失（M1）
- [x] 顶层语句零帧 / stdout 不可见（M1，M2 因实例代码回退再次修过一次）
- [x] 递归返回不退栈导致 `callStack` 只增不减、栈深指标失真（M2）
- [x] M2 实例代码回退 TDZ 修复与帧回收（M2 合并时保留）
- [x] 优化后仍被判为 `O(2^n)`、输出 `Frames: 14 -> 15 (-50% Overhead)` 自相矛盾（M3）
- [x] `useState<AIDiagnosticReport null |>` 等泛型被 Markdown 吞坏（M3）
- [x] 未使用 import 在 `noUnusedLocals` 下编译失败（M3）
- [x] `h-13` / `py-0.2` 不在 Tailwind 标度内被静默丢弃（M3）
- [x] 一维滚动数组 DP 被 `includes('dp[')` 误判为矩阵复杂度（M4：改读 dp 运行时形态）
- [x] 二分查找被误报为线性（M4：`O(log n)` 判据）
- [x] 熔断文案含 emoji，界面塑料感（M4：`[FUSE_*]` 前缀）
- [x] 线性深递归被误判为 `O(2^n)`（M4 如实报备 → **M5 闭环**：`redundantCallCount` 拆 A/B 分档）
- [x] 兄弟调用漏计重叠子问题（M5：增量法栈深不变会漏，改用「函数进入」事件计数）
- [x] 调用树按签名路径建索引导致兄弟子树撞节点（M5：改为前缀差异的 push/pop 事件建模）
- [x] 文档曾把 M4 的「线性递归闭环」写得过满（M5 复核时拆成两条，未修的明确标注）
- [x] 迭代展开脚手架的合并算子仍需人工替换（M5 报备 → **M6 闭环**：`sniffCombineOperator` 按 `n * fact(n-1)` /
  `n + sum(n-1)` / 无算子三种形态生成等价迭代代码，实测 `factIter(6) = 720`、`iterative cursor = 400`）
- [x] 调用树只是 depth 缩进列表、看不出父子拓扑（M5 报备 → **M6 闭环**：后序槽位 + 均值父坐标 + 贝塞尔连线 SVG 布局）
- [x] 熔断截断基线与完整重跑之间被算成帧数百分比（M5 报备 → **M6 闭环**：`wasFused` + `STATUS: FUSE_ABORTED → COMPLETED`）
- [x] 771px 下每行代码下方一条原生粗灰滚动条（M6：单行 span 去掉 overflow-x-auto，外层容器统一滚动 + 全局 5px 暗色条）
- [x] 771px 下 AI 面板标题被挤成四行竖排（M6：徽章迁出标题栏至遥测条 + 长尾文案 xl 分级 + 容器横滚不裁控件）
- [x] `overflow-hidden` 修折行时把 Apply 按钮整段裁掉（M6：验收标准从「不折行」升级为 `scrollWidth == clientWidth`）
- [x] DevLog Markdown 表格行内未转义竖线导致表格被切列（M4 文档 2 行 + M6 文档 1 行，M6 复核时用列数一致性脚本扫出并修）
- [x] 单链递归迭代化后落到兜底档，被判据文案称为「Linear Two-Pointer」（M6 报备 → **M7 闭环**：
  `detectTwoPointerEvidence` 要求同帧可见成对指针，否则判 `O(n) Linear Iterative Scan` / `O(1) Scalar Accumulator`）
- [x] 分支 A 的 DP 优化样例仍偏 fib 专用，通用记忆化模板未提供（M6 报备 → **M7 闭环**：
  `extractFunctionInfo` + `synthesizeMemoizedSource` 对任意函数名生成 Top-Down 缓存包装，实测 `memoized climb(5) = 8`）
- [x] SVG 调用树不自动聚焦激活节点（M6 报备 → **M7 闭环**：帧号变化时把最深激活节点平滑滚入视口中心并 clamp）
- [x] 记忆化版本被自家判据再次判为 O(2^n)（M7 实测暴露：重复进入不等于重复展开；补 `expansiveRedundantCount` 三档化）
- [x] 栈收益型重构被帧数上升掩盖（M7：横幅 segment 化，`STACK REDUCTION` 抢占主锚点，`TRACE STEPS (Unrolled Loop)` 明确不冒充收益）
- [x] Watch 求值若直接 new Function 等于开放任意代码执行入口（M7：三道闸门 + 宿主名黑名单 + 下标禁用，实测 alert/process 全 INVALID）
- [ ] 通用自底向上 tabulation 合成仍只覆盖 fib；任意重叠递归的数组化需要推断状态维度与转移方程（见 M7「遗留」）
- [ ] 记忆化场景 FRAMES 列无信息量（缓存命中也要进入函数一次），暂未对 A′ 档隐藏该列（见 M7「遗留」）

## 全仓 emoji 扫描基线（可复现）

不变量的准确表述是：**`src/**` 运行时代码零 emoji**，异常文案统一 `[FUSE_*]` 前缀。复现命令：

```bash
node -e "const fs=require('fs'),p=require('path');const re=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);
if(e.isDirectory()){if(e.name!=='node_modules'&&e.name!=='dist'&&e.name!=='.git')w(f);continue;}
if(!/\.(ts|tsx)$/.test(e.name))continue;const m=[...new Set(fs.readFileSync(f,'utf8').match(re)||[])];
if(m.length)console.log(f,'->',m.join(' '));}})('src');console.log('scan done');"
```

基线结果：`src/App.tsx`、`src/services/aiDiagnostics.ts`、`src/core/instrumenter.ts`、
`src/core/sandboxRunner.ts` 均无命中（`scan done` 之前无输出）。

两点说明，避免下一轮把范围读错：

- `↑` `→` `←` `↳` 属于技术箭头符号（U+2190–U+21FF），不是 emoji，允许出现在界面与文档中。
- `docs/devlogs/M2|M3|M4` 里出现 `🔥` `🎯` `🚨` `⏱️` 是**对被删除的历史文案的字面引用**（记录「改之前长什么样」）。
  删除它们会让「before」侧证据消失，因此有意保留；该例外仅限 DevLog 引述，不得回流到 `src/**`。
