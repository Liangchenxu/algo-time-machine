# M20 · 火焰轨 160 桶 DOM 虚拟化、显式横滚契约、`code + stage` 组合演进与 9 项自检（v1.0 封盘）

Commit：`d81e6c1` — feat(v1-seal): 完成 Milestone 20 火焰图160桶DOM虚拟化、显式横滚契约、code+stage组合演进与9项自检

## Why · 背景动机

M19 收官时把「ACT 1 跳幕」拆成了两支：投递前 `18~27ms`、投递后 `361~370ms`，
并留下一句「那一笔已在渲染队列里，取消救不了」。这句话当时是**带假设的**——
假设的对象是底部火焰轨：它对 `frames` 做 1:1 的 `.map()`，1334 帧就挂 1334 个真实 DOM 节点。
M20 的任务就是把这条假设**验证到死**，顺带清掉 M19 剩下三条口子：

1. **1334 根竖条既可能是性能包袱，也可能是可达性包袱**。测试台实测该行盒子宽 `4009px`
   而视口只有 `770px`——如果竖条数与帧数成正比，那么第 190 帧之后的火焰条**根本不在屏幕上**，
   评委点不到它们。这一条 M19 的全量溢出审计没抓到，原因见「矛盾」第 3 条。
2. **横滚豁免按 class 正则匹配**。M19 登记的风险是「`PRE` / `overflow-x-auto` 一旦改名，
   豁免会静默扩大到横滚容器之外」——这是把契约的实现细节当成了契约本身。
3. **Min-Max 振幅带只给激活阶段画**。多阶段同图对比时，非激活阶段仍只有保峰上沿，
   「递归塌陷」在 Stage 0 上又看不见了一次。
4. **`code` 与 `stage` 互斥**。评委粘自己的代码、点过 Apply 之后，链接只能二选一：
   要么退化成预设原文 + 演进级数，要么丢掉整个多阶段现场。
5. **两条新契约没有活体证据**：160 桶聚合是否吞断点、`code` 与 `stage` 能否共存解析，
   自检台（8 项）都还测不到。

## What & Where · 核心改动

### 1. 火焰轨 160 桶 DOM 虚拟化（`src/App.tsx`）

- 新常量 `MAX_FLAME_BARS = 160`；新纯函数
  `buildFlameBuckets(frames, breakpoints, hotspotLine, currentFrameIdx = -1): FlameBucket[]`。
- `<= 160` 帧逐帧 1:1（`startFrame === endFrame === repFrame === idx`）；
  超过时切成**恒 160 个桶**，边界取 `startFrame = floor(b * n / 160)`、
  `endFrame = floor((b + 1) * n / 160) - 1`，可证 `n >= 160` 时桶宽 `>= floor(n/160) >= 1`，
  因此**永不为空**且相邻桶严格首尾相接（`start_{b+1} === end_b + 1`）。
- 每桶记录 `startFrame / endFrame / repFrame / maxDepth / hasBreakpoint / hasHotspot / active`：
  `maxDepth` 取桶内真实最大栈深，`hasBreakpoint` / `hasHotspot` 取「桶内**任一**帧命中」，
  `repFrame` **优先取桶内第一个命中断点的帧**，没有断点才取栈深最大的帧（`>` 比较，同深时取最早帧）。
- 火焰轨 JSX 由 `frames.map(...)` 改为 `flameBuckets.map(...)`（`flameBuckets` 走 `useMemo`），
  点击与拖拽（`onMouseEnter` + `e.buttons === 1`）都跳 `b.repFrame` 而不是 `b.startFrame`；
  断点标记条件由「该帧命中」改为「该桶命中」，当前帧高亮由 `idx === currentFrameIdx`
  改为 `b.active`（即当前帧落在桶区间内）。竖条 `title` 回显
  `Frames a-b · peak depth d → #repFrame`，聚合口径对用户可见。
- 包裹层补 `min-w-0`，与虚拟化合起来把 footer 的横向溢出彻底消掉（见「矛盾」第 3 条）。

