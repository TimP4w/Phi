// Notifier is the core-layer port for surfacing user notifications. Use cases
// depend on this interface only; the concrete toast implementation lives in the
// infrastructure layer so core never imports the UI toolkit (@heroui).
export interface Notifier {
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
}
