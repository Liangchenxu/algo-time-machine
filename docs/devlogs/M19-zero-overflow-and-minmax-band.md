# M19 · 全容器零横向溢出治理、保峰保谷 Min-Max 振幅带、跳幕短路取消与自定义源码 URL 分享

Commit：`9e0c81d` — feat(overflow): 完成 Milestone 19 全容器零横向溢出治理、Min-Max双包络带、跳幕取消短路与自定义源码URL分享

## Why · 背景动机

M18 收官时登记了三条「知道但没动」的问题，外加一条评委一定会问的缺口：

1. **零溢出的审计口径漏了一个容器**。M18 把 `overflow-y-auto` 容器全量枚举了一遍，
   发现 AI 面板遥测条内容 `537px` 大于其容器 `251px`，但当时判定「非本里程碑范围」只登记不改。
   登记不等于修好——只要那一行还在用 `overflow-x-auto + whitespace-nowrap`，
   「窄视口零溢出」这条契约就始终有例外，而且例外被 `overflow-y-auto` 静默吸收，肉眼看不见。
2. **ACT 1 跳幕的 304ms 说不清等的是谁**。M18 把等待改成事件驱动，轻提交场景做到 19ms，
   但同一动作在 `infinite-loop` 那一幕要 304ms，且已排除定时器限频。
   「残余来源尚未隔离」是不能收敛的表述——不知道等的是谁，就不知道能不能把它消掉。
3. **128 点抽样把退栈波谷全抹了**。`#23b` 只承诺保峰：每桶取最大栈深，
   于是 354 帧的递归树在图上变成一条只有上沿的锯齿，「压栈 — 退栈 — 再压栈」这件事
   在包络图上彻底看不见。M18 遗留第 5 条写的就是这件事（只修了游标，没修形状）。
4. **手改源码与 Draft 现场出不了门**。M18 的哈希只承载 `preset / stage / frame / bp / watch`，
   而 `stage` 又只承诺「能靠确定性 Apply 复现的 1..2 级」。
   评委把自己的代码粘进 `Edit Code` 调好一屏现场，点 `Share` 拿到的链接打开后是**预设原文**——
   这不是「少带了一个字段」，是链接描述的现场和屏幕上的现场不是同一个。

## What & Where · 核心改动

### 1. 全容器零横向溢出（`src/App.tsx`）

- AI 面板遥测条：`flex items-center … overflow-x-auto no-scrollbar whitespace-nowrap`
  → `flex flex-wrap items-center gap-1.5 min-w-0 max-w-full`，
  每枚芯片由 `shrink-0` 改为 `max-w-full truncate`（`Time / Space / Hotspot / Peak stack / Operator`
  与 `INSPECTING STAGE 0` / `NON-DETERMINISTIC RE-HYDRATION` 两枚状态徽章全部改）。
  徽章**折行而不是撑破容器**，横向滚动条这条退路被彻底拿掉。
- 自检第 6 项改名 `771px Viewport & Container Reachability`：
  不再只测顶栏，而是枚举 `document` 下所有 `clientWidth > 0` 且 `overflowY` 为 `auto|scroll` 的盒，
  逐个断言 `scrollWidth <= clientWidth + 1`。
- 豁免按 **class** 判定（`PRE` / `overflow-x-auto` / `overflow-auto`），
  这些是 `#12b` 指定的横向滚动责任人；**不能按 computed style 判定**——
  CSS 规定另一轴非 `visible` 时 `visible` 会被算成 `auto`，计算值分不出「谁被授权横滚」。
- 新增 `src/App.tsx` 瓶颈跳转行修复：文本块补 `min-w-0`、`[{ins.tag}]` 补 `break-all`、
  `Line {ins.line}` 补 `shrink-0`（原因见「矛盾」第 4 条）。

### 2. 保峰保谷的 Min-Max 振幅带（`src/App.tsx`）

