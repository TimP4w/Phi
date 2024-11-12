export interface ResourceService {
  describe(uid: string): Promise<string>;
  reconcile(uid: string): Promise<void>;
  suspend(uid: string): Promise<void>;
  resume(uid: string): Promise<void>;
}
