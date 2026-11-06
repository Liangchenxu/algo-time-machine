# 项目名称

AlgoTimeMachine —— 浏览器端 AST 自动插桩时间旅行调试器与 AI 复杂度诊断台

# 技术栈

Vite + React 18 + TypeScript + Tailwind CSS + `@babel/standalone` + `lucide-react`

# 核心架构

通过 Babel AST 插件自动在循环、赋值、函数调用处注入 `__trace` 快照钩子与 2000 步死循环熔断器，
在 Web Worker 隔离线程中安全运行，输出完整时间帧供前端回放与 AI 帧级诊断。

## 数据流

```
用户源码
  └─ src/core/instrumenter.ts     Babel AST 遍历，注入 __guard / __enterFn / __trace
       └─ src/core/sandboxRunner.ts  Blob Worker 隔离执行 + 3000ms 硬件级熔断
            └─ TraceFrame[]           frameIndex / line / event / variables / callStack / stdout
                 └─ src/App.tsx       时间旅行回放 + 内存显微镜 + 双指针联动渲染
```

## 三层熔断

| 层级 | 位置 | 阈值 | 触发结果 |
| --- | --- | --- | --- |
| 步数熔断 | `__guard` | 2000 步 | 抛出死循环告警，保留熔断前已采集的时间帧 |
| 递归熔断 | `__enterFn` | 调用栈 150 层 | 抛出栈溢出告警 |
| 硬件熔断 | `sandboxRunner` | 3000ms | `worker.terminate()` 强制终止 |

## 时间帧契约

```ts
interface TraceFrame {
  frameIndex: number;                     // 帧序号，回放进度条的索引
  line: number;                           // 原始源码行号（retainLines 保证对齐）
  event: string;                          // 循环迭代 / 状态更新 / 函数进入
  variables: Record<string, any>;         // 该时刻作用域内可见变量的深拷贝快照
  callStack: string[];                    // 调用栈面包屑
  stdout: string[];                       // 截至该帧的 console.log 终端日志
}
```

## 本地运行

```bash
npm install
npm run dev     # 开发服务器
npm run build   # 类型检查 + 生产构建
```
