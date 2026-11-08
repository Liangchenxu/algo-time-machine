# M13 · 透传多参折半合成、奇偶交替快速幂、大轨迹惰性快照与编辑防丢守卫

Commit：`b129f95` — feat(resilience): 完成 Milestone 13 透传多参折半合成、奇偶交替快速幂识别、大轨迹惰性快照与编辑防丢守卫

## Why · 背景动机

M12 收尾时留下四条明确的尾巴，每一条都会在评委的实际操作里变成「判对了但做不了」或「做了但会丢东西」：

1. **透传参数被一刀切拒绝**：`bsearchHalve("arr", 32)` 已被正确判为 `O(log n) Logarithmic Recursion`，
   但形态 A 只接受单参数，`tag` 让合成器直接放弃；摘要还把原因写成「返回值含自定义非线性组合」，
   与真实原因（多参透传）张冠李戴。
2. **奇偶交替快速幂识别不到**：`if (exp % 2 === 1) return base * power(base, exp - 1);` 的实参链是
   `15 → 14 → 7 → 6 → 3 → 2 → 1`，纯 `floor(a/2)` 判定在第 0 步就断链，经典写法被当成线性递归。
3. **快照全量常驻内存**：每级重构都把整条 `frames` 深拷贝留在 `stageHistory` 里。二级火箭的 11~41 帧无感，
   但 `fib(10)` 这类 354 帧轨迹多级叠加后会持续占用堆内存。
4. **编辑态会被胶囊静默覆盖**：在某个阶段手改代码后点另一个阶段，`restoreStage` 直接恢复快照源码，
   用户敲的字没有提示就消失了。

## What & Where · 核心改动

### 1. 透传多参计数折半合成（`src/services/aiDiagnostics.ts`）

- `synthesizeHalvingLowering` 的形态 A 从「仅单参数」放宽为「多参数 + 透传门」：
  - 返回式必须整体匹配 `return 1 + fn(...);`（精确到分号），`return 1 + fn(...) + tag` 这类组合不进入形态 A；
  - 新增 `hasPassthroughArgs(info, slot)`：遍历函数体里的每个自调用，按顶层逗号切分实参，
    要求所有**非折半槽位**都等于对应形参名（`fn(tag, Math.floor(n / 2))` 中的 `tag`）。
  - 合成产物保留原函数签名，`curr` 以折半槽位形参初始化，其余参数只出现在签名与终端回显中。
  - 顶层调用优先取**源码里函数体之后的真实实参**（新增 `extractTopLevelCallArgs`）。
    运行时签名会丢掉字符串引号（`bsearchHalve(arr,32)`），直接拼回源码会产出 `fn(arr, 32)` 的 ReferenceError；
    源码回溯拿到 `"arr"` 后生成 `bsearchHalveIter("arr", 32);`。
- 新增分型拒绝：`coupled`（自调用改写了非折半参数）/ `composition`（返回值不是纯 `1 + fn`）/
  `exponent`（指数非法）。调用方据此输出
  `coupled multi-parameter state → source preserved` 与 `custom return composition → source preserved`，
  不再把多参耦合误报成「返回值非线性」。

### 2. 奇偶交替折半（`detectHalvingArgs`）

- 槽位序列的收敛判定从「严格 equal `floor(a/2)`」扩展为：
  - `a[k+1] === Math.floor(a[k] / 2)`，或
  - `a[k] % 2 === 1 && a[k+1] === a[k] - 1`。
- 仍要求首值 ≥8、总步数 ≥2、序列单调递减，并新增「折半步占比 ≥ 50%」。
- 返回 `halvingSteps` / `interleaved`；摘要与 insight 用
  `INTERLEAVED_DESCENT` + 「6 步中 3 步折半，奇数步为减一交替」明确区分于纯折半。
- **合成门控**：交替链只有快速幂形态可以等价吸收（二进制快速幂本身就按奇偶位处理）；
  计数型遇到交替链一律拒绝为 `composition`——用 `floor(x/2)` 循环会把步数算少。

### 3. 大轨迹惰性快照（`src/App.tsx`）

- `StageSnapshot` 新增 `frameCount` 与 `kind: 'normal' | 'draft'`；`frameCount` 与 `frames` 解耦，
  横幅与胶囊不再依赖可能被清空的 `frames.length`。
- 新增常量 `LAZY_FRAME_THRESHOLD = 250` 与 `evictBackgroundFrames(history, activeIndex)`：
  非激活且 `frames.length > 250` 的快照被替换为 `{ ...s, frames: [] }`，
  仍保留源码、`aiReport`、`metrics`、`sandboxError`、`execTimeMs`、`frameCount`。
