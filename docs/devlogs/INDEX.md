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
| M13 | 本次提交 | [M13-passthrough-halving-and-draft-guard.md](./M13-passthrough-halving-and-draft-guard.md) | 透传多参计数折半合成、奇偶交替快速幂识别、大轨迹惰性快照与编辑防丢 Draft 守卫 |

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

## 当前实测基线（M13 复测，视口 770×553，`npm run build` 零 TS 报错）

> M13 轮复测了 Rain / Fast Power / fib / 自定义折半与奇偶变体 / `fib(10)` 惰性快照 / 编辑守卫；
> 其余预设（DP、Binary、Comb、死循环、`depth(400)`、`fact(6)`）沿用 M12 实测值，未在本轮重跑。

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
- [ ] 惰性阈值只看帧数（>250），不按变量快照的实际字节数计；少量超大数组快照仍可能占用较多内存（M13 新遗留）
- [ ] 重水化会真实重跑源码：含 `Math.random` / `Date.now()` 等非确定性代码时，帧内容可能与冻结时的 `metrics` 略有漂移（确定性演示不受影响，M13 新遗留）

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
