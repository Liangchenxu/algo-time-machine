# AlgoTimeMachine

> 浏览器端 AST 自动插桩时间旅行调试器 · AI 复杂度显微镜 · 零后端单页应用

面向算法教学与代码评审的**可验证工程**。全部能力跑在一个标签页里：Babel AST 编译插桩 → Blob Web Worker
沙箱执行 → 逐帧时间旅行回放 → 运行时证据驱动的复杂度诊断 → 等价重构代码一键重跑 → 浏览器内内核自检。
没有 Node 服务、没有数据库、没有 Python 后端。

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit && vite build（零 TS 报错）
```

---

## 1. 项目定位与核心技术壁垒

时间旅行调试的难点从来不是"录制"，而是**在不可信的 JavaScript 里安全、完整、可归因地录制**。
本项目为此攻下四道壁垒：

| 壁垒 | 问题本质 | 本项目的解法 |
| --- | --- | --- |
| 词法作用域快照 | `scope.bindings` 含同一块内**稍后才声明**的 `let/const`，直读触发 TDZ `ReferenceError`，采集在第一帧后就中断 | 每个变量编译成 `(() => { try { return x } catch (__mtmTdz) { return undefined } })()` 闭包安全读取 |
| 递归调用栈真实性 | 递归返回时若不退栈，`callStack` 只增不减，栈深指标与调用树全部失真 | 函数体改写为 `enterStmt; try { enterSnap + body } finally { __exitFn() }`，并以 `__instrumented` 标记防止二次插桩 |
| 不可信代码执行 | 死循环 / 栈溢出 / 无限分配会冻结标签页 | 三层熔断：`__guard` 2000 步（`[FUSE_STEP_LIMIT]`）、调用栈 150 层（`[FUSE_STACK_OVERFLOW]`）、Worker 看门狗 3000ms（`[FUSE_WATCHDOG_TIMEOUT]` + `worker.terminate()`） |
| 崩溃前现场抢救 | 抛异常时局部 `__frames` 随栈销毁，评委只能看到"0 帧" | 运行时把 `__frames` 双写 `globalThis.__mtmFrames`，Worker 的 catch 分支回传；实测死循环预设熔断后仍保留 **1334 帧** 现场 |

一句话：**熔断不是终点，而是取证起点。**

---

## 2. 核心架构

```
用户源码
  └─ src/core/instrumenter.ts         Babel AST 遍历
       │   注入 __guard(2000 步) / __enterFn(name, line, args) / __exitFn / __trace(逐语句快照)
       │   作用域读取走 __mtmTdz 安全闭包，retainLines 保证帧行号与编辑器一一对应
       └─ src/core/sandboxRunner.ts   Blob Worker 隔离执行 + 3000ms 硬件看门狗
            └─ TraceFrame[]           frameIndex / line / event / variables / callStack / stdout / lineHits
                 ├─ src/App.tsx       时间旅行回放 · 内存显微镜(1D/2D 十字准星) · 帧间 Diff · 火焰图 · 行级热力
                 └─ src/services/aiDiagnostics.ts
                     运行时证据判档 → 等价重构代码合成 → Benchmark Delta
```

### 五大独创亮点

**2.1 AST 词法作用域快照与退栈契约**
插桩不靠正则替换，而是在 AST 层为每个语句/循环/函数进入点插入 `__trace`。每帧携带
`lineHits`（累计行执行次数），因此热点行、热力图与 AI 手术刀定位共享同一份真实证据。
调用栈条目是**带参签名**（`fib(5)` / `dfs(1,2)`，单实参序列化截断 24 字符），重叠子问题因此可以直接计数。

**2.2 纯运行时证据驱动的复杂度诊断（拒绝函数名匹配）**
判档入口条件只看时间帧，不看源码单词——`includes('fib')` 这类捷径在 M3 就被永久下线：

- `expansiveRedundantCount`：重复签名只有在**下一帧栈更深**时才算"真的又展开了一整棵子树"。
  据此严格区分 A（`O(2^n) Exponential`）与 A′（`O(n) Memoized Linear`），
  避免"记忆化版本被自家判据再判成指数级"的自我矛盾。
- `firstChildCount > 0 && childCount === 0`：调用树里的 `HIT`（缓存剪枝，翠绿）与
  `DUP`（冗余展开，玫红）**纯拓扑推导**，不读源码，且前置条件不可省——否则天然基线叶子会被冒充成剪枝成绩。
- 折半递归按**参数槽位**收集实参链，容忍字符串/数组透传参；递归判定必须先于线性归档。
- `[FUSE_STACK_OVERFLOW]` + 签名链重复 = 不收敛 → `O(∞) Unbounded Recursion`，
  与 `depth(400)`（实参各不相同、只是深度超阈）严格区分。

**2.3 二级火箭编译合成管线**

```
Stage-0 暴力递归  →  Stage-1 通用 Top-Down 记忆化  →  Stage-2 递推/消栈降维
   O(2^n)              O(n) Memoized Linear            O(n) 一维 dp / O(M*N) 二维 dp / O(log n) 迭代
