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

**2.5 GDB 级 Watch 守卫、`→T` 四态观察点与跨阶段栈深包络图**
断言在**当前帧的变量快照**上求值，四态诚实：`TRUE` / `FALSE` / `INVALID` / `ERROR`
（作用域缺变量必须是 `ERROR` 而不是谎报 `FALSE`）。安全闸门放行 `[` `]` 下标（`dp[1][2] === 6`），
同时禁止点号、引号与单等号赋值，以切断 `obj.constructor` 与 `obj["constructor"]` 两条成员注入路径。
`→T` 从下一帧环形扫描首个 TRUE 帧并瞬移，四态互斥且可见：
`→ #n` / `↺ #n (wrapped)` / `= only @ #n` / `no TRUE frame`。
Quick-Watch 芯片由当前轨迹派生并逐条验证"至少一帧 TRUE"，因此重构后死变量自动退场、`→T` 恒可命中。

**2.6 火焰轨 160 桶 DOM 虚拟化**
底部 52px 火焰轨**不再按帧挂 DOM**：`buildFlameBuckets` 在 `<= 160` 帧时逐帧 1:1，
更长轨迹均匀切成恒 `MAX_FLAME_BARS = 160` 个无缝桶（相邻桶首尾相接、桶宽 `>= 1` 故永不为空），
每桶只保留**真实证据**——`maxDepth` 取桶内实际最大栈深、断点与热点按「桶内任一帧命中」聚合、
`repFrame` **优先取命中断点的帧**（否则取最深帧），点击竖条跳的就是 `repFrame`，
`title` 还会把聚合口径（`Frames a-b · peak depth d → #rep`）显式写给用户看。
实测 `infinite-loop` 的 1334 帧现场：竖条 **1334 → 160（-88.0%）**、该行盒子 `4009px → 197px`、
`footer 4572/770 → 770/770`、整页元素数 451。这一改同时是**可达性修复**——
溢出时大约第 190 帧之后的火焰条根本不在视口里，点不到。
诚实的另一半：这条改动**没有**让「投递后跳幕」变快（`324 / 332 / 361 / 365 / 370 / 372ms`），
M19 那句「因为 1334 根竖条压垮 Commit」的归因已被本轮实验推翻，该耗时仍是未闭合敞口（详见 M20 DevLog）。

多阶段对比不再只有数字：每个快照自带 `depthCurve`，且做**保峰保谷分桶**——最多 `128` 个整数
（≤128 帧逐帧 1:1，更长轨迹取「首帧 + 126 个桶 + 末帧」，每桶同时取最大与最小栈深），
因此 467 帧的基线只占 128 个数字，而曲线峰值仍与冻结报告的 `Stack Depth 13` 严格相等。
`LAZY` 驱逐只清 `frames` 不清曲线，所以单张 SVG 里始终能叠出全部阶段的栈深折线与半透明面积包络
（Stage 0 玫红虚线 / Stage 1 天蓝 / Stage 2 翠绿加粗）。
**激活阶段还叠一条 Min-Max 退栈振幅带**（256 点多边形：上沿顺 + 下沿逆），把 128 点抽样原本抹平的
波谷还原回来——实测 `fib(10)` 的 354 帧 `LAZY` 阶段绘出 256 点带、控制行 `min-max band 126/128 buckets`，
即 128 个桶里 126 个真的发生过退栈折叠，而这一切不需要重水化（带由快照的 `depthFloorCurve` 直接绘出）。
**M20 起非激活阶段也绘这条带**（`opacity 0.09`，激活阶段保持 `0.26`）——多阶段同图对比时
每个 `LAZY` 阶段的退栈波谷都看得见，而不只是当前选中的那一条；1:1 短轨迹阶段不存下沿，因此仍然无带。
**横轴双口径**：`X: Abs Frames` 按真实帧数占宽（实测 `467f / 75f / 25f` 三阶段占 `100% / 16% / 5%`，
「横向省时间」一眼可见），`X: Norm %` 让每条曲线铺满 0–100% 只比波形形状；
**纵轴双口径**：`Y: Linear` 保比例，`Y: Sqrt` 用 `sqrt((d-1)/(max-1))` 压缩，
让 150 层深递归与 1 层迭代同图时低峰值曲线不被压成直线（实测 Stage 2 顶点 `y 38.8 → 29.9`）。
当前帧在激活曲线上**分两层指示**：实心圆点取该帧真实 `callStack.length`，抽样桶峰值只以 dash 空心环 +
竖向细线共存显示（仅在本桶真的折叠过时出现），控制行同时回显 `frame depth 7 (bucket peak 10)`；
实测 `fib(12)` 467 帧抽样阶段三点读数 7/10、9/10、10/10，与底部火焰轨 `54% / 69% / 77%` × 峰值 13 逐一对上。
点击横轴按**当前模式**逆映射并 clamp 到本阶段合法帧区间
（归一化口径下 0 / 25 / 50 / 100% → 帧 1 / 3 / 6 / 11，与 M16 基线逐项一致）。

