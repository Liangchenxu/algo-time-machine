# M2 · AST 递归退栈纠偏、行级执行热力与 AI 帧级复杂度诊断

Commit `638022a` — feat(ai-diagnostics): 完成 Milestone 2 AST递归退栈纠偏、行级热力图与AI帧级复杂度手术刀

## Why · 背景动机

架构师复核 M1 后给出一条致命反馈：**递归函数返回后调用栈没有弹出**。
`__enterFn` 只 push 不 pop，导致每一帧的 `callStack` 只增不减——

- 调用栈面包屑显示的是「历史累积路径」而不是当时的真实栈；
- 栈深指标虚高，任何基于栈深的复杂度判断都建立在脏数据上；
- 帧级 AI 诊断因此不可信：诊断引擎需要的正是「峰值栈深」这类信号。

这一条把 M1 从「能采帧」推到「采到的帧可以被信任」。M2 同时补进行级执行次数统计，
让「哪一行是热点」从主观阅读变成可测量数据。

## What & Where · 核心改动

### `src/core/instrumenter.ts`

- `TraceFrame` 新增 `lineHits?: Record<number, number>`（可选，兼容旧帧）。
- 函数声明体改写为：

  ```js
  __enterFn("fib", 2);
  try {
    __trace(2, "函数进入: fib()", { ...scope 快照 });
    ...原函数体语句（含逐语句快照）...
  } finally {
    __exitFn();
  }
  ```

- `__instrumented` 节点标记：`tryBlock` / `exitBlock` / `wrappedBody` 打上标记后
  `path.replaceWith(wrappedBody)` 触发的二次遍历会直接 return，避免递归插桩。
  改写顺序是「先给原 body 注入逐语句快照，再搬进 tryBlock」，所以函数体内的快照不会丢失。
- 新增 `__exitFn()`：仅在 `__callStack.length > 1` 时 pop，保证 `main()` 永不被弹出。
- `__trace` 内 `__lineHits[line] = (__lineHits[line] || 0) + 1`，并逐帧 `{ ...__lineHits }` 快照——
  因此拖到第 N 帧时热力图显示的是**截至第 N 帧**的累计命中，回放往返时热力会随之回退。
- 新增 `函数进入: <name>()` 事件类型。

### `src/services/aiDiagnostics.ts`（新建）

- `analyzeTraceMetrics(frames)`：从末帧 `lineHits` 取热点行与最大命中；遍历所有帧取峰值栈深，
  并把「首次达到峰值栈深的帧」定为 `bottleneckFrameIndex`，默认回退到 `frames.length * 0.6`。
- `runAIDiagnostics`：填了 `sk-` 前缀 Key 则请求 DeepSeek（`response_format: json_object`），
  失败静默回退；本地引擎 380ms 模拟思考延迟，按「熔断 / 递归 / 双指针」三类产出报告，
  含 `frameInsights`、`optimizedCode`、`optimizationGain`。
- Key 只存内存，不写 localStorage。

### `src/App.tsx`

- 预设扩到 4 个（新增暴力递归斐波那契），编辑区改为逐行渲染 + `🔥Nx` 热力徽章 + 冷暖渐变背景；
- 新增 AI 面板：复杂度芯片、热点行/栈深/总帧数三联卡、瓶颈帧 🎯 瞬移卡片、帧级洞察跳转、
  一键应用优化代码并重跑、优化前后帧数对比横幅；
- 右上角 Qoder 协同档案弹窗（三层熔断表 + M1/M2 演进记录 + 工程纠偏留痕，Esc 关闭）。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **实例代码回退了 M1 的 TDZ 修复**
   M2 给的 `buildSnapshotNode` 又写回 `typeof x !== 'undefined' ? x : undefined`。
   直接采用会让预设 1/2 在第二个快照崩溃。合并时保留 try/catch 闭包读取，并把这条写进档案弹窗的
   「工程纠偏留痕」，避免下个里程碑再次被回退。
2. **实例代码删除了 `globalThis.__mtmFrames`**
   删掉后死循环预设的「熔断前帧回收」归零（横幅会显示 0 帧），与 M2 自己要展示的效果直接冲突，保留。
3. **实例 visitor 只剩 `BlockStatement`（我自己一度照抄，实测暴露）**
   照抄后 `fib(8)` 只有 67 帧且 stdout 面板空白，**末帧无法证明退栈**。恢复 `'BlockStatement|Program'`
   后变成 69 帧，末帧调用栈精确等于 `[main()]`——这条正是「退栈修好了」的唯一可视化证据。
   教训：合并他人代码时要按行为逐项验证，不能只做静态 diff。
4. **DeepSeek fetch URL 被 Markdown 链接化污染**（`[https://...](https://...)`），照抄会 404，已还原为裸 URL。
5. **报告引擎来源不可辨**
   在线请求失败会静默降级，界面却仍显示 DeepSeek 字样。给 `AIDiagnosticReport` 加 `engine` 字段，
   芯片显示「DeepSeek 在线 / 内置免 Key 引擎」，避免把降级说成在线成功。
6. **CORS 疑虑的实证**
   先用 mock `fetch` 抛错验证降级链路，之后一次误留的测试 Key 真实打到 `api.deepseek.com`，
   返回 401 而非被 CORS 拦截 → 证明浏览器可直连该接口，填真实 Key 即走在线诊断，无需反代。
7. **fib 的热点行恒为 L1**
   给定 visitor 只对 `VariableDeclaration` / `ExpressionStatement` 插快照，而 fib 两个分支都是
   `return` 语句，于是 67 次命中全部落在「函数进入」行上。已向架构师报备：要让热点精确到
   `return fib(n-1) + fib(n-2)` 需要扩展 visitor 覆盖 `ReturnStatement`（改变插桩语义），未擅自实施。

## Impact · 实测验证指标

| 验证项 | 结果 |
| --- | --- |
| 退栈正确性 | `fib(8)` 末帧 `callStack = [main()]`，峰值栈深 9 层，`stdout = $ 暴力递归 fib(8) = 21` |
| 帧数 | `fib(8)` 69 帧（Program 修复前 67 帧） |
| 行级热力 | 预设 1 中段 12 个 `🔥Nx` 徽章，循环行 `🔥9x`，`×444` 热点行 |
| AI 诊断（fib） | `O(2^n) 指数级爆炸` / 峰值栈深 9 / 热点 L1×67 / 瓶颈第 7 帧，🎯 跳转落位 Frame 8 |
| AI 诊断（死循环） | `O(∞) 死循环发散` + 1555 帧熔断报告 + 优化代码注入收敛步进 |
| 一键优化重跑 | 暴力递归 **69 → 14 帧（-80%）**；死循环 **1555 → 27 帧（-98%）** |
| 降级链路 | mock fetch 抛错后芯片显示「内置免 Key 引擎」，控制台 warn 记录回退原因 |
| 构建 | `npm run build` 零 TS 报错 |

## 遗留

- 字符串判据 `includes('fib')` / `includes('dp[')` 是源码文本匹配，重构后的代码会再次命中错误分支 → M3。
- 界面仍带 emoji 与高饱和发光样式，信息密度不足 → M3。
