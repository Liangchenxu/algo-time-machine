# M7 · 通用自动记忆化合成、迭代累积判据分档、栈收益锚点与 Watch 条件守卫

Commit：本次提交（`git log -1`）— feat(synthesis): 完成 Milestone 7 通用AST自动记忆化合成、迭代累积判据分档与SVG树自动聚焦

## Why · 背景动机

M6 交出来的判据体系仍然有三处"说法与产物不一致"：

1. **fib 专属优化**：所有重叠递归的 `optimizedCode` 都是同一段 `fibDP` 数组递推。
   用户写 `climb(n)`、`comb(n, k)`、记忆化搜索时点 Apply，编辑器会被换成一段与他函数无关的代码——
   演示时这是一眼可见的错误。
2. **措辞违和**：`factIter` 这种"一个游标 + 一个累加器"的单重循环被兜底档称作
   `O(n) Linear Two-Pointer`，量级对但描述与代码形态不符。
3. **叙事断裂**：按 M6 的规则，`redundantCallCount >= 2` 就判 `O(2^n)`；而记忆化包装后
   重复入参**照样会进入函数**（缓存守卫位于 `__enterFn` 之后），冗余计数不归零 →
   刚生成的 O(n) 记忆化版本会被再次判成 O(2^n)，和 M3 那次"Apply 后自打脸"是同一类病灶。

此外两个体验缺口：长链 SVG 调用树超出 232px 视口需要手动翻找；显微镜只能看变量、无法表达
"我在等哪个条件成立"。

## What & Where · 核心改动

### 1. 展开型重复取证与 A / A′ / B 三档（`src/services/aiDiagnostics.ts`）

`analyzeTraceMetrics` 新增 `expansiveRedundantCount`：对每个第 2 次及以后的同名进入事件，
检查**下一帧栈是否更深**——更深说明这次重复真的又展开了一整棵子树（真重叠），
未更深说明它在缓存守卫处直接返回（已被消化）。由此：

```
maxStackDepth >= 4
  ├─ redundantCallCount >= 2 且 expansiveRedundantCount >= 1 → A  : O(2^n) Exponential
  ├─ redundantCallCount >= 2 且 expansiveRedundantCount === 0 → A' : O(n) Memoized Linear
  └─ redundantCallCount < 2                                   → B  : O(n) Linear Recursion
```

`RecursionForensics` 同时新增 `dominantRecursiveName`（按函数名聚合进入次数取最大）与
`topCallExpr`（首个进入事件的栈顶签名 = 最外层实参），供合成器使用。

### 2. 通用 Top-Down 记忆化合成

- `extractFunctionInfo(sourceCode, name)`：正则定位 `function name(params)`，
  再用大括号配对取出完整函数体；形参逐个校验为纯标识符，含默认值/解构时返回 `null`。
- `synthesizeMemoizedSource`：在原位置替换为
  `const __memo = {}; function name(params) { const __key = JSON.stringify([p1, p2]); if (__memo[__key] !== undefined) return __memo[__key]; const __result = (() => <原函数体>)(); __memo[__key] = __result; return __result; }`。
  原函数体整体塞进 IIFE，`return` 语义（含提前返回）原样保留；递归自调用自然指向包装后的函数。
  源码没有 `console.log` 时追加一次 `console.log("memoized <topCallExpr> =", <topCallExpr>)` 以便取证结果值。
- `targetFnName === 'fib'` 仍走经典 `fibDP` 自底向上数组递推（裁决保留）。
- 定位失败时 `optimizedCode = sourceCode`，`optimizationGain` 明确写出放弃注入的原因，
  绝不输出语法残破的"优化代码"。

### 3. 双指针 vs 迭代累积分档

`detectTwoPointerEvidence(frames)` 要求**同一帧内**同时可见 `left`/`right`、`slow`/`fast`，
或 `i`/`j` 且同帧存在数组（指针必须作用于索引）。命中 → 维持
`O(n) Linear Two-Pointer` / `O(1) In-Place Pointers` 并把实测指针对写进摘要；
否则 → `O(n) Linear Iterative Scan` / `O(1) Scalar Accumulator`，标签 `[ITERATIVE_CONVERGENCE]`，
摘要列出实测游标名、累加器名与多次命中的循环行。

