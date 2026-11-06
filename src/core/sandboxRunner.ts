import { instrumentCode, TraceFrame } from './instrumenter';

export interface SandboxResult {
  success: boolean;
  frames: TraceFrame[];
  error?: string;
  executionTimeMs: number;
}

export async function runInSandbox(sourceCode: string): Promise<SandboxResult> {
  const startTime = performance.now();
  let instrumented = '';
  try {
    instrumented = instrumentCode(sourceCode);
  } catch (err: any) {
    return {
      success: false,
      frames: [],
      error: `语法解析错误 (AST Parse Error): ${err.message}`,
      executionTimeMs: Math.round(performance.now() - startTime),
    };
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
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve({
        success: false,
        frames: [],
        error: '[FUSE_WATCHDOG_TIMEOUT] 沙箱硬件级熔断：代码执行超过 3000ms 强制终止！',
        executionTimeMs: 3000,
      });
    }, 3000);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve(e.data);
    };

    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve({
        success: false,
        frames: [],
        error: `沙箱运行时异常: ${e.message || 'unknown worker error'}`,
        executionTimeMs: Math.round(performance.now() - startTime),
      });
    };

    worker.postMessage({ code: instrumented });
  });
}
