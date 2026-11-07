# M9 · fib 预设并入二级火箭、双参帕斯卡二维表降维与 Seek 四态导航

Commit：本次提交（`git log -1`）— feat(pipeline): 完成 Milestone 9 fib预设二级火箭化、双参comb二维DP合成、Seek四态消歧与一键Watch芯片

## Why · 背景动机

M8 把二级火箭做出来了，但它只对"非 fib"的函数成立，而且还有两处体验断点：

1. **评委看不到最精彩的一幕**。M7 为 fib 保留了 `targetFnName === 'fib'` 直接输出 `fibDP` 数组递推的特判。
   后果是：评委点开 `Naive Fibonacci Tree`（最经典的演示预设），按一次 Apply 就**一步跳到了终点**，
   完全错过 Stage-1 的翠绿 `HIT` 剪枝节点、`SUBTREE PRUNING` 横幅与 `Apply Stage-2` 按钮。
   一个架构级的能力被一个历史特判藏了起来。
2. **双参数递推无从降维**。`comb(n, k)` 这种帕斯卡递推的状态是二维的，Stage-2 的单参数嗅探器直接返回 null，
   于是"指数递归 → 记忆化 → 数组化"的叙事在组合数这类问题上断链。
3. **`→T` 的三种情况混同一个反馈**：绕回命中与前方命中都显示"找到了"，仅当前帧成立时"点了没动却报成功"，
   而且 Watch 需要手打表达式——"零打字体验"不成立。

## What & Where · 核心改动

### 1. 取消 fib 特判（`src/services/aiDiagnostics.ts` 分支 A）

`classicDP` 分支整体删除，所有重叠递归统一注入 Top-Down 记忆化。fib 的 Stage-1 因此与 climb 完全同构：
`__memo` 守卫 → 重跑 → 判据转 `O(n) Memoized Linear` → HIT 剪枝 → `SUBTREE PRUNING` 横幅 → Stage-2 按钮。
洞察标签从 `BOTTOM_UP_DP_CANDIDATE / MEMO_INJECTION_TARGET` 二选一收敛为单一的 `MEMO_INJECTION_TARGET`。

### 2. 递推嗅探的两处修正

- **拆分式识别**：fib 预设的真实写法是
  `let leftBranch = fib(n - 1); let rightBranch = fib(n - 2); return leftBranch + rightBranch;`，
  旧嗅探器只认相邻的 `fn(a) op fn(b)`，因此对 fib 永远返回 null。新增分支：先收集
  `var = fn(p - k)` 的两处赋值，再要求唯一的 `return v1 op v2` 恰好组合这两个变量（顺序可互换）。
- **种子/起点公式修正（一个真实的数学错误）**：M8 用的是
  `start = max(baseMax, offsetA, offsetB) + 1`、种子覆盖 `0..start-1`。
  对 climb（baseMax = 2、offsets 1/2）恰好等于正确答案，但 fib（baseMax = 1、offsets 1/2）会得到
  `dp = [0, 1, 2]` 且从 3 起算——`dp[2]` 被当成"恒等基线值 2"，而 `fib(2)` 实际是 1，整张表从此错位。
  这个缺陷在 M8 完全不可见（climb 掩盖了它），直到 fib 走 Stage-2 才暴露。
  修正为：`start = baseMax + 1`，种子只覆盖基线真实定义域 `0..baseMax`，
  并加收敛门 `maxOffset <= baseMax + 1`（依赖项必须落在基线覆盖范围内，否则 dp 会出现未初始化空洞 → 拒绝合成）。

### 3. 双参数帕斯卡递推 → 二维表（`sniffTwoParamPascalRecurrence` / `synthesizeTwoParamTabulation`）

- 命中条件：形参恰好 2 个；基线 `if (p2 === 0 || p2 === p1) return 常量`（两种顺序都认）；
  递推 `fn(p1 - 1, p2 - 1) + fn(p1 - 1, p2)`（可交换）。
- 生成 `dp[r][c]` 二维表：`Array.from` 建表时把 `c === 0 || c === r` 初始化为基线值，
  双层 `r`/`c` 循环按 `Math.min(r - 1, k)` 收紧列上界，结尾打印并返回 `dp[n][k]`。
  **`r` / `c` / `dp` 的命名是刻意选择的**：`POINTER_NAMES` 已包含 `r`/`c`，
  显微镜会自动切到 2D Matrix Crosshair 视图，形成"递归调用树 → 二维 DP 网格"的视觉转场。
