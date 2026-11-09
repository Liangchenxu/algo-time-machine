# 项目名称

AlgoTimeMachine —— 浏览器端 AST 自动插桩时间旅行调试器与 AI 复杂度诊断台

# 技术栈

Vite + React 18 + TypeScript + Tailwind CSS + `@babel/standalone` + `lucide-react`

# 核心架构

通过 Babel AST 插件自动在循环、赋值、函数调用处注入 `__trace` 快照钩子与 2000 步死循环熔断器，
在 Web Worker 隔离线程中安全运行，输出完整时间帧供前端回放与 AI 帧级诊断。

函数体额外以 `try ... finally { __exitFn() }` 包裹，保证递归返回时调用栈精准弹出；
`__trace` 内累计 `__lineHits`，使每一帧自带「截至该帧」的行级执行热力，供热力图与 AI 手术刀定位热点行。
`__enterFn(name, line, args)` 会把实参一并压栈，调用栈条目是带参签名（`fib(5)` / `dfs(1,2)`，无参 `fn()`，
单实参序列化截断 24 字符），因此重叠子问题可以直接计数，前端也能由 `callStack` 的演化序列
确定性还原调用树拓扑与每个激活节点的进出帧区间。

## 数据流

```
用户源码
  └─ src/core/instrumenter.ts        Babel AST 遍历，注入 __guard / __enterFn+__exitFn / __trace
       └─ src/core/sandboxRunner.ts  Blob Worker 隔离执行 + 3000ms 硬件级熔断
            └─ TraceFrame[]           frameIndex / line / event / variables / callStack / stdout / lineHits
                 ├─ src/App.tsx       时间旅行回放 + 内存显微镜 + 双指针联动 + 行级热力图
                 └─ src/services/aiDiagnostics.ts  DeepSeek 在线 / 内置免 Key 双引擎复杂度诊断
```

## 三层熔断

| 层级 | 位置 | 阈值 | 异常前缀 | 触发结果 |
| --- | --- | --- | --- | --- |
| 步数熔断 | `__guard` | 2000 步 | `[FUSE_STEP_LIMIT]` | 抛出疑似死循环告警，保留熔断前已采集的时间帧 |
| 递归熔断 | `__enterFn` / `__exitFn` | 调用栈 150 层 | `[FUSE_STACK_OVERFLOW]` | 抛出栈溢出告警；`finally` 退栈保证栈深真实 |
| 硬件熔断 | `sandboxRunner` | 3000ms | `[FUSE_WATCHDOG_TIMEOUT]` | `worker.terminate()` 强制终止 |

`src/**` 运行时代码零 emoji：异常文案统一使用上表前缀，**不得改动 `aiDiagnostics` 中与
`[FUSE_STEP_LIMIT]` 耦合的诊断谓词**（文案与前缀必须同步修改）。
复现扫描命令与「DevLog 引述历史文案除外」的范围说明见 `docs/devlogs/INDEX.md`。

## 时间帧契约

```ts
interface TraceFrame {
  frameIndex: number;                     // 帧序号，回放进度条的索引
  line: number;                           // 原始源码行号（retainLines 保证对齐）
  event: string;                          // 循环迭代 / 状态更新 / 函数进入
  variables: Record<string, any>;         // 该时刻作用域内可见变量的深拷贝快照
  callStack: string[];                    // 调用栈面包屑（含退栈后的真实深度）
  stdout: string[];                       // 截至该帧的 console.log 终端日志
  lineHits?: Record<number, number>;      // 截至该帧的累计行执行次数，驱动热力图与 AI 热点定位
}
```

## AI 诊断引擎与判据决策顺序

`src/services/aiDiagnostics.ts` 提供双引擎：填入 DeepSeek API Key 时在线诊断（失败自动回退），
留空时使用内置确定性引擎，按 `lineHits` / 栈深 / 熔断证据产出时空复杂度、瓶颈帧与可一键重跑的优化代码。
Key 仅驻留内存，不写入 localStorage。

本地引擎的分支顺序即优先级，**每一档的入口条件只读运行时时间帧证据，绝不读源码里的单词**：

