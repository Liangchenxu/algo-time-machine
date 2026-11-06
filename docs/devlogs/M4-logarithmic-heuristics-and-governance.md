# M4 · 算法判据闭环、重构前后实测基准与工程治理制度

Commit：本次提交（`git log -1` 可查）— feat(governance): 完成 Milestone 4 算法判据闭环、重构Benchmark对比与docs/devlogs反幻觉心路档案库

## Why · 背景动机

M3 交出去的界面已经是工业级工具，但留下了三处「说法与证据不一致」的隐患，外加一个流程问题：
每次新会话都要靠对话记忆来维持架构不变量。M4 的目标是把**判据、度量与记忆**三件事同时制度化：

1. 判据闭环：复杂度结论必须能由时间帧证据反推，不再依赖源码里出现了哪个单词。
2. 实测基准：重构收益必须由同一个沙箱重跑测得，而不是文案里写死的「约 15 帧」。
3. 工程记忆：`docs/devlogs/` + `AGENT_GUIDE.md` 的 Iron Laws，让下一个上下文窗口不必重新踩坑。

## What & Where · 三项裁决的落地

### 裁决 1 —— `O(log n)` 折半判据（`src/services/aiDiagnostics.ts`）

新增 `detectLogarithmicHalving(frames)`，双判据：

- 主判据（结构证据）：同一作用域内同时存在数值型 `low` / `high` / `mid` 三元组。
- 辅判据（量级证据）：轨迹中存在长度 ≥ 8 的一维数组，且总帧数 ≤ `ceil(log2 n) * 4`。

命中即输出 `Time: O(log n) Logarithmic Halving`、`Space: O(1) Constant Pointers`，
`frameInsights` 打 `INTERVAL_HALVING` / `BOUND_CONVERGENCE` 标签，
`optimizedCode = sourceCode` 使 Apply 按钮自动隐藏（对数界已是最优比较复杂度，无需重构）。

### 裁决 2 —— 只读输入矩阵 vs 状态转移表（`detectDpShape`）

按 `dp` 在时间帧里的**真实维度形态**分档，彻底摆脱 `includes('grid')` / `includes('dp[')`：

| 轨迹形态 | 判定 | 输出 |
| --- | --- | --- |
| `dp` 为二维数组（或存在二维表且无 `dp`） | `matrix2d` | `O(M * N) Matrix DP` / `O(M * N) 2D Tabulation`，并给出一维滚动数组重构代码 |
| `dp` 降为一维且轨迹仍含二维只读输入 | `rolling1d` | `O(M * N) Optimal Scan` / `O(N) 1D Rolling Buffer (Compressed)`，`optimizedCode = sourceCode`，Apply 功成身退 |
| 一维 `dp` 但无任何二维表（如 `fibDP`） | `none` | 落回线性档，不会被误判为矩阵 DP |

### 裁决 3 —— 异常前缀标准化，全仓零 emoji

| 旧文案 | 新文案 |
| --- | --- |
| `🚨 触发安全熔断：第 N 行附近疑似存在死循环…` | `[FUSE_STEP_LIMIT] 疑似死循环：第 N 行附近执行已超过 2000 步上限，沙箱已保留熔断前全部时间帧。` |
| `🚨 触发栈溢出熔断：函数 f 递归深度超过 150 层！` | `[FUSE_STACK_OVERFLOW] 函数 f 递归深度超过 150 层，触发调用栈熔断。` |
| `⏱️ 沙箱硬件级熔断：代码执行超过 3000ms 强制终止！` | `[FUSE_WATCHDOG_TIMEOUT] 沙箱硬件级熔断：代码执行超过 3000ms 强制终止！` |

**同步耦合点**：本地引擎的死循环分支原本判断 `errorMsg.includes('死循环')`，
现已改为 `errorMsg.includes('[FUSE_STEP_LIMIT]')`。熔断文案与诊断谓词必须一起改，
否则 O(∞) 报告会静默退化成 O(n) 报告——这条已写进 INDEX 不变量第 7 项。

## Benchmark Delta 与 Spec 双标签页（`src/App.tsx`）

- 新增 `baselineMetrics`（`framesCount / maxStackDepth / timeComplexity / spaceComplexity / execTimeMs`），
  只在点击 `Apply Refactor & Re-Trace` 的瞬间锁定；切换顶部预设时清空，避免跨算法串味。
