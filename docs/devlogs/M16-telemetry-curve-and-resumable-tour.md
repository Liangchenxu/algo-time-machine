# M16 · 跨阶段 SVG 栈深包络遥测图、导览零延迟同步与六幕断点续播

Commit：本次提交（`git log -1`）— feat(telemetry): 完成 Milestone 16 跨阶段SVG栈深包络遥测图、导览零延迟同步与六幕断点续播

## Why · 背景动机

M15 把验收成本从评委身上移走了一大半，但留下三类仍然敞开的缺口：

1. **多阶段收益看不见形状**。Stage 0/1/2 只能靠帧数胶囊（`Stage 1 (41f)`）和横幅百分比来感受，
   「递归树深度塌成一条平线」这个这个项目最有说服力的画面从来没有被画出来过。
2. **惰性驱逐让历史彻底不可见**。M13/M14 之后，后台阶段一旦超过 `250f / 180KB` 就释放 `frames`，
   此时想对比「基线的深锯齿 vs 现在的浅平线」必须先花几百毫秒重水化——遥测在最需要它的场景下反而失明。
3. **导览仍是五幕，且中断即丢**。M15 遗留第 1 条（只演示 `infinite-loop` / `fib-tree` / `pascal-comb`
   三个预设）与第 3 条（被中断后必须从 ACT 1 重跑）都还在；评委若在 ACT 3 被打断，
   只能从头再看一遍，路演节奏里等于作废。
4. **导览里的判据比手动操作慢半拍**。M15 用条件等待规避了 380ms 人工思考延迟，但轨迹与结论
   仍然是两批 DOM 变更——「新轨迹 + 旧结论」的空档在逐帧采样里是真实存在的。

## What & Where · 核心改动

### 1. `depthCurve` 随快照持久化（`src/App.tsx`）

- `StageSnapshot` 新增 `depthCurve: number[]`，由模块级
  `buildDepthCurve(trace) = trace.map((f) => f.callStack.length)` 生成（1 帧 = 1 个整数）。
- 三处写入：`makeSnapshot`（Apply 冻结阶段）、Draft 冻结、重水化回写
  （`frames / frameCount / approxBytes / depthCurve` 四者同源更新，防止曲线与帧数脱节）。
- `evictBackgroundFrames` **不触碰 `depthCurve`**：驱逐只把 `frames` 置空，曲线继续完整存在。
  这是「LAZY 阶段仍可绘图」的契约基础。

### 2. Cross-Stage Stack Envelope 面板（`src/App.tsx`，插在 Call-Tree 面板之前）

- 常量：`TELEMETRY_H = 64`、`TELEMETRY_LEFT = 34`、`TELEMETRY_RIGHT = 12`、
  `TELEMETRY_TOP = 10`、`TELEMETRY_BASE = 46`；配色 `STAGE_CURVE_COLORS`
  = `#f43f5e` / `#38bdf8` / `#10b981` / `#a78bfa` / `#f59e0b` / `#e879f9`。
- `stageCurves = useMemo(...)` 从 `stageHistory` 派生 `{depths, peak, frames: s.frameCount, verdict, evicted, color, active}`；
  `evicted` 定义为 `s.frames.length === 0 && s.frameCount > 0`。
- 几何：横轴**按各阶段自身进度归一化**（`telemetryX(length, i)`），纵轴按全部阶段的全局峰值
  `telemetryMaxDepth` 归一（`(depth - 1) / (max - 1)`）；每阶段一个 `<polygon>` 面积包络
  （激活 0.18、非激活 0.07）+ 一个 `<polyline>` 曲线，Stage 0 固定 `strokeDasharray="4 3"`，
  激活阶段 `strokeWidth 2`、其余 `1.3`。
- 当前帧标记：激活曲线上 `<circle r=3.2>` + 竖向游标 `<line>`，帧号经
  `markerFrame = min(currentFrameIdx, curveLen - 1, frames.length - 1)` 三重 clamp。
- 交互：`<svg onClick>` 把 `clientX` 映射为比例 → `setCurrentFrameIdx` 并停止播放；
  图例按钮 `Stage N peak X · Yf [· LAZY]` 直接调 `handleRestoreStage(N)`。
- 宽度来源：`telemetryRef` + **同步 `el.clientWidth` 测量**（`ResizeObserver` 与 `resize` 只作兜底），
  因为在被遮挡的标签页里 `ResizeObserver` 回调可能不投递，若让它成为唯一来源，SVG 会永久停在初始 300px。

