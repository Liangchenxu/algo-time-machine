# M8 · 记忆化 HIT 剪枝拓扑取证、二阶段递推降维合成与 Watch 下标观察点

Commit：本次提交（`git log -1`）— feat(watchpoint): 完成 Milestone 8 记忆化HIT剪枝拓扑、二阶段递推降维、Watch数组下标解析与Seek TRUE条件跳帧

## Why · 背景动机

M7 把任意重叠递归都能自动记忆化了，但界面与判据还各差最后一环：

1. **调用树不会说谎，但也不会解释**：记忆化之后 SVG 树里所有重复入参仍是玫红 `DUP`，
   与暴力递归阶段看起来一模一样。而"这次重复其实被缓存拦住了"是可以从拓扑上**证明**的——
   同一个签名首次调用会展开若干子节点，被剪枝的那一次一个子节点都没有、进入即退栈。
   把它画成翠绿色 `HIT`，"暴力指数 → 记忆化剪枝"才第一次变成看得见的东西。
2. **二级火箭只有一半**：A′ 档把 `optimizedCode` 回填源码并隐藏 Apply，于是
   记忆化之后仍要付 O(n) 调用栈（实测峰值栈深 5 层）。缺 Stage-2：数组递推消栈。
3. **Watch 说不了算法状态**：真正的状态命题是 `dp[1][2] === 6`、`height[left] < height[right]`
   这种带下标的形式，M7 的白名单没有方括号，等于只能断言标量。也没有"跳到条件成立那一帧"的能力。

## What & Where · 核心改动

### 1. 纯运行时剪枝取证（`src/App.tsx` `buildCallTree`）

构图完成后追加一遍拓扑统计，不改插桩、不读源码：

```
childCounts[n.id]      = 以 n 为父的激活节点数（直接子调用数）
firstChildCount[sig]   = 该签名首次激活时的子节点数
dupKind                = pruned   若 firstChildCount > 0 && childCount === 0
                         expansive 其余重复节点
```

`pruned` 在 SVG 里渲染为 fill `#052e16` / stroke `#10b981` / text `#6ee7b7`，右上角徽章 `HIT×n`；
`expansive` 保持玫红 `DUP×n`；`active` 的配色优先级仍最高（当前在栈上这件事必须压倒统计色），
但徽章照常显示，两种信息不打架。图例从单一 `redundant N` 拆成 `DUP n / HIT m` 双计数，
Compact List 同步支持。

### 2. Stage-2 自底向上递推降维（`src/services/aiDiagnostics.ts`）

- `sniffBinaryRecurrence(info)`：在函数体里匹配 `fn(p - a) (+|-|*) fn(p - b)`，
  要求两侧实参是同一标识符减去常量；再匹配基线 `if (p <= k) return p|常量`
  （`<` 与 `<=` 都支持，`<` 会折算成 `baseMax = k - 1`）。
- `synthesizeBottomUpTabulation`：种子 `dp[0..start)` 取基线值（恒等基线就是 `i`，常量基线取该常量），
  循环起点 `start = max(baseMax, offsetA, offsetB) + 1`，转移式直接由嗅探到的偏移与算子拼出。
- 任何不匹配（混合参数名、三元及以上递推、非平凡基线、`baseMax > 8`、函数体定位失败）
  → 返回 `null`，A′ 档回退源码、隐藏 Apply，并在 `optimizationGain` 说明原因。
- A′ 档新增 `nextStageLabel`，前端按钮因此显示
  `Apply Stage-2: Bottom-Up Tabulation (O(1) Stack)`，洞察项追加 `STAGE2_TABULATION_READY`。

### 3. SUBTREE PRUNING 横幅锚点（`src/App.tsx`）

`BaselineMetrics` 增记 `expansiveRedundantCount`；`benchmarkDelta` 新增
`subtreePruningAnchor`（两侧均未熔断 + `base.expansive > 0` + `curr.expansive === 0`）与
`expansiveFrom/expansiveTo`。segment 优先级变为
`STATUS(熔断) > SUBTREE PRUNING > STACK REDUCTION > FRAMES`，
剪枝档按裁决顺序输出 `SUBTREE PRUNING → TIME → SPACE → TRACE STEPS (Includes O(1) Memo Lookups)`，
并用 `emitTailComplexityRows` 标志防止与公共尾段重复渲染 TIME/SPACE。

