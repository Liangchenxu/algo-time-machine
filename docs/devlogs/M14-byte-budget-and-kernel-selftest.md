# M14 · 双维度惰性预算、非确定性漂移守卫、广义小步交错折半与内核实时自检台

Commit：本次提交（`git log -1`）— feat(selftest): 完成 Milestone 14 字节级惰性预算、非确定性重水化守卫、广义交错折半与20条不变量实时自检台

## Why · 背景动机

M13 的遗留项都指向「判据正确，但边界与验证手段不足」：

1. **惰性只按帧数**：`fib(8)` 只有 135 帧，但只要作用域里挂一个 6000 元素的数组，整条轨迹仍可占用数 MB；
   250 帧阈值对此完全失明。
2. **非确定性重水化会悄悄改历史**：惰性快照切回时真实重跑源码，`Math.random` / `Date.now` 会让帧内容甚至帧数
   与冻结时不同，而界面没有任何提示。
3. **交错折半只认 -1**：`18 → 9 → 7 → 3 → 2 → 1` 这种含 -2 微调的收敛链会在第 2 步断链。
4. **Draft 冻结仍要等 380ms**：`runAIDiagnostics` 内的人工思考延迟对「切阶段自动保存草稿」是纯浪费。
5. **缺少当场验证内核的入口**：评委只能相信文档里的历史数字，无法在浏览器里亲手跑一组回归断言。

## What & Where · 核心改动

### 1. 双维度惰性驱逐（`src/App.tsx`）

- `StageSnapshot` 新增 `approxBytes`。
- `estimateSnapshotBytes(trace)`：取中段帧与末帧 `JSON.stringify(variables)` 的均值，乘帧数与 1.15，
  得到 O(1) 的字节估算；不做逐帧序列化。
- 新增常量 `LAZY_BYTE_BUDGET = 180_000`；`evictBackgroundFrames` 的驱逐条件变为
  `frames.length > 250 || approxBytes > 180_000`，且仅作用于非激活、仍持有帧的快照。
- 胶囊保持 `Stage N (mf · LAZY)`，tooltip 显示 `~KB` 估算与双阈值 `250f / 180KB`。

### 2. 非确定性重水化守卫（`src/App.tsx`）

- 新增 `hasNonDeterministicCalls(code)`，识别 `Math.random(` / `Date.now(` / `performance.now(` / `new Date`。
- **Strategy A**：命中且 `frameCount <= NONDETERMINISTIC_KEEP_FRAMES (600)` 时，豁免一切惰性驱逐；
  即使字节预算超限也保留原帧，保证历史重放 100% 一致。
- **Strategy B**：超过 600 帧而不得不重水化时，若 `restored.length !== snapshot.frameCount`
  或源码仍含非确定性标记，遥测条显示琥珀色 `NON-DETERMINISTIC RE-HYDRATION (Frame values may vary)`；
  同步更新 `frameCount` 与 `approxBytes`，但**不重算 `aiReport` / `metrics`**（冻结报告不崩）。
- 切换预设 / Apply / Compile / 任意阶段切换都会清除漂移芯片。

### 3. 广义小步交错折半（`src/services/aiDiagnostics.ts`）

- `detectHalvingArgs` 的每步判定从「折半或奇数 -1」放宽为：
  - 严格单调递减 `next < cur`；
  - 且 `next === Math.floor(cur / 2)` 或 `cur - next <= 2`；
- 保留首值 ≥8、总步数 ≥2、折半步占比 ≥50%。
- 摘要文案从「奇数步为减一交替」升级为「其余为差值不超过 2 的小步微调」。
- 合成门控不变（#19c）：含交错步进的链只允许快速幂形态；计数/未知形态仍返回
  `custom return composition → source preserved`。

### 4. Draft 冻结跳过人工延迟（`src/services/aiDiagnostics.ts` + `src/App.tsx`）

- `runAIDiagnostics(sourceCode, frames, errorMsg, apiKey?, skipDelay = false)`；
  `skipDelay=true` 时跳过 380ms 的 `setTimeout`。
- `handleRestoreStage` 冻结 Draft 时传入 `skipDelay=true`；沙箱仍真实执行，保证源码/帧/报告同源。

### 5. Live Kernel Self-Check 第 3 页签（`src/App.tsx`）

- `specTab` 扩展为 `'arch' | 'devlog' | 'selftest'`；标签 `Live Kernel Self-Check (20 Invariants)`。
- 进入页签或点击 `Run Kernel Self-Test Suite` 时执行 6 项确定性微基准：
  1. `AST TDZ Safe Closure`：`instrumentCode` 产物含 `__mtmTdz` 且 `new Function` 可解析；
  2. `Fuse Prefix Contract`：插桩产物同时含 `[FUSE_STEP_LIMIT]` 与 `[FUSE_STACK_OVERFLOW]`；
  3. `Recursion A / A' / B Gating`：合成帧序列分别断言 `O(2^n)` / `O(n) Memoized Linear` / `O(n) Linear Recursion`；
  4. `Positional & Interleaved Halving`：槽位 1 `16→8→4→2→1` 与 `18→9→7→3→2→1` 均判对数级，后者带 `INTERLEAVED_DESCENT`；
  5. `Matrix Write Separation`：`grid` 零变化判 READ-ONLY、`dp` 有变化判 MUTABLE；
  6. `771px Viewport Reachability`：实时读取顶栏 `scrollWidth === clientWidth`。
