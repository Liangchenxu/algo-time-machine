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
| M7 | `7de93be` | [M7-auto-memo-and-watch-guards.md](./M7-auto-memo-and-watch-guards.md) | 通用 Top-Down 自动记忆化合成、双指针 vs 迭代累积分档、栈收益 Benchmark 锚点、SVG 树自动聚焦与 Watch 条件守卫 |
| M8 | `6da81b1` | [M8-subtree-pruning-and-watchpoints.md](./M8-subtree-pruning-and-watchpoints.md) | 纯运行时 HIT/DUP 剪枝拓扑取证、Stage-2 自底向上递推降维、SUBTREE PRUNING 锚点、Watch 下标与 Seek TRUE 观察点 |
| M9 | `9bb7835` | [M9-two-stage-fib-and-2d-synthesis.md](./M9-two-stage-fib-and-2d-synthesis.md) | fib 并入二级火箭、双参帕斯卡二维表降维、二维档样例门控、Seek 四态导航与场景化一键 Watch |
| M10 | `ee2d94c` | [M10-runtime-introspection-and-pascal-preset.md](./M10-runtime-introspection-and-pascal-preset.md) | 帕斯卡预设、运行时自适应 Watch 芯片、二维矩阵读写分离取证与 `O(log n)` 折半递归消栈 |
| M11 | `564e022` | [M11-positional-halving-and-ab-toggle.md](./M11-positional-halving-and-ab-toggle.md) | 多参槽位折半与快速幂等价合成、突变熵 Watch 排序、Benchmark 横幅一键 A/B 轨迹切换 |
| M12 | `cc324f1` | [M12-stage-history-stack-and-mixed-args.md](./M12-stage-history-stack-and-mixed-args.md) | 多阶段全息快照栈、混合实参槽位折半、指数合法性门控、不收敛递归判据与 Fast Power 预设 |
| M13 | `b129f95` | [M13-passthrough-halving-and-draft-guard.md](./M13-passthrough-halving-and-draft-guard.md) | 透传多参计数折半合成、奇偶交替快速幂识别、大轨迹惰性快照与编辑防丢 Draft 守卫 |
| M14 | `a34b16c` | [M14-byte-budget-and-kernel-selftest.md](./M14-byte-budget-and-kernel-selftest.md) | 双维度惰性预算、非确定性重水化漂移守卫、广义小步交错折半与 6 项内核实时自检台 |
| M15 | `588709b` | [M15-automated-judge-tour-and-whitepaper.md](./M15-automated-judge-tour-and-whitepaper.md) | 评委五幕自动路演导览（可中断真实内核驱动）、WebCrypto 非确定性守卫与工程白皮书 |
| M16 | `db5004a` | [M16-telemetry-curve-and-resumable-tour.md](./M16-telemetry-curve-and-resumable-tour.md) | 跨阶段 SVG 栈深包络遥测图（depthCurve 随快照持久化）、导览零延迟同步与六幕断点续播 |
| M17 | `7a3b96a` | [M17-dual-axis-envelope-and-act-skip.md](./M17-dual-axis-envelope-and-act-skip.md) | 包络图双轴（绝对帧刻度 ⇄ 归一化 / 线性 ⇄ sqrt）、128 点保峰抽样、一键整幕跳过、七幕全预设与 URL 现场分享 |
| M18 | `3c95084` | [M18-exact-cursor-and-full-permalink.md](./M18-exact-cursor-and-full-permalink.md) | 游标真实帧栈深与桶峰值双指示、全状态 URL 自动演进、事件驱动零延迟跳幕与 8 项内核自检（v1.0 收官） |
| M19 | `9e0c81d` | [M19-zero-overflow-and-minmax-band.md](./M19-zero-overflow-and-minmax-band.md) | 全容器零横向溢出治理、128 桶保峰保谷 Min-Max 振幅带、跳幕短路取消在跑批次与自定义源码 `&code=` 分享 |
| M20 | `d81e6c1` | [M20-flame-virtualization-and-v1-seal.md](./M20-flame-virtualization-and-v1-seal.md) | 火焰轨 160 桶 DOM 虚拟化、`data-scroll-x-owner` 显式横滚契约、全阶段振幅带、`code+stage` 组合演进与 9 项自检（v1.0 封盘） |
| M21 | 本次提交 | [M21-watch-fn-cache-and-longtask-autopsy.md](./M21-watch-fn-cache-and-longtask-autopsy.md) | Watch 求值函数编译缓存消解 285~294ms 长任务、`footer` 纳入第 6 项溢出自检、`code+stage` 断点行界两阶段对齐（v1.0 终极收官） |

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
    （a）**合成可用源码、判据不得用源码**（本条口号，AGENT_GUIDE 与各篇 DevLog 引用时请逐字一致）：
    `extractFunctionInfo` / `sniffCombineOperator` / `sniffBinaryRecurrence` 可以读源码定位函数体、
    形参与合并算子；复杂度判档（A / A′ / B、log、矩阵 vs 滚动数组、双指针 vs 迭代累积）必须只看时间帧证据，
    不得新增任何 `sourceCode.includes(...)` 型判据（不变量 #6 的延伸与边界划定）。
    （b）**重叠递归的判据是「展开型重复」而非「重复进入」**：记忆化包装后重复入参照样触发 `__enterFn`
    （缓存守卫在其之后），`redundantCallCount` 不归零；只有 `expansiveRedundantCount`（下一帧栈更深）
    才能证明真的又重算了一整棵子树。改动该指标会让 A′（`O(n) Memoized Linear`）误回落到 A（`O(2^n)`）。
    （c）**合成失败必须放弃注入并说明原因**：形参含默认值/解构、或大括号配对定位失败时返回原源码，
    绝不输出语法残破的"优化代码"；`optimizedCode === sourceCode` 时 Apply 按钮自动隐藏。
    （d）**Watch 断言的白名单**：拒绝 `ident(` 调用形态与
    `this/window/globalThis/self/document/location/Function/eval/constructor/prototype/process/require/import`
    等宿主名；作用域缺变量必须返回 ERROR 带原因，**不得谎报 FALSE**。
    （下标访问边界自 M8 起放宽，见 #14(d)。）
14. **纯运行时剪枝判据与 Watch 下标安全边界**（M8 确立）：
    （a）调用树里 `HIT`（缓存剪枝）与 `DUP`（冗余展开）**只能由拓扑推出**：同签名首次激活
    `firstChildCount > 0` 且本次激活 `childCount === 0` 才判 `pruned`，否则判 `expansive`。
    前置条件不可省略——天然基线叶子首次就没有子节点，去掉它会把基线误报成剪枝成绩。
    配色优先级固定 `active > pruned > expansive > retired`，但 HIT/DUP 徽章始终显示，
    两类信息不得互相覆盖；判据不读源码，仍受 #6 / #13(a) 约束。
    （b）`SUBTREE PRUNING` 锚点与 A′ 判据同源（`expansiveRedundantCount` 由 >0 归零）；
    改动该取证口径必须同步复核 `benchmarkSegments` 的优先级链
    `STATUS(熔断) > SUBTREE PRUNING > STACK REDUCTION > FRAMES`，并保留 `emitTailComplexityRows`
    这类防重复渲染开关。
    （c）Stage-2 递推合成只接受可机械推导的形态（单参数二元递推；M9 起扩至双参数帕斯卡递推），
    其余一律返回 `null` 回退源码：**宁可少一级火箭，不得生成算错的 dp 递推**。
    （d）Watch 放行 `[` `]` 下标断言（`dp[1][2] === 6`、`grid[r][c] > 0`），但仍禁止点号、引号与
    单等号赋值（切断 `obj.constructor` / `obj["constructor"]` 两条成员注入路径，
    `===` `!==` `<=` `>=` `==` `!=` 不受影响）；越界与缺变量返回 ERROR；
    `→T` 观察点跳帧需先暂停再瞬移，全轨迹无解时必须给出可见反馈而不是静默。
15. **二级火箭阶段单调性与 Seek 四态完备契约**（M9 确立）：
    （a）**所有重叠递归必须走同一条管线**：禁止任何函数名特判（`targetFnName === 'fib'` 已下线）。
    Stage-0 指数 → Stage-1 记忆化（HIT 剪枝 + SUBTREE PRUNING 横幅）→ Stage-2 数组化，
    三段各自有独立判据锚点；任何"直接跳到终点"的捷径都会让 HIT/剪枝能力在演示中隐身。
    （b）**Stage-2 种子必须严格等于基线定义域**：种子只覆盖 `0..baseMax`，循环从 `baseMax + 1` 起算，
    并要求 `maxOffset <= baseMax + 1`（依赖项必须在基线覆盖范围内）。
    M8 的 `max(baseMax, offsets) + 1` 公式在 climb 上偶然正确、在 fib 上会写出 `dp[2] = 2`（真值 1），
    证明"样本覆盖不足的通过"不等于契约成立——新增递推形态时必须对每个形态单独核对首几项数值。
    （c）**合成产物不得替换成无关算法**：二维档的一维滚动样例是 min-path 专用题解，
    仅在「运行时同时存在只读输入矩阵 + 可变状态表」时提供（M10 起为纯运行时判据，见 #16a），
    否则 `optimizedCode = sourceCode` 让 Apply 退场（#13c 的具体化）。
    （d）**`→T` 四态必须互斥且都可见**：`forward`（`→ #n` 天蓝）/ `wrapped`（`↺ #n (wrapped)` 琥珀）/
    `only`（`= only @ #n` 紫罗兰，不移动）/ `none`（`no TRUE frame` 玫红）。
    `only` 的判定必须来自**扫描完全程后唯一的 TRUE 帧**（从 current+1 环形起点、绕回 current 恰为最后一圈），
    不得用"第一次碰到自己"这种短路判定。
    （e）Quick-Watch 建议芯片只做"加入断言"这一件事，不自动跳帧：加入后用户仍显式点 `→T`，
    保持"观察点 = 断言 + 跳转"两步语义，避免芯片点击产生位置副作用。
16. **二维矩阵读写分离纯运行时取证与 Quick-Watch 跨阶段无死变量契约**（M10 确立）：
    （a）**读写分离只能由帧推出**：`analyzeMatrixWrites` 比较相邻帧的每个单元格，
    `writeCount === 0` 判只读输入、`> 0` 判可变状态表；滚动数组方案仅在两类同时存在时提供。
    `sourceCode.includes('grid')` 已删除且不得回归（#6/#13a 的又一次具体化）；
    同时注意该数值是"相邻帧单元格变化数"，同一格反复改写会重复计数，只能做二分类判据、不可当精确写指令数报告。
    （b）**Quick-Watch 芯片必须绑定当前轨迹**：候选 = 预设种子 + 运行时派生，且**每一条都要通过
    「至少一帧 TRUE」验证**；派生的取值帧必须从末尾回溯到"仍持有目标容器"的帧
    （否则会推荐未写入的 `dp[4][1] === 0` 这类真值但无信息量的断言）。
    死变量（重构后消失的 `leftBranch`）因此自动退场，`→T` 恒可命中。
    （c）**递归门控按证据类型分层，不得用计数阈值承担分类职责**：
    `expansive >= 1 → 指数档`；`redundant >= 1 → 记忆化档`；`redundant === 0 → 线性/折半档`。
    M5 的 `redundant >= 2` 在 fib/climb 上偶然成立，在 `comb(4,2)`（记忆化后冗余恰为 1）上会误判成线性递归。
    （d）**折半递归必须先于线性递归判定**，且只对"返回值等于步数"的形态生成消栈代码；
    首参非折半的多参形态（`power(2,16)`）当前不识别，不得静默套用计数型循环。
    （e）Stage-2/重构后的首帧若因 TDZ 缺少新变量，Watch 显示 `ERROR` 属诚实反馈（#13d），
    不得为了"好看"把它降级成 FALSE 或隐藏。
17. **折半合成语义等价门控与 A/B 轨迹无损往返契约**（M11 确立）：
    （a）折半判定必须**按参数槽位**收集实参序列：`power(2,16)` 的槽位 0 恒为底数、槽位 1 才收敛，
    只看首参会漏判；命中后必须把发生收敛的槽位（能定位参数名时连同名字）写进摘要。
    （b）**识别与合成解耦**：识别只决定判档；消栈代码必须单独过形态门——
    计数型（`1 + fn(...)` 且基线 `return 0`）→ `steps++` 游标循环；快速幂型（双参、折半槽位 > 0、
    函数体含 `*`、顶层实参 ≥2）→ 迭代二进制快速幂；其余一律 `optimizedCode = sourceCode`、
    Apply 隐藏、标签 `[SEMANTICS_PRESERVED]`。#13c 在此的具体化：宁可少给，不可给错。
    （c）**A/B 切换不得触发诊断重算**：M11 用 `⇄` + `runForComparison` 冻结两侧指标；
    M12 起升级为 `stageHistory` 全息快照（见 #18），旧 `abState` 已下线，改由快照胶囊零延迟切换。
    横幅在任意阶段切换过程中都必须保持可见且数值不变；仅切换预设才清空历史。
    （d）Quick-Watch 兜底排序按**突变熵**（全轨迹 distinct 取值数降序）挑选动态变量，
    `distinct === 1` 的静态输入仅在无动态变量时兜底，避免推荐恒真且无信息量的断言。
18. **多阶段全息快照栈与报告同步恢复契约**（M12 确立）：
    （a）每次 Apply 必须把「当前阶段」冻结成 `StageSnapshot`（`sourceCode` / `frames` / `execTimeMs` /
    `sandboxError` / `aiReport` / `metrics`），再追加新阶段；**报告是快照的一部分**，
    切换阶段时 `aiReport` 必须随之恢复，否则会出现「轨迹是 Stage 0、判据却是 Stage 2」的矛盾。
    （b）阶段切换必须是**零延迟**的：只从快照同步 state，不得重跑沙箱或重算诊断。
    （c）横幅始终比较 `stageHistory[0]` 与当前选中阶段；停在 Stage 0 时比较最新阶段（横幅不消失、
    不退化为 x → x），并显示 `INSPECTING STAGE 0 BASELINE (Full Report Restored)`。
    （d）**非最新阶段隐藏 Apply**（`atLatestStage`）防止历史分支重复分叉；只有切回最新阶段或切换预设才恢复。
    （e）参数字符串按顶层逗号切分（忽略 `[]` `{}` `()` 内的逗号）后逐槽判定数值，
    非数值槽位只跳过自身，不得整次丢弃调用。
    （f）快速幂合成要求指数为**非负整数**；`[FUSE_STACK_OVERFLOW]` 且签名链出现重复时判
    `O(∞) Unbounded Recursion` 并拒绝任何改写——`depth(400)` 这类实参无环的深递归不受此判据影响。
