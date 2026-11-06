# M3 · 工业级全屏 IDE 重铸、2D DP 矩阵、帧间 Diff 与火焰图时间轴

Commit `41ad788` — feat(workbench): 完成 Milestone 3 工业级全屏IDE重铸、2D动态规划矩阵、帧间Diff与火焰图时间轴

## Why · 背景动机

M2 的功能已经够硬，但界面是「霓虹发光卡片 + 大按钮 + emoji」的演示页气质：信息密度低、
视觉噪音大，评委一眼看出是生成物而不是工具。M3 的要求是**去 AI 塑料感**：
100vh 全屏 IDE、`zinc` 中性色阶、11px 等宽字遥测、44px 顶栏 / 52px 时间轨的固定节奏，
并补齐三件此前缺失的能力——二维 DP 状态表可视化、帧与帧之间的变量差分、
以及把「栈深随时间演化」画成可点击拖拽的火焰图。

架构师同时下达硬约束：**严禁自行使用 emoji，严禁放大按钮尺寸**。

## What & Where · 核心改动

- `src/App.tsx` 全量重写（预设内联为 5 项，删除 `src/presets.ts`）：
  - 12 栏布局：左 5 栏源码热力 + AST IR 切换，右 7 栏上 58% 内存显微镜 / 下 42% AI 诊断台。
  - 左下 128px 条带：调用栈面包屑 + stdout 流。
  - 2D 矩阵：`Cursor [r][c]` 十字准星（命中格 `bg-sky-500/25`，同行同列 `bg-zinc-800/60`），
    单元格级帧间差分（`bg-amber-500/30 + ring-1 ring-amber-400`），`Δ N State Mutation(s) in Frame #i` 计数。
  - 1D 数组：柱状高度 + 水面覆盖层（接雨水专用，`min(leftMax, rightMax)` 界内才画水体）+ `↑ptr` 胶囊。
  - 火焰图：每帧一根竖条，高度 = `callStack.length / 峰值栈深`，已过帧天蓝、热点行帧玫红、当前帧琥珀；
    点击与按下拖拽均可跳帧；Space / ← / → 键控。
  - AST IR 透视：实时展示插桩产物，可直接看到 `__enterFn` + `try/finally { __exitFn() }` 与 TDZ 闭包。
- `src/services/aiDiagnostics.ts`：新增 `O(M*N) Matrix DP` 分支；`frameInsights` 增加 `tag`
  （`CFG_CYCLE` / `GUARD_TRAP` / `STACK_GROWTH` / `REDUNDANT_SUBTREE` / `STATE_TRANSITION` / `INVARIANT_HOLD`）；
  全部文案去 emoji，改用 CFG / Monotonic Variant / Tabulation 等术语。
- `tailwind.config.js`：`extend.spacing` 补 `13: '3.25rem'` 与 `'0.2': '0.05rem'`。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

### 一、给定代码里的 4 处机械损坏（不修则无法编译或无法成立）

1. **泛型被 Markdown 吞坏**：`useState<AIDiagnosticReport null |>(null)` 与
   `useRef<HTMLDivElement null |>(null)` —— 联合类型 `| null` 被链接化重排成 `null |>`，
   TS 直接语法错误。还原为 `AIDiagnosticReport | null` / `HTMLDivElement | null`。
2. **fetch URL 二次污染**：又变成 `[https://api.deepseek.com/chat/completions](https://...)`。
   （同一份文档里被污染两次，说明这是复制粘贴管线的系统性问题，已写入 INDEX 核对表。）
3. **5 个未使用 import**：`React / Activity / AlertTriangle / CheckCircle2 / Sliders` 在该 JSX 中从未出现，
   而项目开启 `noUnusedLocals` → 5 条 TS6133 直接让 `npm run build` 失败。
   处理方式是删掉未使用项，而不是为了让 import「被用到」而往界面里塞元素。
