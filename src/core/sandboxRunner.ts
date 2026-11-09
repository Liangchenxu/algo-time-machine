import { instrumentCode, TraceFrame } from './instrumenter';

export interface SandboxResult {
  success: boolean;
  frames: TraceFrame[];
  error?: string;
  executionTimeMs: number;
  /** 被更新的一跑取消：Worker 已 terminate，结果不得回写也不得冻结阶段 */
  cancelled?: boolean;
}

/**
 * 跑一次沙箱。onCancel 会把「终止这一跑」的能力交回调用方：
 * 1334 帧这类重轨迹一旦 postMessage，主线程必须付结构化克隆的钱——
 * 只有提前 terminate 才能真正省掉这笔开销（M19 隔离 ACT 1 跳幕残余耗时用的就是它）。
 */
export function runInSandbox(sourceCode: string, onCancel?: (cancel: () => void) => void): Promise<SandboxResult> {
  const startTime = performance.now();
  let instrumented = '';
  try {
    instrumented = instrumentCode(sourceCode);
  } catch (err: any) {
    return Promise.resolve({
      success: false,
      frames: [],
      error: `语法解析错误 (AST Parse Error): ${err.message}`,
      executionTimeMs: Math.round(performance.now() - startTime),
    });
  }

  return new Promise((resolve) => {
    const workerCode = `
      self.onmessage = function(e) {
        const start = performance.now();
        try {
          const runner = new Function(e.data.code);
          const frames = runner();
          self.postMessage({
            success: true,
            frames,
            executionTimeMs: Math.round(performance.now() - start)
          });
        } catch (err) {
          self.postMessage({
            success: false,
            frames: (self.__mtmFrames || []),
            error: err.message || String(err),
            executionTimeMs: Math.round(performance.now() - start)
          });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    const timer = setTimeout(() => {
      finish({
        success: false,
        frames: [],
        error: '[FUSE_WATCHDOG_TIMEOUT] 沙箱硬件级熔断：代码执行超过 3000ms 强制终止！',
        executionTimeMs: 3000,
      });
    }, 3000);

    let settled = false;
    const finish = (result: SandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve(result);
    };

    /**
     * 提前终止：被取消的一跑永远不会 postMessage，
     * 主线程因此不用为 1334 帧这类重轨迹付结构化克隆的钱（M19 隔离 ACT 1 跳幕残余用的就是它）。
     */
    const cancel = () => {
      finish({
        success: false,
        frames: [],
        error: undefined,
        executionTimeMs: Math.round(performance.now() - startTime),
        cancelled: true,
      });
    };
    onCancel?.(cancel);

    worker.onmessage = (e) => finish(e.data);

    worker.onerror = (e) =>
      finish({
        success: false,
        frames: [],
        error: `沙箱运行时异常: ${e.message || 'unknown worker error'}`,
        executionTimeMs: Math.round(performance.now() - startTime),
      });

    worker.postMessage({ code: instrumented });
  });
}
