# M6 · 2D SVG 贝塞尔调用树、线性递归算子自动合成与 771px 分屏布局精修

Commit `772ef79` — feat(visualizer): 完成 Milestone 6 2D SVG贝塞尔调用树、线性递归算子自动合成与771px分屏布局精修

## Why · 背景动机

架构师以 771×553 分屏实机截图审出两类肉眼可见但代码层不报错的缺陷：

1. **每一行代码下面都拖着一条 Chromium 原生粗灰滚动条**——根因是单行 `<span className="whitespace-pre overflow-x-auto">`：
   给「一行」这种最小滚动单元单独开横向溢出，浏览器就会为它各自生成一条滚动条，视觉上等于把代码区撕成条纹。
2. **右下角 AI 面板标题被挤成四行竖排**——三个复杂度徽章挤在 `h-9` 标题栏里，窄视口下flex 只能压缩文字，
   中文/英文单词被拆成竖排。

同时 M5 遗留两条：调用树只是 depth 缩进列表（看不出父子拓扑），线性递归的迭代代码要人工替换合并算子。
另外 M5 报告里我标注过一个语义风险：熔断截断的基线帧数与完整重跑的帧数不该做百分比比较——本轮一并修掉。

## What & Where · 核心改动

### 布局与滚动条契约

- `src/index.css`：重写为**全局 5px 暗色滚动条**（轨道 `#090B10`、滑块 `#27272a`、hover `#3f3f46`、圆角 3px，
  Firefox 侧 `scrollbar-width: thin` + `scrollbar-color`），新增 `.no-scrollbar` 工具类；
  删除 M1 遗留且已无人使用的 `.scroll-thin` / `.grid-noise` / `input[type=range].timeline`（M3 起已无 range 输入）。
- `src/App.tsx` 源码区：外层滚动容器 `overflow-y-auto` → `overflow-auto`；行容器加 `inline-block min-w-full`
  （让热力/断点底色铺满最长行而不是只铺半屏）；**单行 span 去掉 `overflow-x-auto`，仅保留 `whitespace-pre`**。
- 顶栏：品牌块与两个动作按钮 `shrink-0 whitespace-nowrap`；预设切换器 `max-w-[54vw]` →
  `min-w-0 flex-1 overflow-x-auto no-scrollbar`，成为窄视口下唯一的可压缩/可滚动区。
- AI 面板：`Time / Space / Hotspot / Peak stack / Operator` 五枚徽章从 `h-9` 标题栏迁出到面板内部
  左栏顶部**遥测条**；标题长尾 `& Frame Diagnostics` 与 redundant 提示改为 `xl` 以上才渲染；
  标题栏 `overflow-hidden` → `overflow-x-auto no-scrollbar`；Apply 按钮加 `shrink-0 whitespace-nowrap`。

### 2D SVG 贝塞尔调用树

- `layoutCallTree(nodes, limit = 40)`（纯 TypeScript + 原生 SVG，无第三方图库）：
  建 `childrenOf` 邻接表 → 后序遍历给叶子递增 `slot`，父节点 `x = mean(child x)`，
  `y = (depth - minDepth) * 46 + 24`；父节点不在选取集合内时该节点升为根（`main()` 与长链截断不会把树压成一列）。
- 连线：`M x1 y1 C x1 midY, x2 midY, x2 y2` 三次贝塞尔；子节点在激活路径上时 `stroke="#38bdf8"`、
  `strokeWidth=1.4`，否则 `#27272a`。
- 节点胶囊：`rect rx=4` + 签名文本（>11 字符加省略号）；状态色 active `#082f49/#38bdf8`、
  redundant `#2b0a12/#f43f5e`、retired `#18181b/#27272a`，未来节点 `opacity=0.4`；
  `isDuplicate` 在右上角叠加 `DUP×n` 小徽章；点击 `<g>` 跳到 `entryFrameIndex`。
- `2D SVG Tree` / `Compact List` 双视图切换，默认 SVG；图例条同时显示 nodes / edges / leaves 计数。

### 线性递归算子自动合成（`src/services/aiDiagnostics.ts`）

- `sniffCombineOperator(sourceCode, fnName)`：按 `ident [+] ident fnName(...)` 与 `fnName(...) [*|+] ident` 四种形态匹配，
  命中 `*` → product、命中 `+` → sum、匹配不到 → descent。
  **操作数只允许标识符**：`1 + depth(n - 1)` 的合并量是「步数」而不是变量，匹配不到 variant 因此正确落到 descent；
  若补一条 `\d+` 分支反而会把计数型递归误合成求和。
- 分支 B 据 `combine.kind` 生成三套代码之一：
  `acc = 1; for (i = 2..n) acc *= i`（阶乘）、`acc = 0; for (i = 1..n) acc += i`（求和）、
  `let cursor = 0; while (cursor < n) cursor += 1`（游标推进）。
- 嗅探依据回显：`AIDiagnosticReport.combinePattern` → 遥测条 `Operator: 乘法累积 (product accumulate) · n * fact(n - 1)`。
- 边界声明：算子嗅探**只服务于代码生成**，复杂度判档仍严格只看运行时签名与栈深（不变量 #6/#11 不因本轮而松动）。

### 熔断态 Benchmark 语义

- `BaselineMetrics.wasFused = Boolean(sandboxError && sandboxError.includes('[FUSE_'))`
  （用 `[FUSE_` 前缀判定，排除 AST 解析错误被误当成熔断）。