- 实参取自 `metrics.topCallExpr` 的数字序列（如 `comb(4,2)`），取不到两个整数就放弃合成。

### 4. 二维档的一维滚动样例加门控

`matrix2d` 分支原本无条件提供"一维滚动数组"样例，而那段样例是写死的 min-path 题解。
comb 走完 Stage-2 后会命中该分支，点 Apply 会把 `comb` 的代码整体替换成 min-path——与不变量 #13c
（不得输出无关的"优化代码"）直接冲突。现改为：仅当源码中确有二维输入 `grid` 时才提供该样例，
否则 `optimizedCode = sourceCode`、Apply 退场，收益文案说明"二维表已是该递推的终端形态"。

### 5. `→T` 四态反馈与场景化 Quick-Watch（`src/App.tsx`）

| 情况 | 判定 | 跳转 | 徽章 |
| --- | --- | --- | --- |
| 前方命中 | `hitIdx > currentFrameIdx` | 跳到命中帧 | `→ #${n}` 天蓝 |
| 环形绕回命中 | `hitIdx < currentFrameIdx` | 跳到命中帧 | `↺ #${n} (wrapped)` 琥珀 |
| 仅当前帧成立 | `hitIdx === currentFrameIdx` | **不移动** | `= only @ #${n}` 紫罗兰 |
| 全轨迹无解 | 无 | 不移动 | `no TRUE frame` 玫红 |

- `seekState` 由 `{ expr, found, frameIndex }` 改为 `{ expr, kind: 'forward'|'wrapped'|'only'|'none', frameIndex }`，
  四态互斥且都由同一次环形扫描得出（扫描末步落回当前帧即证明别无他帧成立）。
- 调用树图例：`DUP` / `HIT` 各加 `title` 说明（真实重算 vs 缓存守卫拦截）；
  `DUP > 0 && HIT === 0` 时显示琥珀提示 `unpruned → click Apply for HIT`，`HIT > 0` 时显示 `memo cache pruned`。
- Quick-Watch：`QUICK_WATCH[selectedPresetId]` 给出 2 条建议断言
  （rainwater / dp-matrix / binary-search / fib-tree / infinite-loop 各一组），
  点击即 `adoptWatchExpr` 直接加入，并把 `addWatchExpression` 也改为复用它以保持单一路径。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **取消特判才让 M8 的公式错误现形**（本轮最有价值的一次连锁发现）
   fib 走 Stage-2 前，`start = max(baseMax, offsets) + 1` 从未被检验过正确性；climb 的 baseMax 恰好让
   两种公式等价。一旦 fib 进入同一条管线，生成器的 `dp = [0, 1, 2]` 会直接算错 `fib(2)`。
   这说明 M8 的"实测通过"其实是**样本覆盖不足**的通过——只有把不同形态都赶进同一条管线，才会暴露隐藏的假设。
   修正后：fib 生成 `dp = [0, 1]` 且 `i` 从 2 起算，终端 `fibTabulated(5) = 5` 正确；climb 仍为 `[0, 1, 2]` 与 8。
2. **Stage-2 产物再次触发"无关样例"**（M4 遗留的样例特化在二维档复现）
   引擎看到二维 `dp` 就推荐 min-path 的滚动数组样例，对 comb 完全是另一个算法。
   这次按 #13c 加门控而不是靠文案免责——`optimizedCode === sourceCode` 才是唯一诚实的"无可推荐"表达。
3. **`→T` 的"only"态必须是「扫描完全程才确认」**
   实现上不能把 `idx === currentFrameIdx` 当作"绕回里第一次碰到自己"就下结论，必须在环形扫描中
   确认没有其他 TRUE 帧（扫描从 current+1 开始、绕回 current 正好是最后一圈），否则在"前方有命中但更远处才有"
   的场景里会误报 only。现有循环天然满足这一点，文档化以防后来者改成 `indexOf` 式实现。
