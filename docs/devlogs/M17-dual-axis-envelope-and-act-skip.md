# M17 · 包络图双轴切换、128 点保峰抽样、一键整幕跳过与全预设导览

Commit：本次提交（`git log -1`）— feat(observability): 完成 Milestone 17 包络图双轴切换、128点保峰抽样、一键整幕跳过与全预设导览

## Why · 背景动机

M16 归档了 6 条遗留，本轮逐条对账后发现它们其实聚成三个根因：

1. **包络图只有一种显示口径，而它要同时回答两个问题**。横轴按各阶段进度归一化，于是 11 帧的
   Stage 2 与 41 帧的 Stage 1 一样长——"横向省时间"这条信息被口径吃掉了；反过来若改成绝对刻度，
   短轨迹就只剩右边一小段，波形形状又没法比。纵轴同理：`depth(400)`（峰值 150 层）与迭代版（峰值 1 层）
   同图时，1 层那条被线性比例压成贴底直线，M16 遗留第 5 条记的就是这件事。
2. **`depthCurve` 逐帧存整数，长轨迹纯粹浪费**。1334 帧就是 1334 个数字，而绘图最多用得上几百个像素；
   抽样早就该做，但 naive 抽样会吞掉峰值——一旦 `max(depthCurve)` 低于报告的 `Stack Depth`，
   图表就与自己冻结的数字打架（不变量 #6/#18a 的精神违背）。
3. **导览的交互颗粒度不对**。`Skip Next →` 只释放一次驻留，ACT 2 含 3 段驻留就得连点 3 次；
   Rain 双指针与 Binary 区间折半两个预设始终不在导览里，"30 秒零点击验收全壁垒"的承诺没有真正闭环。

还有一条产品诉求不属于遗留但同频：评委看完想要"把这个现场发我"——预设、帧号、断言三件事
目前只能靠口头描述。

## What & Where · 核心改动

### 1. 保峰分桶抽样（`src/App.tsx`）

- 新增常量 `MAX_CURVE_SAMPLES = 128`。
- `buildDepthCurve(trace)`：`trace.length <= 128` 时逐帧 1:1；否则输出
  **首帧 + 126 个中间桶的桶内最大栈深 + 末帧**，桶边界用
  `from = 1 + floor(b * span)` / `to = 1 + ceil((b + 1) * span)`（`span = (n-2)/126`），
  保证 `1..n-2` 被无缝覆盖，于是 `Math.max(...depthCurve) === metrics.maxStackDepth`。
- 写入点不变（`snapshotOf` / Draft 冻结 / 重水化回写），`evictBackgroundFrames` 依旧不触碰曲线。

### 2. 包络图双轴模式（`src/App.tsx`）

- 新增状态 `telemetryXMode: 'normalized' | 'absolute'`（默认 **absolute**）、
  `telemetryYMode: 'linear' | 'sqrt'`（默认 linear），面板图例上方两枚芯片
  `X: Abs Frames ⇄` / `X: Norm % ⇄` 与 `Y: Linear ⇄` / `Y: Sqrt ⇄` 一键切换。
- `telemetryMaxFrames = max(stageHistory.frameCount)`；`telemetrySpan(curve) = absolute ? frames / maxFrames : 1`；
  `telemetryX(curve, i)` 与多边形收口都乘上该占比，absolute 模式再画一条虚线标出激活阶段的跨度末端。
- `telemetryY(depth)`：linear 用 `(d-1)/(max-1)`，sqrt 用 `sqrt((d-1)/(max-1))`，
  **只改绘制高度，不改 `depthCurve` / `peak` / 报告里任何数值**（#23a）。
- 曲线索引与帧号正式分成两套坐标系：`curveIndexOf(curve, frameIdx)` 用 `frameCount` 换算，
  游标 `markerCurveIdx`、`markerY`、点击跳帧全部经它，杜绝"把曲线索引当帧号"。
- 点击横轴按当前模式逆映射：`progress = min(1, ratio / span)` → `round(progress * (frames - 1))` →
  再 clamp 到当前轨迹，absolute 模式下点在本阶段跨度之外不会跳到别的阶段。
- 轴标签随模式切换（右端 `100%` ⇄ `${maxFrames}f`），图例追加 `(x% span)`，
  面板标题右侧提示改为 `peak N · 41f axis` / `peak N · 100% axis`。

### 3. 幕级一键跳过（`src/App.tsx`）

- 新增 `tourActSkipRef`，`skipTourAct()` 记下**当前幕号**并释放当前驻留；
  按钮文案 `Skip Next →` → **`Skip Act →`**，`title` 写明"放弃本幕剩下的全部动作"。
- `tourActHalted()` 成为与"令牌失效"同级的让位条件：`tourHold` 立即 settle、
  `tourWaitFor` 退出轮询、幕内每一步 `if (halted()) return`。
