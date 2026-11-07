# M10 · 帕斯卡预设、自适应 Watch 合成、二维读写分离取证与折半递归消栈

Commit：本次提交（`git log -1`）— feat(introspection): 完成 Milestone 10 帕斯卡树转矩阵预设、自适应Watch合成、二维表读写分离与O(log n)折半递归

## Why · 背景动机

M9 的三条遗留共享同一个病根：**引擎还在依赖"预设知识"，而不是"这一跑的运行时事实"**。

1. `comb(4,2)` 的跨维转场（2D 调用树 → 剪枝 → 2D 矩阵）藏在"手写代码"里，评委必须会打字才能看到；
2. Quick-Watch 芯片按 `selectedPresetId` 静态给出，一旦点了 Stage-2（`leftBranch` 已不存在）
   芯片还在推荐 `+ leftBranch === 2`，点进去必然是 `ERROR`；
3. 二维滚动样例的门控读的是源码里有没有 `grid = [`，而 `combTabulated` 的"没有只读输入"这件事
   本来就能从帧里直接看出来；折半递归（`halve(n) = 1 + halve(n/2)`）则被归入线性递归，
   既没有对数级的判据，也没有把 O(log n) 栈压平的出口。

## What & Where · 核心改动

### 1. 第 6 个内置预设 `Pascal Comb (Tree→2D)`

`PRESETS` 在 `fib-tree` 之后新增 `pascal-comb`（`comb(4, 2)`，两次 Apply 走完跨维转场）。
顶栏 6 个预设时，预设切换器（唯一可压缩区）实测 `clientWidth 86 / scrollWidth 1127` 可横滚，
外框 `scrollWidth == clientWidth == 770`、高度 44px，不变量 #12 不被破坏。

### 2. 自适应 Quick-Watch（`deriveRuntimeQuickWatches`）

纯函数，输入当前 `frames` 与预设精选种子：

- **规则 A（2D 表）**：优先取**从末尾向前第一个仍持有 `dp` 的帧**（此时表已写满），
  用该帧真实的 `(r, c)` 与 `dp[r][c]` 生成 `dp[r][c] === val` 与 `r === r && c === c`；
- **规则 B（1D 表）**：同样从末尾回溯，取一维 `dp` 与循环游标（`i`/`c`/`idx`/`cursor`）生成
  `dp[idx] === val` 与 `cursor === idx`；
- **规则 C（递归/标量阶段）**：取真实帧里的数值变量生成 `name === value`。
- **统一验证**：`[...curated, ...derived]` 逐条用 `evalWatchExpression` 扫全轨迹，
  只有"至少一帧为 TRUE"的候选才会显示——死变量（Stage-2 后的 `leftBranch`）自动淘汰，
  且保证点 `→T` 100% 命中。

### 3. 二维矩阵读写分离（`analyzeMatrixWrites`）

比较每个二维数组与上一帧的每个单元格：`writeCount === 0` → **只读输入矩阵**，
`> 0` → **可变状态转移表**（数值为累计变化的单元格数）。`matrix2d` 分支据此判断
"是否同时存在只读输入 + 可变状态表"，决定是否提供一维滚动压缩方案；
**`sourceCode.includes('grid')` 已彻底删除**（全仓 0 处）。显微镜 2D 卡片右上角同步显示
`READ-ONLY`（暗灰）/ `WRITES: n`（天蓝）徽章与运行时取证 tooltip。

### 4. 折半递归分档与消栈（`detectHalvingArgs` / `detectHalvingVariable` / `synthesizeHalvingLoop`）

- 递归侧：当 `maxStackDepth >= 3`、`redundantCallCount === 0` 且连续进入事件的第一个数值实参满足
  `a[k+1] === floor(a[k]/2)`（至少 2 步、首值 ≥ 8）时，判 `O(log n) Logarithmic Recursion`，
  标签 `LOGARITHMIC_DESCENT` + `TAIL_UNROLL_CANDIDATE`，并生成
  `let curr = base; while (curr > 1) { curr = Math.floor(curr / 2); steps++; }`。
- 迭代侧：任意数值变量在帧序列上按 `floor(v/2)` 收敛即判 `O(log n) Iterative Halving`，
  避免 Apply 之后掉回"线性扫描"的措辞。
- 该判据必须放在通用递归分支**之前**，否则折半链会先被线性递归档吃掉。

### 5. 递归门控阈值改造（被新预设逼出来的）

原门控：`A: redundantCallCount >= 2 && expansive >= 1` / `A′: redundantCallCount >= 2`。
`comb(4,2)` 记忆化后重复进入恰好只有 **1** 次（只有 `comb(2,1)` 被二次调用），
于是 A′ 不成立、掉进 B 被判成 `O(n) Linear Recursion`——记忆化的组合数被说成线性递归。
改为按证据分层：`expansive >= 1 → A`；否则 `redundant >= 1 → A′`；否则 `B`。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **阈值是"围着样本树形调出来的"**（第 4 次同类教训）
   M5 定的 `>= 2` 在 fib(5)（冗余 9）与 climb(5)（冗余 3）上从未被检验过边界；
   `comb(4,2)` 的冗余恰好是 1，直接把它推到错误的档位。这次不是改数字，而是把门控改成按证据类型分层
   （"有展开 → 指数"、"只有缓存命中 → 记忆化"、"没有重复 → 线性"），阈值不再承担分类职责。