### 2. 显式横滚属性契约（`src/App.tsx`）

- `#12b` 授权的横向滚动容器逐个标注 `data-scroll-x-owner="true"`：
  预设切换器、琥珀色横幅行、代码外层 `overflow-auto`、调用树图例行、AST 轨道条、
  曲线芯片行、`h-9` 子标题栏、翡翠色横幅、终端 `PRE`、Spec 页签栏。
- 自检第 6 项（`771px Viewport & Container Reachability`）豁免改为
  `el.hasAttribute('data-scroll-x-owner')`；**同时**保留 legacy class 规则
  （`PRE` / `overflow-x-auto` / `overflow-auto`）作为对照集合，
  并新增断言 `marked === legacy`，不等时 detail 直接回显
  `owner drift: N marked vs M per #12b class rule` 并 FAIL。
- 保留「不用 computed style 判定」的既有理由（CSS 规定另一轴非 `visible` 时 `visible` 会算成 `auto`）。

### 3. 全阶段 Min-Max 振幅带（`src/App.tsx`）

- 抽出 `bandOf(curve)`：任一桶 `peak > floor` 才产出 256 点串（上沿顺 + 下沿逆），
  否则空串；`stageBands` 对**全部**阶段求带并过滤掉空串。
- 绘制时 `opacity = b.active ? 0.26 : 0.09`——激活阶段与 M19 完全一致，非激活阶段压到 0.09。
- `min-max band N/128 buckets` 芯片语义不变（仍只报**激活**阶段的折叠桶数），
  1:1 阶段无下沿 → 无带 → 芯片不出现，未引入任何假数据。

### 4. `code + stage` 组合演进（`src/App.tsx`）

- `handleShareSnapshot`：`stage` 的导出条件不变（`stageHistory.length > 1 && 1 <= activeStage <= 2 && !dirtyEdit`），
  但源码字段改为
  `shareSource = stageReproducible ? stageHistory[0].sourceCode : sourceCode`，
  `needsCode = shareSource !== presetSource`——**带演进级数时带的是起点源码，不是屏幕上的合成产物**。
  超过 `SHARE_CODE_LIMIT = 1600` 仍按 `partial` 显示 `Link without code`。
- 还原侧零新增代码：`sourceCode` 初值已是 `shareBoot?.code ?? preset.code`，
  首屏 effect 先等这一跑落地（`frames.length > 0 && !isAnalyzing`）再按序真实 `apply()`，
  某级不涨级即停止（#24b 继续生效）。
- `parseShareHash` 本就逐字段独立校验，`code` 与 `stage` 天然可共存，无需放宽任何闸门。

### 5. 自检台第 9 项与常量（`src/App.tsx`）

- 新增 `Flamegraph 160-Bar DOM Virtualizer`：自建 1334 帧夹具（栈深 `1 + (i*7) % 10` 在 1..10 反复折叠，
  **第 777 帧放在热点行 42** 并以 `breakpoints = {42}` 注入断点），断言四件事：
  输出长度恒 160、桶平铺 `0..1333` 无隙无叠、含断点桶的 `repFrame` **恰好等于 777**、
  峰值 `max(maxDepth) === 10` 与热点行不丢失。
- 第 8 项 `Permalink Hash Parser & Sanitizer` 增加 `#preset=fib-tree&stage=2&code=…` 的**共存解析**断言。
- `KERNEL_INVARIANT_COUNT` 25 → **26**；Spec 页签标题随之变为 `(26 Invariants)`。

### 6. 文档与哈希回填

- INDEX / M19 DevLog / `App.tsx` DEVLOGS 三处 M19 标识统一回填 `9e0c81d`。
- INDEX 追加 **#26**（火焰轨桶数上限、显式横滚、全阶段带、`code+stage` 起点语义、度量纪律），
  并给 #25a / #25b / #25c / #25d 打上 M20 修订指针；勾选 M19 三条遗留、新开四条 M20 遗留；
  基线表头改「M20 复测」并新增 8 行实测。
