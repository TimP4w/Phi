import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useDisclosure } from "@heroui/react";
import { SiTrivy } from "@icons-pack/react-simple-icons";
import WidgetCard from "./Widget";
import TrivyFindingsModal from "./TrivyFindingsModal";
import {
  SeverityCounts,
  TrivySummary,
  hasFindings,
  totalCves,
  totalOther,
} from "../../../core/trivy/trivy";

type Props = {
  summary: TrivySummary;
  title?: string;
  subtitle?: string;
};

const severityStats = (
  c: SeverityCounts,
): { label: string; value: number; color: string; severity: string }[] => [
  { label: "Critical", value: c.critical, color: "text-danger", severity: "CRITICAL" },
  { label: "High", value: c.high, color: "text-danger-400", severity: "HIGH" },
  { label: "Medium", value: c.medium, color: "text-warning", severity: "MEDIUM" },
  { label: "Low", value: c.low, color: "text-default-400", severity: "LOW" },
];

/**
 * Renders Trivy findings for any scope (cluster, app, or subtree) from a
 * precomputed summary. Severity counts for vulnerabilities and for the other
 * report types each open their detail modal. Returns null when there are no
 * findings, so it self-hides when Trivy is absent.
 */
const TrivyFindingsWidget: React.FC<Props> = observer(
  ({ summary, title = "Security", subtitle }) => {
    const cveModal = useDisclosure();
    const otherModal = useDisclosure();
    const [cveSeverity, setCveSeverity] = useState<string | undefined>();
    const [otherSeverity, setOtherSeverity] = useState<string | undefined>();

    if (!hasFindings(summary)) return null;

    const cveCount = totalCves(summary);
    const otherCount = totalOther(summary);

    const openCve = (severity?: string) => {
      setCveSeverity(severity);
      cveModal.onOpen();
    };
    const openOther = (severity?: string) => {
      setOtherSeverity(severity);
      otherModal.onOpen();
    };

    const section = (
      label: string,
      counts: SeverityCounts,
      onOpen: (severity?: string) => void,
      big: boolean,
    ) => (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onOpen()}
          className="text-xs text-default-400 hover:text-foreground transition-colors self-start"
        >
          {label}
        </button>
        <div className="flex justify-between">
          {severityStats(counts).map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onOpen(s.severity)}
              className="flex flex-col items-center hover:opacity-80 transition-opacity"
            >
              <span
                className={`${big ? "text-2xl" : "text-lg"} font-bold ${s.color}`}
              >
                {s.value}
              </span>
              <span className="text-[11px] text-default-400">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    );

    return (
      <WidgetCard title={title} subtitle={subtitle ?? `${cveCount} CVEs`}>
        <div className="flex flex-col gap-3">
          {cveCount > 0 &&
            section("Vulnerabilities", summary.cve, openCve, true)}

          {otherCount > 0 &&
            section("Misconfigurations", summary.other, openOther, false)}

          {/* Attribution — make the data source explicit, muted & bottom-right. */}
          <div className="flex items-center justify-end gap-1 mt-auto text-[11px] text-default-400">
            <SiTrivy className="w-3 h-3" color="currentColor" />
            <span>via Trivy</span>
          </div>
        </div>

        <TrivyFindingsModal
          isOpen={cveModal.isOpen}
          onOpenChange={cveModal.onOpenChange}
          title="Vulnerabilities"
          reportUids={summary.cveReportUids}
          initialSeverity={cveSeverity}
        />
        <TrivyFindingsModal
          isOpen={otherModal.isOpen}
          onOpenChange={otherModal.onOpenChange}
          title="Misconfigurations"
          reportUids={summary.otherReportUids}
          initialSeverity={otherSeverity}
        />
      </WidgetCard>
    );
  },
);

export default TrivyFindingsWidget;