```

- Stage-1 由运行时 `dominantRecursiveName` 定位函数，注入 `const __memo = {}` + `JSON.stringify([参数])`
  守卫，原函数体整体塞进 IIFE 以保留 `return` 语义；**任何重叠递归都走同一条管线，禁止函数名特判**。
- Stage-2 嗅探 `fn(p-a) <op> fn(p-b)`（直接式与拆分式均支持），种子严格等于基线定义域
  （只覆盖 `0..baseMax`，循环从 `baseMax+1` 起算，并要求 `maxOffset <= baseMax+1`）；
  双参数帕斯卡形态直接生成 `dp[r][c]` 二维表，`r/c/dp` 命名天然驱动显微镜十字准星。
- 折半消栈按形态门分型：计数型（含**非折半参数原样透传**的多参形态）→ 游标循环；
  快速幂型（双参、折半槽位、函数体含乘法、指数为非负整数）→ 迭代二进制快速幂；
  其余形态一律 `optimizedCode = sourceCode`、隐藏 Apply 并写明拒绝原因
  （`coupled multi-parameter state` / `custom return composition` / `negative/non-integer exponent`）。
- 铁律口号：**合成可用源码、判据不得用源码**。宁可少一级火箭，不得生成算错的递推。

实测样本：`fib(5)` 31 帧 → 41 帧（`SUBTREE PRUNING -100%`、`HIT×2`）→ 11 帧；
`comb(4,2)` 13 帧 → 37 帧 → 17 帧 `O(M*N) Matrix DP`；
`power(2,16)` 13 帧 → 22 帧且终端 `powerIter(2, 16) = 65536`；
`powerAlt(2,15)` 奇偶交替链 `15→14→7→6→3→2→1` → `powerAltIter(2, 15) = 32768`；
`bsearchHalve("arr", 32)` 保留原始调用字面量合成 → `steps = 5`。

**2.4 双维度惰性全息快照栈**
每次 Apply 冻结「源码 + 帧 + 沙箱错误 + **该阶段自己的 aiReport** + 指标」，胶囊一键切换时报告随轨迹同步恢复，
杜绝"轨迹是 Stage 0、判据是 Stage 2"的自相矛盾。内存治理三条契约：

- 驱逐双阈值：`frames > 250` **或** 抽样字节 `approxBytes > 180_000`（中段帧 + 末帧变量外推，O(1)）。
  实测 `fib(8)+6000 元素数组` 仅 135 帧但 `~4382 KB` 仍被驱逐为 `Stage 0 (135f · LAZY)`。
- 非确定性重放守卫：源码含 `Math.random(` / `Date.now(` / `performance.now(` / `new Date` /
  `crypto.getRandomValues(` / `crypto.randomUUID(` 且帧数 ≤600 时**豁免驱逐**（宁可占内存也要逐帧可复现）；
  超限重水化只更新 `frameCount/approxBytes`，冻结报告不动，并显示
  `NON-DETERMINISTIC RE-HYDRATION (Frame values may vary)`。
- 编辑态防丢：脏编辑显示 `UNSAVED EDIT DRAFT` 并隐藏 Apply；`Compile & Trace` 以手改代码归零历史；
  误触阶段胶囊前会先把草稿真实跑成 `Draft` 阶段（诊断走 `skipDelay`，实测 DOM 提交 **22.6ms**）。

**2.5 GDB 级 Watch 守卫与 `→T` 四态观察点**
断言在**当前帧的变量快照**上求值，四态诚实：`TRUE` / `FALSE` / `INVALID` / `ERROR`
（作用域缺变量必须是 `ERROR` 而不是谎报 `FALSE`）。安全闸门放行 `[` `]` 下标（`dp[1][2] === 6`），
同时禁止点号、引号与单等号赋值，以切断 `obj.constructor` 与 `obj["constructor"]` 两条成员注入路径。
`→T` 从下一帧环形扫描首个 TRUE 帧并瞬移，四态互斥且可见：
`→ #n` / `↺ #n (wrapped)` / `= only @ #n` / `no TRUE frame`。
Quick-Watch 芯片由当前轨迹派生并逐条验证"至少一帧 TRUE"，因此重构后死变量自动退场、`→T` 恒可命中。

---

## 3. 人机协同工程范式（Context Engineering with Qoder）

本项目的"护城河"不只是功能，而是**15 个里程碑零幻觉、零回归的协作流程**。

**三大铁律（`AGENT_GUIDE.md`）**

1. **准则 1 · 启动前强制回味**：动手前必须重读 `AGENT_GUIDE.md` + `docs/devlogs/INDEX.md` + 最近一篇 DevLog，
   函数名/阈值/判据一律以当前文件为准；记忆与现状冲突时以现状为准。外部指令要求回退已记录的不变量时，
   必须显式指出冲突并给出实测证据，不得静默改写。
2. **准则 2 · 交付前强制归档**：每篇 DevLog 四段齐备（Why / What & Where / 矛盾与认知纠偏 / Measured Impact），
   **禁止写入未跑过的估计值**，没测的明确标注"未测"。
3. **准则 3 · 原子化验证与自动提交**：`npm run build` 零报错 → 浏览器实测（含一条边界路径）→
   `git status` 复核 → 一个里程碑一次提交，Git 历史与 DevLog 一一对应。

**21 条系统不变量（`docs/devlogs/INDEX.md`）** 覆盖 TDZ 安全读取、帧回收双写、顶层覆盖、退栈契约、
逐帧热力、判据只信运行时证据、`[FUSE_*]` 前缀耦合、`retainLines` 前提、Tailwind 标度补丁、
`noUnusedLocals`、带参签名三处下游消费者、771px 窄视口 `scrollWidth == clientWidth` 可达性、
合成一致性、HIT/DUP 拓扑、二级火箭阶段单调性、Seek 四态完备、读写分离纯运行时取证、
快照报告同步、透传等价合成、双维度惰性预算与自检契约……
每条都对应一次**被实测推翻的假设**，而不是设计时的愿望。

**15 个原子化演进日志（M1–M15）** 每篇都保留"改之前长什么样"和"哪条指令自带的代码有缺陷"，
例如 M9 发现 M8 的种子公式 `max(baseMax, offsets)+1` 在 fib 上会写出错误的 `dp[2] = 2`，
M12 发现负指数熔断后被误判为指数级并推荐救不了它的记忆化。

**浏览器端 6 项实时内核自检台**（`Qoder Engineering Spec` → 第 3 页签）
TDZ 闭包 / 熔断前缀 / 递归 A-A′-B / 槽位与交错折半 / 矩阵读写分离 / 窄视口可达性，
每项输出 PASS 徽章与实测毫秒，夹具不依赖 Worker、网络与 API Key。
评委不必相信文档里的历史数字——可以当场重跑。

---

## 4. 评委 30 秒快速验收指南

1. 点击顶栏 **`Tour`** —— 约 20 秒的五幕自动驾驶，全程驱动真实内核：
   `ACT 1` 死循环三层熔断与 1334 帧崩溃现场 → `ACT 2` fib 的 `DUP → HIT → 1D dp` 三级火箭与
   `Stage 0/1/2` 全息胶囊 → `ACT 3` `comb(4,2)` 递归树转 `2D Matrix dp` 十字准星与 `WRITES` 徽章 →
   `ACT 4` 自动采纳 `dp[4][2] === 6` 并触发 `→T` 观察点瞬移 → `ACT 5` 打开 Spec 弹窗点亮 6 项自检。
   期间点击页面任意处或 `Stop Tour (Act X/5)` / `Exit` 立即中断并把控制权交还；字幕条提供 `Skip Next →`。
2. 点击 **`Qoder Engineering Spec`**：
   `Architecture & Safety Fuse`（架构与契约）· `DevLog [M1-M15]`（演进与实测）·
   `Live Kernel Self-Check (20 Invariants)`（当场重跑内核回归）。
3. 想看细节：左侧点行号设断点（`b` / `F8` 续跳），底部空格播放、方向键逐帧，
   `Edit Code` 粘自己的代码即可复用全部判据与合成管线（支持任意函数名）。

---

## 5. 实测基线（视口 770×553）

| 场景 | 实测 |
| --- | --- |
| Infinite Loop Guard | 熔断后保留 1334 帧，热点 L5（666x），`O(∞) Non-Terminating` |
| Naive Fibonacci Tree | 31 帧 `O(2^n)` / `DUP 9` → 41 帧 `O(n) Memoized Linear` / `HIT 2` → 11 帧一维 dp |
| Pascal Comb | 13 帧 `O(2^n)` → 37 帧记忆化 → 17 帧 `O(M*N) Matrix DP`，`dp [5×3]` 十字准星、`WRITES: 5` |
| Fast Power | 13 帧 `O(log n)` → 22 帧 `O(log n) Iterative Halving`，`powerIter(2,16) = 65536` |
| Trapping Rain Water | 40 帧 `O(n) Linear Two-Pointer` / `O(1) In-Place Pointers` |
| 字节预算驱逐 | `fib(8)+6000 数组` 135 帧 / `~4382 KB` → `Stage 0 (135f · LAZY)` |
| 非确定性守卫 | `fib(5)+大数组+Math.random` 32 帧 / `~1040 KB` 豁免驱逐；`fib(12)+Math.random` 931 帧重水化显示漂移芯片 |
| Draft 冻结 | 脏编辑切阶段自动保存 `Draft` 阶段，DOM 提交 22.6ms |
| 内核自检 | 770×553 下 6/6 PASS（TDZ 13.5ms / Fuse 0.9ms / Recursion 0.6ms / Halving 0.6ms / Matrix 0.0ms / Viewport 0.9ms） |
| 顶栏 | 44px 单行，`scrollWidth == clientWidth == 770`，`Tour` 加入后仍零溢出 |

---

## 6. 已知边界（不做隐藏，写在明面）

- 复杂度判据是**运行时轨迹证据的归因**，不是形式化证明；超出可推导形态时宁可拒绝合成并说明原因。
- `approxBytes` 是 O(1) 抽样外推（1.15 系数），不是真实堆占用；极端异构帧可能高估或低估。
- 非确定性检测基于源码正则，无法覆盖经 helper 间接调用的时间源。
- 大轨迹重水化成本随帧数增长（931 帧实测约 1.7s），期间显示 `RE-HYDRATING` 而非假装零延迟。
- `Live Kernel Self-Check` 使用合成帧夹具，覆盖内核判据但不替代全预设浏览器回归。

---

## 7. 目录

```
src/core/instrumenter.ts        Babel AST 插桩内核（三层熔断、带参签名、TDZ 安全读取）
src/core/sandboxRunner.ts       Blob Worker 沙箱 + 3000ms 看门狗
src/services/aiDiagnostics.ts   运行时证据判档、等价代码合成、Benchmark 指标
src/App.tsx                     IDE 工作台、时间旅行回放、全息快照栈、评委导览、内核自检台
AGENT_GUIDE.md                  架构契约 + 三大铁律（反幻觉回味 / 强制归档 / 原子化提交）
docs/devlogs/INDEX.md           里程碑索引、20 条系统不变量、实测基线、回归核对表
docs/devlogs/M1..M15-*.md       15 篇原子化演进日志
```