```
1. [FUSE_STEP_LIMIT]        → O(∞) Non-Terminating
2. maxStackDepth >= 4       → 递归档，再按重叠子问题证据三选一：
     redundantCallCount >= 2 且 expansiveRedundantCount >= 1 → O(2^n) Exponential
     redundantCallCount >= 2 且 expansiveRedundantCount == 0 → O(n) Memoized Linear（缓存已消化重复）
     redundantCallCount < 2                                  → O(n) Linear Recursion（单链下潜）
3. low/high/mid 三元组，或 帧数 <= ceil(log2 n) * 4  → O(log n) Logarithmic Halving
4. dp 形态 = 二维表          → O(M*N) Matrix DP（并给出一维滚动数组重构）
5. dp 降为一维且仍有二维输入  → O(M*N) Optimal Scan / O(N) 1D Rolling Buffer
6. 兜底再分两路：同帧可见成对边界指针 → O(n) Linear Two-Pointer；
   只有单游标 + 标量累加器 → O(n) Linear Iterative Scan / O(1) Scalar Accumulator
```

签名进入次数必须按「函数进入」事件帧统计：兄弟调用退栈再压栈时栈深不变，
用相邻帧栈深增量会整段漏计重复求值（这是 M4 误判 `depth(400)` 的根因，M5 已闭环）。
而「重复进入」也不等于「重复展开」：记忆化后重复入参照样触发进入事件，
只有展开型重复（下一帧栈更深）才是指数级证据（M7 闭环）。

## 调试器与可视化能力

- 行号可点击设断点（`breakpoints: Set<number>`），火焰条顶部渲染断点标记，
  `Continue to Breakpoint` 与 `F8` / `b` 向后扫描第一个命中帧；切换预设即清空断点。
- `Call-Tree Topology` 面板仅在 `maxStackDepth >= 2` 且存在多个激活节点时出现，提供
  `2D SVG Tree`（默认，后序槽位 + 父节点 x 取子节点均值 + 三次贝塞尔连线）与 `Compact List` 两种视图；
  三态着色（active 电光蓝 / DUP 玫红 / retired 暗灰，未来节点 opacity-40），点击节点跳到其进入帧；
  帧号变化时容器自动把「激活路径上最深的节点」平滑滚动到视口中心（越界由浏览器 clamp）。
- 线性递归的迭代改写由合并算子嗅探自动生成（乘法累积 / 加法累积 / 纯深度推进三种形态），
  嗅探仅作用于代码生成，复杂度判档仍严格只看运行时签名与栈深。
- 窄视口布局契约：44px 顶栏与各 `h-9` 子标题栏必须单行且 `scrollWidth == clientWidth`
  （不折行不等于可达，禁止用 `overflow-hidden` 裁掉操作按钮）；单行代码严禁自带 `overflow-x-auto`，
  横向滚动责任在外层容器，滚动条外观由 `src/index.css` 全局统一为 5px 暗色。
  顶栏加入 `Tour` 按钮后仍须零溢出：唯一允许的让步是导览运行时临时隐藏装饰性 `AST-IR v2.4` 徽章，
  可压缩区依旧只有预设切换器。
- 基准对比语义：基线若被 `[FUSE_*]` 截断而重跑完整，横幅只显示
  `STATUS: FUSE_ABORTED → COMPLETED` 与栈深收益，不得计算帧数百分比；
  两侧均未熔断但属于「递归转迭代的栈空间降维」（`base 栈深 >= 4`、`curr <= 2` 且帧数上升）时，
  主锚点切换为 `STACK REDUCTION: -x% Call Frames`，上升的帧数一律标注 `TRACE STEPS … (Unrolled Loop)`，
  不得伪装成收益。
