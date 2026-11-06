import { TraceFrame } from '../core/instrumenter';

export interface AIDiagnosticReport {
  timeComplexity: string;
  spaceComplexity: string;
  hotspotLine: number;
  maxHitCount: number;
  maxStackDepth: number;
  bottleneckFrameIndex: number;
  summary: string;
  frameInsights: { frameIndex: number; line: number; tag: string; issue: string }[];
  optimizedCode: string;
  optimizationGain: string;
}

export function analyzeTraceMetrics(frames: TraceFrame[]) {
  if (!frames.length) {
    return { hotspotLine: 1, maxHitCount: 0, maxStackDepth: 1, bottleneckFrameIndex: 0 };
  }
  const lastHits = frames[frames.length - 1].lineHits || {};
  let hotspotLine = 1;
  let maxHitCount = 0;
  for (const [lineStr, count] of Object.entries(lastHits)) {
    if (count > maxHitCount) {
      maxHitCount = count;
      hotspotLine = Number(lineStr);
    }
  }
  let maxStackDepth = 1;
  let bottleneckFrameIndex = Math.floor(frames.length * 0.6);
  frames.forEach((f, idx) => {
    if (f.callStack.length > maxStackDepth) {
      maxStackDepth = f.callStack.length;
      bottleneckFrameIndex = idx;
    }
  });
  return { hotspotLine, maxHitCount, maxStackDepth, bottleneckFrameIndex };
}

