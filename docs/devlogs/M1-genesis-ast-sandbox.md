# M1 · AST 自动插桩内核与 Blob Worker 时间旅行沙箱

Commit `6f94a32` — feat(core): 完成 Milestone 1 AST自动插桩内核与Web Worker时间旅行沙箱

## Why · 背景动机

参赛作品要在浏览器里对**任意用户输入的算法源码**逐帧回放，同时让评委一键看到死循环被安全拦下。
直接在主线程 `eval` 有三条致命路径：死循环冻结标签页、深递归炸掉渲染线程、用户代码里的
`while(true)` 连带吞掉整个 React 应用。因此 M1 的目标不是「做一个调试器界面」，而是先把
**安全执行 + 完整现场采集**这条内核链路立起来——它是后面所有里程碑的地基。

## What & Where · 核心改动

### 依赖与脚手架

- Vite 8.3.6 + React 18.3.1 + TypeScript 5.9.3 + Tailwind 3.4.19 + `@babel/standalone` 8.1.1 + lucide-react 1.70.0。
- `tailwindcss` 锁 v3：v4 已废弃 `tailwindcss` PostCSS 插件写法，与指令指定的 `postcss.config.js` 冲突。
- 产物基线：2063 modules，`index.js` 2,382.10 kB（gzip 621.16 kB）。体积几乎全部来自 `@babel/standalone`，
  这是「浏览器内编译」路线的必要代价。

### `src/core/instrumenter.ts`

- `'ForStatement|WhileStatement|DoWhileStatement'`：循环头 unshift `__guard(line)` + 一条
  `循环迭代 (Loop Step)` 快照；单语句循环体自动包成 BlockStatement。
- `'BlockStatement|Program'`：每条 `VariableDeclaration` / `ExpressionStatement` 之后追加
  `状态更新 (State Update)` 快照；函数声明体注入 `__enterFn`；`isInternal` 判定跳过以 `__` 开头的内部调用，
  避免对注入代码二次插桩。
- 运行时前言：`__MAX_STEPS = 2000`、`__steps`、`__frames`、`__callStack`、`__stdout`、
  `__clone`（深度 4 的防御性深拷贝，函数转 `'[Function]'`）、被劫持的 `console.log`。
- `retainLines: true` 保证生成代码行号与源码行号对齐，`frame.line` 才能直接驱动编辑器高亮。

### `src/core/sandboxRunner.ts`

- `instrumentCode` 失败即返回 `语法解析错误 (AST Parse Error)`，不污染执行统计。
- 用 Blob URL 起 Worker（Worker 内无法 import Babel，所以插桩在主线程、执行在隔离线程）。
- 3000ms watchdog → `worker.terminate()` + `URL.revokeObjectURL`；另加 `worker.onerror` 兜底。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **TDZ ReferenceError（最致命）**
   给定实现用 `typeof x !== 'undefined' ? x : undefined` 读取变量。但 Babel 的 `scope.bindings`
   包含同一块作用域内**稍后才声明**的 `let/const`，`typeof` 对暂时性死区绑定同样抛
   `ReferenceError: Cannot access 'x' before initialization`。也就是说预设 1 的第二个快照
   （读到后面才声明的 `water`）就会中断整条采集链。
   结论：指令称该实现「经过验证」，但在真实预设代码上并不成立。改为生成
   `(() => { try { return x; } catch { return undefined; } })()`，语义等价（未定义即被 `__trace` 过滤掉），
   但不再中断执行。
2. **熔断后现场全丢**
   `new Function(code)` 体内的 `const __frames` 是函数局部变量，Worker 的 `catch` 分支只能回传
   `frames: []`，于是「展示熔断前前序帧」这条需求在结构上无法实现。修复：前言里
   `globalThis.__mtmFrames = __frames`（同一数组引用），catch 分支改读它。
3. **顶层语句零帧**
   只插桩 `BlockStatement` 时，脚本式代码的顶层语句（函数调用、`console.log`）不产生任何帧，
   stdout 面板永远空白。visitor 选择器扩展为 `'BlockStatement|Program'`。
4. **`@babel/standalone` v8 API 风险**
   装到的是 Babel 8 而非 7，`inline plugin` 与 `retainLines` 是否仍可用没有把握。
   先在 Node 侧写 smoke test 实测：确认 `Babel.transform(code, { plugins: [fn], retainLines: true })`
   可用、行号保持、TDZ 安全读取生效，然后才把它接进前端链路。
5. **编辑器与追踪层像素对齐**
   textarea 覆盖层与高亮层的 `font-size / line-height / padding-left` 必须逐字相同，否则行号与高亮错位。
   用 `getComputedStyle` 断言两层均为 `13px / 22px / 54px`。

## Impact · 实测验证指标

- 预设 1 双指针接雨水：**41 帧**，沙箱执行 1ms；第 25 帧 `↑ left=5 / ↑ right=10` 指针胶囊落格正确。
- 预设 2 二分查找：**23 帧**，`↑ low / ↑ high` 联动，越界指针降级为标量芯片。
- 预设 3 死循环压测：`2000 步` 熔断触发，**回收 1555 帧**崩溃前现场，末帧热点行 L4 累计 `×444`。
- 自定义代码（手写 fib 循环版）改写重跑：**41 帧**，调用栈面包屑 `main() → fib()`，6 行热力着色正确。
  （stdout 当时仅在死循环预设验证到 `$ 即将进入 while(true)，等待沙箱熔断...`）
- `npm run build` 零 TypeScript 报错；浏览器控制台除 Vite/React 提示外无 error/warn。

## 遗留（后续里程碑处理）

- 递归函数返回后 `__callStack` 不弹出 → M2。
- 只有「帧能不能采到」的保证，没有「帧说明了什么复杂度」的解释 → M2/M3/M4。