### 4. Watch 下标解析与 Seek Next TRUE

- 白名单改为 `[\w$\s()\[\]<>=!+\-*/%&|,:]+` 且显式拒绝 `.` 与引号：
  **放行 `dp[1][2]`、`grid[r][c]`，同时切断 `obj.constructor` 与 `obj["constructor"]` 两条成员注入路径**。
- 新增赋值拒绝：`/(^|[^=!<>])=([^=]|$)/` → INVALID 并提示改用 `=== / !== / <= / >=`；
  `===`、`!==`、`<=`、`>=`、`==`、`!=` 均不受影响。
- 下标越界自然抛 TypeError，被 try/catch 捕获为 ERROR，tooltip 显示原始原因，不谎报 FALSE。
- 每条断言胶囊右侧新增 `→T`：从 `(currentFrameIdx + 1) % total` 起**环形扫描**每一帧的
  `frame.variables`，命中第一个 TRUE 即暂停并瞬移；全程无解则胶囊显示 `no TRUE frame`。
  移除断言时会一并清掉该断言的 seek 反馈状态。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **裁决 1 的验收预期与运行时事实冲突（实测推翻，保留实现）**
   裁决写"DP 预设第 1 帧输入 `dp[1][2] === 6`，确认显示 FALSE（不再是 INVALID）"。
   实测 FRAME 1 是 `const grid = [...]` 语句的快照，此时 `dp` 尚未声明，
   TDZ 安全读取把它过滤出变量表 → 断言求值抛 ReferenceError → 返回 **ERROR（dp is not defined）**。
   这与不变量 #13d「作用域缺变量必须 ERROR、不得谎报 FALSE」直接冲突，
   故保留 ERROR；裁决真正要验的两件事都成立：**下标解析已生效**（不再是 INVALID），
   且同一断言在 FRAME 11 为 **TRUE**。
2. **`childCount === 0` 不足以判定剪枝**
   天然基线叶子（首次 `climb(2)`，`n <= 2` 直接 return）本来就没有子节点，
   只看 `childCount` 会把它们全部误标成翠绿 HIT，让人以为"基线是被缓存救的"。
   必须叠加 `firstChildCount > 0` 前置条件。实测 climb Stage-1 的 3 个重复节点正确分成
   `HIT 2`（第二次 climb(5)、第二次 climb(3)：首次都展开过）与 `DUP 1`（climb(2)：首次即叶子），
   与语义完全一致。
3. **种子值不能取自运行时结果**
   帧里不携带返回值，所以 Stage-2 的 `dp` 种子只能由基线语句机械推导（`return n` → `i`，
   `return 常量` → 常量）。超出这个可推导子集就放弃合成——宁可少做一级火箭，
   也不能生成一条"看着像 dp 递推但算错"的代码。实测 `climb` 推导出的种子 `[0, 1, 2]`
   与循环起点 3 正确，终端输出 8。
4. **记忆化阶段帧数上升不是回归**
   Stage-1 从 10 帧涨到 29 帧：缓存守卫自身也要经历 `__enterFn` 与进入快照。
   M7 遗留里我担心这一列会被误读成负优化，M8 由 `SUBTREE PRUNING` 锚点接管解释，
   Stage-2 之后帧数回落到 9，三段曲线（10 → 29 → 9）自证叙事单调。
5. **验证探针连续三次踩自己**（延续 M5–M7 的教训）
   ① 越界用例先在死循环预设下测，得到的是 "dp is not defined" 而不是预期的 TypeError，
   换到 DP 预设 FRAME 11 才真正取到 `Cannot read properties of undefined (reading '0')`；
   ② 4 条断言上限导致新表达式被静默拒绝，误以为功能未生效，实为先清空再加；
   ③ 5 预设一次性批量取证超过 MCP 15s 超时，拆成两批才跑通。
   结论仍是：**否定性观测必须先怀疑探针，再怀疑被测物**。

## Impact · 实测验证指标（视口 770×553）