- `buildDepthCurve` 拆成 `buildDepthBands(trace) → { peaks, floors }`：
  同一次分桶同时取桶内最大与最小栈深，`peaks` 就是原来的 `depthCurve`（保峰约束一字未动），
  `<= 128` 帧时上下沿是同一个数组。
- `StageSnapshot` 新增 `depthFloorCurve?: number[]`，**仅在 `trace.length > MAX_CURVE_SAMPLES` 时写入**
  （1:1 曲线不重复存一份）；`makeSnapshot` 与重水化回写两处同源更新，
  与 `frames / frameCount / approxBytes` 保持四元一致（#22a 的延伸）。
- 包络图为**激活阶段**绘制 256 点多边形（上沿顺 + 下沿逆，`opacity 0.26`），
  仅在 `bandBuckets > 0`（本桶真的 `peak > floor`）时出现；控制行回显
  `min-max band N/128 buckets`，`stageCurves` 增加 `floors` 字段供几何计算。

### 3. 跳幕短路：终止在跑的那一批（`src/core/sandboxRunner.ts` + `src/App.tsx`）

- `runInSandbox(sourceCode, onCancel?)`：把 `worker.terminate` 的能力交给调用方，
  统一收口成 `finish(result)`（`settled` 闸门防重复 resolve），
  取消时回 `{ success: false, frames: [], cancelled: true }`——被取消的一跑永远不会 `postMessage`。
  顺手修掉一个既有缺陷：看门狗超时此前**没有** `clearTimeout` 的对手机制，
  现在与 `onmessage` / `onerror` 共用同一个 `finish`。
- `executeCode` 引入世代号 `runGenRef`：开跑前 `runCancelRef.current?.()` 终止上一跑，
  `const gen = ++runGenRef.current`，落地后 `if (runGenRef.current === gen) runCancelRef.current = null`
  （只交还一次取消权，否则会误杀后继那一跑）；
  `res.cancelled || runGenRef.current !== gen` 时返回 `StaleRunOutcome`（`stale: true`），
  **绝不 `setFrames / setAiReport`**；诊断回来后二次判世代，过期同样丢弃。
- `handleApplyOptimized` 见到 `after.stale` 直接 `return`，不冻结阶段——
  过期那一跑不许往全息栈里写半截现场。
- 帧数组这一笔最重的 `setFrames` 包进 `startTransition`，让导览幕标签这类紧急更新不必排队等它渲染。
- `skipTourAct` 除记幕号、释放驻留外，先 `runCancelRef.current?.()` 取消在跑批次。
- `wakeTourWaiters` 的唤醒器由「单个 ref」改为 `Set<() => void>`：
  现在同时有 `waitUntil` 的等待者和 `raceAbort` 的赛跑者挂在上面，单槽会互相覆盖。
- 幕内异步动作改为 `raceAbort(token, liveActionsRef.current.apply())`，
  `Promise.race` 让「令牌失效 / 本幕已跳过」在 Apply 还没跑完时就能让位，每一步之后补 `halted()`。

### 4. 自定义源码入链（`src/App.tsx`）

- 新增 `encodeShareCode` / `decodeShareCode`：UTF-8 安全的 Base64URL
  （`TextEncoder` → 二进制串 → `btoa` → `+ /` 换 `-_`、去尾部 `=`），
  解码侧 `TextDecoder('utf-8', { fatal: true })`，失败或超过 `SHARE_CODE_LIMIT = 1600` 一律返回 `null`。
- `ShareState` 新增 `code: string | null`；`parseShareHash` 里
  **`bp` 的行号上界改用 `(code ?? preset.code)` 的行数**（带源码的现场不能拿预设行数当界）。
- `handleShareSnapshot`：`stageReproducible` 追加 `&& !dirtyEdit`；
  当 `sourceCode !== presetSource && !stageReproducible` 时写入 `code=`，
  超长则不写并置 `codeOmitted` → `shareState = 'partial'` → 按钮显示 `Link without code`
  （新增第四个状态，绝不悄悄退回预设原文冒充同一个现场）。