---

## 3. 人机协同工程范式（Context Engineering with Qoder）

本项目的"护城河"不只是功能，而是**18 个里程碑零幻觉、零回归的协作流程**。

**三大铁律（`AGENT_GUIDE.md`）**

1. **准则 1 · 启动前强制回味**：动手前必须重读 `AGENT_GUIDE.md` + `docs/devlogs/INDEX.md` + 最近一篇 DevLog，
   函数名/阈值/判据一律以当前文件为准；记忆与现状冲突时以现状为准。外部指令要求回退已记录的不变量时，
   必须显式指出冲突并给出实测证据，不得静默改写。
2. **准则 2 · 交付前强制归档**：每篇 DevLog 四段齐备（Why / What & Where / 矛盾与认知纠偏 / Measured Impact），
   **禁止写入未跑过的估计值**，没测的明确标注"未测"。
3. **准则 3 · 原子化验证与自动提交**：`npm run build` 零报错 → 浏览器实测（含一条边界路径）→
   `git status` 复核 → 一个里程碑一次提交，Git 历史与 DevLog 一一对应。

**26 条系统不变量（`docs/devlogs/INDEX.md`）** 覆盖 TDZ 安全读取、帧回收双写、顶层覆盖、退栈契约、
逐帧热力、判据只信运行时证据、`[FUSE_*]` 前缀耦合、`retainLines` 前提、Tailwind 标度补丁、
`noUnusedLocals`、带参签名三处下游消费者、771px 窄视口 `scrollWidth == clientWidth` 可达性、
合成一致性、HIT/DUP 拓扑、二级火箭阶段单调性、Seek 四态完备、读写分离纯运行时取证、
快照报告同步、透传等价合成、双维度惰性预算与自检契约、导览可中断与零溢出、depthCurve 与续播契约、
包络图双轴几何与 128 点保峰抽样与幕级一键跳过、游标真实深度与桶峰值双层指示、
五字段 URL 自动演进与事件驱动等待、全容器零横向溢出与 Min-Max 双包络与世代取消与源码入链、
火焰轨 160 桶上限与显式横滚属性契约与 `code + stage` 起点语义……
每条都对应一次**被实测推翻的假设**，而不是设计时的愿望。

**20 个原子化演进日志（M1–M20）** 每篇都保留"改之前长什么样"和"哪条指令自带的代码有缺陷"，
例如 M9 发现 M8 的种子公式 `max(baseMax, offsets)+1` 在 fib 上会写出错误的 `dp[2] = 2`，
M12 发现负指数熔断后被误判为指数级并推荐救不了它的记忆化，
M19 发现「改了已知的那条溢出」不等于全容器干净——新写的自检第一次真跑就 FAIL 在瓶颈跳转行上，
M20 则发现**自己上一轮给出的根因是错的**：火焰条从 1334 根降到 160 根之后，
「投递后跳幕」的 ~330ms 一毫秒都没少，于是把它从「已解释」降回「未闭合」。

**浏览器端 9 项实时内核自检台**（`Qoder Engineering Spec` → 第 3 页签）
TDZ 闭包 / 熔断前缀 / 递归 A-A′-B / 槽位与交错折半 / 矩阵读写分离 /
窄视口**全量纵向滚动盒**零横向溢出（豁免读显式 `data-scroll-x-owner` 并断言与 legacy 集合相等）/
128 点保峰分桶 / Permalink 哈希解析与清洗（含 `code` 往返与 `code + stage` 共存）/
火焰轨 160 桶虚拟化（长度恒 160、平铺无隙无叠、断点 `repFrame` 精确命中、峰值与热点不丢），
每项输出 PASS 徽章与实测毫秒，夹具不依赖 Worker、网络与 API Key。
评委不必相信文档里的历史数字——可以当场重跑。

---

## 4. 评委 30 秒快速验收指南