### 3. 导览零延迟同步（`src/App.tsx` `executeCode`）

- `runAIDiagnostics(codeToRun, res.frames || [], res.error, apiKey, tourRunningRef.current)`：
  导览运行期间把 M14 已有的 `skipDelay` 打开，`setFrames` 与 `setAiReport` 之间只剩诊断自身的耗时
  （不是同一次提交，但不再叠加 380ms，见 #22c 的口径）；
  导览外手动操作仍保留 380ms 的「AI 思考感」，属有意的产品差异。

### 4. 六幕与断点续播（`src/App.tsx`）

- `TOUR_ACTS` 从 5 条扩为 6 条：新 ACT 5 `2D Rolling Buffer & Positional Halving`
  （`dp-matrix` Apply → `fast-power` Apply），自检后移为 ACT 6；
  顶栏文案、字幕条、`Stop Tour (Act x/N)`、`Resume Tour (Act x/N)` 全部由 `TOUR_ACTS.length` 驱动。
- 状态机收敛为 `runJudgeTourFrom(fromAct)` + `pauseJudgeTour` / `dismissJudgeTour` / `skipTourAct`，
  `startJudgeTour` 退场；`tourPhase: 'idle' | 'running' | 'paused' | 'complete'` 与 `pausedTourAct` 记录断点幕。
- 幕内封装 `traced()` / `staged(n)` / `selectAndTrace(id)` 三个判据谓词，
  全部读 `liveActionsRef`（最新渲染的 handler 与 state），杜绝 M15 那条过期闭包事故。
- 中断语义改造：`Stop Tour` 与字幕条外的 `pointerdown` 不再直接清空，而是
  `tourTokenRef++` → 释放当前驻留 → `tourPhase = 'paused'` + `pausedTourAct = 当前幕`；
  `Dismiss ×` 才真正回到 `idle`。Resume 从**同一幕开头**重跑，因此该幕的动作与条件等待全部真实复现。
- 字幕条三态：运行 `ACT k/6`、暂停 `ACT k/6 · PAUSED` + `Resume Act k/6` / `Restart` / `Dismiss ×`、
  完成 `TOUR COMPLETE | Six-act showcase finished · total X.Ys · engine left live for inspection`。
- `KERNEL_INVARIANT_COUNT` 由 21 → 22；Spec 弹窗 DEVLOGS 标题自动 `[M1-M16]`，
  并新增 `16. Cross-Stage Envelope & Resumable Tour (M16)` 卡片与协作日志条目。

### 5. 文档同步

- `docs/devlogs/INDEX.md`：M15 哈希回填 `588709b`、M16 行、不变量 **#22（a–e）**、
  基线表头改「M16 复测」、新增 9 行 M16 实测、闭合 M15 三条遗留、新挂 4 条遗留。
- `AGENT_GUIDE.md`：惰性快照条目补包络图段；导览条目改写为六幕 + 零延迟 + 续播；
  尾注改为「M1–M16 各一篇，共 22 条不变量」。
- `README.md`：2.5 节标题与正文加入包络图说明；第三节计数改 16 里程碑 / 22 不变量；
  第四节评委指南改为六幕 + 续播语义；基线表新增 4 行 M16 数据。

## 矛盾与认知纠偏 · 本里程碑攻克的问题

1. **`ResizeObserver` 在被遮挡的测试视口里不投递回调**
   首版把 SVG 宽度完全交给 `ResizeObserver`，实测面板永远画成初始 300px、
   点击跳帧的坐标映射因此整体偏移。改为 effect 内**先同步 `clientWidth` 量一次**，
   RO 与 `resize` 仅作为后续变化的兜底；验证依据是 `svg 388×64` 与容器同宽。
   教训：遥测几何不能只依赖异步观察器，至少要有一条同步测量路径。
2. **定时器限频会让「实测时长」失真**
   同源 iframe 测试台处于被遮挡上下文，Chrome 把 `setTimeout` 回调对齐到 ≥1s，
   驻留设计合计 19.14s 的导览整轮实测 28.3s。首版 40ms 采样器同样只拿到约 1s 粒度的样本，
   看起来像「渲染卡死」。证据采集因此改为 `MutationObserver` 时间线（只记真实 DOM 提交），
   文档同时保留设计值与两个实测值，并显式标注可见浏览器下未测。
3. **零延迟不能只改导览，也不能全局改**
   若把 `skipDelay` 无条件置真，日常手动操作的「AI 在想」节奏会消失，判据语义没变但产品体验退化。
   因此门控取 `tourRunningRef.current`：导览内 12–56ms 齐备，导览外对照实测判据仍在 948ms 后归位。
