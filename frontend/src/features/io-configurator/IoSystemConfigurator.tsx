import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  Loader2,
  Download,
  FileText,
  UserPlus,
  Cpu,
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Thermometer,
  Ruler,
  Layers,
  Sparkles,
  X,
  Undo2,
  Link2,
  RotateCcw,
  ChevronUp,
  Pencil,
} from 'lucide-react';
import {
  ioConfiguratorApi,
  ConfiguratorRequirements,
  ConfiguratorResult,
  ConfiguratorOptions,
  IoArrayRequirement,
  IoType,
  BomLine,
  BomAlternative,
  BomAlternativesResponse,
  BomAlternativeId,
  OptimizeFor,
  TemperatureRange,
} from '../../lib/ioConfiguratorApi';
import { useAuth } from '../../lib/auth';

// ─── Local types ────────────────────────────────────────────────────────────

const OPTIMIZE_FOR_ORDER: OptimizeFor[] = ['LOW_COST', 'STANDARD_PERFORMANCE', 'HIGH_PERFORMANCE'];

interface ProjectNode {
  id: string;
  label: string;
  quantity: number;
  requirements: ConfiguratorRequirements;
  result: ConfiguratorResult | null;
  validationErrors: string[];
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

const IO_KIND_LABELS: Record<string, string> = {
  DI: 'Digital input',
  DO: 'Digital output',
  AI: 'Analog input',
  AO: 'Analog output',
  RELAY: 'Relay output',
};

const FUNCTION_CLASS_LABELS: Record<string, string> = {
  COUNTER: 'Counter',
  INCREMENTAL_ENCODER: 'Incremental encoder',
  SSI: 'SSI encoder',
  STEPPER_PULSE: 'Stepper / pulse train',
  FREQUENCY: 'Frequency / transmitter',
  PROPORTIONAL_VALVE: 'Proportional valve / PWM',
  OTHER_MOTION: 'Other motion',
};

function createEmptyArray(): IoArrayRequirement {
  return {
    id: nextId('array'),
    ioType: 'DI',
    signal: '',
    ioKind: '',
    functionClass: '',
    commInterface: '',
    switchingType: '',
    wiringPoints: '',
    analogWiring: '',
    wiringStyle: '',
    quantity: 0,
    sparePercentMin: 10,
    sparePercentMax: 20,
  };
}

function arrayIsComplete(array: IoArrayRequirement): boolean {
  if (!(array.quantity > 0)) return false;
  if (array.ioType === 'COMMUNICATION') return Boolean(array.commInterface);
  if (array.ioType === 'COUNTING_MOTION') return Boolean(array.functionClass);
  if (array.ioType === 'INTRINSICALLY_SAFE' || array.ioType === 'FUNCTIONAL_SAFETY') {
    return Boolean(array.ioKind && array.signal);
  }
  return Boolean(array.signal);
}

function arrayTypeLabel(array: IoArrayRequirement, options: ConfiguratorOptions | undefined): string {
  return options?.ioTypes.find((t) => t.ioType === array.ioType)?.label ?? array.ioType;
}

function formatArraySummary(array: IoArrayRequirement, options: ConfiguratorOptions | undefined): string {
  const parts = [arrayTypeLabel(array, options)];
  if (array.ioKind) parts.push(IO_KIND_LABELS[array.ioKind] ?? array.ioKind);
  if (array.functionClass) parts.push(FUNCTION_CLASS_LABELS[array.functionClass] ?? array.functionClass);
  if (array.commInterface) parts.push(array.commInterface);
  if (array.signal) parts.push(array.signal);
  if (array.quantity > 0) parts.push(`Qty ${array.quantity}`);
  parts.push(`Spare ${array.sparePercentMin}–${array.sparePercentMax}%`);
  if (array.switchingType === 'SINKING') parts.push('Sinking');
  if (array.switchingType === 'SOURCING') parts.push('Sourcing');
  if (array.wiringPoints) parts.push(`${array.wiringPoints}-wire`);
  if (array.analogWiring === 'SINGLE_ENDED') parts.push('Single-ended');
  if (array.analogWiring === 'DIFFERENTIAL') parts.push('Differential');
  if (array.wiringStyle === 'PLUGGABLE') parts.push('Pluggable');
  return parts.join(' · ');
}

function createEmptyRequirements(): ConfiguratorRequirements {
  return {
    ioPlacement: '',
    protocol: '',
    optimizeFor: 'STANDARD_PERFORMANCE',
    ioArrays: [createEmptyArray()],
    maxDinRailWidthMm: null,
    temperatureRange: 'STANDARD',
    averageOutputLoadingPercent: 50,
  };
}

function migrateLegacyRequirements(raw: Record<string, unknown>): ConfiguratorRequirements {
  const optimizeForRaw = raw.optimizeFor;
  let optimizeFor: OptimizeFor | '' =
    optimizeForRaw === 'HIGH_PERFORMANCE' ||
    optimizeForRaw === 'STANDARD_PERFORMANCE' ||
    optimizeForRaw === 'LOW_COST'
      ? optimizeForRaw
      : '';
  if (!optimizeFor) {
    const tier = typeof raw.computeTier === 'string' ? raw.computeTier : null;
    const pref = typeof raw.headUnitPreference === 'string' ? raw.headUnitPreference : null;
    if (tier === 'HIGH' && pref !== 'ECONOMY') optimizeFor = 'HIGH_PERFORMANCE';
    else if (tier === 'MEDIUM' && pref !== 'ECONOMY') optimizeFor = 'STANDARD_PERFORMANCE';
    else if (pref === 'ECONOMY' || tier === 'COMPACT' || tier === 'LOW') optimizeFor = 'LOW_COST';
    else if (tier || pref) optimizeFor = 'STANDARD_PERFORMANCE';
    else optimizeFor = 'STANDARD_PERFORMANCE';
  }
  return {
    ioPlacement: (raw.ioPlacement as ConfiguratorRequirements['ioPlacement']) || '',
    protocol: (raw.protocol as ConfiguratorRequirements['protocol']) || '',
    optimizeFor,
    ioArrays: Array.isArray(raw.ioArrays) && raw.ioArrays.length > 0 ? (raw.ioArrays as IoArrayRequirement[]) : [createEmptyArray()],
    maxDinRailWidthMm: typeof raw.maxDinRailWidthMm === 'number' && raw.maxDinRailWidthMm > 0 ? raw.maxDinRailWidthMm : null,
    temperatureRange: (raw.temperatureRange as TemperatureRange) || 'STANDARD',
    averageOutputLoadingPercent: Number(raw.averageOutputLoadingPercent) || 50,
  };
}

function createNode(label: string): ProjectNode {
  return {
    id: nextId('node'),
    label,
    quantity: 1,
    requirements: createEmptyRequirements(),
    result: null,
    validationErrors: [],
  };
}

// ─── Persistence (localStorage + shareable URL hash) ─────────────────────────

const STORAGE_KEY = 'waigo.io-configurator.project.v1';
const SHARE_HASH_PREFIX = '#io=';

interface PersistedProject {
  v: 1;
  activeNodeId: string;
  nodes: ProjectNode[];
  savedAt: string;
}

/** Share payload omits BOM results (regenerate after open) to keep URLs smaller. */
interface ShareableProject {
  v: 1;
  activeNodeId: string;
  nodes: Array<{
    id: string;
    label: string;
    quantity: number;
    requirements: ConfiguratorRequirements;
  }>;
}

interface NodeUndoSnapshot {
  requirements: ConfiguratorRequirements;
  result: ConfiguratorResult;
  alternativeLabel: string;
}

function bumpIdCounterFromNodes(nodes: ProjectNode[]) {
  idCounter = Math.max(
    idCounter,
    nodes.length + nodes.reduce((sum, n) => sum + n.requirements.ioArrays.length, 0) + 10
  );
}

function isValidPersistedProject(raw: unknown): raw is PersistedProject {
  if (!raw || typeof raw !== 'object') return false;
  const p = raw as PersistedProject;
  return p.v === 1 && typeof p.activeNodeId === 'string' && Array.isArray(p.nodes) && p.nodes.length > 0;
}

function loadFromLocalStorage(): { nodes: ProjectNode[]; activeNodeId: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidPersistedProject(parsed)) return null;
    const nodes = parsed.nodes.map((n) => ({
      ...n,
      requirements: migrateLegacyRequirements(n.requirements as unknown as Record<string, unknown>),
      result: n.result ?? null,
      validationErrors: n.validationErrors ?? [],
    }));
    bumpIdCounterFromNodes(nodes);
    const activeNodeId = nodes.some((n) => n.id === parsed.activeNodeId) ? parsed.activeNodeId : nodes[0].id;
    return { nodes, activeNodeId };
  } catch {
    return null;
  }
}

