# M11 · 多参槽位折半、快速幂等价合成、突变熵 Watch 排序与 A/B 轨迹切换

Commit `564e022` — feat(ab-trace): 完成 Milestone 11 多参槽位折半与快速幂合成、突变熵Watch排序及Benchmark一键A/B轨迹切换

## Why · 背景动机

M10 留下四条待办，其中三条会直接影响评委的第一印象：

1. **折半只看首参**：`power(2, 16)` 的槽位 0 恒为底数 2，真正收敛的是槽位 1（exp），
   于是一个标准的 O(log n) 快速幂被当成线性递归。
2. **消栈合成无条件套模板**：同一段 `steps++` 游标循环对 `halve` 正确、对 `power` 会算错，
   对 `n ^ fn(n/2)` 更是无从等价——这正是 #13c 要求"宁可少给，不可给错"的场景。
3. **Quick-Watch 兜底按出现顺序取变量**：会挑中 `target`、`limit` 这类恒定输入，断言永远为真、毫无信息量。
4. **A/B 对比缺失**：评委想回看优化前的调用树，只能重新点预设，而横幅随之消失——"对比"这件事断在半路。

## What & Where · 核心改动

### 1. 多参槽位折半（`detectHalvingArgs`）

进入事件的实参改按位置切分（`power(2,16)` → 槽位 0 = 2、槽位 1 = 16，逐帧累积成两条序列），
任意槽位满足 `a[k+1] === floor(a[k]/2)`（≥2 步、首值 ≥8）即命中，回传 `slot`；
摘要与洞察据此标注「槽位 1（exp）」，参数名若可从源码定位则一并显示（仅用于文案，不影响判档）。

### 2. 折半消栈的严格等价门控（`synthesizeHalvingLowering`）

| 形态 | 识别条件 | 生成 |
| --- | --- | --- |
| A 计数型 | 单参、函数体含 `1 + fn(...)`、基线 `return 0` | `let curr = base; while (curr > 1) { curr = floor(curr/2); steps++; }` |
| B 快速幂 | 双参、折半槽位 > 0、函数体含 `*`、顶层实参 ≥ 2 个 | 迭代二进制快速幂 `result *= b; b *= b; curr = floor(curr/2)` |
| C 其他 | 以上都不满足 | 返回 `null` → `optimizedCode = sourceCode`、Apply 隐藏、标签 `[SEMANTICS_PRESERVED]` |

### 3. 突变熵排序的 Quick-Watch 规则 C（`App.tsx`）

统计全轨迹每个数值变量的取值集合大小 `distinctCount`，按降序取 `distinct >= 2` 的动态变量
（`acc`、`i`、`water` 这类真正演化的状态），恒定的输入常量（`target`、`limit`）仅在所有变量都恒定时兜底；
取值仍来自"末尾回溯到仍持有目标容器"的帧，并经「至少一帧 TRUE」验证。

### 4. Benchmark 横幅的 ⇄ A/B 轨迹切换

- 新增 `abState`：`{ baselineCode, optimizedCode, baseFrames, optFrames, baseStack, optStack, optExpansive, viewing }`。
  在 Apply 完成时一次性冻结两侧指标，`benchmarkDelta` 改为优先读取冻结值，
  因此横幅在整个往返过程中**一字不变**。
- 切换按钮位于横幅最右侧：`⇄ Inspect Baseline (12f)` ↔ `⇄ Return to Optimized (22f)`；
  切换走新增的 `runForComparison`（**只重跑沙箱、不重算诊断**），所以 `aiReport` 不会被基线报告覆盖。
- 基线视图下遥测条显示 `VIEWING BASELINE TRACE`（琥珀），明确"判据芯片描述的是优化后版本"。
  只有切换顶部预设才清空 `baselineMetrics` 与 `abState`。
- 2D `WRITES: n` 徽章 tooltip 补充说明：该数值是**相邻帧之间的单元格变化数**，
  同一格反复改写会计多次，只作只读/可变二分类判据。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **"同一模板适用所有折半"是错觉**
   `steps++` 循环的语义是"数步数"，只在返回值恰好等于步数时等价。
   `power` 的返回值是指数幂、`weirdHalve` 是异或累积，套模板必然算术错误。
   本轮把"识别"与"合成"彻底解耦：识别只决定判档，合成必须单独过形态门，未过就拒绝并写明原因。