19. **透传参数等价合成、大轨迹惰性重水化与编辑态防覆盖契约**（M13 确立）：
    （a）**多参计数型合成的透传门**：形态 A（`return 1 + fn(...)` 且基线 `return 0`）允许函数拥有多个形参，
    但每个自调用的**非折半槽位必须是原样透传的标识符**（`fn(tag, Math.floor(n / 2))`）。
    折半槽位之外的参数一旦在自调用中被改写（`tag + 1`）或参与返回值算术，一律不生成循环。
    合成代码必须保留原函数签名，顶层调用优先使用**源码里函数体之后的真实实参字面量**
    （运行时签名会丢掉字符串引号，直接把签名拼回源码会产出 `fn(arr, 32)` 这类 ReferenceError）。
    （b）**拒绝原因必须分型**：`coupled multi-parameter state → source preserved`（透传失败）与
    `custom return composition → source preserved`（返回值不是纯 `1 + fn`）不得混用；
    指数门控仍使用 `negative/non-integer exponent (x) → source preserved`。
    （c）**奇偶交替折半**：实参链同时允许 `floor(a/2)` 与「`a` 为奇数时 `a-1`」，
    要求首值 ≥8、总步数 ≥2、折半步占比 ≥50%；纯折半仍走计数/快速幂，交替链**只允许快速幂合成**——
    用 `floor(x/2)` 计数循环会把 `15→14→7→6→3→2→1` 的步数算少，计数形态遇到交替链必须拒绝。
    交替链的 frame insight 使用 `INTERLEAVED_DESCENT`，与纯折半的 `LOGARITHMIC_DESCENT` 区分。
    （d）**大轨迹惰性快照**：`LAZY_FRAME_THRESHOLD = 250`；阶段退居非激活后台且帧数超过阈值时，
    释放 `frames` 但保留 `frameCount` / `sourceCode` / `aiReport` / `metrics` / `sandboxError` / `execTimeMs`。
    胶囊与横幅一律用 `frameCount` 而非 `frames.length`，被驱逐阶段标注 `LAZY`；
    点击胶囊用 `runInSandbox(snapshot.sourceCode)` 重水化，**不得重算诊断**（报告仍是快照的一部分），
    并用令牌丢弃过期异步结果。≤250 帧的快照仍保持 0ms 同步切换，不得无差别改为重跑。
    （e）**编辑态防覆盖**：`stageHistory` 存在时，只要 `sourceCode !== stageHistory[activeStage].sourceCode`
    即视为脏编辑，横幅显示 `UNSAVED EDIT DRAFT`，并隐藏 Apply（报告描述的是旧源码）。
    点击 `Compile & Trace` = 以手改代码为全新基准，历史栈归零；点击任意阶段胶囊不得静默覆盖，
    必须先用同一沙箱真实跑一遍手改代码并将其冻结为 `kind: 'draft'` 的临时 `Draft` 阶段
    （源码/帧/报告三者同源，满足 #18a），再切到目标阶段。Draft 阶段与普通阶段一样可零延迟切回。
20. **双维度惰性预算、非确定性重放守卫与内核自检契约**（M14 确立）：
    （a）**惰性驱逐必须双维度**：`StageSnapshot` 携带 O(1) 抽样的 `approxBytes`
    （中段帧与末帧 `JSON.stringify(variables)` 均值的 1.15 倍 × 帧数），非激活快照满足
    `frames.length > LAZY_FRAME_THRESHOLD (250)` **或** `approxBytes > LAZY_BYTE_BUDGET (180_000)`
    都必须释放 `frames`。胶囊文本保持 `Stage N (mf · LAZY)`，tooltip 必须给出 KB 级估算与双阈值。
    只按帧数的旧判据（M13）不足以覆盖「帧少但单帧矩阵巨大」的轨迹。
    （b）**非确定性重放守卫**：`hasNonDeterministicCalls(code)` 识别 `Math.random(` / `Date.now(` /
    `performance.now(` / `new Date`。命中且 `frameCount <= 600` 时**豁免一切惰性驱逐**，
    宁可多占内存也要保证历史重放 100% 一致（Strategy A）。
    超过 600 帧而不得不重水化时，若源码含非确定性标记或 `restored.length !== snapshot.frameCount`，
    必须在遥测条显示琥珀色 `NON-DETERMINISTIC RE-HYDRATION (Frame values may vary)`，
    同步更新 `frameCount` / `approxBytes`，但**冻结的 `aiReport` 与 `metrics` 不得重算**
    （Strategy B：诚实提示漂移，不破坏 #18a 的报告同步契约）。
    （c）**广义小步交错折半**：实参链严格单调递减且首值 ≥8、总步数 ≥2；每一步要么是
    `a[k+1] === floor(a[k]/2)`，要么 `a[k] - a[k+1] <= 2`（覆盖 -1 / -2 微调），
    且折半步占比 ≥50%。含交错步进（`interleaved === true`）的递归**只允许快速幂形态降维**；
    计数型/未知形态一律返回 `custom return composition → source preserved`（#19c 的扩展）。
    递增或大步跳跃不属于收敛链，不得放宽。
    （d）**Draft 冻结必须跳过人工延迟**：`runAIDiagnostics` 增加 `skipDelay?: boolean`，
    脏编辑切阶段时以 `skipDelay=true` 调用，实测从点击到 Draft 胶囊 DOM 提交 22.6ms（<30ms）；
    沙箱仍需真实执行以保证源码/帧/报告同源（#18a），不得用旧阶段的帧伪造 Draft。
    （e）**Live Kernel Self-Check 契约**：Spec 弹窗第 3 页签必须可在浏览器内运行确定性微基准
    （M14 为 6 项：TDZ 闭包 / 熔断前缀 / 递归 A-A′-B / 槽位与交错折半 / 矩阵读写分离 / 窄视口可达性；
    M18 起扩到 8 项，新增抽样保峰与哈希解析，见 #24d），
    每项显示 PASS 或 FAIL 与实测耗时；夹具不得依赖 Worker、网络或 API Key。
    自检是「当前内核活体证据」，任何一项 FAIL 都必须显式展示，不得吞掉或降级成提示。
21. **评委自动导览可中断性与窄视口零溢出契约**（M15 确立）：
    （a）**导览必须驱动真实内核**：五幕只允许调用「最新一次渲染」的 handler
    （`handleSelectPreset` / `handleApplyOptimized` / `adoptWatchExpr` / `seekNextTrue` / `runKernelSelfCheck`
    经 `liveActionsRef` 每帧刷新），严禁预录动画或假数据；
    异步串联中直接使用旧闭包会把上一个预设的源码冻结成 Stage 0，属于必须避免的正确性事故。
    （b）**幕间等待必须是运行条件 + 可取消驻留**：完成判据只能取真实信号
    （帧数阈值、`isAnalyzing` 归位、`stageHistory.length`、自检结果**对象引用变化**），
    `tourHold` 驻留必须被 `Skip Next`、`Stop Tour` 与字幕条外的任意 `pointerdown` 立即结束
    （`closest('[data-tour-bar]')` 是字幕条自身的豁免，否则 Skip 按钮会被全局中断监听吃掉），
    中断后控制权与当前轨迹原样交还评委。
    （c）**顶栏预算不得松动**：新增 `Tour` 按钮后 770 宽度仍要求 `header 44px` 且
    `scrollWidth == clientWidth == 770`；运行态文案 `Stop Tour (Act X/5)` 允许**只**隐藏装饰性
    `AST-IR v2.4 · WORKER SANDBOX` 徽章来腾出宽度，可压缩区仍只允许预设切换器（#12a / #12b 不变）。
    （d）**不变量条数必须单一来源**：自检页签与导览末幕标题的条数取自 `KERNEL_INVARIANT_COUNT`，
    必须等于本文件不变量登记条数（M15 记 21、M16 记 22、M17 记 23）；写死数字随里程碑过期视为文档缺陷。
    （e）**非确定性源清单只增不减**：`hasNonDeterministicCalls` 现覆盖 `Math.random(` / `Date.now(` /
    `performance.now(` / `new Date` / `crypto.getRandomValues(` / `crypto.randomUUID(`；
    新增宿主随机/时间源必须同步扩充正则、#20b 契约与本表。豁免驱逐（≤600 帧）与漂移芯片语义对全部来源一致生效。
22. **轻量 depthCurve 随快照持久化与导览可续播契约**（M16 确立）：
    （a）**曲线必须独立于 frames 存活**：`StageSnapshot.depthCurve` 由帧的 `callStack.length` 序列构建
    （M17 起为 128 点保峰分桶，见 #23b），在 `snapshotOf` 时构建、重水化后刷新；
    `evictBackgroundFrames` 只清 `frames`，不得连带清空曲线。
    跨阶段包络图因此能在 `LAZY` 态依旧画出完整轨迹（M16 实测 354 帧阶段绘 354 个点；
    M17 抽样后同一量级的 467 帧阶段绘 128 个点且峰值仍等于冻结的 Stack Depth）。
    曲线的数据源只能是帧本身，禁止用 `metrics.maxStackDepth` 之类标量「补画」成假曲线。
    （b）**包络图渲染与交互契约**：一个 SVG 坐标系内叠加各阶段折线 + 半透明面积包络，
    Stage 0 玫红 `#f43f5e` 虚线、Stage 1 天蓝 `#38bdf8`、Stage 2 翠绿 `#10b981`（激活阶段加粗 2px），
    高度 56–68px 紧凑嵌入；横轴模式与纵轴模式自 M17 起可切换（见 #23a，M16 只有归一化一种），
    激活阶段当前帧必须是圆点 + 竖向游标，点击横轴需按 `clientX` 比例 `setCurrentFrameIdx` 并先停播；
    容器宽度必须先同步读 `clientWidth`，`ResizeObserver` / `resize` 只作兜底——被遮挡的测试环境里 RO 回调可能根本不投递。
    （c）**导览零延迟**：`tourRunningRef` 为真时 `executeCode` 必须以 `skipDelay=true` 调用诊断，
    幕间不得再叠加 380ms 人工延迟；由于 `setFrames` 与 `setAiReport` 分属两次提交，
    可承诺的是「判据只等诊断本身」（实测 12~56ms 齐备），不得把该机制写成字面意义的同一渲染周期。
    （d）**导览可续播**：中断（`Stop Tour` 或字幕条外任意 `pointerdown`）必须记录 `pausedTourAct`，
    字幕条收敛为 `ACT k/N · PAUSED` 并提供 `Resume Act k/N` / `Restart` / `Dismiss ×`；
    Resume 从第 k 幕**整幕**重跑（不伪造半幕中间态），Dismiss 彻底清除；
    中断监听对非 Element 目标（如直接派发到 `window` 的事件）也必须生效，
    因此豁免判定用 `target?.closest?.('[data-tour-bar]')`，不得让一次异常吃掉「幕外一律暂停」承诺；
    Skip 按钮自 M17 起是**幕级**取消（`Skip Act →`，见 #23c）；M16 的 `Skip Next →` 只结束当前驻留，
    该限制当时属实，不得在历史文档里追溯夸大成一键跳幕。
    （e）**幕数与文案单一来源**：`TOUR_ACTS` 的条数必须由 `TOUR_ACTS.length` 驱动全部文案
    （M16 为六幕，M17 起为七幕且覆盖全部预设，见 #23d），
    顶栏 `Stop Tour (Act k/N)` / `Resume Tour (Act k/N)` 不得写死数字；
    导览期间允许隐藏装饰性 `AST-IR v2.4` 徽章腾出宽度，但任何状态下顶栏仍需 `44px` 且
    `scrollWidth == clientWidth == 770`（#12/#21c 的延续）。

23. **包络图双轴几何、128 点保峰抽样与单次点击跳幕契约**（M17 确立）：
    （a）**双轴模式只能是显示口径，不得改写数据**：`telemetryXMode` 取 `'normalized' | 'absolute'`（默认 absolute），
    `telemetryYMode` 取 `'linear' | 'sqrt'`（默认 linear）。absolute 模式下阶段宽度比例恒为
    `frameCount / maxStageFrames`（25 帧阶段在 467 帧基准下只占 5% 宽）；normalized 模式每阶段铺满 0–100%，
    用于比较波形而不是比较长度。纵轴 sqrt 口径为 `sqrt((d-1)/(max-1))`，只压缩绘制高度，
    **不得改动 `depthCurve` / `peak` / `maxStackDepth` 任何数值**。
    点击横轴必须按当前模式逆映射（absolute 先除掉本阶段占比）再换算真实帧号，
    并 clamp 到「激活阶段的合法帧区间 ∩ 当前轨迹」——越界点击不得跳到别的阶段或越界帧号。
    轴标签随模式切换（右端 `100%` ⇄ `${maxStageFrames}f`），图例必须显示该阶段的 `x% span`；
    当前帧的圆点自 M18 起分「真实深度 + 桶峰值」两层指示，见 #24a。
    （b）**抽样保峰是硬约束**：`MAX_CURVE_SAMPLES = 128`；`trace.length <= 128` 时逐帧 1:1；
    超过时取「首帧 + 126 个中间桶的桶内最大栈深 + 末帧」，分桶必须无缝覆盖 `1..n-2`。
    由此 `Math.max(...depthCurve)` 必须恒等于同阶段 `metrics.maxStackDepth`（实测 467 帧阶段
    绘 128 个点、峰值 13 与冻结报告的 `Stack Depth 13` 一致），且快照仍只存整数数组、不存帧对象。
    曲线索引与帧号是两套坐标系，必须经 `curveIndexOf(curve, frameIdx)` 显式换算；
    任何把曲线索引直接当帧号用的写法（游标、点击、多边形收口）都算回归。
    （M19 起同一分桶额外保留下沿 `depthFloorCurve`，见 #25b；「保峰」与「只存整数数组」两条约束原样继续生效，
    存下沿只是把每阶段最多 128 个整数再存一遍，不引入帧对象。）
    （c）**Skip 是幕级取消，不是驻留级**：`tourActSkipRef` 记下被跳过的幕号，`skipTourAct` 同时释放当前驻留；
    `tourHold` / `tourWaitFor` / 幕内每一步都必须把「本幕已被跳过」当作与令牌失效同级的让位条件，
    因此**无论本幕含几段 Apply 或几段驻留，一次点击必须进入下一幕**（实测 ACT 2 内 1 次点击 → ACT 3）。
    每一幕开始前必须复位该标识，`pauseJudgeTour` / `dismissJudgeTour` 也必须复位，
    否则残留的幕号会让下一幕一进场就自我让位。跳过最后一幕即进入完成态；Skip 永不退出导览。
    （d）**七幕必须覆盖全部内置预设**：七个预设（`infinite-loop` / `fib-tree` / `pascal-comb` /
    `dp-matrix` / `fast-power` / `rainwater` / `binary-search`）都要在导览里被真实驱动至少一次，
    自检固定在末幕；`note` 需点名本幕负责的预设，验收以「导览过程中出现过的激活预设集合」为证据，
    不接受「文案里提到」；新增预设必须同步加幕，否则 #21a 的真实编排承诺退化为部分覆盖。
    （e）**URL Permalink 是只读现场快照**：哈希字段固定为 `preset=<id>&frame=<frameIndex(0 基)>&watch=<a|b>`
    （`|` 分隔、最多 4 条，与 Watch 上限一致），写入用 `history.replaceState`（直接赋 `location.hash` 会触发锚点滚动，
    把当前视图顶走）；首屏解析到合法 `preset` 才改初始状态，非法即整体忽略回默认预设，
    帧号必须等轨迹真的就绪后再定位（`pendingShareFrameRef`），不得先写游标再被空帧覆盖。
    剪贴板被拒必须显示 `Link in URL` 而不是谎报 `Copied!`；分享回来的 Watch 表达式仍然只经
    `evalWatchExpression` 的三道闸门求值（#13d / #14d 不因 URL 输入而放宽），越界照旧 ERROR。
    （M18 起字段扩到五元，见 #24b；本条对 `preset / frame / watch` 的约束原样继续生效。）

