# 项目名称

AlgoTimeMachine —— 浏览器端 AST 自动插桩时间旅行调试器与 AI 复杂度诊断台

# 技术栈

Vite + React 18 + TypeScript + Tailwind CSS + `@babel/standalone` + `lucide-react`

# 核心架构

通过 Babel AST 插件自动在循环、赋值、函数调用处注入 `__trace` 快照钩子与 2000 步死循环熔断器，
在 Web Worker 隔离线程中安全运行，输出完整时间帧供前端回放与 AI 帧级诊断。

函数体额外以 `try ... finally { __exitFn() }` 包裹，保证递归返回时调用栈精准弹出；
`__trace` 内累计 `__lineHits`，使每一帧自带「截至该帧」的行级执行热力，供热力图与 AI 手术刀定位热点行。

## 数据流

```
用户源码
  └─ src/core/instrumenter.ts        Babel AST 遍历，注入 __guard / __enterFn+__exitFn / __trace
       └─ src/core/sandboxRunner.ts  Blob Worker 隔离执行 + 3000ms 硬件级熔断
            └─ TraceFrame[]           frameIndex / line / event / variables / callStack / stdout / lineHits
                 ├─ src/App.tsx       时间旅行回放 + 内存显微镜 + 双指针联动 + 行级热力图
                 └─ src/services/aiDiagnostics.ts  DeepSeek 在线 / 内置免 Key 双引擎复杂度诊断
```

## 三层熔断

| 层级 | 位置 | 阈值 | 异常前缀 | 触发结果 |
| --- | --- | --- | --- | --- |
| 步数熔断 | `__guard` | 2000 步 | `[FUSE_STEP_LIMIT]` | 抛出疑似死循环告警，保留熔断前已采集的时间帧 |
| 递归熔断 | `__enterFn` / `__exitFn` | 调用栈 150 层 | `[FUSE_STACK_OVERFLOW]` | 抛出栈溢出告警；`finally` 退栈保证栈深真实 |
| 硬件熔断 | `sandboxRunner` | 3000ms | `[FUSE_WATCHDOG_TIMEOUT]` | `worker.terminate()` 强制终止 |

`src/**` 运行时代码零 emoji：异常文案统一使用上表前缀，**不得改动 `aiDiagnostics` 中与
`[FUSE_STEP_LIMIT]` 耦合的诊断谓词**（文案与前缀必须同步修改）。
复现扫描命令与「DevLog 引述历史文案除外」的范围说明见 `docs/devlogs/INDEX.md`。

## 时间帧契约

```ts
interface TraceFrame {
  frameIndex: number;                     // 帧序号，回放进度条的索引
  line: number;                           // 原始源码行号（retainLines 保证对齐）
  event: string;                          // 循环迭代 / 状态更新 / 函数进入
  variables: Record<string, any>;         // 该时刻作用域内可见变量的深拷贝快照
  callStack: string[];                    // 调用栈面包屑（含退栈后的真实深度）
  stdout: string[];                       // 截至该帧的 console.log 终端日志
  lineHits?: Record<number, number>;      // 截至该帧的累计行执行次数，驱动热力图与 AI 热点定位
}
```

## AI 诊断引擎与判据决策顺序

`src/services/aiDiagnostics.ts` 提供双引擎：填入 DeepSeek API Key 时在线诊断（失败自动回退），
留空时使用内置确定性引擎，按 `lineHits` / 栈深 / 熔断证据产出时空复杂度、瓶颈帧与可一键重跑的优化代码。
Key 仅驻留内存，不写入 localStorage。

本地引擎的分支顺序即优先级，**每一档的入口条件只读运行时时间帧证据，绝不读源码里的单词**：

