# M18 · 抽样游标真实栈深对齐、全状态 URL 自动演进、零延迟跳幕与 8 项内核自检（v1.0 收官）

Commit：本次提交（`git log -1`）— feat(permalink): 完成 Milestone 18 抽样游标真实栈深对齐、全状态URL自动演进、零延迟跳幕与8项内核自检

## Why · 背景动机

M17 把包络图、抽样与导览都推到了「能用且诚实」，但三条技术遗留都是**同一个动作的代价**：
为了让 1334 帧这种长轨迹便宜，只保留峰值信息。

1. **游标开始与真相不一致**。`depthCurve` 抽样后每点代表约 3.7 帧的桶内最大栈深，
   而 M17 的游标圆点纵坐标取的就是这个桶峰值。实测把游标停在第 140 帧时，
   该帧真实栈深是 7，圆点却画在 10 的高度上——包络形状没错，**当前帧读数错了**。
   更麻烦的是火焰轨就在同一屏底部，它显示的高度是真实深度，两个视图互相打脸。
2. **链接只能分享「一半现场」**。M17 的哈希只有 `preset / frame / watch`，
   评委把 Stage 2 的二维 DP 矩阵发给同事，对方打开后只拿到 Stage 0 的 13 帧，
   还得自己点两次 Apply、再手工补断点。断点集合（`bp`）与阶段（`stage`）根本不在协议里。
3. **跳幕仍受轮询节拍支配**。M17 的幕级取消只在驻留期是瞬时的，条件等待期依赖 60ms 轮询，
   而测试环境里 `setTimeout` 被限频到约 1s，实测一次等待期跳幕要 977ms。
4. **两条新契约没有活体证据**。抽样保峰（#23b）与哈希解析（#23e）都是 M17 才立的规矩，
   自检台还停在 M14 的 6 项，评委当场无法重跑这两条。

## What & Where · 核心改动

### 1. 游标双层指示（`src/App.tsx`）

- `markerExactDepth = frames[markerFrame]?.callStack.length ?? markerBucketDepth`：
  实心圆点只能画在**这一帧的真实栈深**上；`?? 桶峰值` 的回落只发生在激活阶段已被 `LAZY` 驱逐、
  手里没有帧的情况（没有证据就不画新真相）。
- `markerBucketDepth = activeCurve.depths[markerCurveIdx]`：桶峰值改由一枚
  `dash 1.6 1.4` 的**空心环**表示，并在 `markerPeakY` 与 `markerY` 之间补一段竖向细线。
- `markerFolded = bucketDepth > exactDepth` 时才出环、才显示状态芯片
  `frame depth {X} (bucket peak {Y})`（放在面板控制行，随行 `flex-wrap`，不动顶栏预算 #21c）。
- 抽样折线本身一字未改：`MAX_CURVE_SAMPLES = 128`、保峰分桶与 `curveIndexOf` 换算仍是 #23b 的契约。

### 2. 五字段 URL 与首屏自动演进（`src/App.tsx`）

- `ShareState` 扩为 `{preset, stage, frame, bp, watch}`；`parseShareHash`：
  `stage` 只接受 `1..2`，`bp` 过滤正整数、`Set` 去重、升序、截到 `SHARE_BP_LIMIT = 16`
  且**不得越过该预设源码行数**（`preset.code.split('\n').length`），非法 `preset` 依旧整体返回 `null`。
- `handleShareSnapshot`：`stageHistory.length > 1 && activeStage >= 1 && activeStage <= 2` 才写 `stage`，
  `breakpoints.size > 0` 才写 `bp`；仍用 `history.replaceState` 写入，剪贴板失败显示 `Link in URL`。
- 首屏演进：`pendingShareStageRef` + `shareBootstrapStartedRef`（StrictMode 只允许一趟真跑，cleanup 不做反向取消），
  等 Stage 0 轨迹就绪后**按序真实调用 `handleApplyOptimized`**，每级用事件驱动 `waitUntil` 确认
  `stageHistory.length >= step + 1`；某级不涨级就停在那里，绝不伪造阶段。