- `benchmarkDelta.abortedToCompleted`：基线截断且重跑完整时，横幅不再算百分比，改为
  `STATUS: FUSE_ABORTED (af) → COMPLETED (bf) | (frame counts across a fuse boundary are not comparable)`，
  并覆盖「双向都截断」「重跑反而截断」两种组合。

## Bugs 与认知纠偏 · 本里程碑攻克的问题

1. **「不折行」不等于「可用」**：把标题栏设为 `overflow-hidden` 后确实不再竖排，但截图式的检查发现
   Apply 按钮被整段裁到可视区外（`scrollWidth 823 / clientWidth 448`）。
   最终把徽章迁出标题栏 + 长尾文案 xl 分级 + `overflow-x-auto no-scrollbar`，压到
   `scrollWidth == clientWidth == 448` 且 Apply 完整可见——判定标准从「没折行」升级为「控件可达」。
2. **给单行开滚动条是结构性错误**：滚动条属于滚动容器，不属于内容单元。修法是责任上移
   （外层容器 `overflow-auto` + 行容器 `inline-block min-w-full`），而不是去调滚动条颜色——
   调颜色只能让噪声更好看，不能消除噪声。
3. **帧数上升不是回归**：`fact` 7 → 13、`depth` 149(截断) → 802。递归改迭代后插桩语句变多，帧数上升是真实结果；
   真正的收益在 `PEAK STACK 7 → 2` 与 `150 → 1`。本轮选择如实展示 + 熔断态标注不可比，而不是挑选好看的数字。
4. **自查清掉两处自产缺陷**：AI 标题栏残留一段 `aiReport.engine === undefined ? '' : ''`
   （`engine` 字段 M3 已随规格下线，判空本身永远为真，是无意义噪声）；
   嗅探函数里一条永远不可达的「操作数是数字字面量」分支（正则只捕获标识符，`/^\d/` 恒假）。
5. **验证方法本身**：`stdout` 是否输出 720 必须在**最后一帧**取证——停在第 1 帧时终端面板显示
   "Waiting for console.log emission"，容易把「尚未播放到」误判成「没有输出」。

## Impact · 实测验证指标（视口 770×553）

| 场景 | 实测结果 |
| --- | --- |
| 单行滚动条 | 代码行 span `overflow-x` 计算值为 `visible`；12 行与 20 行预设行高恒为 28px（无一行被撑高） |
| 顶栏 | 高度 44px；`scrollWidth == clientWidth == 770`；Compile & Trace 与 Qoder Engineering Spec 右边缘均在容器内；品牌块单行 24px；预设切换器压缩到 88px 并可横向滚动 |
| AI 面板标题栏 | 高度 36px 单行；`scrollWidth == clientWidth == 448`；Apply 按钮完整可见 |
| 遥测条 | `Time: O(2^n) Exponential` \| `Space: O(n) Stack Depth 6` \| `Hotspot: L2 (15x)` \| `Peak stack: 6` |
| SVG 调用树 | fib(5)：15 个节点组、14 条贝塞尔连线、9 个 DUP 徽章、viewBox 636×246；leaves/edges 计数随视图刷新 |
| 树互证 | 9 个 DUP 徽章 == `redundantCallCount = 9`（两条独立实现路径吻合） |
| SVG 跳帧 | 点击 DUP `fib(3)` → `FRAME 20 / 31`；跳帧后激活态 = 2 个天蓝节点 + 1 条 `#38bdf8` 连线 |
| 视图切换 | Compact List 渲染 15 行且 SVG 卸载；切回 2D SVG Tree 后节点重建 |
| 乘法算子合成 | `fact(6)` → Operator 芯片 `乘法累积 (product accumulate) · n * fact(n - 1)`；终端实测 `factIter(6) = 720` |
| 深度推进合成 | `depth(400)` → Operator 芯片 `纯深度推进 (unit descent) · no arithmetic combine detected`；终端实测 `iterative cursor = 400` |
| 熔断态横幅 | `STATUS: FUSE_ABORTED (149f) → COMPLETED (802f)` \| `(frame counts across a fuse boundary are not comparable)` \| `PEAK STACK: 150 → 1` |
| 非熔断态横幅 | fact 仍按百分比展示 `FRAMES: 7 → 13 (+85.7%)`，不做粉饰 |
| 断点回归 | DP 预设 20 个行号按钮；L14 断点后 Continue `FRAME 10 → 12`，F8 再推进到 `FRAME 17`；火焰轨 6 根亮红标记 |
| 无回归 | Rain 40 帧 / 2 格水体 / 13 枚热力徽章 / `↑left ↑right`；DP 29 帧、双矩阵、`Cursor [1][2]`、`Δ 1` 全部保持 |
| 纪律核查 | `npm run build` 零 TS 报错；`src/**` emoji 扫描 `scan done` 无命中；控制台无 error/warn |

## 遗留

- 单链递归迭代化后，兜底判据把 `factIter` 这类纯循环报为 `O(n) Linear Two-Pointer`（"双指针"措辞与代码形态不符，
  复杂度量级正确）。要精确需新增「迭代累积」档，属新判据分支，未擅自加。
- 分支 A 的 `optimizedCode` 仍是 fib 专用 DP 样例；非 fib 的重叠子问题递归（如记忆化搜索）需要通用记忆化模板。
- SVG 树在 40 节点上限下不自动聚焦当前激活子树；长链（depth > 5）纵向会超出 232px 可视高度，需要滚动查看。