- 新建本 DevLog；`AGENT_GUIDE.md`、`README.md` 同步 `[M1-M20]` / 26 条 / 9 项自检。

## 矛盾与认知纠偏

1. **被验证的假设是错的，而且错得有价值**
   指令给的根因是「1334 个真实 DOM 节点造成 Layout/Commit 阻塞，因此投递后跳幕要 361ms」。
   节点数这条**属实**（实测该行 `children.length === 1334`、盒子 `4009px`），
   但用它解释 361ms **不成立**：虚拟化后竖条恒 160、整页元素数降到 451，
   而投递后跳幕六轮实测 `324 / 332 / 361 / 365 / 370 / 372ms`——与 M19 的 `361 / 370ms` 同量级，没动。
   对照实验进一步排除渲染成本：单独把 1334 帧那一跑落到 `FRAME 1 / 1334` 只要 **56ms 且零条长任务**，
   在已就位的 1334 帧轨迹上按方向键逐帧步进也是**零条长任务**。
   所以 160 桶该做（DOM -88.0%、顺带消除一个真实溢出），但它不是那 330ms 的原因。
2. **「改了 A 就应该让 B 变快」是归因过窄，不是工程结论**
   M19 写下「那一笔已在渲染队列里」时，只证明了「取消救不了它」，并没有证明「它是渲染」。
   本轮把这句话从推断降回未证实，并在 #26e 里把它写成度量纪律的一部分：
   **假设被自己的实验推翻时，报告推翻而不是报告改动**。
3. **M19 的全量溢出审计有一个结构性盲区**
   footer 的 `scrollWidth 4572 / clientWidth 770` 意味着 1334 根竖条里有 **3572px 在视口外**，
   而自检第 6 项当时扫不到它——断言只枚举 `overflowY` 为 `auto|scroll` 的盒子，
   footer 是 `flex` 容器、`overflow` 为 `visible`，`body / documentElement` 又实测 `770/770`（被视口裁掉，不产生页面滚动条）。
   这一条不是「断言写错了」，而是**断言的枚举范围与溢出的真实成因不同域**：
   flex 子项 `flex-1 + min-w-[2px]` 会把父容器的 min-content 撑爆，而这类容器根本不该被允许横滚。
   修法选择**降低子项数量**（160）而不是扩大扫描面，因为它同时解决性能、溢出与可达性三件事。
4. **可达性回归是可点的，不是可看的**
   溢出修好前，1334 帧现场里大约只有前 190 帧的竖条落在视口内，其余点不到；
   这不是「不好看」而是**功能缺失**。改完后行盒子 197px 全在视口内，160 根都可点。
5. **豁免口径迁移不能靠「两个都算」**
   最省事的实现是「属性**或** class 命中就豁免」，但那样 class 改名的风险一分没减，
   只是多了一个豁免入口。最终实现要求两个集合**相等**，
   于是「加了横滚容器却忘了标记」和「改名导致豁免漂走」都会当场 FAIL（实测 7 == 7）。
6. **`code` 带「当前源码」会跑出根本不存在的 Stage 3**
   第一版直觉是 `code = sourceCode`。可一旦同时带 `stage=2`，
   首屏就会把**已经 Apply 过两次的合成产物**当作 Stage 0，再演进两级——现场比原来多两级火箭。
   正确取值是 `stageHistory[0].sourceCode`：链接的语义是「从这个起点，Apply N 次」。
   实测自定义 `dbl(6)`（Stage 0 · 17f）+ Apply（Stage 1 · 14f）经 294 字符链接重载后逐胶囊复现。
7. **夹具失真比缺测更危险**
   第 9 项第一版把行号塞进了 `mk(i, callStack, line)` 的第三个参数——但
   `buildSelfCheckFrame(frameIndex, callStack, variables)` 的 `line` 是写死的 `1`，
   于是断点与热点两个条件在夹具里永远不成立，测出来的「保留」毫无意义。
   改为自建带 `line` 的 `TraceFrame` 后断言才开始真跑（也顺手暴露了 `repFrame` 必须优先断点帧这条语义值得断言）。
