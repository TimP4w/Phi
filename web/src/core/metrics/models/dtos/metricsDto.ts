export interface SamplePointDto {
  t: number;
  v: number;
}

export interface SpecValueDto {
  requests: number | null;
  limits: number | null;
}

export interface ResourceSpecDto {
  cpu: SpecValueDto;
  memory: SpecValueDto;
}

export interface CurrentUsageDto {
  cpu: SamplePointDto[];
  memory: SamplePointDto[];
  spec: ResourceSpecDto;
}

export interface MetricsCurrentMessageDto {
  usages: Record<string, CurrentUsageDto>;
}

export interface ResourceMetricsDto {
  range: string;
  series: Record<string, SamplePointDto[]>;
  spec: ResourceSpecDto;
}

export interface MetricsResourceMessageDto {
  uid: string;
  metrics: ResourceMetricsDto;
}

export interface NodeResourceUsageDto {
  used: number;
  capacity: number;
  percent: number;
}

export interface NodeUsageDto {
  node: string;
  cpu: NodeResourceUsageDto;
  memory: NodeResourceUsageDto;
}

export interface MetricsStatusDto {
  name: string;
  status: "active" | "unavailable" | "disabled";
}
