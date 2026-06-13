const TYPES = {
  FluxTreeStore: Symbol.for("FluxTreeStore"),
  WebSocket: Symbol.for("WebSocket"),
  Http: Symbol.for("Http"),
  TreeService: Symbol.for("TreeService"),
  ResourceService: Symbol.for("ResourceService"),
  // Use cases
  ReconcileUseCase: Symbol.for("ReconcileUseCase"),
  SuspendUseCase: Symbol.for("SuspendUseCase"),
  ResumeUseCase: Symbol.for("ResumeUseCase"),
  WatchLogsUseCase: Symbol.for("WatchLogsUseCase"),
  DescribeNodeUseCase: Symbol.for("DescribeNodeUseCase"),
  FetchEventsUseCase: Symbol.for("FetchEventsUseCase"),
  LayoutTreeUseCase: Symbol.for("LayoutTreeUseCase"),
  HandleWsMessageUseCase: Symbol.for("HandleWsMessageUseCase"),
  WatchMetricsUseCase: Symbol.for("WatchMetricsUseCase"),
  StopWatchMetricsUseCase: Symbol.for("StopWatchMetricsUseCase"),
};

export { TYPES };
