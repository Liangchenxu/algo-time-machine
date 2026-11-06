import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Boxes,
  BrainCircuit,
  ChevronRight,
  Cpu,
  Flame,
  Gauge,
  GitCompare,
  History,
  Layers,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Search,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Sparkles,
  Target,
  Terminal,
  Timer,
  TreePine,
  TrendingDown,
  Wand2,
  Waves,
  Wrench,
  X,
  Zap,
  Bomb,
} from 'lucide-react';
import clsx from 'clsx';
import type { TraceFrame } from './core/instrumenter';
import { runInSandbox } from './core/sandboxRunner';
import type { AIDiagnosticReport } from './services/aiDiagnostics';
import { runAIDiagnostics } from './services/aiDiagnostics';
import { DEFAULT_PRESET, PRESETS } from './presets';

const LINE_H = 22;
const BASE_TICK = 240;
const SPEEDS = [0.5, 1, 2, 4];
const GUTTER = 92;

const POINTER_STYLES: Record<string, string> = {
  left: 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200',
  right: 'border-rose-400/60 bg-rose-500/15 text-rose-200',
  low: 'border-sky-400/60 bg-sky-500/15 text-sky-200',
  high: 'border-orange-400/60 bg-orange-500/15 text-orange-200',
  mid: 'border-amber-400/60 bg-amber-500/15 text-amber-200',
  i: 'border-lime-400/60 bg-lime-500/15 text-lime-200',
  j: 'border-violet-400/60 bg-violet-500/15 text-violet-200',
  slow: 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-200',
  fast: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200',
};

const PRESET_ICONS = { rain: Waves, search: Search, tree: TreePine, bomb: Bomb };

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v.length > 24 ? `"${v.slice(0, 21)}…"` : `"${v}"`;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (typeof v === 'boolean' || v === null) return String(v);
  try {
    const s = JSON.stringify(v) ?? String(v);
    return s.length > 28 ? `${s.slice(0, 25)}…` : s;
  } catch {
    return String(v);
  }
}

/** 执行次数越高，热力背景越偏红 */
function heatTint(hits: number, maxHits: number): string {
  const t = Math.min(1, hits / Math.max(1, maxHits));
  return `linear-gradient(90deg, rgba(251,146,60,${(0.08 + t * 0.3).toFixed(3)}) 0%, rgba(239,68,68,${(
    0.04 + t * 0.22
  ).toFixed(3)}) 44%, rgba(5,7,13,0) 82%)`;
}

function heatBadgeClass(hits: number, maxHits: number): string {
  const t = Math.min(1, hits / Math.max(1, maxHits));
  if (t > 0.66) return 'border-rose-400/60 bg-rose-500/20 text-rose-100';
  if (t > 0.33) return 'border-orange-400/60 bg-orange-500/15 text-orange-100';
  return 'border-amber-400/50 bg-amber-500/10 text-amber-100';
}

/* ───────────────────── 代码编辑 + 行级执行热力图 ───────────────────── */

interface EditorProps {
  source: string;
  onChange: (next: string) => void;
  activeLine: number | null;
  lineHits?: Record<number, number>;
  maxHits: number;
}

