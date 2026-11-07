import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Cpu,
  Terminal,
  Layers,
  Code2,
  FileCode,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  GitCommit,
  Eye,
  Zap,
  ChevronRight,
  KeyRound,
  ListTree,
  CircleDot,
  X,
} from 'lucide-react';
import { runInSandbox } from './core/sandboxRunner';
import { instrumentCode, TraceFrame } from './core/instrumenter';
import {
  runAIDiagnostics,
  analyzeTraceMetrics,
  AIDiagnosticReport,
} from './services/aiDiagnostics';

interface PresetItem {
  id: string;
  title: string;
  category: string;
  complexity: string;
  code: string;
}

interface BaselineMetrics {
  framesCount: number;
  maxStackDepth: number;
  timeComplexity: string;
  spaceComplexity: string;
  execTimeMs: number;
  /** 基线那一跑是否被 [FUSE_*] 熔断截断：截断帧数与完整帧数不可做百分比比较 */
  wasFused: boolean;
}

const PRESETS: PresetItem[] = [
  {
    id: 'rainwater',
    title: 'Trapping Rain Water',
    category: 'Two Pointers · 1D Water Simulation',
    complexity: 'O(n)',
    code: `// 双指针接雨水：O(n) 时间，O(1) 原地空间
const height = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1];
let left = 0;
let right = height.length - 1;
let leftMax = 0;
let rightMax = 0;
let water = 0;

while (left < right) {
  if (height[left] < height[right]) {
    if (height[left] >= leftMax) {
      leftMax = height[left];
    } else {
      water += leftMax - height[left];
    }
    left++;
  } else {
    if (height[right] >= rightMax) {
      rightMax = height[right];
    } else {
      water += rightMax - height[right];
    }
    right--;
  }
}
console.log("Total trapped water =", water);`,
  },
  {
    id: 'dp-matrix',
    title: 'Min Path Sum (2D DP)',
    category: '2D Matrix Tabulation · Crosshair',
    complexity: 'O(M·N)',
    code: `// 二维动态规划：最小路径和（实时渲染 2D 状态转移矩阵）
const grid = [
  [1, 3, 1, 2],
  [1, 5, 1, 3],
  [4, 2, 1, 1]
];
const dp = [
  [1, 4, 5, 7],
  [2, 0, 0, 0],
  [6, 0, 0, 0]
];

for (let r = 1; r < 3; r++) {
  for (let c = 1; c < 4; c++) {
    const fromTop = dp[r - 1][c];
    const fromLeft = dp[r][c - 1];
    dp[r][c] = Math.min(fromTop, fromLeft) + grid[r][c];
  }
}
console.log("Min path sum =", dp[2][3]);`,
  },
  {
    id: 'binary-search',
    title: 'Binary Search Bounds',
    category: 'Divide & Conquer · Interval Shrink',
    complexity: 'O(log n)',
    code: `// 二分查找区间折半：观察 low / mid / high 指针收敛
const nums = [2, 5, 8, 12, 16, 23, 38, 45, 56, 72, 91];
const target = 23;
let low = 0;
let high = nums.length - 1;
let foundIndex = -1;

while (low <= high) {
  let mid = Math.floor((low + high) / 2);
  let guess = nums[mid];
  if (guess === target) {
    foundIndex = mid;
    break;
  } else if (guess < target) {
    low = mid + 1;
  } else {
    high = mid - 1;
  }
}
console.log("Target index =", foundIndex);`,
  },
  {
    id: 'fib-tree',
    title: 'Naive Fibonacci Tree',
    category: 'Recursion Stack · O(2^n) Bottleneck',
    complexity: 'O(2^n)',
    code: `// 暴力递归斐波那契：暴露重叠子问题与调用栈反复压栈退栈
function fib(n) {
  if (n <= 1) {
    return n;
  }
  let leftBranch = fib(n - 1);
  let rightBranch = fib(n - 2);
  return leftBranch + rightBranch;
}

let result = fib(5);
console.log("fib(5) =", result);`,
  },
  {
    id: 'infinite-loop',
    title: 'Infinite Loop Guard',
    category: 'Safety Fuse · 2000-Step Trap',
    complexity: 'O(∞) Trap',
    code: `// 死循环熔断压测：故意省略指针推进，验证 AST __guard 2000步安全拦截
let count = 0;
let anomalySum = 1;

while (count < 10) {
  anomalySum = (anomalySum * 2) % 997;
  // Bug: count 未递增，控制流陷入死循环自环
}
console.log("Unreachable:", anomalySum);`,
  },
];

const POINTER_NAMES = new Set([
  'i',
  'j',
  'k',
  'left',
  'right',
  'low',
  'high',
  'mid',
  'r',
  'c',
  'slow',
  'fast',
  'cursor',
]);

const POINTER_COLORS: Record<string, string> = {
  left: 'bg-sky-500/20 text-sky-300 border-sky-500/50',
  right: 'bg-violet-500/20 text-violet-300 border-violet-500/50',
  low: 'bg-sky-500/20 text-sky-300 border-sky-500/50',
  high: 'bg-violet-500/20 text-violet-300 border-violet-500/50',
  mid: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
  i: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
  j: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
  r: 'bg-sky-500/20 text-sky-300 border-sky-500/50',
  c: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
};

interface CallTreeNode {
  id: number;
  signature: string;
  depth: number;
  entryFrameIndex: number;
  exitFrameIndex: number;
  parentId: number | null;
  isDuplicate: boolean;
  duplicateCount: number;
}

/**
 * 由 frames 的 callStack 演化序列确定性还原调用树：
 * 相邻两帧取最长公共前缀，前缀之后的旧节点即已退栈（补 exitFrameIndex），
 * 新尾项逐个建档并挂到当前栈顶节点下。同签名第 2 次及以后出现即标记 DUP，
 * 因此重叠子问题是实测计数，而不是对源码的猜测。
 */
function buildCallTree(frames: TraceFrame[]): { nodes: CallTreeNode[]; signatureHits: Record<string, number> } {
  const nodes: CallTreeNode[] = [];
  const stackIds: number[] = [];
  const signatureHits: Record<string, number> = {};
  let prevCs: string[] = [];

  frames.forEach((f, idx) => {
    const cs = f.callStack;
    let common = 0;
    while (common < cs.length && common < prevCs.length && cs[common] === prevCs[common]) common++;

    while (stackIds.length > common) {
      const id = stackIds.pop() as number;
      nodes[id].exitFrameIndex = idx;
    }
    for (let i = common; i < cs.length; i++) {
      const signature = cs[i];
      if (signature !== 'main()') {
        signatureHits[signature] = (signatureHits[signature] || 0) + 1;
      }
      const node: CallTreeNode = {
        id: nodes.length,
        signature,
        depth: i,
        entryFrameIndex: idx,
        exitFrameIndex: -1,
        parentId: i > 0 ? stackIds[stackIds.length - 1] : null,
        isDuplicate: signature !== 'main()' && (signatureHits[signature] || 0) > 1,
        duplicateCount: signatureHits[signature] || 1,
      };
      nodes.push(node);
      stackIds.push(node.id);
    }
    prevCs = cs;
  });

  while (stackIds.length > 0) {
    const id = stackIds.pop() as number;
    nodes[id].exitFrameIndex = Math.max(0, frames.length - 1);
  }

  return { nodes, signatureHits };
}

const SVG_NODE_W = 78;
const SVG_NODE_H = 22;
const SVG_ROW_H = 46;

interface SvgPosition {
  node: CallTreeNode;
  x: number;
  y: number;
}

interface SvgEdge {
  key: string;
  childId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 确定性 2D 树布局：后序遍历给叶子分配递增水平槽位，父节点 x 取其所有子节点 x 的算术平均，
 * y = (depth - minDepth) * 46 + 24。仅对前 40 个激活节点构图；父节点不在集合内时该节点升为根，
 * 因此 main() 根帧与长链熔断截断都不会把整棵树挤成一列。
 */
function layoutCallTree(nodes: CallTreeNode[], limit = 40) {
  const selected = nodes.filter((n) => n.signature !== 'main()').slice(0, limit);
  const selectedIds = new Set(selected.map((n) => n.id));
  const childrenOf = new Map<number, CallTreeNode[]>();
  const roots: CallTreeNode[] = [];

  for (const n of selected) {
    const parentId = n.parentId !== null && selectedIds.has(n.parentId) ? n.parentId : null;
    if (parentId === null) roots.push(n);
    else childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), n]);
  }

  const minDepth = selected.length ? Math.min(...selected.map((n) => n.depth)) : 1;
  const positions: SvgPosition[] = [];
  const coordById = new Map<number, { x: number; y: number }>();
  let slot = 0;

  const visit = (n: CallTreeNode): number => {
    const kids = childrenOf.get(n.id) ?? [];
    const x = kids.length === 0 ? slot++ : kids.map(visit).reduce((a, b) => a + b, 0) / kids.length;
    const pos = {
      x: x * SVG_NODE_W + SVG_NODE_W / 2 + 6,
      y: (n.depth - minDepth) * SVG_ROW_H + 24,
    };
    coordById.set(n.id, pos);
    positions.push({ node: n, ...pos });
    return x;
  };
  roots.forEach(visit);

  const edges: SvgEdge[] = [];
  for (const n of selected) {
    const parentId = n.parentId !== null && selectedIds.has(n.parentId) ? n.parentId : null;
    if (parentId === null) continue;
    const from = coordById.get(parentId);
    const to = coordById.get(n.id);
    if (!from || !to) continue;
    edges.push({
      key: `${parentId}-${n.id}`,
      childId: n.id,
      x1: from.x,
      y1: from.y + SVG_NODE_H / 2,
      x2: to.x,
      y2: to.y - SVG_NODE_H / 2,
    });
  }

  const maxDepth = selected.length ? Math.max(...selected.map((n) => n.depth)) : minDepth;
  return {
    positions,
    edges,
    width: Math.max(slot, 1) * SVG_NODE_W + 12,
    height: (maxDepth - minDepth + 1) * SVG_ROW_H + 16,
    truncated: selected.length < nodes.filter((n) => n.signature !== 'main()').length,
    selectedCount: selected.length,
  };
}