- 代码合成能力（口号：**合成可用源码、判据不得用源码**）：单链递归按嗅探到的合并算子生成乘法累积 / 加法累积 / 游标推进三套等价迭代代码；
  任意重叠递归（不限 fib）由 `dominantRecursiveName` 定位函数并注入 Top-Down 记忆化包装
  （`const __memo = {}` + `JSON.stringify([参数])` 守卫，原函数体塞进 IIFE 保留 return 语义）；
  定位失败或形参含默认值/解构时放弃注入并说明原因。
  Stage-2 继续降维：`sniffBinaryRecurrence` 从函数体嗅探 `fn(p - a) <op> fn(p - b)`（直接式与
  `let a = fn(p-1); let b = fn(p-2); return a + b` 拆分式都支持）与恒等/常量基线，
  生成自底向上 `dp` 数组递推；`sniffTwoParamPascalRecurrence` 另认
  `if (k==0||k==n) return 1` + `fn(n-1,k-1)+fn(n-1,k)` 的双参数帕斯卡形态，生成 `dp[r][c]` 二维表
  （`r`/`c`/`dp` 命名直接驱动显微镜 2D 十字准星）。
  **种子契约**：种子只覆盖基线定义域 `0..baseMax`，循环从 `baseMax + 1` 起算，
  并要求 `maxOffset <= baseMax + 1`；`max(baseMax, offsets) + 1` 的旧式在 fib 上会写出错误的 `dp[2]`。
  形成「暴力指数递归 → Stage-1 顶向下记忆化剪枝 → Stage-2 数组/二维表递推消栈」的二级火箭，
  且**所有重叠递归（含 fib）都走同一条管线，禁止函数名特判**；超出可推导形态则返回 null 保持源码不变。
- Watch 条件守卫：标量 / 1D 数组 / 2D 矩阵卡片均可 Pin 置顶；断言在当前帧变量快照上求值，
  显示 TRUE / FALSE / INVALID / ERROR 四态（作用域缺变量必须 ERROR 而非谎报 FALSE），
  并受闸门约束（放行 `[` `]` 下标断言如 `dp[1][2] === 6`；禁止点号、引号与单等号赋值以切断成员注入；
  禁 `ident(` 调用与宿主对象名）。每条断言右侧 `→T` 为 GDB 式条件观察点：从下一帧起环形扫描，
  停在第一个使断言为 TRUE 的帧，并区分四态——`→ #n`（前方命中）/ `↺ #n (wrapped)`（绕回命中）/
  `= only @ #n`（仅当前帧成立，不移动）/ `no TRUE frame`（无解）；
  Quick-Watch 芯片由**当前轨迹**派生（预设种子 + 运行时补位，逐条验证「至少一帧 TRUE」，
  取值帧从末尾回溯到仍持有目标容器的帧），因此重构后会从 `leftBranch` 自动切到 `dp[i]` / `i`，
  死变量不出现、`→T` 恒可命中；芯片点击只"加入断言"不产生位置副作用，跳转仍由用户显式点 `→T`。
- 二维矩阵读写分离（`analyzeMatrixWrites`）：比较相邻帧每个单元格，`writeCount === 0` 为只读输入、
  `> 0` 为可变状态表；只有两类同时存在时才提供一维滚动压缩（`includes('grid')` 类源码门控已禁止），
  显微镜 2D 卡片据此显示 `READ-ONLY` / `WRITES: n` 徽章。
- 折半递归：进入事件的实参**按顶层逗号切分（忽略 `[]` `{}` `()` 内逗号）后逐槽收集**，
  任意槽位严格单调递减，每一步满足 `a[k+1] = floor(a[k]/2)` 或 `a[k]-a[k+1] <= 2`（-1/-2 小步微调），
  且首值 ≥8、总步数 ≥2、折半步占比 ≥50% 即判 `O(log n) Logarithmic Recursion`
  （`power(2,16)` 由槽位 1 命中；`powerAlt(2,15)` 链 `15→14→7→6→3→2→1`、
  `mix(2,18)` 链 `18→9→7→3→2→1` 均由槽位 1 命中；槽位 0 是字符串时不丢弃整次调用）；
  消栈必须过形态门：计数型生成 `while (curr > 1)` 游标循环，**多参计数型仅当非折半槽位在自调用中
  原样透传**时才合成并保留原签名与调用字面量（`bsearchHalve("arr", 32)` → `steps = 5`）；
  双参含乘法且**指数为非负整数**时生成迭代二进制快速幂（实测 `powerIter(2, 16) = 65536`、
  奇偶交替 `powerAlt(2, 15)` → `powerAltIter(2, 15) = 32768`），其余形态保留源码并标
  `[SEMANTICS_PRESERVED]`、隐藏 Apply，拒绝原因分型为
  `coupled multi-parameter state` / `custom return composition` / `negative/non-integer exponent`。
  **含小步交错的递归只允许快速幂形态降维**（计数循环会少算步数）；递增或大步跳跃不属于收敛链。
  迭代侧对应 `O(log n) Iterative Halving`；该判定必须先于线性递归档。
  **`[FUSE_STACK_OVERFLOW]` + 签名链重复 = 不收敛**，判 `O(∞) Unbounded Recursion` 且拒绝任何改写
  （`depth(400)` 实参无环，仍判线性递归）。