- `autoEvolveRef` 让 `executeCode` 在演进期间也传 `skipDelay=true`（与导览同一零延迟通道）。
- 帧号 effect 增加门禁：`pendingShareStageRef.current !== null` 时不动游标；演进结束后
  由演进流程自己按**当时**的帧数 clamp 定位，避免「先在 Stage 0 的 13 帧上闪一下」。

### 3. 事件驱动等待（`src/App.tsx`）

- 新增 `tourWakeRef` + `wakeTourWaiters()`；`waitUntil(cond, timeoutMs, abort)` 把「等」实现成
  一次性唤醒器注册，**每次 React 提交后**由 `useEffect(() => wakeTourWaiters())` 唤醒，
  `skipTourAct` / `pauseJudgeTour` / `dismissJudgeTour` 也直接唤醒；500ms 定时器只作兜底节拍。
- `tourWaitFor` 复用 `waitUntil`，让位条件仍是 `tourTokenRef` 失效、幕级取消与真实运行信号（#21b 不变）。

### 4. 自检台 6 项 → 8 项（`src/App.tsx` `runKernelSelfCheck`）

- 第 7 项 `Peak-Preserving 128-Bucket Downsampler`：造 500 帧合成轨迹、在第 333 帧注入栈深 42，
  断言 `curve.length === 128`、首尾帧数值原样保留、`Math.max(...curve) === 42`。
- 第 8 项 `Permalink Hash Parser & Sanitizer`：断言
  `#preset=pascal-comb&stage=2&frame=6&bp=5,9&watch=dp[4][2]===6` 解析出五个字段，
  且 `#preset=invalid` 返回 `null`。
- 两项都是纯内存夹具（不经 Worker、不发网络、不需要 API Key），`KERNEL_INVARIANT_COUNT` 升至 **24**。

### 5. 文档同步

- `INDEX.md`：M17 哈希回填 `7a3b96a`、M18 行、新增不变量 **#24（a–d）**、
  #23(b)/(e) 与 #20(e) 就地标注被 M18 扩展（原约束继续生效）、闭合 M17 的 3 条技术遗留并新挂 2 条、
  基线表头改「M18 复测」并新增 10 行 M18 实测。
- `AGENT_GUIDE.md`：包络图段补「真实深度 + 桶峰值」双层游标；自检计数改 8 项 / 24 条；
  Permalink 条目扩到五字段 + 自动演进；导览条目写清事件驱动等待与 19ms / 304ms 边界。
- `README.md`：2.5 节双层游标、第 3 节计数（18 里程碑 / 24 不变量 / 18 篇日志）、
  第 4 节链接复现指南、第 5 节新增 M18 基线行、第 6 节新增边界说明。
- `src/App.tsx` Spec 弹窗：卡片 `18.`、协作日志 M18 条目、DEVLOGS M18（页签自动 `[M1-M18]`）。

## 矛盾与认知纠偏 · 本里程碑攻克的问题

1. **「保峰」与「当前帧真相」是两件事**
   M17 的抽样让折线峰值无失真，却被顺手用在了游标上——折线可以代表形状，圆点必须代表这一帧。
   纠正后环与点各司其职：环是「这一桶最高到过哪」，点是「你现在站的这一帧有多深」。
   第三组样本（44% 处 10 == 10）证明未折叠时不会多画任何东西，界面不因新特性变吵。
2. **没有帧就没有真相**
   `LAZY` 阶段手里没有 `frames`，此时若强行"精确"就只能先重水化（破坏零延迟），
   或者画一个凭空的深度。选择回落桶峰值，同时让空心环照旧——**证据缺席时不新增断言**。
3. **`stage` 不能照实导出**
   最直觉的写法是把 `activeStage` 原样写进链接，但 Draft 阶段与第 3 级以后无法靠固定 Apply 序列复现：
   对方打开会演到一个不存在的阶段。因此导出侧限定 `1..2`，解析侧同样拒绝越界值，
   并把「更深历史仍不可分享」写进遗留而不是假装闭环。
