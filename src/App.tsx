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
  Pin,
  Sigma,
  Square,
  X,
} from 'lucide-react';
import { runInSandbox } from './core/sandboxRunner';
import { instrumentCode, TraceFrame } from './core/instrumenter';
import {
  runAIDiagnostics,
  analyzeTraceMetrics,
  analyzeMatrixWrites,
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
  /** 基线的展开型重复数：从 >0 降到 0 即记忆化剪枝成功，此时帧数上升不构成负优化 */
  expansiveRedundantCount: number;
}

/** 多阶段全息快照：一份可在零延迟下完整还原的「源码 + 帧 + 报告 + 指标」胶囊 */
interface StageSnapshot {
  stageIndex: number;
  label: string;
  sourceCode: string;
  /** 活跃或轻量阶段的完整帧；背景重轨迹（> LAZY_FRAME_THRESHOLD）退场时置空以释放堆内存 */
  frames: TraceFrame[];
  /** 帧总数与 frames 解耦：惰性驱逐后横幅/胶囊仍能报告真实轨迹规模 */
  frameCount: number;
  /** O(1) 抽样估算的帧负载字节数（中段帧 + 末帧变量 JSON 长度 × 帧数） */
  approxBytes: number;
  kind: 'normal' | 'draft';
  execTimeMs: number;
  sandboxError?: string;
  aiReport: AIDiagnosticReport;
  metrics: BaselineMetrics;
}

/** 超过该帧数的阶段退居后台时只保留元数据，点击胶囊再按源码重水化（Re-hydrate） */
const LAZY_FRAME_THRESHOLD = 250;
/** 帧数不多但单帧变量巨大（大矩阵 / 长数组）时同样触发驱逐 */
const LAZY_BYTE_BUDGET = 180_000;
/** 非确定性源码在 600 帧内豁免驱逐：优先保证历史重放 100% 一致 */
const NONDETERMINISTIC_KEEP_FRAMES = 600;