- 每一幕开始前 `tourActSkipRef.current = 0`；`pauseJudgeTour` / `dismissJudgeTour` 同样复位，
  避免残留幕号让下一幕一进场就自我让位。
- 跳过最后一幕即进入完成态；Skip 永不退出导览。

### 4. 七幕与全预设覆盖（`src/App.tsx`）

- `TOUR_ACTS` 由 6 条扩为 **7 条**：新 ACT 6 `Two-Pointer Water & Interval Halving`
  （`rainwater` → `binary-search`），自检后移到 ACT 7；每条 `note` 点名本幕负责的预设。
- 七个内置预设 `infinite-loop / fib-tree / pascal-comb / dp-matrix / fast-power / rainwater / binary-search`
  全部进导览；字幕条、顶栏 `Stop Tour (Act k/N)` / `Resume Tour (Act k/N)`、
  完成态 `${TOUR_ACTS.length}-act showcase finished` 一律由 `TOUR_ACTS.length` 驱动，无手写数字。

### 5. URL 现场分享（`src/App.tsx`）

- 模块级 `parseShareHash(raw)` → `{preset, frame, watch[]}`：`URLSearchParams` 解析，
  非法 `preset` 直接返回 `null`（整体忽略，绝不部分采信），`watch` 以 `|` 分隔并截到 4 条（与 Watch 上限一致）。
- 初始 state 由哈希驱动：`selectedPresetId` / `sourceCode` / `watchExprs` 用惰性 `useState` 初始化，
  因此首屏只跑一次沙箱；帧号存进 `pendingShareFrameRef`，等 `frames.length > 0` 的 effect 再定位
  （避免把游标写到不存在的帧上）。
- `handleShareSnapshot()`：`preset / frame(0 基) / watch(URI 编码)` 写进
  `history.replaceState`（不用 `location.hash` 赋值，后者触发锚点滚动顶走视图），
  再 `navigator.clipboard.writeText`；成功显示 `Copied!`（绿色 + Check 图标），
  被拒显示 `Link in URL`（琥珀），1.8s 后复位，且用 `shareResetRef` 清掉上一颗定时器，
  避免连点时旧定时器提前抹掉新反馈。
- 控件放在 `flex-wrap` 的 WATCH 行，不动顶栏预算（#12a / #21c 不受影响）。

### 6. 文档同步

- `INDEX.md`：M16 哈希回填 `db5004a`、M17 行、新增不变量 **#23（a–e）**、
  #22(a)(b)(d)(e) 就地标注"被 M17 改写"（保留 M16 当时的实测口径，不静默覆盖历史证据）、
  #21(d) 的"当前 21"改成按里程碑列出的写法、基线表头改「M17 复测」并新增 12 行 M17 实测、
  闭合 M16 的 5 条遗留并新挂 4 条。
- `AGENT_GUIDE.md`：包络图段改写为双轴 + 抽样口径；导览段改为七幕全预设 + 幕级 Skip；
  新增现场分享条目；尾注 `M1–M17 各一篇，共 23 条不变量`；自检页签计数改 23。
- `README.md`：2.5 节补双轴与保峰抽样；第三节计数 17 里程碑 / 23 不变量 / 17 篇日志；
  第四节评委指南改为七幕 + `Skip Act` + Share；基线表新增 7 行、已知边界新增 4 条。
- `src/App.tsx` Spec 弹窗：新增卡片 `17. Dual-Axis Envelope, Peak Sampling, Act Skip & Permalink`、
  协作日志 M17 条目、DEVLOGS M17 记录（页签标题自动 `[M1-M17]`）；`KERNEL_INVARIANT_COUNT = 23`。

## 矛盾与认知纠偏 · 本里程碑攻克的问题

1. **抽样一旦引入，曲线索引就不再是帧号**
   首版沿用 M16 的 `depths[currentFrameIdx]` 画游标：467 帧阶段跳到第 300 帧时数组越界、
   圆点直接消失；点击跳帧也用 `depths.length` 反算，抽样后只能点出 128 个"帧"。
   补 `curveIndexOf(curve, frameIdx)` 作为唯一换算入口（游标、`markerY`、多边形收口、点击逆映射全走它），
   并让点击以 `frameCount` 而不是曲线长度为映射域。
2. **保峰的关键是"分桶无缝"，不是"取 max"**
   桶边界若用 `round` 或整除，`1..n-2` 里会漏帧；漏掉的恰好是峰值帧时，`max(depthCurve)`
   就低于冻结报告的 `Stack Depth`，图表与自己打架。改成 `floor(b*span)` 起、`ceil((b+1)*span)` 止
   并让首尾帧单列，实测 467 帧阶段绘 128 点、峰值 13 与报告 `Stack Depth 13` 相等。