1. 点击顶栏 **`Tour`** —— 七幕自动驾驶，覆盖全部 7 个内置预设，全程驱动真实内核（幕内驻留设计合计 22.0s）：
   `ACT 1` 死循环三层熔断与 1334 帧崩溃现场 → `ACT 2` fib 的 `DUP → HIT → 1D dp` 三级火箭与
   `Stage 0/1/2` 全息胶囊 → `ACT 3` `comb(4,2)` 递归树转 `2D Matrix dp` 十字准星与 `WRITES` 徽章 →
   `ACT 4` 自动采纳 `dp[4][2] === 6` 并触发 `→T` 观察点瞬移 →
   `ACT 5` `Min Path Sum` 的 `2D → 1D Rolling Buffer` 空间降维 + `Fast Power` 槽位 1 折半消栈（`65536`）→
   `ACT 6` `Trapping Rain Water` 双指针水柱 + `Binary Search Bounds` 的 `low / mid / high` 区间折半 →
   `ACT 7` 打开 Spec 弹窗点亮 9 项内核自检。
   导览期间诊断跳过 380ms 人工延迟（幕标签到「轨迹 + 判据」齐备实测 12~56ms）。
   点击页面任意处或 `Stop Tour (Act k/7)` 会**暂停到当前幕**，字幕条随即给出
   `Resume Act k/7` / `Restart` / `Dismiss ×`，不必从第一幕重看；
   `Skip Act →` 是幕级取消——**一次点击就进下一幕**，无论这一幕里还有几段 Apply 或驻留，
   而且等待是事件驱动的：轻提交场景从点击到新幕标签实测 **19ms**（M17 需要等一整个轮询周期 977ms）；
   被放弃那一幕的沙箱跑批现在是**直接终止**而不是仅丢弃结果——`Skip Act →` 落在 1334 帧熔断轨迹
   投递之前，五轮 fresh-page 实测 `16 / 17 / 18 / 19 / 21ms` 进 `ACT 2/7` 且重轨迹一次都没上屏；
   落在投递之后仍是 `324 / 332 / 361 / 365 / 370 / 372ms`（M20 已证伪「这是 1334 根火焰条的渲染成本」——
   竖条虚拟化到 160 根后该耗时没变，而 1334 帧单独落地只要 56ms 且零长任务），
   这一情形作为**未闭合边界**保留、不含糊成一个数字。
2. 多阶段重构后看 **Cross-Stage Stack Envelope**：三条栈深曲线（玫红虚线 / 天蓝 / 翠绿）同图叠加，
   用 `X: Abs Frames ⇄ Norm %` 在「按真实帧数占宽」与「铺满同宽比波形」之间切换，
   用 `Y: Linear ⇄ Sqrt` 避免 150 层深递归把 1 层迭代压成直线；点击横轴按当前口径逆映射跳帧。
   曲线由快照自带的 `depthCurve` 绘出（最多 128 点、桶内取最大栈深），因此阶段被 `LAZY` 驱逐也照样完整，
   且峰值仍等于冻结报告的 `Stack Depth`。游标分两层：**实心点 = 这一帧的真实栈深，虚线环 = 所在桶峰值**，
   控制行同时写明 `frame depth 7 (bucket peak 10)`，可与底部火焰轨逐帧对账。
   激活阶段还叠一条 **Min-Max 退栈振幅带**：同一批桶的下沿也存进快照（`depthFloorCurve`），
   把抽样原本会抹平的波谷还原回来（实测 354 帧阶段 256 点多边形、`min-max band 126/128 buckets`）；
   M20 起**非激活阶段也绘带**（`opacity 0.09`，激活阶段 `0.26`），多阶段对比时每个 `LAZY` 阶段的波谷都在。
   底部火焰轨也已不再按帧挂 DOM：**恒 `<= 160` 根竖条**（1334 帧实测 1334 → 160，-88.0%），
   桶内保留真实断点与热点证据，点击跳的是桶内「命中断点的帧，否则最深的帧」。
