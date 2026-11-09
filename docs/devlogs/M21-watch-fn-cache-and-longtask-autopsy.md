# M21 · Watch 求值函数编译缓存、285~294ms 长任务四段拆测、footer 零溢出断言与 `code + stage` 断点行界对齐（v1.0 终极收官）

Commit：本次提交（`git log -1`）— perf(longtask): 完成 Milestone 21 Watch函数编译缓存、330ms长任务拆解、底栏零溢出断言与v1.0终极收官

## Why · 背景动机

M20 做得最干净的一件事，是把「1334 根火焰条压垮 Commit」这条自己上一轮写下的归因**推翻并登记为未闭合**。
但它只留下了「未闭合」三个字——那 285~294ms 的阻塞长任务里到底是谁在花时间，没有人知道。
一个说不清成分的性能数字，比一个慢但诚实的数字更危险：下一轮任何人都会开始猜它。

同期还挂着两条已登记却没动的口子：

1. **第 6 项溢出断言有结构性盲区**。M19/M20 的枚举域是 `overflowY auto|scroll` 的盒子，
   而 M20 发现的 `footer 4572/770`（1334 根竖条把火焰行撑到 4009px）恰恰不在其中——
   footer 是 `overflow: visible` 的 flex 容器，视口又把它裁了，所以 `body` 实测仍是 `770/770`。
   这一条当时的结论是「靠降子项数解决，不扩扫描面」，但**没扩扫描面不等于盲区已经没了**。
2. **`code + stage` 共存时断点会被误删**。`bp` 的行号上界按 Stage 0 起点源码算，
   而现场最终跑的是 Apply 合成代码——打在合成代码新增行上的断点，复制链接后静默消失。
   这与 #25d 的「链接是完整现场的只读快照」自相矛盾。

## What & Where · 核心改动

### 1. 四段拆测（临时插桩，提交前已全部移除）

拆测方式：在 `runInSandbox`（`instrumentCode` 与 Worker 往返）、`quickWatches` / `matrixWrites` 两个
`useMemo`、`executeCode` 的诊断 `await` 处插 `performance.now()`，汇总到 `globalThis.__mtmPhase` /
`__mtmRender`，配合 harness 侧的 `PerformanceObserver('longtask')` 对齐时间轴。
**探针不进主干**：本轮结束时 `grep -rn "TEMP-M21-PROBE|__mtmPhase|__mtmRender|__mtmFnBuilds" src/` 零命中，
最终耗时表全部来自无探针版本。

基线（1334 帧 `infinite-loop` → ACT 2，Skip 落在投递之后）：

| 阶段 | 实测 |
| --- | --- |
| `instrumentCode`（Babel AST，主线程） | 1.7 ~ 2.4ms |
| Worker 往返（含执行 + 回传结构化克隆） | 26.4 ~ 35.8ms |
| `deriveRuntimeQuickWatches` | 1.3ms（最好）/ 135.4 + 135.1ms（StrictMode 双跑）/ **141ms 单趟** |
| └ 同一趟 `new Function` 编译次数 | **2872**（整窗累计 6060） |
| `runAIDiagnostics`（`skipDelay=true` 通道） | 0.8 ~ 1.5ms |
| `analyzeMatrixWrites` | 0.5 ~ 2.3ms |
| `longtask` | 点击后 6ms 起，持续 280 ~ 293ms |
| Skip → `ACT 2/7` | 321 / 333ms |

**真凶是 Quick-Watch 的逐帧重编译**，不是火焰条 Commit（56ms）、不是诊断（1.5ms）、不是沙箱回传（35.8ms）。
机制在源码里可直接确认：`deriveRuntimeQuickWatches` 对每条候选都跑 `hasTrueFrame`，
后者在 1334 帧上**每帧调用一次 `evalWatchExpression`**，而该函数内部每次都
`new Function(...names, 'return (expr);')`——同一条表达式在一条轨迹里被重复编译上千次。

### 2. Watch 求值函数编译缓存（`src/App.tsx`）

- 新增模块级 `WATCH_FN_CACHE: Map<string, Function>` 与 `WATCH_FN_CACHE_LIMIT = 512`。
- **闸门顺序一字未动**：空表达式 / 字符白名单与点号引号 / 单等号赋值 / 调用形态 / 宿主对象名
  五道检查全部通过后，才允许读写缓存。缓存站在闸门**之后**，不是之前。
