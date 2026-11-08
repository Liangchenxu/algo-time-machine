# M12 · 多阶段全息快照栈、混合实参折半、指数门控与 Fast Power 预设

Commit：`cc324f1` — feat(time-capsule): 完成 Milestone 12 多阶段全息快照栈、混合实参槽位折半识别、负指数门控与Fast Power预设

## Why · 背景动机

M11 交出的 A/B 只解决了一半问题：

1. **只有两侧、且只换轨迹不换报告**。二级火箭之后（Stage-0 → 1 → 2）回不到 Stage-0；
   切回基线时右侧判据芯片仍在描述优化版，`VIEWING BASELINE TRACE` 只是提示，不是修复。
2. **折半识别要求实参全部是数字**。`bsearchHalve("arr", 32)` 因为槽位 0 是字符串，整次调用被丢弃，
   一个标准的 O(log n) 递归被当成线性。
3. **快速幂合成没有指数合法性门控**。负指数/非整数指数不在二进制快速幂的等价域内，却可能被套模板。
4. **负指数递归熔断后被误判**：`power(2, -4)` 在 150 层触发 `[FUSE_STACK_OVERFLOW]`，
   但签名 `power(2,-1)` 反复出现，被判 `O(2^n)` 并提供记忆化 Apply——而记忆化并不会让它终止。

## What & Where · 核心改动

### 1. 多阶段全息快照栈（`stageHistory`）

```ts
interface StageSnapshot {
  stageIndex: number;
  label: string;          // Stage 0 · Base / Stage 1 · Memo / Stage 2 · Tabulated|Lowered
  sourceCode: string;
  frames: TraceFrame[];
  execTimeMs: number;
  sandboxError?: string;
  aiReport: AIDiagnosticReport;   // 报告随快照一起冻结
  metrics: BaselineMetrics;
}
```

- **入栈时机**：点击 Apply 时把"当前阶段"冻结为快照（首次即 Stage 0），跑完优化代码后把新阶段追加。
  二级火箭因此得到 `[Stage 0, Stage 1, Stage 2]` 三段全息快照。
- **出栈（零延迟切换）**：点击横幅右侧 `Stage N (mf)` 胶囊，直接同步恢复
  `sourceCode / frames / currentFrameIdx = 0 / sandboxError / execTimeMs / aiReport`，**不重跑沙箱**。
- **横幅规则**：始终比较 `stageHistory[0]` 与"当前选中阶段"；若当前就是 Stage 0，则对比最新阶段
  （横幅不会因为切回基线而消失或退化成 31 → 31），并显示
  `INSPECTING STAGE 0 BASELINE (Full Report Restored)`。
- **防分叉**：`atLatestStage` 为假时隐藏 Apply 按钮，避免从历史阶段再次分叉；切回最新阶段或切换预设才恢复。

### 2. 混合实参的按槽折半（`splitTopLevelArgs` + 逐槽过滤）

顶层逗号切分（忽略 `[]` `{}` `()` 内部逗号），每个槽位独立判断是否数值；
非数值槽位**只跳过自己**，绝不丢弃整次调用。`bsearchHalve("arr", 32)` 的槽位 1 仍能命中折半链。

### 3. 指数合法性门控

快速幂形态（双参、折半槽位 > 0、函数体含乘法）额外要求
`Number.isInteger(expArg) && expArg >= 0`；否则返回 `null`，`optimizedCode = sourceCode`，
收益文案写明 `negative/non-integer exponent (${expArg}) → source preserved`。

### 4. 「栈熔断 + 签名环 = 不收敛」判据

`[FUSE_STACK_OVERFLOW]` 且 `redundantCallCount > 0`（签名链出现重复）时判
`O(∞) Unbounded Recursion` / `O(n) Stack Depth N (fused)`，标签 `GUARD_TRAP` + `ARG_CYCLE`，
`optimizedCode = sourceCode`（不给等价改写——递归本身不终止，任何等价改写都不会终止）。
与 `depth(400)` 严格区分：后者每次实参都不同（`400 → 399 → …`，无环），只是深度超过熔断阈值，
仍判 `O(n) Linear Recursion` 并保留 Apply。

### 5. 第 7 预设 `Fast Power O(log n)`

`power(2, 16)` 的二分快速幂递归，`category: 'Positional Halving · Slot 1 (exp)'`，
用于一键演示「槽位 1 折半识别 → 二进制快速幂消栈」。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **"换了轨迹"不等于"换了现场"**
   M11 的 A/B 只替换 `frames`，`aiReport` 仍是优化版；判据芯片与轨迹互相矛盾，只能靠一句提示掩盖。
   M12 把报告纳入快照，切换时同步恢复——Stage 0 回到 `O(2^n) + DUP 9`，Stage 1 回到
   `Memoized Linear + HIT 2`，无需重跑诊断。
