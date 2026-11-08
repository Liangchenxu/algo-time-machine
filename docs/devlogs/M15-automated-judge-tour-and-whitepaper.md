# M15 · 评委五幕自动路演导览、WebCrypto 非确定性守卫与工程白皮书

Commit：本次提交（`git log -1`）— feat(tour): 完成 Milestone 15 评委五幕自动路演导览引擎、WebCrypto非确定性守卫与工程白皮书

## Why · 背景动机

M14 之后内核已经闭环，但**验收成本仍然压在评委身上**：

1. 要亲手看全壁垒，需要连点 7 个预设、在 fib 与 comb 上各点两次 Apply、再找到自适应芯片点 `→T`、
   最后还要打开弹窗切页签跑自检。路演节奏里这不现实。
2. M14 遗留第 2 条仍然敞开：非确定性检测只认 `Math.random` / `Date.now` / `performance.now` / `new Date`，
   WebCrypto 的 `crypto.getRandomValues` 与 `crypto.randomUUID` 会绕过守卫，重水化后悄悄改历史。
3. 根目录 `README.md` 还是 Vite 脚手架默认文案，看不出这个项目真正的价值不在功能数量，
   而在**15 个里程碑零幻觉、零回归的协同工程范式**。

## What & Where · 核心改动

### 1. 顶栏 `Tour` 按钮（`src/App.tsx`）

- 位置：`Compile & Trace` 与 `Qoder Engineering Spec` 之间，`px-2.5 py-1 text-[11px] shrink-0 whitespace-nowrap`。
- 正常态：`Play` 线性图标 + `Tour`（琥珀描边）；运行态：`Square` 图标 + `Stop Tour (Act X/5)` + 琥珀高亮边框。
- 导览期间把装饰性徽章 `AST-IR v2.4 · WORKER SANDBOX` 临时隐藏（`tourRunning ? 'hidden' : 'hidden sm:inline'`），
  为运行态长文案腾出宽度；可压缩区仍然只有预设切换器（#12b 不动）。

### 2. 五幕状态机（`startJudgeTour`）

- `tourTokenRef` 可取消令牌 + `tourSkipRef` 驻留释放器；`tourWaitFor` 只等**真实运行条件**：
  `frames.length` 阈值、`isAnalyzing` 归位、`stageHistory.length >= n`、`selfCheckResults` **对象引用变化**。
- `TOUR_ACTS`（模块常量）驱动字幕条文案；`KERNEL_INVARIANT_COUNT = 21` 作为不变量条数的唯一来源。
- 幕次与真实动作：
  1. `infinite-loop` 预设 → 等 1334 帧熔断现场 → 游标跳 `frames.length - 2` → 驻留 3.2s。
  2. `fib-tree` 预设 → Apply（Stage-1 记忆化）→ Apply（Stage-2 一维 dp）→ 展示 `Stage 0/1/2` 胶囊。
  3. `pascal-comb` 预设 → 连续两次 Apply 至二维表 → `setCurrentFrameIdx(6)`（第 7 帧十字准星）。
  4. 采纳运行时派生的 `dp[` 开头 Quick-Watch 芯片 → 调 `seekNextTrue` 触发 `→T` 观察点瞬移。
  5. 打开 Spec 弹窗、切到第 3 页签、`await runKernelSelfCheck()`，等结果对象变化后定格。
- `liveActionsRef`：每帧把最新的 `handleSelectPreset` / `handleApplyOptimized` / `adoptWatchExpr` /
  `seekNextTrue` / `runKernelSelfCheck` 挂进 ref，导览只调用 ref 里的版本。

### 3. 导览字幕条与中断语义

- 顶栏下方 `data-tour-bar` 条：`ACT X/5` 徽章 + 本幕标题 + 技术看点 + `Skip Next →` + `Exit`；
  完成后转 `TOUR COMPLETE · total X.Ys · engine left live for inspection`。
