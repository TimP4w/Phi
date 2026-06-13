import { TrivyFindings } from "../models/trivyFindings";

export interface TrivyService {
  /** Fetch the parsed findings array of one Trivy report, on demand. */
  getFindings(reportUid: string): Promise<TrivyFindings>;
}