- 每项显示 PASS/FAIL 徽章与实测毫秒；夹具只使用内存帧与纯函数，不使用 Worker、网络或 API Key。
- 页签栏改为 `overflow-x-auto no-scrollbar` + 按钮 `shrink-0`，770 宽度下第三个页签仍可达。

## 矛盾与认知纠偏 · 本里程碑攻克的问题

1. **测试视口漂移**
   M14 实测时 browser-use 的逻辑视口变成 1024×1163，`window.resizeTo(770,553)` 只改变外窗（outer 770×553），
   `innerWidth` 仍是 1024。为严格满足 770×553 验收，在页面内创建一个 `770×553` 的同源 iframe 测试台：
   实测 `innerWidth=770 / innerHeight=553`、`header 44px`、`scrollWidth == clientWidth == 770`。
   自检的 Viewport 项在顶层 1024 宽和 iframe 770 宽都能 PASS，但文档只把 iframe 数据作为 770 验收证据。
2. **字节预算只能估算**
   逐帧 `JSON.stringify` 是 O(n) 且可能阻塞；用中段+末帧外推、乘 1.15 是「够用且廉价」的折中。
   tooltip 写 `~KB` 而不是精确字节，避免把估算值伪装成真实堆占用。
3. **非确定性豁免是明确的取舍**
   ≤600 帧的非确定性快照即使字节超限也不驱逐：这会多占内存，但能保证历史重放逐帧一致。
   超过 600 帧时没有免费午餐，只能重跑并用琥珀芯片诚实提示漂移。
4. **漂移更新 frameCount 但不更新 metrics**
   若同时更新 `metrics.framesCount`，Benchmark 横幅会随重水化变化，破坏 #18c 的冻结语义。
   因此只更新胶囊的 `frameCount/approxBytes`，横幅继续显示冻结基准，并用芯片解释差异。
5. **Draft 时延的测量方法本身会制造伪回归**
   首版用 5ms 轮询得到 36.3ms；改用 MutationObserver 精确测「点击 → Draft 胶囊 DOM 提交」为 22.6ms。
   这不是代码变快，而是去掉了轮询粒度；文档保留两次数据与原因。
6. **自检不能替代全预设回归**
   6 项微基准只覆盖内核判据的确定性入口，不能发现 DOM 布局或预设交互回归；
   因此它作为「活体内核证据」展示，仍保留浏览器全预设实测。

## Impact · 实测验证指标（770×553 iframe 测试台）

| 场景 | 实测结果 |
| --- | --- |
| 字节预算驱逐 | `fib(8)+6000 元素数组`：Stage-0 135 帧（<250）但 `~4382 KB` → Apply 后 `Stage 0 (135f · LAZY)`，tooltip `thresholds 250f / 180KB` |
| 字节驱逐重水化 | 点击 `Stage 0 (135f · LAZY)` → 恢复 135 帧（大数组深拷约 940ms）、无漂移芯片、报告仍 `O(2^n) Exponential`；Stage-1 65f 同样转 `LAZY` |
| 非确定性豁免 | `fib(5)+6000 元素数组+Math.random`：Stage-0 32 帧 / `~1040 KB`，但 32 ≤600 → 不驱逐，胶囊保持 `Stage 0 (32f)`；点回同步恢复、无漂移芯片 |
| 漂移提示 | `fib(12)+Math.random`：Stage-0 931 帧 → Stage-1 97 帧；Stage-0 `LAZY`；点回恢复 931 帧，出现 `NON-DETERMINISTIC RE-HYDRATION (Frame values may vary)`，`INSPECTING STAGE 0 BASELINE` 与冻结 `O(2^n)` 同时存在 |
| 广义 -2 交错 | `mix(2,18)` 链 `18 → 9 → 7 → 3 → 2 → 1`（5 步中 3 步折半，其余差值 ≤2）→ `O(log n) Logarithmic Recursion`、栈深 7、`INTERLEAVED_DESCENT`，Apply 隐藏并报 `custom return composition` |
| Draft 瞬时冻结 | fib Stage 0/1/2 后编辑 Stage 2，点 Stage 0 → `Draft 3 (11f)`；MutationObserver 实测点击到 DOM 提交 **22.6ms**（<30ms），Stage 0 恢复 31 帧、脏标记消失 |
| 内核自检 | 770×553 下 **6/6 PASS**：TDZ 13.5ms / Fuse 0.9ms / Recursion 0.6ms / Halving 0.6ms / Matrix 0.0ms / Viewport 0.9ms；detail `header 770px / 770px · viewport 770x553` |
| 预设回归 | Fast Power 13 → 22 帧、终端 `65536`；Rain 40 帧 Two-Pointer；bsearchHalve 7 → 20 帧、`steps = 5`；顶栏 44px 且 `scrollWidth == clientWidth == 770` |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；15 篇文档（INDEX + M1–M14）表格列数一致；控制台无 error/warn |

## 遗留

- 字节预算使用抽样外推，不是真实堆占用；极端异构帧（中段小、末帧巨大或反之）可能高估或低估。
- 非确定性检测是源码正则，无法识别 `crypto.getRandomValues` 或经 helper 间接调用的时间源。
- 重水化成本随帧数增长：931 帧非确定性快照实测约 1.7s（含渲染与轮询），期间仅显示 `RE-HYDRATING` 提示。
- Live Kernel Self-Check 使用合成帧夹具，覆盖内核判据但不替代全预设浏览器回归。
- 递增或大步跳跃的实参链不属于收敛链，仍不会被判为对数级（这是有意限制，不是缺陷）。