24. **抽样游标真实深度、全状态 URL 自动演进与事件驱动等待契约**（M18 确立，v1.0 收官）：
    （a）**游标必须分「真实深度」与「桶峰值」两层**：实心点纵坐标只能取
    `frames[markerFrame].callStack.length`（当前帧真相），抽样桶峰值只能以 dash 空心环 + 竖向细线共存显示，
    且仅在 `bucketDepth > exactDepth`（本桶真的发生过折叠）时出现；面板控制行必须回显
    `frame depth X (bucket peak Y)`，二者不得互相冒充。
    激活阶段被 `LAZY` 驱逐、手里没有帧时，`exactDepth` 允许回落桶峰值——**没有证据就不画新真相**。
    曲线本身仍是 128 点抽样，`#23b` 的保峰约束与「曲线索引须经 `curveIndexOf` 换算」继续生效。
    （b）**URL 是完整现场的只读快照，且只承诺可复现的部分**：字段固定
    `preset=<id>&stage=<1|2>&frame=<frameIndex(0 基)>&bp=<升序正整数>&watch=<a|b>`。
    `stage` 只在 `stageHistory.length > 1 && 1 <= activeStage <= 2` 时导出（Draft 与更深历史无法靠
    确定性 Apply 序列复现，禁止写入）；`bp` 必须过滤为正整数、去重、升序、截到 `SHARE_BP_LIMIT = 16`
    且不超过该预设的实际行数；`watch` 仍最多 4 条且求值只走原有闸门。
    还原侧按序真实调用 `handleApplyOptimized`（走 `skipDelay=true` 零延迟通道），
    **某一级 Apply 不涨级就地停止**，不得伪造阶段、不得重放动画；帧号定位必须等演进结束再按当时帧数 clamp。
    StrictMode 会把首屏 effect 跑两遍，因此演进必须由一次性启动闸门守护，不得靠 cleanup 反向取消。
    （M19 起字段扩到六元、新增不可重建时的 `code` 源码入链，见 #25d；本条对
    `preset / stage / frame / bp / watch` 的约束原样继续生效。）
    （c）**幕间等待只能是事件驱动，禁止靠轮询节拍承诺时延**：`waitUntil` 的唤醒源是
    每次 React 提交后的 `wakeTourWaiters()` 与 `skipTourAct` / `pauseJudgeTour` / `dismissJudgeTour` 的直接唤醒，
    定时器只作兜底；判定条件本身仍必须取真实运行信号（#21b 不变）。
    实测轻提交场景一次跳幕 19ms（M17 的 60ms 轮询在本环境被拉到 977ms）；
    与 1334 帧重提交同批的场景为 304ms，**残余来源尚未隔离，不得写成「全场景 <20ms」**。
    （M19 已隔离出该残余并给出分情形口径，见 #25c；本条「事件驱动、禁止轮询节拍」的约束原样继续生效。）
    （d）**自检台条数与不变量登记数同源**：`Live Kernel Self-Check` 现跑 8 项确定性微基准，
    页签条数取 `KERNEL_INVARIANT_COUNT`（当前 25）且必须等于本文件登记条数（#21d 的延续）；
    新增第 7 项只能断言抽样后的**长度恒 128、首尾帧保留、峰值不被吞**（注入 42 必须读出 42），
    第 8 项只能断言哈希解析的字段（M19 起含 `code` 的无损往返、超长与损坏编码必须被拒）与非法预设返回 `null`；
    两项都必须是纯内存夹具，不经 Worker、不发网络、不需要 API Key，任何 FAIL 都要显式展示（#20e 的延伸）。

25. **全容器零横向溢出、Min-Max 双包络、世代取消与源码入链契约**（M19 确立）：
    （a）**「零横向溢出」的断言范围是全量纵向滚动盒，不是顶栏一处**：自检第 6 项
    （`771px Viewport & Container Reachability`）枚举 `document` 下所有 `clientWidth > 0` 且
    `overflowY` 为 `auto|scroll` 的容器，逐个断言 `scrollWidth <= clientWidth + 1`。
    豁免只能按 **#12b 指定的横向滚动责任**判定，且必须读 `class` 而非 computed style——
    CSS 规定另一轴非 `visible` 时 `visible` 会被算成 `auto`，计算值分不出「谁被授权横滚」；
    责任人是 `PRE` / `overflow-x-auto` / `overflow-auto`。
    被检查的徽章行**不得再用 `overflow-x-auto + whitespace-nowrap` 把溢出藏进滚动条**，
    只能 `flex-wrap` 折行 + 每枚芯片 `max-w-full truncate`（AI 面板容器实测 266/251 → 251/251）。
    **不可断行的长标签同样算溢出源**：瓶颈跳转行的 `[MEMO_INJECTION_TARGET]` 曾把 `Jump #353` 顶出右沿 5px，
    文本块必须 `min-w-0`、标签必须 `break-all`，不得靠给按钮加横滚来藏。
    （M20 起豁免改读显式 `data-scroll-x-owner` 属性并加「与 legacy class 集合相等」的同源断言，见 #26a；
    「不得用横滚藏溢出」与「不可断行词必须可折」两条约束原样继续生效。）
    （b）**抽样必须同时保留桶的上沿与下沿**：`buildDepthBands` 一次返回 `{peaks, floors}`，
    `peaks` 即 `depthCurve`，继续受 #23b 保峰约束（`max(curve) === metrics.maxStackDepth`）；
    `floors` 只在轨迹 `> MAX_CURVE_SAMPLES` 时以 `depthFloorCurve` 落进快照（1:1 曲线的上下沿是同一个数组，不重复存）。
    Min-Max 振幅带**只给激活阶段绘制**（256 点多边形：上沿顺 + 下沿逆，`opacity 0.26`），
    且仅在 `bandBuckets > 0`（本桶真的 `peak > floor`）时出现，控制行回显 `min-max band N/128 buckets`；
    激活阶段是 `<= 128` 帧的 1:1 曲线时**整条带不出现属正确行为**（实测 Stage 1 · 83f 无带），不得为凑形状造假数据。
    重水化时上沿、下沿与 `frames / frameCount / approxBytes` **必须同源刷新**，不得让带与帧数脱节（#22a 的延伸）。
    （M20 起非激活阶段也绘带、`opacity 0.09`，见 #26c；「只画有下沿证据的阶段」与「同源刷新」继续生效。）
    （c）**被取代的一跑只能「终止 + 判世代」，二者缺一不可**：`runInSandbox(source, onCancel)` 交出
    `worker.terminate` 能力并回 `cancelled: true`；`executeCode` 开跑前终止上一跑、
    以 `runGenRef` 世代号作废过期结果，过期或取消时只回指标、**绝不 `setFrames / setAiReport`**，
    `handleApplyOptimized` 见到 `after.stale` 必须放弃冻结阶段（不得把半截现场写进全息栈）。
    取消权只交还一次：落地后 `if (runGenRef.current === gen) runCancelRef.current = null`，否则会误杀后继那一跑。
    `skipTourAct` 必须同时取消在跑批次；幕内异步动作只能经 `raceAbort(token, work)` 与取消信号赛跑，
    每一步之后补 `halted()` 检查。**度量必须分情形报**：Skip 落在重轨迹投递之前实测 18 / 18 / 22 / 26 / 27ms
    （五轮 fresh-page，熔断横幅在点击时刻与推进之后都未出现，1334 帧一次都没上屏），
    落在投递之后（延迟 80 / 90ms 才点）仍是 361 / 370ms——那一笔已在渲染队列里，取消救不了，
    不得写成「ACT 1 也 <30ms」，也不得把 terminate / 世代号 / `startTransition` 三条改动的功劳混算成一条。
    （M20 进一步证伪了「这一支是 1334 根火焰条的 Commit 成本」这一归因，见 #26e；分情形报数的纪律原样继续生效。）
    （d）**源码本身是现场的一部分，但只有不可重建时才入链**：哈希字段扩为
    `preset / stage / frame / bp / watch / code`。`code` 只在 `sourceCode !== presetSource && !stageReproducible`
    （Draft 与手改）时写入，用 UTF-8 安全的 Base64URL 编码、上限 `SHARE_CODE_LIMIT = 1600`；
    超长按 `partial` 处理并显示 `Link without code`，**不得悄悄退回预设原文冒充同一个现场**。
    解码失败、非法 UTF-8 或超长一律 `null` 即整体丢弃该字段；带 `code` 时 `bp` 的行号上界必须用这份真实源码的行数算。
    `code` 只是源码文本、不是可执行权限：它仍然只经 Worker 沙箱与三层熔断执行，**绝不在页面上下文求值**（#14d 不放宽）。
    （M20 起 `code` 与 `stage` 可共存、豁免口径改读显式属性，见 #26a / #26c；本条对「上限 1600、解码失败即整体丢弃、
    `bp` 按真正会跑的那份源码算行界」的约束原样继续生效。）

26. **火焰轨 160 桶虚拟化、显式横滚契约、全阶段振幅带与 v1.0 封盘契约**（M20 确立）：
    （a）**横滚责任只认显式属性，不认类名也不认 computed style**：`#12b` 授权的横向滚动容器必须标注
    `data-scroll-x-owner="true"`，自检第 6 项按 `el.hasAttribute('data-scroll-x-owner')` 豁免，
    并**同时**按 legacy class 规则（`PRE` / `overflow-x-auto` / `overflow-auto`）算一遍，
    两者数量不等即 FAIL 并回显两侧计数——这样改类名既不能让豁免静默扩大，也不能让标记静默漂离审计口径。
    该断言的枚举范围仍是纵向滚动盒；**flex 容器不是豁免对象也不是盲区**：
    它的横向溢出必须由子项数量/宽度自律解决（见 #26b），不得靠给父层加 `overflow` 藏起来。
    （M21 起页面级 flex chrome 由第 6 项直接断言零溢出，见 #27d；「只认显式属性 + 与 legacy 集合相等」继续生效。）
    （b）**火焰轨的 DOM 竖条数恒 `<= MAX_FLAME_BARS = 160`**：`buildFlameBuckets(frames, breakpoints, hotspotLine, currentFrameIdx?)`
    在 `<= 160` 帧时逐帧 1:1，超过时均匀切成**恒 160 个桶**，桶边界 `floor(b*n/160)` 保证无缝平铺 `0..n-1`、
    相邻桶首尾相接且桶宽 `>= 1`（永不为空）。每桶必须保留**真实证据**而不是新真相：
    `maxDepth` 是桶内实际最大栈深、`hasBreakpoint` / `hasHotspot` 取「桶内任一帧命中」、
    `repFrame` **优先取命中断点的帧**（点击即 Continue 的落点最有信息量）否则取栈深最大的帧，
    `active` 由 `currentFrameIdx` 落在 `[startFrame, endFrame]` 判定。点击竖条跳 `repFrame`，不是跳桶左沿。
    自检第 9 项只能用纯内存夹具断言这四件事（长度恒 160、平铺无隙无叠、断点 `repFrame` 精确命中、峰值与热点不丢）。
    （c）**Min-Max 振幅带从「只给激活阶段」扩到全阶段，但层次必须可辨**：激活阶段保持 `opacity 0.26`，
    非激活阶段用 `0.09`，两者都仍只在 `floors.length === depths.length` 且本阶段真的有 `peak > floor` 时绘制；
    `<= 128` 帧的 1:1 阶段不存下沿，因此没有带、芯片也不出现，仍属正确行为（#25b 的「没有证据就不画」不变）。
    （d）**`code` 与 `stage` 可以共存，且 `code` 必须是演进序列的起点**：带 `stage` 时链接里的源码取
    `stageHistory[0].sourceCode`（不是屏幕上当前的合成产物——带进去会让首屏把它当 Stage 0 再多演进一级，
    跑出根本不存在的 Stage 3）；不带 `stage` 时取当前 `sourceCode`。只要这份源码不等于预设原文就写 `code`。
    还原侧不改语义：`sourceCode` 初值取 `code ?? preset.code` 先跑出自定义 Stage 0，
    再由既有演进 effect 按序真实 Apply 到目标级（#24b 的「不涨级即停止、不伪造阶段」继续生效）。
    （M21 起 `code + stage` 共存时的 `bp` 行界改两阶段裁剪，见 #27e；「起点源码而非合成产物」的取值口径不变。）
    （e）**度量不得为迎合假设而软化**：M19 把「投递后跳幕 ~361ms」归因于 1334 根火焰条的 Commit，
    M20 虚拟化后竖条确实降到 160（-88.0%）并顺带消除一个真实的 4009px 溢出，
    但该场景实测 324 / 332 / 361 / 365 / 370 / 372ms **没有改善**，
    而单独落地 1334 帧只花 56ms 且零长任务、在已就位的 1334 帧上逐帧步进也是零长任务——
    因此必须报「归因被推翻、此项仍未闭合」，不得写成「虚拟化已解决投递后延迟」。
    （M21 已拆测出真凶是 Quick-Watch 的逐帧重编译并把它消掉，见 #27b；本条「推翻就报推翻」的纪律原样继续生效。）