3. **M16 的"354 点"口径本轮不再成立，但不是回归**
   同一份代码在抽样后绘 128 点。处理方式不是删掉旧数字，而是把 #22(a) 与 Spec 卡片 16
   改写为"M16 当时如此、M17 起按 #23(b) 抽样"，两条证据都留在档案里。
4. **默认口径切换会让历史基线"看起来对不上"**
   absolute 成为默认后，M16 那行 `0 / 25 / 50 / 100% → FRAME 1 / 3 / 6 / 11` 不再由默认口径产生。
   因此本轮把两种口径都重测一遍：Norm % 下读数与 M16 逐项一致，证明口径切换只改显示、不改数据；
   absolute 下的读数与 clamp 单独记录成新行。
5. **一键跳幕必须同时接管"条件等待"**
   只释放驻留的话，ACT 2 两次 Apply 之间的 `tourWaitFor(staged(n))` 仍会跑满轮询；
   把幕级取消做成与令牌失效同级的退出条件后，实测驻留期点击 52ms 进 ACT 3；
   条件等待期点击要等下一个轮询周期（本环境 `setTimeout` 被限频到 ~1s，实测 977ms），
   该延迟归因于测试环境的定时器，不写成逻辑承诺。
6. **取消标识必须复位，否则"瞬跳幕"**
   `tourActSkipRef` 若不在每幕开始前归零，残留的幕号 2 会让 ACT 2 一进场就满足
   `skip === actRef`，表现为导览自己一路跳到末尾；`pause` / `dismiss` 同样要归零，
   否则 Resume 回来的那一幕也已经是"被跳过"状态。
7. **分享链接是外部输入，但不是新的执行面**
   URL 里的 `watch` 只写进断言列表，求值仍只走 `evalWatchExpression` 的三道闸门
   （角色白名单 / 禁 `ident(` / 禁点号引号赋值），越界照旧 `ERROR`；
   非法 `preset`、负 `frame`、超长列表分别整体忽略 / 不预置 / 截到 4 条。
   实测重载后 `FRAME 6 / 13` + 断言回显 `ERROR`（Stage 0 还没有 dp 表），符合 #16e 的诚实反馈契约。
8. **`location.hash` 赋值会顶走视图**
   第一版直接 `window.location.hash = ...`，页面立刻锚点滚动；换成 `history.replaceState` 后
   视口不动，链接照样可分享。剪贴板在无用户手势的自动化环境被 `NotAllowedError` 拒绝，
   按钮按 `Link in URL` 诚实降级——`Copied!` 分支本轮**未实测**，已写进遗留而不是当作已验证。

## Impact · 实测验证指标（770×553 iframe 测试台）

