import { api, apiBlobPost } from './api';

/** Subset of controller featured protocols used by the public configurator options. */
export type ControllerFeaturedProtocol =
  | 'MODBUS_TCP'
  | 'MODBUS_UDP'
  | 'MODBUS_RTU'
  | 'ETHERNET_IP_ADAPTER'
  | 'ETHERNET_IP_SCANNER'
  | 'PROFINET_CONTROLLER';

export type IoPlacement = 'LOCAL' | 'REMOTE';
export type Protocol = 'PROFINET' | 'ETHERNET_IP' | 'MODBUS_TCP' | 'ETHERCAT';
export type OptimizeFor = 'HIGH_PERFORMANCE' | 'STANDARD_PERFORMANCE' | 'LOW_COST';
export type IoType =
  | 'DI'
  | 'DO'
  | 'AI'
  | 'AO'
  | 'FUNCTIONAL_SAFETY'
  | 'COMMUNICATION'
  | 'COUNTING_MOTION'
  | 'INTRINSICALLY_SAFE';
export type SwitchingType = 'SOURCING' | 'SINKING' | '';
export type AnalogWiring = 'SINGLE_ENDED' | 'DIFFERENTIAL' | '';
export type TemperatureRange = 'STANDARD' | 'EXTENDED' | 'EXTREME';
export type WiringStyle = 'FIXED' | 'PLUGGABLE' | '';

export interface IoArrayRequirement {
  id: string;
  ioType: IoType;
  signal: string;
  /** Ex i / Functional safety: DI | DO | AI | AO | RELAY */
  ioKind?: string | '';
  /** Counting & motion function class */
  functionClass?: string | '';
  /** Communication interface/protocol */
  commInterface?: string | '';
  switchingType?: SwitchingType;
  wiringPoints?: number | '';
  analogWiring?: AnalogWiring;
  /** 753-series pluggable wiring-arm housing instead of the 750/751 fixed-wired housing. Defaults to FIXED. */
  wiringStyle?: WiringStyle;
  quantity: number;
  sparePercentMin: number;
  sparePercentMax: number;
}

export interface ConfiguratorRequirements {
  ioPlacement: IoPlacement | '';
  protocol: Protocol | ControllerFeaturedProtocol | '';
  optimizeFor: OptimizeFor | '';
  ioArrays: IoArrayRequirement[];
  maxDinRailWidthMm: number | null;
  temperatureRange: TemperatureRange;
  averageOutputLoadingPercent: number;
}

export interface ConfiguratorOptions {
  ioPlacements: { value: IoPlacement; label: string }[];
  protocols: { value: Protocol; label: string }[];
  controllerProtocols: { value: ControllerFeaturedProtocol; label: string }[];
  optimizeForOptions: { value: OptimizeFor; label: string }[];
  temperatureRanges: { value: TemperatureRange; label: string }[];
  wiringStyles: { value: WiringStyle; label: string }[];
  ioTypes: {
    ioType: IoType;
    label: string;
    signalOptions: string[];
    ioKindOptions?: string[];
    functionClassOptions?: string[];
    commInterfaceOptions?: string[];
    signalOptionsByIoKind?: Record<string, string[]>;
  }[];
}

export interface BomLine {
  partNumber: string;
  description: string;
  quantity: number;
  role: 'HEAD_UNIT' | 'END_MODULE' | 'SUPPLY' | 'PROTOCOL_ADDON' | 'FIELD_POWER_BUS' | 'WIRING_ARM' | IoType;
  widthMm: number | null;
  arrayId?: string;
  catalogPartId: string | null;
  basePrice: number | null;
  thumbnailUrl: string | null;
  inCatalog: boolean;
}

export interface ArraySpareReport {
  arrayId: string;
  ioType: IoType;
  signal: string;
  requestedQuantity: number;
  selectedChannels: number;
  sparePercent: number;
  sparePercentMin: number;
  sparePercentMax: number;
  status: 'GREEN' | 'YELLOW' | 'RED';
  note?: string;
}

