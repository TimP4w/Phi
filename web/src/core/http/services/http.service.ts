export interface HttpService {
  get<T>(path: string): Promise<T>;
  getYAML(path: string): Promise<string>;
  post<I, T>(path: string, data: I): Promise<T>;
  patch<I, T>(path: string, data: I): Promise<T>;
}