- 首屏 `useState` 初值改为 `shareBoot?.code ?? shareBoot?.preset.code ?? PRESETS[0].code`，
  解码成功的那份源码直接进沙箱跑。

### 5. 文档与常量

- `KERNEL_INVARIANT_COUNT` 24 → **25**；INDEX 追加 #25（全容器零横向溢出、Min-Max 双包络、
  世代取消与 `code` 字段契约），并给 #23b / #24b / #24c / #24d 打上 M19 指针；
  基线表头改「M19 复测」，新增 7 行 M19 实测；勾选 M18 三条遗留、新开三条 M19 遗留。
- 顺带修一处文档缺陷：`M10` 第 94 行的表格单元格里有两条**未转义的竖线**
  （`` `STACK REDUCTION: … | PEAK STACK: … | TRACE STEPS: …` ``），会把该行切成 4 列，已改为 `\|`。
- `Spec` 弹窗：新增 DEVLOGS `M19` 条目与架构页第 19 张卡片，页签标题自动变 `[M1-M19]` / `(25 Invariants)`。

## 矛盾与认知纠偏

1. **「改了已知的那一条」不等于「全容器干净」**
   遥测条改完 `flex-wrap` 之后，我以为断言会直接绿。第一次真跑它 FAIL 了：
   `266/251`，元凶不是徽章而是**瓶颈跳转行**——`[MEMO_INJECTION_TARGET]` 是一个不可断行的长标签，
   它的 min-content 宽度 166px 把同行按钮 `Jump #353` 顶到容器右沿外 5px。
   同一行在 `Jump #6` / `Jump #9` 时是 `225/225` 正常，因为按钮窄 12px、标签是 `[STACK_GROWTH]`。
   也就是说这条缺陷只在「长标签 + 长轨迹（帧号位数多的按钮）」同时出现时才暴露，
   M18 的漏检不是没测，而是**没测到这个组合**。
2. **min-width 的默认值是 `auto`，这是溢出真正的入口**
   flex 子项默认不能缩到 min-content 以下，所以给文本块 `min-w-0` + 给标签 `break-all`
   才是治本；另一种「看起来也行」的做法（给按钮 `shrink` 或让整行横滚）只是把溢出换个地方藏起来，
   而 `#12b` 明确没授权这一行负责横滚。
3. **304ms 的残余是「已在渲染队列里的那一笔」，不是等待节拍**
   隔离过程是分三步分别试出来的，不是一次改对：
   （a）只加世代号丢弃过期回写 → 延迟几乎没变；
   （b）加 `terminate` + 在 `skipTourAct` 里取消 → 「点击早于投递」降到二十多毫秒；
   （c）把 `setFrames` 标成 `startTransition` → 紧急更新不再排队，
   但**它对这段延迟的单独贡献没有再拆开测**，因此不能把（a）（b）（c）的功劳混算成一条。
4. **同一个动作有两种真实耗时，就必须报两个数**
   Skip 落在 1334 帧投递之前五轮 `18 / 18 / 22 / 26 / 27ms`，且熔断横幅从未出现（重轨迹一次都没上屏）；
   落在投递之后（本轮刻意延迟 80 / 90ms 再点）两轮仍是 `361 / 370ms`。
   后者与 M18 的 `304~330ms` 同量级，说明 M18 测到的其实是「点击晚于投递」这一支。
   **不能写成「ACT 1 跳幕 <30ms」**，也不能因为有一种情况慢就抹掉另一种情况确实变快了。
5. **保峰约束不能因为加了保谷而被稀释**
   `peaks` 的语义与 M17 完全一致，自检第 7 项仍断言「长度恒 128、首尾帧保留、注入 42 必须读出 42」；
   `floors` 是**同一批桶的第二个统计量**，不是新的抽样口径。
   快照体积代价是每阶段最多多 128 个整数，不是重新存帧。