function Editor({ source, onChange, activeLine, lineHits, maxHits }: EditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => source.split('\n'), [source]);

  const sync = () => {
    const ta = taRef.current;
    const layer = layerRef.current;
    if (!ta || !layer) return;
    layer.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
  };

  useEffect(() => {
    sync();
  }, [source]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta || activeLine === null) return;
    const y = (activeLine - 1) * LINE_H;
    if (y < ta.scrollTop + LINE_H || y > ta.scrollTop + ta.clientHeight - LINE_H * 2) {
      ta.scrollTop = Math.max(0, y - ta.clientHeight / 2);
      sync();
    }
  }, [activeLine]);

  const pad = `${GUTTER}px`;

  return (
    <section className="flex min-h-[320px] flex-col rounded-xl border border-ink-700 bg-ink-900/70 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] xl:min-h-0">
      <header className="flex items-center gap-2 border-b border-ink-700 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
        <Layers className="h-3.5 w-3.5 text-neon-cyan" />
        <span>源码 · 行级执行热力图</span>
        <span className="ml-auto flex items-center gap-2 normal-case tracking-normal">
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            冷
            <span className="inline-block h-2 w-10 rounded-full bg-gradient-to-r from-amber-500/30 via-orange-500/60 to-rose-500/80" />
            热
          </span>
          {activeLine !== null && (
            <span className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-cyan-200">
              当前 L{activeLine}
            </span>
          )}
        </span>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={layerRef}
          className="pointer-events-none absolute left-0 top-0 pt-3 font-mono text-[13px] will-change-transform"
        >
          {lines.map((line, i) => {
            const no = i + 1;
            const count = lineHits?.[no] ?? 0;
            const isCurrent = activeLine === no;
            return (
              <div
                key={no}
                className={clsx(
                  'relative h-[22px] whitespace-pre leading-[22px] pr-[420px]',
                  isCurrent && 'z-[1]'
                )}
                style={{
                  paddingLeft: pad,
                  background: count > 0 ? heatTint(count, maxHits) : undefined,
                  boxShadow: isCurrent ? 'inset 0 0 0 1px rgba(96,165,250,0.6)' : undefined,
                }}
              >
                <span
                  className={clsx(
                    'absolute left-0 w-[36px] text-right text-[11px]',
                    isCurrent ? 'font-bold text-cyan-200' : count > 0 ? 'text-slate-400' : 'text-slate-600'
                  )}
                >
                  {no}
                </span>
                {count > 0 && (
                  <span
                    className={clsx(
                      'absolute left-[42px] top-[3px] rounded border px-1 text-[9px] font-bold leading-[16px]',
                      heatBadgeClass(count, maxHits),
                      isCurrent && 'ring-1 ring-cyan-300/50'
                    )}
                  >
                    🔥{count}x
                  </span>
                )}
                {isCurrent && (
                  <span className="animate-pulseRing absolute top-0 h-full w-[3px] rounded-full bg-cyan-300 shadow-glow" style={{ left: GUTTER - 8 }} />
                )}
                <span className="text-transparent">{line || ' '}</span>
              </div>
            );
          })}
          <div className="h-24" />
        </div>

        <textarea
          ref={taRef}
          value={source}
          wrap="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          style={{ paddingLeft: pad }}
          className="scroll-thin absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent py-3 pr-6 font-mono text-[13px] leading-[22px] text-slate-100 caret-cyan-300 outline-none"
        />
      </div>
    </section>
  );
}

/* ───────────────────── 内存显微镜 ───────────────────── */

interface PointerRef {
  name: string;
  value: number;
}