4. **探针又踩了两次**
   ① 二维矩阵取证先点了最后一帧——函数已返回、`dp` 出作用域，误以为"矩阵没渲染"，中段帧才看到 `dp [5×3]` 与 `Cursor [3][1]`；
   ② 用 `HTMLTextAreaElement.prototype` 的 value setter 去写 `<input>`，抛 `Illegal invocation`。
   仍是同一条纪律：**否定性观测先怀疑探针**。

## Impact · 实测验证指标（视口 770×553）

| 场景 | 实测结果 |
| --- | --- |
| fib Stage-0 | 31 帧，`O(2^n) Exponential` / `O(n) Stack Depth 6`，`DUP 9 / HIT 0`，图例提示 `unpruned → click Apply for HIT` |
| fib Stage-1（记忆化） | 41 帧，`O(n) Memoized Linear` / `O(n) Memo Table + 6 Stack Frames`，`DUP 1 / HIT 2`（HIT×2 填充 `#6ee7b7`），横幅 `SUBTREE PRUNING: Expansive Redundant Subtrees 3 → 0 (-100% Pruned)` + `TRACE STEPS: 31 → 41 (Includes O(1) Memo Lookups)`，终端 `fib(5) = 5`，按钮换标 `Apply Stage-2: Bottom-Up Tabulation (O(1) Stack)` |
| fib Stage-2（数组化） | 生成 `const dp = [0, 1]; for (let i = 2; i <= n; i++) { dp[i] = dp[i - 1] + dp[i - 2]; }`，11 帧（-73.2%），`PEAK STACK: 6 → 2`，`O(n) Linear Iterative Scan` / `O(1) Scalar Accumulator`，终端 `fibTabulated(5) = 5`，Apply 退场 |
| climb 回归 | Stage-2 仍生成 `const dp = [0, 1, 2]`、9 帧、终端 `climbTabulated(5) = 8`（种子公式修正无回归） |
| comb Stage-0 | 12 帧，`O(2^n) Exponential` / `O(n) Stack Depth 5`，`DUP 3 / HIT 0` |
| comb Stage-1 | 39 帧，`O(n) Memoized Linear`，缓存键 `JSON.stringify([n, k])`（双参数支持），`HIT×2 / DUP 0`，横幅剪枝 `1 → 0`，按钮换标 |
| comb Stage-2 | 生成 `dp[r][c]` 二维表，17 帧，终端 `combTabulated(4, 2) = 6`，判据 `O(M * N) Matrix DP` / `O(M * N) 2D Tabulation`，Apply 退场 |
| 2D 联动 | 显微镜渲染 `2D Matrix: dp [5×3]` 共 15 格，第 7 帧出现 `Cursor [3][1]` 十字准星，`Δ 1 State Mutation` 正常 |
| Quick-Watch | DP 预设显示 `+ dp[1][2] === 6` / `+ r === 2 && c === 3`，点击即加入（零打字），五个预设各 2 条建议 |
| →T 四态 | `→ #11`（FRAME 1 → 11）、同帧再点 `→ #12`、末帧点 `↺ #11 (wrapped)`、单帧断言二次点击 `= only @ #4`（帧号不变）、`x === 999` → `no TRUE frame` |
| 回归 | Rain 40 帧 Two-Pointer、DP 29 帧 Matrix DP、Binary 10 帧 `O(log n)`、死循环 1334 帧 `O(∞)` + `[FUSE_STEP_LIMIT]` 均未变 |
| 纪律 | 14 条不变量逐条复核通过；`npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；10 篇 DevLog 表格列数一致 |

## 遗留

- Stage-2 仍不支持：变步长（`n / 2` 的二分递归）、三参数及以上的多维状态、以及记忆化后仍需二维状态的任意递推
  （当前只认帕斯卡这一种双参形态）。
- Quick-Watch 建议按 `selectedPresetId` 取，用户把预设代码改成自定义算法后芯片仍显示原建议
  （点进去得到真实求值结果，但提示性减弱）。更准确的做法是对当前源码做一次轻量形态分类再给建议。
- 二维档的门控依赖源码中 `grid = [` 这一形态判断是否提供滚动样例；更彻底的做法是通用地检测
  「只读二维输入 + 可滚动状态表」的读写分离，目前样例本身仍是 min-path 专用。