- 多阶段全息快照：每次 Apply 把当前阶段冻结成 `StageSnapshot`（源码 + 帧 + 沙箱错误 +
  **该阶段的 aiReport** + 指标）并追加新阶段；横幅右侧的 `Stage N (mf)` 胶囊直接同步恢复全部状态
  （零延迟、不重跑沙箱），横幅始终比较 Stage 0 与当前阶段（停在 Stage 0 时对比最新阶段并显示
  `INSPECTING STAGE 0 BASELINE (Full Report Restored)`），非最新阶段隐藏 Apply 防止分叉，
  仅切换预设才清空历史。
  **双维度惰性快照**：`LAZY_FRAME_THRESHOLD = 250`、`LAZY_BYTE_BUDGET = 180_000`；
  非激活快照满足任一阈值即释放 `frames` 但保留 `frameCount` / `approxBytes` / 源码 / 报告 / 指标
  （胶囊标 `LAZY`，tooltip 给出 KB 与双阈值），点击胶囊用 `runInSandbox` 重水化、不重算诊断；
  ≤250 帧且 ≤180KB 仍 0ms 同步切换。
  **跨阶段栈深包络遥测图**：快照自带 `depthCurve`（重水化时刷新），
  `evictBackgroundFrames` 只清 `frames` 不动曲线，因此 `LAZY` 阶段的曲线依然完整；
  曲线做**保峰分桶**：`MAX_CURVE_SAMPLES = 128`，≤128 帧逐帧 1:1，超过则「首帧 + 126 个桶内最大栈深 + 末帧」，
  分桶无缝覆盖 `1..n-2`，故 `max(depthCurve)` 恒等于该阶段 `metrics.maxStackDepth`（实测 467 帧阶段绘 128 点、峰值 13）。
  曲线索引与帧号是两套坐标系，必须经 `curveIndexOf` 换算。
  单个 SVG 坐标系叠加各阶段折线 + 半透明面积包络（Stage 0 玫红 `#f43f5e` 虚线、Stage 1 天蓝 `#38bdf8`、
  Stage 2 翠绿 `#10b981`，激活阶段加粗），高 64px；**横轴双口径** `X: Abs Frames ⇄ Norm %`
  （absolute 按 `frameCount / maxStageFrames` 占宽，实测 467f / 75f / 25f 阶段占 `100% / 16% / 5%`；
  normalized 铺满同宽只比波形）、**纵轴双口径** `Y: Linear ⇄ Sqrt`（sqrt 只压缩绘制高度，不改任何数值）；
  激活曲线当前帧**分两层指示**：实心圆点取该帧真实 `callStack.length`，抽样桶峰值只以 dash 空心环 +
  竖向细线共存显示，仅在 `bucketDepth > exactDepth`（本桶真的折叠过）时出现，控制行回显
  `frame depth X (bucket peak Y)`；LAZY 阶段手里没有帧时实心点回落桶峰值，不凭空画新真相。
  点击横轴按**当前模式**逆映射并 clamp 到激活阶段的合法帧区间；
  容器宽度先同步读 `clientWidth`，`ResizeObserver` 与 `resize` 只作兜底（遮挡环境下 RO 可能不投递）。
  **非确定性重放守卫**：源码含 `Math.random(` / `Date.now(` / `performance.now(` / `new Date` /
  `crypto.getRandomValues(` / `crypto.randomUUID(`
  且帧数 ≤600 时豁免一切驱逐（保证 100% 历史重放）；超限重水化若长度变化或仍含非确定性标记，
  遥测条显示 `NON-DETERMINISTIC RE-HYDRATION (Frame values may vary)`，只更新 frameCount/字节估算，
  冻结报告与指标不重算。
  **编辑态防覆盖**：历史栈存在时手改源码 → 横幅显示 `UNSAVED EDIT DRAFT` 并隐藏 Apply；
  `Compile & Trace` 以手改代码为新基准清空历史；点击阶段胶囊会先把手改代码真实跑成
  `Draft` 临时阶段再切换（诊断走 `skipDelay=true`，实测 22.6ms），绝不静默丢弃。
