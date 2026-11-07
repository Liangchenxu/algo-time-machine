# M5 · 参数化调用栈签名、重叠子问题精确取证、调用树拓扑与行级断点

Commit `ef934b0` — feat(debugger): 完成 Milestone 5 参数化调用栈、重叠子问题精确分档、递归调用树拓扑与行级断点调试

## Why · 背景动机

M4 收尾时我报备了一个自己没能堵住的洞：手写 `depth(400)` 这类**单链深递归**被诊断成
`O(2^n) Exponential`。根因不是入口条件（入口已换成运行时 `maxStackDepth >= 4`），而是**结论文案写死了指数**——
「递归很深」与「递归在重复计算同一件事」是两件不同的事，当时的引擎没有能力区分。

要区分它们，必须能回答「这次调用和上次那次是不是同一个子问题」，而这要求调用栈本身携带实参：
`fib()` 与 `fib()` 无法比较，`fib(3)` 与 `fib(3)` 才能计数。所以 M5 的因果链是：

```
带参签名（内核） → 签名进入次数（取证） → A/B 分档（判据） → 调用树拓扑（可视化铁证） → 断点（调试闭环）
```

## What & Where · 核心改动

### `src/core/instrumenter.ts`

- FunctionDeclaration 注入点从 `path.parentPath.node.params` 过滤出 `Identifier` 形参（解构形参跳过，
  无法安全序列化），第三个实参传实际值数组：`__enterFn("fib", 2, [n])`。
- 运行时新增 `__fmtArg` / `__sig`：数字与字符串直取，对象走 `JSON.stringify` 并在 24 字符处截断加 `...`，
  函数转 `fn`，压栈字符串由 `fib()` 变为 `fib(5)`、多参 `dfs(1,2)`、无参 `fn()`。
- 不变量守护：`main()` 根帧文本不动，`__exitFn` 仍只在 `__callStack.length > 1` 时 pop，
  `__lineHits` 与 TDZ 闭包读取、`globalThis.__mtmFrames`、`BlockStatement|Program` 四项原样保留。

### `src/services/aiDiagnostics.ts`

- 新增 `RecursionForensics` / `TraceMetrics` 类型，`analyzeTraceMetrics` 额外产出
  `signatureHits`、`redundantCallCount`、`topDuplicates`、`sampleArg`。
- 递归门拆成两档：`redundantCallCount >= 2` → 分支 A（`O(2^n) Exponential`，summary 与
  `frameInsights[REDUNDANT_SUBTREE]` 直接列出重复清单）；否则 → 分支 B
  （`O(n) Linear Recursion` / `O(n) Call Stack Depth n`，标签 `TAIL_RECURSION_CANDIDATE` +
  `SINGLE_CHAIN_DESCENT`，给出迭代展开脚手架，`optimizationGain` 以峰值栈深下降为主张）。
- `AIDiagnosticReport` 增加可选取证字段，供界面展示重复清单（不破坏旧字段契约）。

### `src/App.tsx`

- `buildCallTree(frames)`：相邻帧 `callStack` 取最长公共前缀，前缀之后的旧节点补 `exitFrameIndex`，
  新尾项逐个建档并挂到当前栈顶节点下，产出 `id / signature / depth / entryFrameIndex / exitFrameIndex /
  parentId / isDuplicate / duplicateCount`。
- 显微镜顶部新增 `Call-Tree Topology & Subproblem Inspector`（仅当 `maxStackDepth >= 2` 且激活节点 > 1 时出现）：
  按 depth 缩进、三态着色（active 电光蓝 `bg-sky-500/25`、重叠冗余玫红 `bg-rose-500/20 + DUP ×n`、
  已退栈暗灰 `bg-zinc-900/80`，未来节点 `opacity-40`），点击节点跳到它的进入帧；超过 64 个节点只渲染前 64 个并报总量。
- 断点：`breakpoints: Set<number>`；行号改为按钮，hover 显示半透明红点、点击切换，激活时行号左侧 6px
  `bg-rose-500 rounded-full` 实心点 + 行底 `rgba(244,63,94,0.13)`；火焰条顶部渲染 `bg-rose-400` 标记；
  `Continue to Breakpoint` 按钮（带断点计数）与 `F8` / `b` 快捷键向后扫描第一个命中帧，前方无命中则原地不动；
  切换预设自动清空（行号语义随源码改变）。
- Spec 弹窗：Tab1 新增「5. Recursion Gating By Duplicate Evidence」并补全签名采集说明；
  Tab2 卡片扩到 `[M1-M5]`，M4 的 commit 标识回填为真实 `23e0a6d`。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **裁决书给的增量法不能数清重叠子问题**（对上游规格的一次实证纠偏）
   裁决 2 描述为「扫描相邻帧 `callStack` 长度增加时的栈顶签名」。实测：`fib(4)` 退栈后 `fib(3)`
   在**同一深度**重新压栈，相邻两帧的 `callStack.length` 完全相等，增量判定为「没有新调用」，
   于是兄弟子树的重复求值被整段漏计。改为以「函数进入」事件帧的栈顶签名计数——每个激活必然产出
   一个进入帧，计数因此精确。证据：`fib(5)` 实测 `fib(1) ×5 / fib(2) ×3 / fib(0) ×3 / fib(3) ×2`，
   `redundantCallCount = 9`，与调用树里 9 个 DUP 节点**互相独立地吻合**。