2. **"真值"与"有信息量"是两件事**
   首版自适应芯片取 65% 帧，为 comb Stage-2 推荐 `dp[4][1] === 0`——那一刻该格确实还是 0，
   表达式为真、`→T` 也能命中，但对演示毫无说服力。改为从末尾向前找仍持有 `dp` 的帧后，
   comb 给 `dp[4][2] === 6`、fib 给 `dp[5] === 5`（都是最终答案所在的格/位）。
3. **折半消栈后栈深是 1 而不是 2**
   生成的是顶层游标循环，没有函数调用帧，所以 `PEAK STACK: 7 → 1`；横幅按实测显示，不套用"应为 2"的先验。
4. **Stage-2 后芯片在第 1 帧仍会 ERROR 一次**
   `dp[5] === 5` 在 FRAME 1 报 `dp is not defined`：那一帧 `const dp` 尚未执行（TDZ 过滤），
   属不变量 #13d 的诚实反馈；点 `→T` 会立即落到 FRAME 10 并翻绿。这不是"死变量"，
   因此不再属于本轮要消灭的问题，但需要在文档里说明，避免被误读成芯片失效。
5. **探针选帧错误的两种形态**
   ① 二维徽章/矩阵在最后一帧取不到（函数已返回、`dp` 出作用域）；
   ② 自适应芯片若取中间帧会得到未写入的格子。两者都靠"从末尾回溯到仍持有 dp 的帧"解决，
   也说明**取样位置本身就是结论的一部分**。

## Impact · 实测验证指标（视口 770×553）

| 场景 | 实测结果 |
| --- | --- |
| 第 6 预设 | 顶栏 6 个预设；切换器 `clientW 86 / scrollW 1127`（可横滚），顶栏 44px 且 `scrollWidth == clientWidth == 770` |
| pascal Stage-0 | 13 帧，`O(2^n) Exponential` / `O(n) Stack Depth 5`，`DUP 3 / HIT 0` |
| pascal Stage-1 | 37 帧，`O(n) Memoized Linear` / `O(n) Memo Table + 5 Stack Frames`，`DUP 0 / HIT 1`，`SUBTREE PRUNING: 1 → 0 (-100% Pruned)`，按钮换标 |
| pascal Stage-2 | 17 帧，`O(M * N) Matrix DP` / `O(M * N) 2D Tabulation`，`WRITES: 5` 徽章，Apply 退场，芯片进化为 `dp[4][2] === 6` / `r === 4 && c === 2` |
| Quick-Watch 进化 | fib：Stage-0/1 为 `n === 2` / `leftBranch === 2` → Stage-2 自动变为 `dp[5] === 5` / `i === 5`；点选后 `→T` 从 FRAME 1 命中 FRAME 10（TRUE） |
| 二维读写分离 | DP 第 10 帧：`grid [3×4] READ-ONLY`（暗灰）、`dp [3×4] WRITES: 6`（天蓝），`Cursor [1][2]` 正常；`includes('grid')` 全仓 0 处 |
| 折半递归 | `halve(32)`：`O(log n) Logarithmic Recursion` / `O(log n) Call Stack Depth 7`，实参链 `32 → 16 → 8 → 4 → 2 → 1`，标签 `LOGARITHMIC_DESCENT` + `TAIL_UNROLL_CANDIDATE` |
| 折半消栈 | Apply 后生成 `while (curr > 1)`，18 帧，横幅 `STACK REDUCTION: -85.7% Call Frames | PEAK STACK: 7 → 1 | TRACE STEPS: 7 → 18 (Unrolled Loop)`，终端 `halving steps = 5`，判据 `O(log n) Iterative Halving` / `O(1) Scalar Accumulator`，芯片 `curr === 4` / `steps === 3` |
| 回归 | Rain 40 帧 Two-Pointer、DP 29 帧 Matrix DP、Binary 10 帧 `O(log n)`、fib 31 帧 `O(2^n)` / `DUP 9`、死循环 1334 帧 `O(∞)` 均与 M9 基线一致 |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；11 篇 DevLog 表格列数一致 |

## 遗留

- 折半判定只看「每次进入事件的**第一个**数值实参」：`halve(32)` 命中；而 `power(2, 16)` 的首参一直是底数 2，
  收敛的是第二参，因此**不会被识别为折半递归**（实测未验证 power，按代码路径推断），仍会落回线性递归档。
  要覆盖它需要同时对每个实参位置做折半检测，并区分"被折半的是规模还是底数"。
- 折半消栈生成的是"计数型"循环（`steps++`），只对 `halve(n) = c + halve(n/2)` 这类返回值等于步数的形态等价；
  若返回值依赖其它量（如返回折半后的剩余值），当前合成结果不等价——需要在合成前要求"返回值仅由步数构成"，
  否则应拒绝给 `optimizedCode`。
- 自适应芯片的规则 C 仍按变量出现顺序取前两个数值变量，对复杂作用域不一定是最有解释力的组合；
  更理想的是按"值在轨迹中发生变化"优先挑选。
- `analyzeMatrixWrites` 统计的是"相邻帧之间的单元格变化数"，同一个格子被反复改写会重复计数；
  作为只读/可变的二分类判据足够，但不能当作精确的写入指令数报告。