- 运行期 `window` 捕获阶段 `pointerdown` 监听：**除字幕条内部**（`closest('[data-tour-bar]')`）之外
  任何点击立即 `exitJudgeTour()`：令牌自增、驻留释放、状态复位，控制权与当前轨迹原样交还。

### 4. WebCrypto 非确定性源（`hasNonDeterministicCalls`）

- 正则追加 `\bcrypto\s*\.\s*getRandomValues\s*\(` 与 `\bcrypto\s*\.\s*randomUUID\s*\(`，
  与既有四类来源共用 Strategy A（≤600 帧豁免驱逐）与 Strategy B（超限重水化漂移芯片）。

### 5. `README.md` 工程白皮书

- 重写为七节：项目定位与四道技术壁垒（TDZ / 退栈 / 三层熔断 / 崩溃前帧抢救）、核心架构图与五大独创亮点、
  Qoder 协同工程范式（三铁律 + 21 条不变量 + 15 篇日志 + 6 项实时自检）、评委 30 秒验收指南、
  实测基线表、已知边界（不做隐藏）、目录说明。

## 矛盾与认知纠偏 · 本里程碑攻克的问题

1. **异步串联里的过期闭包会把阶段冻结错**
   导览最初直接 `await handleApplyOptimized()` 两次。但 `handleApplyOptimized` 闭包里的
   `stageHistory` / `aiReport` 仍是**导览开始前那一帧**：第二次 Apply 会把上一个预设的源码冻结成 Stage 0，
   全息快照栈当场被污染。改为 `liveActionsRef` 每帧重挂最新 handler，并用
   `stageHistory.length >= n` 条件等待确认重渲染已经完成，才允许下一步。
2. **「点击任意处即中断」会吃掉 Skip 按钮**
   全局 `pointerdown` 监听如果不排除字幕条，点 `Skip Next →` 会先被中断逻辑接管，导览直接退出。
   用 `closest('[data-tour-bar]')` 把导览控件划为例外，二者语义才互不侵犯。
3. **770px 顶栏预算**
   `Stop Tour (Act 2/5)` + `Compile & Trace` + `Qoder Engineering Spec` 全称 + 品牌徽章会撑破 44px 单行
   （溢出即违反 #12a，控件不可达）。实测做法是运行态隐藏装饰性 `AST-IR v2.4` 徽章：
   运行态 `stopRight = 580px < specLeft = 588px`，`scrollWidth == clientWidth == 770` 保持。
4. **写死的不变量条数必然过期**
   M14 页签标题写死 `(20 Invariants)`，而 M15 追加 #21 后该数字就不实。改由
   `KERNEL_INVARIANT_COUNT` 单一来源渲染，导览第五幕标题同源取常量（本轮与指令文案的差异在此显式报备）。
5. **自检完成判据不能只看有没有结果**
   `!!selfCheckResults` 在第二轮会立即为真（上一轮的结果还在），导览会在自检真正跑完前就进入定格。
   改为比较**对象引用是否变化**（`!== previousChecks`）。
6. **固定 sleep 会拉长路演**
   首版每幕固定 `await sleep(2000)`，全程 26s 超出 25s 预算且慢机更易超时；
   换成条件等待 + 短驻留后实测 total 17.6s / 17.9s（两次）。
7. **测量口径**
   逐幕证据用页面内 300ms 采样器记录 `{act, frames, fuse, pruning, stages, matrix, cursor, writes, seek, pass}`
   去重后得到状态时间线，而不是人工看截图猜；Act 1 因此暴露出「熔断现场 400ms 到位、判据 800ms 归位」的
   真实节奏，并写进 INDEX 而不是美化成瞬间完成。

## Impact · 实测验证指标（770×553 iframe 测试台）