4. **续播从「幕的中途」恢复不可行**
   一幕内部含多次 Apply 与多次驻留，中断发生在任意点；若记录「幕内子步骤」就需要为每幕维护可序列化的进度，
   复杂度与出错面陡增。最终语义是 **Resume = 从该幕开头重跑**，条件等待保证重跑幂等
   （同一预设重复 `selectPreset`、同一阶段重复 Apply 会真实产生新阶段），并如实写进 #22(d)。
5. **`Skip Next →` 不是「跳幕」**
   它释放的是**当前驻留**，而 ACT 2 内含 3 段驻留（预设后 + 两次 Apply 后），实测需连点 3 次才进 ACT 3。
   首版文档写成「一键跳幕」，与实测不符，已按真实行为改写并登记为新遗留项。
6. **重水化必须回写 `depthCurve`**
   第一版只在 `makeSnapshot` 里算曲线，驱逐后的阶段点回时 `frameCount` 会随真实重跑更新、
   曲线仍是旧数组，一旦帧数漂移（非确定性场景）曲线与帧就不同源。补进重水化回写字段列表后，
   `fib(10)` 场景绘出 354 / 80 / 21 个点与胶囊 `354f / 80f / 21f` 严格一致。
7. **包络图横轴是进度而非绝对帧号**
   归一化让 11 帧的 Stage 2 与 354 帧的 Stage 0 能在同一张图上比较形状，
   代价是同一 x 位置在不同阶段代表不同绝对步数；点击跳帧只对**当前激活曲线**生效并 clamp 到实际帧数，
   不然后果是越界跳帧。该取舍登记为遗留项而不是偷偷放宽。
8. **`TOUR_ACTS.length` 必须承担幕数**
   M15 的「不变量条数写死必然过期」教训在导览上同样成立：字幕条、顶栏两处文案、
   `Stop Tour (Act x/N)`、`Resume Tour (Act x/N)` 若写死 `/5`，扩幕时必然漏改。
   本轮全部改为常量派生，实测第五/六幕文案零手工数字。
9. **幕外暂停监听会被非 Element 目标打断**
   提交前复跑时，向 `window` 直接派发 `pointerdown` 没有暂停导览：监听里写的是
   `target?.closest('[data-tour-bar]')`，而 `window` 上没有 `closest`，处理器**抛异常**并让
   `pauseJudgeTour()` 永远执行不到——契约「字幕条外任意点击即暂停」在这条路径上是破的。
   改为 `target?.closest?.('[data-tour-bar]')`（非 Element 目标自然落进暂停分支），
   复跑实测 `Resume Tour (Act 1/6)` + `ACT 1/6 · PAUSED` 正常出现，已把该边界写进 #22(d)。
10. **iframe 边框会偷走 2px 验收宽度**
    测试台首版带 `border: 1px`，`innerWidth` 只有 768、`scrollWidth == clientWidth == 768`，
    与文档承诺的 770 差 2px；去掉边框后才是真实的 `innerWidth 770 / header 44px / 770 == 770`。
    这是测量器具的缺陷，不是应用的回归，因此连同修正后的复测数据一起写进文档。

## Impact · 实测验证指标（770×553 iframe 测试台）