4. **`h-13` 与 `py-0.2` 不在 Tailwind v3 标度**：这类错误**不会报错**，只会被静默丢弃，
   表现为 52px 时间轨塌成内容高度、微徽章没有内边距。选择在 `extend.spacing` 补齐标度，
   使给定标记一字不改地生效，并在产物 CSS 中断言：`.h-13{height:3.25rem}`、`.py-0\.2{padding-top:.05rem}`。

### 二、判据矛盾（本轮最有价值的一次纠偏）

M3 的本地引擎仍用源码字符串匹配：`sourceCode.includes('fib') || maxStackDepth >= 4`。
实测暴露的后果不是「不够准」，而是**当场自打脸**：

```
点击 Apply O(n) Refactor 之后：
  Time: O(2^n) Exponential            ← 对一段纯 for 循环的 O(n) 递推
  Frames: 14 -> 15 (-50% Overhead)    ← 声称优化却让帧数上升
  Max Stack: 2 -> 2
```

因为优化产物里仍含 `fib`（`fibDP`、`console.log("DP optimal fib(...)")`），字符串判据再次命中。
修复分两步，原则统一为**判据只读运行时证据**：

- 递归分支收紧为 `metrics.maxStackDepth >= 4`（`fib(5)` 真实栈深 6，照样命中；文案匹配彻底删除）。
- 二维分支的 `includes('dp[')` 换成运行时表形态探测，为 M4 的 `dp` 降维识别铺路。

修复后：优化前 `O(2^n) Exponential / Stack Depth 6`，应用后面板自然切换为最优界结论，
且 `optimizedCode === sourceCode` 时 Apply 按钮自动隐藏——不再出现「已最优还要再优化」的死循环观感。

### 三、验证工具自身的坑

- 隐藏视口下 `requestAnimationFrame` 不触发，导致「点击→渲染」计时脚本挂死到 MCP 超时。
  改用宏任务（`setTimeout(…, 1)`）夹逼测量，才拿到 14–19ms 的真实数据。
- `document.body.innerText` 会跳过 `display:none` 节点，因此 `xl:flex` 的遥测块在小视口读不到，
  必须改为按 DOM 查询取文本；当前视口 771×553 属于测试环境限制，不是应用缺陷。

## Impact · 实测验证指标

| 验证项 | 结果 |
| --- | --- |
| 死循环压测 | **1334 帧**全量渲染为 1334 根火焰条，横幅 `Pre-crash trace preserved (1334 frames)` |
| 火焰图跳帧 | 1334 根竖条下单次跳帧重渲 **14–19ms**（首次 474ms 为冷启动/GC） |
| 2D DP | 29 帧；`grid [3×4]` 与 `dp [3×4]` 双矩阵同屏；`Cursor [1][2]` 命中 2 格；写入帧 amber 格 `[1,2]=6` |
| 帧间 Diff | `Δ 1 State Mutation(s) in Frame #9`，与 TDZ 语义吻合（该帧新出现的 `fromLeft`） |
| 接雨水 | 40 帧；热点 L9（11x）；`↑left / ↑right` 落格；水面覆盖层激活、2 格水体 |
| AST IR | `function fib(n) { __enterFn("fib", 2); try { __trace(...) } finally { __exitFn(); } }` 肉眼可读 |
| Emoji 审计 | `src/App.tsx` 与 `aiDiagnostics.ts` 扫描 `(none)` |
| 构建 | 2062 modules，`index.js` 2,396.48 kB（gzip 625.44 kB），零 TS 报错 |

## 遗留（提交给架构师裁决，M4 落地）

- 二分查找被判为 `O(n) Linear Two-Pointer`，与其页签自标的 `O(log n)` 冲突——四分支引擎没有对数档。
- 2D DP 应用一维滚动数组优化后仍报 `O(M*N) Matrix DP`（优化样例把 `grid` 一起留下，字符串判据再次命中）。
- `__guard` / watchdog 文案里的 `🚨` `⏱️` 属 M1/M2 指定原文，M3 无权改动 `instrumenter.ts`，界面仍残留 2 处 emoji。