8. **带降到 0.09 会不会糊成一团，要靠看而不是靠怕**
   M19 之所以只画激活阶段，怕的是「三条带叠成实心」。本轮把非激活压到 0.09 后实测：
   `Stage 0` 的 256 点带（`#f43f5e` / 0.09）与自身面积包络（0.07）、其余阶段折线仍可区分。
   风险登记没有取消——层次是靠透明度差维持的，将来若再加阶段数需要重估。
9. **StrictMode 与世代号的既有契约未受影响**
   虚拟化只改渲染层，不触碰 `runGenRef` / `runCancelRef`；
   `flameBuckets` 的 `useMemo` 依赖 `frames / breakpoints / hotspotLine / currentFrameIdx`，
   放在组件顶层无早退分支处，Hook 顺序稳定（已复核该区间无 `return`）。

## Impact · 实测验证指标（770×553 iframe 测试台）

| 场景 | 实测结果 |
| --- | --- |
| 火焰轨 DOM | `infinite-loop` 1334 帧：竖条 **1334 → 160（-88.0%）**、行盒子 `4009px → 197px`、`footer 4572/770 → 770/770`、整页元素数 **451**；桶 title 首根 `Frames 1-8 · peak depth 1 → #0`、末根 `Frames 1326-1334 · peak depth 1 → #1325`（平铺覆盖整条轨迹） |
| 短轨迹 1:1 保持 | Rain 40 帧 40 条、DP 29 帧 29 条、Binary 10 帧 10 条、Fast Power 13 帧 13 条、fib 31 帧 31 条、comb 13 帧 13 条（`<= 160` 不聚合） |
| 投递后跳幕（假设检验） | 六轮 `324 / 332 / 361 / 365 / 370 / 372ms`——与 M19 `361 / 370ms` 同量级，**未改善**；`longtask` 探针显示点击后 6ms 起一个 285~294ms 阻塞任务 |
| 对照实验（排除渲染成本） | 单独把 1334 帧落到 `FRAME 1 / 1334` 实测 **56ms、长任务 0 条**；已就位 1334 帧时 `ArrowRight` 逐帧步进 **长任务 0 条**（10 帧轨迹亦 0 条）。结论：M19 的「1334 根竖条压垮 Commit」归因被推翻，该支耗时仍未闭合 |
| 投递前跳幕（无回归） | 五轮 fresh-page `16 / 17 / 18 / 19 / 21ms` 进 `ACT 2/7`，熔断横幅在点击时刻与推进之后均未出现 |
| 显式横滚契约 | 自检第 6 项 detail `header 770px / 770px · 5 scroll boxes zero overflow (160/160 159/159 438/438 251/251 660/660) · 7 explicit data-scroll-x-owner exempt == legacy #12b set · viewport 770x553`，耗时 1.5ms；标记数 != legacy 命中数即 FAIL 并回显两侧计数 |
| 全阶段振幅带 | `fib(10)` 演到 Stage 2 激活时，非激活 `Stage 0 peak 11 · 354f · LAZY` 绘出 256 点带（`fill #f43f5e`、`opacity 0.09`），激活阶段保持 `0.26`，面积包络仍 `0.18 / 0.07`；激活阶段为 21 帧 1:1 曲线时无带、芯片不出现 |
| `code + stage` 组合 | 手改 `dbl(6)`（17 帧）Apply 至 Stage 1 → `#preset=binary-search&stage=1&frame=0&code=Ly8gTTIw…`（**294 字符**，两字段共存）；重载后 `Stage 0 (17f)` + `Stage 1 (14f)`、`FRAME 1 / 14`、源码区为合成产物而 Stage 0 胶囊仍是自定义起点 |
| 9 项内核自检 | 页签 `Live Kernel Self-Check (26 Invariants)`，实测 **9/9 PASS**（FAIL 0），逐项毫秒 `TDZ 4.6 / Fuse 0.7 / Recursion 0.3 / Halving 0.1 / Matrix 0.0 / Viewport 1.5 / Downsampler 0.0 / Permalink 0.5 / Flame 0.4` |
| 第 9 项 detail | `1334 frames -> 160 bars (cap 160) · tiled 0..1333 with no gap or overlap · breakpoint @#777 kept in 1 bucket(s) and repFrame lands exactly on it · peak depth 10 (real 10) · hotspot L42 kept` |
| 第 8 项 detail | `preset pascal-comb · stage 2 · frame 6 · bp 5,9 · watch 1 · code 41ch round-trip OK · code+stage=2 coexist OK · oversize+corrupt rejected` |
| 预设主路径 | Rain 40 帧 Two-Pointer（L9 11x）、DP 29 帧 Matrix DP（L14 6x）、Binary 10 帧 Logarithmic Halving（L2 1x）、Fast Power 13 帧 Logarithmic Recursion（栈深 7、L2 6x）、fib 31 帧 `O(2^n)`（栈深 6、L2 15x）、comb 13 帧 `O(2^n)`（栈深 5、L2 11x）、infinite-loop 1334 帧 `[FUSE_STEP_LIMIT]`（L5 666x） |
| 边界路径 | 越界断言 `dp[99][0] === 1` → `ERROR`（不谎报 FALSE）；非法预设哈希仍整体忽略回默认预设 |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；转义竖线感知脚本复算 `docs/devlogs` 21 份表格列数一致（0 处不匹配）；`KERNEL_INVARIANT_COUNT = 26` 与 INDEX 登记条数（26）一致；footer `770/770`；重载并跑完 1334 帧 + 分享 + 9 项自检后控制台无新增 error/warn |

