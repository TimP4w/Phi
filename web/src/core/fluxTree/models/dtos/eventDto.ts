export type EventDto = {
  uid: string;
  kind: string;
  name: string;
  namespace: string;
  reason: string;
  message: string;
  source: string;
  type: "Normal" | "Warning";
  firstObserved: Date;
  lastObserved: Date;
  count: number;
  resourceUID: string;
};