- 键为 `` `${trimmed}\u0000${names.join(',')}` ``。形参名序列**必须在键里**：
  `new Function(...names, body)` 的形参表由「这一帧可见的变量名」决定，
  只按表达式缓存会让下一帧把 `dp` 的值按位置塞进前一帧 `n` 的形参——不报错，也不正确。
- 失效策略分两侧：**编译失败不写缓存**（写进去永远跑不起来）；
  **运行期抛错不剔除缓存**（函数合法，只是这一帧缺变量）。
  后者是关键决定：`dp[99][0] === 1` 这类恒定越界的断言在全轨迹扫描里每帧都抛，
  若按「出错就清」处理，它恰好退回本轮要消掉的逐帧重编译。

### 3. 第 6 项纳入 flex chrome（`src/App.tsx`）

- 除原有纵向滚动盒枚外，显式取 `header` / `footer` / 整页根容器（`h-screen`），
  逐个断言 `scrollWidth <= clientWidth + 1`；detail 改为
  `header a/b · footer c/d · N scroll boxes zero overflow …`，两个数字都直接摊开。
- **明确排除 `overflow: hidden` 的容器**：那是设计内的裁剪，纳入断言等于把裁剪当 bug
  （这正是 M20 遗留里「扩大扫描面怕误判」的顾虑，本轮用「具名白名单」而不是「全量」绕开了它）。
- 反证测试：向 `footer` 注入一个 `width: 3800px` 的临时子元素并重跑自检。

### 4. `code + stage` 断点行界两阶段裁剪（`src/App.tsx`）

- 新增 `SHARE_STAGE_BP_FLOOR = 64`；`parseShareHash` 里
  `lineCount = targetStage >= 1 ? Math.max(baseLineCount, SHARE_STAGE_BP_FLOOR) : baseLineCount`。
- 演进落地后按**最终源码**二次过滤：`liveActionsRef` 增加 `sourceCode` 字段（沿用 #21a
  「只读最新渲染」的口径，不新开过期闭包），bootstrap 尾部
  `setBreakpoints(prev => 只保留 1..finalLines)`，集合无变化时返回原引用避免多余提交。
- 两侧都必须成立：放宽但没有二次过滤 = 无界放行；只有二次过滤 = 断点早在解析阶段就被删掉。

### 5. `analyzeMatrixWrites` 短路——实测后否决，未实现

指令建议在「首帧与末帧都没有二维数组变量」时 O(1) 返回空集。这条**没有实现**，理由见「矛盾」第 4 条：
它不成立，而不是它不值。

### 6. 文档与常量

- INDEX 追加 **#27**（闸门后置与键设计、性能声明绑定口径、不为省毫秒删证据、
  flex chrome 断言与反证、断点两阶段裁剪），给 #26d 打 M21 指针，
  闭合 M20 三条遗留、新开三条 M21 遗留，基线表头改「M21 复测」。
- `KERNEL_INVARIANT_COUNT` 26 → **27**；Spec 弹窗新增 DEVLOGS `M21` 条目与架构页第 21 张卡片，
  页签标题自动变 `[M1-M21]` / `(27 Invariants)`；`AGENT_GUIDE.md`、`README.md` 同步。

## 矛盾与认知纠偏

1. **指令给的机制假设，这次是对的——但它指对了函数、指错了调用方**
   「`evalWatchExpression` 每次重新 `new Function`」在源码里确实成立，
   但把它打成 285ms 的不是 `runAIDiagnostics` 内部，而是渲染期的 `deriveRuntimeQuickWatches`
   经 `hasTrueFrame` 触发的全轨迹扫描。若不先拆测、直接照指令去给诊断加缓存，会缓存到次要路径上。
   这就是「先埋点再动手」的价值：同一个函数在两条调用链上的成本差了两个数量级。
2. **同一条 1334 帧轨迹，Quick-Watch 可以是 1.3ms 也可以是 141ms**
   拆测里最省事的一次只编译 21 个函数、1.3ms，最贵的一次编译 2872 个、141ms。
   差别在于候选表达式是否早点命中 TRUE：`hasTrueFrame` 命中即停，恒定 FALSE 的候选要把 1334 帧扫穿。
   教训是**不要用一次采样给一段代码定价**——我第一次在手动切预设的场景里只测到 1.5ms，
   差点把这条路径从嫌疑名单上划掉。
3. **缓存的键必须携带作用域形状，否则是正确性事故而不是性能优化**
   `new Function(...names, body)` 里 `names` 既是形参名也是位置契约。按 `expr` 单键缓存，
   第 0 帧编出 `function(n, dp)`，第 5 帧可见变量变成 `function(i, acc)`，
   复用旧函数就会把 `i` 塞进 `n`——`dp[1][2] === 6` 这种下标断言会安静地给出错误布尔值。
   把 `names.join(',')` 并入键之后，缓存命中数下降了一点，但每个命中都保证形参表逐字一致。