function ArrayLens({ name, arr, pointers }: { name: string; arr: any[]; pointers: PointerRef[] }) {
  const isMatrix = arr.length > 0 && arr.every((row) => Array.isArray(row));
  const numeric = !isMatrix && arr.every((v) => typeof v === 'number' && Number.isFinite(v));
  const maxAbs = numeric ? Math.max(1, ...(arr as number[]).map((v) => Math.abs(v))) : 1;
  const visible = arr.slice(0, 60);
  const hitsByIndex = new Map<number, PointerRef[]>();
  pointers.forEach((p) => {
    if (p.value >= 0 && p.value < visible.length) {
      hitsByIndex.set(p.value, [...(hitsByIndex.get(p.value) ?? []), p]);
    }
  });

  return (
    <div className="rounded-lg border border-ink-600 bg-ink-850/70 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px]">
        <Boxes className="h-3.5 w-3.5 text-neon-violet" />
        <span className="font-bold text-slate-200">{name}</span>
        <span className="text-slate-500">
          {isMatrix ? `矩阵 ${arr.length}×${(arr[0] as any[])?.length ?? 0}` : `数组 · ${arr.length} 项`}
        </span>
        {numeric && (
          <span className="ml-auto text-slate-500">
            max <b className="text-neon-cyan">{maxAbs}</b>
          </span>
        )}
      </div>

      <div className="scroll-thin overflow-x-auto pb-1">
        <div className="flex min-w-max items-end gap-1.5">
          {visible.map((cell, idx) => {
            const cellPointers = hitsByIndex.get(idx) ?? [];
            const highlighted = cellPointers.length > 0;
            const barPct = numeric ? Math.max(4, (Math.abs(cell as number) / maxAbs) * 100) : 0;
            return (
              <div key={idx} className="flex w-[62px] flex-col items-center gap-1">
                {numeric && (
                  <div className="flex h-[46px] w-full items-end justify-center">
                    <div
                      className="w-[74%] rounded-t-[3px] bg-gradient-to-t from-blue-600/70 to-cyan-300/90 transition-all duration-150"
                      style={{ height: `${barPct}%` }}
                    />
                  </div>
                )}
                <div
                  className={clsx(
                    'grid h-11 w-full place-items-center rounded-md border px-1 text-[12px] font-bold transition-colors duration-150',
                    highlighted
                      ? 'border-cyan-300/80 bg-cyan-400/20 text-cyan-50 shadow-glow'
                      : isMatrix
                        ? 'border-ink-600 bg-ink-900 text-[9px] font-normal text-slate-400'
                        : 'border-ink-600 bg-ink-900 text-slate-200'
                  )}
                  title={JSON.stringify(cell)}
                >
                  {isMatrix
                    ? `[${(cell as any[]).slice(0, 4).map((v) => (typeof v === 'number' ? v : formatValue(v))).join(',')}${
                        (cell as any[]).length > 4 ? '…' : ''
                      }]`
                    : formatValue(cell)}
                </div>
                <span className="text-[10px] text-slate-500">[{idx}]</span>
                <div className="flex h-[36px] flex-col items-center gap-[3px]">
                  {cellPointers.map((p) => (
                    <span
                      key={p.name}
                      className={clsx(
                        'whitespace-nowrap rounded-full border px-1.5 py-[1px] text-[10px] font-bold shadow-glow',
                        POINTER_STYLES[p.name]
                      )}
                    >
                      ▲ {p.name}={p.value}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {arr.length > visible.length && (
        <p className="mt-1 text-[10px] text-slate-500">
          仅渲染前 {visible.length} 项，共 {arr.length} 项
        </p>
      )}
    </div>
  );
}

function MemoryScope({ frame }: { frame: TraceFrame | null }) {
  const entries = useMemo(
    () => Object.entries(frame?.variables ?? {}) as [string, any][],
    [frame]
  );
  const arrays = entries.filter(([, v]) => Array.isArray(v) && v.length > 0);
  const scalars = entries.filter(([, v]) => !Array.isArray(v));
  const pointers: PointerRef[] = entries
    .filter(([k, v]) => POINTER_STYLES[k] && typeof v === 'number' && Number.isInteger(v))
    .map(([k, v]) => ({ name: k, value: v as number }));
  const inRange = pointers.filter((p) => arrays.some(([, a]) => p.value >= 0 && p.value < a.length));
  const outOfRange = pointers.filter((p) => !inRange.includes(p));

  return (
    <section className="flex min-h-[340px] flex-col rounded-xl border border-ink-700 bg-ink-900/70 xl:min-h-0">
      <header className="flex items-center gap-2 border-b border-ink-700 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
        <Activity className="h-3.5 w-3.5 text-neon-lime" />
        <span>内存显微镜</span>
        <span className="ml-auto flex items-center gap-2 normal-case tracking-normal text-slate-500">
          <span>{arrays.length} 数组</span>
          <span>·</span>
          <span>{inRange.length} 指针</span>
        </span>
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!frame && (
          <p className="rounded-lg border border-dashed border-ink-600 p-6 text-center text-xs text-slate-500">
            点击顶部「运行插桩」以采集时间帧
          </p>
        )}

        {frame && arrays.length === 0 && scalars.length === 0 && (
          <p className="rounded-lg border border-dashed border-ink-600 p-6 text-center text-xs text-slate-500">
            当前帧作用域内无可观测变量
          </p>
        )}

        {arrays.map(([name, arr]) => (
          <ArrayLens key={name} name={name} arr={arr} pointers={inRange} />
        ))}

        {scalars.length > 0 && (
          <div className="rounded-lg border border-ink-600 bg-ink-850/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
              <Layers className="h-3.5 w-3.5 text-neon-cyan" />
              标量与对象快照
            </div>
            <div className="flex flex-wrap gap-1.5">
              {scalars.map(([k, v]) => {
                const isPointer = Boolean(POINTER_STYLES[k]);
                return (
                  <span
                    key={k}
                    className={clsx(
                      'rounded-md border px-2 py-1 font-mono text-[11px]',
                      isPointer
                        ? clsx(POINTER_STYLES[k], 'font-bold')
                        : 'border-ink-600 bg-ink-900 text-slate-300'
                    )}
                  >
                    <b className="text-slate-100">{k}</b>
                    <span className="mx-1 text-slate-500">=</span>
                    {formatValue(v)}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {outOfRange.length > 0 && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 text-[11px] text-amber-200">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              指针已越出数组边界，不再渲染在方格下方
            </div>
            <div className="flex flex-wrap gap-1.5 font-mono">
              {outOfRange.map((p) => (
                <span key={p.name} className={clsx('rounded-full border px-2 py-[2px]', POINTER_STYLES[p.name])}>
                  {p.name}={p.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-ink-700 p-3">
        <div className="min-h-[92px]">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500">
            <ChevronRight className="h-3 w-3 text-neon-violet" />
            调用栈
          </div>
          <div className="scroll-thin flex h-[64px] flex-wrap content-start gap-1 overflow-y-auto">
            {(frame?.callStack ?? ['main()']).map((fn, i) => (
              <span
                key={`${fn}-${i}`}
                className={clsx(
                  'rounded border px-1.5 py-[2px] text-[10px]',
                  i === (frame?.callStack.length ?? 1) - 1
                    ? 'border-violet-400/60 bg-violet-500/15 text-violet-200'
                    : 'border-ink-600 bg-ink-900 text-slate-400'
                )}
              >
                {fn}
              </span>
            ))}
          </div>
        </div>
        <div className="min-h-[92px]">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500">
            <Terminal className="h-3 w-3 text-neon-lime" />
            stdout
          </div>
          <div className="scroll-thin h-[64px] overflow-y-auto rounded border border-ink-600 bg-black/50 p-1.5 font-mono text-[10px] leading-[16px] text-lime-300">
            {(frame?.stdout ?? []).length === 0 ? (
              <span className="text-slate-600">// 暂无输出</span>
            ) : (
              frame!.stdout.map((log, i) => <div key={i}>$ {log}</div>)
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── AI 帧级复杂度手术刀 ───────────────────── */

interface AiPanelProps {
  report: AIDiagnosticReport | null;
  loading: boolean;
  running: boolean;
  hasFrames: boolean;
  framesCount: number;
  apiKey: string;
  comparison: { from: number; to: number } | null;
  onApiKey: (v: string) => void;
  onDiagnose: () => void;
  onJump: (frameIndex: number) => void;
  onApply: (code: string) => void;
}

function AiPanel({
  report,
  loading,
  running,
  hasFrames,
  framesCount,
  apiKey,
  comparison,
  onApiKey,
  onDiagnose,
  onJump,
  onApply,
}: AiPanelProps) {
  const gain =
    comparison && comparison.from > 0
      ? Math.round(((comparison.from - comparison.to) / comparison.from) * 100)
      : null;

  return (
    <section className="flex min-h-[340px] flex-col rounded-xl border border-violet-500/30 bg-[linear-gradient(160deg,rgba(76,29,149,0.22),rgba(10,15,26,0.85))] xl:min-h-0">
      <header className="flex items-center gap-2 border-b border-violet-500/30 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-violet-200/80">
        <BrainCircuit className="h-3.5 w-3.5 text-neon-violet" />
        <span>DeepSeek / AI 帧级复杂度手术刀</span>
        {report && (
          <span className="ml-auto flex items-center gap-1 rounded border border-ink-600 bg-ink-900 px-1.5 py-[1px] text-[10px] normal-case tracking-normal text-slate-300">
            <Cpu className="h-3 w-3 text-neon-cyan" />
            {report.engine === 'deepseek' ? 'DeepSeek 在线' : '内置免 Key 引擎'}
          </span>
        )}
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="space-y-2 rounded-lg border border-ink-600 bg-ink-850/60 p-3">
          <label className="block text-[10px] uppercase tracking-widest text-slate-500">
            DeepSeek API Key（可选，留空使用内置确定性引擎）
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKey(e.target.value)}
            placeholder="sk-••••••••••••••••"
            className="w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-400/60"
          />
          <button
            onClick={onDiagnose}
            disabled={!hasFrames || loading || running}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-400/60 bg-gradient-to-b from-violet-500/30 to-fuchsia-600/20 px-3 py-2 text-[12px] font-bold text-violet-50 shadow-glow transition hover:brightness-125 disabled:opacity-40"
          >
            <Sparkles className={clsx('h-4 w-4', loading && 'animate-spin')} />
            {loading ? 'AI 帧级推理中…' : '✨ 启动 AI 帧级诊断'}
          </button>
          <p className="text-[10px] leading-relaxed text-slate-500">
            Key 仅保存在内存并在本次诊断中直连 DeepSeek，不写入 localStorage；若浏览器 CORS
            拦截则自动回退内置 AST 引擎。
          </p>
        </div>

        {!report && !loading && (
          <p className="rounded-lg border border-dashed border-ink-600 p-6 text-center text-xs text-slate-500">
            采集时间帧后启动诊断，AI 将基于 lineHits 与调用栈深度给出时空复杂度报告
          </p>
        )}

        {loading && (
          <div className="space-y-2">
            {[64, 40, 88].map((w, i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-ink-700/70" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {report && !loading && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2.5">
                <p className="text-[10px] uppercase tracking-widest text-rose-200/70">时间复杂度</p>
                <p className="mt-1 text-[13px] font-bold text-rose-100">{report.timeComplexity}</p>
              </div>
              <div className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 p-2.5">
                <p className="text-[10px] uppercase tracking-widest text-cyan-200/70">空间复杂度</p>
                <p className="mt-1 text-[13px] font-bold text-cyan-100">{report.spaceComplexity}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-ink-600 bg-ink-850/70 p-2">
                <p className="text-[10px] text-slate-500">热点行</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 text-[13px] font-bold text-orange-200">
                  <Flame className="h-3.5 w-3.5" />L{report.hotspotLine}
                </p>
                <p className="text-[10px] text-slate-500">×{report.maxHitCount}</p>
              </div>
              <div className="rounded-lg border border-ink-600 bg-ink-850/70 p-2">
                <p className="text-[10px] text-slate-500">最大栈深</p>
                <p className="mt-0.5 text-[13px] font-bold text-violet-200">{report.maxStackDepth} 层</p>
                <p className="text-[10px] text-slate-500">调用栈峰值</p>
              </div>
              <div className="rounded-lg border border-ink-600 bg-ink-850/70 p-2">
                <p className="text-[10px] text-slate-500">总帧数</p>
                <p className="mt-0.5 text-[13px] font-bold text-neon-cyan">{framesCount}</p>
                <p className="text-[10px] text-slate-500">AST 采集</p>
              </div>
            </div>

            <button
              onClick={() => onJump(report.bottleneckFrameIndex)}
              className="flex w-full items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-left text-[11px] text-amber-100 transition hover:bg-amber-500/20"
            >
              <Target className="h-4 w-4 shrink-0" />
              <span>
                瓶颈帧定位 · 第 <b className="text-amber-50">{report.bottleneckFrameIndex}</b> 帧为栈深峰值 / 关键状态转折点
              </span>
              <span className="ml-auto whitespace-nowrap rounded border border-amber-400/50 px-1.5 py-[2px] text-[10px] font-bold">
                🎯 跳转至第 {report.bottleneckFrameIndex} 帧
              </span>
            </button>

            <p className="rounded-lg border border-ink-600 bg-ink-950/60 p-3 text-[11px] leading-relaxed text-slate-300">
              {report.summary}
            </p>

            {report.frameInsights.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">帧级洞察</p>
                {report.frameInsights.map((insight, i) => (
                  <button
                    key={i}
                    onClick={() => onJump(insight.frameIndex)}
                    className="flex w-full items-start gap-2 rounded-md border border-ink-600 bg-ink-850/60 p-2 text-left transition hover:border-violet-400/50"
                  >
                    <span className="mt-[1px] shrink-0 rounded border border-violet-400/50 bg-violet-500/15 px-1.5 py-[1px] text-[10px] font-bold text-violet-200">
                      F{insight.frameIndex}
                    </span>
                    <span className="flex-1 text-[11px] leading-snug text-slate-300">
                      <b className="text-orange-200">L{insight.line}</b> · {insight.issue}
                    </span>
                    <Target className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-ink-600 bg-ink-950/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
                <Wand2 className="h-3.5 w-3.5 text-neon-lime" />
                AI 优化代码
              </div>
              <pre className="scroll-thin max-h-40 overflow-auto whitespace-pre-wrap text-[10.5px] leading-[16px] text-lime-200/90">
                {report.optimizedCode}
              </pre>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-emerald-200/90">
                <TrendingDown className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                {report.optimizationGain}
              </p>
              <button
                onClick={() => onApply(report.optimizedCode)}
                disabled={running}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-3 py-2 text-[12px] font-bold text-emerald-100 transition hover:brightness-125 disabled:opacity-40"
              >
                <Zap className="h-4 w-4" />⚡ 一键应用 AI 优化代码并重跑对比
              </button>
            </div>

            {comparison && gain !== null && (
              <div className="flex items-center gap-2 rounded-lg border border-cyan-400/50 bg-cyan-500/10 p-3 text-[12px] text-cyan-100">
                <GitCompare className="h-4 w-4 shrink-0" />
                <span>
                  优化前后时间帧：
                  <b className="mx-1 text-rose-200 line-through">{comparison.from}</b>→
                  <b className="mx-1 text-emerald-200">{comparison.to}</b>
                  {gain >= 0 ? `（减少 ${gain}%）` : `（增加 ${-gain}%）`}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ───────────────────── Qoder 协同开发档案 ───────────────────── */

const BREAKER_ROWS = [
  { name: '步数熔断', where: '__guard', limit: '2000 步', effect: '抛出疑似死循环告警，并回收熔断前全部时间帧' },
  { name: '递归熔断', where: '__enterFn', limit: '150 层', effect: '调用栈超限即抛出栈溢出告警，__exitFn 负责退栈' },
  { name: '硬件熔断', where: 'sandboxRunner', limit: '3000ms', effect: 'worker.terminate() 强制终止隔离线程' },
];

const MILESTONES = [
  {
    tag: 'Milestone 1',
    title: 'AST 作用域快照与 Web Worker 沙箱构建',
    detail:
      'Babel 插件在循环、赋值、函数调用处注入 __trace 钩子；Blob Worker 隔离执行 + 3000ms 硬件熔断；输出 frameIndex / line / variables / callStack / stdout 五元组时间帧。',
  },
  {
    tag: 'Milestone 2',
    title: '架构师纠偏：AST 递归退栈 + 行级热力',
    detail:
      '架构师指出递归函数返回后调用栈未弹出，导致帧级 callStack 只增不减、栈深指标失真。指导 Qoder 以 try...finally { __exitFn() } 包裹函数体，并在 __trace 内累计 __lineHits 让每一帧携带截至该帧的行级执行热力。',
  },
];

const QODER_CORRECTIONS = [
  'TDZ 纠偏：scope.bindings 含同块内稍后声明的 let/const，快照读取改为 try/catch 闭包，避免 ReferenceError 中断采集。',
  '帧回收纠偏：__frames 同步挂载 globalThis.__mtmFrames，Worker catch 分支得以在熔断后回传前序帧。',
  '覆盖纠偏：插桩 visitor 扩展到 Program，使顶层语句（函数调用与 console.log）同样产帧。',
  '协同纠偏留痕：Milestone 2 实例代码曾回退上述 TDZ 修复，已在合并时保留修复并标注来源。',
];

function ArchiveModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="scroll-thin max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-violet-400/40 bg-ink-900 shadow-[0_40px_120px_-40px_rgba(139,92,246,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-center gap-3 border-b border-ink-700 bg-ink-900/95 px-4 py-3 backdrop-blur">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-violet-400/50 bg-violet-500/15">
            <Wrench className="h-4 w-4 text-neon-violet" />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-slate-50">🛠️ Qoder 协同开发档案</h2>
            <p className="text-[11px] text-slate-500">人机协同架构演进 · 安全熔断设计 · 工程纠偏留痕</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-ink-600 text-slate-400 transition hover:border-rose-400/60 hover:text-rose-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 p-4">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[12px] font-bold text-neon-cyan">
              <ShieldCheck className="h-4 w-4" />三层安全熔断架构
            </h3>
            <div className="overflow-hidden rounded-lg border border-ink-600">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-ink-800 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">熔断层</th>
                    <th className="px-3 py-2 font-semibold">实现位置</th>
                    <th className="px-3 py-2 font-semibold">阈值</th>
                    <th className="px-3 py-2 font-semibold">触发行为</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700 bg-ink-850/60 text-slate-300">
                  {BREAKER_ROWS.map((r) => (
                    <tr key={r.name}>
                      <td className="px-3 py-2 font-bold text-slate-100">{r.name}</td>
                      <td className="px-3 py-2 font-mono text-neon-lime">{r.where}</td>
                      <td className="px-3 py-2 text-amber-200">{r.limit}</td>
                      <td className="px-3 py-2">{r.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[12px] font-bold text-neon-violet">
              <BookOpen className="h-4 w-4" />人机协同架构演进记录
            </h3>
            <div className="space-y-2">
              {MILESTONES.map((m) => (
                <div key={m.tag} className="rounded-lg border border-ink-600 bg-ink-850/60 p-3">
                  <div className="flex items-center gap-2">
                    <History className="h-3.5 w-3.5 text-neon-cyan" />
                    <span className="rounded border border-cyan-400/40 bg-cyan-500/10 px-1.5 py-[1px] text-[10px] font-bold text-cyan-200">
                      {m.tag}
                    </span>
                    <span className="text-[12px] font-bold text-slate-100">{m.title}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{m.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[12px] font-bold text-neon-amber">
              <AlertTriangle className="h-4 w-4" />Qoder 工程纠偏留痕
            </h3>
            <ul className="space-y-1.5 rounded-lg border border-amber-400/30 bg-amber-500/5 p-3">
              {QODER_CORRECTIONS.map((c) => (
                <li key={c} className="flex gap-2 text-[11px] leading-relaxed text-amber-100/90">
                  <ChevronRight className="mt-[2px] h-3 w-3 shrink-0 text-amber-300" />
                  {c}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── 时间旅行控制器 ───────────────────── */

interface TimelineProps {
  frames: TraceFrame[];
  cursor: number;
  playing: boolean;
  speed: number;
  onCursor: (next: number) => void;
  onTogglePlay: () => void;
  onStep: (delta: number) => void;
  onSpeed: (next: number) => void;
}

function Timeline({ frames, cursor, playing, speed, onCursor, onTogglePlay, onStep, onSpeed }: TimelineProps) {
  const total = frames.length;
  const current = total > 0 ? frames[Math.min(cursor, total - 1)] : null;
  const pct = total > 1 ? (cursor / (total - 1)) * 100 : 0;

  return (
    <footer className="shrink-0 border-t border-ink-700 bg-ink-900/90 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onCursor(0)}
            disabled={total === 0}
            className="grid h-9 w-9 place-items-center rounded-lg border border-ink-600 bg-ink-850 text-slate-300 transition hover:border-neon-cyan/60 hover:text-neon-cyan disabled:opacity-35"
            title="回到首帧"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => onStep(-1)}
            disabled={total === 0}
            className="grid h-9 w-9 place-items-center rounded-lg border border-ink-600 bg-ink-850 text-slate-300 transition hover:border-neon-cyan/60 hover:text-neon-cyan disabled:opacity-35"
            title="上一帧"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={onTogglePlay}
            disabled={total === 0}
            className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/60 bg-gradient-to-b from-cyan-500/30 to-blue-600/25 text-cyan-100 shadow-glow-lg transition hover:brightness-125 disabled:opacity-35"
            title={playing ? '暂停' : '播放'}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
          </button>
          <button
            onClick={() => onStep(1)}
            disabled={total === 0}
            className="grid h-9 w-9 place-items-center rounded-lg border border-ink-600 bg-ink-850 text-slate-300 transition hover:border-neon-cyan/60 hover:text-neon-cyan disabled:opacity-35"
            title="下一帧"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <input
            type="range"
            className="timeline"
            min={0}
            max={Math.max(0, total - 1)}
            value={Math.min(cursor, Math.max(0, total - 1))}
            disabled={total === 0}
            onChange={(e) => onCursor(Number(e.target.value))}
            style={{ '--progress': `${pct}%` } as CSSProperties}
          />
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-bold text-cyan-200">
              Frame {total > 0 ? cursor + 1 : 0} / {total}
            </span>
            <span className="truncate pl-3 text-slate-300">
              {current ? `${current.event} · L${current.line}` : '等待采集时间帧'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-slate-500" />
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeed(s)}
              className={clsx(
                'rounded-md border px-2.5 py-1 text-[11px] font-bold transition',
                speed === s
                  ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-100 shadow-glow'
                  : 'border-ink-600 bg-ink-850 text-slate-400 hover:text-slate-200'
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}

/* ───────────────────── 主应用 ───────────────────── */

export default function App() {
  const [source, setSource] = useState(DEFAULT_PRESET.code);
  const [activePreset, setActivePreset] = useState<string | null>(DEFAULT_PRESET.id);
  const [frames, setFrames] = useState<TraceFrame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [report, setReport] = useState<AIDiagnosticReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [comparison, setComparison] = useState<{ from: number; to: number } | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const total = frames.length;
  const current = total > 0 ? frames[Math.min(cursor, total - 1)] : null;
  const activeLine = current ? current.line : null;

  const maxHits = useMemo(() => {
    const values = Object.values(current?.lineHits ?? {});
    return values.length ? Math.max(1, ...values.map(Number)) : 1;
  }, [current]);

  async function execute(code: string) {
    setRunning(true);
    setPlaying(false);
    setError(null);
    const result = await runInSandbox(code);
    setFrames(result.frames);
    setCursor(0);
    setElapsed(result.executionTimeMs);
    setError(result.success ? null : result.error ?? '未知错误');
    setRunning(false);
    return result.frames.length;
  }

  useEffect(() => {
    execute(DEFAULT_PRESET.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing || total === 0) return;
    const id = window.setInterval(() => {
      setCursor((c) => Math.min(c + 1, total - 1));
    }, BASE_TICK / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, total]);

  useEffect(() => {
    if (playing && total > 0 && cursor >= total - 1) setPlaying(false);
  }, [playing, cursor, total]);

  const jumpToFrame = (index: number) => {
    if (total === 0) return;
    setPlaying(false);
    setCursor(Math.max(0, Math.min(index, total - 1)));
  };

  async function diagnose() {
    if (total === 0) return;
    setAiLoading(true);
    const next = await runAIDiagnostics(source, frames, error ?? undefined, apiKey);
    setReport(next);
    setAiLoading(false);
  }

  async function applyOptimized(code: string) {
    const from = total;
    setSource(code);
    const to = await execute(code);
    setComparison({ from, to });
  }

  return (
    <div className="flex h-full flex-col bg-ink-950 text-slate-200">
      <header className="shrink-0 border-b border-ink-700 bg-ink-900/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-400/50 bg-cyan-500/10 shadow-glow">
              <History className="h-5 w-5 text-neon-cyan" />
            </span>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight text-slate-50">
                AlgoTimeMachine
                <span className="ml-2 text-[11px] font-normal text-neon-cyan">AST 时间旅行调试器</span>
              </h1>
              <p className="text-[11px] text-slate-500">Babel 自动插桩 · Web Worker 沙箱 · AI 帧级复杂度手术刀</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {PRESETS.map((p, i) => {
              const Icon = PRESET_ICONS[p.icon];
              const active = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setActivePreset(p.id);
                    setSource(p.code);
                    setComparison(null);
                    execute(p.code);
                  }}
                  className={clsx(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition',
                    active
                      ? 'border-cyan-400/70 bg-cyan-500/10 shadow-glow'
                      : 'border-ink-600 bg-ink-850 hover:border-neon-cyan/50'
                  )}
                >
                  <Icon className={clsx('h-4 w-4', active ? 'text-neon-cyan' : 'text-slate-400')} />
                  <span className="leading-tight">
                    <span className="block text-[12px] font-bold text-slate-100">
                      {i + 1}. {p.title}
                    </span>
                    <span className="block text-[10px] text-slate-500">{p.subtitle}</span>
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => execute(source)}
              disabled={running}
              className="flex items-center gap-2 rounded-lg border border-emerald-400/60 bg-gradient-to-b from-emerald-500/25 to-emerald-600/15 px-4 py-2.5 text-[12px] font-bold text-emerald-100 shadow-glow transition hover:brightness-125 disabled:opacity-60"
            >
              <Rocket className="h-4 w-4" />
              {running ? '插桩执行中…' : '运行插桩'}
            </button>

            <button
              onClick={() => setShowArchive(true)}
              className="flex items-center gap-2 rounded-lg border border-violet-400/50 bg-violet-500/10 px-3 py-2.5 text-[12px] font-bold text-violet-100 transition hover:bg-violet-500/20"
            >
              <Wrench className="h-4 w-4" />🛠️ 协同档案
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-850 px-2 py-1">
            <Timer className="h-3.5 w-3.5 text-neon-amber" />
            执行耗时 <b className="text-slate-100">{elapsed === null ? '—' : `${elapsed}ms`}</b>
          </span>
          <span className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-850 px-2 py-1">
            <Activity className="h-3.5 w-3.5 text-neon-cyan" />
            时间帧 <b className="text-slate-100">{total}</b>
          </span>
          <span className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-850 px-2 py-1">
            <Zap className="h-3.5 w-3.5 text-neon-lime" />
            当前事件 <b className="max-w-[220px] truncate text-slate-100">{current ? current.event : '—'}</b>
          </span>
          <span className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-850 px-2 py-1">
            <AlertTriangle className="h-3.5 w-3.5 text-neon-rose" />
            熔断阈值 <b className="text-slate-100">2000 步 / 150 层 / 3000ms</b>
          </span>
        </div>
      </header>

      {error && (
        <div className="flex shrink-0 items-center gap-3 border-y border-rose-500/60 bg-rose-950/60 px-4 py-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-rose-400/70 bg-rose-500/20">
            <AlertTriangle className="h-4 w-4 text-rose-200" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-rose-100">{error}</p>
            <p className="text-[11px] text-rose-200/70">
              沙箱已安全拦截，并回收熔断前 <b className="text-rose-50">{total}</b> 帧现场快照 —— 可拖动进度条逐帧复盘，或启动 AI 诊断定位收敛缺陷。
            </p>
          </div>
        </div>
      )}

      <main className="grid min-h-0 flex-1 gap-3 overflow-auto p-3 xl:grid-cols-3 xl:overflow-hidden">
        <Editor
          source={source}
          onChange={setSource}
          activeLine={activeLine}
          lineHits={current?.lineHits}
          maxHits={maxHits}
        />
        <MemoryScope frame={current} />
        <AiPanel
          report={report}
          loading={aiLoading}
          running={running}
          hasFrames={total > 0}
          framesCount={total}
          apiKey={apiKey}
          comparison={comparison}
          onApiKey={setApiKey}
          onDiagnose={diagnose}
          onJump={jumpToFrame}
          onApply={applyOptimized}
        />
      </main>

      <Timeline
        frames={frames}
        cursor={cursor}
        playing={playing}
        speed={speed}
        onCursor={jumpToFrame}
        onTogglePlay={() => {
          if (total === 0) return;
          if (cursor >= total - 1) setCursor(0);
          setPlaying((p) => !p);
        }}
        onStep={(delta) => {
          setPlaying(false);
          setCursor((c) => Math.max(0, Math.min(c + delta, total - 1)));
        }}
        onSpeed={setSpeed}
      />

      {showArchive && <ArchiveModal onClose={() => setShowArchive(false)} />}
    </div>
  );
}