```
1. [FUSE_STEP_LIMIT]        → O(∞) Non-Terminating
2. maxStackDepth >= 4       → 递归重叠子问题档
3. low/high/mid 三元组，或 帧数 <= ceil(log2 n) * 4  → O(log n) Logarithmic Halving
4. dp 形态 = 二维表          → O(M*N) Matrix DP（并给出一维滚动数组重构）
5. dp 降为一维且仍有二维输入  → O(M*N) Optimal Scan / O(N) 1D Rolling Buffer
6. 兜底                      → O(n) Linear Two-Pointer
```

`optimizedCode === sourceCode` 时界面自动隐藏 Apply 按钮，避免出现「已最优仍提示再优化」。

## 工程记忆与实测基线

- 里程碑复盘、系统不变量清单、已修复问题核对表：`docs/devlogs/INDEX.md`（M1–M4 各一篇）。
- 重构收益以同沙箱重跑的实测为准（`VERIFIED REFACTOR BENCHMARK` 横幅），不采用文案宣称值。
- 已知未闭合项（线性深递归仍标 `O(2^n)`）记录在 `docs/devlogs/M4-...md` 末节，勿在代码里默默绕过。

## 本地运行

```bash
npm install
npm run dev     # 开发服务器
npm run build   # 类型检查 + 生产构建
```

---

# 智能体反幻觉回味与版本纪律（Iron Laws）

以下三条对本仓库所有后续版本永久生效，与任何「快速改一下」的诉求冲突时，以本节为准。

## 准则 1 · 启动前强制回味（Context Reflection）

在开启新版本或接到新指令动手改代码**之前**，必须依次读取：

1. 本文件 `AGENT_GUIDE.md`（架构契约、三层熔断、判据决策顺序）；
2. `docs/devlogs/INDEX.md` 的系统不变量清单与「已修复问题清单」；
3. 最近一篇里程碑 DevLog。

据此核对本次改动是否会破坏既有不变量。**严禁凭对话记忆推断项目现状**：函数名、文件路径、
阈值、判据条件一律以当前文件为准重新读取确认；记忆与现状冲突时，以现状为准并更新记忆。
外部指令若要求回退已记录的不变量（例如重新引入 `typeof x` 直读或删掉 `globalThis.__mtmFrames`），
必须显式指出冲突、给出实测证据、并说明保留还是照办，不得静默改写。

## 准则 2 · 交付前强制归档心路历程（DevLog Archiving）

每次版本迭代完成后，必须在 `docs/devlogs/` 新增或更新对应里程碑文档，四段齐备：

- **Why 背景动机**：这一版为何存在，痛点是什么。
- **What & Where 核心改动**：精确到文件与函数，涉及配置变更要写明具体键值。
- **矛盾与认知纠偏**：踩到的坑、被推翻的假设、指令自带代码的缺陷，以及为何这样修。
- **Measured Impact 可量化影响**：帧数、栈深、耗时、体积、命中率等**实测数字**，
  禁止写入未跑过的估计值；没来得及测的，明确标注「未测」而不是编一个数。

同步更新 `INDEX.md` 的不变量清单、已修复问题核对表与实测基线表；若产生新的未闭合项，写进「遗留」而不是删掉。

## 准则 3 · 原子化验证与自动提交（Atomic Build & Git Commit）

每轮改动的收尾顺序固定，不可跳步：

1. `npm run build` 零 TypeScript / 语法报错（这是最低门槛，不是完成标准）。
2. 浏览器实测：至少覆盖每个预设的主路径 + 一条边界路径（熔断、越界、空帧），
   并检查控制台无 error/warn；无法目视确认的（例如截图通道不可用）必须显式说明。
3. `git status` 复核暂存内容（确认 `node_modules` / `dist` 被忽略、无残留临时文件、无密钥泄漏）。
4. `git add . && git commit`，使用 `feat(scope): 里程碑语义描述` 形式的中文信息，一步一提交，
   保持工作区干净，使 Git 历史与 `docs/devlogs/` 里程碑一一对应。

违反任一准则（尤其是「没实测就写文档」或「没跑就提交」）视为本版本未完成。