2. **调用树不能按签名路径字符串建索引**
   同一签名序列可能被不同兄弟子树复用，用路径当 key 会把两次不同的激活合并成一个节点。
   改为「公共前缀差异 → pop/push 事件流」建模，每个激活拿到独立 `id` 与真实进出帧区间。
3. **迭代展开脚手架不能假装自动正确**
   时间帧里没有「合并算子」信息（加法还是乘法无法反推），所以分支 B 的 `optimizedCode` 明确写成
   脚手架并注释「请把 `acc` 更新式换成原递归的组合方式，加法幺元 0 / 乘法幺元 1」。
   对 `depth(400)` 它恰好等价，对 `fact(6)` 需要人工替换一行——这是如实标注，不是悄悄糊过去。
4. **Benchmark 语义边界**：`depth(400)` 的递归基线被 150 层栈熔断截断（149 帧），
   迭代版跑完 400 步反而产出更多帧；此时 `FRAMES` 列不可比，真正有意义的收益是
   `PEAK STACK: 150 -> 1`。横幅保留原始数字不做修饰，解读责任交给判据文本与本文档。
5. **本轮两处自伤已纠正**：一次编辑误删了 `interface DevlogEntry` 的换行（立即恢复并补上
   `CallTreeNode` 类型），一次误建 `scratch-ignore.ts`（提交前删除，`git status` 复核确认工作区干净）。
6. **验证脚本自身的两次误导**：查断点按钮时用了 `main button` 选择器，而 M3 布局根本没有
   `<main>`/`<section>` 元素（是 div 栅格），差点把「功能没渲染」误判成缺陷；改用全局按钮枚举后确认 12 个
   行号断点按钮都在。另一次把 `;` 误写进箭头函数导致语法错误。教训：**探针错也会产出“正确的假象”**，
   否定性结论必须换一个观测路径复核。

## Impact · 实测验证指标（视口 771×553）

| 场景 | 实测结果 |
| --- | --- |
| 签名采集 | 调用栈条带 `main() → fib(5)`；树节点行 `d4 fib(1) DUP ×2 #9→#10` |
| 分支 A（fib(5)） | `O(2^n) Exponential` / `O(n) Stack Depth 6`，31 帧，取证 `fib(1) ×5, fib(2) ×3, fib(0) ×3, fib(3) ×2`，冗余 9 次，热点 L2（15x） |
| 调用树（fib(5)） | 15 个激活节点（与 fib(5) 的真实调用次数一致），9 个 DUP 节点，与 `redundantCallCount = 9` 独立吻合 |
| 节点跳帧 | 点击 `fib(1) DUP ×2`（entry #9）→ `FRAME 10 / 31`，active 路径重算为 `fib(5)→fib(4)→fib(3)→fib(1)` |
| **M4 未闭合项** | `depth(400)` → `O(n) Linear Recursion` / `O(n) Call Stack Depth 150`，149 个唯一签名、冗余 0 次、DUP 节点 0 个 |
| 线性递归第二证据 | `fact(6)` → `O(n) Linear Recursion` / `Stack Depth 7`，6 个唯一签名、冗余 0 次 |
| 断点设置 | L7 点击后红点 `bg-rose-500 opacity-100`（6px）、行底 `rgba(244,63,94,0.13)`、title 翻转为 Remove |
| 火焰轨联动 | 7 根竖条顶部渲染 `bg-rose-400` 断点标记（等于 L7 的命中帧数） |
| Continue to Breakpoint | FRAME 10 → FRAME 11；快捷键 `b` 再推进到 FRAME 17；无断点时按钮禁用 |
| 容量保护 | `depth(400)` 149 次激活只渲染前 64 节点并提示「本轨迹共观测 149 次函数进入」 |
| 无回归复测 | Rain 40 帧 `O(n)`、DP 29 帧 `O(M*N) Matrix DP`、Binary 10 帧 `O(log n)`、死循环 1334 帧 `O(∞)` 全部与 M4 一致；非递归预设的调用树面板正确隐藏 |
| 纪律核查 | `src/**` emoji 扫描输出 `scan done` 无命中；`npm run build` 零 TS 报错；工作区在提交前保持干净 |

## 遗留（均已在 M6 闭环，见 `M6-svg-call-tree-and-layout-polish.md`）

- ~~分支 B 的迭代脚手架需人工替换合并算子~~ → M6 用 `sniffCombineOperator` 识别
  `n * fact(n - 1)` / `n + sum(n - 1)` / 无算术组合三种形态，分别生成乘法累积、加法累积与游标推进代码，
  实测 `factIter(6) = 720`、`iterative cursor = 400`，不再需要人工替换。
- ~~调用树目前按 depth 缩进的扁平列表呈现，没有真正的 2D 连线布局~~ → M6 改为后序槽位 +
  父节点取子节点 x 均值 + 三次贝塞尔连线的 SVG 拓扑图，保留 Compact List 作为可切换视图。

> M6 复核补记：M5 当时认为「要自动合成必须先在插桩里采集返回值组合方式」。实际不需要动内核——
> 合并算子必然以二元表达式写在源码里，对源码做定向模式嗅探即可，且只作用于代码生成、
> 不参与复杂度判档（判档仍严格只看运行时证据，不变量 #6 未松动）。