function saveToLocalStorage(nodes: ProjectNode[], activeNodeId: string) {
  try {
    const payload: PersistedProject = {
      v: 1,
      activeNodeId,
      nodes,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — ignore; in-memory state still works.
  }
}

function clearLocalStorageProject() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function encodeShareHash(nodes: ProjectNode[], activeNodeId: string): string | null {
  const payload: ShareableProject = {
    v: 1,
    activeNodeId,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      quantity: n.quantity,
      requirements: n.requirements,
    })),
  };
  try {
    const json = JSON.stringify(payload);
    const b64 = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
    if (b64.length > 12000) return null;
    return `${SHARE_HASH_PREFIX}${b64}`;
  } catch {
    return null;
  }
}

function loadFromShareHash(): { nodes: ProjectNode[]; activeNodeId: string } | null {
  try {
    const hash = window.location.hash || '';
    if (!hash.startsWith(SHARE_HASH_PREFIX)) return null;
    const b64 = hash.slice(SHARE_HASH_PREFIX.length);
    if (!b64) return null;
    const json = decodeURIComponent(
      Array.from(atob(b64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    );
    const parsed = JSON.parse(json) as ShareableProject;
    if (parsed.v !== 1 || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) return null;
    const nodes: ProjectNode[] = parsed.nodes.map((n) => ({
      id: n.id || nextId('node'),
      label: n.label || 'Node',
      quantity: typeof n.quantity === 'number' && n.quantity > 0 ? n.quantity : 1,
      requirements: migrateLegacyRequirements({
        ...(n.requirements as unknown as Record<string, unknown>),
        ioArrays:
          Array.isArray(n.requirements?.ioArrays) && n.requirements.ioArrays.length > 0
            ? n.requirements.ioArrays.map((a) => ({ ...createEmptyArray(), ...a, id: a.id || nextId('array') }))
            : undefined,
      }),
      result: null,
      validationErrors: [],
    }));
    bumpIdCounterFromNodes(nodes);
    const activeNodeId = nodes.some((n) => n.id === parsed.activeNodeId) ? parsed.activeNodeId : nodes[0].id;
    return { nodes, activeNodeId };
  } catch {
    return null;
  }
}

function initialProjectState(): { nodes: ProjectNode[]; activeNodeId: string; restoredFrom: 'share' | 'local' | 'new' } {
  const fromShare = typeof window !== 'undefined' ? loadFromShareHash() : null;
  if (fromShare) return { ...fromShare, restoredFrom: 'share' };
  const fromLocal = typeof window !== 'undefined' ? loadFromLocalStorage() : null;
  if (fromLocal) return { ...fromLocal, restoredFrom: 'local' };
  const node = createNode('Node 1');
  return { nodes: [node], activeNodeId: node.id, restoredFrom: 'new' };
}

function roleLabel(role: string): string {
  switch (role) {
    case 'HEAD_UNIT':
      return 'Head Unit';
    case 'END_MODULE':
      return 'End Module';
    case 'SUPPLY':
      return 'Backplane Power Supply';
    case 'PROTOCOL_ADDON':
      return 'Protocol Add-on';
    case 'FIELD_POWER_BUS':
      return 'Field Power Bus';
    case 'WIRING_ARM':
      return 'Pluggable Wiring Arm';
    case 'DI':
      return 'Digital Input';
    case 'DO':
      return 'Digital Output';
    case 'AI':
      return 'Analog Input';
    case 'AO':
      return 'Analog Output';
    case 'FUNCTIONAL_SAFETY':
      return 'Functional Safety I/O';
    case 'COMMUNICATION':
      return 'Communication Module';
    case 'COUNTING_MOTION':
      return 'Counting & Motion';
    case 'INTRINSICALLY_SAFE':
      return 'Intrinsically Safe I/O';
    default:
      return role;
  }
}

function formatMoney(value: number | null): string {
  return value == null ? 'TBD' : `$${value.toFixed(2)}`;
}

const TEMPERATURE_ORDER: TemperatureRange[] = ['STANDARD', 'EXTENDED', 'EXTREME'];

function requirementsForAlternativeApply(
  req: ConfiguratorRequirements,
  altId: BomAlternativeId
): ConfiguratorRequirements | null {
  if (altId === 'extended_temperature') {
    const idx = TEMPERATURE_ORDER.indexOf(req.temperatureRange);
    if (idx < 0 || idx >= TEMPERATURE_ORDER.length - 1) return null;
    return { ...req, temperatureRange: TEMPERATURE_ORDER[idx + 1] };
  }
  if (altId === 'higher_tier_head_unit') {
    const idx = OPTIMIZE_FOR_ORDER.indexOf(req.optimizeFor as OptimizeFor);
    if (idx < 0 || idx >= OPTIMIZE_FOR_ORDER.length - 1) return null;
    return { ...req, optimizeFor: OPTIMIZE_FOR_ORDER[idx + 1] };
  }
  return req;
}

function isRequirementChangingAlternative(altId: BomAlternativeId): boolean {
  return altId === 'higher_tier_head_unit' || altId === 'extended_temperature';
}

function formatDelta(value: number | null, suffix = '', lowerIsBetter = false): { text: string; className: string } {
  if (value == null) return { text: 'n/a', className: 'text-gray-400' };
  const sign = value > 0 ? '+' : '';
  const text = `${sign}${value}${suffix}`;
  if (value === 0) return { text: '±0' + suffix, className: 'text-gray-500' };
  const isImprovement = lowerIsBetter ? value < 0 : value > 0;
  return { text, className: isImprovement ? 'text-green-700' : 'text-amber-700' };
}

function BomOptionsPanel({
  data,
  onClose,
  onApply,
  applyingId,
}: {
  data: BomAlternativesResponse;
  onClose: () => void;
  onApply: (alt: BomAlternative) => void;
  applyingId: BomAlternativeId | null;
}) {
  return (
    <div className="border border-wago-primary/30 rounded-lg bg-wago-primary/5 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-wago-primary" />
            BOM Options
          </h3>
          <p className="text-xs text-gray-600 mt-1">
            Compare alternatives against your current BOM. Apply one to replace this node&apos;s result — you can undo afterward.
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 rounded-lg bg-white border border-gray-200 text-xs text-gray-600">
        <span className="font-medium text-gray-800">Current:</span>{' '}
        {data.current.lines.length} lines · {data.current.totalModuleWidthMm.toFixed(1)} mm · {formatMoney(data.current.estimatedSubtotal)}
      </div>

      {data.alternatives.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No different alternatives found for this configuration.</p>
      ) : (
        <div className="space-y-3">
          {data.alternatives.map((alt) => (
            <div key={alt.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{alt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{alt.description}</p>
              </div>

              {alt.unavailableReason ? (
                <p className="text-xs text-gray-400 italic">{alt.unavailableReason}</p>
              ) : alt.result && alt.diff ? (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(() => {
                      const cost = formatDelta(alt.diff.costDelta, '', true);
                      return (
                        <span className={`px-2 py-1 rounded-md bg-gray-50 border border-gray-200 ${cost.className}`}>
                          Cost {cost.text}
                        </span>
                      );
                    })()}
                    {(() => {
                      const skus = formatDelta(alt.diff.distinctSkuDelta, ' SKUs', true);
                      return (
                        <span className={`px-2 py-1 rounded-md bg-gray-50 border border-gray-200 ${skus.className}`}>
                          {skus.text} part numbers
                        </span>
                      );
                    })()}
                    {(() => {
                      const width = formatDelta(alt.diff.widthDelta, ' mm', true);
                      return (
                        <span className={`px-2 py-1 rounded-md bg-gray-50 border border-gray-200 ${width.className}`}>
                          Width {width.text}
                        </span>
                      );
                    })()}
                    {alt.diff.worstSpareStatus && (
                      <span className="px-2 py-1 rounded-md bg-gray-50 border border-gray-200 text-gray-600">
                        Spare {alt.diff.worstSpareStatus}
                        {alt.diff.worstSpareStatusChanged ? ' (changed)' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {alt.result.lines.length} lines · {formatMoney(alt.result.estimatedSubtotal)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onApply(alt)}
                    disabled={applyingId === alt.id}
                    className="btn btn-secondary btn-sm"
                  >
                    {applyingId === alt.id ? 'Applying…' : 'Apply this option'}
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function validateClientSide(req: ConfiguratorRequirements): string[] {
  const errors: string[] = [];
  if (!req.ioPlacement) errors.push('Select an I/O placement.');
  if (!req.protocol) errors.push('Select a protocol.');
  if (!req.optimizeFor) errors.push('Select an Optimize for preference.');
  const validArrays = req.ioArrays.filter(arrayIsComplete);
  if (validArrays.length === 0) {
    errors.push('Add at least one I/O array with quantity and the required filters for that type.');
  }
  for (const a of req.ioArrays) {
    if (arrayIsComplete(a) && a.sparePercentMin > a.sparePercentMax) {
      errors.push(`I/O array (${a.ioType}): minimum spare % cannot exceed maximum spare %.`);
    }
  }
  return errors;
}

// ─── Array spare status badge ───────────────────────────────────────────────

function SpareStatusBadge({ status }: { status: 'GREEN' | 'YELLOW' | 'RED' }) {
  const styles = {
    GREEN: 'bg-green-50 text-green-700 border-green-200',
    YELLOW: 'bg-amber-50 text-amber-700 border-amber-200',
    RED: 'bg-red-50 text-red-700 border-red-200',
  } as const;
  const Icon = status === 'GREEN' ? CheckCircle2 : status === 'YELLOW' ? AlertTriangle : XCircle;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${styles[status]}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

// ─── I/O Array row editor ───────────────────────────────────────────────────

function ArrayRowEditor({
  array,
  options,
  expanded,
  onChange,
  onRemove,
  onExpand,
  onCollapse,
  onDuplicate,
  canRemove,
  autoFocus,
}: {
  array: IoArrayRequirement;
  options: ConfiguratorOptions | undefined;
  expanded: boolean;
  onChange: (patch: Partial<IoArrayRequirement>) => void;
  onRemove: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onDuplicate: () => void;
  canRemove: boolean;
  autoFocus?: boolean;
}) {
  const meta = options?.ioTypes.find((t) => t.ioType === array.ioType);
  const isExOrSafety = array.ioType === 'INTRINSICALLY_SAFE' || array.ioType === 'FUNCTIONAL_SAFETY';
  const isComms = array.ioType === 'COMMUNICATION';
  const isCounting = array.ioType === 'COUNTING_MOTION';
  const kind = array.ioKind || '';
  const showDigital =
    array.ioType === 'DI' ||
    array.ioType === 'DO' ||
    (isExOrSafety && (kind === 'DI' || kind === 'DO' || kind === 'RELAY'));
  const showAnalog =
    array.ioType === 'AI' || array.ioType === 'AO' || (isExOrSafety && (kind === 'AI' || kind === 'AO'));
  const signalOptions =
    isExOrSafety && kind && meta?.signalOptionsByIoKind?.[kind]?.length
      ? meta.signalOptionsByIoKind[kind]
      : meta?.signalOptions ?? [];
  const complete = arrayIsComplete(array);

  if (!expanded) {
    return (
      <div
        id={`io-array-${array.id}`}
        className="border border-gray-200 rounded-lg px-3 py-2.5 bg-white flex items-center gap-2"
      >
        <button
          type="button"
          onClick={onExpand}
          className="flex-1 min-w-0 text-left text-sm text-gray-800 hover:text-gray-950"
          title="Edit array"
        >
          <span className="font-medium truncate block">{formatArraySummary(array, options)}</span>
        </button>
        <button
          type="button"
          onClick={onExpand}
          className="p-2 text-gray-400 hover:text-blue-600 shrink-0"
          title="Edit array"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="p-2 text-gray-400 hover:text-blue-600 shrink-0"
          title="Duplicate array"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400 shrink-0"
          title="Remove array"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      id={`io-array-${array.id}`}
      className="border border-blue-200 rounded-lg p-3 space-y-3 bg-gray-50/50 ring-1 ring-blue-100"
    >
      <div className="flex items-start gap-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select
              data-array-autofocus={autoFocus ? 'true' : undefined}
              className="input w-full text-sm"
              value={array.ioType}
              onChange={(e) =>
                onChange({
                  ioType: e.target.value as IoType,
                  signal: '',
                  ioKind: '',
                  functionClass: '',
                  commInterface: '',
                  switchingType: '',
                  wiringPoints: '',
                  analogWiring: '',
                })
              }
            >
              {options?.ioTypes.map((t) => (
                <option key={t.ioType} value={t.ioType}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {isExOrSafety && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">I/O kind</label>
              <select
                className="input w-full text-sm"
                value={array.ioKind ?? ''}
                onChange={(e) => onChange({ ioKind: e.target.value, signal: '' })}
              >
                <option value="">— Select —</option>
                {(meta?.ioKindOptions ?? []).map((k) => (
                  <option key={k} value={k}>
                    {IO_KIND_LABELS[k] ?? k}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isCounting && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Function</label>
              <select
                className="input w-full text-sm"
                value={array.functionClass ?? ''}
                onChange={(e) => onChange({ functionClass: e.target.value, signal: '' })}
              >
                <option value="">— Select —</option>
                {(meta?.functionClassOptions ?? []).map((fc) => (
                  <option key={fc} value={fc}>
                    {FUNCTION_CLASS_LABELS[fc] ?? fc}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isComms && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Interface</label>
              <select
                className="input w-full text-sm"
                value={array.commInterface ?? ''}
                onChange={(e) => onChange({ commInterface: e.target.value, signal: e.target.value })}
              >
                <option value="">— Select —</option>
                {(meta?.commInterfaceOptions ?? []).map((iface) => (
                  <option key={iface} value={iface}>
                    {iface}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!isComms && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isCounting ? 'Interface / signal (optional)' : 'Signal / range'}
              </label>
              <select
                className="input w-full text-sm"
                value={array.signal}
                onChange={(e) => onChange({ signal: e.target.value })}
                disabled={isExOrSafety && !array.ioKind}
              >
                <option value="">{isCounting ? '— Any —' : '— Select —'}</option>
                {signalOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              className="input w-full text-sm"
              value={array.quantity || ''}
              onChange={(e) => onChange({ quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Spare % (min–max)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={200}
                className="input w-full text-sm"
                value={array.sparePercentMin}
                onChange={(e) => onChange({ sparePercentMin: Number(e.target.value) || 0 })}
              />
              <span className="text-gray-400 text-xs">–</span>
              <input
                type="number"
                min={0}
                max={200}
                className="input w-full text-sm"
                value={array.sparePercentMax}
                onChange={(e) => onChange({ sparePercentMax: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col shrink-0">
          {complete && (
            <button
              type="button"
              onClick={onCollapse}
              className="p-2 text-gray-400 hover:text-blue-600"
              title="Collapse array"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onDuplicate}
            className="p-2 text-gray-400 hover:text-blue-600"
            title="Duplicate array"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400"
            title="Remove array"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {(showDigital || showAnalog || (!isComms && !isCounting)) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {showDigital && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sinking / sourcing</label>
              <select
                className="input w-full text-sm"
                value={array.switchingType ?? ''}
                onChange={(e) => onChange({ switchingType: e.target.value as IoArrayRequirement['switchingType'] })}
              >
                <option value="">No preference</option>
                <option value="SINKING">Sinking</option>
                <option value="SOURCING">Sourcing</option>
              </select>
            </div>
          )}
          {(showDigital || showAnalog) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Wiring points</label>
              <select
                className="input w-full text-sm"
                value={array.wiringPoints ?? ''}
                onChange={(e) => onChange({ wiringPoints: e.target.value ? Number(e.target.value) : '' })}
              >
                <option value="">No preference</option>
                <option value="1">1-wire</option>
                <option value="2">2-wire</option>
                <option value="3">3-wire</option>
                <option value="4">4-wire</option>
              </select>
            </div>
          )}
          {showAnalog && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Analog wiring</label>
              <select
                className="input w-full text-sm"
                value={array.analogWiring ?? ''}
                onChange={(e) => onChange({ analogWiring: e.target.value as IoArrayRequirement['analogWiring'] })}
              >
                <option value="">No preference</option>
                <option value="SINGLE_ENDED">Single-ended</option>
                <option value="DIFFERENTIAL">Differential</option>
              </select>
            </div>
          )}
          {!isComms && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Housing / wiring style</label>
              <select
                className="input w-full text-sm"
                value={array.wiringStyle ?? ''}
                onChange={(e) => onChange({ wiringStyle: e.target.value as IoArrayRequirement['wiringStyle'] })}
              >
                <option value="">Fixed (750/751)</option>
                <option value="PLUGGABLE">Pluggable wire harness (753)</option>
              </select>
            </div>
          )}
        </div>
      )}

      {complete && (
        <div className="flex justify-end">
          <button type="button" onClick={onCollapse} className="btn btn-secondary btn-sm flex items-center gap-1.5">
            <ChevronUp className="w-3.5 h-3.5" />
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Node result panel ───────────────────────────────────────────────────────

function NodeResultPanel({ result }: { result: ConfiguratorResult }) {
  const isInvalid = result.validity === 'INVALID';
  const autofixSlices = (result.railReport?.slices ?? []).filter((s) => s.autofixReason);

  return (
    <div className="space-y-4">
      {isInvalid ? (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 space-y-1.5">
          <p className="font-semibold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            BOM is invalid — export disabled until hard rules are resolved
          </p>
          <ul className="list-disc pl-5 text-xs space-y-0.5">
            {(result.blockingErrors ?? []).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      ) : result.validity === 'VALID' ? (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>BOM is physically valid after autofix</span>
          {result.railReport?.autofixCount ? (
            <span className="text-emerald-700">
              ({result.railReport.autofixCount} autofix insert{result.railReport.autofixCount === 1 ? '' : 's'})
            </span>
          ) : null}
        </div>
      ) : null}

      {result.spaceWarning && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {result.spaceWarning}
        </div>
      )}

      {autofixSlices.length > 0 && (
        <div className="border border-amber-200 bg-amber-50/50 rounded-lg px-3 py-2 space-y-1">
          <p className="text-xs font-semibold text-amber-900">Autofix rail inserts</p>
          <ul className="text-xs text-amber-800 space-y-0.5">
            {autofixSlices.map((s, i) => (
              <li key={`${s.partNumber}-${i}`}>
                <span className="font-mono">{s.partNumber}</span>
                {s.terminatingResistor ? ' (terminating resistor ON)' : ''} — {s.autofixReason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.arrayReports.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Layers className="w-4 h-4" /> I/O Array Spare Capacity
          </h3>
          <div className="space-y-1.5">
            {result.arrayReports.map((r) => (
              <div key={r.arrayId} className="flex flex-wrap items-center gap-2 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2">
                <SpareStatusBadge status={r.status} />
                <span className="font-medium text-gray-800">
                  {roleLabel(r.ioType)} · {r.signal}
                </span>
                <span className="text-gray-500">
                  requested {r.requestedQuantity} → selected {r.selectedChannels} ch ({r.sparePercent}% spare, target {r.sparePercentMin}-
                  {r.sparePercentMax}%)
                </span>
                {r.note && <span className="text-gray-400 italic">{r.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="border border-gray-200 rounded-lg px-3 py-2">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-1">
            <Zap className="w-3.5 h-3.5" /> 5V Backplane Power
          </p>
          {result.power.capacityMa != null ? (
            <p className="text-xs text-gray-600">
              {result.power.totalDrawMa} mA drawn / {result.power.capacityMa} mA capacity ·{' '}
              <span className={result.power.headroomPercent != null && result.power.headroomPercent < 20 ? 'text-amber-600 font-medium' : ''}>
                {result.power.headroomPercent}% headroom
              </span>
              {result.power.autoInsertedSupplyCount > 0 && (
                <span className="block text-amber-600 mt-0.5">+{result.power.autoInsertedSupplyCount}× 750-613 auto-inserted</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-gray-400 italic">Not verified — missing supply rating.</p>
          )}
        </div>
        <div className="border border-gray-200 rounded-lg px-3 py-2">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-1">
            <Ruler className="w-3.5 h-3.5" /> DIN Rail Width
          </p>
          <p className="text-xs text-gray-600">
            {result.totalModuleWidthMm.toFixed(1)} mm{result.maxDinRailWidthMm ? ` / max ${result.maxDinRailWidthMm} mm` : ''}
          </p>
          {result.fieldPowerBus.autoInsertedBusCount > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              +{result.fieldPowerBus.autoInsertedBusCount}× field power bus module(s) inserted (
              {result.fieldPowerBus.potentialGroups ?? result.fieldPowerBus.segments} potential group
              {(result.fieldPowerBus.potentialGroups ?? result.fieldPowerBus.segments) === 1 ? '' : 's'}
              {result.fieldPowerBus.extensionStages
                ? `, ${result.fieldPowerBus.extensionStages} extension stage${result.fieldPowerBus.extensionStages === 1 ? '' : 's'}`
                : ''}
              )
            </p>
          )}
        </div>
        {result.wiringArms.totalArmsInserted > 0 && (
          <div className="border border-gray-200 rounded-lg px-3 py-2">
            <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-1">
              <Layers className="w-3.5 h-3.5" /> Pluggable Wiring
            </p>
            <p className="text-xs text-gray-600">
              +{result.wiringArms.totalArmsInserted}× 753-110 wiring arm(s) across {result.wiringArms.arraysUsingPluggable} array
              {result.wiringArms.arraysUsingPluggable === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </div>

      {(result.headUnitProtocols.additional.length > 0 || result.headUnitProtocols.premiumAddOns.length > 0) && (
        <div className="border border-gray-200 rounded-lg px-3 py-2.5 space-y-1.5">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" /> Controller Protocols
          </p>
          {result.headUnitProtocols.additional.length > 0 && (
            <p className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Also included (no extra charge):</span> {result.headUnitProtocols.additional.join(', ')}
            </p>
          )}
          {result.headUnitProtocols.premiumAddOns.length > 0 && (
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Optional add-ons available:</span>
              <ul className="mt-1 space-y-0.5">
                {result.headUnitProtocols.premiumAddOns.map((a) => (
                  <li key={a.protocol} className="flex flex-wrap items-center gap-1.5">
                    <span>{a.label}</span>
                    {a.partNumber && <span className="font-mono text-gray-400">({a.partNumber})</span>}
                    <span className="text-gray-400">{a.cost != null ? `+${formatMoney(a.cost)}` : 'contact WAGO for pricing'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {result.notes.length > 0 && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 space-y-1">
          {result.notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Part #</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Description</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Role</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700">Qty</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700">Ext. Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {result.lines.map((line, idx) => (
              <tr key={`${line.partNumber}-${idx}`} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                  {line.partNumber}
                  {!line.inCatalog && (
                    <span className="ml-1 text-[10px] uppercase text-amber-600 font-semibold" title="Not yet in MASTER catalog">
                      pending import
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{line.description}</td>
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{roleLabel(line.role)}</td>
                <td className="px-4 py-2.5 text-right">{line.quantity}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {formatMoney(line.basePrice != null ? line.basePrice * line.quantity : null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <p className="text-base font-semibold text-gray-900">
          Estimated subtotal: {result.estimatedSubtotal != null ? formatMoney(result.estimatedSubtotal) : 'Contact WAGO for pricing'}
        </p>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function IoSystemConfigurator() {
  const { isGuest: guest } = useAuth();
  const initial = useMemo(() => initialProjectState(), []);
  const [nodes, setNodes] = useState<ProjectNode[]>(initial.nodes);
  const [activeNodeId, setActiveNodeId] = useState<string>(initial.activeNodeId);
  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null);
  const [projectPdfLoading, setProjectPdfLoading] = useState(false);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [alternativesData, setAlternativesData] = useState<BomAlternativesResponse | null>(null);
  const [alternativesNodeId, setAlternativesNodeId] = useState<string | null>(null);
  const [applyingAlternativeId, setApplyingAlternativeId] = useState<BomAlternativeId | null>(null);
  const [undoByNodeId, setUndoByNodeId] = useState<Record<string, NodeUndoSnapshot | null>>({});
  const [expandedArrayId, setExpandedArrayId] = useState<string | null>(null);
  const [focusArrayId, setFocusArrayId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initial.restoredFrom === 'local' ? new Date().toISOString() : null
  );
  const skipNextPersist = useRef(false);
  const restoredToastShown = useRef(false);

  const { data: options, isLoading: optionsLoading } = useQuery({
    queryKey: ['io-configurator-options'],
    queryFn: async () => {
      const { data } = await ioConfiguratorApi.getOptions();
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    if (restoredToastShown.current) return;
    restoredToastShown.current = true;
    if (initial.restoredFrom === 'share') {
      toast.success('Shared project loaded — generate BOMs to refresh results.');
      // Keep the share hash so the link remains copyable; still mirror into localStorage below.
    } else if (initial.restoredFrom === 'local') {
      toast.success('Restored your saved configurator project.', { duration: 3500 });
    }
  }, [initial.restoredFrom]);

  // Autosave project (requirements + results) so refresh does not wipe work.
  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      saveToLocalStorage(nodes, activeNodeId);
      setLastSavedAt(new Date().toISOString());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [nodes, activeNodeId]);

  const clearUndoForNode = (nodeId: string) => {
    setUndoByNodeId((prev) => {
      if (!prev[nodeId]) return prev;
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
  };

  const activeNode = nodes.find((n) => n.id === activeNodeId) ?? nodes[0];
  const activeUndo = undoByNodeId[activeNode?.id ?? ''] ?? null;

  // Incomplete arrays stay expanded; complete ones collapse unless actively editing.
  useEffect(() => {
    if (!activeNode) return;
    const arrays = activeNode.requirements.ioArrays;
    const incomplete = arrays.filter((a) => !arrayIsComplete(a));
    if (incomplete.length > 0) {
      setExpandedArrayId((prev) => (prev && incomplete.some((a) => a.id === prev) ? prev : incomplete[incomplete.length - 1].id));
      return;
    }
    setExpandedArrayId((prev) => (prev && arrays.some((a) => a.id === prev) ? prev : null));
  }, [activeNodeId]); // eslint-disable-line react-hooks/exhaustive-deps -- only re-sync when switching nodes

  useEffect(() => {
    if (!focusArrayId) return;
    const id = focusArrayId;
    const frame = window.requestAnimationFrame(() => {
      const root = document.getElementById(`io-array-${id}`);
      root?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const focusEl = root?.querySelector('[data-array-autofocus="true"]') as HTMLElement | null;
      focusEl?.focus();
      setFocusArrayId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusArrayId, nodes]);

  const updateNode = (id: string, patch: Partial<ProjectNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const updateRequirements = (id: string, patch: Partial<ConfiguratorRequirements>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, requirements: { ...n.requirements, ...patch } } : n)));
  };

  const updateArray = (nodeId: string, arrayId: string, patch: Partial<IoArrayRequirement>) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              requirements: {
                ...n.requirements,
                ioArrays: n.requirements.ioArrays.map((a) => (a.id === arrayId ? { ...a, ...patch } : a)),
              },
            }
          : n
      )
    );
  };

  const addArray = (nodeId: string) => {
    const newArray = createEmptyArray();
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, requirements: { ...n.requirements, ioArrays: [...n.requirements.ioArrays, newArray] } }
          : n
      )
    );
    setExpandedArrayId(newArray.id);
    setFocusArrayId(newArray.id);
  };

  const duplicateArray = (nodeId: string, arrayId: string) => {
    const sourceNode = nodes.find((n) => n.id === nodeId);
    const source = sourceNode?.requirements.ioArrays.find((a) => a.id === arrayId);
    if (!source) return;
    const clone: IoArrayRequirement = { ...source, id: nextId('array') };
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        const idx = n.requirements.ioArrays.findIndex((a) => a.id === arrayId);
        const nextArrays = [...n.requirements.ioArrays];
        nextArrays.splice(idx + 1, 0, clone);
        return { ...n, requirements: { ...n.requirements, ioArrays: nextArrays } };
      })
    );
    setExpandedArrayId(clone.id);
    setFocusArrayId(clone.id);
  };

  const removeArray = (nodeId: string, arrayId: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, requirements: { ...n.requirements, ioArrays: n.requirements.ioArrays.filter((a) => a.id !== arrayId) } }
          : n
      )
    );
    setExpandedArrayId((prev) => (prev === arrayId ? null : prev));
  };

  const addNode = () => {
    const node = createNode(`Node ${nodes.length + 1}`);
    setNodes((prev) => [...prev, node]);
    setActiveNodeId(node.id);
  };

  const duplicateNode = (id: string) => {
    const source = nodes.find((n) => n.id === id);
    if (!source) return;
    const clone: ProjectNode = {
      ...source,
      id: nextId('node'),
      label: `${source.label} (copy)`,
      requirements: {
        ...source.requirements,
        ioArrays: source.requirements.ioArrays.map((a) => ({ ...a, id: nextId('array') })),
      },
      result: null,
      validationErrors: [],
    };
    setNodes((prev) => [...prev, clone]);
    setActiveNodeId(clone.id);
  };

  const removeNode = (id: string) => {
    if (nodes.length <= 1) return;
    clearUndoForNode(id);
    setNodes((prev) => {
      const filtered = prev.filter((n) => n.id !== id);
      if (activeNodeId === id) setActiveNodeId(filtered[0].id);
      return filtered;
    });
  };

  const handleGenerateNode = async (node: ProjectNode) => {
    const errors = validateClientSide(node.requirements);
    if (errors.length > 0) {
      updateNode(node.id, { validationErrors: errors, result: null });
      return;
    }
    setGeneratingNodeId(node.id);
    setAlternativesData(null);
    setAlternativesNodeId(null);
    clearUndoForNode(node.id);
    try {
      const { data } = await ioConfiguratorApi.generate(node.requirements);
      updateNode(node.id, { result: data, validationErrors: [] });
      toast.success(`${node.label}: BOM generated`);
    } catch (error: unknown) {
      const errs = (error as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors ?? ['Failed to generate BOM'];
      updateNode(node.id, { validationErrors: errs, result: null });
    } finally {
      setGeneratingNodeId(null);
    }
  };

  const handleSeeOptions = async (node: ProjectNode) => {
    if (!node.result) return;
    setAlternativesLoading(true);
    setAlternativesNodeId(node.id);
    try {
      const { data } = await ioConfiguratorApi.getAlternatives(node.requirements);
      setAlternativesData(data);
    } catch (error: unknown) {
      const errs = (error as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors;
      toast.error(errs?.[0] ?? 'Failed to load BOM options');
      setAlternativesData(null);
      setAlternativesNodeId(null);
    } finally {
      setAlternativesLoading(false);
    }
  };

  const handleApplyAlternative = async (node: ProjectNode, alt: BomAlternative) => {
    if (!alt.result || !node.result) return;
    setApplyingAlternativeId(alt.id);

    // Snapshot current BOM/requirements so Apply is reversible.
    setUndoByNodeId((prev) => ({
      ...prev,
      [node.id]: {
        requirements: node.requirements,
        result: node.result!,
        alternativeLabel: alt.label,
      },
    }));

    try {
      if (isRequirementChangingAlternative(alt.id)) {
        const nextReq = requirementsForAlternativeApply(node.requirements, alt.id);
        if (!nextReq) {
          toast.error('Could not apply this option — requirement change unavailable.');
          clearUndoForNode(node.id);
          return;
        }
        updateRequirements(node.id, nextReq);
        const { data } = await ioConfiguratorApi.generate(nextReq);
        updateNode(node.id, { result: data, validationErrors: [] });
        toast.success(`Applied: ${alt.label} — Undo available`);
      } else {
        updateNode(node.id, { result: alt.result });
        toast.success(`Applied: ${alt.label} — Undo available`);
      }
      setAlternativesData(null);
      setAlternativesNodeId(null);
    } catch {
      clearUndoForNode(node.id);
      toast.error('Failed to apply option');
    } finally {
      setApplyingAlternativeId(null);
    }
  };

  const handleUndoAlternative = (node: ProjectNode) => {
    const snapshot = undoByNodeId[node.id];
    if (!snapshot) return;
    updateNode(node.id, {
      requirements: snapshot.requirements,
      result: snapshot.result,
      validationErrors: [],
    });
    clearUndoForNode(node.id);
    setAlternativesData(null);
    setAlternativesNodeId(null);
    toast.success(`Reverted “${snapshot.alternativeLabel}”`);
  };

  const handleResetNode = (node: ProjectNode) => {
    clearUndoForNode(node.id);
    updateNode(node.id, { requirements: createEmptyRequirements(), result: null, validationErrors: [] });
  };

  const handleStartFresh = () => {
    if (
      !window.confirm(
        'Start a new blank project? Your current nodes and BOMs will be cleared from this browser.'
      )
    ) {
      return;
    }
    skipNextPersist.current = true;
    clearLocalStorageProject();
    if (window.location.hash.startsWith(SHARE_HASH_PREFIX)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    const node = createNode('Node 1');
    setNodes([node]);
    setActiveNodeId(node.id);
    setUndoByNodeId({});
    setAlternativesData(null);
    setAlternativesNodeId(null);
    setLastSavedAt(null);
    // Persist the blank project on the next tick so refresh stays blank.
    window.setTimeout(() => saveToLocalStorage([node], node.id), 0);
    toast.success('Started a new project');
  };

  const handleCopyShareLink = async () => {
    const hash = encodeShareHash(nodes, activeNodeId);
    if (!hash) {
      toast.error('Project is too large to share via link. Export CSV/PDF instead, or simplify nodes.');
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      window.history.replaceState(null, '', hash);
      toast.success('Share link copied — recipients get your requirements (they regenerate BOMs).');
    } catch {
      toast.error('Could not copy link — try copying the address bar after Share updates the URL.');
      window.history.replaceState(null, '', hash);
    }
  };

  // Combined project BOM (client-side), based on whatever nodes currently have a generated result.
  const generatedNodes = nodes.filter((n) => n.result);
  const anyInvalidBom = generatedNodes.some((n) => n.result?.validity === 'INVALID');
  const activeNodeInvalid = activeNode?.result?.validity === 'INVALID';
  const combinedLines = useMemo(() => {
    const combined = new Map<string, BomLine & { quantity: number }>();
    for (const node of generatedNodes) {
      if (!node.result) continue;
      for (const line of node.result.lines) {
        const key = line.partNumber.toUpperCase();
        const existing = combined.get(key);
        if (existing) {
          existing.quantity += line.quantity * node.quantity;
        } else {
          combined.set(key, { ...line, quantity: line.quantity * node.quantity });
        }
      }
    }
    return [...combined.values()].sort((a, b) => a.partNumber.localeCompare(b.partNumber));
  }, [generatedNodes]);

  const combinedHasUnpriced = combinedLines.some((l) => l.basePrice == null);
  const combinedSubtotal = combinedHasUnpriced ? null : combinedLines.reduce((sum, l) => sum + (l.basePrice ?? 0) * l.quantity, 0);

  const handleExportCombinedCsv = () => {
    if (combinedLines.length === 0) return;
    if (anyInvalidBom) {
      toast.error('Cannot export — one or more nodes have an invalid BOM. Resolve blocking errors first.');
      return;
    }
    const rows = combinedLines.map((l) => ({
      partNumber: l.partNumber,
      description: l.description,
      role: roleLabel(l.role),
      quantity: l.quantity,
      unitPrice: l.basePrice ?? '',
      extendedPrice: l.basePrice != null ? (l.basePrice * l.quantity).toFixed(2) : '',
      inCatalog: l.inCatalog ? 'Y' : 'N',
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wago-750-io-system-project-bom.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadProjectPdf = async () => {
    if (anyInvalidBom) {
      toast.error('Cannot export — one or more nodes have an invalid BOM. Resolve blocking errors first.');
      return;
    }
    setProjectPdfLoading(true);
    try {
      const response = await ioConfiguratorApi.downloadProjectPdf(
        nodes.map((n) => ({ label: n.label, quantity: n.quantity, requirements: n.requirements }))
      );
      const blob = new Blob([response.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wago-750-io-system-project-bom.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      const errs = (error as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors;
      toast.error(errs?.[0] ?? 'Failed to generate project PDF');
    } finally {
      setProjectPdfLoading(false);
    }
  };

  const handleDownloadNodePdf = async (node: ProjectNode) => {
    if (node.result?.validity === 'INVALID') {
      toast.error('Cannot export — this node BOM is invalid. Resolve blocking errors first.');
      return;
    }
    try {
      const response = await ioConfiguratorApi.downloadPdf(node.requirements);
      const blob = new Blob([response.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wago-750-io-system-bom-${node.label.toLowerCase().replace(/\s+/g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <div className="container-custom py-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Cpu className="w-6 h-6 text-wago-primary" />
            750/751/753 I/O System Configurator
          </h1>
          <p className="text-gray-600 max-w-3xl">
            Build one or more head-unit + I/O "nodes", describe your I/O arrays, space and power constraints, and generate a
            starting bill of materials from the WAGO-I/O-SYSTEM 750/751/753 catalog. No sign-in required.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="btn btn-secondary flex items-center gap-2"
            title="Copy a link with your node requirements (BOMs regenerate on open)"
          >
            <Link2 className="w-4 h-4" />
            Share link
          </button>
          <button
            type="button"
            onClick={handleStartFresh}
            className="btn btn-secondary flex items-center gap-2"
            title="Clear saved project and start blank"
          >
            <RotateCcw className="w-4 h-4" />
            Start fresh
          </button>
          <button
            type="button"
            onClick={handleExportCombinedCsv}
            disabled={combinedLines.length === 0 || anyInvalidBom}
            className="btn btn-secondary flex items-center gap-2"
            title={
              anyInvalidBom
                ? 'Export disabled — resolve invalid BOM blocking errors first'
                : 'Export combined BOM for all generated nodes'
            }
          >
            <Download className="w-4 h-4" />
            Export Combined CSV
          </button>
          <button
            type="button"
            onClick={handleDownloadProjectPdf}
            disabled={projectPdfLoading || generatedNodes.length === 0 || anyInvalidBom}
            className="btn btn-primary flex items-center gap-2"
            title={
              anyInvalidBom
                ? 'Export disabled — resolve invalid BOM blocking errors first'
                : 'Generate a combined project PDF for all nodes'
            }
          >
            {projectPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Download Project PDF
          </button>
        </div>
      </div>
      {lastSavedAt && (
        <p className="text-xs text-gray-400 mb-4">
          Autosaved in this browser · last saved {new Date(lastSavedAt).toLocaleTimeString()}
        </p>
      )}

      {guest && (
        <div className="mb-6 p-4 rounded-lg bg-wago-primary/5 border border-wago-primary/20 flex flex-wrap items-center justify-between gap-4">
          <p className="text-wago-secondary text-sm">
            Guest mode — this project autosaves in your browser only. Sign in if you want an RSM Tools account.
          </p>
          <Link to="/register" className="btn-primary flex items-center gap-2 shrink-0">
            <UserPlus className="w-4 h-4" />
            Register
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Node list sidebar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Nodes</h2>
            <button type="button" onClick={addNode} className="p-1.5 text-wago-primary hover:bg-wago-primary/10 rounded-md" title="Add node">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {nodes.map((node) => (
            <div
              key={node.id}
              onClick={() => setActiveNodeId(node.id)}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                node.id === activeNodeId ? 'border-wago-primary bg-wago-primary/5' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <input
                  className="font-medium text-sm text-gray-900 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-wago-primary rounded px-1 -mx-1 w-full"
                  value={node.label}
                  onFocus={() => setActiveNodeId(node.id)}
                  onChange={(e) => updateNode(node.id, { label: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-1 text-xs text-gray-500" onClick={(e) => e.stopPropagation()}>
                  Qty
                  <input
                    type="number"
                    min={1}
                    className="input w-14 text-xs py-0.5"
                    value={node.quantity}
                    onChange={(e) => updateNode(node.id, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                  />
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateNode(node.id);
                    }}
                    className="p-1 text-gray-400 hover:text-wago-primary"
                    title="Duplicate node"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNode(node.id);
                    }}
                    disabled={nodes.length <= 1}
                    className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400"
                    title="Remove node"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {node.result && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {node.result.lines.length} lines · {formatMoney(node.result.estimatedSubtotal)}
                </p>
              )}
            </div>
          ))}

          {generatedNodes.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-xs font-semibold text-gray-700 mb-1">Combined Project</p>
              <p className="text-xs text-gray-500">{generatedNodes.length} of {nodes.length} node(s) generated</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{combinedSubtotal != null ? formatMoney(combinedSubtotal) : 'Pricing TBD'}</p>
            </div>
          )}
        </div>

        {/* Active node editor + results */}
        {activeNode && (
          <div className="space-y-6">
            <div className="card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{activeNode.label} — Requirements</h2>
                <button type="button" onClick={() => handleResetNode(activeNode)} className="btn btn-secondary btn-sm flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset Node
                </button>
              </div>

              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Head Unit</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">I/O placement</label>
                    <select
                      className="input w-full"
                      value={activeNode.requirements.ioPlacement}
                      onChange={(e) =>
                        updateRequirements(activeNode.id, {
                          ioPlacement: e.target.value as ConfiguratorRequirements['ioPlacement'],
                          // Featured protocol options differ between couplers (REMOTE) and controllers
                          // (LOCAL) — clear any prior selection so it can't carry over as an invalid value.
                          protocol: '',
                        })
                      }
                      disabled={optionsLoading}
                    >
                      <option value="">— Select —</option>
                      {options?.ioPlacements.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Protocol</label>
                    <select
                      className="input w-full"
                      value={activeNode.requirements.protocol}
                      onChange={(e) => updateRequirements(activeNode.id, { protocol: e.target.value as ConfiguratorRequirements['protocol'] })}
                      disabled={optionsLoading || !activeNode.requirements.ioPlacement}
                    >
                      <option value="">— Select —</option>
                      {(activeNode.requirements.ioPlacement === 'LOCAL' ? options?.controllerProtocols : options?.protocols)?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Optimize for</label>
                    <select
                      className="input w-full"
                      value={activeNode.requirements.optimizeFor}
                      onChange={(e) =>
                        updateRequirements(activeNode.id, {
                          optimizeFor: e.target.value as ConfiguratorRequirements['optimizeFor'],
                        })
                      }
                      disabled={optionsLoading}
                    >
                      <option value="">— Select —</option>
                      {options?.optimizeForOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Drives head-unit selection (High / Standard / Low Cost).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max DIN rail width (mm) <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      placeholder="No limit"
                      className="input w-full"
                      value={activeNode.requirements.maxDinRailWidthMm ?? ''}
                      onChange={(e) =>
                        updateRequirements(activeNode.id, {
                          maxDinRailWidthMm: e.target.value ? Math.max(0, Number(e.target.value)) : null,
                        })
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Constrains I/O module packing; may swap to a narrower head only if still over limit after packing.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                  <Thermometer className="w-4 h-4" /> Operating Temperature
                </h3>
                <select
                  className="input w-full sm:w-1/2"
                  value={activeNode.requirements.temperatureRange}
                  onChange={(e) =>
                    updateRequirements(activeNode.id, { temperatureRange: e.target.value as ConfiguratorRequirements['temperatureRange'] })
                  }
                >
                  {options?.temperatureRanges.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> Average Output Loading
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Used to estimate field power bus (10A jumper contact) consumption for digital output modules. Defaults to 50% of rated
                  output current per channel.
                </p>
                <div className="flex items-center gap-3 sm:w-1/2">
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    className="flex-1"
                    value={activeNode.requirements.averageOutputLoadingPercent}
                    onChange={(e) => updateRequirements(activeNode.id, { averageOutputLoadingPercent: Number(e.target.value) })}
                  />
                  <span className="text-sm font-medium text-gray-700 w-12 text-right">
                    {activeNode.requirements.averageOutputLoadingPercent}%
                  </span>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4" /> I/O Arrays
                  </h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Build independent groups of I/O — e.g. 8 inputs of 24VDC 2-wire sinking, plus 14 inputs of 120VAC 3-wire.
                  Completed arrays collapse into a summary; click one to edit again.
                </p>
                <div className="space-y-3">
                  {activeNode.requirements.ioArrays.map((array) => {
                    const expanded = !arrayIsComplete(array) || expandedArrayId === array.id;
                    return (
                      <ArrayRowEditor
                        key={array.id}
                        array={array}
                        options={options}
                        expanded={expanded}
                        autoFocus={focusArrayId === array.id}
                        onChange={(patch) => {
                          updateArray(activeNode.id, array.id, patch);
                          setExpandedArrayId(array.id);
                        }}
                        onRemove={() => removeArray(activeNode.id, array.id)}
                        onExpand={() => setExpandedArrayId(array.id)}
                        onCollapse={() => setExpandedArrayId(null)}
                        onDuplicate={() => duplicateArray(activeNode.id, array.id)}
                        canRemove={activeNode.requirements.ioArrays.length > 1}
                      />
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => addArray(activeNode.id)}
                  className="btn btn-secondary w-full mt-3 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Add Array
                </button>
              </section>

              {activeNode.validationErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {activeNode.validationErrors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleGenerateNode(activeNode)}
                  disabled={generatingNodeId === activeNode.id}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {generatingNodeId === activeNode.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
                  {generatingNodeId === activeNode.id ? 'Generating BOM…' : 'Generate BOM'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadNodePdf(activeNode)}
                  disabled={!activeNode.result || activeNodeInvalid}
                  className="btn btn-secondary flex items-center gap-2"
                  title={activeNodeInvalid ? 'Export disabled — resolve blocking errors first' : undefined}
                >
                  <FileText className="w-4 h-4" />
                  Download Node PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleSeeOptions(activeNode)}
                  disabled={!activeNode.result || alternativesLoading}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  {alternativesLoading && alternativesNodeId === activeNode.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  See Options
                </button>
                {activeUndo && (
                  <button
                    type="button"
                    onClick={() => handleUndoAlternative(activeNode)}
                    className="btn btn-secondary flex items-center gap-2 border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
                    title={`Undo applied option: ${activeUndo.alternativeLabel}`}
                  >
                    <Undo2 className="w-4 h-4" />
                    Undo “{activeUndo.alternativeLabel}”
                  </button>
                )}
              </div>

              {alternativesData && alternativesNodeId === activeNode.id && (
                <BomOptionsPanel
                  data={alternativesData}
                  onClose={() => {
                    setAlternativesData(null);
                    setAlternativesNodeId(null);
                  }}
                  onApply={(alt) => handleApplyAlternative(activeNode, alt)}
                  applyingId={applyingAlternativeId}
                />
              )}
            </div>

            {/* Results */}
            <div className="card overflow-hidden p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Bill of Materials — {activeNode.label}</h2>
                {activeUndo && (
                  <button
                    type="button"
                    onClick={() => handleUndoAlternative(activeNode)}
                    className="text-sm font-medium text-amber-800 hover:underline inline-flex items-center gap-1.5"
                  >
                    <Undo2 className="w-4 h-4" />
                    Undo last option
                  </button>
                )}
              </div>
              {!activeNode.result ? (
                <div className="p-12 text-center text-gray-500">
                  <Cpu className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Fill out the requirements and generate a BOM to see results here.</p>
                </div>
              ) : (
                <NodeResultPanel result={activeNode.result} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