2. **A/B 若复用诊断链路，横幅会自我破坏**
   第一次实现直接调 `executeCode`，基线一跑完 `aiReport` 被替换、`frames` 变成基线帧数，
   横幅从「31 → 41」瞬间变成「41 → 41」。改为独立 `runForComparison` + 冻结指标后，
   横幅在 22 ↔ 12 帧往返中保持 `STACK REDUCTION -71.4% / PEAK STACK 7 → 2` 不变。
3. **冻结指标的语义代价要显式标注**
   基线视图下判据芯片仍是优化后的结论，容易误读。用 `VIEWING BASELINE TRACE` 芯片 + tooltip
   点明"沙箱正在回放重构前源码，判据芯片描述优化后运行"，比偷偷同步两套状态更诚实。
4. **探针自身又坏了一次**：构造 `power` 测试代码时把数组元素字符串写坏（引号提前闭合），
   `SyntaxError: Unexpected token ')'` —— 与 M5/M8/M10 同源的"探针错误伪装成被测物缺陷"。
   修正后一次通过；本轮结论因此都建立在"修正探针后重测"的数据上。

## Impact · 实测验证指标（视口 770×553）

| 场景 | 实测结果 |
| --- | --- |
| `halve(32)` 回归 | `O(log n) Logarithmic Recursion` / `O(log n) Call Stack Depth 7`；摘要「槽位 0（n）的收敛链 32 → 16 → 8 → 4 → 2 → 1」；按计数型生成 steps 循环，Apply 可见 |
| `power(2, 16)` | 命中「槽位 1（exp）16 → 8 → 4 → 2 → 1（连续 4 步）」，12 帧、栈深 7，判 `O(log n) Logarithmic Recursion`，标签 `LOGARITHMIC_DESCENT` + `TAIL_UNROLL_CANDIDATE` |
| 快速幂合成 | Apply 后生成迭代二进制快速幂，终端实测 `powerIter(2, 16) = 65536`（与原递归 100% 数值一致），22 帧、横幅 `STACK REDUCTION -71.4% / PEAK STACK 7 → 2`，判据 `O(log n) Iterative Halving` / `O(1) Scalar Accumulator` |
| 非等价拦截 | `weirdHalve(32)`（`n ^ fn(n/2)`）仍判 `O(log n) Logarithmic Recursion`，但 Apply 隐藏，标签 `[SEMANTICS_PRESERVED]`，收益文案 `custom return composition → source preserved` |
| A/B 往返 | 按钮 `⇄ Inspect Baseline (12f)` → 基线 12 帧、调用树重现、出现 `VIEWING BASELINE TRACE` → `⇄ Return to Optimized (22f)` → 22 帧；横幅全程保持 `STACK REDUCTION -71.4% / PEAK STACK 7 → 2` |
| 突变熵芯片 | 自定义循环（`const target = 23; let acc = 0; for i...`）得到 `+ acc === 6` / `+ i === 4`，恒定的 `target` 被排除 |
| 回归 | Rain 40 帧 Two-Pointer、fib 31 帧 `O(2^n)`、DP 29 帧 Matrix DP 不变；切换预设立即清空 A/B（⇄ 按钮消失） |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；12 篇 DevLog 表格列数一致 |

## 遗留

- 折半识别要求实参**全部是数字**（`__sig` 序列化后按逗号切分）；对象/字符串实参的递归会被跳过，
  需要按实参类型分别提取数值槽位。
- 快速幂合成假设乘法可结合且指数非负；负数指数（`power(2, -3)`）或非交换算子不适用，
  当前没有显式拒绝这类输入的判据。
- A/B 只支持"最后一次 Apply"的两侧；连续两次 Apply（二级火箭）后只能对比 Stage-1 与 Stage-2，
  无法回溯到 Stage-0 的原始轨迹。要支持多级历史需要把 `abState` 改成栈结构。
- `VIEWING BASELINE TRACE` 只做提示，不切换右侧 AI 面板内容；更完整的设计是为两侧各存一份报告。
