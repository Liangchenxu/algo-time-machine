import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  ChevronRight,
  Gauge,
  History,
  Layers,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Search,
  SkipBack,
  SkipForward,
  Terminal,
  Timer,
  Zap,
  Bomb,
  Waves,
} from 'lucide-react';
import clsx from 'clsx';
import type { TraceFrame } from './core/instrumenter';
import { runInSandbox } from './core/sandboxRunner';
import { DEFAULT_PRESET, PRESETS } from './presets';

const LINE_H = 22;
const BASE_TICK = 240;
const SPEEDS = [0.5, 1, 2, 4];

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

const PRESET_ICONS = { rain: Waves, search: Search, bomb: Bomb };

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

/* ───────────────────────── 代码编辑 + 实时执行行追踪 ───────────────────────── */

interface EditorProps {
  source: string;
  onChange: (next: string) => void;
  activeLine: number | null;
  hits: Map<number, number>;
  maxHits: number;
}

function Editor({ source, onChange, activeLine, hits, maxHits }: EditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const lines = useMemo(() => source.split('\n'), [source]);

  const sync = () => {
    const ta = taRef.current;
    const layer = layerRef.current;
    if (!ta || !layer) return;
    layer.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    setScrollTop(ta.scrollTop);
  };

  useEffect(() => {
    const ta = taRef.current;
    if (!ta || activeLine === null) return;
    const y = (activeLine - 1) * LINE_H;
    const viewTop = ta.scrollTop;
    const viewBottom = ta.scrollTop + ta.clientHeight;
    if (y < viewTop + LINE_H || y > viewBottom - LINE_H * 2) {
      ta.scrollTop = Math.max(0, y - ta.clientHeight / 2);
      sync();
    }
  }, [activeLine]);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-ink-700 bg-ink-900/70 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)]">
      <header className="flex items-center gap-2 border-b border-ink-700 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
        <Layers className="h-3.5 w-3.5 text-neon-cyan" />
        <span>源码 / 执行行追踪</span>
        <span className="ml-auto flex items-center gap-2 normal-case tracking-normal">
          {activeLine !== null && (
            <span className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-cyan-200">
              当前 L{activeLine}
            </span>
          )}
          <span className="text-slate-500">{lines.length} 行</span>
        </span>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* 追踪层：行号 + 当前行发光条 + 执行次数热力背景（不拦截输入） */}
        <div
          ref={layerRef}
          className="pointer-events-none absolute left-0 top-0 pt-3 will-change-transform"
        >
          {lines.map((line, i) => {
            const no = i + 1;
            const count = hits.get(no) ?? 0;
            const isCurrent = activeLine === no;
            const heat = count > 0 && !isCurrent ? 0.06 + (count / maxHits) * 0.16 : 0;
            return (
              <div
                key={no}
                className={clsx(
                  'relative h-[22px] whitespace-pre pl-[54px] pr-[420px] font-mono text-[13px] leading-[22px]',
                  isCurrent && 'bg-blue-500/20'
                )}
                style={heat ? { background: `rgba(34,211,238,${heat.toFixed(3)})` } : undefined}
              >
                <span
                  className={clsx(
                    'absolute left-0 w-[40px] text-right text-[11px]',
                    isCurrent ? 'font-bold text-cyan-200' : count > 0 ? 'text-slate-400' : 'text-slate-600'
                  )}
                >
                  {no}
                </span>
                {isCurrent && (
                  <span className="absolute left-[46px] top-0 h-full w-[3px] rounded-full bg-cyan-300 shadow-glow animate-pulseRing" />
                )}
                <span className="text-transparent">{line || ' '}</span>
              </div>
            );
          })}
          <div className="h-24" />
        </div>

        {/* 当前行徽标：随滚动定位，显示行号与该行累计执行次数 */}
        {activeLine !== null && (
          <div
            className="pointer-events-none absolute right-4 z-20 flex items-center gap-1.5 text-[10px] font-semibold"
            style={{ top: 12 + (activeLine - 1) * LINE_H - scrollTop }}
          >
            <span className="rounded border border-cyan-400/50 bg-cyan-500/15 px-1.5 py-[1px] text-cyan-200">
              L{activeLine}
            </span>
            <span className="rounded border border-amber-400/50 bg-amber-500/15 px-1.5 py-[1px] text-amber-200">
              ×{hits.get(activeLine) ?? 0}
            </span>
          </div>
        )}

        <textarea
          ref={taRef}
          value={source}
          wrap="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          className="scroll-thin absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent py-3 pl-[54px] pr-6 font-mono text-[13px] leading-[22px] text-slate-100 caret-cyan-300 outline-none"
        />
      </div>
    </section>
  );
}

/* ───────────────────────── 内存显微镜：数组 + 双指针联动 ───────────────────────── */