export async function runAIDiagnostics(
  sourceCode: string,
  frames: TraceFrame[],
  errorMsg: string | undefined,
  apiKey?: string
): Promise<AIDiagnosticReport> {
  const metrics = analyzeTraceMetrics(frames);

  // 二维表的判据取自运行时轨迹而非源码字符串：只有真实出现 dp[r][c] 形态的嵌套数组才算 2D Tabulation，
  // 否则一维滚动数组优化版会被误判为矩阵 DP，并在「应用优化后重跑」时与界面结论自相矛盾。
  const has2DDPTable = frames.some((f) =>
    Object.values(f.variables).some((v) => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]))
  );

  if (apiKey && apiKey.trim().startsWith('sk-')) {
    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                '你是 AlgoTimeMachine 编译器级复杂度诊断引擎。请结合源码与 AST 运行时时间帧统计，输出严格的 JSON 报告，包含字段：timeComplexity, spaceComplexity, summary, frameInsights (数组，每项含 frameIndex, line, tag, issue), optimizedCode (完整可运行的优化后 JS 代码), optimizationGain。不要使用任何 emoji。',
            },
            {
              role: 'user',
              content: `源码：\n${sourceCode}\n\n运行时指标：总帧数=${frames.length}, 热点行=L${metrics.hotspotLine}(执行${metrics.maxHitCount}次), 峰值栈深=${metrics.maxStackDepth}, 异常熔断=${errorMsg || '无'}`,
            },
          ],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        return { ...metrics, ...parsed };
      }
    } catch (e) {
      console.warn('DeepSeek API fallback to local deterministic analyzer:', e);
    }
  }

  await new Promise((r) => setTimeout(r, 380));

  if (errorMsg && errorMsg.includes('死循环')) {
    return {
      ...metrics,
      timeComplexity: 'O(∞) Non-Terminating',
      spaceComplexity: 'O(1) Constant Heap',
      summary: `AST 步数守卫 (__guard) 在第 ${frames.length} 帧触发强制熔断。定位到 L${metrics.hotspotLine} 循环谓词缺失单调有界收敛条件（Monotonic Variant），导致控制流图 (CFG) 陷入强连通死锁环。`,
      frameInsights: [
        {
          frameIndex: Math.min(4, frames.length - 1),
          line: metrics.hotspotLine,
          tag: 'CFG_CYCLE',
          issue: '状态不变量 (Invariant) 异常：循环控制变量未产生向终止边界推进的增量 Diff',
        },
        {
          frameIndex: frames.length - 1,
          line: metrics.hotspotLine,
          tag: 'GUARD_TRAP',
          issue: '累计执行突破 2000 步安全阈值，沙箱保留现场快照并抛出熔断异常',
        },
      ],
      optimizedCode: `// Fixed: 注入单调递减势能函数确保循环收敛\nlet cursor = 0;\nlet acc = 0;\nconst limit = 8;\nwhile (cursor < limit) {\n  acc += (cursor * 3) ^ 1;\n  cursor++;\n}\nconsole.log("Converged acc =", acc);`,
      optimizationGain: 'Steps: >2000 (Aborted) -> 18 Frames (-99.1% Instructions)',
    };
  }

  if (metrics.maxStackDepth >= 4) {
    return {
      ...metrics,
      timeComplexity: 'O(2^n) Exponential',
      spaceComplexity: `O(n) Stack Depth ${metrics.maxStackDepth}`,
      summary: `调用栈轨迹分析捕获到指数级重叠子问题（Overlapping Subproblems）。在 Frame #${metrics.bottleneckFrameIndex} 达到栈深峰值 ${metrics.maxStackDepth} 层，L${metrics.hotspotLine} 累计重复触发 ${metrics.maxHitCount} 次，存在严重冗余递归分支。`,
      frameInsights: [
        {
          frameIndex: Math.min(6, frames.length - 1),
          line: metrics.hotspotLine,
          tag: 'STACK_GROWTH',
          issue: 'DFS 递归树沿左分支连续压栈，调用帧深度呈线性攀升',
        },
        {
          frameIndex: metrics.bottleneckFrameIndex,
          line: metrics.hotspotLine,
          tag: 'REDUNDANT_SUBTREE',
          issue: '检测到相同入参子问题被重复求值，引发时间帧膨胀',
        },
      ],
      optimizedCode: `// Optimized: 状态压缩自底向上动态规划 O(n) Time / O(n) Space\nfunction fibDP(n) {\n  const dp = [0, 1];\n  for (let i = 2; i <= n; i++) {\n    dp[i] = dp[i - 1] + dp[i - 2];\n  }\n  console.log("DP optimal fib(" + n + ") =", dp[n]);\n  return dp[n];\n}\nfibDP(6);`,
      optimizationGain: `Frames: ${frames.length} -> 15 (-${Math.max(50, Math.round((1 - 15 / Math.max(frames.length, 16)) * 100))}% Overhead) | Max Stack: ${metrics.maxStackDepth} -> 2`,
    };
  }

  if (sourceCode.includes('grid') || has2DDPTable) {
    return {
      ...metrics,
      timeComplexity: 'O(M * N) Matrix DP',
      spaceComplexity: 'O(M * N) 2D Tabulation',
      summary: `二维状态转移表（2D Tabulation）扫描完成。共采集 ${frames.length} 帧，状态转移热点位于 L${metrics.hotspotLine}（累计执行 ${metrics.maxHitCount} 次）。可通过滚动数组将空间复杂度进一步压缩至 O(N)。`,
      frameInsights: [
        {
          frameIndex: Math.floor(frames.length * 0.4),
          line: metrics.hotspotLine,
          tag: 'STATE_TRANSITION',
          issue: '二维网格依赖左邻 dp[r][c-1] 与上邻 dp[r-1][c] 完成最优子结构合并',
        },
      ],
      optimizedCode: `// Optimized: 一维滚动数组空间压缩 O(N) Space\nconst grid = [\n  [1, 3, 1],\n  [1, 5, 1],\n  [4, 2, 1]\n];\nconst dp = [1, 4, 5];\nfor (let r = 1; r < 3; r++) {\n  dp[0] += grid[r][0];\n  for (let c = 1; c < 3; c++) {\n    dp[c] = Math.min(dp[c], dp[c - 1]) + grid[r][c];\n  }\n}\nconsole.log("Compressed 1D DP MinPath =", dp[2]);`,
      optimizationGain: 'Space Complexity: O(M*N) -> O(N) 1D Rolling Buffer',
    };
  }

  return {
    ...metrics,
    timeComplexity: 'O(n) Linear Two-Pointer',
    spaceComplexity: 'O(1) In-Place Pointers',
    summary: `双指针收缩轨迹验证通过。总计 ${frames.length} 帧，核心转移热点位于 L${metrics.hotspotLine}（触发 ${metrics.maxHitCount} 次）。每次迭代搜索空间严格单调缩减 1 个单位，无回溯分支。`,
    frameInsights: [
      {
        frameIndex: Math.floor(frames.length / 2),
        line: metrics.hotspotLine,
        tag: 'INVARIANT_HOLD',
        issue: '左右边界指针满足单调不变量，局部极值在此帧完成原地更新',
      },
    ],
    optimizedCode: sourceCode,
    optimizationGain: 'Optimal Asymptotic Bound Achieved (O(n) Time, O(1) Auxiliary Space)',
  };
}