interface DevlogEntry {
  tag: string;
  commit: string;
  doc: string;
  title: string;
  why: string;
  what: string[];
  conflicts: string[];
  impact: string[];
}

const DEVLOGS: DevlogEntry[] = [
  {
    tag: 'M1',
    commit: '6f94a32',
    doc: 'docs/devlogs/M1-genesis-ast-sandbox.md',
    title: 'AST 自动插桩内核与 Blob Worker 时间旅行沙箱',
    why: '评委需要零门槛演示任意算法源码，但主线程直接 eval 会被死循环与爆栈冻结整个页面。',
    what: [
      'instrumenter.ts：循环头注入 __guard + 循环迭代快照，语句后注入状态更新快照，函数体注入 __enterFn。',
      '运行时注入 __clone 深拷贝、__trace 五元组时间帧与 console 劫持，stdout 随帧快照。',
      'sandboxRunner.ts：Blob Worker 隔离执行 + 3000ms watchdog + URL.revokeObjectURL 回收。',
    ],
    conflicts: [
      'TDZ ReferenceError：scope.bindings 含同块内稍后声明的 let/const，typeof 提前读取即崩，改为 try/catch 闭包安全读取。',
      '熔断后帧丢失：new Function 作用域内的 __frames 在 worker catch 不可见，挂载 globalThis.__mtmFrames 才能回收崩溃现场。',
      'Program 未插桩导致顶层语句零帧、stdout 永不可见，visitor 扩展为 BlockStatement|Program。',
    ],
    impact: [
      '双指针接雨水采集 41 帧，沙箱执行 1ms。',
      '死循环压测触发 2000 步熔断并回收 1555 帧现场快照。',
      'npm run build 零 TypeScript 报错。',
    ],
  },
  {
    tag: 'M2',
    commit: '638022a',
    doc: 'docs/devlogs/M2-stack-unwinding-and-profiler.md',
    title: 'AST 递归退栈纠偏、行级热力与 AI 帧级诊断',
    why: '架构师复核指出递归函数返回后调用栈只增不减，callStack 失真使栈深指标无法用于复杂度诊断。',
    what: [
      '函数体改写为 try...finally { __exitFn() }，并以 __instrumented 标记防止重复插桩。',
      '__trace 内累计 __lineHits，每一帧携带「截至该帧」的行级执行热力快照。',
      'aiDiagnostics.ts 双引擎：DeepSeek 在线 + 免 Key 确定性引擎，产出热点行 / 峰值栈深 / 瓶颈帧。',
    ],
    conflicts: [
      'M2 实例代码回退了 TDZ 安全读取并删除 globalThis 帧回收，合并时保留修复，否则预设 1/2 第二帧即崩、熔断后 0 帧。',
      '实例 visitor 仅剩 BlockStatement，fib 预设只有 67 帧且末帧无法证明退栈；恢复 Program 插桩后 69 帧、末帧调用栈精确回到 main()。',
      'fetch URL 被 Markdown 链接化损坏；新增 engine 字段避免在线失败时界面谎称 DeepSeek 结果。',
    ],
    impact: [
      'fib(8)：69 帧、峰值栈深 9 层、末帧 callStack = [main()]。',
      '一键优化：暴力递归 69 → 14 帧（-80%）；死循环 1555 → 27 帧（-98%）。',
    ],
  },
  {
    tag: 'M3',
    commit: '41ad788',
    doc: 'docs/devlogs/M3-industrial-workbench-and-2d-dp.md',
    title: '工业级全屏 IDE 重铸、2D DP 矩阵、帧间 Diff 与火焰图',
    why: '去掉塑料感演示页，改为 100vh 高信息密度工作台，并补齐二维 DP、帧间突变差分与栈深火焰轨。',
    what: [
      '12 栏工作台：源码热力 + AST IR 透视 / 堆与指针显微镜 / AI 复杂度诊断 / 火焰图时间轴。',
      '2D 矩阵十字准星 Cursor [r][c]、单元格级帧间 amber 差分、Δ N State Mutation 计数。',
      '火焰图跳帧、Space 与方向键控盘、5 个预设 segmented 切换。',
    ],
    conflicts: [
      '4 处机械损坏：useState 与 useRef 泛型被 Markdown 吞成 "null |>"；fetch URL 再次链接化；5 个未使用 import 在 noUnusedLocals 下直接编译失败；h-13 与 py-0.2 不在 Tailwind v3 标度内被静默丢弃，改为 extend.spacing 补 3.25rem / 0.05rem 并在产物 CSS 中验证。',
      'fib 字符串判据导致点击 Apply 后 O(n) 递推版仍报 O(2^n)，并输出 "Frames: 14 -> 15 (-50% Overhead)" 自相矛盾；递归判据收紧为运行时 maxStackDepth >= 4，二维判据改为运行时表形态探测。',
      '隐藏视口下 requestAnimationFrame 不触发导致计时脚本挂起，改用宏任务计时。',
    ],
    impact: [
      '死循环预设 1334 帧全量渲染为火焰条，跳帧重渲 14-19ms。',
      'DP 预设 29 帧：双矩阵同屏、十字准星命中、Δ 1 突变与 amber 写入格对齐。',
      '界面零 Emoji（App.tsx 与 aiDiagnostics.ts 扫描无 emoji）。',
    ],
  },
  {
    tag: 'M4',
    commit: '23e0a6d',
    doc: 'docs/devlogs/M4-logarithmic-heuristics-and-governance.md',
    title: '算法判据闭环、重构实测基准与工程治理制度',
    why: '判据、度量与项目记忆三者都还依赖人肉判断：复杂度靠源码单词、收益靠文案宣称、跨版本约束靠对话记忆。',
    what: [
      'aiDiagnostics.ts：新增 O(log n) 折半判据（low/high/mid 三元组为结构证据，帧数 <= ceil(log2 n) * 4 为量级证据）。',
      'aiDiagnostics.ts：以 dp 在时间帧里的真实维度形态区分 matrix2d 与 rolling1d，重构后自动切换为 O(N) 1D Rolling Buffer 并让 Apply 按钮退场。',
      '异常文案标准化为 [FUSE_STEP_LIMIT] / [FUSE_STACK_OVERFLOW] / [FUSE_WATCHDOG_TIMEOUT]，诊断谓词同步改读前缀。',
      'App.tsx：baselineMetrics 在点击 Apply 瞬间锁定、切换预设即清空，重跑后渲染 VERIFIED REFACTOR BENCHMARK 实测横幅；Spec 弹窗升级为 Architecture / DevLog 双标签页。',
      '建立 docs/devlogs/（INDEX + M1-M4）与 AGENT_GUIDE.md 的三条 Iron Laws。',
    ],
    conflicts: [
      '死循环诊断谓词原本匹配中文「死循环」，去掉 emoji 与前缀改造同时会失配并静默退化为 O(n) 报告，已把谓词与 [FUSE_STEP_LIMIT] 字面量绑定并写入不变量清单。',
      '一维 dp 优化样例仍保留二维只读 grid，若继续用 includes(grid) 判据就会在重构后误报 2D Tabulation，改为读 dp 自身形态。',
      '实测发现线性深递归 depth(400) 触发 [FUSE_STACK_OVERFLOW] 后被判为 O(2^n)：入口条件已换成运行时栈深，但该分支结论文案仍是指数级，属未闭合项，如实记录而非偷偷绕过。',
    ],
    impact: [
      'Binary Search 由 O(n) 修正为 O(log n) Logarithmic Halving：10 帧、空间 11、探测 1 次、对数预算 16。',
      'Min Path Sum 重构闭环：29 帧 Matrix DP → 15 帧 Optimal Scan，横幅 FRAMES: 29 → 15 (-48.3%)，PEAK STACK 1 → 1。',
      'Naive Fibonacci：文案宣称 31 → 15（-52%），同沙箱实测 31 → 14（-54.8%）、PEAK STACK 6 → 2，实测优于宣称并以实测展示。',
      '熔断链路：1334 帧步数熔断与 149 帧栈溢出熔断均保留现场；全仓四个源文件 emoji 扫描全部为 none。',
    ],
  },
  {
    tag: 'M5',
    commit: 'ef934b0',
    doc: 'docs/devlogs/M5-call-tree-and-breakpoints.md',
    title: '参数化调用栈签名、重叠子问题精确取证、调用树拓扑与行级断点',
    why: 'M4 收尾时留下一个诚实的漏洞：depth(400) 这类单链深递归被报成 O(2^n)，因为递归分支的结论文案写死为指数级；同时调用栈只显示函数名不显示实参，重叠子问题只能靠文字推断，无法在界面上指给评委看。',
    what: [
      'instrumenter.ts：从 path.node.params 取 Identifier 形参，注入 __enterFn(name, line, [args])；运行时 __sig 生成 fib(5) / dfs(1,2) 形态签名，单实参序列化截断 24 字符，无参为 fn()。',
      'aiDiagnostics.ts：analyzeTraceMetrics 增加 signatureHits / redundantCallCount / topDuplicates / sampleArg；递归档按证据拆成 A/B 两支——redundantCallCount >= 2 判 O(2^n) Exponential，否则判 O(n) Linear Recursion 并给出尾递归/迭代改写脚手架与 [TAIL_RECURSION_CANDIDATE] 标签。',
      'App.tsx：buildCallTree 由相邻帧 callStack 的最长公共前缀确定性还原调用树节点（id / signature / depth / entryFrameIndex / exitFrameIndex / parentId / isDuplicate / duplicateCount），显微镜顶部新增 Call-Tree Topology 面板，三态着色（active 电光蓝 / DUP 玫红 / retired 暗灰，未来节点 opacity-40），点击节点瞬移到它的进入帧。',
      'App.tsx：行号改为可点击按钮，断点为 6px 正红实心圆点 + 行底淡红；火焰条顶部渲染亮红断点标记；新增 Continue to Breakpoint 按钮与 F8 / b 快捷键，向后扫描第一个命中断点的帧。',
    ],
    conflicts: [
      '裁决书要求用「相邻帧栈深增量」识别函数进入，实测发现兄弟调用（fib(4) 退栈后 fib(3) 在同等深度再次压栈）栈深不变，增量法会整段漏计重复求值；改为以「函数进入」事件帧的栈顶签名计数，才拿到 fib(1) ×5 这类铁证。',
      '调用树还原不能按签名字符串路径建索引（同一签名路径可能被不同兄弟子树复用），改为按前缀差异做 push/pop 事件流建模，每个激活节点拥有独立 id 与真实进出帧区间。',
      '线性递归的迭代改写无法从时间帧反推合并算子（加法还是乘法），因此 optimizedCode 明确标注为脚手架并要求替换 acc 更新式，不伪装成自动正确的重构。',
      '本轮还纠正了两处自伤：一次误删了 interface 的换行、一次误建 scratch-ignore.ts，均在提交前恢复并复核工作区。',
    ],
    impact: [
      'Naive Fibonacci fib(5)：调用栈实测显示 main() → fib(5) 带参签名；调用树 15 个激活节点、9 个 DUP 节点，与 redundantCallCount = 9 完全吻合；点击 fib(1) DUP ×2 (#9) 精确跳到 FRAME 10 / 31。',
      '取证清单实测：fib(1) ×5，fib(2) ×3，fib(0) ×3，fib(3) ×2，累计冗余进入 9 次 —— 分支 A 命中 O(2^n) Exponential。',
      'M4 未闭合项闭环：depth(400) 判为 O(n) Linear Recursion / O(n) Call Stack Depth 150，149 个唯一签名、冗余 0 次、DUP 节点 0 个；fact(6) 判为 O(n) Linear Recursion / Stack Depth 7。',
      '断点实测：L7 激活后行底 rgba(244,63,94,0.13)、6px 红点可见、火焰轨 7 根条带亮红标记；Continue to Breakpoint 从 FRAME 10 前进到 FRAME 11，快捷键 b 再进到 FRAME 17。',
      '调用树容量保护：depth(400) 轨迹 149 次进入仅渲染前 64 个节点并提示总量，避免长链路拖垮一屏。',
    ],
  },
  {
    tag: 'M6',
    commit: '本次提交',
    doc: 'docs/devlogs/M6-svg-call-tree-and-layout-polish.md',
    title: '2D SVG 贝塞尔调用树、线性递归算子自动合成与 771px 分屏精修',
    why: '771×553 分屏截图暴露两类硬伤：每行代码下方一条原生粗灰滚动条，以及 AI 面板标题被挤成四行竖排；同时 M5 留了两条尾巴——扁平缩进的调用树看不出父子拓扑，线性递归的迭代代码要人工替换合并算子。',
    what: [
      'index.css：滚动条全局降为 5px 暗色（轨道 #090B10 / 滑块 #27272a / 圆角 3px）并新增 no-scrollbar；单行代码 span 去掉 overflow-x-auto，改由外层滚动容器统一处理，行容器用 inline-block min-w-full 让热力底色铺满最长行。',
      'App.tsx 顶栏：品牌与按钮全部 shrink-0 + whitespace-nowrap，预设切换器改为 min-w-0 flex-1 overflow-x-auto no-scrollbar，成为唯一可压缩区。',
      'App.tsx AI 面板：Time / Space / Hotspot / Peak stack / Operator 五枚徽章从 h-9 标题栏迁出到面板内部遥测条；标题长尾与冗余计数提示降级为 xl 以上才显示。',
      'App.tsx 调用树：新增 2D SVG Tree 与 Compact List 切换；后序遍历分配叶子槽位、父节点 x 取子节点算术平均、y = depth 差值 * 46 + 24；三次贝塞尔连线区分激活路径与历史路径；节点胶囊带 DUP×n 徽章并可点击跳帧。',
      'aiDiagnostics.ts：sniffCombineOperator 按「标识符 [ + | * ] fn(...)」形态嗅探合并算子，分支 B 分别生成乘法累积、加法累积与纯深度推进三套等价迭代代码，并把嗅探依据回显到界面。',
      'App.tsx：baselineMetrics 增加 wasFused，熔断截断基线与完整重跑之间不再计算帧数百分比，改显示 STATUS: FUSE_ABORTED → COMPLETED 并明确标注不可比。',
    ],
    conflicts: [
      '把标题栏改成 overflow-hidden 后 771px 下确实不折行了，但 Apply 按钮被裁到可视区外（scrollWidth 823 对 clientWidth 448）——「不折行」不等于「可用」。最终用遥测条迁出徽章 + overflow-x-auto no-scrollbar + 长尾文案 xl 分级，压到 scrollWidth == clientWidth == 448。',
      '算子嗅探的操作数只允许标识符，因此 `1 + depth(n - 1)` 匹配不到任何 variant 而正确落到 descent；若按字面补一条数字分支反而会把计数型递归误判成求和。',
      '递归改迭代后帧数上升（fact 7 → 13、depth 截断 149 → 802）是插桩语句变多的真实结果，不做粉饰：收益体现在 PEAK STACK 7 → 2 与 150 → 1，横幅对熔断态显式声明不可比。',
      '本轮自查清掉两处自产缺陷：AI 标题栏一段 engine 字段判空后返回空串的起草残留（该字段 M3 已下线），以及嗅探函数里一条永远不可达的数字操作数分支。',
    ],
    impact: [
      '单行滚动条清零：代码行 span 的 overflow-x 为 visible，12 行与 20 行预设的行高恒为 28px，没有任何行被滚动条撑高。',
      '顶栏 44px 且 scrollWidth == clientWidth == 770，Compile & Trace 与 Spec 两个按钮完整可见；AI 面板标题栏 36px 单行且 Apply 完整可见。',
      'SVG 调用树：fib(5) 渲染 15 个节点组 / 14 条贝塞尔连线 / 9 个 DUP 徽章（与 redundantCallCount = 9 再次互证），viewBox 636×246；点击 DUP fib(3) 精确落到 FRAME 20 / 31，跳帧后激活态为 2 个天蓝节点 + 1 条天蓝连线。',
      '算子合成闭环：fact(6) 生成 acc *= i 迭代，终端实测 factIter(6) = 720；depth(400) 落到 unit descent，终端实测 iterative cursor = 400，与原递归语义一致。',
      '熔断态基准语义：横幅实测 STATUS: FUSE_ABORTED (149f) → COMPLETED (802f) + PEAK STACK: 150 → 1，不再输出误导性百分比。',
      '断点与回归：DP 预设 20 个行号按钮，L14 设断点后 Continue 从 FRAME 10 → 12、F8 再推进到 FRAME 17，火焰轨 6 根亮红标记；Rain 40 帧 / 2 格水体 / 13 枚热力徽章、DP 十字准星 Cursor [1][2] 与 Δ 1 突变均无回归。',
    ],
  },
];