6. **振幅带整条不出现，是正确行为而不是回归**
   把激活阶段切到 Stage 1（83 帧，1:1 曲线）时带消失了：`<= 128` 帧不存下沿，
   `depths.length === floors.length` 不成立，`bandBuckets` 就是 0。
   一开始我把这当成 bug 想找「为什么没画出来」，实际上如果为了「看起来有带」而给 1:1 曲线造假下沿，
   违反的是「没有证据就不画新真相」（#24a 的同一原则）。
7. **只给激活阶段画带是有意的取舍**
   三个阶段各画一条振幅带会糊成一团实心，反而看不清波形。
   代价明说：多阶段对比时非激活阶段仍只有上沿，已进遗留，不是「已经解决」。
8. **`code` 是源码文本，不是可执行权限**
   写进 URL 的第一反应是「这等于把任意代码塞进链接」。实际路径没变：
   `code` 解码后只作为 `sourceCode` 交给 **Worker 沙箱 + 三层熔断**执行，绝不进页面上下文；
   解码失败 / 非法 UTF-8 / 超 1600 字符一律整体丢弃该字段。
   另一个纠偏：`bp` 的行号上界最初仍按 `preset.code` 的行数算，
   带自定义源码时这会把合法行号判成越界——必须按「真正会跑的那份源码」算。
9. **取消必须与世代号成对出现**
   StrictMode 双跑首屏时，第二次 `executeCode` 会终止第一次的 Worker——这是「新的赢」的正确语义。
   但如果只 `terminate` 不判世代，被终止那一跑的错误回调仍可能写回脏 state；
   反过来只判世代不 `terminate`，1334 帧照样要付结构化克隆的钱。两条一起才有 `27 → 18ms` 那个结果。
10. **审计工具本身也要复算**
    本轮把表格列数一致性脚本升级成转义竖线感知版，第一件事就是扫出 `M10` 那行 `'|'` 未转义。
    此前 M18 记录「19 份文档表格列数一致」——脚本没识别 `\|`，那行也没被正确计数，
    是**工具漏检**而不是文档没错。修文档的同时也要修工具口径，否则下一轮还是绿。

## Impact · 实测验证指标（770×553 iframe 测试台）