export interface PowerBudgetReport {
  totalDrawMa: number;
  capacityMa: number | null;
  headroomPercent: number | null;
  autoInsertedSupplyCount: number;
}

export interface FieldPowerBusReport {
  segments: number;
  autoInsertedBusCount: number;
  averageOutputLoadingPercent: number;
  potentialGroups?: number;
  extensionStages?: number;
}

export interface WiringArmReport {
  totalArmsInserted: number;
  arraysUsingPluggable: number;
}

export interface PremiumProtocolAddOn {
  protocol: string;
  label: string;
  partNumber: string | null;
  cost: number | null;
}

/** Informational only — Additional/Premium never drive head-unit selection or get auto-added to the BOM. */
export interface HeadUnitProtocolReport {
  featured: string[];
  additional: string[];
  premiumAddOns: PremiumProtocolAddOn[];
}

export type BomValidity = 'VALID' | 'INVALID';

export interface RailReportSlice {
  partNumber: string;
  description: string;
  role: BomLine['role'];
  autofixReason?: string;
  terminatingResistor?: boolean;
  potentialGroupId: number | null;
  stageIndex: number;
}

export interface RailReport {
  slices: RailReportSlice[];
  autofixCount: number;
  potentialGroups: number;
  extensionStages: number;
  lastCouplerTerminatingResistor: boolean;
}

export interface ConfiguratorResult {
  requirements?: ConfiguratorRequirements;
  headUnit: BomLine;
  lines: BomLine[];
  totalModuleWidthMm: number;
  maxDinRailWidthMm: number | null;
  spaceWarning: string | null;
  estimatedSubtotal: number | null;
  hasUnpricedLines: boolean;
  arrayReports: ArraySpareReport[];
  power: PowerBudgetReport;
  fieldPowerBus: FieldPowerBusReport;
  wiringArms: WiringArmReport;
  headUnitProtocols: HeadUnitProtocolReport;
  notes: string[];
  validity: BomValidity;
  blockingErrors: string[];
  railReport: RailReport;
}

export interface ConfiguratorErrorResponse {
  errors: string[];
}

export type BomAlternativeId =
  | 'lowest_cost'
  | 'fewest_skus'
  | 'more_spare'
  | 'higher_tier_head_unit'
  | 'extended_temperature';

export interface BomAlternativeDiff {
  costDelta: number | null;
  distinctSkuDelta: number;
  widthDelta: number;
  worstSpareStatus: 'GREEN' | 'YELLOW' | 'RED' | null;
  worstSpareStatusChanged: boolean;
}

export interface BomAlternative {
  id: BomAlternativeId;
  label: string;
  description: string;
  result: ConfiguratorResult | null;
  diff: BomAlternativeDiff | null;
  unavailableReason?: string;
}

export interface BomAlternativesResponse {
  requirements: ConfiguratorRequirements;
  current: ConfiguratorResult;
  alternatives: BomAlternative[];
}

export interface ProjectNodeRequest {
  label: string;
  quantity: number;
  requirements: ConfiguratorRequirements;
}

async function getData<T>(path: string): Promise<{ data: T }> {
  const data = await api<T>(path)
  return { data }
}

async function postData<T>(path: string, body: unknown): Promise<{ data: T }> {
  const data = await api<T>(path, { method: 'POST', json: body })
  return { data }
}

export const ioConfiguratorApi = {
  getOptions: () => getData<ConfiguratorOptions>('/public/io-configurator/options'),

  generate: (requirements: ConfiguratorRequirements) =>
    postData<ConfiguratorResult>('/public/io-configurator/generate', requirements),

  getAlternatives: (requirements: ConfiguratorRequirements) =>
    postData<BomAlternativesResponse>('/public/io-configurator/alternatives', requirements),

  downloadPdf: async (requirements: ConfiguratorRequirements) => {
    const data = await apiBlobPost('/public/io-configurator/pdf', requirements)
    return { data }
  },

  downloadProjectPdf: async (nodes: ProjectNodeRequest[]) => {
    const data = await apiBlobPost('/public/io-configurator/pdf-project', { nodes })
    return { data }
  },
};