- `applySnapshot` 改为异步：轻量快照直接同步恢复（M12 的零延迟语义不变）；
  被驱逐快照先恢复元数据并显示 `RE-HYDRATING STAGE n (250+ frames)`，
  再调用 `runInSandbox(snapshot.sourceCode)` 重水化帧序列，**不重算诊断**。
  用 `hydrateTokenRef` 令牌丢弃过期结果，避免快速连点导致旧结果覆盖新阶段。
- 胶囊对被驱逐阶段显示 `Stage N (354f · LAZY)`，tooltip 说明点击会惰性重水化。

### 4. Dirty-Edit Guard（`src/App.tsx`）

- 派生 `dirtyEdit = stageHistory.length > 0 && sourceCode !== stageHistory[activeStage].sourceCode`。
- 横幅胶囊旁显示琥珀色 `UNSAVED EDIT DRAFT`；脏编辑期间隐藏 Apply（此时 `aiReport` 描述的是旧源码）。
- `handleCompile`（替换按钮原来的 `executeCode(sourceCode)`）：
  脏编辑下点击 `Compile & Trace` 先把 `stageHistory` 与 `activeStage` 归零，
  以手改代码作为全新的 Stage 0 基准。
- `handleRestoreStage`：脏编辑下点击任意胶囊，先用同一沙箱真实跑一遍手改代码并跑一次诊断，
  冻结为 `Stage N · Draft`（`kind: 'draft'`），再恢复用户点击的目标阶段。
  这样 Draft 的源码/帧/报告三者同源（满足不变量 #18a），用户可随时点 `Draft` 胶囊无损找回。
- 切换预设、Apply、Compile 都会推进重水化令牌并复位 `hydratingStage / savingDraft`。

## 矛盾与认知纠偏 · 本里程碑攻克的问题

1. **「多参数」不等于「状态耦合」**
   最初想把非折半参数直接忽略。但如果自调用写成 `fn(tag + 1, n/2)`，`tag` 每次都在变，
   忽略它就改变了函数语义。最终用「非折半槽位必须是原样标识符」的透传门区分：
   `bsearchHalve` 可合成，`bsearchCoupled` 明确拒绝并报 `coupled multi-parameter state`。
2. **精确返回式比「含 1 + 调用」更安全**
   M11 的 `countPattern` 只匹配前缀，`return 1 + fn(...) + tag` 也会命中。
   M13 改为整句匹配到分号：组合式不会进入计数模板，而是落到 `custom return composition`。
3. **字符串引号在运行时签名里已经丢失**
   直接复用 `topCallExpr` 回填调用，会生成 `bsearchHalveIter(arr, 32)`；
   浏览器里 `arr` 未定义，演示会直接崩。改为回溯源码中函数体之后的真实调用字面量，
   生成 `bsearchHalveIter("arr", 32);`，终端正确输出 `steps = 5`。
4. **交替链不能套计数循环**
   `15 → 14 → 7 → 6 → 3 → 2 → 1` 的真实层数是 7 层（含基线），
   而 `floor(x/2)` 只数 3 次折半。若把交替链当纯折半合成会少算步数；
   因此交替链只开放快速幂合成，计数形态一律拒绝。
5. **`frames.length` 不能同时承担「内存存在性」与「轨迹规模」**
   胶囊与横幅原本用 `frames.length`，惰性驱逐后会瞬间变成 0f。
   拆出 `frameCount` 后，驱逐只影响内存而不影响展示；`LAZY` 徽章明确告诉用户帧是按需恢复的。
6. **重水化必须只跑沙箱、不跑诊断**
   若复用 `executeCode`，会把冻结的 `aiReport` 重算成当前引擎结果，破坏 #18a。
   改为直接 `runInSandbox`，报告继续来自快照。
7. **脏编辑切阶段不能只提示**
   只加 `UNSAVED EDIT DRAFT` 而不处理切换，仍然会丢字。最终采用「先真实跑成 Draft 再切换」，
   并保留 `Compile & Trace` 的「归零重开」路径，两条路都不会静默覆盖。
8. **实测中的假象**
   第一版用 `fib(8)` 想触发 250 帧阈值，实测只有 134 帧（小于阈值），说明帧数不能凭调用次数估。
   改用 `fib(10)` 得到 354 帧后才真正观察到 `LAZY` 驱逐与重水化。

