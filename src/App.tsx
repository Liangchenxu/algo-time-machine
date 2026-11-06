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
    commit: 'HEAD',
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

  // Keyboard shortcuts: Space to toggle play, Left/Right arrows to step frames
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [frames.length]);

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
    return {
      from,
      to,
      pct,
      stackFrom: baselineMetrics.maxStackDepth,
      stackTo: traceMetrics.maxStackDepth,
      timeFrom: baselineMetrics.timeComplexity,
      spaceFrom: baselineMetrics.spaceComplexity,
      latencyFrom: baselineMetrics.execTimeMs,
      latencyTo: execTimeMs,
    };
  }, [baselineMetrics, aiReport, frames.length, traceMetrics.maxStackDepth, execTimeMs]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#090A0F] text-zinc-200 flex flex-col font-sans select-none">
      {/* ==================== TOP INDUSTRIAL WORKBENCH BAR (44px) ==================== */}
      <header className="h-11 shrink-0 border-b border-zinc-800/80 bg-[#0C0E14] px-3 flex items-center justify-between gap-3">
        {/* Left Brand & Architecture Badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-sky-500/10 border border-sky-500/40 flex items-center justify-center text-sky-400">
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight text-xs text-zinc-100">
              ALGO<span className="text-sky-400">TIME</span>MACHINE
            </span>
            <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
              AST-IR v2.4 · WORKER SANDBOX
            </span>
          </div>
        </div>

        {/* Center Segmented Preset Selector */}
        <div className="flex items-center bg-zinc-900/90 p-0.5 rounded-md border border-zinc-800/90 overflow-x-auto max-w-[54vw]">
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
        <div className="flex items-center gap-2">
          <div className="hidden xl:flex items-center gap-3 px-2.5 py-1 rounded bg-zinc-900/70 border border-zinc-800/80 text-[11px] font-mono">
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
            className="px-2.5 py-1 rounded bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold text-[11px] flex items-center gap-1.5 transition shadow-sm"
          >
            <Zap className="w-3 h-3 fill-current" />
            <span>Compile & Trace</span>
          </button>

          <button
            onClick={() => setShowArchModal(true)}
            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/80 text-[11px] flex items-center gap-1.5 transition"
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
          <div className="flex-1 min-h-0 overflow-y-auto font-mono text-xs relative">
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
              <div className="py-2">
                {codeLines.map((lineText, idx) => {
                  const lineNum = idx + 1;
                  const isCurrentLine = currentFrame?.line === lineNum;
                  const hitCount = currentFrame?.lineHits?.[lineNum] || 0;
                  const heatRatio = hitCount > 0 ? hitCount / maxLineHitInFrame : 0;

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
                        !isCurrentLine && hitCount > 0
                          ? {
                              backgroundColor: `rgba(244, 63, 94, ${Math.min(
                                0.16,
                                heatRatio * 0.16
                              )})`,
                            }
                          : undefined
                      }
                    >
                      {/* Line Number */}
                      <span
                        className={`w-7 shrink-0 text-right pr-2 text-[11px] select-none ${
                          isCurrentLine ? 'text-sky-400 font-bold' : 'text-zinc-600'
                        }`}
                      >
                        {lineNum}
                      </span>

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

                      {/* Code Text */}
                      <span
                        className={`whitespace-pre overflow-x-auto ${
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
            <div className="h-9 px-3 border-b border-zinc-800/80 bg-[#0E1118] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-medium text-zinc-200">
                  AI Complexity Profiler & Frame Diagnostics
                </span>
                {aiReport && (
                  <div className="flex items-center gap-1.5 ml-2 font-mono text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      Time: {aiReport.timeComplexity}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                      Space: {aiReport.spaceComplexity}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      Hotspot: L{aiReport.hotspotLine} ({aiReport.maxHitCount}x)
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
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
                    <span>{apiKey ? 'DeepSeek Key Active' : 'Engine: Deterministic + API'}</span>
                  </button>
                )}

                {aiReport && aiReport.optimizedCode !== sourceCode && (
                  <button
                    onClick={handleApplyOptimized}
                    className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium text-[11px] flex items-center gap-1 transition shadow-sm"
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
                  FRAMES: <strong className="text-emerald-100">{benchmarkDelta.from}</strong> →{' '}
                  <strong className="text-emerald-100">{benchmarkDelta.to}</strong>{' '}
                  ({benchmarkDelta.pct <= 0 ? '-' : '+'}
                  {Math.abs(benchmarkDelta.pct).toFixed(1)}%) | PEAK STACK:{' '}
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
                  className={`flex-1 min-w-[2px] transition-colors ${
                    isCurr
                      ? 'bg-amber-400'
                      : isHotspot && isPast
                        ? 'bg-rose-500/80'
                        : isPast
                          ? 'bg-sky-500/70'
                          : 'bg-zinc-700/50 hover:bg-zinc-600'
                  }`}
                />
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
                      the same block sit in the temporal dead zone.
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