4. **「为省 2ms 而删掉一条判据证据」是本里程碑唯一被我否决的子项**
   `analyzeMatrixWrites` 的首末帧短路在 1334 帧标量轨迹上只值 `0.5~2.3ms`（剩余任务的 1~2%），
   而它的**正确性代价是实的**：二维表可以只存在于中间帧。
   我构造了 `if (n === 6) { let table = [[1,2],[3,4]]; … }` 的样本，
   首帧是函数进入、末帧在 `return` 之后，两者作用域里都没有 `table`，
   但 shipped 代码在 `FRAME 6 / 10` 照样报出 `WRITES: 2`。
   按提案裁剪，这条证据会直接变成空集，而 #16a 判断「只读输入与可变状态表是否同时存在」正依赖它，
   后果是一维滚动压缩的 Offer 莫名消失。**收益不足以支付语义损失，因此保留原实现并在此登记。**
5. **加了断言 ≠ 断言有牙，必须正向反证一次**
   footer 断言写完后我没有直接交付，而是塞了个 3800px 的假子元素进 footer：
   detail 立刻变 `footer 4365/770 · chrome overflow: footer 4365>770`，整台降到 `8/9 PASS`，
   其余八项不受影响。这才说明它守的是 M20 那个真实缺陷，而不是一句漂亮的文档承诺。
6. **反证过程里先踩了自己的解析脚本**
   按扁平文本序列配对「标题 → detail → 毫秒 → 徽章」时，FAIL 被归到了上一行
   （显示成 `Matrix Write Separation FAIL`），而逐行徽章其实各归各位。
   改回「从每个行元素自己的子树里读徽章」才拿到正确归属。
   这与 M19 的 iframe 边框、M20 的未转义竖线是同一类事故：**测量工具出错比被测对象出错更难发现**。
7. **放宽必须配一个对偶收紧**
   `bp` 上界放宽到 64 只是第一步；真正让它成为契约的是演进落地后的二次过滤。
   实测两半都有数据：`bp=18` 在 Stage 0 只有 12 行时仍还原为 `Remove breakpoint at L18`，
   而 `bp=18,63` 里的 63 被最终 20 行源码剔除。只测第一半，这条改动就是无界放行。
8. **性能收益的表述边界**
   缓存后投递后跳幕 `129~141ms`（基线 `321~333ms`），长任务 `123/131ms`（基线 `280~293ms`）。
   但**不能说长任务消失了**：剩下的 ~130ms 是「对 1334 帧逐帧调用已编译函数 + `Object.keys(vars)` +
   数组映射」的固有成本，缓存对此无能为力。文档与 #27b 都按这条线写死措辞。
9. **缓存上限不是 LRU，是一个诚实的粗糙决定**
   `size >= 512` 时整体清空。多阶段 / 多预设长时间会话理论上会一次性丢掉全部已编译函数、
   下一轮重编译。实测暖身后每轮编译 0 次、未观察到抖动，所以没有为它引入 LRU 的复杂度，
   但这条限制进遗留而不是藏起来。
10. **探针必须走，不能留**
    把 `performance.now()` 埋点永久留在渲染路径里，本身就是往被测对象里插管子——
    它会改变 `useMemo` 的形态并让后续每一轮数字都带着观测成本。
    本轮的做法是：带探针版只用于产出占比表，随后全部移除、确认零残留，再用无探针版产出最终耗时表。
    两张表分开标注来源，不合并成一张「看起来都测过」的表。

## Impact · 实测验证指标（770×553 iframe 测试台）