| 场景 | 实测结果 |
| --- | --- |
| Stage-0 暴力 climb(5) | 10 帧，`O(2^n) Exponential` / `O(n) Stack Depth 5`，DUP 4 / HIT 0 |
| Stage-1 记忆化 | 29 帧，`O(n) Memoized Linear` / `O(n) Memo Table + 5 Stack Frames`；DUP 1 / HIT 2，HIT 节点 fill `#052e16` stroke `#10b981` text `#6ee7b7` 徽章 `HIT×2`；终端 `memoized climb(5) = 8`；洞察追加 `STAGE2_TABULATION_READY`（"检测到二元递推 climb(n - 1) + climb(n - 2)"） |
| 剪枝锚点横幅 | `SUBTREE PRUNING: Expansive Redundant Subtrees 1 → 0 (-100% Pruned)` \| `TIME: O(2^n) Exponential → O(n) Memoized Linear` \| `SPACE: O(n) Stack Depth 5 → O(n) Memo Table + 5 Stack Frames` \| `TRACE STEPS: 10 → 29 (Includes O(1) Memo Lookups)` \| `PEAK STACK: 5 → 5` |
| Stage-2 数组递推 | 生成 `const dp = [0, 1, 2]; for (let i = 3; i <= n; i++) { dp[i] = dp[i - 1] + dp[i - 2]; } return dp[n];`；9 帧（-69.0%），`PEAK STACK: 5 → 2`，`O(n) Linear Iterative Scan` / `O(1) Scalar Accumulator`，终端 `climbTabulated(5) = 8` |
| 按钮换标 | Stage-1 后按钮文案变为 `Apply Stage-2: Bottom-Up Tabulation (O(1) Stack)`；Stage-2 后 optimizedCode 等于源码，按钮自动退场 |
| DUP/HIT 交叉验证 | fib(5) 31 帧下 `DUP 9 / HIT 0`，与 `redundantCallCount = 9` 相等；climb Stage-1 `HIT 2 + DUP 1 = 3` 等于其 redundantCallCount 3 |
| Watch 下标与跳帧 | FRAME 11：`dp[1][2] === 6` TRUE；`dp[99][0] === 1` ERROR（`Cannot read properties of undefined (reading '0')`）；FRAME 1 同一断言 ERROR（dp is not defined，符合 #13d）；`→T` 从 FRAME 1 精确瞬移到 FRAME 11 / 29，与 amber 突变格 `6 @ [1,2]` 同帧 |
| Watch 安全闸门 | `count = 5` INVALID（assignment not allowed, use === / !== / <= / >=）；`height['0']` 与 `window.alert` INVALID（no dot or quotes）；四态 TRUE/FALSE/INVALID/ERROR 与 4 条上限、逐条 × 移除、`no TRUE frame` 反馈均生效 |
| 回归 | Rain 40 帧 Two-Pointer、DP 29 帧 Matrix DP、Binary 10 帧 `O(log n)`、死循环 1334 帧 `O(∞)` + `[FUSE_STEP_LIMIT]` 横幅，全部与 M7 基线一致 |
| 纪律 | 13 条不变量逐条复核通过；`npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；控制台零 error/warn；提交前工作区干净 |

## 文档一致性修复（本轮附带）

准则 1 回味时发现 #13 的口号在三处文档里写法不一（INDEX 与 AGENT_GUIDE 用「、」，M7 日志用「，」），
既然 INDEX 已要求"引用时逐字一致"，就把 M7 日志与 INDEX/AGENT_GUIDE 统一为
「**合成可用源码、判据不得用源码**」，并把 #13 的编号项在 INDEX 里对齐到该口号。

## 遗留

- Stage-2 只覆盖「单参数 + 二元 + 恒等或常量基线」递推；多元（`comb(n, k)` 二维状态）、
  变步长（`n / 2`）与多路合并（`+` 与 `*` 混合）形态仍返回 null。
- HIT 判据依赖"首次调用展开过"这一前置条件，因此对**首次即被缓存预填**的形态（如手写自底向上）
  不会显示 HIT——语义正确，但界面看起来"没有剪枝成绩"，需要文案解释。
- `→T` 环形扫描在"仅当前帧成立"时会绕回当前帧并报 found，行为自洽但对使用者略有歧义，
  后续可区分「前方无解，是否绕回」的显式提示。