export default function App() {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('rainwater');
  const [sourceCode, setSourceCode] = useState<string>(PRESETS[0].code);
  const [codeTab, setCodeTab] = useState<'source' | 'ast'>('source');
  const [editMode, setEditMode] = useState<boolean>(false);

  const [frames, setFrames] = useState<TraceFrame[]>([]);
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [execTimeMs, setExecTimeMs] = useState<number>(0);
  const [sandboxError, setSandboxError] = useState<string | undefined>(undefined);

  const [aiReport, setAiReport] = useState<AIDiagnosticReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [showArchModal, setShowArchModal] = useState<boolean>(false);
  const [specTab, setSpecTab] = useState<'arch' | 'devlog'>('arch');
  const [devlogIdx, setDevlogIdx] = useState<number>(0);

  // 点击 Apply Refactor 之前锁定一份基准，重跑完成后与当前实测值对齐成收益横幅
  const [baselineMetrics, setBaselineMetrics] = useState<BaselineMetrics | null>(null);

  // 行级断点：行号集合，切换预设时清空（行号语义随源码改变）
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set<number>());
  const [treeView, setTreeView] = useState<'svg' | 'list'>('svg');

  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const executeCode = async (codeToRun: string) => {
    setIsPlaying(false);
    const res = await runInSandbox(codeToRun);
    setExecTimeMs(res.executionTimeMs);
    setSandboxError(res.error);

    if (res.frames && res.frames.length > 0) {
      setFrames(res.frames);
      setCurrentFrameIdx(0);
    } else {
      setFrames([]);
      setCurrentFrameIdx(0);
    }

    setIsAnalyzing(true);
    const report = await runAIDiagnostics(codeToRun, res.frames || [], res.error, apiKey);
    setAiReport(report);
    setIsAnalyzing(false);
  };

  useEffect(() => {
    executeCode(sourceCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    const intervalMs = Math.max(35, Math.round(260 / speed));
    const timer = setInterval(() => {
      setCurrentFrameIdx((prev) => {
        if (prev >= frames.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, speed, frames.length]);

  // 向后扫描第一个命中断点的时间帧并瞬移；前方无命中时保持原位，不做任何猜测性跳转
  const continueToBreakpoint = () => {
    if (breakpoints.size === 0 || frames.length === 0) return;
    setCurrentFrameIdx((prev) => {
      for (let i = prev + 1; i < frames.length; i++) {
        if (breakpoints.has(frames[i].line)) {
          setIsPlaying(false);
          return i;
        }
      }
      return prev;
    });
  };

  const toggleBreakpoint = (line: number) => {
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  };

  // Keyboard shortcuts: Space to toggle play, Left/Right arrows to step frames, F8/b to hit breakpoint
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentFrameIdx((p) => Math.min(frames.length - 1, p + 1));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentFrameIdx((p) => Math.max(0, p - 1));
      } else if (e.code === 'F8' || (e.code === 'KeyB' && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        continueToBreakpoint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [frames, breakpoints]);

  const currentFrame: TraceFrame | undefined = frames[currentFrameIdx];
  const prevFrame: TraceFrame | undefined =
    currentFrameIdx > 0 ? frames[currentFrameIdx - 1] : undefined;

  // Scroll active line into view gently
  useEffect(() => {
    if (activeLineRef.current && !editMode && codeTab === 'source') {
      activeLineRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentFrame?.line, editMode, codeTab]);

  const instrumentedPreview = useMemo(() => {
    try {
      return instrumentCode(sourceCode);
    } catch (e: any) {
      return `// AST Parse Error:\n// ${e.message}`;
    }
  }, [sourceCode]);

  const traceMetrics = useMemo(() => analyzeTraceMetrics(frames), [frames]);
  const callTree = useMemo(() => buildCallTree(frames), [frames]);
  const treeVisible = traceMetrics.maxStackDepth >= 2 && callTree.nodes.length > 1;
  const treeNodes = useMemo(
    () => callTree.nodes.filter((n) => n.signature !== 'main()').slice(0, 64),
    [callTree]
  );
  const treeLayout = useMemo(() => layoutCallTree(callTree.nodes), [callTree]);
  const activeNodeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const n of callTree.nodes) {
      if (n.entryFrameIndex <= currentFrameIdx && (n.exitFrameIndex === -1 || n.exitFrameIndex > currentFrameIdx)) {
        ids.add(n.id);
      }
    }
    return ids;
  }, [callTree, currentFrameIdx]);

  // Compute variable diffs between prevFrame and currentFrame
  const mutatedKeys = useMemo(() => {
    const diffs: Record<string, { prev: any; next: any }> = {};
    if (!currentFrame || !prevFrame) return diffs;
    for (const [k, v] of Object.entries(currentFrame.variables)) {
      const pv = prevFrame.variables[k];
      if (JSON.stringify(pv) !== JSON.stringify(v)) {
        diffs[k] = { prev: pv, next: v };
      }
    }
    return diffs;
  }, [currentFrame, prevFrame]);

  // Separate variables into 2D matrices, 1D arrays, pointers, and scalars
  const categorizedVars = useMemo(() => {
    const matrices2D: { name: string; data: number[][] }[] = [];
    const arrays1D: { name: string; data: any[] }[] = [];
    const scalars: { name: string; value: any; isPointer: boolean }[] = [];
    const numericPointers: Record<string, number> = {};

    if (!currentFrame) return { matrices2D, arrays1D, scalars, numericPointers };

    for (const [k, v] of Object.entries(currentFrame.variables)) {
      if (
        Array.isArray(v) &&
        v.length > 0 &&
        Array.isArray(v[0]) &&
        v.every((row) => Array.isArray(row))
      ) {
        matrices2D.push({ name: k, data: v });
      } else if (Array.isArray(v)) {
        arrays1D.push({ name: k, data: v });
      } else {
        const isPtr = POINTER_NAMES.has(k) && typeof v === 'number';
        if (isPtr) numericPointers[k] = v;
        scalars.push({ name: k, value: v, isPointer: isPtr });
      }
    }
    return { matrices2D, arrays1D, scalars, numericPointers };
  }, [currentFrame]);

  const codeLines = useMemo(() => sourceCode.split('\n'), [sourceCode]);
  const maxLineHitInFrame = useMemo(() => {
    if (!currentFrame?.lineHits) return 1;
    return Math.max(1, ...Object.values(currentFrame.lineHits));
  }, [currentFrame]);

  const handleSelectPreset = (preset: PresetItem) => {
    setSelectedPresetId(preset.id);
    setSourceCode(preset.code);
    setEditMode(false);
    setBaselineMetrics(null);
    setBreakpoints(new Set<number>());
    executeCode(preset.code);
  };

  const handleApplyOptimized = () => {
    if (!aiReport?.optimizedCode) return;
    setBaselineMetrics({
      framesCount: frames.length,
      maxStackDepth: traceMetrics.maxStackDepth,
      timeComplexity: aiReport.timeComplexity,
      spaceComplexity: aiReport.spaceComplexity,
      execTimeMs,
      wasFused: Boolean(sandboxError && sandboxError.includes('[FUSE_')),
    });
    setSourceCode(aiReport.optimizedCode);
    setEditMode(false);
    executeCode(aiReport.optimizedCode);
  };

  const benchmarkDelta = useMemo(() => {
    if (!baselineMetrics || !aiReport) return null;
    const from = baselineMetrics.framesCount;
    const to = frames.length;
    const pct = from > 0 ? ((to - from) / from) * 100 : 0;
    const nowFused = Boolean(sandboxError && sandboxError.includes('[FUSE_'));
    return {
      from,
      to,
      pct,
      baseFused: baselineMetrics.wasFused,
      nowFused,
      /** 基线被截断而重构后完整跑完：帧数不是同一量纲，只报状态与栈深收益 */
      abortedToCompleted: baselineMetrics.wasFused && !nowFused,
      stackFrom: baselineMetrics.maxStackDepth,
      stackTo: traceMetrics.maxStackDepth,
      timeFrom: baselineMetrics.timeComplexity,
      spaceFrom: baselineMetrics.spaceComplexity,
      latencyFrom: baselineMetrics.execTimeMs,
      latencyTo: execTimeMs,
    };
  }, [baselineMetrics, aiReport, frames.length, traceMetrics.maxStackDepth, execTimeMs, sandboxError]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#090A0F] text-zinc-200 flex flex-col font-sans select-none">
      {/* ==================== TOP INDUSTRIAL WORKBENCH BAR (44px) ==================== */}
      <header className="h-11 shrink-0 border-b border-zinc-800/80 bg-[#0C0E14] px-3 flex items-center justify-between gap-3">
        {/* Left Brand & Architecture Badge — 窄视口下不收缩、不折行 */}
        <div className="flex items-center gap-2.5 shrink-0 whitespace-nowrap">
          <div className="w-6 h-6 shrink-0 rounded bg-sky-500/10 border border-sky-500/40 flex items-center justify-center text-sky-400">
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="font-semibold tracking-tight text-xs text-zinc-100 whitespace-nowrap">
              ALGO<span className="text-sky-400">TIME</span>MACHINE
            </span>
            <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline whitespace-nowrap">
              AST-IR v2.4 · WORKER SANDBOX
            </span>
          </div>
        </div>

        {/* Center Segmented Preset Selector — 唯一可横向滚动的压缩区 */}
        <div className="flex items-center bg-zinc-900/90 p-0.5 rounded-md border border-zinc-800/90 min-w-0 flex-1 overflow-x-auto no-scrollbar">
          {PRESETS.map((p) => {
            const active = selectedPresetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPreset(p)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? 'bg-zinc-800 text-sky-300 shadow-sm border border-zinc-700/80'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{p.title}</span>
                <span
                  className={`text-[9px] font-mono px-1 rounded ${
                    active ? 'bg-sky-500/20 text-sky-300' : 'bg-zinc-800/70 text-zinc-500'
                  }`}
                >
                  {p.complexity}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Telemetry & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden xl:flex items-center gap-3 px-2.5 py-1 rounded bg-zinc-900/70 border border-zinc-800/80 text-[11px] font-mono whitespace-nowrap">
            <span className="text-zinc-400">
              LATENCY <strong className="text-emerald-400">{execTimeMs}ms</strong>
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-400">
              FRAMES <strong className="text-sky-400">{frames.length}</strong>
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-400">
              PEAK STACK <strong className="text-violet-400">{traceMetrics.maxStackDepth}</strong>
            </span>
          </div>

          <button
            onClick={() => executeCode(sourceCode)}
            className="px-2.5 py-1 shrink-0 whitespace-nowrap rounded bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold text-[11px] flex items-center gap-1.5 transition shadow-sm"
          >
            <Zap className="w-3 h-3 fill-current" />
            <span>Compile & Trace</span>
          </button>

          <button
            onClick={() => setShowArchModal(true)}
            className="px-2.5 py-1 shrink-0 whitespace-nowrap rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/80 text-[11px] flex items-center gap-1.5 transition"
          >
            <GitCommit className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden md:inline">Qoder Engineering Spec</span>
          </button>
        </div>
      </header>

      {/* ==================== SANDBOX FUSE TRIPPED BANNER ==================== */}
      {sandboxError && (
        <div className="bg-rose-950/80 border-b border-rose-500/40 px-4 py-1.5 flex items-center justify-between text-xs text-rose-200 shrink-0">
          <div className="flex items-center gap-2 font-mono">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{sandboxError}</span>
          </div>
          <span className="text-[11px] font-mono text-rose-300/80">
            Pre-crash trace preserved ({frames.length} frames)
          </span>
        </div>
      )}

      {/* ==================== MAIN SPLIT IDE WORKBENCH ==================== */}
      <div className="flex-1 min-h-0 grid grid-cols-12 divide-x divide-zinc-800/80">
        {/* ---------- LEFT PANE (5 COLS): SOURCE HEATMAP & AST IR INSPECTOR ---------- */}
        <div className="col-span-5 flex flex-col min-h-0 bg-[#0B0D13]">
          {/* Subheader */}
          <div className="h-9 px-3 border-b border-zinc-800/80 flex items-center justify-between bg-[#0E1118]">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCodeTab('source')}
                className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition ${
                  codeTab === 'source'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Source & Heatmap</span>
              </button>
              <button
                onClick={() => {
                  setCodeTab('ast');
                  setEditMode(false);
                }}
                className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition ${
                  codeTab === 'ast'
                    ? 'bg-zinc-800 text-amber-300'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>Babel AST Transformed IR</span>
              </button>
            </div>

            {codeTab === 'source' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500">
                  ACTIVE <strong className="text-sky-400">L{currentFrame?.line || 1}</strong>
                </span>
                <button
                  onClick={() => setEditMode((e) => !e)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                    editMode
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  {editMode ? 'Done Editing' : 'Edit Code'}
                </button>
              </div>
            )}
          </div>

          {/* Code Body */}
          <div className="flex-1 min-h-0 overflow-auto font-mono text-xs relative">
            {codeTab === 'ast' ? (
              <pre className="p-3 text-[11px] leading-relaxed text-amber-200/80 whitespace-pre-wrap select-text">
                {instrumentedPreview}
              </pre>
            ) : editMode ? (
              <textarea
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                spellCheck={false}
                className="w-full h-full bg-[#090B10] text-zinc-100 p-3 font-mono text-xs leading-6 focus:outline-none resize-none select-text"
              />
            ) : (
              <div className="inline-block min-w-full py-2">
                {codeLines.map((lineText, idx) => {
                  const lineNum = idx + 1;
                  const isCurrentLine = currentFrame?.line === lineNum;
                  const hitCount = currentFrame?.lineHits?.[lineNum] || 0;
                  const heatRatio = hitCount > 0 ? hitCount / maxLineHitInFrame : 0;
                  const isBreakpoint = breakpoints.has(lineNum);
                  const heatAlpha = !isCurrentLine && hitCount > 0 ? Math.min(0.16, heatRatio * 0.16) : 0;
                  const bpAlpha = isBreakpoint && !isCurrentLine ? 0.13 : 0;

                  return (
                    <div
                      key={lineNum}
                      ref={isCurrentLine ? activeLineRef : null}
                      className={`group flex items-center px-2 py-0.5 leading-6 transition-colors relative ${
                        isCurrentLine
                          ? 'bg-sky-500/15 border-l-2 border-sky-400'
                          : 'border-l-2 border-transparent hover:bg-zinc-900/60'
                      }`}
                      style={
                        heatAlpha > 0 || bpAlpha > 0
                          ? { backgroundColor: `rgba(244, 63, 94, ${Math.max(heatAlpha, bpAlpha)})` }
                          : undefined
                      }
                    >
                      {/* Line Number + Breakpoint Toggle */}
                      <button
                        onClick={() => toggleBreakpoint(lineNum)}
                        title={isBreakpoint ? `Remove breakpoint at L${lineNum}` : `Set breakpoint at L${lineNum}`}
                        className={`relative w-8 shrink-0 cursor-pointer pr-2 text-right text-[11px] select-none ${
                          isCurrentLine ? 'text-sky-400 font-bold' : 'text-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <span
                          className={`absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-opacity ${
                            isBreakpoint
                              ? 'bg-rose-500 opacity-100'
                              : 'bg-rose-500/35 opacity-0 group-hover:opacity-100'
                          }`}
                        />
                        {lineNum}
                      </button>

                      {/* Execution Hit Heatmap Pill */}
                      <div className="w-12 shrink-0 flex items-center">
                        {hitCount > 0 && (
                          <span
                            className={`px-1 py-0.2 rounded text-[9px] font-mono leading-tight ${
                              heatRatio > 0.65
                                ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                                : 'bg-zinc-800/90 text-zinc-400'
                            }`}
                          >
                            {hitCount}x
                          </span>
                        )}
                      </div>

                      {/* Code Text：单行严禁 overflow-x-auto，由外层滚动容器统一处理横向溢出 */}
                      <span
                        className={`whitespace-pre ${
                          isCurrentLine ? 'text-zinc-50 font-medium' : 'text-zinc-300'
                        }`}
                      >
                        {lineText || ' '}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Left Bottom Call Stack & Stdout Strip */}
          <div className="h-32 shrink-0 border-t border-zinc-800/80 bg-[#090B10] flex flex-col">
            <div className="px-3 py-1 border-b border-zinc-800/60 flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-violet-400" />
                CALL STACK FRAMES ({currentFrame?.callStack.length || 0})
              </span>
              <span>STDOUT STREAM</span>
            </div>
            <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-zinc-800/60 overflow-hidden">
              {/* Call stack pills */}
              <div className="p-2 overflow-y-auto flex flex-wrap content-start gap-1">
                {currentFrame?.callStack.map((fn, i) => {
                  const isTop = i === currentFrame.callStack.length - 1;
                  return (
                    <div key={i} className="flex items-center gap-1 text-[11px] font-mono">
                      {i > 0 && <ChevronRight className="w-3 h-3 text-zinc-600" />}
                      <span
                        className={`px-1.5 py-0.5 rounded border ${
                          isTop
                            ? 'bg-violet-500/20 text-violet-200 border-violet-500/50 font-semibold'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                        }`}
                      >
                        {fn}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Console output */}
              <div className="p-2 overflow-y-auto font-mono text-[11px] text-emerald-400/90 space-y-0.5">
                {currentFrame?.stdout.length ? (
                  currentFrame.stdout.map((log, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Terminal className="w-3 h-3 text-zinc-600 shrink-0" />
                      <span>{log}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-zinc-600 text-[10px]">
                    // Waiting for console.log emission...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ---------- RIGHT PANE (7 COLS): VISUAL MEMORY CANVAS + AI SURGICAL PROFILER ---------- */}
        <div className="col-span-7 flex flex-col min-h-0 bg-[#090A0F]">
          {/* TOP RIGHT (58%): MEMORY MICROSCOPE (2D MATRIX + 1D POINTERS + MUTATION DIFF) */}
          <div className="h-[58%] flex flex-col min-h-0 border-b border-zinc-800/80">
            <div className="h-9 px-3 border-b border-zinc-800/80 bg-[#0E1118] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Heap & Pointer State Microscope</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {currentFrame?.event || 'Idle'}
                </span>
              </div>

              {/* Live Mutation Diff Counter */}
              <div className="flex items-center gap-2 text-[11px] font-mono">
                {Object.keys(mutatedKeys).length > 0 ? (
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Δ {Object.keys(mutatedKeys).length} State Mutation(s) in Frame #{currentFrameIdx}
                  </span>
                ) : (
                  <span className="text-zinc-500">No state delta</span>
                )}
              </div>
            </div>

            {/* Canvas Scroll Area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
              {/* 0. Call-Tree Topology & Subproblem Inspector */}
              {treeVisible && (
                <div className="p-3 rounded-md bg-[#0E1117] border border-zinc-800/90">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300 whitespace-nowrap min-w-0">
                      <ListTree className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span className="truncate">Call-Tree Topology &amp; Subproblem Inspector</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setTreeView('svg')}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition ${
                          treeView === 'svg'
                            ? 'bg-violet-500/20 text-violet-200 border-violet-500/50'
                            : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                        }`}
                      >
                        2D SVG Tree
                      </button>
                      <button
                        onClick={() => setTreeView('list')}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition ${
                          treeView === 'list'
                            ? 'bg-violet-500/20 text-violet-200 border-violet-500/50'
                            : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                        }`}
                      >
                        Compact List
                      </button>
                    </div>
                  </div>

                  <div className="mb-2 flex items-center gap-2 text-[10px] font-mono text-zinc-500 whitespace-nowrap overflow-x-auto no-scrollbar">
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="h-2 w-2 rounded bg-sky-500/60" />
                      active
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="h-2 w-2 rounded bg-rose-500/60" />
                      redundant {traceMetrics.redundantCallCount}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="h-2 w-2 rounded bg-zinc-700" />
                      retired
                    </span>
                    <span className="shrink-0 text-zinc-600">
                      nodes {treeLayout.selectedCount} · edges {treeLayout.edges.length} · leaves{' '}
                      {treeLayout.positions.filter(
                        (p) => !treeLayout.edges.some((e) => e.key.endsWith(`-${p.node.id}`))
                      ).length}
                    </span>
                  </div>

                  {treeView === 'svg' ? (
                    <div className="max-h-[232px] overflow-auto rounded border border-zinc-800/70 bg-[#090B10]">
                      <svg
                        width={treeLayout.width}
                        height={treeLayout.height}
                        className="block"
                        role="img"
                        aria-label="Call tree topology"
                      >
                        {treeLayout.edges.map((e) => {
                          const active = activeNodeIds.has(e.childId);
                          const midY = (e.y1 + e.y2) / 2;
                          return (
                            <path
                              key={e.key}
                              d={`M ${e.x1} ${e.y1} C ${e.x1} ${midY}, ${e.x2} ${midY}, ${e.x2} ${e.y2}`}
                              fill="none"
                              stroke={active ? '#38bdf8' : '#27272a'}
                              strokeWidth={active ? 1.4 : 1}
                            />
                          );
                        })}
                        {treeLayout.positions.map(({ node: n, x, y }) => {
                          const active = activeNodeIds.has(n.id);
                          const future = n.entryFrameIndex > currentFrameIdx;
                          const palette = active
                            ? { fill: '#082f49', stroke: '#38bdf8', text: '#bae6fd' }
                            : n.isDuplicate
                              ? { fill: '#2b0a12', stroke: '#f43f5e', text: '#fda4af' }
                              : { fill: '#18181b', stroke: '#27272a', text: '#a1a1aa' };
                          return (
                            <g
                              key={n.id}
                              onClick={() => {
                                setIsPlaying(false);
                                setCurrentFrameIdx(n.entryFrameIndex);
                              }}
                              className="cursor-pointer"
                              opacity={future ? 0.4 : 1}
                            >
                              <title>{`Jump to entry frame #${n.entryFrameIndex}`}</title>
                              <rect
                                x={x - SVG_NODE_W / 2}
                                y={y - SVG_NODE_H / 2}
                                width={SVG_NODE_W}
                                height={SVG_NODE_H}
                                rx={4}
                                fill={palette.fill}
                                stroke={palette.stroke}
                                strokeWidth={1}
                              />
                              <text
                                x={x}
                                y={y + 3}
                                textAnchor="middle"
                                fontSize={9}
                                fontFamily="ui-monospace, monospace"
                                fill={palette.text}
                              >
                                {n.signature.length > 11 ? `${n.signature.slice(0, 10)}…` : n.signature}
                              </text>
                              {n.isDuplicate && (
                                <g>
                                  <rect
                                    x={x + SVG_NODE_W / 2 - 24}
                                    y={y - SVG_NODE_H / 2 - 5}
                                    width={26}
                                    height={10}
                                    rx={3}
                                    fill="#4c0519"
                                    stroke="#f43f5e"
                                    strokeWidth={0.8}
                                  />
                                  <text
                                    x={x + SVG_NODE_W / 2 - 11}
                                    y={y - SVG_NODE_H / 2 + 2.5}
                                    textAnchor="middle"
                                    fontSize={7}
                                    fontFamily="ui-monospace, monospace"
                                    fill="#fecdd3"
                                  >
                                    DUP×{n.duplicateCount}
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  ) : (
                    <div className="max-h-[168px] space-y-[2px] overflow-y-auto">
                      {treeNodes.map((n) => {
                        const active =
                          n.entryFrameIndex <= currentFrameIdx &&
                          (n.exitFrameIndex === -1 || n.exitFrameIndex > currentFrameIdx);
                        const future = n.entryFrameIndex > currentFrameIdx;
                        const stateClass = active
                          ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                          : n.isDuplicate
                            ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-400';
                        return (
                          <button
                            key={n.id}
                            onClick={() => {
                              setIsPlaying(false);
                              setCurrentFrameIdx(n.entryFrameIndex);
                            }}
                            title={`Jump to entry frame #${n.entryFrameIndex}`}
                            style={{ marginLeft: n.depth * 10 }}
                            className={`flex w-full items-center gap-2 rounded border px-1.5 py-[2px] text-[10px] font-mono transition ${stateClass} ${
                              future ? 'opacity-40' : ''
                            }`}
                          >
                            <span className="text-zinc-500">d{n.depth}</span>
                            <span className="font-semibold">{n.signature}</span>
                            {n.isDuplicate && (
                              <span className="rounded border border-rose-400/60 bg-rose-500/30 px-1 text-[9px] font-bold text-rose-100">
                                DUP ×{n.duplicateCount}
                              </span>
                            )}
                            <span className="ml-auto text-zinc-500">
                              #{n.entryFrameIndex}
                              <span className="mx-0.5">→</span>
                              {n.exitFrameIndex === -1 ? 'live' : `#${n.exitFrameIndex}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {treeLayout.truncated && (
                    <p className="mt-1 text-[10px] text-zinc-500">
                      构图仅取前 {treeLayout.selectedCount} 个激活节点，本轨迹共观测{' '}
                      {Math.max(0, callTree.nodes.length - 1)} 次函数进入
                    </p>
                  )}
                </div>
              )}

              {/* 1. 2D Matrices (e.g., DP Table / Grid) */}
              {categorizedVars.matrices2D.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {categorizedVars.matrices2D.map((mat) => {
                    const activeR = categorizedVars.numericPointers['r'];
                    const activeC = categorizedVars.numericPointers['c'];
                    return (
                      <div
                        key={mat.name}
                        className="p-2.5 rounded-md bg-[#0E1117] border border-zinc-800/90"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-mono font-semibold text-zinc-300">
                            2D Matrix: <span className="text-sky-400">{mat.name}</span> [
                            {mat.data.length}×{mat.data[0]?.length || 0}]
                          </span>
                          {activeR !== undefined && activeC !== undefined && (
                            <span className="text-[10px] font-mono text-amber-300">
                              Cursor [{activeR}][{activeC}]
                            </span>
                          )}
                        </div>
                        <div className="inline-block border border-zinc-800 rounded overflow-hidden">
                          {mat.data.map((row, rIdx) => (
                            <div
                              key={rIdx}
                              className="flex divide-x divide-zinc-800 border-b last:border-b-0 border-zinc-800"
                            >
                              {row.map((cellVal, cIdx) => {
                                const isTarget = activeR === rIdx && activeC === cIdx;
                                const isCrosshair = activeR === rIdx || activeC === cIdx;
                                const prevMat = prevFrame?.variables?.[mat.name];
                                const cellMutated =
                                  Array.isArray(prevMat) &&
                                  Array.isArray(prevMat[rIdx]) &&
                                  prevMat[rIdx][cIdx] !== cellVal;

                                return (
                                  <div
                                    key={cIdx}
                                    className={`w-10 h-8 flex flex-col items-center justify-center font-mono text-xs transition-all ${
                                      cellMutated
                                        ? 'bg-amber-500/30 text-amber-200 font-bold ring-1 ring-amber-400'
                                        : isTarget
                                          ? 'bg-sky-500/25 text-sky-200 font-bold'
                                          : isCrosshair
                                            ? 'bg-zinc-800/60 text-zinc-300'
                                            : 'bg-zinc-900/50 text-zinc-400'
                                    }`}
                                  >
                                    <span>{cellVal}</span>
                                    <span className="text-[8px] text-zinc-600">
                                      {rIdx},{cIdx}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2. 1D Arrays with Smart Pointer Tracking & Rainwater Simulation */}
              {categorizedVars.arrays1D.map((arr) => {
                const numericVals = arr.data.filter((x) => typeof x === 'number') as number[];
                const maxVal = Math.max(1, ...numericVals);
                const isRainHeight =
                  arr.name === 'height' &&
                  currentFrame?.variables?.leftMax !== undefined &&
                  currentFrame?.variables?.rightMax !== undefined;

                return (
                  <div
                    key={arr.name}
                    className="p-3 rounded-md bg-[#0E1117] border border-zinc-800/90"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-mono font-semibold text-zinc-300">
                        Array Buffer: <span className="text-sky-400">{arr.name}</span> (len=
                        {arr.data.length})
                      </span>
                      {isRainHeight && (
                        <span className="text-[10px] font-mono text-sky-400">
                          Water Surface Overlay Active
                        </span>
                      )}
                    </div>

                    <div className="flex items-end gap-1.5 pt-2 pb-1 overflow-x-auto">
                      {arr.data.map((val, idx) => {
                        const matchingPointers = Object.entries(
                          categorizedVars.numericPointers
                        ).filter(([, ptrIdx]) => ptrIdx === idx);

                        const prevArr = prevFrame?.variables?.[arr.name];
                        const elemMutated = Array.isArray(prevArr) && prevArr[idx] !== val;
                        const barHeightPct =
                          typeof val === 'number' ? Math.max(8, (val / maxVal) * 100) : 15;

                        // Calculate simulated water level for Trapping Rain Water preset
                        let waterPct = 0;
                        if (isRainHeight && typeof val === 'number') {
                          const lIdx = categorizedVars.numericPointers['left'] ?? 0;
                          const rIdx =
                            categorizedVars.numericPointers['right'] ?? arr.data.length - 1;
                          const bound = Math.min(
                            currentFrame?.variables?.leftMax || 0,
                            currentFrame?.variables?.rightMax || 0
                          );
                          if ((idx <= lIdx || idx >= rIdx) && bound > val) {
                            waterPct = ((bound - val) / maxVal) * 100;
                          }
                        }

                        return (
                          <div key={idx} className="flex flex-col items-center min-w-[38px]">
                            {/* Bar Graph Visualization */}
                            <div className="w-8 h-16 bg-zinc-900/90 rounded-t border border-b-0 border-zinc-800 flex flex-col justify-end overflow-hidden relative">
                              {waterPct > 0 && (
                                <div
                                  className="w-full bg-sky-500/35 border-t border-sky-400/60 transition-all duration-150"
                                  style={{ height: `${waterPct}%` }}
                                />
                              )}
                              <div
                                className={`w-full transition-all duration-150 ${
                                  elemMutated
                                    ? 'bg-amber-400'
                                    : matchingPointers.length > 0
                                      ? 'bg-sky-400'
                                      : 'bg-zinc-600'
                                }`}
                                style={{ height: `${barHeightPct}%` }}
                              />
                            </div>

                            {/* Value Cell */}
                            <div
                              className={`w-full py-1 text-center font-mono text-xs border rounded-b transition-colors ${
                                elemMutated
                                  ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold'
                                  : matchingPointers.length > 0
                                    ? 'bg-sky-500/20 border-sky-500/60 text-zinc-100 font-semibold'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                              }`}
                            >
                              {String(val)}
                            </div>

                            {/* Index Label */}
                            <span className="text-[9px] font-mono text-zinc-500 mt-0.5">
                              [{idx}]
                            </span>

                            {/* Active Pointers Stacked Below */}
                            <div className="min-h-[34px] flex flex-col items-center gap-0.5 mt-0.5">
                              {matchingPointers.map(([ptrName]) => (
                                <span
                                  key={ptrName}
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-mono border leading-tight ${
                                    POINTER_COLORS[ptrName] ||
                                    'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  }`}
                                >
                                  ↑{ptrName}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* 3. Scalar Registers & Live Diff Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {categorizedVars.scalars.map((sc) => {
                  const diff = mutatedKeys[sc.name];
                  return (
                    <div
                      key={sc.name}
                      className={`px-2.5 py-2 rounded border font-mono transition-all ${
                        diff
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-sm'
                          : 'bg-[#0E1117] border-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span>{sc.name}</span>
                        {sc.isPointer && (
                          <span className="text-[9px] px-1 rounded bg-zinc-800 text-sky-400">
                            PTR
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-baseline gap-1.5 truncate">
                        {diff && diff.prev !== undefined ? (
                          <>
                            <span className="text-[11px] text-zinc-500 line-through">
                              {JSON.stringify(diff.prev)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="text-sm font-bold text-amber-300">
                              {JSON.stringify(sc.value)}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-semibold text-zinc-100">
                            {JSON.stringify(sc.value)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* BOTTOM RIGHT (42%): AI SURGICAL COMPLEXITY PROFILER & CODE DIFF */}
          <div className="h-[42%] flex flex-col min-h-0 bg-[#0B0D13]">
            <div className="h-9 px-3 border-b border-zinc-800/80 bg-[#0E1118] flex items-center justify-between gap-2 whitespace-nowrap overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-2 shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-xs font-medium text-zinc-200 whitespace-nowrap">
                  AI Complexity Profiler
                  <span className="hidden xl:inline"> &amp; Frame Diagnostics</span>
                </span>
                {aiReport && (
                  <span className="hidden xl:inline text-[10px] font-mono text-zinc-500 whitespace-nowrap">
                    {traceMetrics.redundantCallCount > 0
                      ? `redundant entries ${traceMetrics.redundantCallCount}`
                      : 'no redundant entries'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {showKeyInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="DeepSeek sk-..."
                      className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[11px] font-mono text-zinc-200 w-36 focus:outline-none focus:border-violet-400"
                    />
                    <button
                      onClick={() => setShowKeyInput(false)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowKeyInput(true)}
                    className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono text-zinc-400 flex items-center gap-1"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span className="hidden lg:inline">
                      {apiKey ? 'DeepSeek Key Active' : 'Engine: Deterministic + API'}
                    </span>
                  </button>
                )}

                {aiReport && aiReport.optimizedCode !== sourceCode && (
                  <button
                    onClick={handleApplyOptimized}
                    className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium text-[11px] flex items-center gap-1 transition shadow-sm shrink-0 whitespace-nowrap"
                  >
                    <Zap className="w-3 h-3" />
                    <span>Apply O(n) Refactor & Re-Trace</span>
                  </button>
                )}
              </div>
            </div>

            {/* Verified refactor benchmark: measured before/after on the same sandbox */}
            {benchmarkDelta && (
              <div className="shrink-0 px-3 py-1.5 border-b border-emerald-500/40 bg-emerald-500/10 flex items-center gap-2 font-mono text-[10px] text-emerald-300 overflow-x-auto">
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 font-semibold text-emerald-200">
                  VERIFIED REFACTOR BENCHMARK
                </span>
                <span className="whitespace-nowrap">
                  {benchmarkDelta.abortedToCompleted ||
                  (benchmarkDelta.baseFused && benchmarkDelta.nowFused) ||
                  (!benchmarkDelta.baseFused && benchmarkDelta.nowFused) ? (
                    <>
                      STATUS:{' '}
                      <strong className="text-emerald-100">
                        {benchmarkDelta.baseFused ? 'FUSE_ABORTED' : 'COMPLETED'} ({benchmarkDelta.from}f)
                      </strong>{' '}
                      →{' '}
                      <strong className="text-emerald-100">
                        {benchmarkDelta.nowFused ? 'FUSE_ABORTED' : 'COMPLETED'} ({benchmarkDelta.to}f)
                      </strong>{' '}
                      | (frame counts across a fuse boundary are not comparable)
                    </>
                  ) : (
                    <>
                      FRAMES:{' '}
                      <strong className="text-emerald-100">{benchmarkDelta.from}</strong> →{' '}
                      <strong className="text-emerald-100">{benchmarkDelta.to}</strong>{' '}
                      ({benchmarkDelta.pct <= 0 ? '-' : '+'}
                      {Math.abs(benchmarkDelta.pct).toFixed(1)}%)
                    </>
                  )}{' '}
                  | PEAK STACK:{' '}
                  <strong className="text-emerald-100">
                    {benchmarkDelta.stackFrom} → {benchmarkDelta.stackTo}
                  </strong>{' '}
                  | SPACE:{' '}
                  <strong className="text-emerald-100">
                    {benchmarkDelta.spaceFrom} → {aiReport?.spaceComplexity}
                  </strong>{' '}
                  | TIME:{' '}
                  <strong className="text-emerald-100">
                    {benchmarkDelta.timeFrom} → {aiReport?.timeComplexity}
                  </strong>{' '}
                  | LATENCY:{' '}
                  <strong className="text-emerald-100">
                    {benchmarkDelta.latencyFrom}ms → {benchmarkDelta.latencyTo}ms
                  </strong>
                </span>
              </div>
            )}

            {/* Profiler Content */}
            <div className="flex-1 min-h-0 grid grid-cols-12 divide-x divide-zinc-800/80 overflow-hidden">
              {/* Left 7 cols: Summary & Bottleneck Frame Jumpers */}
              <div className="col-span-7 p-3 overflow-y-auto space-y-2.5">
                {/* Telemetry Strip — 复杂度徽章从 h-9 标题栏迁出，771px 下不再折行 */}
                {aiReport && (
                  <div className="flex items-center gap-1.5 font-mono text-[10px] overflow-x-auto no-scrollbar whitespace-nowrap">
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      Time: {aiReport.timeComplexity}
                    </span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                      Space: {aiReport.spaceComplexity}
                    </span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      Hotspot: L{aiReport.hotspotLine} ({aiReport.maxHitCount}x)
                    </span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-800/90 text-zinc-400 border border-zinc-700/70">
                      Peak stack: {traceMetrics.maxStackDepth}
                    </span>
                    {aiReport.combinePattern && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Operator: {aiReport.combinePattern}
                      </span>
                    )}
                  </div>
                )}

                {isAnalyzing ? (
                  <div className="text-xs font-mono text-zinc-500 animate-pulse">
                    Analyzing AST execution trace & control-flow hotspots...
                  </div>
                ) : aiReport ? (
                  <>
                    <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/60 p-2.5 rounded border border-zinc-800/80">
                      {aiReport.summary}
                    </p>

                    <div className="space-y-1.5">
                      {aiReport.frameInsights.map((ins, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded bg-[#0E1117] border border-zinc-800/90 flex items-center justify-between gap-2"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 font-mono text-[10px]">
                              <span className="text-amber-400 font-semibold">[{ins.tag}]</span>
                              <span className="text-zinc-500">Line {ins.line}</span>
                            </div>
                            <div className="text-[11px] text-zinc-300">{ins.issue}</div>
                          </div>
                          <button
                            onClick={() => {
                              setIsPlaying(false);
                              setCurrentFrameIdx(
                                Math.min(frames.length - 1, Math.max(0, ins.frameIndex))
                              );
                            }}
                            className="shrink-0 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-sky-300 font-mono text-[10px] border border-zinc-700 transition"
                          >
                            Jump #{ins.frameIndex}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

              {/* Right 5 cols: Suggested Refactored Code Preview */}
              <div className="col-span-5 flex flex-col min-h-0 bg-[#080A0E]">
                <div className="px-2.5 py-1 border-b border-zinc-800/60 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-emerald-400">REFACTORED CODE PATCH</span>
                  <span className="text-zinc-500 truncate max-w-[180px]">
                    {aiReport?.optimizationGain}
                  </span>
                </div>
                <pre className="flex-1 p-2.5 overflow-y-auto font-mono text-[11px] leading-relaxed text-emerald-300/90 select-text">
                  {aiReport?.optimizedCode || '// No refactoring required'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== BOTTOM HARDWARE FLAMEGRAPH TIMELINE SCRUBBER (52px) ==================== */}
      <footer className="h-13 shrink-0 border-t border-zinc-800/90 bg-[#0C0E14] px-3 flex items-center gap-4">
        {/* Playback Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentFrameIdx(0);
            }}
            title="Reset to Frame 0"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentFrameIdx((p) => Math.max(0, p - 1));
            }}
            title="Step Backward (←)"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (currentFrameIdx >= frames.length - 1) setCurrentFrameIdx(0);
              setIsPlaying((p) => !p);
            }}
            title="Play / Pause (Space)"
            className="px-2.5 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold flex items-center gap-1 transition"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentFrameIdx((p) => Math.min(frames.length - 1, p + 1));
            }}
            title="Step Forward (→)"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={continueToBreakpoint}
            disabled={breakpoints.size === 0 || currentFrameIdx >= frames.length - 1}
            title="Continue to Breakpoint (F8 / b)"
            className={`px-2 py-1.5 rounded text-[10px] font-mono border flex items-center gap-1 transition ${
              breakpoints.size > 0 && currentFrameIdx < frames.length - 1
                ? 'bg-rose-500/15 border-rose-500/50 text-rose-200 hover:bg-rose-500/25'
                : 'bg-zinc-900 border-zinc-800 text-zinc-600'
            }`}
          >
            <CircleDot className="w-3 h-3" />
            <span className="whitespace-nowrap">Continue to Breakpoint {breakpoints.size}</span>
          </button>
        </div>

        {/* Interactive Call-Stack Flamegraph Bar Scrubber */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="h-7 w-full bg-zinc-900/90 rounded border border-zinc-800 px-1 flex items-end gap-[1px] overflow-hidden cursor-pointer relative">
            {frames.map((f, idx) => {
              const isCurr = idx === currentFrameIdx;
              const isPast = idx < currentFrameIdx;
              const stackRatio = Math.max(
                0.22,
                Math.min(1, f.callStack.length / Math.max(2, traceMetrics.maxStackDepth))
              );
              const isHotspot = f.line === traceMetrics.hotspotLine;
              const isBreakpointFrame = breakpoints.has(f.line);

              return (
                <div
                  key={idx}
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentFrameIdx(idx);
                  }}
                  onMouseEnter={(e) => {
                    if (e.buttons === 1) {
                      setIsPlaying(false);
                      setCurrentFrameIdx(idx);
                    }
                  }}
                  style={{ height: `${Math.round(stackRatio * 100)}%` }}
                  className={`relative flex-1 min-w-[2px] transition-colors ${
                    isCurr
                      ? 'bg-amber-400'
                      : isHotspot && isPast
                        ? 'bg-rose-500/80'
                        : isPast
                          ? 'bg-sky-500/70'
                          : 'bg-zinc-700/50 hover:bg-zinc-600'
                  }`}
                >
                  {isBreakpointFrame && (
                    <span
                      className={`absolute left-0 right-0 top-0 h-[3px] ${isCurr ? 'bg-zinc-950' : 'bg-rose-400'}`}
                      title={`Breakpoint at L${f.line}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Frame Counter & Speed Selector */}
        <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
          <div className="text-zinc-400">
            FRAME{' '}
            <strong className="text-zinc-100">{frames.length ? currentFrameIdx + 1 : 0}</strong>
            <span className="text-zinc-600"> / {frames.length}</span>
          </div>

          <div className="flex items-center bg-zinc-900 rounded border border-zinc-800 p-0.5">
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                  speed === s ? 'bg-zinc-800 text-sky-400 font-semibold' : 'text-zinc-500'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </footer>

      {/* ==================== QODER ENGINEERING SPEC MODAL ==================== */}
      {showArchModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#0D1017] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                <GitCommit className="w-4 h-4 text-violet-400" />
                <span>Qoder Agentic Engineering Spec · Safety Fuse & DevLog Archive</span>
              </div>
              <button
                onClick={() => setShowArchModal(false)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Spec tabs */}
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-1 bg-[#0B0E14]">
              <button
                onClick={() => setSpecTab('arch')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                  specTab === 'arch'
                    ? 'bg-zinc-800 text-sky-300 border border-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Architecture & Safety Fuse
              </button>
              <button
                onClick={() => setSpecTab('devlog')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                  specTab === 'devlog'
                    ? 'bg-zinc-800 text-violet-300 border border-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                DevLog & Reflection History [M1-M{DEVLOGS.length}]
              </button>
              <span className="ml-auto text-[10px] font-mono text-zinc-600">
                {specTab === 'arch' ? 'three-tier fuse contract' : 'docs/devlogs/ archive index'}
              </span>
            </div>

            <div className="p-4 space-y-3 text-xs text-zinc-300 font-mono leading-relaxed max-h-[70vh] overflow-y-auto">
              {specTab === 'arch' ? (
                <>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-sky-400 font-semibold">1. Custom Babel AST Visitor Pipeline</div>
                    <p className="text-zinc-400 text-[11px]">
                      Rewrites user AST in-memory via @babel/standalone. Injects __guard() at loop headers,
                      wraps FunctionDeclaration bodies in try...finally &#123; __exitFn() &#125; for accurate
                      stack unwinding, and captures deep-cloned lexical scope bindings at every statement.
                      Scope reads are wrapped in try/catch closures because lexical bindings declared later in
                      the same block sit in the temporal dead zone. Function entry also forwards the actual
                      argument list, so stack frames read fib(5) / dfs(1,2) instead of bare names.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-emerald-400 font-semibold">2. Three-Tier Sandbox Fuse</div>
                    <p className="text-zinc-400 text-[11px]">
                      • [FUSE_STEP_LIMIT] — instruction fuse, 2000 steps max (__guard); preserves pre-crash
                      trace frames via globalThis.__mtmFrames.
                      <br />• [FUSE_STACK_OVERFLOW] — stack fuse, 150 recursion frames max (__enterFn /
                      __exitFn).
                      <br />• [FUSE_WATCHDOG_TIMEOUT] — hardware fuse, 3000ms Web Worker watchdog timer with
                      worker.terminate().
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-violet-400 font-semibold">
                      3. Human Architect + Qoder Agent Collaboration Log
                    </div>
                    <p className="text-zinc-400 text-[11px]">
                      • M1: Built AST lexical scope snapshot engine & isolated Blob Worker runner.
                      <br />• M2: Fixed recursive stack unwinding leak via try-finally AST node wrapping.
                      <br />• M3: Upgraded to 100vh industrial workbench with 2D DP matrix crosshair,
                      frame-delta mutation diffing, and interactive stack-depth flamegraph scrubber.
                      <br />• M4: Closed the complexity-heuristic gaps (logarithmic halving, rolling-buffer
                      state shape), standardized fuse exception prefixes, and added the measured
                      before/after refactor benchmark.
                      <br />• M5: Parametrized call-stack signatures, call-tree reconstruction with duplicate
                      subproblem detection, and line-level breakpoints with continue-to-breakpoint.
                      <br />• M6: 2D SVG bezier call-tree topology, auto-synthesized iterative rewrites from
                      the sniffed combine operator, fuse-aware benchmark semantics, and the 771px
                      narrow-viewport layout cleanup (no per-line scrollbars, no clipped actions).
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-amber-400 font-semibold">4. Complexity Heuristic Decision Order</div>
                    <p className="text-zinc-400 text-[11px]">
                      Step fuse trap → recursion depth (runtime maxStackDepth &gt;= 4) → interval halving
                      (low/high/mid triple or frame count within ceil(log2 n) * 4) → 2D tabulation vs 1D
                      rolling buffer (runtime shape of dp) → linear two-pointer fallback. Every gate reads
                      runtime evidence, never source-code string matching.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-rose-400 font-semibold">5. Recursion Gating By Duplicate Evidence</div>
                    <p className="text-zinc-400 text-[11px]">
                      The recursion gate no longer assumes exponential cost from depth alone. It counts how
                      many times each parametrized signature is entered: redundantCallCount &gt;= 2 means
                      overlapping subproblems were actually recomputed, so the verdict is
                      O(2^n) Exponential with the repeat list inline; redundantCallCount &lt; 2 means the
                      stack is a single descending chain, so the verdict is O(n) Linear Recursion tagged
                      [TAIL_RECURSION_CANDIDATE] with an iterative rewrite scaffold. Sibling calls keep the
                      stack depth unchanged, which is why entry events are counted instead of depth deltas.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-emerald-400 font-semibold">6. Layout &amp; Synthesis Contracts (M6)</div>
                    <p className="text-zinc-400 text-[11px]">
                      Narrow-viewport contract: the 44px top bar and every h-9 sub-header must stay on one
                      line with scrollWidth == clientWidth (no clipped actions), and no code line may own a
                      horizontal scrollbar - per-line overflow is forbidden; the outer scroll container owns
                      it with a global 5px dark scrollbar. Complexity chips live in a telemetry strip inside
                      the profiler body, not in its header.
                      <br />• Call tree: post-order leaf slotting, parent x = mean(child x), cubic-bezier
                      edges, clickable capsules jumping to entryFrameIndex.
                      <br />• Linear-recursion refactors are code-generated from the sniffed combine
                      operator (product / sum / descent), and a fuse-truncated baseline is never compared
                      against a completed run by frame-count percentage.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1 flex-wrap">
                    {DEVLOGS.map((d, i) => (
                      <button
                        key={d.tag}
                        onClick={() => setDevlogIdx(i)}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                          devlogIdx === i
                            ? 'bg-violet-500/20 text-violet-200 border border-violet-500/50'
                            : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
                        }`}
                      >
                        {d.tag} · {d.commit}
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const d = DEVLOGS[devlogIdx];
                    return (
                      <div className="space-y-2.5">
                        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/40 text-[10px] text-violet-200 font-semibold">
                              {d.tag}
                            </span>
                            <span className="text-[12px] text-zinc-100 font-semibold">{d.title}</span>
                          </div>
                          <p className="text-zinc-400 text-[11px]">
                            <span className="text-sky-400">Why · 背景动机</span> — {d.why}
                          </p>
                          <p className="text-zinc-500 text-[10px]">
                            commit {d.commit} · full log: {d.doc}
                          </p>
                        </div>

                        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                          <div className="text-emerald-400 font-semibold">What &amp; Where · 核心改动</div>
                          <ul className="space-y-1 text-zinc-400 text-[11px]">
                            {d.what.map((line) => (
                              <li key={line} className="flex gap-1.5">
                                <ChevronRight className="w-3 h-3 shrink-0 text-zinc-600 mt-[3px]" />
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                          <div className="text-amber-400 font-semibold">矛盾与认知纠偏 · Resolved Conflicts</div>
                          <ul className="space-y-1 text-zinc-400 text-[11px]">
                            {d.conflicts.map((line) => (
                              <li key={line} className="flex gap-1.5">
                                <ShieldAlert className="w-3 h-3 shrink-0 text-amber-500/70 mt-[3px]" />
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                          <div className="text-sky-400 font-semibold">Measured Impact · 实测验证指标</div>
                          <ul className="space-y-1 text-zinc-300 text-[11px]">
                            {d.impact.map((line) => (
                              <li key={line} className="flex gap-1.5">
                                <Zap className="w-3 h-3 shrink-0 text-sky-400/70 mt-[3px]" />
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <p className="text-[10px] text-zinc-600">
                          反幻觉回味协议见根目录 AGENT_GUIDE.md「Iron Laws」：改动前核对不变量，交付前归档 DevLog。
                        </p>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