27. **Watch 求值函数编译缓存与顶栏/底栏双端零溢出断言**（M21 确立，v1.0 收官）：
    （a）**缓存只能站在闸门之后**：`evalWatchExpression` 的三道闸门（字符白名单、禁调用形态、禁宿主名）
    **每次调用都要重跑**，只有全部通过之后才允许读写 `WATCH_FN_CACHE`。
    若为了命中率把闸门也一起缓存或跳过，等于给 URL / Quick-Watch 输入开一条绕过白名单的执行入口，
    直接违反 #13d / #14d——`alert(n)`、`process.exit()` 必须仍然是 `INVALID`，
    作用域缺变量必须仍然是 `ERROR` 而不是 `FALSE`。
    缓存键**必须包含形参名序列**（`${expr}\u0000${names.join(',')}`）：`new Function(...names, body)` 的
    形参表由「这一帧可见变量」决定，只按表达式缓存会把后一帧的 `dp` 值按位置塞进前一帧 `n` 的形参，
    产出既不报错也不正确的求值结果。
    失效策略也必须分情形：**编译失败不写缓存**（写进去永远跑不起来），
    **运行期抛错不剔除缓存**（函数本身合法，只是这一帧缺变量；剔除会让恒定越界的断言退回逐帧重编译，
    而那正是本轮要消掉的开销）。缓存设上限（`WATCH_FN_CACHE_LIMIT = 512`，超限整体清空），
    否则换预设 / 换阶段累积出的变量组合会让它无界增长。
    （b）**性能声明必须绑定测量口径**：本轮只承诺「消掉重复编译」，
    实测投递后跳幕由 `324 / 332 / 361 / 365 / 370 / 372ms` 降到
    `129 / 134 / 134 / 139 / 140 / 141ms`、长任务由 `285~294ms` 降到 `123 / 131ms`，
    剩余的 ~130ms 是「对 1334 帧逐帧调用已编译函数 + `Object.keys(vars)`」的固有扫描成本，不是编译成本，
    **不得写成「长任务已归零」**（#26e 的延续）。拆测用的 `performance.now()` 探针属临时插桩，
    提交前必须确认零残留；带探针的占比表与无探针的最终耗时表要分开标注，不得混为一张表。
    （c）**为省几毫秒而删证据，一律否决**：`analyzeMatrixWrites` 的「首帧与末帧都没有二维变量就 O(1) 返回空」
    这条短路**没有实现**，因为它不成立而不是因为它不值：把二维表放在 `if` 块内时，
    首帧（函数进入）与末帧（`return` 之后）的作用域里都没有它， shipped 代码却在 `FRAME 6 / 10` 报出
    `WRITES: 2`——按首末帧裁剪会让这条证据凭空消失，而 #16a 的「只读输入与可变状态表同时存在才给一维滚动压缩」
    正依赖它。实测该函数在 1334 帧标量轨迹上只花 `0.5~2.3ms`（占剩余任务的 1~2%），
    **收益不足以支付语义损失**，此类提案必须带着两侧数字一起进文档，而不是默默实现或默默删掉。
    （d）**零溢出断言必须覆盖 flex 的页面级 chrome**：自检第 6 项除纵向滚动盒外，
    还要逐个断言 `header` / `footer` / 整页根容器（三者皆 `overflow: visible`）满足
    `scrollWidth <= clientWidth + 1`，detail 回显 `header a/b · footer c/d` 两段原始数字。
    理由不是「多测一处」，而是 M20 的 `footer 4572/770` 证明过：**flex 容器不属于 `overflowY auto|scroll` 枚举域**，
    只扫滚动盒就会漏掉由 flex 子项 `min-width: auto` 撑爆的溢出。
    带 `overflow-hidden` 的容器**明确排除**在外——那是设计内的裁剪，把它算成溢出等于把裁剪当 bug。
    新增断言必须做反证（注入一个超宽子元素，确认该项转 FAIL 且其余项不受影响），
    否则「加了断言」与「断言有牙」是两件事。
    （e）**断点行界按两阶段裁剪，缺一半即为假**：链接带 `stage >= 1` 时 `parseShareHash` 把 `bp` 的静态上界
    放宽到 `Math.max(起点行数, SHARE_STAGE_BP_FLOOR = 64)`，因为现场最终跑的是 Apply 合成代码，
    其行数可以多于 Stage 0 起点；**演进落地后必须再按最终 `sourceCode` 的真实行数二次过滤**，
    否则放宽就退化成无界放行。两侧都要有实测：`bp=18` 在 Stage 0 只有 12 行时仍能还原为
    `Remove breakpoint at L18`，而同链的 `bp=63` 必须被 20 行的最终源码剔除。
    读取最终源码只能走 `liveActionsRef`（#21a「只取最新渲染」的口径），不得新开过期闭包。

## 当前实测基线（M21 复测，视口 770×553，`npm run build` 零 TS 报错）

> M21 轮在 770×553 同源 iframe 测试台重跑了 7 个内置预设的主路径 + 边界路径，
> 并逐项验证 Watch 编译缓存后的长任务拆测、footer/根容器零溢出断言（含注入反证）与
> `code + stage` 断点两阶段裁剪（见下表与小节）；
> 手写边界样本（`depth(400)`、`fact(6)`、`powerAlt`、`bsearchCoupled`、`crypto.*` 变体）沿用 M12–M15 实测值。