> 未测项显式标注：投递后跳幕那 ~330ms 的**内部占比拆分**（沙箱回传 / 诊断 / 下一幕首绘各自多少）未测；
> `Copied!`（剪贴板成功）分支仍未实测（本环境无用户手势，`writeText` 被拒降级 `Link in URL`）；
> 可见浏览器口径的导览整轮时长仍未测；`startTransition` 对跳幕延迟的单独贡献仍未拆开测量。

## 遗留

- **投递后跳幕的 ~330ms 阻塞任务尚未定位到具体消费者**：已排除「1334 根火焰条的 Commit」
  （虚拟化后耗时不变、且该 Commit 单独实测 56ms / 零长任务），但 285~294ms 那一条长任务
  内部由谁占据（Worker 结果结构化克隆 / 诊断 / 下一幕首绘）未拆。这是 v1.0 唯一带性能标签的敞口。
- 自检第 6 项仍只枚举纵向滚动盒：flex 容器的横向溢出（本轮的 footer）不在断言范围内，
  是靠虚拟化而非靠断言发现的。是否扩大到「所有 `clientWidth > 0` 且非横滚责任人的盒子」尚未决定——
  扩大可能把设计内的 `overflow-hidden` 裁剪误判成溢出。
- `code + stage` 共存时 `bp` 的行号上界仍按 **Stage 0 起点源码**计算（#25d 未放宽）：
  断点若落在 Apply 合成代码新增的行上会被判越界丢弃，这类链接需人工补断点。
- 桶聚合使细粒度交互退化：`> 160` 帧时一次点击的定位粒度是 8 帧（1334 / 160），
  精确逐帧仍需方向键或包络图横轴点击；`repFrame` 只保证「断点优先、否则最深」，不保证等于用户想去的帧。
- 非激活阶段的带靠 `opacity 0.09` 与面积包络 `0.07` 维持层次差，阶段数继续增加时该差值是否够用需重估。
- 剪贴板 `Copied!` 分支仍未实测；导览整轮时长仍只有隐藏式视口（定时器限频）口径。