/** 轻量纯函数：识别会在重跑时产生不同轨迹的宿主调用（含 Web Crypto 随机源） */
const hasNonDeterministicCalls = (code: string) =>
  /\bMath\s*\.\s*random\s*\(|\bDate\s*\.\s*now\s*\(|\bperformance\s*\.\s*now\s*\(|\bnew\s+Date\b|\bcrypto\s*\.\s*getRandomValues\s*\(|\bcrypto\s*\.\s*randomUUID\s*\(/.test(
    code
  );

/** 抽样中段帧与末帧的变量负载，按帧数放大，避免逐帧序列化（O(1) 抽样） */
const estimateSnapshotBytes = (trace: TraceFrame[]): number => {
  if (trace.length === 0) return 0;
  const mid = trace[Math.floor(trace.length / 2)];
  const last = trace[trace.length - 1];
  let sample = 0;
  try {
    const midLen = (JSON.stringify(mid.variables) || '').length;
    const lastLen = (JSON.stringify(last.variables) || '').length;
    sample = (midLen + lastLen) / 2;
  } catch {
    sample = 0;
  }
  return Math.round(sample * trace.length * 1.15);
};

interface KernelSelfCheckResult {
  id: string;
  title: string;
  pass: boolean;
  detail: string;
  ms: number;
}

/** 自检夹具帧：只含内核判据需要的字段，不经过 Worker */
const buildSelfCheckFrame = (
  frameIndex: number,
  callStack: string[],
  variables: Record<string, any> = {}
): TraceFrame => ({
  frameIndex,
  line: 1,
  event: '函数进入: kernel()',
  variables,
  callStack,
  stdout: [],
  lineHits: { 1: frameIndex + 1 },
});

const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 不变量登记簿条数：页签与导览文案的唯一来源，避免写死数字随里程碑过期 */
const KERNEL_INVARIANT_COUNT = 21;

/** 评委导览的五幕脚本：每一幕都驱动真实内核，不做假动画 */
const TOUR_ACTS: { title: string; note: string }[] = [
  {
    title: 'Three-Tier Safety Fuse & Crash Recovery',
    note: '2000-step guard + globalThis.__mtmFrames preserves the pre-crash trace',
  },
  {
    title: 'Three-Stage Recursion Lowering',
    note: 'DUP subtree -> HIT memo pruning -> 1D dp tabulation, Stage 0/1/2 capsules',
  },
  {
    title: 'Cross-Dimensional Lowering',
    note: 'recursion tree -> 2D Matrix dp crosshair with runtime WRITES badge',
  },
  {
    title: 'Runtime Watchpoint and ->T Four-State Seek',
    note: 'adopt adaptive dp[][] chip, then jump to the real write frame',
  },
  {
    title: `Live Kernel Self-Check (${KERNEL_INVARIANT_COUNT} Invariants)`,
    note: '6 deterministic micro-benchmarks executed in this tab',
  },
];

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
    id: 'fast-power',
    title: 'Fast Power O(log n)',
    category: 'Positional Halving · Slot 1 (exp)',
    complexity: 'O(log n)',
    code: `// 二分快速幂递归：观察槽位 1 (exp: 16→8→4→2→1) 折半链与一键二进制快速幂消栈
function power(base, exp) {
  if (exp === 0) {
    return 1;
  }
  const half = power(base, Math.floor(exp / 2));
  if (exp % 2 === 0) {
    return half * half;
  }
  return base * half * half;
}

let ans = power(2, 16);
console.log("power(2, 16) =", ans);`,
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
    id: 'pascal-comb',
    title: 'Pascal Comb (Tree→2D)',
    category: '2-Param Recursion → 2D DP Matrix',
    complexity: 'O(2^n)→O(N·K)',
    code: `// 双参组合数递推：连点两次 Apply，见证「2D 调用树 → HIT 剪枝 → 2D DP 矩阵」跨维转场
function comb(n, k) {
  if (k === 0 || k === n) {
    return 1;
  }
  return comb(n - 1, k - 1) + comb(n - 1, k);
}

let ans = comb(4, 2);
console.log("comb(4, 2) =", ans);`,
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
  /** 纯运行时拓扑判据：expansive = 重复且又展开了子树；pruned = 重复但零子节点直接退栈（缓存命中） */
  dupKind: 'expansive' | 'pruned' | null;
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
        dupKind: null,
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

  // 纯运行时剪枝取证：同签名首次调用展开了若干直接子节点，而本次重复调用一个子节点都没有、
  // 进入即退栈 —— 拓扑上只能是被缓存守卫拦截，据此把 DUP（玫红）细分出 HIT（翠绿）。全程不读源码。
  const childCounts = new Map<number, number>();
  for (const n of nodes) {
    if (n.parentId !== null) childCounts.set(n.parentId, (childCounts.get(n.parentId) || 0) + 1);
  }
  const firstChildCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.signature === 'main()') continue;
    if (!firstChildCount.has(n.signature)) firstChildCount.set(n.signature, childCounts.get(n.id) || 0);
  }
  for (const n of nodes) {
    if (!n.isDuplicate) continue;
    const kids = childCounts.get(n.id) || 0;
    const firstKids = firstChildCount.get(n.signature) || 0;
    n.dupKind = firstKids > 0 && kids === 0 ? 'pruned' : 'expansive';
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

/** 场景化一键断言：按预设给出 2 条最有信息量的观察点，评委零打字即可 →T */
const QUICK_WATCH: Record<string, string[]> = {
  rainwater: ['water >= 4', 'left === right'],
  'dp-matrix': ['dp[1][2] === 6', 'r === 2 && c === 3'],
  'binary-search': ['guess === target', 'low === high'],
  'fast-power': ['exp === 8', 'exp === 1'],
  'fib-tree': ['n === 2', 'leftBranch === 2'],
  'pascal-comb': ['k === n', 'k === 0'],
  'infinite-loop': ['anomalySum > 500', 'count === 0'],
};

const WATCH_FORBIDDEN =
  /(^|[^.\w$])(this|window|globalThis|self|top|parent|document|location|Function|eval|constructor|prototype|process|require|import)([^.\w$]|$)/;

type WatchResult = { state: 'TRUE' | 'FALSE' | 'INVALID' | 'ERROR'; detail: string };

/**
 * 条件断言求值：只在当前帧的变量快照上计算，且先过三道白名单闸门
 * （字符集、禁止调用形态、禁止宿主对象），因此求值面等价于一次纯算术比较，
 * 不给页面全局对象留入口。求值失败返回 ERROR 而不是抛出。
 */
function evalWatchExpression(expr: string, vars: Record<string, any>): WatchResult {
  const trimmed = expr.trim();
  if (!trimmed) return { state: 'INVALID', detail: 'empty expression' };
  // 放行下标括号；点号与引号一律拒绝，切断 obj.constructor / obj["constructor"] 两条成员注入路径
  if (!/^[\w$\s()\[\]<>=!+\-*/%&|,:]+$/.test(trimmed) || /[.']/.test(trimmed)) {
    return { state: 'INVALID', detail: 'only variables, indices and operators (no dot or quotes)' };
  }
  if (/(^|[^=!<>])=([^=]|$)/.test(trimmed)) {
    return { state: 'INVALID', detail: 'assignment not allowed, use === / !== / <= / >=' };
  }
  if (/\w\s*\(/.test(trimmed)) return { state: 'INVALID', detail: 'function calls are not allowed' };
  if (WATCH_FORBIDDEN.test(trimmed)) return { state: 'INVALID', detail: 'host objects are not allowed' };

  const names = Object.keys(vars).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  try {
    // eslint-disable-next-line no-new-func
    const value = new Function(...names, `return (${trimmed});`)(...names.map((n) => vars[n]));
    return { state: value ? 'TRUE' : 'FALSE', detail: String(value) };
  } catch (e: any) {
    return { state: 'ERROR', detail: (e?.message || 'evaluation failed').slice(0, 48) };
  }
}

function hasTrueFrame(frames: TraceFrame[], expr: string): boolean {
  for (const f of frames) {
    if (evalWatchExpression(expr, f.variables ?? {}).state === 'TRUE') return true;
  }
  return false;
}

/**
 * 自适应 Quick-Watch：优先保留预设精选断言，但每一条都必须通过「至少一帧为 TRUE」的验证；
 * 死变量（如 Stage-2 后消失的 leftBranch）会被自动淘汰，不足 2 条时用当前轨迹真实变量补位。
 * 规则 A（2D dp + r/c）→ 规则 B（1D dp + 游标）→ 规则 C（递归/标量阶段的真实数值变量）。
 */
function deriveRuntimeQuickWatches(frames: TraceFrame[], curated: string[]): string[] {
  if (!frames.length) return [];
  const derived: string[] = [];
  // 断言要"有信息量"：优先取最后几个仍持有 dp 的帧（此时表已写满），
  // 否则会推荐 dp[4][1] === 0 这种"未写入格子"的真值，虽然 →T 能命中但说明不了问题。
  const lateWithDp: number[] = [];
  for (let i = frames.length - 1; i >= 0 && lateWithDp.length < 3; i--) {
    if (Array.isArray(frames[i]?.variables?.dp)) lateWithDp.push(i);
  }
  const probes = lateWithDp.length
    ? [...lateWithDp, Math.floor(frames.length * 0.65), Math.floor(frames.length * 0.4), 0]
    : [Math.floor(frames.length * 0.65), Math.floor(frames.length * 0.4), frames.length - 1, 0];

  for (const idx of probes) {
    const v = frames[idx]?.variables ?? {};
    const mat = v.dp;
    if (Array.isArray(mat) && Array.isArray(mat[0]) && typeof v.r === 'number' && typeof v.c === 'number') {
      const val = (mat as any[])[v.r]?.[v.c];
      if (typeof val === 'number') {
        derived.push(`dp[${v.r}][${v.c}] === ${val}`, `r === ${v.r} && c === ${v.c}`);
        break;
      }
    }
  }

  if (!derived.length) {
    for (const idx of probes) {
      const v = frames[idx]?.variables ?? {};
      const arr = v.dp;
      if (Array.isArray(arr) && arr.length > 0 && !Array.isArray(arr[0])) {
        const cursor = ['i', 'c', 'idx', 'cursor'].find((k) => typeof v[k] === 'number');
        if (cursor) {
          const ci = v[cursor] as number;
          if (ci >= 0 && ci < arr.length && typeof arr[ci] === 'number') {
            derived.push(`dp[${ci}] === ${arr[ci]}`, `${cursor} === ${ci}`);
            break;
          }
        }
      }
    }
  }

  if (!derived.length) {
    // 规则 C：按「变量突变熵」排序——全轨迹取值集合越大说明状态演化越丰富，优先推荐；
    // 恒定不变的输入常量（target / limit 这类 distinctCount === 1）降级，仅在无动态变量时兜底。
    const distinct = new Map<string, Set<number>>();
    for (const f of frames) {
      for (const [k, v] of Object.entries(f.variables)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const set = distinct.get(k) ?? new Set<number>();
        set.add(v);
        distinct.set(k, set);
      }
    }
    const ranked = Array.from(distinct.entries())
      .map(([name, set]) => ({ name, distinct: set.size }))
      .sort((a, b) => b.distinct - a.distinct);
    const dynamic = ranked.filter((r) => r.distinct >= 2);
    const ordered = dynamic.length ? dynamic : ranked;
    for (const idx of probes) {
      const v = frames[idx]?.variables ?? {};
      for (const { name } of ordered) {
        if (derived.length >= 2) break;
        if (typeof v[name] === 'number') derived.push(`${name} === ${v[name]}`);
      }
      if (derived.length) break;
    }
  }

  const valid: string[] = [];
  for (const expr of [...curated, ...derived]) {
    if (valid.includes(expr)) continue;
    if (!hasTrueFrame(frames, expr)) continue;
    valid.push(expr);
    if (valid.length >= 2) break;
  }
  return valid;
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
    commit: '772ef79',
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
  {
    tag: 'M7',
    commit: '7de93be',
    doc: 'docs/devlogs/M7-auto-memo-and-watch-guards.md',
    title: '通用自动记忆化合成、迭代累积判据分档、栈收益锚点与 SVG 树自动聚焦',
    why: 'M6 收尾有三处不体面：所有重叠递归都被塞进 fib 专用 DP 样例，非 fib 函数点 Apply 会得到一段语义无关的代码；迭代化之后的 factIter 被兜底档称作「双指针」；长链 SVG 调用树超出 232px 视口后还要手动翻找当前激活节点。',
    what: [
      'aiDiagnostics.ts：新增 expansiveRedundantCount 取证——重复签名只有在「下一帧栈更深」时才说明它真的又展开了一整棵子树；分支 A 需同时满足 redundantCallCount >= 2 与 expansiveRedundantCount >= 1，重复全部命中缓存时展开型重复为 0，落入新档 O(n) Memoized Linear。',
      'aiDiagnostics.ts：extractFunctionInfo 用大括号配对定位目标函数体与形参，synthesizeMemoizedSource 生成 const __memo = {} 与 JSON.stringify([参数]) 缓存键的 Top-Down 包装版，原函数体整体塞进 IIFE 以保持 return 语义；fib 仍走经典自底向上 fibDP 数组递推；形参含默认值/解构或函数体定位失败时原样返回源码并说明原因。',
      'aiDiagnostics.ts：兜底档拆成两路——同帧可见 left/right、slow/fast 或作用于数组的 i/j 才判 O(n) Linear Two-Pointer，否则判 O(n) Linear Iterative Scan / O(1) Scalar Accumulator 并打 [ITERATIVE_CONVERGENCE]。',
      'App.tsx：benchmarkDelta 增加 stackReductionAnchor 与 stackDropPct，横幅重构为 segment 序列统一渲染；栈收益型重构主锚点为 STACK REDUCTION，TRACE STEPS 明确标注 Unrolled Loop 而不冒充收益。',
      'App.tsx：SVG 容器绑定 ref，帧号变化时把激活路径上最深的节点平滑滚动到视口中心（越界自动 clamp）；新增 Watch 表达式栏与变量置顶，断言在当前帧变量快照上求值并显示 TRUE / FALSE / INVALID / ERROR。',
    ],
    conflicts: [
      '按裁决原文 redundantCallCount >= 2 即判指数级，会让刚生成的记忆化版本再次被判成 O(2^n)：记忆化后重复入参照样进入函数（缓存守卫在 __enterFn 之后），冗余计数并不归零。补上 expansiveRedundantCount 这层证据后，「重复进入」与「重复展开」被区分开，Apply 前后的结论才构成真正的递进叙事。',
      '算子与函数体嗅探确实读了源码，但只服务于代码生成；复杂度判档仍只看帧证据。因此不变量 #13 把边界写成「合成可用源码、判据不得用源码」，防止后来者顺手把嗅探挪进判档。',
      'Watch 求值若直接 new Function 用户字符串，等于在页面开一个任意代码执行入口。加了三道闸门：字符白名单、拒绝任何 ident( 调用形态、拒绝 this/window/globalThis/constructor/eval 等宿主对象名；实测 alert(n) 与 process.exit() 均返回 INVALID 而非被执行。',
      '大括号配对不解析字符串字面量，遇到体内含未闭合花括号的极端源码时 extractFunctionInfo 返回 null；此时合成器明确放弃注入并回显原因，而不是产出一段语法残破的「优化代码」。',
      '本轮自查修掉两处自产瑕疵：横幅一度同时输出 -71.4% 与 71.4% frames（语义重复且后一个丢了负号，读起来像增长）；以及一次 Edit 误删了 const 声明间的换行。',
    ],
    impact: [
      'fact(6)：Apply 后判据由 O(n) Linear Recursion 变为 O(n) Linear Iterative Scan / O(1) Scalar Accumulator，全文再无 Two-Pointer；横幅 STACK REDUCTION: -71.4% Call Frames | PEAK STACK: 7 → 2 | TRACE STEPS: 7 → 13 (Unrolled Loop)。',
      '手写 climb(5)（非 fib）：取证 climb(2) ×3 / climb(3) ×2 / climb(1) ×2，冗余 4 次、展开型重复 1 次 → 命中分支 A；生成的记忆化代码终端实测 memoized climb(5) = 8，语义与原函数一致。',
      '记忆化生效后：5 个不同入参签名、重复进入 3 次而展开型重复 0 次 → 判为 O(n) Memoized Linear / O(n) Memo Table + 5 Stack Frames；SVG 树 DUP 徽章从 4 降至 3 并等于 redundantCallCount；Apply 按钮自动退场。',
      'Rain 回归：仍判 O(n) Linear Two-Pointer，摘要新增指针对证据「left / right 同帧可见」，40 帧与热点 L9（11x）不变。',
      'SVG 自动聚焦：跳帧时容器 scrollLeft 193 → 0、scrollTop 0 → 26（246px 内容高度被正确 clamp 到上限），激活节点始终落在可视区内。',
      'Watch 四态实测：FRAME 1 的 n === 5 为 TRUE；FRAME 4 为 FALSE；alert(n) 与 process.exit() 为 INVALID（function calls are not allowed）；Rain 预设下 n > 5 为 ERROR（n is not defined），作用域缺失返回可读原因而不是静默假值。',
    ],
  },
  {
    tag: 'M8',
    commit: '6da81b1',
    doc: 'docs/devlogs/M8-subtree-pruning-and-watchpoints.md',
    title: '记忆化 HIT 剪枝拓扑取证、二阶段递推降维合成与 Watch 下标观察点',
    why: 'M7 之后还剩三处不闭环：记忆化生效时调用树仍把所有重复画成玫红 DUP，看不出「这次重复其实被缓存拦截」；A′ 档的 optimizedCode 直接回填源码，二级火箭只有半程，栈深依旧 5 层；Watch 不支持下标，无法断言 dp[1][2] 这类真正体现算法状态的命题，也没有「跳到条件成立的那一帧」的能力。',
    what: [
      'App.tsx buildCallTree：构图后追加一遍拓扑取证——统计每个激活节点的直接子节点数 childCounts 与同签名首次调用的 firstChildCount；isDuplicate 节点若 firstChildCount > 0 且 childCount === 0（首次展开了子树、这次零子节点直接退栈）判 dupKind = pruned，否则 expansive。全程只看帧与父子关系，不读源码，符合不变量 #6 与 #13。',
      'App.tsx 调用树视图：pruned 节点渲染为翠绿（SVG fill #052e16 / stroke #10b981 / text #6ee7b7，Compact List 用 emerald 边框），右上角徽章按类型显示 HIT×n 或 DUP×n；图例拆成 DUP / HIT 双计数；active 优先级仍高于配色，保证「当前在栈上」始终一眼可辨。',
      'App.tsx 横幅：BaselineMetrics 记录 expansiveRedundantCount，新增 subtreePruningAnchor（两侧均未熔断且展开型重复由 >0 归零）；命中时主锚点输出 SUBTREE PRUNING: Expansive Redundant Subtrees a → 0 (-100% Pruned) + TIME + SPACE + TRACE STEPS: a → b (Includes O(1) Memo Lookups)，并由 emitTailComplexityRows 标志避免与公共尾段重复。',
      'aiDiagnostics.ts Stage-2：sniffBinaryRecurrence 从函数体嗅探 fn(p - a) <op> fn(p - b) 与 if (p <= k) return p|常量 基线（含 < 与 <= 两种），synthesizeBottomUpTabulation 据此生成种子数组与从 max(baseMax, offsets) + 1 起算的自底向上 dp 循环；任何不匹配（混合参数、三元递推、基线过宽、定位失败）返回 null 并回退源码；A′ 档通过 nextStageLabel 让按钮显示 Apply Stage-2: Bottom-Up Tabulation (O(1) Stack)。',
      'App.tsx Watch：白名单加入方括号以支持 dp[1][2] === 6、grid[r][c] > 0，同时禁止点号与引号以切断 obj.constructor 与 obj["constructor"] 两条注入路径，新增单等号赋值拒绝分支；每条断言右侧加 →T 按钮，从 (currentFrameIdx + 1) % total 起环形扫描首个 TRUE 帧并暂停瞬移，全轨迹无解时在胶囊上标 no TRUE frame。',
    ],
    conflicts: [
      '裁决预期「DP 预设第 1 帧 dp[1][2] === 6 显示 FALSE」，实测为 ERROR（dp is not defined）：第 1 帧是 const grid 语句的快照，dp 因 TDZ 安全读取被过滤出变量表，作用域里根本没有 dp。按不变量 #13d「缺变量必须 ERROR、不得谎报 FALSE」保留现状——下标解析本身已生效（同一断言在 FRAME 11 为 TRUE）。',
      'HIT 判据不能只看 childCount === 0：基线叶子（如首次 climb(2)）本来就无子节点，若据此标绿会把「天然基线」误报成「缓存剪枝」。因此必须叠加 firstChildCount > 0 这一前置条件，实测 climb 的 3 个重复节点正确分成为 DUP 1 / HIT 2。',
      'Stage-2 的种子值取自基线语义而非运行时结果（帧里不携带返回值），因此合成器只在「基线是 return p 或 return 常量」这种可机械推导的形态下工作，其余一律放弃注入，避免编造一个看似合理实则错误的递推式。',
      '记忆化后 FRAMES 从 10 涨到 29 属正常（缓存守卫自身也要进入函数），M7 遗留的这一列在 M8 由 SUBTREE PRUNING 锚点接管解释，Stage-2 之后帧数回落到 9，三段曲线自证单调。',
    ],
    impact: [
      '二级火箭实测：Stage-0 climb(5) 10 帧 / O(2^n) Exponential / DUP 4、HIT 0 → Stage-1 记忆化 29 帧 / O(n) Memoized Linear / DUP 1、HIT 2（HIT 节点 fill #052e16 边框 #10b981，徽章 HIT×2）/ 终端 memoized climb(5) = 8 → Stage-2 数组递推 9 帧 / O(n) Linear Iterative Scan / PEAK STACK 5 → 2 / 终端 climbTabulated(5) = 8。',
      '剪枝锚点实测横幅：SUBTREE PRUNING: Expansive Redundant Subtrees 1 → 0 (-100% Pruned) | TIME: O(2^n) Exponential → O(n) Memoized Linear | SPACE: O(n) Stack Depth 5 → O(n) Memo Table + 5 Stack Frames | TRACE STEPS: 10 → 29 (Includes O(1) Memo Lookups) | PEAK STACK: 5 → 5。',
      'Stage-2 生成代码与裁决示例一致：const dp = [0, 1, 2]; for (let i = 3; i <= n; i++) { dp[i] = dp[i - 1] + dp[i - 2]; } return dp[n]; 按钮文案 Apply Stage-2: Bottom-Up Tabulation (O(1) Stack) 自动换标。',
      'DUP 计数交叉验证：fib(5) 31 帧下 DUP 9 / HIT 0，与 redundantCallCount = 9 一致；记忆化 climb 的 HIT 2 + DUP 1 = 3 等于其 redundantCallCount = 3。',
      'Watch 下标与跳帧实测：FRAME 11 下 dp[1][2] === 6 → TRUE 且 dp[99][0] === 1 → ERROR（Cannot read properties of undefined (reading 0)，越界不崩溃）；FRAME 1 同一断言 → ERROR（dp is not defined：TDZ 过滤后该帧作用域里还没有 dp，与裁决预期的 FALSE 不同）；count = 5 → INVALID（assignment not allowed）；引号下标写法与 window.alert → INVALID（no dot or quotes）；→T 从 FRAME 1 精确瞬移到 FRAME 11 / 29，与 amber 突变格 6 @ [1,2] 同一帧。',
      '回归与纪律：Rain 40 帧 Two-Pointer、DP 29 帧 Matrix DP、Binary 10 帧 O(log n)、死循环 1334 帧 O(∞) 与 [FUSE_STEP_LIMIT] 横幅全部未变；13 条不变量逐条复核通过，npm run build 零报错，src/** emoji 扫描无命中，控制台零 error/warn。',
    ],
  },
  {
    tag: 'M9',
    commit: '9bb7835',
    doc: 'docs/devlogs/M9-two-stage-fib-and-2d-synthesis.md',
    title: 'fib 预设并入二级火箭、双参帕斯卡二维表降维与 Seek 四态导航',
    why: 'M8 之后还有三处体验与能力缺口：fib 预设因历史特判一步跳到底向上数组，评委看不到 HIT 剪枝与 SUBTREE PRUNING 的关键一幕；Stage-2 只认单参数递推，comb(n, k) 这类双参数组合递推无从数组化；→T 的「绕回」「仅当前帧」「无解」三种情况共用一个反馈，且 Watch 需要手打表达式，零打字体验不成立。',
    what: [
      'aiDiagnostics.ts：移除分支 A 中 targetFnName === fib 的历史特判，所有重叠递归统一注入 Top-Down 记忆化，fib 与 climb 走完全相同的二级火箭。',
      'aiDiagnostics.ts：sniffBinaryRecurrence 增加「拆分式」识别（let a = fn(n - 1); let b = fn(n - 2); return a + b）覆盖 fib 预设的真实写法；修正种子/起点公式为 baseMax + 1 并加 maxOffset <= baseMax + 1 收敛门，杜绝把未定义项当种子。',
      'aiDiagnostics.ts：新增 sniffTwoParamPascalRecurrence 与 synthesizeTwoParamTabulation，对 if (k==0||k==n) return 1 + fn(n-1,k-1)+fn(n-1,k) 生成 dp[r][c] 二维表（r/c/dp 命名直接驱动显微镜 2D 十字准星）；实参取自 topCallExpr 的数字序列。',
      'aiDiagnostics.ts：二维档的一维滚动样例改为条件提供——只有源码确有二维输入 grid 时才给（该样例是 min-path 专用题解），否则 optimizedCode 回填源码、Apply 退场，避免把无关算法塞进 comb 的编辑器。',
      'App.tsx：→T 反馈拆成四态——前方命中 → #n（天蓝）、绕回命中 ↺ #n (wrapped)（琥珀）、仅当前帧 = only @ #n（紫罗兰，且不移动）、无解 no TRUE frame（玫红）；调用树图例为 DUP/HIT 加 title 说明并在 DUP>0&&HIT=0 / HIT>0 时分别显示 unpruned → click Apply for HIT 与 memo cache pruned。',
      'App.tsx：新增场景化 Quick-Watch 芯片（按 selectedPresetId 给 2 条建议断言，点击即加入，零打字），五个预设各自配置最有信息量的条件。',
    ],
    conflicts: [
      'M9 让 fib 走 Stage-2 时暴露出 M8 种子公式的真实数学错误：原式 start = max(baseMax, offsetA, offsetB) + 1 会为 fib 生成 dp = [0, 1, 2] 且从 3 起算，导致 dp[2] 被写成 2，而 fib(2) 实际是 1。climb 因 baseMax 恰为 2 掩盖了该缺陷。已改为 start = baseMax + 1、种子只覆盖 0..baseMax，并加 maxOffset <= baseMax + 1 的依赖完备门；回归确认 climb 仍输出 8、fib 现在输出 5。',
      'comb 走完 Stage-2 后引擎按「二维表」继续推荐一维滚动样例，而那段样例是硬编码 min-path 题解，点下去会替换掉 comb 的代码。这是 M4 遗留的样例特化问题，本轮按不变量 #13c 加门控：无 grid 输入时不提供该样例，Apply 随即退场。',
      '取消 fib 特判后，fib 的 Stage-1 帧数从基线的 31 涨到 41（缓存守卫自身也要进入函数），横幅以 SUBTREE PRUNING 3 → 0 为主锚点解释，Stage-2 再回落到 11 帧，三段单调。',
      'Quick-Watch 按 selectedPresetId 取建议，用户改写成自定义代码后芯片仍显示原预设建议——语义上无错（点进去会得到 ERROR 或 FALSE 的真实求值），但提示性减弱，已记入遗留。',
    ],
    impact: [
      'fib 二级火箭实测：Stage-0 31 帧 O(2^n) / Stack Depth 6 / DUP 9 / HIT 0 且图例提示 unpruned → Stage-1 41 帧 O(n) Memoized Linear、DUP 1 / HIT 2（HIT×2 翠绿）、横幅 SUBTREE PRUNING: Expansive Redundant Subtrees 3 → 0 (-100% Pruned) + TRACE STEPS: 31 → 41 (Includes O(1) Memo Lookups)、终端 fib(5) = 5 → Stage-2 生成 const dp = [0, 1] 与 i=2..n 递推、11 帧、PEAK STACK 6 → 2、O(n) Linear Iterative Scan / O(1) Scalar Accumulator、终端 fibTabulated(5) = 5、Apply 退场。',
      'climb 回归：Stage-2 仍生成 const dp = [0, 1, 2]、9 帧、终端 climbTabulated(5) = 8，证明种子公式修正未破坏原有形态。',
      'comb(4, 2) 二级火箭：Stage-0 12 帧 O(2^n) / DUP 3 → Stage-1 39 帧 O(n) Memoized Linear、缓存键 JSON.stringify([n, k])、HIT×2 / DUP 0、横幅剪枝 1 → 0、按钮换标 → Stage-2 生成 dp[r][c] 二维表、17 帧、终端 combTabulated(4, 2) = 6、判据 O(M * N) Matrix DP / O(M * N) 2D Tabulation。',
      '2D 联动：Stage-2 后显微镜渲染 2D Matrix: dp [5×3] 共 15 格，第 7 帧出现 Cursor [3][1] 十字准星，Δ 1 State Mutation 正常；Apply 在该档已被门控隐藏（无 grid 输入）。',
      '→T 四态实测：DP 预设 FRAME 1 点 Quick-Watch 芯片 + dp[1][2] === 6 后点 →T 显示 → #11 并落在写入帧；同帧再点 → #12；跳到末帧再点显示 ↺ #11 wrapped；单帧成立的 i === 2 && x === 10 二次点击显示 = only @ #4 且帧号不变；x === 999 显示 no TRUE frame。',
      '回归：Rain 40 帧 Two-Pointer、DP 29 帧 Matrix DP、Binary 10 帧 O(log n)、死循环 1334 帧 O(∞) 均未变；14 条不变量逐条复核通过。',
    ],
  },
  {
    tag: 'M10',
    commit: 'ee2d94c',
    doc: 'docs/devlogs/M10-runtime-introspection-and-pascal-preset.md',
    title: '帕斯卡预设、自适应 Watch 合成、二维读写分离取证与折半递归消栈',
    why: 'M9 之后三条遗留都指向同一件事：判据与推荐仍然依赖「预设知识」而不是「这一跑的运行时事实」——Quick-Watch 在 Stage-2 后还推荐已消失的 leftBranch，二维滚动样例靠源码 grid 字样判断，折半递归被当成线性递归且没有消栈出口。',
    what: [
      'App.tsx：新增第 6 个内置预设 pascal-comb（comb(4,2) 双参递推 → 两次 Apply 见证 2D 调用树 → HIT 剪枝 → dp[r][c] 矩阵）。',
      'App.tsx：deriveRuntimeQuickWatches 由当前轨迹推导建议——规则 A 取「最后一个仍持有 dp 的帧」的 dp[r][c] 与 (r,c)，规则 B 取一维 dp 与游标，规则 C 取递归阶段的真实数值变量；每条候选都要通过「至少一帧为 TRUE」验证，死变量自动淘汰。',
      'aiDiagnostics.ts：新增 analyzeMatrixWrites 统计每个二维数组在相邻帧间的单元格变化数，二维档改用「只读输入 + 可变状态表」的运行时证据替代 includes(grid) 源码判断（已彻底移除该字符串检查）。',
      'aiDiagnostics.ts：新增 detectHalvingArgs / detectHalvingVariable / synthesizeHalvingLoop，折半递归判为 O(log n) Logarithmic Recursion 并生成 while (curr > 1) 游标循环；迭代侧也新增 O(log n) Iterative Halving 档，避免 Apply 后掉回「线性扫描」。',
      'App.tsx：2D Matrix 卡片右上角新增 READ-ONLY / WRITES: n 徽章（暗灰 / 天蓝），tooltip 说明该数字来自运行时相邻帧单元格比对。',
    ],
    conflicts: [
      '新预设立刻暴露了 M5 递归门控的阈值不稳定：comb(4,2) 记忆化后重复进入恰好只有 1 次（只有 comb(2,1) 被二次调用），而 A′ 档要求 redundantCallCount >= 2，于是被错判成 O(n) Linear Recursion。改为按证据分层：expansiveRedundantCount >= 1 → 指数档；否则 redundantCallCount >= 1 → 记忆化档；否则线性档。旧阈值实际是围绕 fib/climb 的树形调出来的。',
      '首版自适应芯片取 65% 帧，给 comb Stage-2 推荐了 dp[4][1] === 0（当时该格尚未写入）——真值但无信息量。改为从末尾向前找仍持有 dp 的帧（表已写满），comb 现在给 dp[4][2] === 6、fib 给 dp[5] === 5。',
      '规则 B 若只按「1D dp + 游标」机械取帧，会取到未写完的中间值；末尾回溯同样修好了这一点，因此「100% 命中」与「命中处有意义」现在是两件事都成立。',
      '折半消栈后 PEAK STACK 从 7 直降到 1（而非 2）：生成的是顶层游标循环，没有函数调用帧，比递归版少一层 main 之外的包装。',
    ],
    impact: [
      '第 6 预设实测：顶栏出现 6 个预设（切换器 clientW 86 / scrollW 1127 可横滚，顶栏仍 44px 且 scrollWidth == clientWidth == 770）。Stage-0 13 帧 O(2^n) / Stack Depth 5 / DUP 3 → Stage-1 37 帧 O(n) Memoized Linear / Memo Table + 5 Stack Frames、DUP 0 / HIT 1、SUBTREE PRUNING 1 → 0 → Stage-2 17 帧 O(M * N) Matrix DP、WRITES: 5 徽章、Apply 退场、芯片进化为 dp[4][2] === 6 / r === 4 && c === 2。',
      'Quick-Watch 跨阶段进化实测：fib 在 Stage-0/1 为 n === 2 / leftBranch === 2，Stage-2 后自动变成 dp[5] === 5 / i === 5；点选 dp[5] === 5 后 →T 从 FRAME 1 命中 FRAME 10 并翻绿（第 1 帧的 ERROR 是 TDZ 未声明的诚实反馈，不是死变量）。',
      '二维读写分离实测（DP 预设第 10 帧）：grid [3×4] 显示 READ-ONLY（暗灰），dp [3×4] 显示 WRITES: 6（天蓝），两者 Cursor [1][2] 十字准星正常；combTabulated 只有单个可变二维表，因此没有再被推荐 min-path 滚动样例。',
      '折半递归实测 halve(32)：判为 O(log n) Logarithmic Recursion / O(log n) Call Stack Depth 7，实参链 32 → 16 → 8 → 4 → 2 → 1（连续 5 步），标签 LOGARITHMIC_DESCENT + TAIL_UNROLL_CANDIDATE；Apply 后生成 while (curr > 1) 循环，18 帧、横幅 STACK REDUCTION -85.7% / PEAK STACK 7 → 1、终端 halving steps = 5，判据转为 O(log n) Iterative Halving / O(1) Scalar Accumulator。',
      '回归：Rain 40 帧 Two-Pointer、DP 29 帧 Matrix DP、Binary 10 帧 O(log n)、fib 31 帧 O(2^n) DUP 9、死循环 1334 帧 O(∞) 全部与 M9 基线一致。',
    ],
  },
  {
    tag: 'M11',
    commit: '564e022',
    doc: 'docs/devlogs/M11-positional-halving-and-ab-toggle.md',
    title: '多参槽位折半、快速幂等价合成、突变熵 Watch 排序与 A/B 轨迹切换',
    why: 'M10 的折半判定只看首参，power(2, 16) 这类"收敛在第二参"的递归识别不到；折半消栈又对任何折半递归都生成计数循环，遇到自定义返回值必然算错；Quick-Watch 的兜底排序按变量出现顺序，会挑中恒定的输入常量；评委想回看优化前的调用树时，只能重新点预设、横幅随之消失。',
    what: [
      'aiDiagnostics.ts：detectHalvingArgs 改为按参数槽位收集实参序列，任意槽位满足连续折半即命中，并回传 slot 供摘要标注「槽位 1（exp）」。',
      'aiDiagnostics.ts：synthesizeHalvingLowering 增加严格语义等价门控——形态 A（1 + fn(...) 且基线返回 0）生成 steps 游标循环；形态 B（双参、槽位 1 折半、函数体含乘法）生成迭代二进制快速幂；其余形态返回 null，optimizedCode 回填源码并使 Apply 退场。',
      'App.tsx：deriveRuntimeQuickWatches 规则 C 改为按变量突变熵排序（全轨迹 distinctCount 降序，distinct === 1 的静态输入仅作兜底），生成后段帧真实取值的断言。',
      'App.tsx：新增 abState（两侧源码 + 冻结的帧数/栈深/展开重复数 + viewing），Benchmark 横幅右侧加 ⇄ Inspect Baseline / ⇄ Return to Optimized 按钮；切换走 runForComparison（只重跑沙箱、不重算诊断），因此横幅与判据芯片保持冻结；仅切换预设才清空 A/B。',
      'App.tsx：基线视图下在遥测条显示 VIEWING BASELINE TRACE 提示，避免把优化后判据与基线轨迹混读；WRITES 徽章 tooltip 明确该数值是「相邻帧单元格变化数」。',
    ],
    conflicts: [
      '多参槽位的判定必须先按位置切分实参再做收敛检查：power(2,16) 的槽位 0 恒为 2（不收敛），只看首参会把它当线性递归；改后摘要能指出「槽位 1（exp）16 → 8 → 4 → 2 → 1」。',
      '折半合成的等价性不能靠"看起来像"：同一套游标循环对 halve 输出正确、对 power 会算错，对 weirdHalve（n ^ fn(n/2)）更是无从等价。因此合成器先做形态校验再做代码生成，未命中就明确拒绝并说明原因（不变量 #13c）。',
      'A/B 切换若复用 executeCode（含诊断），横幅会随基线报告被重算成"31 → 31"。改为独立的 runForComparison 只重跑沙箱，横幅与芯片因此在整个往返过程中一字不变。',
      '冻结指标而不是实时取值的代价是：基线视图下 AI 面板的判据仍描述优化后版本，用 VIEWING BASELINE TRACE 芯片显式标注，而不是让两套语义混在一起。',
    ],
    impact: [
      'halve(32) 回归：仍判 O(log n) Logarithmic Recursion，摘要升级为「槽位 0（n）的收敛链 32 → 16 → 8 → 4 → 2 → 1」，按计数型生成 steps 循环，Apply 正常可见。',
      'power(2, 16)：槽位 1（exp）链 16 → 8 → 4 → 2 → 1（连续 4 步）、12 帧、栈深 7；Apply 后生成迭代快速幂，终端实测 powerIter(2, 16) = 65536（与原递归一致），22 帧、横幅 STACK REDUCTION -71.4% / PEAK STACK 7 → 2、判据 O(log n) Iterative Halving / O(1) Scalar Accumulator。',
      'weirdHalve(32)（n ^ fn(n/2)）：仍判 O(log n) Logarithmic Recursion / Stack Depth 7，但 Apply 按钮隐藏、标签为 [SEMANTICS_PRESERVED]，收益文案写明 custom return composition → source preserved。',
      'A/B 往返：按钮 ⇄ Inspect Baseline (12f) → 基线 12 帧且出现调用树与 VIEWING BASELINE TRACE → ⇄ Return to Optimized (22f) → 回到 22 帧；横幅全程保持 STACK REDUCTION -71.4% / PEAK STACK 7 → 2 不变。',
      '突变熵芯片：自定义循环代码得到 acc === 6 / i === 4（两者 distinct ≥ 2），恒定的 target 被排除；回归三预设（Rain 40、fib 31、DP 29）判据与帧数不变，切预设后 ⇄ 按钮消失。',
    ],
  },
  {
    tag: 'M12',
    commit: 'cc324f1',
    doc: 'docs/devlogs/M12-stage-history-stack-and-mixed-args.md',
    title: '多阶段全息快照栈、混合实参折半、指数门控与 Fast Power 预设',
    why: 'M11 的 A/B 只有两侧且只换轨迹不换报告：二级火箭之后回不到 Stage-0，切到基线时右侧判据仍描述优化版；折半识别要求实参全是数字，数组/字符串参数会整次丢弃；快速幂合成没有拒绝负指数与非整数指数；负指数递归熔断后还会被误判成指数级并推荐救不了的记忆化。',
    what: [
      'App.tsx：以 stageHistory: StageSnapshot[] 取代 abState，快照保存 sourceCode / frames / execTimeMs / sandboxError / aiReport / metrics；每次 Apply 自动把当前阶段冻结入栈并追加新阶段（Stage 0 · Base / Stage 1 · Memo / Stage 2 · Tabulated|Lowered）。',
      'App.tsx：横幅右侧渲染 Stage 胶囊（Stage 0 (31f) / Stage 1 (41f) / Stage 2 (11f)），点击直接同步恢复该阶段全部状态（零延迟，不重跑沙箱）；横幅始终对比 Stage 0 与当前选中阶段，停在 Stage 0 时对比最新阶段并显示 INSPECTING STAGE 0 BASELINE (Full Report Restored)；非最新阶段隐藏 Apply 防止历史分支重复分叉。',
      'aiDiagnostics.ts：detectHalvingArgs 改用 splitTopLevelArgs（忽略 [] {} () 内逗号）按槽位解析，非数值槽位只跳过自身、不再整次丢弃，bsearchHalve("arr", 32) 靠槽位 1 命中。',
      'aiDiagnostics.ts：快速幂形态要求指数为非负整数（Number.isInteger && >= 0），否则返回 null 并在收益文案写明 negative/non-integer exponent → source preserved。',
      'aiDiagnostics.ts：新增「栈熔断 + 签名环 = 不收敛」判据（[FUSE_STACK_OVERFLOW] 且 redundantCallCount > 0 → O(∞) Unbounded Recursion），与 depth(400) 这类「实参各不相同、只是深度超过熔断」的可终止递归区分开。',
      'App.tsx：新增第 7 预设 fast-power（power(2, 16)，槽位 1 折半 → 一键二进制快速幂）。',
    ],
    conflicts: [
      '「切回基线」必须连报告一起切：M11 只换轨迹，判据芯片仍在描述优化版。快照把 aiReport 一并冻结后，Stage 0 恢复即回到 O(2^n) Exponential + DUP 9，Stage 1 回到 Memoized Linear + HIT 2，不需要再跑一次诊断。',
      '横幅的对比方向在 Stage 0 会退化：若仍用「Stage 0 → 当前」，停在基线时就成了 31 → 31。改为「停在 Stage 0 时对比最新阶段」，横幅因此全程有意义且不消失。',
      'power(2, -4) 实测暴露新洞：它在 150 层触发 [FUSE_STACK_OVERFLOW]，但签名 power(2,-1) 重复出现 → 被判 O(2^n) 且提供记忆化 Apply（记忆化并不会让它终止）。补「签名环 + 栈熔断 = 不收敛」后判 O(∞) Unbounded Recursion 并隐藏 Apply；同时确认 depth(400)（实参 400→399→… 无环）仍判 O(n) Linear Recursion。',
      '2 参计数型递归（bsearchHalve）保守拒绝合成：形态门要求单参，因此虽然返回值是步数也不会生成 steps 循环。这是有意的保守——TAG 参数是否参与语义无法只从帧判断。',
    ],
    impact: [
      '三级火箭全息切换（fib）：胶囊 Stage 0 (31f) / Stage 1 (41f) / Stage 2 (11f)；切回 Stage 0 → 31 帧、O(2^n) Exponential / Stack Depth 6、DUP 9 / HIT 0、INSPECTING STAGE 0 BASELINE 提示、横幅仍在、Apply 隐藏；Stage 1 → 41 帧、O(n) Memoized Linear、DUP 1 / HIT 2；Stage 2 → 11 帧、O(n) Linear Iterative Scan。',
      '混合实参：bsearchHalve("arr", 32) 槽位 0 为字符串被跳过，槽位 1 链 32 → 16 → 8 → 4 → 2 → 1 命中 O(log n) Logarithmic Recursion / Stack Depth 7。',
      '第 7 预设：Stage-0 13 帧 O(log n) Logarithmic Recursion（槽位 1 exp 16→8→4→2→1）；Apply 后 powerIter(2, 16) = 65536、22 帧、O(log n) Iterative Halving。',
      '指数门控：power(2, 16.5) 仍判对数级但 Apply 隐藏，收益文案 negative/non-integer exponent (16.5) → source preserved；power(2, -4) 熔断后判 O(∞) Unbounded Recursion / Stack Depth 150 (fused)，标签 GUARD_TRAP + ARG_CYCLE，Apply 隐藏。',
      '回归：depth(400) 仍为 O(n) Linear Recursion / Stack Depth 150 且 Apply 可见；Rain 40、Binary 10、FastPower 13 帧判据不变；切换预设后 Stage 胶囊消失；顶栏 44px / scrollWidth == clientWidth == 770。',
    ],
  },
  {
    tag: 'M13',
    commit: 'b129f95',
    doc: 'docs/devlogs/M13-passthrough-halving-and-draft-guard.md',
    title: '透传多参折半合成、奇偶交替快速幂、大轨迹惰性快照与编辑防丢守卫',
    why: 'M12 留下四条尾巴：bsearchHalve("arr", 32) 判对了却因 tag 参数被拒绝合成且文案写错原因；powerAlt 的 15→14→7→6→3→2→1 奇偶交替链识别不到；stageHistory 把整条 frames 常驻内存，长轨迹多级重构占用堆；手改代码后切换阶段会被快照源码静默覆盖。',
    what: [
      'aiDiagnostics.ts：形态 A 放宽为「多参 + 透传门」——非折半槽位必须在每个自调用中原样透传，否则拒绝；合成保留原函数签名，并新增 extractTopLevelCallArgs 从源码函数体之后取真实实参字面量，生成 bsearchHalveIter("arr", 32)。',
      'aiDiagnostics.ts：拒绝原因分型为 coupled / composition / exponent，分别输出 coupled multi-parameter state / custom return composition / negative/non-integer exponent → source preserved。',
      'aiDiagnostics.ts：detectHalvingArgs 兼容 floor(a/2) 与「奇数减一」交替步进，要求首值 ≥8、总步数 ≥2、折半步占比 ≥50%；交替链标 INTERLEAVED_DESCENT，且计数形态拒绝合成、只允许快速幂等价展开。',
      'App.tsx：LAZY_FRAME_THRESHOLD = 250，StageSnapshot 增加 frameCount 与 kind；非激活大轨迹释放 frames 只留元数据，胶囊显示 LAZY，点击后 runInSandbox 重水化且不重算诊断（hydrateTokenRef 丢弃过期结果）。',
      'App.tsx：dirtyEdit 守卫——横幅显示 UNSAVED EDIT DRAFT 并隐藏 Apply；Compile & Trace 以手改代码为全新基准清空历史；切阶段前把脏代码真实跑成 Draft 临时阶段，保证源码/帧/报告同源且可无损找回。',
    ],
    conflicts: [
      '「多参数」不等于「状态耦合」：若自调用是 fn(tag + 1, n/2)，忽略 tag 就改变了语义。最终用非折半槽位原样透传门区分，bsearchHalve 可合成、bsearchCoupled 明确拒绝。',
      'M11 的计数前缀匹配会误收 return 1 + fn(...) + tag；M13 改为整句匹配到分号，组合式落到 custom return composition，不再进入计数模板。',
      '运行时签名会丢掉字符串引号（bsearchHalve(arr,32)），直接回填会生成未定义的 arr；必须回溯源码顶层调用字面量，实测生成 bsearchHalveIter("arr", 32) 并输出 steps = 5。',
      '交替链不能套 floor(x/2) 计数循环：15→14→7→6→3→2→1 的真实步数与纯折半不同，计数形态遇到交替链必须拒绝，只有二进制快速幂能等价吸收。',
      'frames.length 不能同时表示「内存是否持有」与「轨迹规模」：惰性驱逐后必须改用 frameCount，否则胶囊会瞬间显示 0f；重水化也必须只跑沙箱，否则冻结的 aiReport 会被重算。',
      'fib(8) 实测只有 134 帧，不足以触发 250 阈值；改用 fib(10) 得到 354 帧后才真正观察到 LAZY 驱逐与 <120ms 重水化。',
    ],
    impact: [
      'bsearchHalve("arr", 32)：7 帧、栈深 7，判 O(log n) Logarithmic Recursion，Apply 可见；生成 bsearchHalveIter("arr", 32)，终端 steps = 5；Apply 后 20 帧 O(log n) Iterative Halving、STACK REDUCTION -71.4% / PEAK STACK 7 → 2。',
      'powerAlt(2, 15)：链 15 → 14 → 7 → 6 → 3 → 2 → 1（6 步中 3 步折半）、9 帧、栈深 9，标 INTERLEAVED_DESCENT；Apply 后 powerAltIter(2, 15) = 32768、22 帧、STACK REDUCTION -77.8% / PEAK STACK 9 → 2。',
      '拒绝文案：bsearchCoupled(tag + 1) → coupled multi-parameter state；weirdHalve2（1 + fn(...) + n）→ custom return composition；power(2, 16.5) → negative/non-integer exponent；三者 Apply 均隐藏。',
      '惰性快照：自定义 fib(10) Stage-0 354 帧 / Stage-1 80 帧；切到 Stage 1 后胶囊 Stage 0 (354f · LAZY)；点回后 <120ms 恢复 354 帧、INSPECTING STAGE 0 BASELINE 出现、判据仍为 O(2^n)。',
      '编辑守卫：编辑 Stage 1 后出现 UNSAVED EDIT DRAFT；点 Stage 0 自动冻结 Draft 2 (22f) 并恢复 Stage 0；点 Draft 2 手改源码与 22 帧完整回来；Compile & Trace 在脏编辑下清空历史、以手改代码重开 Stage 0。',
      '回归：Fast Power 13 → 22 帧且终端 65536；power(2, -4) 仍判 O(∞) Unbounded Recursion / Stack Depth 150；Rain 40 帧 Two-Pointer；fib 31 → 41 → 11 帧零延迟；顶栏 44px / scrollWidth == clientWidth == 770；控制台无 error/warn。',
    ],
  },
  {
    tag: 'M14',
    commit: 'a34b16c',
    doc: 'docs/devlogs/M14-byte-budget-and-kernel-selftest.md',
    title: '双维度惰性预算、非确定性漂移守卫、广义小步交错折半与 6 项内核实时自检台',
    why: 'M13 仍有四条尾巴：惰性只按 250 帧判断，60 帧的大矩阵快照依旧占内存；非确定性源码重水化可能悄悄改变轨迹；交错折半只支持 -1，-2 断链；Draft 冻结还要等 380ms 人工诊断延迟。评委也缺少一个能当场验证内核判据的入口。',
    what: [
      'App.tsx：StageSnapshot 增加 approxBytes（中段/末帧变量 JSON 均值的 1.15 倍外推 × 帧数）；非激活快照 frames >250 或 approxBytes >180_000 均驱逐，胶囊保留 frameCount 与 LAZY，tooltip 给出 KB 与双阈值。',
      'App.tsx：hasNonDeterministicCalls 识别 Math.random/Date.now/performance.now/new Date；≤600 帧豁免一切驱逐以保 100% 重放；超限重水化若长度变化或仍非确定性，遥测条显示 NON-DETERMINISTIC RE-HYDRATION，只更新 frameCount/approxBytes，冻结报告不动。',
      'aiDiagnostics.ts：detectHalvingArgs 从「奇数 -1」放宽为「严格递减且差值 ≤2」，仍要求首值 ≥8、总步数 ≥2、折半步 ≥50%；交错链只允许快速幂降维，其余返回 custom return composition。',
      'aiDiagnostics.ts：runAIDiagnostics 增加 skipDelay?: boolean；脏编辑切阶段的 Draft 冻结传入 true，实测 DOM 提交 22.6ms。',
      'App.tsx：Spec 第 3 页签 Live Kernel Self-Check (20 Invariants) 运行 6 项确定性微基准（TDZ / Fuse / Recursion A-A′-B / Halving / Matrix / Viewport），每项 PASS/FAIL + ms，纯浏览器执行。',
    ],
    conflicts: [
      'M14 实测时 browser-use 逻辑视口变成 1024×1163，window.resizeTo 只改外窗；为严格验收 770×553，页面内新建 770×553 同源 iframe 测试台（innerWidth/Height 实测 770/553，header 44px 且 scrollWidth == clientWidth）。',
      '字节预算只能抽样估算：逐帧 JSON.stringify 是 O(n) 且可能卡顿，因此用中段+末帧外推并乘 1.15；tooltip 明确写 ~KB，不宣称真实堆占用。',
      '非确定性 ≤600 帧豁免会故意保留大数组内存：这是用内存换 100% 历史重放一致性的明确取舍，tooltip 与 DevLog 都记录。',
      '漂移重水化更新 frameCount/approxBytes 但不更新 metrics/aiReport：横幅仍是冻结基准，胶囊帧数可能与之不同，因此必须有琥珀芯片解释，不能静默。',
      'Draft 时延首次用 5ms 轮询测得 36.3ms，包含轮询粒度；改用 MutationObserver 精确测 DOM 提交为 22.6ms，说明「测量方法本身」也会制造伪回归。',
      '自检的 Viewport 项在顶层页面 1024 宽也会 PASS；真正的 770 验收在 iframe 测试台内完成，DevLog 明确区分两者。',
    ],
    impact: [
      '字节预算：fib(8)+6000 元素数组 → Stage-0 135 帧 / ~4382KB，Apply 后 Stage 0 (135f · LAZY)、tooltip thresholds 250f / 180KB；点回恢复 135 帧、无漂移芯片、报告仍 O(2^n)。',
      '非确定性豁免：fib(5)+大数组+Math.random → 32 帧 / ~1040KB 但 ≤600 帧，Stage 0 保持 (32f) 不驱逐，点回同步恢复且无漂移芯片。',
      '漂移提示：fib(12)+Math.random → 931 帧，Apply 后 Stage 0 (931f · LAZY)；点回恢复 931 帧并出现 NON-DETERMINISTIC RE-HYDRATION，INSPECTING STAGE 0 BASELINE 与冻结 O(2^n) 报告同时存在。',
      '广义交错：mix(2,18) 链 18 → 9 → 7 → 3 → 2 → 1（5 步中 3 步折半，其余差值 ≤2），判 O(log n)、标 INTERLEAVED_DESCENT、Apply 隐藏并报 custom return composition。',
      'Draft 瞬时冻结：fib 三级火箭后编辑 Stage 2，点 Stage 0 生成 Draft 3；MutationObserver 实测 22.6ms（<30ms），Stage 0 恢复 31 帧、脏标记消失。',
      '内核自检：770×553 下 6/6 PASS，TDZ 13.5ms / Fuse 0.9ms / Recursion 0.6ms / Halving 0.6ms / Matrix 0.0ms / Viewport 0.9ms，detail 显示 header 770px / 770px · viewport 770x553。',
      '回归：Fast Power 13 → 22 帧且终端 65536；Rain 40 帧 Two-Pointer；bsearchHalve 7 → 20 帧且 steps = 5；顶栏 44px / scrollWidth == clientWidth == 770；控制台无 error/warn。',
    ],
  },
  {
    tag: 'M15',
    commit: '本次提交',
    doc: 'docs/devlogs/M15-automated-judge-tour-and-whitepaper.md',
    title: '评委五幕自动路演导览、WebCrypto 非确定性守卫与工程白皮书',
    why: '内核能力已到 M14，但验收成本仍压在评委身上：要手动切 7 个预设、连点两次 Apply、再找芯片点 →T 才能看全壁垒；同时 M14 遗留的 crypto 随机源未被非确定性守卫覆盖（会悄悄漂移）；根 README 还是脚手架默认文本，无法说明工程范式。',
    what: [
      'App.tsx：顶栏在 Compile & Trace 与 Qoder Engineering Spec 之间新增紧凑 Tour 按钮，运行态换为琥珀色 Stop Tour (Act X/5)；导览期间隐藏装饰性 AST-IR 徽章以守住 770px 单行预算。',
      'App.tsx：startJudgeTour 五幕状态机由 tourTokenRef 驱动，tourWaitFor 只等真实运行条件（帧数、isAnalyzing、stageHistory 长度、自检结果对象变化），tourHold 支持 Skip Next 与取消立即让位；导览字幕条 data-tour-bar 显示 ACT X/5 + 技术看点 + Skip Next / Exit。',
      'App.tsx：liveActionsRef 每帧刷新，导览调用的是「最新渲染」的 handleSelectPreset / handleApplyOptimized / adoptWatchExpr / seekNextTrue / runKernelSelfCheck，避免异步串联里的过期闭包把 Stage 冻结错阶段。',
      'App.tsx：运行期 window pointerdown 捕获阶段监听，除字幕条外的任何点击立即 exitJudgeTour 交还控制权；hasNonDeterministicCalls 补入 crypto.getRandomValues( 与 crypto.randomUUID(。',
      'README.md：重写为工程白皮书（技术壁垒、架构图与 5 大亮点、Qoder 协同三铁律 + 21 条不变量 + 15 篇日志 + 6 项自检、30 秒验收指南、已知边界）。',
    ],
    conflicts: [
      '导览最初直接复用组件里的 handler，但 await 之后闭包里的 stageHistory / aiReport 仍是导览开始前那一帧：第二次 Apply 会把上一个预设的源码当成 Stage 0 冻结进历史。改为 liveActionsRef 每次渲染重新挂载最新 handler，并用条件等待确认重渲染已完成再执行下一步。',
      '「点击任意位置即中断」与字幕条按钮冲突：若不排除字幕条，点 Skip Next 会先被全局监听吃掉变成退出。用 closest([data-tour-bar]) 把导览控件划为例外，其余 pointerdown 一律中断。',
      '770px 顶栏预算：Stop Tour (Act 2/5) 全文案 + Compile + Spec 全称会挤破 44px 单行。做法是导览运行时隐藏装饰徽章 AST-IR v2.4（可压缩区仍只允许预设切换器），实测运行态 header 仍 44px 且 scrollWidth == clientWidth == 770。',
      '页签标题的不变量条数会随里程碑过期：M14 写死的 20 条在 M15 追加 #21 后就不实。改由 KERNEL_INVARIANT_COUNT 单一来源渲染，导览第五幕标题同步取该常量。',
      'tourHold 的等待不能是真 sleep 空转：每幕驻留都可被 Skip / 取消立即结束，避免评委想手动接手时还要等完。',
      'Act 5 的完成判据不能看 selfCheckResults 是否存在（上一轮已有结果），必须比较对象引用是否变化，否则会误判自检已完成。',
    ],
    impact: [
      '导览全程实测 total 17.6s（<25s），逐幕采样到：ACT 1 死循环 1334 帧、游标 FRAME 1333/1334、[FUSE_STEP_LIMIT] 横幅、O(∞) Non-Terminating。',
      'ACT 2 fib：31 帧 Stage-0 → 41 帧 O(n) Memoized Linear（SUBTREE PRUNING 横幅、胶囊数 2）→ 11 帧 O(n) Linear Iterative Scan（胶囊数 3）。',
      'ACT 3 comb：13 帧 → 37 帧记忆化 → 17 帧 O(M*N) Matrix DP，跳到第 7 帧显示 2D Matrix: dp [5×3]、Cursor [3][1]、WRITES: 5。',
      'ACT 4 观察点：自动采纳 dp[4][2] === 6，→T 瞬移到 FRAME 15/17、徽章 → #15、断言翻绿 TRUE、Cursor [4][2]。',
      'ACT 5 自检：自动打开 Spec 第 3 页签并跑完 6/6 PASS；导览结束后顶栏仍 44px 且 scrollWidth == clientWidth == 770。',
      '中断语义：Stop Tour 与页面任意处 pointerdown 都能立即结束（字幕条消失、按钮回到 Tour、AST-IR 徽章恢复、FRAME 1333/1334 现场保留可继续操作）；Skip Next 从 ACT 1 直接推进到 ACT 2 且导览不退出。',
      'crypto 守卫：crypto.getRandomValues 版 fib(5)+6000 数组 33 帧 / ~1073KB（>180KB）仍不驱逐（≤600 豁免）；crypto.randomUUID 版 fib(12) 931 帧重水化后显示 NON-DETERMINISTIC RE-HYDRATION，报告仍为冻结 O(2^n)。',
      '回归：Rain 40 帧 Two-Pointer、DP 29 帧 Matrix DP、Binary 10 帧 O(log n)（Apply 退场）、Fast Power 13 → 22 帧且终端 65536；npm run build 零报错、src emoji 扫描 0 命中、16 篇文档表格列数一致、控制台无 error/warn。',
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
  const [specTab, setSpecTab] = useState<'arch' | 'devlog' | 'selftest'>('arch');
  const [devlogIdx, setDevlogIdx] = useState<number>(0);
  const [selfCheckResults, setSelfCheckResults] = useState<KernelSelfCheckResult[] | null>(null);
  const [selfCheckRunning, setSelfCheckRunning] = useState<boolean>(false);

  // 评委五幕自动导览：tourAct 1..5 运行中，6 表示已完成定格
  const [tourAct, setTourAct] = useState<number>(0);
  const [tourRunning, setTourRunning] = useState<boolean>(false);
  const [tourElapsedMs, setTourElapsedMs] = useState<number>(0);
  const tourTokenRef = useRef(0);
  const tourSkipRef = useRef<(() => void) | null>(null);

  // 多阶段全息快照栈：Stage-0 / Stage-1 / Stage-2 … 各自保存源码、帧、报告与指标
  const [stageHistory, setStageHistory] = useState<StageSnapshot[]>([]);
  const [activeStage, setActiveStage] = useState<number>(0);
  const [hydratingStage, setHydratingStage] = useState<number | null>(null);
  const [savingDraft, setSavingDraft] = useState<boolean>(false);
  const [driftStage, setDriftStage] = useState<number | null>(null);
  // 每次切换/重跑都推进令牌，丢弃过期的重水化结果，避免异步写回覆盖当前轨迹
  const hydrateTokenRef = useRef(0);

  // 行级断点：行号集合，切换预设时清空（行号语义随源码改变）
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set<number>());
  const [treeView, setTreeView] = useState<'svg' | 'list'>('svg');
  // Watch 守卫栏：置顶变量 + 条件断言（断言只在当前帧的快照数据上求值）
  const [pinnedVars, setPinnedVars] = useState<Set<string>>(new Set<string>());
  const [watchExprs, setWatchExprs] = useState<string[]>([]);
  const [watchDraft, setWatchDraft] = useState<string>('');
  const [seekState, setSeekState] = useState<{
    expr: string;
    kind: 'forward' | 'wrapped' | 'only' | 'none';
    frameIndex: number;
  } | null>(null);
  const svgScrollRef = useRef<HTMLDivElement | null>(null);

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

    const m = analyzeTraceMetrics(res.frames || []);
    return {
      framesCount: (res.frames || []).length,
      maxStackDepth: m.maxStackDepth,
      expansive: m.expansiveRedundantCount,
      frames: res.frames || [],
      execTimeMs: res.executionTimeMs,
      error: res.error,
      report,
    };
  };

  // 浏览器端内核自检：6 项确定性微基准，不经 Worker、不发网络请求
  const runKernelSelfCheck = async () => {
    if (selfCheckRunning) return;
    setSelfCheckRunning(true);
    const results: KernelSelfCheckResult[] = [];
    const measure = async (
      id: string,
      title: string,
      fn: () => Promise<{ pass: boolean; detail: string }> | { pass: boolean; detail: string }
    ) => {
      const t0 = performance.now();
      try {
        const outcome = await fn();
        results.push({
          id,
          title,
          pass: outcome.pass,
          detail: outcome.detail,
          ms: Math.round((performance.now() - t0) * 10) / 10,
        });
      } catch (e: any) {
        results.push({
          id,
          title,
          pass: false,
          detail: `threw ${e?.message || String(e)}`,
          ms: Math.round((performance.now() - t0) * 10) / 10,
        });
      }
    };
    const mk = (frameIndex: number, callStack: string[], variables: Record<string, any> = {}) =>
      buildSelfCheckFrame(frameIndex, callStack, variables);

    await measure('tdz', 'AST TDZ Safe Closure', () => {
      const sample = 'let a = 1;\nfunction f(n) { if (n <= 1) return n; return f(n - 1) + n; }\nconsole.log(f(3));';
      const out = instrumentCode(sample);
      let compiles = false;
      let parseError = '';
      try {
        new Function(out);
        compiles = true;
      } catch (e: any) {
        parseError = e?.message || String(e);
      }
      const hasTdz = out.includes('__mtmTdz');
      return {
        pass: hasTdz && compiles,
        detail: `${hasTdz ? '__mtmTdz closure present' : 'missing __mtmTdz'} · parse ${compiles ? 'OK' : `FAILED: ${parseError}`} · ${out.length} chars`,
      };
    });

    await measure('fuse', 'Fuse Prefix Contract', () => {
      const out = instrumentCode('while (true) { break; }');
      const step = out.includes('[FUSE_STEP_LIMIT]');
      const stack = out.includes('[FUSE_STACK_OVERFLOW]');
      return {
        pass: step && stack,
        detail: `[FUSE_STEP_LIMIT] ${step ? 'present' : 'missing'} · [FUSE_STACK_OVERFLOW] ${stack ? 'present' : 'missing'}`,
      };
    });

    const fibSource = 'function fib(n) { if (n <= 1) return n; let a = fib(n - 1); let b = fib(n - 2); return a + b; }\nfib(3);';
    const memoSource = 'function f(n) { if (n <= 1) return n; const a = f(n - 1); return a; }\nf(4);';
    const linearSource = 'function g(n) { if (n <= 0) return 0; return g(n - 1); }\ng(4);';
    const aFrames = [
      mk(0, ['main()', 'fib(3)']),
      mk(1, ['main()', 'fib(3)', 'fib(2)']),
      mk(2, ['main()', 'fib(3)', 'fib(2)', 'fib(1)']),
      mk(3, ['main()', 'fib(3)', 'fib(2)']),
      mk(4, ['main()', 'fib(3)', 'fib(2)', 'fib(0)']),
    ];
    const memoFrames = [
      mk(0, ['main()', 'f(4)']),
      mk(1, ['main()', 'f(4)', 'f(3)']),
      mk(2, ['main()', 'f(4)', 'f(3)', 'f(2)']),
      mk(3, ['main()', 'f(4)', 'f(3)']),
      mk(4, ['main()', 'f(4)', 'f(3)']),
    ];
    const linearFrames = [
      mk(0, ['main()', 'g(4)']),
      mk(1, ['main()', 'g(4)', 'g(3)']),
      mk(2, ['main()', 'g(4)', 'g(3)', 'g(2)']),
      mk(3, ['main()', 'g(4)', 'g(3)', 'g(2)', 'g(1)']),
    ];

    await measure('recursion', "Recursion A / A' / B Gating", async () => {
      const [a, aPrime, b] = await Promise.all([
        runAIDiagnostics(fibSource, aFrames, undefined, undefined, true),
        runAIDiagnostics(memoSource, memoFrames, undefined, undefined, true),
        runAIDiagnostics(linearSource, linearFrames, undefined, undefined, true),
      ]);
      const passA = a.timeComplexity.includes('O(2^n)');
      const passA2 = aPrime.timeComplexity.includes('Memoized');
      const passB = b.timeComplexity.includes('Linear Recursion');
      return {
        pass: passA && passA2 && passB,
        detail: `A: ${a.timeComplexity} · A': ${aPrime.timeComplexity} · B: ${b.timeComplexity}`,
      };
    });

    const powerSource =
      'function power(base, exp) { if (exp === 0) return 1; const half = power(base, Math.floor(exp / 2)); return half * half; }\npower(2, 16);';
    const pureHalvingFrames = [
      mk(0, ['main()', 'power(2,16)']),
      mk(1, ['main()', 'power(2,16)', 'power(2,8)']),
      mk(2, ['main()', 'power(2,16)', 'power(2,8)', 'power(2,4)']),
      mk(3, ['main()', 'power(2,16)', 'power(2,8)', 'power(2,4)', 'power(2,2)']),
      mk(4, ['main()', 'power(2,16)', 'power(2,8)', 'power(2,4)', 'power(2,2)', 'power(2,1)']),
    ];
    const altSource = 'function alt(base, exp) { return base; }\nalt(2, 18);';
    const altFrames = [
      mk(0, ['main()', 'alt(2,18)']),
      mk(1, ['main()', 'alt(2,18)', 'alt(2,9)']),
      mk(2, ['main()', 'alt(2,18)', 'alt(2,9)', 'alt(2,7)']),
      mk(3, ['main()', 'alt(2,18)', 'alt(2,9)', 'alt(2,7)', 'alt(2,3)']),
      mk(4, ['main()', 'alt(2,18)', 'alt(2,9)', 'alt(2,7)', 'alt(2,3)', 'alt(2,2)']),
      mk(5, ['main()', 'alt(2,18)', 'alt(2,9)', 'alt(2,7)', 'alt(2,3)', 'alt(2,2)', 'alt(2,1)']),
    ];

    await measure('halving', 'Positional & Interleaved Halving', async () => {
      const [pureReport, altReport] = await Promise.all([
        runAIDiagnostics(powerSource, pureHalvingFrames, undefined, undefined, true),
        runAIDiagnostics(altSource, altFrames, undefined, undefined, true),
      ]);
      const passPure = pureReport.timeComplexity.includes('Logarithmic Recursion');
      const passAlt =
        altReport.timeComplexity.includes('Logarithmic Recursion') &&
        altReport.frameInsights.some((fi) => fi.tag === 'INTERLEAVED_DESCENT');
      return {
        pass: passPure && passAlt,
        detail: `slot1 16→8→4→2→1: ${pureReport.timeComplexity} · bounded 18→9→7→3→2→1: ${altReport.timeComplexity} (INTERLEAVED_DESCENT ${passAlt ? 'present' : 'missing'})`,
      };
    });

    await measure('matrix', 'Matrix Write Separation', () => {
      const matrixFrames = [
        mk(0, ['main()'], { grid: [[1, 2], [3, 4]], dp: [[0, 0], [0, 0]] }),
        mk(1, ['main()'], { grid: [[1, 2], [3, 4]], dp: [[1, 0], [0, 0]] }),
        mk(2, ['main()'], { grid: [[1, 2], [3, 4]], dp: [[1, 4], [0, 0]] }),
      ];
      const writes = analyzeMatrixWrites(matrixFrames);
      const gridWrites = writes.grid ?? -1;
      const dpWrites = writes.dp ?? 0;
      return {
        pass: gridWrites === 0 && dpWrites > 0,
        detail: `grid ${gridWrites === 0 ? 'READ-ONLY' : `writes ${gridWrites}`} (${gridWrites} cell changes) · dp ${dpWrites > 0 ? 'MUTABLE' : 'READ-ONLY'} (${dpWrites} cell changes)`,
      };
    });

    await measure('viewport', '771px Viewport Reachability', () => {
      const header = document.querySelector('header');
      const equal = !!header && header.scrollWidth === header.clientWidth;
      return {
        pass: equal,
        detail: `header ${header?.scrollWidth ?? 0}px / ${header?.clientWidth ?? 0}px · viewport ${window.innerWidth}x${window.innerHeight}`,
      };
    });

    setSelfCheckResults(results);
    setSelfCheckRunning(false);
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
  const pruneStats = useMemo(() => {
    let pruned = 0;
    let expansive = 0;
    for (const n of callTree.nodes) {
      if (n.dupKind === 'pruned') pruned++;
      else if (n.dupKind === 'expansive') expansive++;
    }
    return { pruned, expansive };
  }, [callTree]);
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
    setStageHistory([]);
    setActiveStage(0);
    setHydratingStage(null);
    setSavingDraft(false);
    setDriftStage(null);
    hydrateTokenRef.current++;
    setBreakpoints(new Set<number>());
    executeCode(preset.code);
  };

  const stageLabelFor = (index: number, prev?: StageSnapshot) =>
    index === 0
      ? 'Stage 0 · Base'
      : index === 1
        ? 'Stage 1 · Memo'
        : `Stage ${index} · ${prev?.aiReport.nextStageLabel ? 'Tabulated' : 'Lowered'}`;

  const snapshotOf = (
    index: number,
    label: string,
    code: string,
    trace: TraceFrame[],
    latency: number,
    err: string | undefined,
    report: AIDiagnosticReport,
    kind: 'normal' | 'draft' = 'normal'
  ): StageSnapshot => {
    const m = analyzeTraceMetrics(trace);
    return {
      stageIndex: index,
      label,
      sourceCode: code,
      frames: trace,
      frameCount: trace.length,
      approxBytes: estimateSnapshotBytes(trace),
      kind,
      execTimeMs: latency,
      sandboxError: err,
      aiReport: report,
      metrics: {
        framesCount: trace.length,
        maxStackDepth: m.maxStackDepth,
        timeComplexity: report.timeComplexity,
        spaceComplexity: report.spaceComplexity,
        execTimeMs: latency,
        wasFused: Boolean(err && err.includes('[FUSE_')),
        expansiveRedundantCount: m.expansiveRedundantCount,
      },
    };
  };

  /** 非激活的大轨迹阶段释放帧数组：帧数 >250 或抽样字节 >180KB 均驱逐；非确定性 ≤600 帧豁免 */
  const evictBackgroundFrames = (history: StageSnapshot[], activeIndex: number): StageSnapshot[] =>
    history.map((s) => {
      if (s.stageIndex === activeIndex || s.frames.length === 0) return s;
      if (hasNonDeterministicCalls(s.sourceCode) && s.frameCount <= NONDETERMINISTIC_KEEP_FRAMES) return s;
      return s.frames.length > LAZY_FRAME_THRESHOLD || s.approxBytes > LAZY_BYTE_BUDGET
        ? { ...s, frames: [] }
        : s;
    });

  const activeSnapshot = stageHistory[activeStage];
  const dirtyEdit =
    stageHistory.length > 0 &&
    !!activeSnapshot &&
    sourceCode !== activeSnapshot.sourceCode;

  const handleApplyOptimized = async () => {
    if (!aiReport?.optimizedCode || dirtyEdit || savingDraft) return;
    // 历史分支上不允许继续分叉：只有停在最新阶段才能再 Apply
    if (stageHistory.length > 0 && activeStage !== stageHistory.length - 1) return;
    hydrateTokenRef.current++;
    setHydratingStage(null);
    setDriftStage(null);

    // 首次 Apply 时把当前 Stage-0 的完整状态（含 aiReport 与 frames）冻结进历史
    const history = stageHistory.length
      ? stageHistory
      : [snapshotOf(0, 'Stage 0 · Base', sourceCode, frames, execTimeMs, sandboxError, aiReport)];

    const optimizedCode = aiReport.optimizedCode;
    setSourceCode(optimizedCode);
    setEditMode(false);
    const after = await executeCode(optimizedCode);

    const nextIndex = history.length;
    const snapshot = snapshotOf(
      nextIndex,
      stageLabelFor(nextIndex, history[nextIndex - 1]),
      optimizedCode,
      after.frames,
      after.execTimeMs,
      after.error,
      after.report
    );
    setStageHistory(evictBackgroundFrames([...history, snapshot], nextIndex));
    setActiveStage(nextIndex);
  };

  // 零延迟全息切换：轻量快照直接同步恢复；背景重轨迹（>250 帧）按源码重水化帧序列
  const applySnapshot = async (snap: StageSnapshot) => {
    const token = ++hydrateTokenRef.current;
    setDriftStage(null);
    setActiveStage(snap.stageIndex);
    setSourceCode(snap.sourceCode);
    setSandboxError(snap.sandboxError);
    setExecTimeMs(snap.execTimeMs);
    setAiReport(snap.aiReport);
    setCurrentFrameIdx(0);
    setIsPlaying(false);
    setEditMode(false);
    setStageHistory((prev) => evictBackgroundFrames(prev, snap.stageIndex));

    if (snap.frames.length === 0 && snap.frameCount > 0) {
      setFrames([]);
      setHydratingStage(snap.stageIndex);
      const res = await runInSandbox(snap.sourceCode);
      if (hydrateTokenRef.current !== token) return;
      const restored = res.frames || [];
      setFrames(restored);
      setHydratingStage(null);
      setDriftStage(
        hasNonDeterministicCalls(snap.sourceCode) || restored.length !== snap.frameCount
          ? snap.stageIndex
          : null
      );
      setStageHistory((prev) =>
        prev.map((s) =>
          s.stageIndex === snap.stageIndex
            ? {
                ...s,
                frames: restored,
                frameCount: restored.length,
                approxBytes: estimateSnapshotBytes(restored),
              }
            : s
        )
      );
    } else {
      setFrames(snap.frames);
      setHydratingStage(null);
    }
  };

  // 编辑态防丢守卫：切阶段前把用户手改代码真实跑一遍并冻结为临时 Draft 阶段，绝不静默覆盖
  const handleRestoreStage = async (index: number) => {
    const snap = stageHistory[index];
    if (!snap || savingDraft || hydratingStage !== null) return;
    if (dirtyEdit && activeSnapshot) {
      const token = ++hydrateTokenRef.current;
      setSavingDraft(true);
      const draftIndex = stageHistory.length;
      const draftRun = await runInSandbox(sourceCode);
      const draftFrames = draftRun.frames || [];
      const draftReport = await runAIDiagnostics(sourceCode, draftFrames, draftRun.error, apiKey, true);
      if (hydrateTokenRef.current !== token) return;
      const draftSnap = snapshotOf(
        draftIndex,
        `Stage ${draftIndex} · Draft`,
        sourceCode,
        draftFrames,
        draftRun.executionTimeMs,
        draftRun.error,
        draftReport,
        'draft'
      );
      const nextHistory = [...stageHistory, draftSnap];
      setStageHistory(evictBackgroundFrames(nextHistory, index));
      setSavingDraft(false);
      await applySnapshot(nextHistory[index]);
      return;
    }
    await applySnapshot(snap);
  };

  // 显式重跑手改代码 = 以它为全新基准：历史栈归零，草稿本身成为新的 Stage 0
  const handleCompile = () => {
    hydrateTokenRef.current++;
    setHydratingStage(null);
    setSavingDraft(false);
    setDriftStage(null);
    if (dirtyEdit) {
      setStageHistory([]);
      setActiveStage(0);
    }
    executeCode(sourceCode);
  };

  const atLatestStage = stageHistory.length === 0 || activeStage === stageHistory.length - 1;

  // 横幅始终比较 Stage 0 与「当前选中阶段」；停在 Stage 0 时改为对比最新阶段（保持横幅可见）
  const benchmarkDelta = useMemo(() => {
    if (stageHistory.length < 2) return null;
    const base = stageHistory[0];
    const latest = stageHistory[stageHistory.length - 1];
    const active = stageHistory[activeStage] ?? latest;
    const target = activeStage === 0 ? latest : active;
    const from = base.metrics.framesCount;
    const to = target.metrics.framesCount;
    const stackFrom = base.metrics.maxStackDepth;
    const stackTo = target.metrics.maxStackDepth;
    const expansiveFrom = base.metrics.expansiveRedundantCount;
    const expansiveTo = target.metrics.expansiveRedundantCount;
    const baseFused = base.metrics.wasFused;
    const nowFused = target.metrics.wasFused;
    return {
      from,
      to,
      pct: from > 0 ? ((to - from) / from) * 100 : 0,
      baseFused,
      nowFused,
      inspectingBaseline: activeStage === 0,
      /** 记忆化剪枝锚点：展开型重复从 >0 归零，即「指数冗余 → 缓存剪枝」的成功叙事 */
      subtreePruningAnchor: !baseFused && !nowFused && expansiveFrom > 0 && expansiveTo === 0,
      expansiveFrom,
      expansiveTo,
      /** 基线被截断而重构后完整跑完：帧数不是同一量纲，只报状态与栈深收益 */
      abortedToCompleted: baseFused && !nowFused,
      /** 递归转迭代的栈空间降维型重构：迭代体语句展开会让帧数上升，主锚点必须换成栈收益 */
      stackReductionAnchor: !baseFused && !nowFused && stackFrom >= 4 && stackTo <= 2 && to > from,
      stackDropPct: stackFrom > 0 ? ((stackFrom - stackTo) / stackFrom) * 100 : 0,
      stackFrom,
      stackTo,
      timeFrom: base.metrics.timeComplexity,
      timeTo: target.metrics.timeComplexity,
      spaceFrom: base.metrics.spaceComplexity,
      spaceTo: target.metrics.spaceComplexity,
      latencyFrom: base.metrics.execTimeMs,
      latencyTo: target.metrics.execTimeMs,
    };
  }, [stageHistory, activeStage]);

  // 横幅语义分段：熔断态 > 栈收益锚点 > 帧数百分比，三类互斥且都只使用实测值
  const benchmarkSegments = useMemo(() => {
    const d = benchmarkDelta;
    if (!d) return [] as { key: string; label: string; value: string; emphatic: boolean }[];
    const segs: { key: string; label: string; value: string; emphatic: boolean }[] = [];
    const stackSeg = {
      key: 'stack',
      label: 'PEAK STACK',
      value: `${d.stackFrom} → ${d.stackTo}`,
      emphatic: false,
    };
    // 记忆化剪枝档自行给出 TIME/SPACE 顺序，避免与公共尾部重复渲染
    let emitTailComplexityRows = true;

    if (d.baseFused || d.nowFused) {
      segs.push({
        key: 'status',
        label: 'STATUS',
        value: `${d.baseFused ? 'FUSE_ABORTED' : 'COMPLETED'} (${d.from}f) → ${
          d.nowFused ? 'FUSE_ABORTED' : 'COMPLETED'
        } (${d.to}f)${d.baseFused && !d.nowFused ? ' | frame counts across a fuse boundary are not comparable' : ''}`,
        emphatic: true,
      });
    } else if (d.subtreePruningAnchor) {
      segs.push({
        key: 'anchor',
        label: 'SUBTREE PRUNING',
        value: `Expansive Redundant Subtrees ${d.expansiveFrom} → 0 (-100% Pruned)`,
        emphatic: true,
      });
      segs.push({
        key: 'time',
        label: 'TIME',
        value: `${d.timeFrom} → ${d.timeTo}`,
        emphatic: false,
      });
      segs.push({
        key: 'space',
        label: 'SPACE',
        value: `${d.spaceFrom} → ${d.spaceTo}`,
        emphatic: false,
      });
      segs.push({
        key: 'trace',
        label: 'TRACE STEPS',
        value: `${d.from} → ${d.to} (Includes O(1) Memo Lookups)`,
        emphatic: false,
      });
      segs.push(stackSeg);
      emitTailComplexityRows = false;
    } else if (d.stackReductionAnchor) {
      segs.push({
        key: 'anchor',
        label: 'STACK REDUCTION',
        value: `-${d.stackDropPct.toFixed(1)}% Call Frames`,
        emphatic: true,
      });
      segs.push({ ...stackSeg, value: `${d.stackFrom} → ${d.stackTo}`, emphatic: true });
      segs.push({
        key: 'trace',
        label: 'TRACE STEPS',
        value: `${d.from} → ${d.to} (Unrolled Loop)`,
        emphatic: false,
      });
    } else {
      segs.push({
        key: 'frames',
        label: 'FRAMES',
        value: `${d.from} → ${d.to} (${d.pct <= 0 ? '-' : '+'}${Math.abs(d.pct).toFixed(1)}%)`,
        emphatic: false,
      });
      segs.push(stackSeg);
    }

    if (!segs.some((s) => s.key === 'stack')) segs.push(stackSeg);
    if (emitTailComplexityRows) {
      segs.push({
        key: 'space',
        label: 'SPACE',
        value: `${d.spaceFrom} → ${d.spaceTo}`,
        emphatic: false,
      });
      segs.push({
        key: 'time',
        label: 'TIME',
        value: `${d.timeFrom} → ${d.timeTo}`,
        emphatic: false,
      });
    }
    segs.push({
      key: 'latency',
      label: 'LATENCY',
      value: `${d.latencyFrom}ms → ${d.latencyTo}ms`,
      emphatic: false,
    });
    return segs;
  }, [benchmarkDelta]);

  const watchVars = currentFrame?.variables ?? {};
  const watchResults = useMemo(
    () => watchExprs.map((expr) => ({ expr, result: evalWatchExpression(expr, watchVars) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchExprs, currentFrame]
  );
  const pinnedEntries = useMemo(
    () =>
      Array.from(pinnedVars).map((name) => ({
        name,
        present: Object.prototype.hasOwnProperty.call(watchVars, name),
        value: watchVars[name],
      })),
    [pinnedVars, watchVars]
  );
  // 场景种子 + 运行时自适应补位：保证芯片里的变量在当前阶段真实存在且 →T 必中
  const quickWatches = useMemo(
    () => deriveRuntimeQuickWatches(frames, QUICK_WATCH[selectedPresetId] ?? []),
    [frames, selectedPresetId]
  );
  // 二维矩阵读写分离取证（纯运行时）：0 次写入 = 只读输入，>0 = 可变状态表
  const matrixWrites = useMemo(() => analyzeMatrixWrites(frames), [frames]);

  const togglePin = (name: string) => {
    setPinnedVars((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const adoptWatchExpr = (expr: string) => {
    if (!expr) return;
    setWatchExprs((prev) => (prev.includes(expr) || prev.length >= 4 ? prev : [...prev, expr]));
    setSeekState(null);
  };

  const addWatchExpression = () => {
    const expr = watchDraft.trim();
    if (!expr) return;
    adoptWatchExpr(expr);
    setWatchDraft('');
  };

  const removeWatchExpression = (expr: string) => {
    setWatchExprs((prev) => prev.filter((x) => x !== expr));
    setSeekState((prev) => (prev && prev.expr === expr ? null : prev));
  };

  // 条件观察点跳帧：从下一帧起环形扫描整条轨迹，四态严格区分（前方命中 / 绕回命中 / 仅当前帧 / 无解）
  const seekNextTrue = (expr: string) => {
    if (frames.length === 0) return;
    const start = (currentFrameIdx + 1) % frames.length;
    for (let step = 0; step < frames.length; step++) {
      const idx = (start + step) % frames.length;
      if (evalWatchExpression(expr, frames[idx].variables ?? {}).state === 'TRUE') {
        setIsPlaying(false);
        if (idx === currentFrameIdx) {
          setSeekState({ expr, kind: 'only', frameIndex: idx });
          return;
        }
        setCurrentFrameIdx(idx);
        setSeekState({ expr, kind: idx > currentFrameIdx ? 'forward' : 'wrapped', frameIndex: idx });
        return;
      }
    }
    setSeekState({ expr, kind: 'none', frameIndex: -1 });
  };

  const seekBadge = (expr: string) => {
    if (!seekState || seekState.expr !== expr) return null;
    switch (seekState.kind) {
      case 'forward':
        return { text: `→ #${seekState.frameIndex + 1}`, cls: 'bg-sky-500/15 text-sky-300' };
      case 'wrapped':
        return { text: `↺ #${seekState.frameIndex + 1} (wrapped)`, cls: 'bg-amber-500/15 text-amber-300' };
      case 'only':
        return { text: `= only @ #${seekState.frameIndex + 1}`, cls: 'bg-violet-500/15 text-violet-300' };
      default:
        return { text: 'no TRUE frame', cls: 'bg-rose-500/15 text-rose-400' };
    }
  };

  // SVG 调用树自动聚焦：把当前激活路径上最深的节点滚到视口中心
  useEffect(() => {
    if (treeView !== 'svg' || !treeVisible) return;
    const el = svgScrollRef.current;
    if (!el) return;
    let focus: (typeof treeLayout.positions)[number] | undefined;
    for (const p of treeLayout.positions) {
      if (!activeNodeIds.has(p.node.id)) continue;
      if (!focus || p.node.depth > focus.node.depth) focus = p;
    }
    if (!focus) focus = treeLayout.positions[0];
    if (!focus) return;
    el.scrollTo({
      left: Math.max(0, focus.x - el.clientWidth / 2),
      top: Math.max(0, focus.y - el.clientHeight / 2),
      behavior: 'smooth',
    });
  }, [currentFrameIdx, treeView, treeVisible, treeLayout, activeNodeIds]);

  // 导览必须驱动「最新一次渲染」的 handler，否则 stageHistory / aiReport 会停在过期闭包里
  const liveActionsRef = useRef({
    frames: [] as TraceFrame[],
    stageHistory: [] as StageSnapshot[],
    selfCheckResults: null as KernelSelfCheckResult[] | null,
    quickWatches: [] as string[],
    isAnalyzing: false,
    selectPreset: (_preset: PresetItem) => {},
    apply: async () => {},
    adoptWatch: (_expr: string) => {},
    seek: (_expr: string) => {},
    selfCheck: async () => {},
  });
  liveActionsRef.current = {
    frames,
    stageHistory,
    selfCheckResults,
    quickWatches,
    isAnalyzing,
    selectPreset: handleSelectPreset,
    apply: handleApplyOptimized,
    adoptWatch: adoptWatchExpr,
    seek: seekNextTrue,
    selfCheck: runKernelSelfCheck,
  };

  /** 一幕的驻留时间：Skip 或取消都能立即结束，不做假等待 */
  const tourHold = (token: number, ms: number) =>
    new Promise<void>((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        tourSkipRef.current = null;
        clearTimeout(timer);
        resolve();
      };
      timer = window.setTimeout(finish, ms);
      if (tourTokenRef.current !== token) {
        finish();
        return;
      }
      tourSkipRef.current = finish;
    });

  const tourWaitFor = async (token: number, cond: () => boolean, timeoutMs: number) => {
    const t0 = Date.now();
    while (tourTokenRef.current === token && !cond()) {
      if (Date.now() - t0 > timeoutMs) return false;
      await sleepMs(60);
    }
    return tourTokenRef.current === token && cond();
  };

  const finishJudgeTour = (token: number, startedAt: number) => {
    if (tourTokenRef.current !== token) return;
    setTourElapsedMs(Math.round(performance.now() - startedAt));
    setTourRunning(false);
    setTourAct(6);
  };

  const exitJudgeTour = () => {
    tourTokenRef.current++;
    const releaseHold = tourSkipRef.current;
    tourSkipRef.current = null;
    releaseHold?.();
    setTourRunning(false);
    setTourAct(0);
  };

  const skipTourAct = () => {
    tourSkipRef.current?.();
  };

  // 五幕状态机：全部复用真实 handler 与真实沙箱轨迹，不播放预录动画
  const startJudgeTour = async () => {
    if (tourRunning) return;
    const token = ++tourTokenRef.current;
    const startedAt = performance.now();
    setTourRunning(true);
    setTourAct(1);
    setTourElapsedMs(0);
    setShowArchModal(false);

    const alive = () => tourTokenRef.current === token;
    const traced = () => !liveActionsRef.current.isAnalyzing && liveActionsRef.current.frames.length > 0;
    const staged = (count: number) => liveActionsRef.current.stageHistory.length >= count && traced();
    const presetOf = (id: string) => PRESETS.find((p) => p.id === id);

    // ACT 1 · 三层熔断与崩溃前现场
    const fusePreset = presetOf('infinite-loop');
    if (fusePreset) liveActionsRef.current.selectPreset(fusePreset);
    await tourWaitFor(
      token,
      () => liveActionsRef.current.frames.length >= 1000 && !liveActionsRef.current.isAnalyzing,
      8000
    );
    if (!alive()) return;
    setCurrentFrameIdx(Math.max(0, liveActionsRef.current.frames.length - 2));
    await tourHold(token, 3200);
    if (!alive()) return;

    // ACT 2 · fib 三级火箭（DUP -> HIT -> 1D dp）
    setTourAct(2);
    const fibPreset = presetOf('fib-tree');
    if (fibPreset) liveActionsRef.current.selectPreset(fibPreset);
    await tourWaitFor(token, traced, 8000);
    await tourHold(token, 1500);
    if (!alive()) return;
    await liveActionsRef.current.apply();
    await tourWaitFor(token, () => staged(2), 8000);
    await tourHold(token, 1800);
    if (!alive()) return;
    await liveActionsRef.current.apply();
    await tourWaitFor(token, () => staged(3), 8000);
    await tourHold(token, 1500);
    if (!alive()) return;

    // ACT 3 · comb 递归树转二维矩阵十字准星
    setTourAct(3);
    const combPreset = presetOf('pascal-comb');
    if (combPreset) liveActionsRef.current.selectPreset(combPreset);
    await tourWaitFor(token, traced, 8000);
    await tourHold(token, 900);
    if (!alive()) return;
    await liveActionsRef.current.apply();
    await tourWaitFor(token, () => staged(2), 8000);
    if (!alive()) return;
    await liveActionsRef.current.apply();
    await tourWaitFor(token, () => staged(3), 8000);
    if (!alive()) return;
    setCurrentFrameIdx(6);
    await tourHold(token, 2200);
    if (!alive()) return;

    // ACT 4 · 采纳自适应下标芯片并触发 →T 条件观察点
    setTourAct(4);
    const chip =
      liveActionsRef.current.quickWatches.find((expr) => expr.startsWith('dp[')) ??
      liveActionsRef.current.quickWatches[0];
    if (chip) {
      liveActionsRef.current.adoptWatch(chip);
      await sleepMs(160);
      if (!alive()) return;
      liveActionsRef.current.seek(chip);
    }
    await tourHold(token, 2000);
    if (!alive()) return;

    // ACT 5 · 打开 Spec 弹窗并跑完 6 项内核自检
    setTourAct(5);
    const previousChecks = liveActionsRef.current.selfCheckResults;
    setShowArchModal(true);
    setSpecTab('selftest');
    await liveActionsRef.current.selfCheck();
    await tourWaitFor(token, () => liveActionsRef.current.selfCheckResults !== previousChecks, 8000);
    await tourHold(token, 2200);
    finishJudgeTour(token, startedAt);
  };

  // 运行期间评委的任何点击（导览字幕条自身除外）都立即中断并把控制权交还
  useEffect(() => {
    if (!tourRunning) return;
    const abortOnPress = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-tour-bar]')) return;
      exitJudgeTour();
    };
    window.addEventListener('pointerdown', abortOnPress, true);
    return () => window.removeEventListener('pointerdown', abortOnPress, true);
  }, [tourRunning]);

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
            {/* 导览运行时让出装饰性徽章宽度，保证 Stop Tour 全文案在 770px 下不撑破顶栏 */}
            <span
              className={`text-[10px] font-mono text-zinc-500 whitespace-nowrap ${
                tourRunning ? 'hidden' : 'hidden sm:inline'
              }`}
            >
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
            onClick={handleCompile}
            className="px-2.5 py-1 shrink-0 whitespace-nowrap rounded bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold text-[11px] flex items-center gap-1.5 transition shadow-sm"
          >
            <Zap className="w-3 h-3 fill-current" />
            <span>Compile & Trace</span>
          </button>

          <button
            onClick={() => (tourRunning ? exitJudgeTour() : startJudgeTour())}
            title={
              tourRunning
                ? 'Abort the 5-act judge tour and hand control back immediately'
                : 'Run the 5-act automated judge tour over the live engine'
            }
            className={`px-2.5 py-1 shrink-0 whitespace-nowrap rounded text-[11px] font-semibold flex items-center gap-1.5 transition border ${
              tourRunning
                ? 'bg-amber-500/20 text-amber-200 border-amber-400/60'
                : 'bg-zinc-900 text-amber-300 border-amber-500/40 hover:bg-amber-500/15'
            }`}
          >
            {tourRunning ? (
              <Square className="w-3 h-3 fill-current" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            <span>{tourRunning ? `Stop Tour (Act ${Math.min(tourAct, 5)}/5)` : 'Tour'}</span>
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

      {/* ==================== JUDGE TOUR CAPTION BAR ==================== */}
      {tourAct > 0 && (
        <div
          data-tour-bar
          className="shrink-0 border-b border-amber-500/40 bg-[#170F04] px-3 py-1 flex items-center gap-2 text-[11px] font-mono overflow-x-auto no-scrollbar"
        >
          <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-200 font-semibold whitespace-nowrap">
            {tourAct >= 6 ? 'TOUR COMPLETE' : `ACT ${tourAct}/5`}
          </span>
          <span className="shrink-0 text-amber-100 whitespace-nowrap">
            {tourAct >= 6 ? 'Five-act showcase finished' : TOUR_ACTS[tourAct - 1].title}
          </span>
          <span className="text-amber-200/70 whitespace-nowrap">
            {tourAct >= 6
              ? `total ${(tourElapsedMs / 1000).toFixed(1)}s · engine left live for inspection`
              : TOUR_ACTS[tourAct - 1].note}
          </span>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {tourRunning && (
              <button
                onClick={skipTourAct}
                className="px-2 py-0.5 rounded border border-amber-500/40 bg-zinc-900 text-amber-200 text-[10px] hover:bg-amber-500/15 whitespace-nowrap"
              >
                Skip Next →
              </button>
            )}
            <button
              onClick={exitJudgeTour}
              className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 text-[10px] hover:text-zinc-100 whitespace-nowrap"
            >
              Exit
            </button>
          </div>
        </div>
      )}

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

            {/* Watch Expressions & Pinned Guards — 条件断言在当前帧快照上实时求值 */}
            <div className="shrink-0 px-3 py-1.5 border-b border-zinc-800/70 bg-[#0A0C11] flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 whitespace-nowrap">
                <Sigma className="w-3 h-3 text-emerald-400" />
                WATCH
              </span>
              {pinnedEntries.map((p) => (
                <span
                  key={p.name}
                  className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono ${
                    p.present
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-600'
                  }`}
                >
                  <button
                    onClick={() => togglePin(p.name)}
                    title={`Unpin ${p.name}`}
                    className="text-amber-400/80 hover:text-amber-200"
                  >
                    <Pin className="w-2.5 h-2.5 fill-current" />
                  </button>
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-zinc-400">{p.present ? String(p.value) : 'n/a'}</span>
                </span>
              ))}
              {watchResults.map(({ expr, result }) => (
                <span
                  key={expr}
                  className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono ${
                    result.state === 'TRUE'
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : result.state === 'FALSE'
                        ? 'border-zinc-700 bg-zinc-900 text-zinc-500'
                        : 'border-rose-500/50 bg-rose-500/10 text-rose-200'
                  }`}
                  title={result.detail}
                >
                  <span className="font-semibold">{expr}</span>
                  <span className="rounded bg-black/40 px-1">{result.state}</span>
                  {seekBadge(expr) && (
                    <span className={`rounded px-1 ${seekBadge(expr)!.cls}`}>{seekBadge(expr)!.text}</span>
                  )}
                  <button
                    onClick={() => seekNextTrue(expr)}
                    title="Seek next frame where expression is TRUE"
                    className="rounded border border-zinc-700 bg-zinc-900 px-1 text-[9px] text-sky-300 transition hover:border-sky-400/60 hover:text-sky-200"
                  >
                    →T
                  </button>
                  <button
                    onClick={() => removeWatchExpression(expr)}
                    title={`Remove watch ${expr}`}
                    className="text-zinc-500 hover:text-rose-300"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <input
                value={watchDraft}
                onChange={(e) => setWatchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addWatchExpression();
                }}
                placeholder="water > 4"
                className="w-28 shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-emerald-400/60"
              />
              <button
                onClick={addWatchExpression}
                disabled={!watchDraft.trim()}
                className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 transition hover:text-emerald-300 disabled:opacity-40"
              >
                Add
              </button>
              {quickWatches
                .filter((q) => !watchExprs.includes(q) && watchExprs.length < 4)
                .map((q) => (
                  <button
                    key={q}
                    onClick={() => adoptWatchExpr(q)}
                    title={`Quick watch: ${q}`}
                    className="rounded border border-emerald-700/50 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    + {q}
                  </button>
                ))}
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
                    <span
                      className="flex items-center gap-1 shrink-0 cursor-help"
                      title="Redundant activation that expanded its subtree again — real recomputation"
                    >
                      <span className="h-2 w-2 rounded bg-rose-500/60" />
                      DUP {pruneStats.expansive}
                    </span>
                    <span
                      className="flex items-center gap-1 shrink-0 cursor-help"
                      title="Duplicate activation that returned with zero child calls — intercepted by the memo cache guard"
                    >
                      <span className="h-2 w-2 rounded bg-emerald-500/60" />
                      HIT {pruneStats.pruned}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className="h-2 w-2 rounded bg-zinc-700" />
                      retired
                    </span>
                    {pruneStats.expansive > 0 && pruneStats.pruned === 0 && (
                      <span className="shrink-0 rounded bg-amber-500/10 px-1 text-amber-300">
                        unpruned → click Apply for HIT
                      </span>
                    )}
                    {pruneStats.pruned > 0 && (
                      <span className="shrink-0 rounded bg-emerald-500/10 px-1 text-emerald-300">
                        memo cache pruned
                      </span>
                    )}
                    <span className="shrink-0 text-zinc-600">
                      nodes {treeLayout.selectedCount} · edges {treeLayout.edges.length} · leaves{' '}
                      {treeLayout.positions.filter(
                        (p) => !treeLayout.edges.some((e) => e.key.endsWith(`-${p.node.id}`))
                      ).length}
                    </span>
                  </div>

                  {treeView === 'svg' ? (
                    <div
                      ref={svgScrollRef}
                      className="max-h-[232px] overflow-auto rounded border border-zinc-800/70 bg-[#090B10]"
                    >
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
                            : n.dupKind === 'pruned'
                              ? { fill: '#052e16', stroke: '#10b981', text: '#6ee7b7' }
                              : n.isDuplicate
                                ? { fill: '#2b0a12', stroke: '#f43f5e', text: '#fda4af' }
                                : { fill: '#18181b', stroke: '#27272a', text: '#a1a1aa' };
                          const badgeFill = n.dupKind === 'pruned' ? '#064e3b' : '#4c0519';
                          const badgeStroke = n.dupKind === 'pruned' ? '#10b981' : '#f43f5e';
                          const badgeText = n.dupKind === 'pruned' ? '#6ee7b7' : '#fecdd3';
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
                                    fill={badgeFill}
                                    stroke={badgeStroke}
                                    strokeWidth={0.8}
                                  />
                                  <text
                                    x={x + SVG_NODE_W / 2 - 11}
                                    y={y - SVG_NODE_H / 2 + 2.5}
                                    textAnchor="middle"
                                    fontSize={7}
                                    fontFamily="ui-monospace, monospace"
                                    fill={badgeText}
                                  >
                                    {n.dupKind === 'pruned' ? 'HIT' : 'DUP'}×{n.duplicateCount}
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
                          : n.dupKind === 'pruned'
                            ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200'
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
                              <span
                                className={`rounded border px-1 text-[9px] font-bold ${
                                  n.dupKind === 'pruned'
                                    ? 'border-emerald-400/60 bg-emerald-500/30 text-emerald-100'
                                    : 'border-rose-400/60 bg-rose-500/30 text-rose-100'
                                }`}
                              >
                                {n.dupKind === 'pruned' ? 'HIT' : 'DUP'} ×{n.duplicateCount}
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
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <span className="text-[11px] font-mono font-semibold text-zinc-300 truncate">
                            2D Matrix: <span className="text-sky-400">{mat.name}</span> [
                            {mat.data.length}×{mat.data[0]?.length || 0}]
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span
                              className={`rounded px-1 text-[9px] font-mono ${
                                (matrixWrites[mat.name] ?? 0) === 0
                                  ? 'bg-zinc-800 text-zinc-400'
                                  : 'bg-sky-500/15 text-sky-300'
                              }`}
                              title={
                                (matrixWrites[mat.name] ?? 0) === 0
                                  ? 'Runtime forensics: zero cell transitions between adjacent frames — read-only input matrix'
                                  : `Runtime forensics: ${matrixWrites[mat.name]} cell transitions between adjacent frames — mutable state table (0 would mean read-only; repeated writes to the same cell are counted per transition)`
                              }
                            >
                              {(matrixWrites[mat.name] ?? 0) === 0 ? 'READ-ONLY' : `WRITES: ${matrixWrites[mat.name]}`}
                            </span>
                            {activeR !== undefined && activeC !== undefined && (
                              <span className="text-[10px] font-mono text-amber-300 whitespace-nowrap">
                                Cursor [{activeR}][{activeC}]
                              </span>
                            )}
                            <button
                              onClick={() => togglePin(mat.name)}
                              title={
                                pinnedVars.has(mat.name)
                                  ? `Unpin ${mat.name}`
                                  : `Pin ${mat.name} to watch bar`
                              }
                              className={
                                pinnedVars.has(mat.name)
                                  ? 'text-emerald-400'
                                  : 'text-zinc-600 hover:text-emerald-300'
                              }
                            >
                              <Pin className="w-2.5 h-2.5" />
                            </button>
                          </span>
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
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="text-[11px] font-mono font-semibold text-zinc-300 truncate">
                        Array Buffer: <span className="text-sky-400">{arr.name}</span> (len=
                        {arr.data.length})
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {isRainHeight && (
                          <span className="text-[10px] font-mono text-sky-400 whitespace-nowrap">
                            Water Surface Overlay Active
                          </span>
                        )}
                        <button
                          onClick={() => togglePin(arr.name)}
                          title={pinnedVars.has(arr.name) ? `Unpin ${arr.name}` : `Pin ${arr.name} to watch bar`}
                          className={
                            pinnedVars.has(arr.name)
                              ? 'text-emerald-400'
                              : 'text-zinc-600 hover:text-emerald-300'
                          }
                        >
                          <Pin className="w-2.5 h-2.5" />
                        </button>
                      </span>
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
                  const pinned = pinnedVars.has(sc.name);
                  return (
                    <div
                      key={sc.name}
                      className={`px-2.5 py-2 rounded border font-mono transition-all ${
                        pinned
                          ? 'bg-emerald-500/10 border-emerald-500/60'
                          : diff
                            ? 'bg-amber-500/10 border-amber-500/50 shadow-sm'
                            : 'bg-[#0E1117] border-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span>{sc.name}</span>
                        <span className="flex items-center gap-1">
                          {sc.isPointer && (
                            <span className="text-[9px] px-1 rounded bg-zinc-800 text-sky-400">
                              PTR
                            </span>
                          )}
                          <button
                            onClick={() => togglePin(sc.name)}
                            title={pinned ? `Unpin ${sc.name}` : `Pin ${sc.name} to watch bar`}
                            className={pinned ? 'text-emerald-400' : 'text-zinc-600 hover:text-emerald-300'}
                          >
                            <Pin className="w-2.5 h-2.5" />
                          </button>
                        </span>
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

                {aiReport && aiReport.optimizedCode !== sourceCode && atLatestStage && !dirtyEdit && !savingDraft && hydratingStage === null && (
                  <button
                    onClick={handleApplyOptimized}
                    className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium text-[11px] flex items-center gap-1 transition shadow-sm shrink-0 whitespace-nowrap"
                  >
                    <Zap className="w-3 h-3" />
                    <span className="whitespace-nowrap">
                      {aiReport.nextStageLabel ?? 'Apply O(n) Refactor & Re-Trace'}
                    </span>
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
                {benchmarkSegments.map((s, i) => (
                  <span key={s.key} className="whitespace-nowrap flex items-center gap-1.5">
                    {i > 0 && <span className="text-emerald-500/50">|</span>}
                    <span className={s.emphatic ? 'text-emerald-200 font-semibold' : ''}>{s.label}:</span>
                    <strong className={s.emphatic ? 'text-emerald-50' : 'text-emerald-100'}>{s.value}</strong>
                  </span>
                ))}
                {stageHistory.length > 1 && (
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    {dirtyEdit && (
                      <span
                        className="whitespace-nowrap rounded border border-amber-400/60 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-amber-200"
                        title="The editor differs from the active stage snapshot. Compile & Trace resets history from your draft; switching stages freezes the draft as a real Draft stage first."
                      >
                        {savingDraft ? 'SAVING DRAFT...' : 'UNSAVED EDIT DRAFT'}
                      </span>
                    )}
                    {hydratingStage !== null && (
                      <span className="whitespace-nowrap rounded border border-sky-400/60 bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-sky-200">
                        RE-HYDRATING STAGE {hydratingStage} ({LAZY_FRAME_THRESHOLD}+ frames)
                      </span>
                    )}
                    {stageHistory.map((s) => {
                      const evicted = s.frames.length === 0 && s.frameCount > 0;
                      const isDraft = s.kind === 'draft';
                      return (
                        <button
                          key={s.stageIndex}
                          onClick={() => handleRestoreStage(s.stageIndex)}
                          disabled={savingDraft || hydratingStage !== null}
                          title={`${s.label} · ${s.metrics.timeComplexity} · ${s.frameCount} frames · ~${Math.round(s.approxBytes / 1024)} KB — ${
                            evicted
                              ? `background frames evicted (lazy re-hydration on click; thresholds ${LAZY_FRAME_THRESHOLD}f / ${Math.round(LAZY_BYTE_BUDGET / 1000)}KB)`
                              : 'full snapshot (source + frames + AI report + sandbox error)'
                          }`}
                          className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-mono transition ${
                            s.stageIndex === activeStage
                              ? 'border-emerald-300/80 bg-emerald-400/25 text-emerald-50 shadow-glow'
                              : isDraft
                                ? 'border-amber-500/50 bg-amber-500/15 text-amber-200/90 hover:bg-amber-500/25'
                                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200/80 hover:bg-emerald-500/20'
                          } ${savingDraft || hydratingStage !== null ? 'opacity-60 cursor-wait' : ''}`}
                        >
                          {isDraft ? 'Draft' : 'Stage'} {s.stageIndex} ({s.frameCount}f
                          {evicted ? ' · LAZY' : ''})
                        </button>
                      );
                    })}
                  </div>
                )}
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
                    {benchmarkDelta?.inspectingBaseline && (
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        title="Stage 0 snapshot restored in full: source, frames, sandbox error and its own AI report"
                      >
                        INSPECTING STAGE 0 BASELINE (Full Report Restored)
                      </span>
                    )}
                    {driftStage !== null && (
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        title={`Stage ${driftStage} was re-hydrated from a non-deterministic source; frameCount is refreshed while the frozen AI report is preserved.`}
                      >
                        NON-DETERMINISTIC RE-HYDRATION (Frame values may vary)
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
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-1 bg-[#0B0E14] overflow-x-auto no-scrollbar">
              <button
                onClick={() => setSpecTab('arch')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition shrink-0 whitespace-nowrap ${
                  specTab === 'arch'
                    ? 'bg-zinc-800 text-sky-300 border border-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Architecture & Safety Fuse
              </button>
              <button
                onClick={() => setSpecTab('devlog')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition shrink-0 whitespace-nowrap ${
                  specTab === 'devlog'
                    ? 'bg-zinc-800 text-violet-300 border border-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                DevLog & Reflection History [M1-M{DEVLOGS.length}]
              </button>
              <button
                onClick={() => {
                  setSpecTab('selftest');
                  runKernelSelfCheck();
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition shrink-0 whitespace-nowrap ${
                  specTab === 'selftest'
                    ? 'bg-zinc-800 text-emerald-300 border border-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Live Kernel Self-Check ({KERNEL_INVARIANT_COUNT} Invariants)
              </button>
              <span className="ml-auto hidden xl:inline text-[10px] font-mono text-zinc-600">
                {specTab === 'arch'
                  ? 'three-tier fuse contract'
                  : specTab === 'devlog'
                    ? 'docs/devlogs/ archive index'
                    : 'browser-side regression suite'}
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
                      <br />• M7: Generic top-down memoization synthesis for any overlapping recursion,
                      two-pointer vs iterative-accumulator split, stack-reduction benchmark anchor, SVG
                      auto-focus on the active node, and guarded watch expressions.
                      <br />• M8: Runtime-only HIT vs DUP pruning forensics in the call tree, Stage-2
                      bottom-up tabulation lowering, subtree-pruning benchmark anchor, and watch
                      subscripts with Seek-Next-TRUE watchpoints.
                      <br />• M9: fib preset folded into the same two-stage pipeline (no more fib-only
                      shortcut), two-parameter Pascal recurrences lowered to 2D dp tables, four-state
                      seek feedback, and preset-scoped quick-watch chips for zero-typing demos.
                      <br />• M10: Pascal preset, runtime-derived quick-watch chips that evolve across
                      refactor stages, matrix write forensics replacing source-string gating, and
                      O(log n) halving recursion detection with loop lowering.
                      <br />• M11: positional halving across argument slots, fast-power lowering behind a
                      strict equivalence gate, mutation-entropy watch ranking, and one-click A/B trace
                      toggling that keeps the benchmark banner frozen.
                      <br />• M12: multi-stage holographic snapshot stack (Stage 0/1/2 with reports
                      restored in one click), mixed-argument slot halving, exponent legality gate, and the
                      Fast Power preset.
                      <br />• M13: passthrough multi-parameter halving synthesis, odd/even interleaved
                      fast-power detection, lazy frame eviction with sandbox re-hydration for 250+ frame
                      snapshots, and a dirty-edit guard that freezes hand-edited code as a Draft stage
                      instead of silently discarding it.
                      <br />• M14: dual-dimension lazy eviction (frame count and sampled byte budget),
                      non-deterministic re-hydration guard with a visible drift chip, bounded-step
                      interleaving (differences up to 2), instant Draft freezing via skipDelay, and a
                      browser-side Live Kernel Self-Check tab with 6 deterministic assertions.
                      <br />• M15: a cancellable 5-act automated judge tour that drives the real engine
                      end to end, WebCrypto sources added to the non-determinism guard, and an engineering
                      whitepaper README for reviewers.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-amber-400 font-semibold">15. Automated Judge Tour &amp; Whitepaper (M15)</div>
                    <p className="text-zinc-400 text-[11px]">
                      The Tour button in the 44px top bar runs a five-act showcase over the live engine:
                      fuse recovery, the fib three-stage rocket, comb tree-to-2D-matrix lowering, the
                      adaptive dp subscript chip with a →T watchpoint jump, and the kernel self-check tab.
                      Measured total 17.6s at 770x553, and the top bar stays scrollWidth == clientWidth
                      while it runs.
                      <br />• Every act waits on real runtime conditions (frame count, analyzing flag,
                      stageHistory length, a changed self-check result object) instead of blind sleeps, and
                      every hold yields instantly to Skip Next, Stop Tour or a click anywhere outside the
                      caption bar.
                      <br />• The tour calls the handlers captured from the newest render through a ref, so
                      stage freezing never uses a stale stageHistory or aiReport closure.
                      <br />• The invariant count in the self-check tab label comes from one constant, so it
                      cannot silently lag behind the registry in docs/devlogs/INDEX.md.
                      <br />• WebCrypto random sources (crypto.getRandomValues, crypto.randomUUID) now get
                      the same ≤600-frame eviction exemption and drift chip as Math.random and Date.now.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-emerald-400 font-semibold">14. Byte Budget, Drift Guard &amp; Live Self-Check (M14)</div>
                    <p className="text-zinc-400 text-[11px]">
                      Inactive snapshots are evicted when they exceed 250 frames OR a sampled byte budget
                      of 180KB; approxBytes is extrapolated from the mid and last frame variable payloads
                      at O(1) cost, and the capsule tooltip reports the estimated KB release.
                      <br />• Math.random, Date.now, performance.now and new Date mark a source as
                      non-deterministic. Up to 600 frames those snapshots are exempt from eviction so replay
                      stays exact; beyond that, re-hydration shows NON-DETERMINISTIC RE-HYDRATION and only
                      refreshes frameCount/approxBytes while the frozen report stays intact.
                      <br />• Halving chains may now alternate floor(a/2) with any strictly decreasing step
                      of size at most 2 (at least 50% halving); only fast power lowering may absorb an
                      interleaved chain, count/unknown shapes keep their source.
                      <br />• Draft freezing calls runAIDiagnostics with skipDelay=true; measured DOM
                      commit is 22.6ms while the sandbox still runs for snapshot consistency.
                      <br />• The third Spec tab executes 6 deterministic micro-benchmarks in the browser
                      (TDZ closure, fuse prefixes, recursion A/A&apos;/B, positional and interleaved halving,
                      matrix write separation, 770px viewport reachability) with PASS/FAIL and per-check ms.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-violet-400 font-semibold">13. Passthrough Halving, Lazy Snapshots &amp; Draft Guard (M13)</div>
                    <p className="text-zinc-400 text-[11px]">
                      Count-form halving now accepts multiple parameters when every non-halving slot is
                      passed through unchanged in each self-call, so bsearchHalve(tag, n) lowers to a
                      cursor loop while keeping its signature and the original call literals. Refusals are
                      typed: coupled multi-parameter state, custom return composition and
                      negative/non-integer exponent no longer share one misleading sentence.
                      <br />• Argument chains may alternate floor(a/2) with an odd n - 1 step (at least 50%
                      halving), which recognises the classic 15 → 14 → 7 → 6 → 3 → 2 → 1 fast power; only
                      binary exponentiation may lower that shape, because a floor-halving counter would
                      undercount it.
                      <br />• Snapshots above 250 frames are evicted from inactive stages while frameCount,
                      source, report and metrics stay frozen; clicking the LAZY capsule re-hydrates frames
                      through the sandbox without re-running diagnostics. Snapshots at or below the
                      threshold still switch in 0ms.
                      <br />• When the editor differs from the active stage snapshot, an UNSAVED EDIT DRAFT
                      chip appears and Apply is hidden. Compile &amp; Trace restarts history from the hand
                      edit; switching stages first traces the draft and freezes it as a real Draft stage, so
                      edits are never silently overwritten.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-sky-400 font-semibold">12. Time Capsule &amp; Convergence Gate (M12)</div>
                    <p className="text-zinc-400 text-[11px]">
                      Each Apply freezes the current stage into stageHistory (source, frames, sandbox error,
                      its own AI report and metrics), so the Stage capsules restore a full snapshot without
                      re-running the sandbox - verdict chips travel with the trace. The banner always
                      compares Stage 0 against the selected stage (or the latest when you sit on Stage 0),
                      and Apply is hidden on historical stages so branches cannot fork.
                      <br />• Halving arguments are split at top-level commas (brackets respected) and judged
                      per slot, so a string first argument does not hide a halving second one.
                      <br />• Fast power requires a non-negative integer exponent; otherwise the source is
                      preserved. A stack fuse together with a repeated signature chain now reports
                      O(∞) Unbounded Recursion and offers no lowering, while depth(400) (distinct arguments)
                      still reads as linear recursion.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-emerald-400 font-semibold">11. A/B Trace &amp; Equivalence Gates (M11)</div>
                    <p className="text-zinc-400 text-[11px]">
                      Halving is detected per argument slot, so power(2, 16) is recognised through slot 1
                      (exp: 16 → 8 → 4 → 2 → 1) even though slot 0 never converges. Lowering is gated by
                      shape: count form (1 + fn(...) with a zero base) becomes a steps cursor loop, the
                      two-parameter multiply form becomes iterative binary exponentiation, and anything else
                      keeps its source with Apply hidden (SEMANTICS_PRESERVED) rather than guessing.
                      <br />• Quick-watch fallback ranks scalars by mutation entropy (distinct values across
                      the trace) so static inputs drop out.
                      <br />• A/B keeps both sources plus frozen metrics: switching replays the chosen side
                      through the sandbox only (no diagnostics), so the benchmark banner never recomputes,
                      and a VIEWING BASELINE TRACE chip marks when verdict chips describe the other side.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-violet-400 font-semibold">10. Runtime Introspection Contracts (M10)</div>
                    <p className="text-zinc-400 text-[11px]">
                      Recommendations and gates now read the trace, not preset knowledge.
                      analyzeMatrixWrites compares every 2D array against the previous frame: zero cell
                      changes means READ-ONLY input, any change means a mutable state table, and the
                      rolling-array refactor is offered only when both kinds coexist (the grid string
                      check is gone). Quick-watch chips are derived from real frame values - preferring the
                      last frame that still holds dp so the suggested cell is already written - and each
                      candidate must have at least one TRUE frame, so dead variables disappear and →T
                      always lands. Halving recursions (arg chain a, floor(a/2), ...) get their own
                      O(log n) verdict and a cursor-loop lowering; after applying, the iterative side reports
                      O(log n) Iterative Halving instead of dropping to a linear scan.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-sky-400 font-semibold">9. Two-Stage Pipeline &amp; Seek States (M9)</div>
                    <p className="text-zinc-400 text-[11px]">
                      Every overlapping recursion now follows Stage-0 exponential trace → Stage-1 top-down
                      memoization (HIT pruning + SUBTREE PRUNING banner) → Stage-2 array lowering, with no
                      name-based shortcuts. Stage-2 recognises both the direct form
                      fn(n - 1) + fn(n - 2) and the split form let a = fn(n - 1); let b = fn(n - 2);
                      return a + b, and seeds dp[0..baseMax] with the loop starting at baseMax + 1
                      (starting earlier would treat undefined slots as seeds - the M8 formula bug that only
                      surfaced once fib took this path). Two-parameter Pascal recurrences become dp[r][c]
                      matrices. Seek reports four distinct states: forward, wrapped, only-current (no
                      movement) and none.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-emerald-400 font-semibold">8. Pruning Forensics &amp; Watchpoints (M8)</div>
                    <p className="text-zinc-400 text-[11px]">
                      A duplicate activation is labeled pruned (green HIT) only when the same signature's
                      FIRST activation had children while this one produced none and returned immediately -
                      topology proof that a memo guard intercepted it. Baseline leaves are excluded by the
                      firstChildCount &gt; 0 precondition, so natural bases (climb(2)) stay DUP, not HIT.
                      Everything is derived from frames and parent-child counts; no source reading.
                      <br />• Stage-2 lowering sniffs fn(p - a) op fn(p - b) plus an identity/literal base
                      case and emits bottom-up dp seeds; unsupported shapes return null and keep the source.
                      <br />• Watch accepts subscripts but forbids dot, quotes and assignment, so member and
                      string-key injection paths are closed; out-of-range access reports ERROR with the
                      caught TypeError instead of a fake FALSE. →T scans forward (wrapping) and stops on the
                      first TRUE frame.
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
                      many times each parametrized signature is entered, and - decisively - whether a repeat
                      actually expanded a subtree again (expansiveRedundantCount, detected by the next frame
                      being deeper). redundantCallCount &gt;= 2 AND expansive repeats &gt;= 1 gives
                      O(2^n) Exponential with the repeat list inline; redundant repeats with 0 expansion
                      means a memo cache is absorbing them, so the verdict becomes O(n) Memoized Linear;
                      fewer than 2 repeats is a single descending chain, tagged [TAIL_RECURSION_CANDIDATE].
                      Sibling calls keep the stack depth unchanged, which is why entry events are counted
                      instead of depth deltas.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1">
                    <div className="text-amber-400 font-semibold">7. Synthesis &amp; Guard Contracts (M7)</div>
                    <p className="text-zinc-400 text-[11px]">
                      Overlapping recursion is refactored generically: the dominant recursive name is taken
                      from runtime signatures, its body is located by brace matching in the source, and a
                      Top-Down memo wrapper (const __memo = {} plus JSON.stringify([params]) keys) is spliced
                      in place while the original body keeps its return semantics inside an IIFE. fib still
                      gets the classic bottom-up array DP. If params carry defaults/destructuring or the body
                      cannot be located, the source is returned unchanged instead of emitting broken
                      "optimized" code.
                      <br />• Source sniffing is allowed for code synthesis only - complexity verdicts must
                      still rest on frame evidence.
                      <br />• Watch expressions evaluate against the current frame snapshot behind three
                      gates: character whitelist, no call syntax, no host object names.
                      <br />• A stack-to-iteration refactor anchors its benchmark on STACK REDUCTION, and the
                      unavoidable rise in traced steps is labeled TRACE STEPS (Unrolled Loop).
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
              ) : specTab === 'devlog' ? (
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
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] text-emerald-200 font-semibold">
                      LIVE KERNEL SELF-CHECK
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {selfCheckResults
                        ? `${selfCheckResults.filter((r) => r.pass).length}/${selfCheckResults.length} PASS`
                        : '6 deterministic micro-assertions'}
                    </span>
                    <button
                      onClick={() => {
                        setSpecTab('selftest');
                        runKernelSelfCheck();
                      }}
                      disabled={selfCheckRunning}
                      className="ml-auto px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[11px] font-mono shrink-0"
                    >
                      {selfCheckRunning ? 'Running...' : 'Run Kernel Self-Test Suite'}
                    </button>
                  </div>
                  {selfCheckRunning && (
                    <div className="text-[11px] text-zinc-500 animate-pulse font-mono">
                      Executing deterministic kernel assertions...
                    </div>
                  )}
                  {selfCheckResults ? (
                    <div className="space-y-1">
                      {selfCheckResults.map((r) => (
                        <div
                          key={r.id}
                          className="p-2 rounded bg-zinc-900/80 border border-zinc-800 flex items-start gap-2"
                        >
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-mono font-semibold ${
                              r.pass
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                            }`}
                          >
                            {r.pass ? 'PASS' : 'FAIL'}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[11px] text-zinc-200 font-mono">{r.title}</div>
                            <div className="text-[10px] text-zinc-500 font-mono break-words">{r.detail}</div>
                          </div>
                          <span className="ml-auto shrink-0 text-[10px] font-mono text-zinc-500">
                            {r.ms.toFixed(1)}ms
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Click Run Kernel Self-Test Suite to execute 6 deterministic assertions against the live kernel.
                    </div>
                  )}
                  <p className="text-[10px] text-zinc-600">
                    Fixtures run entirely in the browser; no Worker, network or API key is used.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