| 场景 | 实测结果 |
| --- | --- |
| 横轴绝对刻度 | fib 三级火箭默认 `X: Abs Frames`：Stage 0 `x 34 → 292.6`（31f / 76% span）、Stage 1 `x 34 → 376`（41f / 100%）、Stage 2 `x 34 → 125.8`（11f / 27%）；轴右端标 `41f`，`svg 388×64` 与容器同宽 |
| 横轴归一化 | 点 `X: Norm % ⇄` 后三条 polyline 末端全部 `x1 376`、轴右端标 `100%`；点击 0 / 25 / 50 / 100% → `FRAME 1 / 3 / 6 / 11`，与 M16 基线逐项一致 |
| 绝对刻度点击逆映射 | 0 → `FRAME 1 / 11`（cx 34.0）、13.4% → `FRAME 6 / 11`（79.9）、26.8% → `FRAME 11 / 11`（125.8）、50% 与 100% → 仍 `FRAME 11 / 11`（超出本阶段占比即 clamp，不越阶段跳帧） |
| 纵轴 sqrt 压缩 | `Y: Sqrt` 下 Stage 2（峰值 2）折线顶点从 `y 38.8` 抬到 `y 29.9`，峰值 6 的 Stage 0/1 仍钉在 `y 10`；曲线数据、图例 peak 与报告数值一字未改 |
| 128 点保峰抽样 | 手写 `fib(12)` 三级：`Stage 0 (467f · LAZY)` 绘 **128 点**，峰值 13 与冻结报告 `Stack Depth 13` 相等；Stage 1 75f / Stage 2 25f 未过阈值仍 1:1 绘 75 / 25 点，占宽 `16% / 5%`，轴右端 `467f` |
| 一键整幕跳过 | ACT 2（3 段驻留 + 2 次 Apply）内**只点 1 次** `Skip Act →` → `ACT 3/7`：驻留期点击后 52ms 到位；条件等待期（已冻结 2 个 Stage）点击在下一个轮询周期到位（限频环境 977ms），导览不退出并继续跑到完成态 |
| 七幕全预设 | MutationObserver 整轮时间线 `20 / 5048 / 12644 / 17634 / 20663 / 28677 / 32648ms`，激活预设集合 7/7：`infinite-loop` → `fib-tree` → `pascal-comb`(×2) → `dp-matrix` → `fast-power` → `rainwater` → `binary-search`，末幕自检；`TOUR COMPLETE · total 36.6s` |
| URL 现场分享 | comb 第 6 帧 + 芯片 `dp[4][2] === 6` 点 `Share` → `#preset=pascal-comb&frame=5&watch=dp%5B4%5D%5B2%5D%20%3D%3D%3D%206`；无手势环境剪贴板被拒，按钮降级显示 `Link in URL` |
| 哈希首屏还原 | 带该哈希重载 → 预设自动选中 `Pascal Comb`、`FRAME 6 / 13`、断言回显且求值为 `ERROR`（Stage 0 无 dp，符合 #16e）；顶栏 44px / `770 == 770` |
| 非法哈希兜底 | `#preset=not-a-preset&frame=-7&watch=` 重载后回落默认 `Trapping Rain Water`（`FRAME 1 / 40`）、断言列表为空、控制台无 error/warn |
| 帧号 ⇄ 曲线索引换算 | absolute 口径下点击 64.37% → `FRAME 300 / 467`，游标落在 `cx 252.1`：`curveIndexOf = round(299/466 × 127) = 81`，而 `34 + 81/127 × 342 = 252.1` 与之吻合，圆点精确坐在新抽样折线上；该点 `cy 13.0` 对应桶内峰值 12（非该帧真实栈深，已列进遗留） |
| 抽样与 1:1 边界 | `Stage 0 (467f · LAZY)` 绘 128 点、`Stage 1 (75f)` 绘 75 点，同一张图里两种粒度共存且不串坐标系 |
| 抽样不变式模糊核对 | 把 `buildDepthCurve` 的算法在 Node 里对 `n = 129..2000` 共 **1872** 个长度、每组随机栈深并随机放置一个 `999` 尖峰跑一遍：曲线长度恒为 128、`max(curve)` 与真实峰值差值恒为 **0**、首末帧数值原样保留，`failures = 0` |
| 全预设主路径 | Rain 40 帧 `O(n) Linear Two-Pointer`、DP 29 帧 `O(M * N) Matrix DP`、Binary 10 帧 `O(log n) Logarithmic Halving`、Fast Power 13 帧 `O(log n) Logarithmic Recursion`、fib 31 帧 `O(2^n) Exponential`（Apply 可见）、comb 13 帧 `O(2^n) Exponential`（Apply 可见）、infinite-loop 1334 帧 `[FUSE_STEP_LIMIT]` |
| 边界路径 | 1334 帧熔断现场上求值 `dp[99][0] === 1` → `ERROR`（不谎报 FALSE）；非法哈希、负帧号、超长 watch 列表三类退化输入均按兜底分支走通 |
| 窄视口零溢出 | 芯片与 Share 全部加入后实测 `header 44px / 770 == 770`、`footer 52px / 770 == 770`、`h-9` 子标题栏 `321 == 321` 与 `448 == 448`、包络面板 `412 == 412`、滚动容器 `438 == 438`、`body 770 == 770` |
| 定时器限频证据 | 顶层页 `document.hidden === true`，`setTimeout(40ms)` 连续间隔实测 `790 / 1000 / 1000 / 1001 / 1000 / 1001ms`，故导览时长仍只能给限频环境值，可见浏览器口径明确标注未测 |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；18 份文档（INDEX + M1–M17）表格列数一致；`KERNEL_INVARIANT_COUNT = 23` 与 INDEX 登记条数一致；控制台无 error/warn |

## 遗留

- 导览时长仍缺"可见浏览器"口径：本环境所有页面 `document.hidden === true`，定时器被限频到 ~1s，
  整轮只能报 36.6s / 续播 31.1s（设计驻留合计 22.0s）。
- 剪贴板成功分支未实测：自动化环境无用户手势，`writeText` 被拒并降级为 `Link in URL`，
  `Copied!` 需在真实点击下复测。
- 抽样后游标圆点画在"所在桶的最大栈深"上，可能高于该帧真实栈深；128 点之外的下降沿被抹平，
  逐帧精确需另存帧级曲线。
- URL 只承载 `preset / frame / watch`，不含 `stageHistory`、断点集合与 API Key，
  打开链接后多阶段链路仍需重新逐次 Apply。
- 条件等待期间的 Skip 让位粒度等于 `tourWaitFor` 的 60ms 轮询周期（限频环境约 1s），
  若要做到字面即时需把等待改成事件驱动（订阅 frames 变化）。