2. **横幅的对比方向会退化**
   "Stage 0 → 当前"在停在 Stage 0 时变成 31 → 31。改为"停在 Stage 0 时对比最新阶段"，
   横幅全程有意义且不消失。
3. **`power(2, -4)` 暴露"熔断后仍推荐记忆化"**
   实测：`[FUSE_STACK_OVERFLOW]` + `O(2^n) Exponential` + Apply 可见。记忆化并不能让不收敛的递归终止，
   这是 M11「非等价拦截」没有覆盖到的另一类错误。补「签名环 + 栈熔断」判据后：
   `O(∞) Unbounded Recursion`、Apply 隐藏；同时回归确认 `depth(400)` 不受影响（实参链无环）。
4. **2 参计数型递归被保守拒绝**
   `bsearchHalve("arr", 32)` 的返回值确实是步数，但形态门要求单参，因此不生成 steps 循环。
   这是有意的保守：tag 参数是否影响语义无法只从帧判断；宁可拒绝并说明。
5. **第 7 预设的帧数不是 12 而是 13**
   预设里多了 `let ans = power(2, 16)` 这帧；文档按实测写 13，而不是沿用 M11 手写片段的 12。

## Impact · 实测验证指标（视口 770×553）

| 场景 | 实测结果 |
| --- | --- |
| 三级火箭入栈 | fib 连点两次 Apply 后胶囊为 `Stage 0 (31f)` / `Stage 1 (41f)` / `Stage 2 (11f)` |
| 切回 Stage 0 | 31 帧、`O(2^n) Exponential` / `O(n) Stack Depth 6`、`DUP 9 / HIT 0`、`INSPECTING STAGE 0 BASELINE (Full Report Restored)`、横幅仍在、Apply 隐藏 |
| 切到 Stage 1 | 41 帧、`O(n) Memoized Linear` / `O(n) Memo Table + 6 Stack Frames`、`DUP 1 / HIT 2`（HIT 徽章 2 个）、提示消失 |
| 切回 Stage 2 | 11 帧、`O(n) Linear Iterative Scan` / `O(1) Scalar Accumulator` |
| 混合实参 | `bsearchHalve("arr", 32)`：槽位 0 字符串被跳过，槽位 1 链 `32 → 16 → 8 → 4 → 2 → 1` → `O(log n) Logarithmic Recursion` / Stack Depth 7 |
| 第 7 预设 | Stage-0 13 帧 `O(log n) Logarithmic Recursion`（槽位 1 exp）；Apply → `powerIter(2, 16) = 65536`、22 帧、`O(log n) Iterative Halving` |
| 指数门控 | `power(2, 16.5)` 仍判对数级但 Apply 隐藏，收益文案 `negative/non-integer exponent (16.5) → source preserved` |
| 不收敛判据 | `power(2, -4)` → `[FUSE_STACK_OVERFLOW]`（149 帧）后判 `O(∞) Unbounded Recursion` / `O(n) Stack Depth 150 (fused)`，标签 `GUARD_TRAP` + `ARG_CYCLE`，Apply 隐藏 |
| 回归 | `depth(400)` 仍判 `O(n) Linear Recursion` / Stack Depth 150 且 Apply 可见；Rain 40 / Binary 10 / FastPower 13 帧判据不变；切预设后 Stage 胶囊消失；顶栏 44px 且 `scrollWidth == clientWidth == 770` |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；13 篇 DevLog 表格列数一致 |

## 遗留

- 快照把整条 `frames` 存在内存里：二级火箭的三段合计约 80 帧尚可，但长轨迹（如 1334 帧）多级重构会占用较多内存，
  后续可改为按需惰性重跑（clone 时记源码与参数，切回时再执行）。
- 快照与代码编辑不同步：在某个阶段手动改代码后切走再切回，会恢复快照里的源码（编辑内容丢失）。
  需要给"编辑态"单独的标记或提示。
- 形态门只覆盖单参计数型与双参快速幂；`power(base, exp)` 的变体一（`exp-1` 分支）目前按快速幂合成，
  未验证其在奇数指数下的步数，属于"结果正确但阶段标签可能粗"的情况。
- 2 参计数型（带 tag 参数）被拒绝合成，缺少"未使用参数可忽略"的判定。