3. 想看某个现场：WATCH 行点 **`Share`**，`preset / stage / frame / bp / watch / code` 就写进地址栏哈希并可复制链接；
   把 `#preset=pascal-comb&stage=2&frame=6&bp=7&watch=...` 发给同事，打开即自动选中预设、
   **按序真实 Apply 演进到 Stage 2**（实测 484ms 到位、500ms 定位 `FRAME 7 / 17`）、
   L7 断点红点与那几条断言同时就位（断言仍走原有安全闸门，非法预设整体忽略）。
   **自己粘的代码也带得走**：手改源码 / Draft 这类无法靠 `preset + stage` 重建的现场，
   用 UTF-8 安全的 Base64URL 把源码本身放进 `&code=`（上限 1600 字符，超长按 `Link without code` 明说），
   重载后跑的就是那份代码（实测 318 字符哈希把手改 `walk(6)` 现场原样带回 `FRAME 4 / 15` 并给出自己的判据）。
   **M20 起 `code` 与 `stage` 可以同条共存**：手改代码 + 点过 Apply 的多级现场第一次能整条转发——
   此时链接里带的是**演进起点**（`stageHistory[0]` 的源码）而不是屏幕上的合成产物，
   否则首屏会把它当 Stage 0 再多演进两级、跑出根本不存在的 Stage 3。
   实测 `#preset=binary-search&stage=1&frame=0&code=…`（294 字符）重载后
   `Stage 0 (17f)` + `Stage 1 (14f)`、`FRAME 1 / 14` 逐胶囊复现。
4. 点击 **`Qoder Engineering Spec`**：
   `Architecture & Safety Fuse`（架构与契约）· `DevLog [M1-M20]`（演进与实测）·
   `Live Kernel Self-Check (26 Invariants)`（当场重跑 9 项内核回归）。