- Spec 弹窗第 3 页签 **Live Kernel Self-Check (`KERNEL_INVARIANT_COUNT` Invariants，当前 24)**：8 项确定性微基准
  （`__mtmTdz` 闭包 + 可解析 / `[FUSE_*]` 前缀 / 递归 A-A′-B 三档 / 槽位与交错折半 /
  矩阵读写分离 / 窄视口 `scrollWidth == clientWidth` / 128 点保峰分桶 / Permalink 哈希解析与清洗），
  每项显示 PASS/FAIL 与实测 ms，夹具纯浏览器执行，不使用 Worker、网络或 API Key。
  页签条可横滚，三个页签在 770px 下均可达。
- 评委七幕自动导览（顶栏 `Tour`，覆盖全部 7 个内置预设）：`tourTokenRef` 驱动的真实内核编排，逐幕 =
  熔断现场抢救 → fib 三级火箭（DUP → HIT → 1D dp）→ comb 递归树转二维矩阵十字准星 → 自适应 `dp[4][2] === 6`
  芯片 + `→T` 观察点瞬移 → `dp-matrix` 2D→1D 滚动压缩 + `fast-power` 槽位折半消栈 →
  `rainwater` 双指针水柱 + `binary-search` 区间折半 → Spec 自检台点亮。
  幕间只等**真实运行条件**（帧数 / `isAnalyzing` / `stageHistory.length` / 自检结果对象变化），
  等待本身是**事件驱动**的：每次 React 提交与 `Skip Act` / `Stop Tour` / 幕外 `pointerdown` 都直接唤醒等待者
  （`tourWakeRef`），定时器只作兜底——轻提交场景一次跳幕实测 19ms（M17 的 60ms 轮询在本环境是 977ms），
  与 1334 帧重提交同批的 ACT 1 仍要 ~304ms，残余来源未隔离，不得写成全场景 <20ms；
  且导览期间诊断走 `skipDelay=true`，判据与轨迹实测 12~56ms 内齐备（导览外手动切预设仍有 380ms 差异）；
  `Skip Act →` 是**幕级**取消：一次点击让本幕剩下的驻留、条件等待与 Apply 全部让位（实测 ACT 2 内点一次
  即进 ACT 3，不再需要连点 3 次），幕开始前与暂停/Dismiss 都必须复位该标识；
  `Stop Tour (Act k/N)` 与字幕条外的任意 `pointerdown` 暂停到当前幕并记下 `pausedTourAct`，
  字幕条给出 `Resume Act k/N` / `Restart` / `Dismiss ×`；handler 一律经 `liveActionsRef` 取最新渲染，
  避免异步串联里的过期闭包把错误源码冻结成 Stage 0。幕数、按钮与字幕文案全部由 `TOUR_ACTS.length` 驱动。
- 现场分享（WATCH 行 `Share`）：把 `preset` + `stage`（只承诺可用确定性 Apply 复现的 1..2 级）+
  `frame`（0 基帧号）+ `bp`（升序正整数、去重、最多 16 个且不超过预设行数）+ `watch` 断言写进
  `window.location.hash`（用 `history.replaceState`，直接改 `location.hash` 会触发锚点滚动），并复制链接；
  剪贴板被拒时按钮显示 `Link in URL` 而不是谎报 `Copied!`。首屏解析到合法 `preset` 才改初始状态，
  非法即整体忽略回默认预设；带 `stage` 的链接会**自动按序真实 Apply** 演进到目标阶段
  （`autoEvolveRef` 走零延迟通道，某级不涨级即停止、不伪造阶段），实测重载后 484ms 到 Stage 2、500ms 定位帧号；
  帧号必须等演进结束再按当时真实帧数 clamp。分享回来的表达式仍只经 `evalWatchExpression`
  三道闸门求值（#13d / #14d 不因 URL 输入放宽）。控件放在可折行的 WATCH 行，不占顶栏预算（#21c 不变）。