| 场景 | 实测结果 |
| --- | --- |
| 全容器零溢出 | 自检第 6 项 detail `header 770px / 770px · 5 scroll boxes zero overflow (160/160 159/159 438/438 251/251 660/660) · 8 code/x-axis owners exempt by #12b · viewport 770x553`，耗时 2.3ms；AI 面板容器 `266/251 → 251/251` |
| 溢出 FAIL 复现与定位 | 首轮 FAIL 值 `266/251`；逐层下钻定位到瓶颈跳转行：文本块 min-content 166px + 按钮 71px（`Jump #353`），右沿越过容器 5px；同结构在 `Jump #6` / `Jump #9` 为 `225/225` 正常 |
| Min-Max 振幅带 | `fib(10)` Stage 0（354 帧、`LAZY` 态）绘出 **256 点**多边形（上沿 128 + 下沿 128，`opacity 0.26`），控制行 `min-max band 126/128 buckets`；带完全由快照 `depthFloorCurve` 绘出，未触发重水化 |
| 带缺席的正确性 | 激活阶段切 Stage 1（83 帧 1:1 曲线）时带与芯片整条不出现（`bandBuckets = 0`），符合「不造假数据」；Stage 0 图例仍显示 `peak 11 · 354f · LAZY` |
| 跳幕取消（投递前） | 五轮 fresh-page：`18 / 18 / 22 / 26 / 27ms` 进 `ACT 2/7`，熔断横幅在点击时刻与推进之后均未出现，1334 帧一次都没上屏 |
| 跳幕取消（投递后） | 延迟 80 / 90ms 再点击两轮仍 `361 / 370ms`，与 M18 的 `304~330ms` 同量级；这一支未消除，作为边界登记 |
| 自定义源码链接导出 | 手改 `walk(6)`（15 帧）→ `#preset=dp-matrix&frame=3&code=Ly8gTTE5…`（含 `watch` 全长 **318 字符**），按钮 `Link in URL`（无手势剪贴板被拒，`Copied!` 分支仍未实测） |
| 自定义源码链接还原 | 带哈希重载 → `FRAME 4 / 15`、代码区首行 `// M19 自定义分享现场：手写 walk(6) 线性扫描`、判据 `O(n) Linear Iterative Scan` / `O(1) Scalar Accumulator`、热点 L4（6x）、峰值栈深 2 |
| 纯 bp 链接还原 | `#preset=pascal-comb&frame=0&bp=7&watch=dp%5B4%5D%5B2%5D%3D%3D%3D6` 重载后 L7 标题 `Remove breakpoint at L7`、`FRAME 1 / 13`、断言原样回显 |
| 非法哈希兜底 | `#preset=not-a-preset&stage=9&frame=-3&bp=0,-2&watch=x` 重载后整体忽略：回落默认 Rain（`FRAME 1 / 40`）、断点集合为空 |
| 8 项内核自检 | 页签 `Live Kernel Self-Check (25 Invariants)`，**8/8 PASS**（FAIL 0），逐项毫秒 `TDZ 10.1 / Fuse 0.6 / Recursion 0.2 / Halving 0.2 / Matrix 0.1 / Viewport 2.3 / Downsampler 0.2 / Permalink 0.7` |
| 自检第 7 / 8 项 detail | `500 frames -> 128 points · peak 42 (injected 42 @ #333) · first 2 · last 2`；`preset pascal-comb · stage 2 · frame 6 · bp 5,9 · watch 1 · code 41ch round-trip OK, oversize+corrupt rejected` |
| 预设主路径 | Rain 40 帧 Two-Pointer（L9 11x）、DP 29 帧 Matrix DP（L14 6x）、Binary 10 帧 Logarithmic Halving、Fast Power 13 帧（栈深 7、L2 6x）、fib 31 帧 `O(2^n)`（栈深 6、L2 15x）、comb 13 帧 `O(2^n)`（栈深 5、L2 11x）、infinite-loop 1334 帧 `[FUSE_STEP_LIMIT]`（L5 666x） |
| 边界路径 | 越界断言 `dp[99][0] === 1` → `ERROR`（不谎报 FALSE） |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；转义竖线感知版脚本复算 20 份文档（INDEX + M1–M19）表格列数一致，并据此修掉 `M10` 一处未转义竖线；`KERNEL_INVARIANT_COUNT = 25` 与 INDEX 登记条数一致；重载后控制台无新增 error/warn |

> 未测项显式标注：`Copied!`（剪贴板成功）分支、可见浏览器口径的导览整轮时长、
> `startTransition` 对跳幕延迟的单独贡献、非激活阶段的振幅带（设计上未实现）——均进遗留，不写成已验证。

## 遗留

- Skip 落在 1334 帧投递**之后**仍是 `361 / 370ms`：那一笔提交已在渲染队列里，
  `terminate` 与世代号都救不了；`startTransition` 对这段延迟的单独贡献未再拆开测量。
- Min-Max 振幅带只给**激活阶段**画：多阶段对比时非激活阶段仍只有保峰上沿，其退栈波谷不可见。
- 带 `code` 的链接只承诺源码可复现，不承诺 `stageHistory`：手改源码 + 已 Apply 过的多级现场
  仍只能二选一（`needsCode = sourceCode !== presetSource && !stageReproducible`），同时满足时优先走 `stage`。
- 剪贴板 `Copied!` 分支仍未实测：本环境无用户手势，`writeText` 被拒并降级 `Link in URL`，需真实点击复测。
- 导览时长仍只有隐藏式视口口径（M17 记录 `setTimeout(40ms)` 间隔 ~1000ms），可见浏览器整轮时长未测。
- 自检第 6 项的豁免集合按 class 正则匹配，`PRE` 等选择器一旦改名，豁免会**静默扩大到横滚容器之外**；
  目前靠 detail 里回显 `N code/x-axis owners exempt` 供人工核对，尚未做成断言。