4. **`bp` 是外部输入的行号，必须当输入校验**
   直接 `split(',')` 会让 `#bp=0,-2,9999` 把断点写到不存在的行上，火焰轨出现永远命中不了的标记。
   现在过滤正整数、去重、升序、截 16 个，并且**以预设实际行数为上界**——
   这条也顺手成为自检第 8 项的一部分。
5. **演进与帧定位之间有真实依赖，早一步就是错现场**
   帧号 effect 原来只看 `frames.length > 0`，Stage 0 就绪那一刻就把游标按 Stage 2 的帧号钉下去。
   改成演进未清空前不动游标；由于演进完成后不一定再触发一次渲染，末尾直接由演进流程完成定位，
   实测 500ms 落位、无中间闪动。
6. **StrictMode 双跑会把演进推过头**
   首版靠 effect cleanup 取消，结果 dev 下第二次 setup 又跑一遍 Apply，直接超演到不存在的级。
   改为一次性启动闸门 `shareBootstrapStartedRef`，cleanup 不做反向操作。
7. **「<20ms」不能吹成全场景**
   轻提交（ACT 2）等待期跳幕实测 19ms，轮询周期彻底消失；但 ACT 1 等 1334 帧熔断轨迹时仍是
   `304 / 322 / 324 / 330ms`。为排除调度器限频，在同一 iframe 里实测
   `MessageChannel` / `requestAnimationFrame` / `setTimeout(0)` 全部 `0ms`；
   又单独测「点击切到 infinite-loop → 出现 `FRAME 1 / 1334`」只要 `55ms`，
   说明这 300ms **不是**单纯的 1334 帧渲染成本。归因没有隔离出来，就写「尚未隔离」，
   不把它包装成已解释的现象。
8. **审计工具比被审对象更需要复算**
   本轮把 `overflow-y-auto` 容器全量枚举一遍，才发现 AI 面板遥测条内容 `537px` 大于容器 `251px`，
   而该 JSX 自 M17 起未改动——是 M17 的审计口径只点了两三个容器造成的漏检。
   处理方式是不改代码（非本里程碑范围）而是把它如实登记，避免"修好了一个没验证过的东西"。

## Impact · 实测验证指标（770×553 iframe 测试台）