- 调用树剪枝取证：重复激活按纯拓扑二分为 `DUP`（玫红，首次曾展开子树且本次也展开）与
  `HIT`（翠绿 `#10b981`，首次展开过而本次零子节点直接退栈 = 被记忆化缓存拦截），
  判据是 `firstChildCount > 0 && childCount === 0`，不读源码；配色优先级
  `active > pruned > expansive > retired`，徽章始终显示。

`optimizedCode === sourceCode` 时界面自动隐藏 Apply 按钮，避免出现「已最优仍提示再优化」。

## 工程记忆与实测基线

- 里程碑复盘、系统不变量清单、已修复问题核对表：`docs/devlogs/INDEX.md`（M1–M18 各一篇，共 24 条不变量）。
- 重构收益以同沙箱重跑的实测为准（`VERIFIED REFACTOR BENCHMARK` 横幅），不采用文案宣称值。
- 已知未闭合项（线性深递归仍标 `O(2^n)`）记录在 `docs/devlogs/M4-...md` 末节，勿在代码里默默绕过。

## 本地运行

```bash
npm install
npm run dev     # 开发服务器
npm run build   # 类型检查 + 生产构建
```

---

# 智能体反幻觉回味与版本纪律（Iron Laws）

以下三条对本仓库所有后续版本永久生效，与任何「快速改一下」的诉求冲突时，以本节为准。

## 准则 1 · 启动前强制回味（Context Reflection）

在开启新版本或接到新指令动手改代码**之前**，必须依次读取：

1. 本文件 `AGENT_GUIDE.md`（架构契约、三层熔断、判据决策顺序）；
2. `docs/devlogs/INDEX.md` 的系统不变量清单与「已修复问题清单」；
3. 最近一篇里程碑 DevLog。

据此核对本次改动是否会破坏既有不变量。**严禁凭对话记忆推断项目现状**：函数名、文件路径、
阈值、判据条件一律以当前文件为准重新读取确认；记忆与现状冲突时，以现状为准并更新记忆。
外部指令若要求回退已记录的不变量（例如重新引入 `typeof x` 直读或删掉 `globalThis.__mtmFrames`），
必须显式指出冲突、给出实测证据、并说明保留还是照办，不得静默改写。

## 准则 2 · 交付前强制归档心路历程（DevLog Archiving）

每次版本迭代完成后，必须在 `docs/devlogs/` 新增或更新对应里程碑文档，四段齐备：

- **Why 背景动机**：这一版为何存在，痛点是什么。
- **What & Where 核心改动**：精确到文件与函数，涉及配置变更要写明具体键值。
- **矛盾与认知纠偏**：踩到的坑、被推翻的假设、指令自带代码的缺陷，以及为何这样修。
- **Measured Impact 可量化影响**：帧数、栈深、耗时、体积、命中率等**实测数字**，
  禁止写入未跑过的估计值；没来得及测的，明确标注「未测」而不是编一个数。

同步更新 `INDEX.md` 的不变量清单、已修复问题核对表与实测基线表；若产生新的未闭合项，写进「遗留」而不是删掉。

## 准则 3 · 原子化验证与自动提交（Atomic Build & Git Commit）

每轮改动的收尾顺序固定，不可跳步：

1. `npm run build` 零 TypeScript / 语法报错（这是最低门槛，不是完成标准）。
2. 浏览器实测：至少覆盖每个预设的主路径 + 一条边界路径（熔断、越界、空帧），
   并检查控制台无 error/warn；无法目视确认的（例如截图通道不可用）必须显式说明。
3. `git status` 复核暂存内容（确认 `node_modules` / `dist` 被忽略、无残留临时文件、无密钥泄漏）。
4. `git add . && git commit`，使用 `feat(scope): 里程碑语义描述` 形式的中文信息，一步一提交，
   保持工作区干净，使 Git 历史与 `docs/devlogs/` 里程碑一一对应。

违反任一准则（尤其是「没实测就写文档」或「没跑就提交」）视为本版本未完成。