| 场景 | 实测结果 |
| --- | --- |
| 长任务四段占比（带探针基线） | `instrumentCode 1.7~2.4ms` · `Worker 往返含克隆 26.4~35.8ms` · `deriveRuntimeQuickWatches 1.3 / 135.4+135.1 / 141ms`（最差一趟编译 **2872** 个 Function，整窗 **6060**） · `runAIDiagnostics 0.8~1.5ms` · `analyzeMatrixWrites 0.5~2.3ms` · `longtask 280~293ms` · Skip `321 / 333ms` |
| Watch 编译缓存后（无探针，六轮） | 投递后跳幕 `129 / 134 / 134 / 139 / 140 / 141ms`，长任务 `123 / 131ms`；对 M20 基线 `324 / 332 / 361 / 365 / 370 / 372ms` 的均值降幅约 **-61%**；暖身后每轮编译次数 0 |
| 另三轮复采（无探针） | `131 / 135 / 140ms`，长任务 `123 / 131ms`（一轮 40ms 以下未计入） |
| 投递前场景无回归 | 五轮 `16 / 17 / 18 / 19 / 21ms` 进 `ACT 2/7`，熔断横幅一次都没出现 |
| 安全闸门未放宽 | `dp[99][0] === 1` → `ERROR`（不谎报 FALSE）；`alert(n)` / `process.exit()` → `INVALID`；Watch 四态与 `→T` 四态语义不变；`runAIDiagnostics` 判据输出逐预设与 M20 基线一致 |
| 缓存键正确性 | 键含 `names.join(',')` 序列；只按 `expr` 缓存的写法会跨帧串参（`function(n, dp)` 被复用到 `function(i, acc)` 帧），本轮以键设计规避而非以命中率为目标 |
| 第 6 项（正常态） | `header 770/770 · footer 770/770 · 5 scroll boxes zero overflow (160/160 159/159 438/438 251/251 670/670) · 6 explicit data-scroll-x-owner exempt == legacy #12b set · viewport 770x553`，2.8ms |
| 第 6 项（注入反证） | 向 footer 注入 3800px 子元素 → `footer 4365/770 · chrome overflow: footer 4365>770`，整台 `8/9 PASS` 且**仅该项 FAIL**（逐行子树读取核验） |
| `analyzeMatrixWrites` 短路被否 | 块内二维表样本：首帧 / 末帧作用域均无 `table`，shipped 代码在 `FRAME 6 / 10` 仍报 `WRITES: 2`；按首末帧裁剪会返回空集并删掉 #16a 依赖的证据，而其收益仅 0.5~2.3ms → **保留原实现** |
| `code + stage` 断点还原 | `#preset=fib-tree&stage=1&frame=0&bp=18`（38 字符，Stage 0 起点仅 12 行）重载 → `Stage 0 (31f)` + `Stage 1 (41f)`、`FRAME 1 / 41`、`Remove breakpoint at L18` |
| 断点二次过滤 | 同链 `bp=18,63` 重载后只剩 L18，63 被最终 20 行源码剔除（`maxLineButton = 20`） |
| 9 项内核自检 | 页签 `Live Kernel Self-Check (27 Invariants)`，实测 **9/9 PASS**（FAIL 0） |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；转义竖线感知脚本复算 `docs/devlogs` 22 份表格列数一致（0 处不匹配）；`KERNEL_INVARIANT_COUNT = 27` == INDEX 登记条数 27；探针零残留（`grep` 无命中）；重载并跑完 1334 帧 + 导览 + 分享 + 9 项自检后控制台无新增 error/warn |

> 未测项显式标注：残留 ~130ms 内部「已编译函数调用 / `Object.keys` / 参数数组映射」各自占比未拆；
> `WATCH_FN_CACHE` 超限整体清空在极端多阶段会话下的抖动未构造出来复测；
> `Copied!`（剪贴板成功）分支仍未实测；可见浏览器口径的导览整轮时长仍未测。

## 遗留

- **Quick-Watch 全轨迹扫描的固有成本仍在**（~130ms）：缓存只消掉重复编译，
  「逐帧调用已编译函数 + 每帧取可见变量名」无法靠缓存消除。
  后续方向应是给候选验证设**帧数上限或分层抽样**，但那会改变 #16b「至少一帧 TRUE」的完备性语义，
  必须作为独立决策提出，不在本轮顺手放宽。
- `WATCH_FN_CACHE` 用「超限整体清空」而不是 LRU：极端会话下可能一次性丢弃全部已编译函数并重编译。
  实测暖身后每轮编译 0 次，未观察到抖动，故未引入 LRU 复杂度。
- 第 6 项的 chrome 断言只覆盖具名的三个盒子；其它 flex 容器若将来出现同类撑爆仍不在断言范围内。
  盲目扩大枚举域会把设计内的 `overflow-hidden` 裁剪误判成溢出，该权衡仍未收敛。
- 桶聚合的定位粒度退化（`> 160` 帧时约 8 帧一格）与 `repFrame` 的「断点优先、否则最深」语义未变。
- 非激活阶段振幅带靠 `opacity 0.09` 与面积包络 `0.07` 维持层次，阶段数继续增加时是否够用需重估。
- 剪贴板 `Copied!` 分支仍未实测；导览整轮时长仍只有隐藏式视口（定时器限频）口径。