## Impact · 实测验证指标（视口 770×553）

| 场景 | 实测结果 |
| --- | --- |
| 透传多参识别 | `bsearchHalve("arr", 32)`：7 帧、栈深 7，判 `O(log n) Logarithmic Recursion`，摘要标注「槽位 1（n）链 32 → 16 → 8 → 4 → 2 → 1」 |
| 透传多参合成 | Apply 按钮可见；生成 `function bsearchHalveIter(tag, n)` 与 `bsearchHalveIter("arr", 32);`，终端 `steps = 5`（与原递归一致） |
| 透传消栈基准 | Apply 后 20 帧、`O(log n) Iterative Halving` / `O(1) Scalar Accumulator`，横幅 `STACK REDUCTION -71.4%` / `PEAK STACK 7 → 2` |
| 奇偶交替识别 | `powerAlt(2, 15)`：链 `15 → 14 → 7 → 6 → 3 → 2 → 1`（6 步中 3 步折半）、9 帧、栈深 9，判 `O(log n)`，标签 `INTERLEAVED_DESCENT` |
| 交替快速幂合成 | Apply 后 22 帧、`powerAltIter(2, 15) = 32768`（与 2^15 一致），横幅 `STACK REDUCTION -77.8%` / `PEAK STACK 9 → 2` |
| 耦合拒绝 | `bsearchCoupled(tag, n)`（自调用 `tag + 1`）判对数级但 Apply 隐藏，文案 `coupled multi-parameter state → source preserved` |
| 组合拒绝 | `weirdHalve2(n)`（`return 1 + fn(n/2) + n`）Apply 隐藏，文案 `custom return composition → source preserved` |
| 惰性快照驱逐 | 自定义 `fib(10)`：Stage-0 354 帧 → Stage-1 80 帧；切到 Stage 1 后胶囊为 `Stage 0 (354f · LAZY)` |
| 重水化 | 点击 `Stage 0 (354f · LAZY)` → 恢复 354 帧（实测 <120ms），胶囊变回 `Stage 0 (354f)`、`INSPECTING STAGE 0 BASELINE` 出现、判据仍为 `O(2^n) Exponential`（未重算） |
| 轻量零延迟 | fib 三级火箭 31 / 41 / 11 帧均无 `LAZY`、无 `RE-HYDRATING`；Stage 0 恢复 31 帧且判据回到 `O(2^n)` |
| 脏编辑芯片 | 编辑 Stage 1 源码后横幅出现 `UNSAVED EDIT DRAFT`；Apply 隐藏 |
| Draft 冻结 | 脏编辑下点 Stage 0（当时为 powerAlt 的 Stage 0 (9f) / Stage 1 (22f)）：胶囊变为 `Stage 0 (9f)` / `Stage 1 (22f)` / `Draft 2 (22f)`；Stage 0 源码不含手改注释，Draft 2 完整保留手改源码与 22 帧 |
| 编译归零 | 脏编辑下点 `Compile & Trace`：Stage 胶囊全部消失，以手改代码重新建立 Stage-0 轨迹 |
| 指数门控回归 | `power(2, 16.5)` 判对数级但 Apply 隐藏，文案 `negative/non-integer exponent (16.5) → source preserved` |
| 不收敛回归 | `power(2, -4)` → 149 帧 `[FUSE_STACK_OVERFLOW]` 后判 `O(∞) Unbounded Recursion` / `Stack Depth 150 (fused)`，Apply 隐藏 |
| 预设回归 | Fast Power 13 → 22 帧、终端 `65536`；Rain 40 帧 `O(n) Linear Two-Pointer`；fib 31 → 41 → 11 帧；顶栏 44px 且 `scrollWidth == clientWidth == 770` |
| 纪律 | `npm run build` 零 TS 报错；`src/**` emoji 扫描无命中；14 篇 DevLog 表格列数一致；控制台无 error/warn |

## 遗留

- 惰性阈值只按帧数（>250）判断，不看变量快照的实际字节数；少量超大数组快照仍可能占用较多内存。
- 重水化会真实重跑源码：含 `Math.random` / `Date.now()` 等非确定性代码时，帧内容可能与冻结时的
  `metrics` 略有漂移（确定性演示不受影响）。
- 交替折半目前只识别 `floor(a/2)` 与「奇数减一」两种步进；`+1`、`-2` 等其它交错变体仍会断链。
- Draft 阶段在切换时会跑一次沙箱与诊断（约 380ms 诊断延迟），不是零延迟；这是保证快照同源的代价。