| 场景 | 实测结果 |
| --- | --- |
| 游标双层指示 | `fib(12)` 467 帧抽样阶段：30% → `FRAME 140 / 467`，实心点 `cy 28` + 空心环 `cy 19`（同 `cx 136.3`）+ 芯片 `frame depth 7 (bucket peak 10)`；37% → `FRAME 173` 为 `cy 22 / cy 19`（9 vs 10）；44% → `FRAME 206` 只剩实心点 `cy 19`（10 == 10），环与芯片自动消失 |
| 游标读数互证 | 三个真实深度与火焰轨高度独立对上：`54% / 69% / 77%` × 峰值 13 → `7.02 / 8.97 / 10.01` = 7 / 9 / 10，与芯片读数逐一相同 |
| 五字段链接导出 | comb 演到 Stage 2、第 7 帧、L7 断点、`dp[4][2] === 6` → `#preset=pascal-comb&stage=2&frame=6&bp=7&watch=dp%5B4%5D%5B2%5D%20%3D%3D%3D%206` |
| 首屏自动演进 | 带该哈希重载：`boot 284ms` → Stage 0/1 胶囊 `421ms` → Stage 2 就绪 `484ms` → `FRAME 7 / 17` 定位 `500ms`；落地 3 枚胶囊（13f / 37f / 17f）、`2D Matrix: dp [5×3]`、`Cursor [3][1]`、L7 标题翻为 `Remove breakpoint at L7`、断言 `FALSE`（第 7 帧尚未写入 `dp[4][2]`） |
| 演进不打架 | 演进期间游标不在 Stage 0 上闪动（帧号 effect 门禁生效），且 `stage` / `frame` / `bp` / `watch` 四项互不阻塞地各自就位 |
| 事件驱动跳幕 | ACT 2 条件等待期点一次 `Skip Act →` → `ACT 3/7` 实测 **19ms**（M17 同路径 977ms）；ACT 1 四轮复测 `304 / 322 / 324 / 330ms`，同 iframe `MessageChannel` / `rAF` / `setTimeout(0)` 均 `0ms`，单独切 infinite-loop 到 `FRAME 1 / 1334` 仅 `55ms`，故残余不是调度器限频、也非纯渲染成本，**来源未隔离** |
| 8 项内核自检 | 页签 `Live Kernel Self-Check (24 Invariants)`，实测 **8/8 PASS**（FAIL 0），逐项毫秒 TDZ 9.2 / Fuse 0.8 / Recursion 0.6 / Halving 0.6 / Matrix 0.0 / Viewport 0.8（`header 770px / 770px · viewport 770x553`）/ Downsampler 0.1 / Permalink 0.1；TDZ 冷启动首轮为 16.0ms。两项新增 detail 分别为 `500 frames -> 128 points · peak 42 (injected 42 @ #333) · first 2 · last 2` 与 `preset pascal-comb · stage 2 · frame 6 · bp 5,9 · watch 1` |
| 预设主路径 | DP 29 帧 `O(M * N) Matrix DP`（Apply 可见）、Binary 10 帧 `O(log n) Logarithmic Halving`（Apply 隐藏）、Fast Power 13 帧（Apply 可见）、Rain 40 帧 Two-Pointer（Apply 隐藏）、fib 31 帧 `O(2^n)`（Apply 可见）、infinite-loop 1334 帧 `[FUSE_STEP_LIMIT]` |
| 边界路径 | 越界断言 `dp[99][0] === 1` → `ERROR`（不谎报 FALSE）；非法 `preset` 哈希仍整体忽略回默认预设；`stage=9` / `frame=-3` / `bp=0,-2,9999` 全部被校验拦下（自检第 8 项覆盖） |
| 窄视口零溢出 | `header 44px / 770 == 770`、`footer 52px / 770 == 770`、`h-9` 子标题栏 `321 == 321` 与 `448 == 448`、`body 770 == 770`；另登记既有现象：AI 面板遥测条内容 `537px` > 容器 `251px`，由外层 `overflow-y-auto` 吸收（该 JSX 自 M17 起未改，本轮枚举审计时发现） |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；19 份文档（INDEX + M1–M18）表格列数一致；`KERNEL_INVARIANT_COUNT = 24` 与 INDEX 登记条数一致；控制台无 error/warn |

## 遗留

- `stage` 只承诺 1..2 级：Draft 阶段与更深历史无法靠确定性 Apply 序列复现，链接不承载，打开后仍需手工分叉。
- ACT 1 这类「等待与 1334 帧重提交同批」的跳幕仍是 ~300ms：已排除定时器轮询与调度器限频，
  残余来源（渲染批次 vs 沙箱回传时序）尚未隔离。
- 剪贴板 `Copied!` 分支仍未实测：本环境无用户手势，`writeText` 被拒并降级 `Link in URL`，需真实点击复测。
- 导览时长仍只有隐藏式视口口径（M17 记录 `setTimeout(40ms)` 间隔 ~1000ms），可见浏览器整轮时长未测。
- 抽样折线本身的下降沿仍被抹平（128 点之外不保形），本轮只修游标真相，没有另存帧级曲线。
- AI 面板遥测条（`Time / Space / Hotspot / Peak stack` 那一行）在 770 下内容 `537px` 大于其容器 `251px`，
  靠外层 `overflow-y-auto` 吸收横向溢出。该 JSX 自 M17 起一字未改（`git diff` 复核），
  是本轮把 `overflow-y-auto` 容器全量枚举时才发现的**既有现象**，不在 M18 范围内改动，登记待后续窄视口精修。
- AI 面板遥测条之外的其余 `overflow-y-auto` 容器实测 `[160/160, 159/159, 438/438, 660/660]` 均零溢出，
  说明这条是个例而不是全局布局退化。