### 4. Benchmark 横幅重构为 segment 序列（`src/App.tsx`）

`benchmarkDelta` 增加 `stackReductionAnchor`（两侧均未熔断 + `base.maxStackDepth >= 4` +
`curr.maxStackDepth <= 2` + 帧数上升）与 `stackDropPct`；渲染改为统一的
`benchmarkSegments` 列表，优先级：熔断态 `STATUS` > `STACK REDUCTION` 锚点 > `FRAMES` 百分比。
栈收益型重构输出
`STACK REDUCTION: -71.4% Call Frames | PEAK STACK: 7 → 2 | TRACE STEPS: 7 → 13 (Unrolled Loop) | SPACE/TIME/LATENCY`。

### 5. SVG 树自动聚焦与 Watch 守卫栏

- SVG 滚动容器 `ref` + effect：帧号变化时取激活路径上**最深**节点，
  `scrollTo` 居中（负值与越界由浏览器 clamp）。
- Watch 栏：`pinnedVars` 置顶变量（标量卡 / 1D 数组 / 2D 矩阵三类都有 Pin 图钉），
  `watchExprs` 最多 4 条断言，逐帧在**当前帧变量快照**上求值并显示
  TRUE（翠绿）/ FALSE（暗灰）/ INVALID / ERROR（玫红，tooltip 给出原因）。
- 安全闸门：字符白名单 → 拒绝 `ident(` 调用形态 → 拒绝
  `this/window/globalThis/self/document/location/Function/eval/constructor/prototype/process/require/import`
  等宿主名；`new Function` 的形参名再过滤为合法标识符。求值异常被捕获为 ERROR，不外抛。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **裁决原文的 A 档会立即在自家产物上失效**（对规格的第二类纠偏）
   照字面实现 `redundantCallCount >= 2 → O(2^n)`，实测记忆化后的 `climb` 仍报 `O(2^n)`：
   缓存守卫是在 `__enterFn` 之后才 return 的，进入事件照样发生。我没有擅自改掉裁决的入口条件，
   而是在 A 档**内部**追加展开型证据做二次分档（A / A′），既守住"重复进入 ≥ 2 才算重叠"的原意，
   又让 Apply 前后的结论构成"指数 → 记忆化线性"的真实递进。
2. **源码嗅探与不变量 #6 的边界必须写死**
   合成器要读源码（找函数体、取形参），这本身与"判据不信源码"不冲突——冲突发生在后来者顺手
   把嗅探挪进判档。因此把边界固化成不变量 #13 的子句：合成可用源码，判据不得用源码。
3. **大括号配对不是解析器**
   配对实现不识别字符串/模板字面量里的花括号，极端源码会得到 `null`。
   处理原则是"定位失败就不注入"，并在收益文案里说明原因，而不是产出半截代码。
4. **横幅的百分比语义重复**（自查发现）
   初版同时输出 `STACK REDUCTION: -71.4%` 与 `PEAK STACK: 7 → 2 (71.4% frames)`，
   后者丢了负号、读起来像增长。已让锚点独占百分比、PEAK STACK 只报绝对值。
5. **Watch 的 ERROR 与 FALSE 必须可区分**
   Rain 预设下 `n > 5` 返回 ERROR（`n is not defined`）而不是 false——作用域里没有该变量时
   谎报 FALSE 会误导调试。四态（TRUE/FALSE/INVALID/ERROR）+ tooltip 原因即为此设计。
6. **验证探针的两次自摆乌龙**：一次过滤条件要求芯片文本含 `>`，导致 `n === 5` / `alert(n)`
   被自己的过滤器吃掉，误判为"只加进去 1 条"；一次在点击后才统计 `button[title^="Pin "]`，
   得到 0 个而以为置顶失效。两处都是探针问题而非应用缺陷，复核后确认功能正常——
   延续 M5 的教训：否定性结论必须换路径复测。