5. 想看细节：左侧点行号设断点（`b` / `F8` 续跳），底部空格播放、方向键逐帧，
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
| 跨阶段包络图 | fib 三级火箭 3 条曲线（玫红虚线 / 天蓝 / 翠绿加粗）；归一化口径点击 0 / 25 / 50 / 100% → 帧 1 / 3 / 6 / 11，与 M16 基线一致 |
| 横轴绝对刻度 | `X: Abs Frames` 下 467f / 75f / 25f 三阶段实测占宽 `100% / 16% / 5%`；点击 50% 与 100% 仍 clamp 在本阶段末帧（`FRAME 11 / 11`） |
| 纵轴 sqrt 压缩 | `Y: Sqrt` 把峰值 2 的阶段折线顶点从 `y 38.8` 抬到 `y 29.9`，峰值 6 的两条曲线仍钉在 `y 10`，`depthCurve` 与报告数值一字未改 |
| 128 点保峰抽样 | `fib(12)` 三级：`Stage 0 (467f · LAZY)` 绘 **128 点**、峰值 13 == 报告 `Stack Depth 13`；Stage 1 75f / Stage 2 25f 仍 1:1 绘 75 / 25 点 |
| 一键整幕跳过 | ACT 2（含 3 段驻留）内点 **1 次** `Skip Act →` → `ACT 3/7`：驻留期 52ms；等待期由轮询改事件驱动后实测 **19ms**（M17 同路径 977ms） |
| 跳幕取消隔离（M19） | `Skip Act →` 落在 1334 帧熔断轨迹投递**之前**：五轮 fresh-page `18 / 18 / 22 / 26 / 27ms` 进 `ACT 2/7`，重轨迹一次都没上屏；落在投递**之后**（延迟 80 / 90ms 才点）两轮仍 `361 / 370ms`——那笔提交已在渲染队列里，`terminate` 救不了，作为边界保留 |
| 火焰轨 DOM 虚拟化（M20） | `infinite-loop` 1334 帧：竖条 **1334 → 160（-88.0%）**、该行盒子 `4009px → 197px`、`footer 4572/770 → 770/770`、整页元素数 **451**；短轨迹仍 1:1（40/29/10/13/31/13 帧对应同数量竖条）。自检第 9 项断言长度恒 160、平铺 `0..1333` 无隙无叠、断点 `@#777` 的 `repFrame` 恰为 777、峰值 10 与热点 L42 不丢（0.4ms） |
| 投递后跳幕归因复算（M20） | 六轮 `324 / 332 / 361 / 365 / 370 / 372ms`——与 M19 同量级，**虚拟化没有改善它**；对照：1334 帧单独落地 `56ms` 且长任务 0 条、已就位时逐帧步进长任务 0 条。M19 的「1334 根竖条压垮 Commit」归因被推翻，该支耗时**仍未闭合**（投递前五轮 `16 / 17 / 18 / 19 / 21ms` 无回归） |
| 显式横滚契约（M20） | 豁免改读 `data-scroll-x-owner="true"`，并断言标记集合 == legacy class 集合；自检第 6 项 detail `header 770px / 770px · 5 scroll boxes zero overflow (160/160 159/159 438/438 251/251 660/660) · 7 explicit data-scroll-x-owner exempt == legacy #12b set · viewport 770x553`（1.5ms） |
| 全阶段振幅带（M20） | Stage 2 激活时，非激活的 `Stage 0 · 354f · LAZY` 仍绘 256 点带（`fill #f43f5e` / `opacity 0.09`），激活阶段保持 `0.26`；1:1 短轨迹阶段无带、芯片不出现（不造假数据） |
| `code + stage` 组合链接（M20） | 手改 `dbl(6)`（17 帧）Apply 到 Stage 1 → `#preset=binary-search&stage=1&frame=0&code=…`（**294 字符**，两字段共存）；重载后 `Stage 0 (17f)` + `Stage 1 (14f)`、`FRAME 1 / 14`，链接带的是演进**起点**源码而非当前产物 |
| 游标双层指示 | `fib(12)` 467 帧抽样阶段三点读数 7/10、9/10、10/10（第三点无折叠故不出环），芯片写 `frame depth X (bucket peak Y)`，与火焰轨 `54% / 69% / 77%` × 峰值 13 逐一相同 |
| Min-Max 退栈振幅带（M19） | `fib(10)` 的 `Stage 0 (354f · LAZY)` 绘 **256 点**多边形（上沿 128 + 下沿 128），控制行 `min-max band 126/128 buckets`；带由快照 `depthFloorCurve` 直接绘出，未触发重水化。激活阶段切到 83 帧的 1:1 曲线时带整条不出现（不存下沿，也不造假数据） |
| 五字段 URL + 自动演进 | `#preset=pascal-comb&stage=2&frame=6&bp=7&watch=…` 重载后 `boot 284ms → 胶囊 421ms → Stage 2 就绪 484ms → FRAME 7 / 17 定位 500ms`，L7 断点与断言同步就位 |
| 自定义源码入链（M19） | 手改 `walk(6)` 现场导出 `#preset=dp-matrix&frame=3&code=Ly8gTTE5…`（含 `watch` 全长 318 字符），重载后 `FRAME 4 / 15`、代码区可见自己的中文注释、判据 `O(n) Linear Iterative Scan` / `O(1) Scalar Accumulator`；非法哈希 `#preset=not-a-preset&stage=9&frame=-3` 仍整体忽略回默认预设 |
| 导览零延迟 | 幕标签到「轨迹 + 判据」齐备 12~56ms（导览外手动切预设判据滞后 948ms） |
| 七幕全预设 | 整轮实测激活预设集合 7/7（infinite-loop → fib-tree → pascal-comb → dp-matrix → fast-power → rainwater → binary-search），`TOUR COMPLETE · total 36.6s`（定时器限频环境） |
| 导览续播 | ACT 3 中断 → `PAUSED · ACT 3/7` + `Resume Act 3/7`；续播跑到 `TOUR COMPLETE` 且 `8/8 PASS` |
| 内核自检 | 770×553 下 **9/9 PASS**（FAIL 0），逐项毫秒：TDZ 4.6 / Fuse 0.7 / Recursion A-A′-B 0.3 / Halving 0.1 / Matrix 0.0 / Viewport & Container 1.5 / Downsampler 0.0（`500 frames -> 128 points · peak 42`）/ Permalink 0.5（`… bp 5,9 · watch 1 · code 41ch round-trip OK · code+stage=2 coexist OK`）/ Flame 0.4（`1334 frames -> 160 bars · tiled 0..1333 · breakpoint @#777 repFrame exact`）；页签标题 `Live Kernel Self-Check (26 Invariants)` |
| 全容器零横向溢出（M19） | 自检第 6 项枚核实测 `header 770px / 770px · 5 scroll boxes zero overflow (160/160 159/159 438/438 251/251 660/660) · 8 code/x-axis owners exempt by #12b`；AI 面板容器由 `266/251` 修到 `251/251`（首轮 FAIL 的元凶是不可断行的 `[MEMO_INJECTION_TARGET]` 把 `Jump #353` 顶出右沿 5px） |
| 顶栏 | 44px 单行，`scrollWidth == clientWidth == 770`，`Tour` + 两枚轴模式芯片 + `Share` 全部加入后仍零溢出（`footer 770 == 770`、面板 `412 == 412`） |

---

## 6. 已知边界（不做隐藏，写在明面）