| 场景 | 实测结果 |
| --- | --- |
| 顶栏闲时几何 | `Tour` 按钮位于 `Compile & Trace`（right 507px）与 `Spec`（left 588px）之间，`left 515 / right 580 / h 27px`；`header 44px`、`scrollWidth == clientWidth == 770` |
| 顶栏运行态几何 | 按钮文案 `Stop Tour (Act 1/5)`、`right 580px < Spec left 588px`；装饰徽章 `AST-IR v2.4` 隐藏；`header 44px` 且 `scrollWidth == clientWidth == 770` 零溢出 |
| ACT 1 | 400ms：`Pre-crash trace preserved (1334 frames)` + `[FUSE_STEP_LIMIT]`；800ms：游标 `FRAME 1333 / 1334`、判据归位 `O(∞) Non-Terminating`，稳定展示到 3.6s |
| ACT 2 | `fib-tree` 31 帧 → Apply → 41 帧 `O(n) Memoized Linear`（`SUBTREE PRUNING` 在位、胶囊数 2）→ Apply → 11 帧 `O(n) Linear Iterative Scan`（胶囊数 3） |
| ACT 3 | `pascal-comb` 13 帧 → 37 帧记忆化 → 17 帧 `O(M * N) Matrix DP`；跳第 7 帧显示 `2D Matrix: dp [5×3]`、`Cursor [3][1]`、`WRITES: 5` |
| ACT 4 | 自动采纳 `dp[4][2] === 6`，`→T` 瞬移到 `FRAME 15 / 17`，徽章 `→ #15`、断言 `TRUE`、`Cursor [4][2]` |
| ACT 5 | 自动打开 Spec 第 3 页签并跑完 `6/6 PASS`（failCount 0）；结束后顶栏仍 44px / 770 零溢出 |
| 全程时长 | 内部计时 `TOUR COMPLETE · total 17.6s`（另一次 17.9s），逐幕时间线显示 ACT 5 在 15.28s 达成 |
| Stop Tour | 运行中点按钮：字幕条消失、按钮回到 `Tour`、徽章恢复、`FRAME 1333 / 1334` 现场保留可继续操作 |
| 点击任意处中断 | 对 `main` 派发 `pointerdown`：`abortedByPress = true`，字幕条消失、按钮回到 `Tour` |
| Skip Next | 字幕条内点 `Skip Next →`：ACT 1 → ACT 2 立即推进且导览不退出（`skipKeptRunning = true`）；`Exit` 清空字幕条 |
| WebCrypto 豁免 | `crypto.getRandomValues` 版 `fib(5)+6000 数组`：33 帧 / `~1073 KB`（>180KB）→ Apply 后仍 `Stage 0 (33f)`，tooltip 为 `full snapshot`（未驱逐） |
| WebCrypto 漂移 | `crypto.randomUUID` 版 `fib(12)`：931 帧 → `Stage 0 (931f · LAZY)`；点回 477ms 恢复 931 帧并显示 `NON-DETERMINISTIC RE-HYDRATION (Frame values may vary)`，`INSPECTING STAGE 0 BASELINE` 与冻结 `O(2^n)` 报告在位 |
| 预设回归 | Rain 40 帧 `O(n) Linear Two-Pointer`（Apply 退场）、DP 29 帧 `O(M*N) Matrix DP`（Apply 可见）、Binary 10 帧 `O(log n) Logarithmic Halving`（Apply 退场）、Fast Power 13 → 22 帧且终端 `65536` |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；16 份文档（INDEX + M1–M15）表格列数一致；21 条不变量 / 15 个里程碑行；控制台无 error/warn |

## 遗留

- 五幕导览只深度演示 `infinite-loop` / `fib-tree` / `pascal-comb`，DP 滚动压缩、Fast Power、Rain 双指针等
  壁垒仍需手动或按 README 指南查看。
- 幕间切换后判据芯片最多滞后约 380ms（本地引擎节流）；导览用条件等待规避，但视觉上仍可能出现
  一帧「新轨迹 + 旧结论」的空档。
- 导览被中断后不自动续演（控制权彻底交还），需重新点击 `Tour` 从 ACT 1 开始。
- 非确定性检测仍基于源码正则，经 helper 包装的间接随机/时间源识别不到（WebCrypto 直调已闭合）。
- 自检夹具仍是合成帧，不替代全预设浏览器回归。