interface PointerRef {
  name: string;
  value: number;
}

function ArrayLens({ name, arr, pointers }: { name: string; arr: any[]; pointers: PointerRef[] }) {
  const isMatrix = arr.length > 0 && arr.every((row) => Array.isArray(row));
  const flat = arr as any[];
  const numeric = !isMatrix && flat.every((v) => typeof v === 'number' && Number.isFinite(v));
  const maxAbs = numeric ? Math.max(1, ...flat.map((v: number) => Math.abs(v))) : 1;
  const visible = flat.slice(0, 60);
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
        <span className="text-slate-500">{isMatrix ? `矩阵 ${flat.length}×${(flat[0] as any[])?.length ?? 0}` : `数组 · ${flat.length} 项`}</span>
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
            const barPct = numeric && !isMatrix ? Math.max(4, (Math.abs(cell as number) / maxAbs) * 100) : 0;
            return (
              <div key={idx} className="flex w-[62px] flex-col items-center gap-1">
                {numeric && !isMatrix && (
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
                    ? `[${(cell as any[]).slice(0, 4).map((v) => (typeof v === 'number' ? v : formatValue(v))).join(',')}${(cell as any[]).length > 4 ? '…' : ''}]`
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
      {flat.length > visible.length && (
        <p className="mt-1 text-[10px] text-slate-500">仅渲染前 {visible.length} 项，共 {flat.length} 项</p>
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
  const outOfRange = pointers.filter(
    (p) => !arrays.some(([, a]) => p.value >= 0 && p.value < a.length)
  );

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-ink-700 bg-ink-900/70">
      <header className="flex items-center gap-2 border-b border-ink-700 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
        <Activity className="h-3.5 w-3.5 text-neon-lime" />
        <span>内存显微镜</span>
        <span className="ml-auto flex items-center gap-2 normal-case tracking-normal text-slate-500">
          <span>{arrays.length} 数组</span>
          <span>·</span>
          <span>{pointers.length} 指针</span>
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
          <ArrayLens key={name} name={name} arr={arr} pointers={pointers.filter((p) => !outOfRange.includes(p))} />
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

/* ───────────────────────── 时间旅行控制器 ───────────────────────── */

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

/* ───────────────────────── 主应用 ───────────────────────── */

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

  const total = frames.length;
  const current = total > 0 ? frames[Math.min(cursor, total - 1)] : null;
  const activeLine = current ? current.line : null;

  const { hits, maxHits } = useMemo(() => {
    const map = new Map<number, number>();
    const end = Math.min(cursor, total - 1);
    for (let i = 0; i <= end; i++) {
      const line = frames[i].line;
      map.set(line, (map.get(line) ?? 0) + 1);
    }
    let max = 1;
    map.forEach((v) => {
      if (v > max) max = v;
    });
    return { hits: map, maxHits: max };
  }, [frames, cursor, total]);

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

  const step = (delta: number) => {
    setPlaying(false);
    setCursor((c) => Math.max(0, Math.min(c + delta, total - 1)));
  };

  return (
    <div className="flex h-full flex-col bg-ink-950 text-slate-200">
      {/* 顶部：品牌 + 预设算法 + 运行 */}
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
              <p className="text-[11px] text-slate-500">Babel 自动插桩 · Web Worker 沙箱 · 2000 步熔断守护</p>
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
                    execute(p.code);
                  }}
                  className={clsx(
                    'group flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition',
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
          </div>
        </div>

        {/* 指标条 */}
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

      {/* 熔断告警横幅 */}
      {error && (
        <div className="flex shrink-0 items-center gap-3 border-y border-rose-500/60 bg-rose-950/60 px-4 py-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-rose-400/70 bg-rose-500/20">
            <AlertTriangle className="h-4 w-4 text-rose-200" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-rose-100">{error}</p>
            <p className="text-[11px] text-rose-200/70">
              沙箱已安全拦截，并回收熔断前 <b className="text-rose-50">{total}</b> 帧现场快照 —— 可拖动下方进度条逐帧复盘崩溃路径。
            </p>
          </div>
        </div>
      )}

      {/* 主体双栏 */}
      <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Editor source={source} onChange={setSource} activeLine={activeLine} hits={hits} maxHits={maxHits} />
        <MemoryScope frame={current} />
      </main>

      <Timeline
        frames={frames}
        cursor={cursor}
        playing={playing}
        speed={speed}
        onCursor={(next) => {
          setPlaying(false);
          setCursor(Math.max(0, Math.min(next, Math.max(0, total - 1))));
        }}
        onTogglePlay={() => {
          if (total === 0) return;
          if (cursor >= total - 1) setCursor(0);
          setPlaying((p) => !p);
        }}
        onStep={step}
        onSpeed={setSpeed}
      />
    </div>
  );
}