| 预设 | 帧数 | 峰值栈深 | 引擎判据结果 | 取证备注 |
| --- | --- | --- | --- | --- |
| Trapping Rain Water | 40 | 1 | `O(n) Linear Two-Pointer` / `O(1) In-Place Pointers` | 热点 L9（11x）；无函数激活 → 调用树面板隐藏 |
| Min Path Sum (2D DP) | 29 | 1 | `O(M * N) Matrix DP` / `O(M * N) 2D Tabulation` | 热点 L14（6x）；Apply 重跑后 15 帧 `O(M*N) Optimal Scan` / `O(N) Rolling Buffer` |
| Binary Search Bounds | 10 | 1 | `O(log n) Logarithmic Halving` / `O(1) Constant Pointers` | 空间 11、探测 1 次、对数预算 16 |
| Naive Fibonacci Tree | 31 | 6 | `O(2^n) Exponential` / `O(n) Stack Depth 6` | 调用树 15 节点 + 9 个 DUP；铁证 `fib(1) ×5, fib(2) ×3, fib(0) ×3, fib(3) ×2`，冗余 9 次；M9 起可点两次 Apply 走完整二级火箭（31 → 41 → 11 帧） |
| Pascal Comb (Tree→2D) | 13 | 5 | `O(2^n) Exponential` / `O(n) Stack Depth 5` | 第 6 预设（M10）；`DUP 3`，两次 Apply 后 37 帧 `O(n) Memoized Linear`（`DUP 0 / HIT 1`）→ 17 帧 `O(M * N) Matrix DP`、`WRITES: 5` 徽章、Apply 退场 |
| Fast Power O(log n) | 13 | 7 | `O(log n) Logarithmic Recursion` / `O(log n) Call Stack Depth 7` | 第 7 预设（M12）；槽位 1（exp）`16 → 8 → 4 → 2 → 1`，Apply 后 22 帧 `O(log n) Iterative Halving`、终端 `powerIter(2, 16) = 65536` |
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
| HIT/DUP 取证（M8） | fib(5) 31 帧：`DUP 9 / HIT 0`（等于 redundantCallCount 9）；climb Stage-1 29 帧：`DUP 1 / HIT 2`，HIT 节点 fill `#052e16` stroke `#10b981` text `#6ee7b7` 徽章 `HIT×2` |
| 二级火箭（M8） | climb(5)：Stage-0 10 帧 `O(2^n)` → Stage-1 29 帧 `O(n) Memoized Linear`（终端 `memoized climb(5) = 8`）→ Stage-2 9 帧 `O(n) Linear Iterative Scan`、`PEAK STACK: 5 → 2`（终端 `climbTabulated(5) = 8`）；按钮自动换标 `Apply Stage-2: Bottom-Up Tabulation (O(1) Stack)` |
| 剪枝锚点（M8） | `SUBTREE PRUNING: Expansive Redundant Subtrees 1 → 0 (-100% Pruned)` \| `TIME: O(2^n) Exponential → O(n) Memoized Linear` \| `SPACE: … → O(n) Memo Table + 5 Stack Frames` \| `TRACE STEPS: 10 → 29 (Includes O(1) Memo Lookups)` |
| Watch 下标（M8） | FRAME 11：`dp[1][2] === 6` TRUE、`dp[99][0] === 1` ERROR（Cannot read properties of undefined (reading '0')）；FRAME 1 同一断言 ERROR（dp is not defined，符合 #13d，与裁决预期的 FALSE 不同）；`count = 5` INVALID（assignment）、`window.alert` 与 `height['0']` INVALID（no dot or quotes） |
| 观察点跳帧（M8） | `→T` 从 FRAME 1 环形扫描到 FRAME 11 / 29 并暂停，落点与 amber 突变格 `6 @ [1,2]` 同帧；无解时胶囊显示 `no TRUE frame` |
| fib 二级火箭（M9） | Stage-0 31 帧 / `DUP 9`；Stage-1 41 帧 `O(n) Memoized Linear`、`DUP 1 / HIT 2`、`SUBTREE PRUNING: 3 → 0 (-100% Pruned)`、终端 `fib(5) = 5`；Stage-2 11 帧 `dp = [0, 1]`、`PEAK STACK: 6 → 2`、终端 `fibTabulated(5) = 5`、Apply 退场 |
| comb 二级火箭（M9） | Stage-0 12 帧 `DUP 3`；Stage-1 39 帧 `O(n) Memoized Linear`、缓存键 `JSON.stringify([n, k])`、`HIT×2 / DUP 0`；Stage-2 17 帧二维表、终端 `combTabulated(4, 2) = 6`、判据 `O(M * N) Matrix DP` |
| 2D 十字准星（M9） | Stage-2 后显微镜渲染 `2D Matrix: dp [5×3]` 共 15 格，第 7 帧出现 `Cursor [3][1]`，`Δ 1 State Mutation` 正常 |
| Seek 四态（M9） | `→ #11`（前方）/ `→ #12`（同帧再点）/ `↺ #11 (wrapped)`（末帧点）/ `= only @ #4`（单帧断言二次点击，帧号不变）/ `no TRUE frame`（`x === 999`） |
| Quick-Watch（M9） | 五个预设各 2 条建议芯片，DP 下为 `+ dp[1][2] === 6` / `+ r === 2 && c === 3`，点击即加入（零打字） |
| 自适应芯片（M10） | fib：Stage-0/1 为 `n === 2` / `leftBranch === 2` → Stage-2 自动变为 `dp[5] === 5` / `i === 5`；点选后 `→T` 从 FRAME 1 命中 FRAME 10（TRUE）；comb Stage-2 为 `dp[4][2] === 6` / `r === 4 && c === 2`；halve 消栈后为 `curr === 4` / `steps === 3` |
| 二维读写徽章（M10） | DP 第 10 帧：`grid [3×4] READ-ONLY`（暗灰）、`dp [3×4] WRITES: 6`（天蓝），`Cursor [1][2]` 正常；`includes('grid')` 全仓 0 处 |
| 折半递归（M10） | `halve(32)` → `O(log n) Logarithmic Recursion` / `O(log n) Call Stack Depth 7`，实参链 `32 → 16 → 8 → 4 → 2 → 1`，标签 `LOGARITHMIC_DESCENT` + `TAIL_UNROLL_CANDIDATE` |
| 折半消栈（M10） | Apply → `while (curr > 1)`、18 帧、`STACK REDUCTION -85.7%`、`PEAK STACK: 7 → 1`、终端 `halving steps = 5`、判据 `O(log n) Iterative Halving` / `O(1) Scalar Accumulator` |
| 多参槽位折半（M11） | `power(2, 16)`：槽位 1（exp）链 `16 → 8 → 4 → 2 → 1`，12 帧、栈深 7，判 `O(log n) Logarithmic Recursion`；`halve(32)` 仍命中槽位 0 |
| 快速幂等价合成（M11） | Apply → 迭代二进制快速幂，终端 `powerIter(2, 16) = 65536`（与原递归一致）、22 帧、`STACK REDUCTION -71.4%`、`PEAK STACK: 7 → 2`、判据 `O(log n) Iterative Halving` |
| 非等价拦截（M11） | `weirdHalve(32)`（`n ^ fn(n/2)`）仍判对数级，但 Apply 隐藏、标签 `[SEMANTICS_PRESERVED]`、收益文案说明保留源码 |
| A/B 往返（M11） | `⇄ Inspect Baseline (12f)` → 12 帧 + 调用树重现 + `VIEWING BASELINE TRACE` → `⇄ Return to Optimized (22f)` → 22 帧；横幅全程冻结在 `STACK REDUCTION -71.4% / PEAK STACK 7 → 2` |
| 突变熵芯片（M11） | 自定义循环得 `+ acc === 6` / `+ i === 4`，恒定 `target` 被排除 |
| 全息快照栈（M12） | fib 两次 Apply 后胶囊 `Stage 0 (31f)` / `Stage 1 (41f)` / `Stage 2 (11f)`；切回 Stage 0 → 31 帧 + `O(2^n)` + `DUP 9 / HIT 0` + `INSPECTING STAGE 0 BASELINE (Full Report Restored)` + Apply 隐藏；Stage 1 → 41 帧 + `Memoized Linear` + `DUP 1 / HIT 2`；Stage 2 → 11 帧 + `Linear Iterative Scan` |
| 混合实参折半（M12） | `bsearchHalve("arr", 32)`：槽位 0 字符串跳过，槽位 1 链 `32 → 16 → 8 → 4 → 2 → 1` → `O(log n) Logarithmic Recursion` / Stack Depth 7 |
| 指数门控（M12） | `power(2, 16.5)` 仍判对数级但 Apply 隐藏，文案 `negative/non-integer exponent (16.5) → source preserved` |
| 不收敛判据（M12） | `power(2, -4)` → `[FUSE_STACK_OVERFLOW]` 后判 `O(∞) Unbounded Recursion` / `Stack Depth 150 (fused)`，标签 `GUARD_TRAP` + `ARG_CYCLE`，Apply 隐藏；`depth(400)` 仍判 `O(n) Linear Recursion` 且 Apply 可见 |
| 透传多参折半（M13） | `bsearchHalve("arr", 32)`：判 `O(log n) Logarithmic Recursion` / Stack Depth 7、7 帧，**Apply 可见**；生成代码保留 `bsearchHalveIter("arr", 32);`，跑完终端 `steps = 5`（与原递归一致） |
| 透传折半消栈（M13） | Apply → 20 帧 `O(log n) Iterative Halving` / `O(1) Scalar Accumulator`，横幅 `STACK REDUCTION -71.4%` / `PEAK STACK 7 → 2` |
| 奇偶交替折半（M13） | `powerAlt(2, 15)` 实参链 `15 → 14 → 7 → 6 → 3 → 2 → 1`（6 步中 3 步折半）→ `O(log n) Logarithmic Recursion` / Stack Depth 9、9 帧，标签 `INTERLEAVED_DESCENT`，Apply 可见 |
| 交替快速幂合成（M13） | Apply → 22 帧，终端 `powerAltIter(2, 15) = 32768`（与 `2^15` 一致），横幅 `STACK REDUCTION -77.8%` / `PEAK STACK 9 → 2`，判 `O(log n) Iterative Halving` |
| 耦合拒绝文案（M13） | `bsearchCoupled(tag, n)`（自调用 `tag + 1`）→ 判对数级但 Apply 隐藏，文案 `coupled multi-parameter state → source preserved` |
| 组合拒绝文案（M13） | `weirdHalve2(n)`（`return 1 + fn(n/2) + n`）→ Apply 隐藏，文案 `custom return composition → source preserved` |
| 惰性快照驱逐（M13） | 自定义 `fib(10)`：Stage-0 354 帧 → Apply 后 Stage-1 80 帧；切到 Stage 1 时胶囊显示 `Stage 0 (354f · LAZY)`（帧数组已释放） |
| 重水化（M13） | 点击 `Stage 0 (354f · LAZY)` → 通过 `runInSandbox` 恢复 354 帧（实测 <120ms），胶囊变回 `Stage 0 (354f)`、`INSPECTING STAGE 0 BASELINE` 出现、诊断仍为 `O(2^n) Exponential`（未重算） |
| 轻量零延迟（M13） | fib 31 / 41 / 11 帧的 Stage 0/1/2 切换无 `RE-HYDRATING`、无 `LAZY`，Stage 0 恢复 31 帧且判据回到 `O(2^n)` |
| 编辑守卫（M13） | 编辑 Stage 1 源码 → 横幅出现 `UNSAVED EDIT DRAFT`；点 Stage 0 → 自动生成 `Draft 2 (22f)` 并恢复 Stage 0（手改注释不在源码中），脏标记消失；再点 Draft 2 → 手改源码与 22 帧完整回来 |
| 重跑归零（M13） | 脏编辑状态下点 `Compile & Trace` → Stage 胶囊全部消失（历史栈归零），以手改代码作为新的 Stage-0 轨迹，无静默覆盖 |
| 指数/不收敛回归（M13） | `power(2, 16.5)` → Apply 隐藏 + `negative/non-integer exponent (16.5)`；`power(2, -4)` → 149 帧 `O(∞) Unbounded Recursion` / `Stack Depth 150 (fused)`，Apply 隐藏 |
| 预设回归（M13） | Fast Power 13 帧 → Apply 22 帧、终端 `65536`；Rain 40 帧 `O(n) Linear Two-Pointer`；fib 三级火箭 31 → 41 → 11 帧；顶栏 44px 且 `scrollWidth == clientWidth == 770`；控制台无 error/warn |
| 字节预算驱逐（M14） | `fib(8)+6000 元素数组`：Stage-0 135 帧（<250）但 `~4382 KB` → Apply 后 `Stage 0 (135f · LAZY)`，tooltip 显示 `thresholds 250f / 180KB` |
| 字节驱逐重水化（M14） | 点击 `Stage 0 (135f · LAZY)` → 恢复 135 帧（含大数组深拷，实测 ~940ms）、无漂移芯片、判据保持 `O(2^n) Exponential`；Stage-1 65f 因 ~KB 同样转 LAZY |
| 非确定性豁免（M14） | `fib(5)+6000 元素数组+Math.random`：Stage-0 32 帧 / `~1040 KB`（>180KB）但 32 ≤600 → **不驱逐**，胶囊保持 `Stage 0 (32f)`；点回 0ms 级同步恢复、无漂移芯片 |
| 漂移提示（M14） | `fib(12)+Math.random`：Stage-0 931 帧 → Stage-1 97 帧；Stage-0 `LAZY`；点回恢复 931 帧并出现琥珀 `NON-DETERMINISTIC RE-HYDRATION (Frame values may vary)`，`INSPECTING STAGE 0 BASELINE` 与冻结 `O(2^n)` 报告同时在 |
| 广义交错折半（M14） | `mix(2,18)` 链 `18 → 9 → 7 → 3 → 2 → 1`（5 步中 3 步折半，其余差值 ≤2）→ `O(log n) Logarithmic Recursion`、栈深 7、标签 `INTERLEAVED_DESCENT`，Apply 隐藏并报 `custom return composition` |
| Draft 瞬时冻结（M14） | fib Stage 0/1/2 后编辑 Stage 2，点 Stage 0 → Draft 3 冻结；MutationObserver 实测点击到胶囊 DOM 提交 **22.6ms**（<30ms），Stage 0 恢复 31 帧、脏标记消失 |
| 内核自检（M14） | Spec 第 3 页签 `Live Kernel Self-Check (20 Invariants)` 在 770×553 实测 **6/6 PASS**：TDZ 13.5ms / Fuse 0.9ms / Recursion 0.6ms / Halving 0.6ms / Matrix 0.0ms / Viewport 0.9ms（`header 770px / 770px · viewport 770x553`） |
| 回归（M14） | Fast Power 13 → 22 帧、终端 `65536`；Rain 40 帧 Two-Pointer；bsearchHalve 7 → 20 帧、`steps = 5`；顶栏 44px 且 `scrollWidth == clientWidth == 770`；控制台无 error/warn |
| 导览全程（M15） | 点击 `Tour` → 字幕条 `ACT 1/5`…`ACT 5/5`，实测 total **17.6s** 完成并定格 `TOUR COMPLETE · total 17.6s`；运行态按钮文案 `Stop Tour (Act 1/5)` |
| ACT 1 熔断现场（M15） | 自动切 `infinite-loop`：400ms 时熔断横幅显示 `Pre-crash trace preserved (1334 frames)`，800ms 游标跳到 `FRAME 1333 / 1334` 且判据归位 `O(∞) Non-Terminating`，持续展示至 3.6s 后交棒 ACT 2 |
| ACT 2 三级火箭（M15） | 自动切 `fib-tree`：31 帧 Stage-0 → Apply → 41 帧 `O(n) Memoized Linear`（`SUBTREE PRUNING` 在位、胶囊数 2）→ Apply → 11 帧 `O(n) Linear Iterative Scan`（胶囊数 3） |
| ACT 3 跨维转场（M15） | 自动切 `pascal-comb` 并推进两次 Apply 至 17 帧，跳第 7 帧：`2D Matrix: dp [5×3]` + `Cursor [3][1]` + `WRITES: 5`，判据 `O(M * N) Matrix DP` |
| ACT 4 观察点（M15） | 自动采纳 `dp[4][2] === 6` 并触发 `→T`：瞬移到 `FRAME 15 / 17`、徽章 `→ #15`、断言 `TRUE`、`Cursor [4][2]` |
| ACT 5 自检（M15） | 自动打开 Spec 第 3 页签并跑完 **6/6 PASS**，导览结束后顶栏仍 44px 且 `scrollWidth == clientWidth == 770` |
| 导览中断（M15） | `Stop Tour (Act 1/5)` 点击后：字幕条消失、按钮回到 `Tour`、`AST-IR v2.4` 徽章恢复、`FRAME 1333 / 1334` 现场保留；页面任意处 `pointerdown` 同样立即中断；`Skip Next →` 从 ACT 1 直进 ACT 2 且导览不退出 |
| WebCrypto 豁免（M15） | `crypto.getRandomValues` 版 `fib(5)+6000 数组`：33 帧 / `~1073 KB`（>180KB）仍**不驱逐**，tooltip `full snapshot` |
| WebCrypto 漂移（M15） | `crypto.randomUUID` 版 `fib(12)`：931 帧 `Stage 0 (931f · LAZY)` → 点回 477ms 恢复 931 帧，出现 `NON-DETERMINISTIC RE-HYDRATION (Frame values may vary)`，报告保持冻结 `O(2^n)` |
| 预设复测（M15） | Rain 40 帧 Two-Pointer（Apply 退场）、DP 29 帧 `O(M*N) Matrix DP`、Binary 10 帧 `O(log n) Logarithmic Halving`、Fast Power 13 → 22 帧且终端 `65536` |
| 跨阶段包络图（M16） | fib 三级火箭后 SVG 同时渲染 3 条曲线：Stage 0 `#f43f5e` 虚线（dash `4 3`，31 点）、Stage 1 `#38bdf8`（41 点）、Stage 2 `#10b981`（11 点，激活 `stroke-width 2`）；面积包络透明度 `0.07 / 0.07 / 0.18`；`svg 388×64` 与容器同宽 |
| 包络图点击跳帧（M16） | 0% → `FRAME 1 / 11`（`cx 34`）、25% → `FRAME 3 / 11`（102.4）、50% → `FRAME 6 / 11`（205）、100% → `FRAME 11 / 11`（376） |
| LAZY 态曲线完整性（M16） | `fib(10)` 三级后 `Stage 0 (354f · LAZY)` / `Stage 1 (80f)` / `Stage 2 (21f)`，包络图仍绘出 354 / 80 / 21 个点，图例 `Stage 0 peak 11 dashed · 354f · LAZY` |
| 导览零延迟（M16） | MutationObserver 时间线：幕标签到「轨迹 + 判据」齐备 56ms（ACT 2）、12ms（ACT 3）、14ms（ACT 5）；`setFrames` 与 `setAiReport` 仍是两次提交，但两次之间不再叠加 380ms 延迟，7 次 Apply 无一出现「新轨迹 + 旧结论」的秒级空档；对照导览外手动切预设 `FRAME 1/40` 已换而判据在 948ms 后才归位 |
| 六幕导览（M16） | 新增 ACT 5：`dp-matrix` 29 → 15 帧 `O(M * N) Optimal Scan`（2D→1D 滚动）与 `fast-power` 13 → 22 帧 `O(log n) Iterative Halving` + 终端 `65536`；自检后移至 ACT 6 |
| 断点续播（M16） | ACT 3 处 `pointerdown` → 字幕条 `ACT 3/6 · PAUSED` + `Resume Act 3/6` / `Restart` / `Dismiss ×`，顶栏 `Resume Tour (Act 3/6)`，`FRAME 1 / 13` 与 `O(2^n)` 现场保留；Resume 后 3→4→5→6 跑到 `TOUR COMPLETE · total 20.1s` 且 `6/6 PASS` |
| 顶栏零溢出（M16） | 闲时 / 运行态 `Stop Tour (Act 6/6)` / 暂停态 `Resume Tour (Act 3/6)` 三种文案下均实测 `header 44px` 且 `scrollWidth == clientWidth == 770` |
| Skip 语义（M16） | `Skip Next →` 结束的是**当前驻留**：ACT 2 内含 3 段驻留（预设后 + 两次 Apply 后），需连点 3 次才进 ACT 3；导览不因 Skip 退出 |
| 导览时长口径（M16） | 驻留设计合计 19.14s；本测试 iframe 定时器被限频（回调 ≥1s 对齐），整轮实测 28.3s、续播段实测 20.1s，两个数字均如实归档，不拿设计值冒充实测 |
| 提交前复跑·包络图（M16） | 同一 iframe 复跑 fib 三级火箭：`svg 388×64`、三条 polyline 31 / 41 / 11 点、`#f43f5e` 虚线 dash `4 3`、激活阶段 `stroke-width 2`、包络透明度 `0.07 / 0.07 / 0.18`、游标 `cx 34`；点击轴 0/25/50/100% → `FRAME 1 / 3 / 6 / 11`（共 11 帧） |
| 提交前复跑·LAZY 曲线（M16） | 手写 `fib(11)`：`Stage 0 (289f · LAZY)` / `Stage 1 (69f)` / `Stage 2 (23f)`，包络图 polyline 仍为 289 / 69 / 23 点，图例 `Stage 0 peak 12 dashed · 289f · LAZY` |
| 提交前复跑·续播（M16） | `Tour` → `Stop Tour (Act 1/6)`；对 `window` 派发 `pointerdown` 同样暂停为 `Resume Tour (Act 1/6)` + `ACT 1/6 · PAUSED` + `Resume Act 1/6` / `Restart` / `Dismiss ×`；续播至 `TOUR COMPLETE · total 32.5s`、自检页签 `Live Kernel Self-Check (22 Invariants)` 实测 `6/6 PASS`（FAIL 0）；三种导览状态下 `header 44px` 且 `scrollWidth == clientWidth == 770` |
| 横轴绝对刻度（M17） | fib 三级火箭默认 `X: Abs Frames`：Stage 0 `x 34 → 292.6`（31f / 76% span）、Stage 1 `x 34 → 376`（41f / 100%）、Stage 2 `x 34 → 125.8`（11f / 27%），轴右端标 `41f`，`svg 388×64` 不变 |
| 横轴归一化（M17） | 点 `X: Norm % ⇄` 后三条 polyline 末端全部 `x1 376`、轴右端标 `100%`；此时点击 0 / 25 / 50 / 100% → `FRAME 1 / 3 / 6 / 11`，与 M16 基线逐项一致（口径切换不改数据） |
| 绝对刻度点击逆映射（M17） | 切回 Abs 后点击 0 → `FRAME 1 / 11`（cx 34.0）、13.4% → `FRAME 6 / 11`（79.9）、26.8% → `FRAME 11 / 11`（125.8）、50% 与 100% → 仍 `FRAME 11 / 11`（超出本阶段 27% 占比即 clamp，不越阶段跳帧） |
| 纵轴 sqrt 压缩（M17） | `Y: Linear ⇄` 切换后 Stage 2（峰值 2）折线顶点从 `y 38.8` 抬到 `y 29.9`，峰值 6 / 6 的 Stage 0/1 仍钉在 `y 10`；`depthCurve`、图例 peak 与报告 `Stack Depth` 数值一字不改 |
| 128 点保峰抽样（M17） | 手写 `fib(12)` 三级：Stage 0 `467f · LAZY` 绘 **128 点**、峰值 13 与冻结报告 `Stack Depth 13` 相等；Stage 1 75f / Stage 2 25f 未过阈值仍 1:1 绘 75 / 25 点，占宽 `16% / 5%`，轴右端 `467f` |
| 一键整幕跳过（M17） | ACT 2（含 3 段驻留）内**只点 1 次** `Skip Act →`：驻留期点击 52ms 后即 `ACT 3/7`；条件等待期点击（此时已冻结 2 个 Stage）也在下一个轮询周期进 `ACT 3/7`，导览不退出、继续跑到 `TOUR COMPLETE` |
| 抽样不变式模糊核对（M17） | 对 `n = 129..2000` 共 1872 个长度随机栈深并在随机位置插入 `999` 尖峰：曲线长度恒 128、`max(curve) - realPeak` 恒为 0、首末帧数值原样保留，`failures = 0`（#23b 的保峰约束按算法核一遍，不只靠两个样本） |
| 帧号 ⇄ 曲线索引换算（M17） | absolute 口径点击 64.37% → `FRAME 300 / 467`，游标 `cx 252.1` 与换算值 `curveIndexOf(299) = 81`、`34 + 81/127 × 342 = 252.1` 完全一致，圆点仍坐在抽样折线上；`cy 13.0` 反解为该桶最大栈深 12（不等于该帧真实栈深，已列遗留） |
| 七幕全预设（M17） | MutationObserver 记录整轮激活预设集合 = 7/7：`infinite-loop` → `fib-tree` → `pascal-comb`×2 → `dp-matrix` → `fast-power` → `rainwater` → `binary-search` → 自检；幕次时间线 `20 / 5048 / 12644 / 17634 / 20663 / 28677 / 32648ms`，整轮 `total 36.6s`（限频环境） |
| URL 现场分享（M17） | comb 预设 + 第 6 帧 + 芯片 `dp[4][2] === 6` 点 `Share` → `#preset=pascal-comb&frame=5&watch=dp%5B4%5D%5B2%5D%20%3D%3D%3D%206`；无手势环境下剪贴板被拒，按钮诚实降级为 `Link in URL`；带该哈希重载 → 预设自动选中、`FRAME 6 / 13`、断言回显（Stage 0 无 dp 故 `ERROR`，符合 #16e） |
| 非法哈希兜底（M17） | `#preset=not-a-preset&frame=-7&watch=` 重载后回落默认 `Trapping Rain Water`（`FRAME 1 / 40`）、断言列表为空、控制台无 error/warn |
| 窄视口零溢出（M17） | 新增两枚轴模式芯片与 `Share` 按钮后实测：`header 44px / 770 == 770`、`footer 52px / 770 == 770`、左右 `h-9` 子标题栏 `321 == 321` 与 `448 == 448`、包络面板 `412 == 412`、滚动容器 `438 == 438`、`body 770 == 770` |
| 定时器限频证据（M17） | 顶层页 `document.hidden === true`、`setTimeout(40ms)` 连续间隔实测 `790 / 1000 / 1000 / 1001 / 1000 / 1001ms`，因此本轮导览时长仍是限频口径，可见浏览器整轮时长继续标注为未测 |
| 游标双层指示（M18） | 手写 `fib(12)` 467 帧抽样阶段：点击 30% → `FRAME 140 / 467`，实心点 `cy 28` + 空心环 `cy 19`（同 `cx 136.3`）+ 芯片 `frame depth 7 (bucket peak 10)`；37% → `FRAME 173` 为 `cy 22 / cy 19`（9 vs 10）；44% → `FRAME 206` 只剩实心点 `cy 19`（10 == 10），环与芯片自动消失 |
| 游标读数互证（M18） | 三次真实深度读数与底部火焰轨高度独立对上：`54% / 69% / 77%` × 峰值 13 → `7.02 / 8.97 / 10.01`，即 7 / 9 / 10，与芯片显示的帧深度完全一致 |
| 五字段全状态链接（M18） | comb 演到 Stage 2、第 7 帧、L7 断点与 `dp[4][2] === 6` 点 `Share` → `#preset=pascal-comb&stage=2&frame=6&bp=7&watch=dp%5B4%5D%5B2%5D%20%3D%3D%3D%206`，逐字段与指令给出的形态一致 |
| 首屏自动演进（M18） | 带该哈希重载，MutationObserver 时间线：`boot 284ms` → Stage 0/1 胶囊 `421ms` → Stage 2 就绪 `484ms` → `FRAME 7 / 17` 定位 `500ms`；落地态 3 枚胶囊（13f / 37f / 17f）、`2D Matrix: dp [5×3]`、`Cursor [3][1]`、L7 按钮标题翻为 `Remove breakpoint at L7`、断言回显 `FALSE`（第 7 帧尚未写入 `dp[4][2]`） |
| 演进与帧定位的先后（M18） | 帧号 effect 在 `pendingShareStageRef` 未清空前不动游标，实测重载后游标直接落在 Stage 2 的第 7 帧而不是先在 13 帧的 Stage 0 上闪一下 |
| 事件驱动跳幕（M18） | ACT 2 条件等待期点一次 `Skip Act →` → `ACT 3/7` 实测 **19ms**（M17 同路径为 977ms 轮询周期）；ACT 1 等 1334 帧熔断轨迹的四轮复测 `304 / 322 / 324 / 330ms`，同 iframe 内 `MessageChannel` / `requestAnimationFrame` / `setTimeout(0)` 均实测 `0ms`，可排除调度器限频，残余来源尚未隔离 |
| 8 项内核自检（M18） | 页签 `Live Kernel Self-Check (24 Invariants)`，实测 **8/8 PASS**（FAIL 0），逐项毫秒 `TDZ 9.2 / Fuse 0.8 / Recursion 0.6 / Halving 0.6 / Matrix 0.0 / Viewport 0.8 / Downsampler 0.1 / Permalink 0.1`（TDZ 冷启动首轮 16.0ms）；新增 `Peak-Preserving 128-Bucket Downsampler` detail `500 frames -> 128 points · peak 42 (injected 42 @ #333) · first 2 · last 2`，`Permalink Hash Parser & Sanitizer` detail `preset pascal-comb · stage 2 · frame 6 · bp 5,9 · watch 1` |
| 预设主路径与边界（M18） | DP 29 帧 `O(M * N) Matrix DP`（Apply 可见）、Binary 10 帧 `O(log n) Logarithmic Halving`（Apply 隐藏）、Fast Power 13 帧（Apply 可见）、Rain 40 帧 Two-Pointer（Apply 隐藏）、fib 31 帧 `O(2^n)`（Apply 可见）、infinite-loop 1334 帧 `[FUSE_STEP_LIMIT]`；越界断言 `dp[99][0] === 1` → `ERROR` |
| 窄视口零溢出（M18） | 游标环 + 深度芯片 + 演进逻辑全部上线后实测：`header 44px / 770 == 770`、`footer 52px / 770 == 770`、`h-9` 子标题栏 `321 == 321` 与 `448 == 448`、`body 770 == 770`；另记一项既有现象：AI 面板遥测条内容 `537px` 大于其容器 `251px`，靠外层 `overflow-y-auto` 吸收横向溢出（该 JSX 自 M17 起未改动，本轮枚举审计时才发现） |
| 全容器零横向溢出（M19） | 自检第 6 项 detail 实测 `header 770px / 770px · 5 scroll boxes zero overflow (160/160 159/159 438/438 251/251 660/660) · 8 code/x-axis owners exempt by #12b · viewport 770x553`，耗时 2.3ms；AI 面板容器 `266/251 → 251/251`。**首次运行曾 FAIL**：`[MEMO_INJECTION_TARGET]` 是不可断行的长标签，把 `Jump #353` 顶出容器右沿 5px（同行在 `Jump #6 / #9` 时 `225/225` 正常），补 `min-w-0` + `break-all` 后转 PASS |
| Min-Max 振幅带（M19） | `fib(10)` 的 Stage 0（354 帧，此刻为 `LAZY`）绘出 **256 点**多边形（上沿 128 + 下沿 128，`opacity 0.26`），控制行 `min-max band 126/128 buckets`——128 个桶里 126 个真的发生过退栈折叠；带完全由快照 `depthFloorCurve` 绘出，未触发重水化。激活阶段切到 Stage 1（83 帧，1:1 曲线）时带整条不出现，符合 #25b |
| 跳幕取消隔离（M19） | Skip 落在 1334 帧熔断轨迹投递**之前**：五轮 fresh-page `18 / 18 / 22 / 26 / 27ms` 进 `ACT 2/7`，熔断横幅在点击时刻与推进之后均未出现（重轨迹一次都没上屏）；落在投递**之后**（延迟 80 / 90ms 点击）两轮仍 `361 / 370ms`，与 M18 的 `304~330ms` 同量级——该情形是已在渲染队列里的那一笔，`terminate` 救不了（#25c） |
| 自定义源码链接（M19） | 手改 `walk(6)`（15 帧）点 `Share` → `#preset=dp-matrix&frame=3&code=Ly8gTTE5…`（含 `watch` 全长 **318 字符**），按钮显示 `Link in URL`（无手势剪贴板被拒）；带哈希重载 → `FRAME 4 / 15`、代码区首行可见 `// M19 自定义分享现场：手写 walk(6) 线性扫描`、判据 `O(n) Linear Iterative Scan` / `O(1) Scalar Accumulator`、热点 L4（6x）、峰值栈深 2 |
| 纯 bp 链接（M19） | `#preset=pascal-comb&frame=0&bp=7&watch=dp%5B4%5D%5B2%5D%3D%3D%3D6` 重载后 L7 按钮标题为 `Remove breakpoint at L7`、`FRAME 1 / 13`、断言原样回显；非法哈希 `#preset=not-a-preset&stage=9&frame=-3&bp=0,-2&watch=x` 整体忽略，回落默认 Rain（`FRAME 1 / 40`）、断点集合为空 |
| 8 项内核自检（M19） | 页签 `Live Kernel Self-Check (25 Invariants)`，实测 **8/8 PASS**（FAIL 0），逐项毫秒 `TDZ 10.1 / Fuse 0.6 / Recursion 0.2 / Halving 0.2 / Matrix 0.1 / Viewport 2.3 / Downsampler 0.2 / Permalink 0.7`；第 8 项 detail `preset pascal-comb · stage 2 · frame 6 · bp 5,9 · watch 1 · code 41ch round-trip OK, oversize+corrupt rejected` |
| 预设主路径与边界（M19） | Rain 40 帧 Two-Pointer（L9 11x）、DP 29 帧 Matrix DP（L14 6x）、Binary 10 帧 Logarithmic Halving、Fast Power 13 帧（栈深 7、L2 6x）、fib 31 帧 `O(2^n)`（栈深 6、L2 15x）、comb 13 帧 `O(2^n)`（栈深 5、L2 11x）、infinite-loop 1334 帧 `[FUSE_STEP_LIMIT]`（L5 666x）；越界断言 `dp[99][0] === 1` → `ERROR` |
| 火焰轨 DOM 虚拟化（M20） | `infinite-loop` 1334 帧：竖条 **1334 → 160（-88.0%）**、该行盒子 `4009px → 197px`、`footer scrollWidth/clientWidth 4572/770 → 770/770`、整页元素数 451；桶 title 逐根可核（首根 `Frames 1-8 · peak depth 1 → #0`、末根 `Frames 1326-1334 → #1325`）。短轨迹仍 1:1：Rain 40/40、DP 29/29、Binary 10/10、Fast Power 13/13、fib 31/31、comb 13/13 |
| 投递后跳幕归因复算（M20） | 虚拟化后 Skip 落在 1334 帧投递**之后**六轮实测 `324 / 332 / 361 / 365 / 370 / 372ms`——与 M19 的 `361 / 370ms` 同量级，**没有改善**；对照实验：单独把 1334 帧那一跑落到 `FRAME 1 / 1334` 实测 `56ms` 且 `longtask` 为 0 条，在已就位的 1334 帧轨迹上按 `ArrowRight` 逐帧步进也是 0 条长任务，而点击 Skip 后确实出现一个 `285~294ms` 的阻塞任务。结论：M19 的「1334 根竖条压垮 Commit」归因过窄，该支耗时仍未闭合 |
| 投递前跳幕（M20 复测） | 五轮 fresh-page `16 / 17 / 18 / 19 / 21ms` 进 `ACT 2/7`，熔断横幅在点击时刻与推进之后均未出现（无回归） |
| 显式横滚契约（M20） | 自检第 6 项 detail `header 770px / 770px · 5 scroll boxes zero overflow (160/160 159/159 438/438 251/251 660/660) · 7 explicit data-scroll-x-owner exempt == legacy #12b set · viewport 770x553`，耗时 1.5ms；标记数与 legacy class 命中数相等才 PASS，不等即回显 `owner drift: N marked vs M per #12b class rule` |
| 全阶段振幅带（M20） | `fib(10)` 演到 Stage 2 激活时，非激活的 `Stage 0 peak 11 · 354f · LAZY` 仍绘出 256 点多边形（`fill #f43f5e`、`opacity 0.09`），激活阶段保持 `0.26`；面积包络仍 `0.18 / 0.07` 层次可辨。激活阶段为 21 帧 1:1 曲线时无带、`min-max band` 芯片不出现 |
| `code + stage` 组合链接（M20） | 手改 `dbl(6)`（17 帧）Apply 到 Stage 1 后导出 `#preset=binary-search&stage=1&frame=0&code=Ly8gTTIw…`（全长 **294 字符**，两个字段共存）；重载后胶囊 `Stage 0 (17f)` + `Stage 1 (14f)`、`FRAME 1 / 14`、源码区是合成产物而 Stage 0 仍是自定义起点——链接带的是**演进起点**而非当前产物 |
| 9 项内核自检（M20） | 页签 `Live Kernel Self-Check (26 Invariants)`，实测 **9/9 PASS**（FAIL 0），逐项毫秒 `TDZ 4.6 / Fuse 0.7 / Recursion 0.3 / Halving 0.1 / Matrix 0.0 / Viewport 1.5 / Downsampler 0.0 / Permalink 0.5 / Flame 0.4`；第 9 项 detail `1334 frames -> 160 bars (cap 160) · tiled 0..1333 with no gap or overlap · breakpoint @#777 kept in 1 bucket(s) and repFrame lands exactly on it · peak depth 10 (real 10) · hotspot L42 kept`；第 8 项 detail 追加 `code+stage=2 coexist OK` |
| 预设主路径与边界（M20） | 7/7 主路径全过（40 / 29 / 10 / 13 / 31 / 13 / 1334 帧，热点 `L9 11x / L14 6x / L2 1x / L2 6x / L2 15x / L2 11x / L5 666x`，火焰竖条依次为 40 / 29 / 10 / 13 / 31 / 13 / **160**）；越界断言 `dp[99][0] === 1` → `ERROR`；非法哈希仍整体忽略回默认预设 |
| 长任务四段拆测（M21，带临时探针） | 1334 帧路径：`instrumentCode 1.7~2.4ms`、`Worker 往返含结构化克隆 26.4~35.8ms`、`deriveRuntimeQuickWatches 1.3ms（最好）/ 135.4 + 135.1ms（StrictMode 双跑）/ 141ms（单趟，编译 2872 个 Function）`、`runAIDiagnostics（skipDelay）0.8~1.5ms`、`analyzeMatrixWrites 0.5~2.3ms`；整个跳幕窗口累计 `6060` 次 `new Function`。**真凶是 Quick-Watch 的逐帧重编译**，既非火焰条 Commit（56ms）也非诊断 |
| Watch 编译缓存效果（M21） | 投递后跳幕六轮 `129 / 134 / 134 / 139 / 140 / 141ms`（M20 基线 `324 / 332 / 361 / 365 / 370 / 372ms`，均值降幅约 -61%），`longtask` 由 `280~294ms` 降至 `123 / 131ms`；暖身后各轮编译次数 0。投递前五轮 `16 / 17 / 18 / 19 / 21ms` 无回归。**剩余 ~130ms 是逐帧调用 + `Object.keys(vars)` 的固有扫描成本**，不得写成长任务已归零 |
| 闸门未因缓存放宽（M21） | `dp[99][0] === 1` 仍 `ERROR`（不谎报 `FALSE`）；`alert(n)`、`process.exit()` 仍 `INVALID`；Watch 四态与 `→T` 语义不变。缓存键含形参名序列（`${expr}\\u0000${names}`），只按表达式缓存会跨帧串参 |
| footer / 根容器零溢出断言（M21） | detail 实测 `header 770/770 · footer 770/770 · 5 scroll boxes zero overflow (160/160 159/159 438/438 251/251 670/670) · 6 explicit data-scroll-x-owner exempt == legacy #12b set · viewport 770x553`，2.8ms。**反证已做**：往 footer 注入 3800px 假子元素后 detail 变 `footer 4365/770 · chrome overflow: footer 4365>770`，整台降到 `8/9 PASS` 且仅该项 FAIL |
| `analyzeMatrixWrites` 短路被否（M21） | 提案的「首末帧都无二维变量即 O(1) 返回空」不成立：手写 `if` 块内二维表样本，首帧（函数进入）与末帧（return 之后）作用域均无 `table`，而 shipped 代码在 `FRAME 6 / 10` 仍报 `WRITES: 2`——按首末帧裁剪会删掉 #16a 依赖的证据；该函数实测仅 `0.5~2.3ms`（占剩余任务 1~2%），**收益不足以支付语义损失，故未实现** |
| `code + stage` 断点两阶段裁剪（M21） | `#preset=fib-tree&stage=1&frame=0&bp=18`（38 字符，Stage 0 起点源码仅 12 行）重载后 `Stage 0 (31f)` + `Stage 1 (41f)`、`FRAME 1 / 41`、L18 徽章为 `Remove breakpoint at L18`；同链改 `bp=18,63` 后 63 被最终 20 行源码剔除，仅保留 L18 |
| 9 项内核自检（M21） | 页签 `Live Kernel Self-Check (27 Invariants)`，实测 **9/9 PASS**（FAIL 0）；预设主路径与火焰轨 160 根上限、`data-scroll-x-owner` 同源计数、`code+stage` 共存解析、桶平铺与断点保留全部复测通过 |

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
- [x] 通用自底向上 tabulation 合成仍只覆盖 fib（M7 报备 → **M8 闭环**：`sniffBinaryRecurrence` + `synthesizeBottomUpTabulation`，实测 `climb` 降维为 `dp = [0, 1, 2]` 循环，终端 `climbTabulated(5) = 8`，峰值栈深 5 → 2）
- [x] 记忆化场景 FRAMES 列无信息量（M7 报备 → **M8 闭环**：`subtreePruningAnchor` 让 `SUBTREE PRUNING: 1 → 0 (-100% Pruned)` 抢占主锚点，帧数上升明确标注 `TRACE STEPS … (Includes O(1) Memo Lookups)`）
- [x] HIT 与 DUP 无法区分，记忆化后的调用树看起来仍在冗余展开（M8：`firstChildCount > 0 && childCount === 0` 纯拓扑判据，实测 climb Stage-1 `DUP 1 / HIT 2`，与 `redundantCallCount = 3` 自洽）
- [x] Watch 不支持下标，无法断言 dp / grid 单元状态（M8：白名单放行 `[` `]`，实测 `dp[1][2] === 6` TRUE、`dp[99][0] === 1` ERROR 而非崩溃）
- [x] 缺少 GDB 式条件观察点跳帧（M8：`→T` 环形扫描首个 TRUE 帧，FRAME 1 → FRAME 11 / 29 正落在 `dp[1][2]` 写入帧，与 amber 突变格同帧）
- [x] Stage-2 形态覆盖仍限于「单参数 + 二元 + 恒等或常量基线」；多元（comb(n,k)）等返回 null（M8 报备 → **M9 闭合**：`sniffTwoParamPascalRecurrence` + `synthesizeTwoParamTabulation` 生成 `dp[r][c]` 二维表，实测 `combTabulated(4, 2) = 6` 且显微镜自动切到 2D 十字准星）
- [x] HIT 判据要求首次调用曾展开子树，对手写自底向上代码不显示剪枝成绩（M8 报备 → **M9 闭合**：调用树图例加 `title` 说明，并在 `DUP > 0 && HIT === 0` 时显示 `unpruned → click Apply for HIT`、`HIT > 0` 时显示 `memo cache pruned`）
- [x] `→T` 的绕回/仅当前帧/无解混用一个反馈（M8 报备 → **M9 闭合**：四态徽章 `→ #n` / `↺ #n (wrapped)` / `= only @ #n` / `no TRUE frame`，only 态不移动）
- [x] fib 预设被历史特判跳过 Stage-1，评委看不到 HIT 剪枝与 SUBTREE PRUNING（M9 取消 `targetFnName === 'fib'` 特判，实测 31 → 41 → 11 帧三段完整）
- [x] Stage-2 种子公式对 fib 会写出 `dp[2] = 2`（M9 实测暴露并修正为 `baseMax + 1` 起算 + 依赖完备门；climb 无回归，fib 终端 `5` 正确）
- [x] 二维档把 min-path 专用滚动样例强推给任意二维表（M9：无 `grid` 输入时 `optimizedCode = sourceCode`、Apply 退场）
- [x] Stage-2 仍不支持变步长（`n / 2`）与三参数及以上多维状态（M9 报备 → **M10 部分闭环**：折半递归新增 `O(log n) Logarithmic Recursion` 与游标消栈，实测 `halve(32)` → `halving steps = 5`；三参数及以上仍不支持）
- [x] Quick-Watch 建议按预设 id 取，自定义代码下提示性减弱（M9 报备 → **M10 闭合**：`deriveRuntimeQuickWatches` 改为运行时派生 + 逐条「至少一帧 TRUE」验证，fib Stage-2 自动从 `leftBranch` 切到 `dp[5] === 5` / `i === 5`）
- [x] 二维档滚动样例的门控依赖源码形态（M9 报备 → **M10 闭合**：`analyzeMatrixWrites` 纯运行时统计单元格变化，`includes('grid')` 全仓 0 处）
- [x] 递归门控 `redundant >= 2` 的阈值不稳定（M10 实测暴露：comb(4,2) 记忆化后冗余恰为 1，被误判线性；改为 `expansive>=1 → 指数 / redundant>=1 → 记忆化 / 0 → 线性`）
- [x] 自适应芯片取中间帧会推荐未写入的格子（M10：改为从末尾回溯到仍持有 dp 的帧，comb 给 `dp[4][2] === 6`）
- [x] 折半判定只看首个数值实参，`power(2,16)` 这类「第二参折半」不会被识别（M10 报备 → **M11 闭合**：按参数槽位收集序列，实测命中槽位 1（exp）`16 → 8 → 4 → 2 → 1`）
- [x] 折半消栈只对「返回值等于步数」的形态等价（M10 报备 → **M11 闭合**：形态门控——计数型 / 快速幂型 / 其余拒绝生成，实测 `weirdHalve` 隐藏 Apply 并标 `[SEMANTICS_PRESERVED]`）
- [x] 自适应规则 C 按变量出现顺序取前两个数值变量（M10 报备 → **M11 闭合**：按突变熵 `distinctCount` 降序，静态输入降级，实测 `target` 被排除、`acc` / `i` 入选）
- [x] 缺少优化前后轨迹的 A/B 对比能力（M11：`abState` + `runForComparison` + `⇄` 按钮，横幅冻结、12 ↔ 22 帧往返无损）
- [x] 折半识别要求实参全部是数字，对象/字符串实参会被跳过（M11 报备 → **M12 闭合**：`splitTopLevelArgs` 顶层逗号切分 + 逐槽判数值，实测 `bsearchHalve("arr", 32)` 靠槽位 1 命中）
- [x] 快速幂合成未显式拒绝负数指数（M11 报备 → **M12 闭合**：要求 `Number.isInteger(exp) && exp >= 0`，实测 `power(2, 16.5)` 判对数级但 Apply 隐藏并注明原因）
- [x] A/B 只保存最后一次 Apply 的两侧（M11 报备 → **M12 闭合**：`stageHistory` 全息栈，fib 实测 `Stage 0/1/2` 三段可零延迟互切）
- [x] 基线视图只加提示、未为两侧各存报告（M11 报备 → **M12 闭合**：`aiReport` 纳入快照，切回 Stage 0 时判据恢复为 `O(2^n)` 而非沿用 Stage 2）
- [x] 负指数递归熔断后被判 `O(2^n)` 并推荐记忆化（M12 实测暴露：`power(2,-4)` 签名环 → 已改判 `O(∞) Unbounded Recursion` 并隐藏 Apply，`depth(400)` 不受影响）
- [x] 快照把整条 frames 存在内存，长轨迹多级重构占用较多（M12 报备 → **M13 闭合**：`LAZY_FRAME_THRESHOLD = 250`，背景大轨迹释放 `frames` 只留 `frameCount`，实测 `fib(10)` 切走后 `Stage 0 (354f · LAZY)`，点回 <120ms 重水化 354 帧）
- [x] 快照与手改代码不同步：切走再切回会恢复快照源码、丢弃编辑（M12 报备 → **M13 闭合**：脏编辑显示 `UNSAVED EDIT DRAFT`，`Compile & Trace` 归零历史，切阶段先把手改代码真实跑成 `Draft` 阶段，实测 `Draft 2 (22f)` 可无损切回）
- [x] 2 参计数型（带 tag 参数）被保守拒绝合成，缺少「未使用参数可忽略」判定（M12 报备 → **M13 闭合**：非折半槽位原样透传即允许合成，实测 `bsearchHalve("arr", 32)` Apply 后 `steps = 5`；非透传 `tag + 1` 则明确报 `coupled multi-parameter state`）
- [x] 奇偶交替快速幂（`exp - 1` 分支）只按纯折半识别，奇数指数步数未验证（M12 报备 → **M13 闭合**：检测允许 `floor(a/2)` 与奇数 `a-1` 交替、折半步 ≥50%，实测 `powerAlt(2, 15)` 链 `15→14→7→6→3→2→1`，Apply 后 `32768`）
- [x] 惰性阈值只看帧数（>250），不按变量快照的实际字节数计（M13 报备 → **M14 闭合**：`approxBytes` O(1) 抽样 + `LAZY_BYTE_BUDGET = 180_000`，实测 135 帧 / ~4382KB 的 `fib(8)+大数组` 被驱逐）
- [x] 重水化会真实重跑源码：含 `Math.random` / `Date.now()` 时帧内容可能与冻结指标漂移（M13 报备 → **M14 闭合**：≤600 帧非确定性全量保留；超限重水化显示 `NON-DETERMINISTIC RE-HYDRATION` 并只更新 frameCount，冻结报告不变）
- [x] 交替折半只识别 `floor(a/2)` 与奇数 `-1`，其它小步变体断链（M13 报备 → **M14 闭合**：严格递减且每步 `a[k]-a[k+1] <= 2` 均计入，实测 `18→9→7→3→2→1` 命中并标 `INTERLEAVED_DESCENT`；递增/大步跳跃仍拒绝）
- [x] Draft 冻结需一次沙箱 + 380ms 人工诊断延迟（M13 报备 → **M14 闭合**：`runAIDiagnostics` 新增 `skipDelay`，脏编辑切阶段实测 DOM 提交 22.6ms）
- [x] 非确定性检测是源码正则，无法识别 `crypto.getRandomValues` 或经 helper 间接调用的时间源（M14 报备 → **M15 闭合**：正则补入 `crypto.getRandomValues(` / `crypto.randomUUID(`，实测 `crypto.getRandomValues` 版 33 帧 / ~1073KB 豁免驱逐、`crypto.randomUUID` 版 931 帧重水化显示漂移芯片；经 helper 间接调用仍属开放项）
- [ ] 字节预算是抽样估算（中段/末帧变量的 1.15 倍外推），不是真实堆占用；极端异构帧可能高估或低估（M14 新遗留）
- [ ] 重水化成本随帧数增长：931 帧非确定性快照实测约 1.7s（含渲染与轮询），期间仅显示 `RE-HYDRATING` 提示（M14 新遗留）
- [ ] Live Kernel Self-Check 使用合成帧夹具，覆盖内核判据但不替代全预设浏览器回归（M14 新遗留）
- [x] 五幕导览只深度演示 infinite-loop / fib-tree / pascal-comb 三个预设（M15 报备 → **M16 部分闭合**：新增 ACT 5 覆盖 `dp-matrix` 2D→1D 滚动压缩与 `fast-power` 槽位折半消栈（终端 `65536`），导览升为六幕；Rain 双指针与 Binary 区间折半仍未纳入自动导览）
- [x] 幕间切换后判据芯片最多滞后约 380ms（M15 报备 → **M16 闭合**：导览期间 `executeCode` 以 `skipDelay=true` 调用诊断，实测幕标签到轨迹+判据齐备仅 12~56ms；导览外手动切预设仍保留 380ms「思考感」，属有意的产品差异）
- [x] 导览被中断后不自动续演，需要重新点击 Tour 从 ACT 1 开始（M15 报备 → **M16 闭合**：`tourPhase` + `pausedTourAct` 记录中断幕，字幕条收敛为 `ACT k/6 · PAUSED` 并提供 `Resume Act k/6` / `Restart` / `Dismiss ×`，实测 ACT 3 暂停后续播到 `TOUR COMPLETE`）
- [x] `Skip Next →` 只结束当前驻留而非跳到下一幕，ACT 2 这类多驻留幕需要连点多次（M16 报备 → **M17 闭合**：幕级取消 `tourActSkipRef` + 按钮改名 `Skip Act →`，`tourHold` / `tourWaitFor` / 幕内每一步都把「本幕已跳过」当让位条件；实测 ACT 2 内 1 次点击 → ACT 3，无需连点 3 次）
- [x] 包络图横轴只有归一化口径，不同帧数的阶段在同一 x 位置代表不同绝对步数（M16 报备 → **M17 闭合**：`telemetryXMode` 双模式，默认 `absolute` 按 `frameCount / maxStageFrames` 占宽；实测 467f / 75f / 25f 三阶段占宽 `100% / 16% / 5%`，切回 `Norm %` 后三条曲线仍铺满 376px）
- [x] `depthCurve` 每帧一个整数，长轨迹未做分段抽样（M16 报备 → **M17 闭合**：`MAX_CURVE_SAMPLES = 128` 保峰分桶，实测 467 帧阶段绘 128 点且峰值 13 与冻结报告 `Stack Depth 13` 相等）
- [x] 纵轴取全局峰值，深递归与迭代同图时低峰值阶段被压扁（M16 报备 → **M17 闭合**：`telemetryYMode` 增加 `sqrt` 口径，实测 Stage 2 峰值 2 的折线顶点从 `y 38.8` 抬到 `y 29.9`，峰值 13 的两条曲线仍钉在 `y 10`）
- [x] 导览只覆盖 5 个预设，Rain 双指针与 Binary 区间折半未纳入（M15/M16 报备 → **M17 闭合**：七幕 `TOUR_ACTS.length = 7`，激活预设集合实测 7/7 全覆盖，自检固定在末幕）
- [ ] 导览时长仍测不到「可见浏览器」口径：本轮所有测试页面 `document.hidden === true`，`setTimeout(40ms)` 实测间隔 `790 / 1000 / 1000 / 1001 / 1000 / 1001ms`，整轮只能给限频环境值（M16 遗留延续，M17 补充了限频证据）
- [x] URL 分享只承载 `preset / frame / watch`，不含 `stageHistory`、断点集合（M17 报备 → **M18 闭合**：哈希扩到 `stage` 与 `bp`，首屏按序真实 Apply 自动演进；实测 `#preset=pascal-comb&stage=2&frame=6&bp=7&watch=…` 重载后 484ms 到 Stage 2、500ms 定位 `FRAME 7 / 17`，胶囊 13f / 37f / 17f、`dp [5×3]`、`Cursor [3][1]`、L7 断点与断言全部就位；`API Key` 与 `> 2` 级 / Draft 历史仍有意不写入链接）
- [x] `stage` 只承诺 1..2 级：Draft 阶段与更深的历史无法靠确定性 Apply 序列复现，故不写进链接，打开后仍需手工分叉（M18 报备 → **M19 闭合**：新增第六个字段 `code`，用 UTF-8 安全 Base64URL 带上源码本身（上限 1600 字符），首屏解码成功即作为初始 `sourceCode` 进沙箱；实测手改 `walk(6)` 现场（含 `watch` 全长 318 字符）链接重载后 `FRAME 4 / 15`、代码区可见「M19 自定义分享现场：手写 walk(6) 线性扫描」注释、判据 `O(n) Linear Iterative Scan / O(1) Scalar Accumulator`。仍有意不承诺 `> 2` 级的 Apply 序列本身）
- [x] 事件驱动跳幕在轻提交场景实测 19ms，但 ACT 1 这类「等待与 1334 帧重提交同批」的场景仍要 304ms（同 iframe 内 MessageChannel / rAF / setTimeout(0) 均为 0ms，可排除调度器限频）；残余来源尚未隔离（M18 报备 → **M19 隔离并分情形闭合**：残余是「那一跑的 1334 帧已经 postMessage 并进了渲染队列」，不是等待节拍。加 `runInSandbox` 的 `onCancel` + `worker.terminate` 与世代号作废后，Skip 落在投递**之前**五轮 fresh-page 实测 `18 / 18 / 22 / 26 / 27ms` 且重轨迹一次都没上屏（熔断横幅在点击时刻与推进之后均未出现）；落在投递**之后**（延迟 80 / 90ms 才点）两轮仍是 `361 / 370ms`——取消救不了已在队列里的提交，作为边界保留，不得写成「ACT 1 也 <30ms」）
- [ ] 剪贴板成功分支未实测：自动化环境无用户手势，`navigator.clipboard.writeText` 被拒，界面按 `Link in URL` 诚实降级；`Copied!` 分支需在真实点击下复测（M17 新遗留）
- [x] AI 面板遥测条（`Time / Space / Hotspot / Peak stack`）在 770 下内容 `537px` 大于其容器 `251px`，靠外层 `overflow-y-auto` 吸收横向溢出；该 JSX 自 M17 起未改动，是 M18 把 `overflow-y-auto` 容器全量枚举时才发现的既有现象（其余容器实测 `160/160`、`159/159`、`438/438`、`660/660` 均零溢出），登记待后续窄视口精修而不是在本里程碑顺手改（M18 新发现 → **M19 闭合**：该行改 `flex flex-wrap` + 每枚芯片 `max-w-full truncate`，弃用 `overflow-x-auto whitespace-nowrap`——徽章折行而不是撑破容器，实测该容器 `266/251` → `251/251`；同时自检第 6 项升级为全量纵向滚动盒枚举，`#12b` 指定的 `PRE / overflow-x-auto / overflow-auto` 按 class 豁免，实测 `5 scroll boxes zero overflow (160/160 159/159 438/438 251/251 660/660) · 8 code/x-axis owners exempt by #12b`。改完已知的那一条并不等于全容器干净——首轮 FAIL 的元凶是瓶颈跳转行里不可断行的 `[MEMO_INJECTION_TARGET]` 把 `Jump #353` 顶出右沿 5px，另加 `min-w-0` + `break-all` 才转 PASS）
- [x] Min-Max 振幅带只给**激活阶段**绘制：三个阶段各画一条带会糊成实心，反而看不清波形；代价是多阶段对比时非激活阶段仍只有保峰上沿，其退栈波谷不可见（M19 报备 → **M20 闭合**：非激活阶段改以 `opacity 0.09` 绘带、激活阶段保持 `0.26`，仍只在真的有下沿（`floors.length === depths.length` 且 `peak > floor`）时出现；实测 Stage 2 激活时非激活的 `Stage 0 · 354f · LAZY` 绘出 256 点带 `fill #f43f5e / opacity 0.09`，与面积包络 `0.18 / 0.07` 层次可辨）
- [x] 带 `code` 的链接只承诺源码可复现，不承诺 `stageHistory`：手改源码 + 已 Apply 过的多级现场仍只能带 `code` 或带 `stage` 二选一（`needsCode = sourceCode !== presetSource && !stageReproducible`），两者同时存在时优先走 `stage`（M19 报备 → **M20 闭合**：解除互斥，带 `stage` 时 `code` 取 `stageHistory[0].sourceCode` 即演进起点，还原侧既有 effect 先跑自定义 Stage 0 再按序真实 Apply；实测手改 `dbl(6)` + Apply 导出 294 字符 `#preset=binary-search&stage=1&frame=0&code=…`，重载后 `Stage 0 (17f)` + `Stage 1 (14f)`、`FRAME 1 / 14`。注意当初若直接带「当前源码」会把合成产物当 Stage 0 再多演进一级，跑出根本不存在的 Stage 3）
- [x] 自检第 6 项的横滚豁免按 class 正则匹配，`PRE` / `overflow-x-auto` 一旦改名豁免会静默扩大（M19 报备 → **M20 闭合**：#12b 授权的容器全部显式标注 `data-scroll-x-owner="true"`，断言改读该属性，并额外要求「标记集合 == legacy class 规则集合」，不等即 FAIL 并回显两侧计数；实测 `7 explicit data-scroll-x-owner exempt == legacy #12b set`）
- [x] 「投递后跳幕 361ms 是因为 1334 根火焰条的 DOM 提交」这条归因需要验证（M19 的推断 → **M20 证伪**：竖条确实从 1334 降到 160（-88.0%）、顺带消除一个真实的 `4009px` 横向溢出（footer 4572/770 → 770/770、整页 451 个元素），但该场景六轮实测 `324 / 332 / 361 / 365 / 370 / 372ms` 没有改善；对照：1334 帧那一跑单独落地只花 56ms 且零长任务、已就位时逐帧步进也零长任务。耗时项仍未闭合，见下条）
- [x] 投递后跳幕的 ~330ms 阻塞任务尚未定位到具体消费者：已知它不是火焰条 Commit（56ms / 0 长任务），`longtask` 只给出「点击后 6ms 起、持续 285~294ms」这一条信息，未拆出沙箱回传 / 诊断 / 下一幕首绘各自占比（M20 报备 → **M21 拆测并消解主因**：四段 `performance.now()` 拆测显示 `instrumentCode 1.7~2.4ms`、`Worker 往返含克隆 26.4~35.8ms`、`runAIDiagnostics（skipDelay）0.8~1.5ms`，而 `deriveRuntimeQuickWatches` 单趟 **141ms / 编译 2872 个 Function**、StrictMode 双跑 135.4 + 135.1ms、整窗累计 6060 次——真凶是 Quick-Watch 扫描里 `evalWatchExpression` 的逐帧重编译。加 `(expr, paramKeys)` 编译缓存后六轮实测 `129 / 134 / 134 / 139 / 140 / 141ms`、长任务 `123 / 131ms`，降幅约 -61%。**剩余 ~130ms 是逐帧调用 + `Object.keys(vars)` 的固有扫描成本，仍未归零**）
- [x] 自检第 6 项的枚举范围是纵向滚动盒（`overflowY auto|scroll`），**flex 容器的横向溢出不在扫描内**：M20 的 footer 溢出（4572/770）就是靠虚拟化而非靠断言发现的。是否把「所有 `clientWidth > 0` 且非横滚责任人的盒子」纳入断言尚未决定，扩大范围可能把设计内的 `overflow-hidden` 裁剪误判成溢出（M20 报备 → **M21 闭合**：不盲目扩大枚举域，改为显式断言 `header` / `footer` / 整页根容器三个 `overflow: visible` 的 flex chrome 零溢出，`overflow-hidden` 容器明确排除；反证已做——注入 3800px 假子元素后该项转 FAIL、detail 变 `chrome overflow: footer 4365>770`、整台 8/9 PASS，其余八项不受影响）
- [x] `code + stage` 共存时 `bp` 的行号上界仍按 Stage 0 起点源码计算（#25d 未放宽）：断点若落在 Apply 合成代码新增的行上会被判越界丢弃，此类链接需人工补断点（M20 报备 → **M21 闭合**：两阶段裁剪——`parseShareHash` 在 `stage >= 1` 时放宽到 `Math.max(起点行数, SHARE_STAGE_BP_FLOOR = 64)`，演进落地后再按 `liveActionsRef.current.sourceCode` 的真实行数二次过滤。实测 `#preset=fib-tree&stage=1&frame=0&bp=18`（Stage 0 仅 12 行）重载后 L18 徽章为 `Remove breakpoint at L18`；同链 `bp=18,63` 的 63 被最终 20 行源码剔除。两侧都有实测才算契约成立，见 #27e）
- [ ] Quick-Watch 全轨迹扫描的**固有成本**仍在：缓存只消掉重复编译，1334 帧 × 每条候选的「已编译函数调用 + `Object.keys(vars)` + 数组映射」无法靠缓存消除，实测残留 ~130ms（M21 新遗留）
- [ ] `WATCH_FN_CACHE` 的失效策略是「超限整体清空」（`WATCH_FN_CACHE_LIMIT = 512`），不是 LRU：极端多阶段 / 多预设会话下会一次性丢掉全部已编译函数、下一轮重新编译。当前实测暖身后每轮编译 0 次，未观察到抖动（M21 新遗留）
- [ ] 第 6 项的 chrome 断言只覆盖 `header` / `footer` / 根容器三个具名盒子，其它 flex 容器若将来出现同类撑爆仍不在断言范围内——扩大枚举域会误判设计内 `overflow-hidden` 裁剪，仍未解决（M21 新遗留）
- [ ] 桶聚合让细粒度交互退化：`> 160` 帧时一次点击最多只能定位到 8 帧的粒度（1334 / 160），精确逐帧仍需方向键或包络图横轴点击；桶内 `repFrame` 只保证「断点优先、否则最深」，不保证等于用户想去的帧（M20 新遗留）
- [x] 抽样后游标圆点画在「所在桶的最大栈深」上，可能高于该帧真实栈深（M17 报备 → **M18 闭合**：实心点改取 `frames[markerFrame].callStack.length`，桶峰值降级为 dash 空心环 + 竖向细线，只在折叠时出现，芯片回显 `frame depth X (bucket peak Y)`；实测 467 帧抽样阶段三点 7/10、9/10、10/10 与火焰轨 54%/69%/77% × 峰值 13 逐一对上。128 点折线本身的下降沿仍是抹平的，只是不再冒充当前帧真相）
- [x] 条件等待期间的 `Skip Act →` 让位粒度等于 `tourWaitFor` 的 60ms 轮询周期（M17 报备 → **M18 闭合**：`waitUntil` 改事件驱动，React 提交与 Skip/Stop/外部 pointerdown 都直接唤醒等待者，定时器仅作兜底；ACT 2 等待期实测 19ms，M17 同路径 977ms；ACT 1 重提交同批场景仍 304ms，见上条未隔离项）

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