- 复杂度判据是**运行时轨迹证据的归因**，不是形式化证明；超出可推导形态时宁可拒绝合成并说明原因。
- `approxBytes` 是 O(1) 抽样外推（1.15 系数），不是真实堆占用；极端异构帧可能高估或低估。
- 非确定性检测基于源码正则，无法覆盖经 helper 间接调用的时间源。
- 大轨迹重水化成本随帧数增长（931 帧实测约 1.7s），期间显示 `RE-HYDRATING` 而非假装零延迟。
- `Live Kernel Self-Check` 使用合成帧夹具，覆盖内核判据但不替代全预设浏览器回归。
- 抽样折线自身的下降沿现已由 **Min-Max 振幅带**还原（每桶下沿存进 `depthFloorCurve`），
  M20 起**激活与非激活阶段都绘**（`0.26` / `0.09` 分层）；`<= 128` 帧的 1:1 曲线不存下沿，此时带整条不出现。
  逐帧精确仍需要帧级曲线；阶段数继续增多时 `0.09` 与面积包络 `0.07` 的层次差是否够用需重估。
- 事件驱动跳幕有两种真实耗时，必须分开报：`Skip Act →` 落在 1334 帧投递**之前**实测 `16~21ms`（五轮），
  落在投递**之后**仍是 `324 / 332 / 361 / 365 / 370 / 372ms`。
  M19 把后者归因于「1334 根火焰条的 Commit 成本」，**M20 已证伪**：竖条虚拟化到恒 160 根后该耗时没变，
  而 1334 帧单独落地只要 56ms 且零长任务、逐帧步进也是零长任务。
  这 ~330ms 的内部占比（Worker 回传 / 诊断 / 下一幕首绘）仍未拆，是 v1.0 唯一带性能标签的敞口。
- URL 的 `stage` 只承诺 1..2 级 Apply 序列；`code`（上限 1600 字符）承载起点源码，M20 起两者**可共存**——
  共存时 `code` 取演进起点而非当前合成产物，超长则明说 `Link without code`，不退回预设原文冒充同一个现场。
  仍未放宽的一处：`bp` 的行号上界按 **Stage 0 起点源码**计算，
  断点若落在 Apply 合成代码新增的行上会被判越界丢弃，这类链接需人工补断点。`API Key` 从不进入 URL 或本地存储。
- AI 面板遥测条的 `537px > 251px` 已在 M19 修掉（徽章折行 + 芯片 `truncate`，弃用横滚退路），
  自检第 6 项也从「只测顶栏」升级为**全量纵向滚动盒枚举**；M20 又把豁免口径从 class 正则
  改为显式 `data-scroll-x-owner="true"`，并断言「标记集合 == legacy class 集合」，
  改类名不再能让豁免静默扩大。
  **但枚举域盲区仍在**：断言只看纵向滚动盒，flex 容器的横向溢出扫不到——
  本轮 footer 的 `4572/770`（1334 根竖条把火焰行撑到 4009px）就是靠降子项数而非靠断言消掉的。
- 火焰轨聚合让细粒度交互退化：`> 160` 帧时一次点击的定位粒度是 8 帧（1334 / 160），
  `repFrame` 只保证「断点优先、否则最深」，不保证等于用户想去的帧；精确逐帧仍走方向键或包络图横轴。
- 剪贴板成功分支未实测：自动化环境没有用户手势，`writeText` 被拒并降级为 `Link in URL`；
  `Copied!` 需在真实点击下复测。
- 导览时长仍只有「定时器被限频的隐藏式视口」口径（实测整轮 36.6s / 续播 31.1s，
  `setTimeout(40ms)` 间隔被拉到 `~1000ms`），可见浏览器下的整轮时长仍未测。

---

## 7. 目录

```
src/core/instrumenter.ts        Babel AST 插桩内核（三层熔断、带参签名、TDZ 安全读取）
src/core/sandboxRunner.ts       Blob Worker 沙箱 + 3000ms 看门狗
src/services/aiDiagnostics.ts   运行时证据判档、等价代码合成、Benchmark 指标
src/App.tsx                     IDE 工作台、时间旅行回放、全息快照栈、评委导览、内核自检台
AGENT_GUIDE.md                  架构契约 + 三大铁律（反幻觉回味 / 强制归档 / 原子化提交）
docs/devlogs/INDEX.md           里程碑索引、26 条系统不变量、实测基线、回归核对表
docs/devlogs/M1..M20-*.md       20 篇原子化演进日志
```
