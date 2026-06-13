import { TrivyMetadataDto } from "../../fluxTree/models/dtos/treeDto";

// Response shape of GET /api/trivy/findings/{reportUid}. Items are passed
// through verbatim from the report object (Trivy emits different field sets per
// report type), so the modal renders defensively.
export interface TrivyFindings {
  reportType: string;
  target: TrivyMetadataDto;
  items: Record<string, unknown>[];
}