- 重跑完成后在 AI 面板顶部渲染绿色 `VERIFIED REFACTOR BENCHMARK` 横幅：
  帧数（含百分比）、峰值栈深、空间复杂度、时间复杂度、沙箱时延五段实测对比。
- `Qoder Engineering Spec` 弹窗升级为双标签页：
  Tab1 `Architecture & Safety Fuse`（AST 管线 / 三层熔断含 `[FUSE_*]` 前缀 / 协同记录 / 判据决策顺序），
  Tab2 `DevLog & Reflection History [M1-M4]`（M1–M4 时间轴卡片，每张含 Why / What & Where /
  矛盾与认知纠偏 / Measured Impact 四段，并标注 commit 与完整日志路径）。

## 治理制度 · 反幻觉回味

- 新建 `docs/devlogs/`：`INDEX.md`（不变量清单 + 已修复问题核对表 + 实测基线）与 M1–M4 四篇复盘。
- `AGENT_GUIDE.md` 追加「智能体反幻觉回味与版本纪律（Iron Laws）」三条准则：
  启动前强制回味、交付前强制归档、原子化验证与自动提交。

## Impact · 实测验证指标（视口 771×553，逐条在浏览器取证）

| 场景 | 实测结果 |
| --- | --- |
| Binary Search Bounds | `O(log n) Logarithmic Halving` / `O(1) Constant Pointers`；证据文本「搜索空间长度 11，共完成 1 次折半探测（总帧数 10，对数预算 ceil(log2 n) * 4 = 16）」；Apply 按钮隐藏 |
| Min Path Sum 优化前 | `O(M * N) Matrix DP` / `O(M * N) 2D Tabulation`，29 帧，热点 L14（6x） |
| Min Path Sum 点击 Apply 后 | `O(M * N) Optimal Scan` / `O(N) 1D Rolling Buffer (Compressed)`，15 帧，热点 L10（4x），Apply 自动退场 |
| Benchmark 横幅 | `FRAMES: 29 → 15 (-48.3%) | PEAK STACK: 1 → 1 | SPACE: O(M * N) 2D Tabulation → O(N) 1D Rolling Buffer (Compressed) | TIME: O(M * N) Matrix DP → O(M * N) Optimal Scan | LATENCY: 1ms → 1ms` |
| Naive Fibonacci 宣称 vs 实测 | 引擎文案宣称 `Frames: 31 -> 15 (-52% Overhead)`，同沙箱实测 `FRAMES: 31 → 14 (-54.8%) | PEAK STACK: 6 → 2` —— 实测优于宣称，横幅以实测为准 |
| Infinite Loop Guard | 横幅 `[FUSE_STEP_LIMIT] 疑似死循环：第 5 行附近执行已超过 2000 步上限…`，保留 1334 帧，诊断仍正确命中 `O(∞) Non-Terminating`（谓词切换后未退化） |
| 手写 `depth(400)` 深递归 | `[FUSE_STACK_OVERFLOW] 函数 depth 递归深度超过 150 层`，保留 149 帧，`Space: O(n) Stack Depth 150` |
| 预设切换 | 基准清空，横幅消失（已验证 `bannerClearedOnPresetSwitch = true`） |
| Spec 弹窗 | 双标签页可切换；Tab1 含 `[FUSE_STEP_LIMIT]` 文本；Tab2 卡片渲染 Why/What/矛盾/Impact；弹窗内 emoji 扫描结果为 `[]` |
| 全仓 emoji 审计 | `instrumenter.ts` / `sandboxRunner.ts` / `App.tsx` / `aiDiagnostics.ts` 全部 `(none)` |
| 构建 | `npm run build` 零 TypeScript 报错 |

## 唯一未闭合项（如实记录，等待下一轮裁决）

线性但很深的递归（`depth(400)`，单分支自调用）仍会被标为 `Time: O(2^n) Exponential`，
因为 M4 只把**入口条件**换成运行时栈深，而该分支的**结论文案**仍是「指数级重叠子问题」。
空间侧 `O(n) Stack Depth 150` 是正确的。要彻底闭环需要再引入一个运行时信号：
同一函数以相同实参被重复进入的次数（重叠子问题的直接证据），据此在
`O(2^n) Exponential` 与 `O(n) Linear Recursion` 之间分档。属于新增判据分支，未擅自实施。