## Impact · 实测验证指标（视口 770×553）

| 场景 | 实测结果 |
| --- | --- |
| fact(6) 判据分档 | 优化前 `O(n) Linear Recursion` / `O(n) Call Stack Depth 7` → Apply 后 `O(n) Linear Iterative Scan` / `O(1) Scalar Accumulator`，全文无 Two-Pointer |
| fact(6) 栈收益锚点 | `STACK REDUCTION: -71.4% Call Frames` \| `PEAK STACK: 7 → 2` \| `TRACE STEPS: 7 → 13 (Unrolled Loop)` \| `SPACE: O(n) Call Stack Depth 7 → O(1) Scalar Accumulator` \| `TIME: O(n) Linear Recursion → O(n) Linear Iterative Scan` |
| 手写 climb(5)（非 fib） | 取证 `climb(2) ×3 / climb(3) ×2 / climb(1) ×2`，冗余 4、**展开型重复 1** → 命中分支 A；标签 `MEMO_INJECTION_TARGET` |
| climb 记忆化合成 | 生成 `const __memo = {}` + `JSON.stringify([n])` 守卫 + IIFE 包裹原函数体，终端实测 `memoized climb(5) = 8`（与原语义一致） |
| 记忆化后判据 | `O(n) Memoized Linear` / `O(n) Memo Table + 5 Stack Frames`；摘要"5 个不同入参签名、重复进入 3 次、展开型重复 0"；DUP 徽章 4 → 3 且等于 redundantCallCount；Apply 自动退场 |
| Rain 回归 | `O(n) Linear Two-Pointer` / `O(1) In-Place Pointers`，摘要新增"实测指针对 left / right 同帧可见"，40 帧与热点 L9（11x）不变 |
| SVG 自动聚焦 | 跳帧时 `scrollLeft 193 → 0`、`scrollTop 0 → 26`（内容高 246px、可视 220px，clamp 到上限正确） |
| Watch 四态 | `n === 5`：FRAME 1 TRUE、FRAME 4 FALSE；`alert(n)` / `process.exit()`：INVALID（function calls are not allowed）；Rain 下 `n > 5`：ERROR（n is not defined） |
| Watch 断言取证（DP FRAME 10） | `r === 1 && c === 2` → TRUE（与十字准星 Cursor [1][2] 吻合）；裸表达式 `r` → TRUE 且 tooltip 回显实际值 `1`；`dp[1][2] === 6` / `grid[0][0] > 0` → INVALID（白名单不含下标括号） |
| Watch 置顶与容量 | 标量 / 1D 数组 / 2D 矩阵共 6 处 Pin 图钉（grid、dp、fromTop、fromLeft、c、r）；表达式上限 4 条，第 5 条被静默拒绝并可逐条 × 移除 |
| Watch 置顶 | 标量 / 1D 数组 / 2D 矩阵卡片均有 Pin 图钉，置顶后 WATCH 条显示 `result 5` 并高亮原卡片为 emerald 边框 |
| 构建与纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；控制台无 error/warn；工作区提交前干净 |

## 遗留

- 分支 A′ 目前只识别"已有缓存守卫"这一种收敛形态；自底向上数组化（把任意重叠递归转成 tabulation）
  仍只对 fib 给出，通用形态需要推断状态维度与转移方程，属新能力。
- 记忆化包装的帧数会比原递归更高（缓存命中也要进入函数一次），横幅已用 TIME/SPACE 段解释，
  但 FRAMES 列对记忆化场景没有信息量——若要更干净可为 A′ 档隐藏帧数。
- Watch 断言**不支持下标访问**：字符白名单里没有 `[` `]`，实测 `dp[1][2] === 6` 与 `grid[0][0] > 0`
  均返回 INVALID（"only variables, numbers and operators"）。要断言矩阵单元格，目前只能先 Pin 该数组
  看其值，或改写为标量表达式。这是有意的安全收窄：牺牲表达力换取"不解析任意成员访问"。