| 场景 | 实测结果 |
| --- | --- |
| 包络图绘制 | fib 三级火箭后 SVG 同时渲染 3 条曲线：Stage 0 `#f43f5e` 虚线（dash `4 3`，31 点）、Stage 1 `#38bdf8`（41 点）、Stage 2 `#10b981`（11 点，激活 `stroke-width 2`）；面积包络透明度 `0.07 / 0.07 / 0.18`；`svg 388×64` 与容器同宽 |
| 点击轴跳帧 | 0% → `FRAME 1 / 11`（`cx 34`）、25% → `FRAME 3 / 11`（102.4）、50% → `FRAME 6 / 11`（205）、100% → `FRAME 11 / 11`（376），`setIsPlaying(false)` 生效 |
| LAZY 态曲线完整性 | `fib(10)` 三级后 `Stage 0 (354f · LAZY)` / `Stage 1 (80f)` / `Stage 2 (21f)`，包络图仍绘出 354 / 80 / 21 个点，图例 `Stage 0 peak 11 dashed · 354f · LAZY`，无需重水化即可比较形状 |
| 导览零延迟 | MutationObserver 时间线：幕标签到「轨迹 + 判据」齐备 56ms（ACT 2）、12ms（ACT 3）、14ms（ACT 5）；全程 7 次 Apply 之间不再叠加 380ms，因此没有秒级「新轨迹 + 旧结论」空档（`setFrames` 与 `setAiReport` 仍是两次提交，#22c 的口径） |
| 导览外对照 | 非导览态手动切预设：`FRAME 1 / 40` 已切换，判据在 948ms 后才归位（380ms 延迟仍在，产品节奏未退化） |
| 六幕覆盖 | 新 ACT 5：`dp-matrix` 29 → 15 帧 `O(M * N) Optimal Scan`（2D→1D 滚动压缩）、`fast-power` 13 → 22 帧 `O(log n) Iterative Halving` + 终端 `powerIter(2, 16) = 65536`；自检后移至 ACT 6 并 `6/6 PASS` |
| 断点续播 | ACT 3 处派发 `pointerdown` → 字幕条 `ACT 3/6 · PAUSED` + `Resume Act 3/6` / `Restart` / `Dismiss ×`，顶栏文案 `Resume Tour (Act 3/6)`，`FRAME 1 / 13` 与 `O(2^n) Exponential` 现场原样保留；Resume 后 3→4→5→6 跑到 `TOUR COMPLETE · total 20.1s` |
| 顶栏零溢出 | 闲时 `Tour` / 运行态 `Stop Tour (Act 6/6)` / 暂停态 `Resume Tour (Act 3/6)` 三种文案下均实测 `header 44px` 且 `scrollWidth == clientWidth == 770`；装饰性 `AST-IR v2.4` 徽章仅在导览活跃期隐藏 |
| Skip 语义 | `Skip Next →` 释放当前驻留：ACT 2 需连点 3 次才进 ACT 3，导览不退出；`Dismiss ×` 回到 `idle` 并保留当前轨迹 |
| 导览时长口径 | 驻留设计合计 19.14s；iframe 定时器限频（回调 ≥1s 对齐）下整轮实测 28.3s、续播段实测 20.1s；**可见浏览器下的整轮时长未测** |
| 提交前复跑·包络图 | 同源 iframe 复跑 fib 三级火箭：`svg 388×64`、polyline 31 / 41 / 11 点、Stage 0 虚线 dash `4 3`、激活 `stroke-width 2`、包络透明度 `0.07 / 0.07 / 0.18`、游标 `cx 34`；点击轴 0 / 25 / 50 / 100% → `FRAME 1 / 3 / 6 / 11` |
| 提交前复跑·LAZY 曲线 | 手写 `fib(11)`：`Stage 0 (289f · LAZY)` / `Stage 1 (69f)` / `Stage 2 (23f)`，包络图仍绘出 289 / 69 / 23 个点，图例 `Stage 0 peak 12 dashed · 289f · LAZY`（帧已释放，无需重水化） |
| 提交前复跑·续播 | `Tour` → `Stop Tour (Act 1/6)`；对 `window` 派发 `pointerdown` 也暂停为 `Resume Tour (Act 1/6)` + `ACT 1/6 · PAUSED` + `Resume Act 1/6` / `Restart` / `Dismiss ×`；续播跑到 `TOUR COMPLETE · total 32.5s`，自检页签 `Live Kernel Self-Check (22 Invariants)` 实测 `6/6 PASS`（FAIL 0）；三种导览状态均 `header 44px`、`scrollWidth == clientWidth == 770` |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；17 份文档（INDEX + M1–M16）表格列数一致；`KERNEL_INVARIANT_COUNT = 22` 与 INDEX 登记条数一致；控制台无 error/warn |

## 遗留

- `Skip Next →` 只结束当前驻留而非跳到下一幕，多驻留幕需连点；一键跳幕还需引入幕级取消令牌。
- 包络图横轴按各阶段进度归一化，不同帧数的阶段在同一 x 位置代表不同绝对步数；绝对刻度模式待补。
- `depthCurve` 是每帧一个整数的完整曲线，1334 帧阶段约 1334 个数字，远小于帧对象图，但尚未做分段抽样。
- 导览时长在被限频的隐藏式视口里会被拉长（28.3s / 20.1s），可见浏览器下的整轮时长与真实驻留表现未实测。
- 包络图纵轴取全部阶段的全局峰值，阶段间峰值差异悬殊时（如 150 层熔断 vs 1 层迭代）低峰值阶段曲线会被压扁。
- Rain 双指针与 Binary 区间折半仍未纳入自动导览；ACT 5 只覆盖 2D→1D 滚动压缩与槽位折半快速幂。
