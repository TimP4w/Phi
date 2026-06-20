import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Popover,
  Spinner,
} from "@heroui/react";
import { ExternalLink, Maximize2, Search } from "lucide-react";
import { SiTrivy } from "@icons-pack/react-simple-icons";
import { TYPES } from "../../../core/shared/types";
import type { GetTrivyFindingsUseCase } from "../../../core/trivy/usecases/getTrivyFindings.usecase";
import { TrivyFindings } from "../../../core/trivy/models/trivyFindings";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { ROUTES } from "../../routes/routes.enum";

type Row = {
  key: string;
  severity: string;
  title: string;
  detail?: string;
  targetLabel?: string;
  targetUid?: string;
  link?: string;
};

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  UNKNOWN: 4,
};

export function severityChipColor(
  sev: string,
): "danger" | "warning" | "default" {
  switch (sev.toUpperCase()) {
    case "CRITICAL":
    case "HIGH":
      return "danger";
    case "MEDIUM":
    case "LOW":
      return "warning";
    default:
      return "default";
  }
}

function str(item: Record<string, unknown>, key: string): string {
  const v = item[key];
  return typeof v === "string" ? v : "";
}

// Advisory link for a finding. For a recognised id we build the Aqua AVD page directly (the format the user wants); only fall back to the link Trivy embeds for ids we don't recognise.
export function findingLink(
  item: Record<string, unknown>,
  id: string,
): string | undefined {
  const cve = /^CVE-(\d{4})-/i.exec(id);
  if (cve) {
    // e.g. CVE-2005-2347 -> https://avd.aquasec.com/nvd/2005/cve-2005-2347/
    return `https://avd.aquasec.com/nvd/${cve[1]}/${id.toLowerCase()}/`;
  }
  if (/^GHSA-/i.test(id)) {
    return `https://github.com/advisories/${id.toUpperCase()}`;
  }
  if (/^(KSV|KCV|AVD)/i.test(id)) {
    return `https://avd.aquasec.com/misconfig/${id.toLowerCase()}`;
  }
  const primary = str(item, "primaryLink");
  if (primary) return primary;
  const links = item["links"];
  if (Array.isArray(links) && typeof links[0] === "string") return links[0];
  return undefined;
}

// Trivy report types use different field names; flatten each item defensively into a uniform row.
export function toRow(
  findings: TrivyFindings,
  item: Record<string, unknown>,
  i: number,
  targetUid?: string,
): Row {
  const targetLabel =
    [findings.target.targetKind, findings.target.targetName]
      .filter(Boolean)
      .join("/") || undefined;
  if (findings.reportType === "vulnerability") {
    const id = str(item, "vulnerabilityID");
    const installed = str(item, "installedVersion");
    const fixed = str(item, "fixedVersion");
    return {
      key: `${id}-${str(item, "resource")}-${i}`,
      severity: str(item, "severity"),
      title: `${id} — ${str(item, "resource")}`,
      detail: [
        str(item, "title"),
        installed && `installed ${installed}`,
        fixed && `fixed in ${fixed}`,
      ]
        .filter(Boolean)
        .join(" · "),
      targetLabel,
      targetUid,
      link: findingLink(item, id),
    };
  }
  // configAudit / rbacAssessment use checks; exposedSecret uses secrets.
  const id = str(item, "checkID") || str(item, "ruleID") || str(item, "title");
  return {
    key: `${id}-${i}`,
    severity: str(item, "severity"),
    title: str(item, "title") || id,
    detail:
      str(item, "description") ||
      str(item, "messages") ||
      str(item, "category"),
    targetLabel,
    targetUid,
    link: findingLink(item, id),
  };
}

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  reportUids: string[];
  initialSeverity?: string;
};

const TrivyFindingsModal: React.FC<Props> = observer(
  ({ isOpen, onOpenChange, title, reportUids, initialSeverity }) => {
    const getTrivyFindings = useInjection<GetTrivyFindingsUseCase>(
      TYPES.GetTrivyFindingsUseCase,
    );
    const fluxTreeStore = useInjection(FluxTreeStore);
    const navigate = useNavigate();

    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeSeverities, setActiveSeverities] = useState<Set<string>>(
      new Set(),
    );
    const [query, setQuery] = useState("");

    // Key the effect on the contents, not the array reference, so it does not refetch on every parent re-render while the modal is open.
    const uidsKey = reportUids.join(",");

    // Resolve a report's target workload (kind/namespace/name) to a resource UID so each finding can deep-link to it.
    const targetUidLookup = useMemo(() => {
      const lookup = new Map<string, string>();
      fluxTreeStore.resources.forEach((r) => {
        lookup.set(`${r.kind}/${r.namespace ?? ""}/${r.name}`, r.uid);
      });
      return lookup;
    }, [fluxTreeStore.resources]);

    useEffect(() => {
      if (!isOpen || uidsKey === "") {
        setRows([]);
        return;
      }
      const uids = uidsKey.split(",");
      let cancelled = false;
      setLoading(true);

      // Fetch reports through a small worker pool. Each request makes the backend do a live apiserver lookup, so firing all of them at once (a cluster can have hundreds of reports) floods and crashes the backend. The pool also stops early once the modal closes.
      (async () => {
        const collected: Row[] = [];
        let seq = 0;
        let next = 0;

        const worker = async () => {
          while (!cancelled && next < uids.length) {
            const uid = uids[next++];
            const findings = await getTrivyFindings
              .execute(uid)
              .catch(() => null);
            if (!findings) continue;
            const t = findings.target;
            const targetUid = targetUidLookup.get(
              `${t.targetKind ?? ""}/${t.targetNamespace ?? ""}/${t.targetName ?? ""}`,
            );
            findings.items.forEach((item, i) => {
              const row = toRow(findings, item, i, targetUid);
              // Globally unique key across all reports — the per-report index is not unique, and duplicate keys make React/the virtualizer reuse DOM nodes and render stale rows on top after filtering.
              row.key = `r${seq++}`;
              collected.push(row);
            });
          }
        };

        const POOL_SIZE = 5;
        await Promise.all(
          Array.from({ length: Math.min(POOL_SIZE, uids.length) }, worker),
        );
        if (cancelled) return;

        collected.sort(
          (a, b) =>
            (SEVERITY_ORDER[a.severity?.toUpperCase()] ?? 9) -
            (SEVERITY_ORDER[b.severity?.toUpperCase()] ?? 9),
        );
        setRows(collected);
        setLoading(false);
      })();

      return () => {
        cancelled = true;
      };
    }, [isOpen, uidsKey, getTrivyFindings, targetUidLookup]);

    // Reset filters each time the modal opens, seeding the severity filter from the count the user clicked.
    useEffect(() => {
      if (isOpen) {
        setActiveSeverities(
          initialSeverity
            ? new Set([initialSeverity.toUpperCase()])
            : new Set(),
        );
        setQuery("");
      }
    }, [isOpen, initialSeverity]);

    const filteredRows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return rows.filter((row) => {
        if (
          activeSeverities.size > 0 &&
          !activeSeverities.has(row.severity.toUpperCase())
        )
          return false;
        if (
          q &&
          !row.title.toLowerCase().includes(q) &&
          !(row.detail?.toLowerCase().includes(q) ?? false) &&
          !(row.targetLabel?.toLowerCase().includes(q) ?? false)
        )
          return false;
        return true;
      });
    }, [rows, activeSeverities, query]);

    const toggleSeverity = (sev: string) =>
      setActiveSeverities((prev) => {
        const next = new Set(prev);
        if (next.has(sev)) next.delete(sev);
        else next.add(sev);
        return next;
      });

    // Fixed-height rows: total size is always count × ROW_HEIGHT, so the scroll range shrinks correctly when filtering and rows never overlap (dynamic per-item measurement on a 6000+ list is both slower and error-prone).
    const ROW_HEIGHT = 72;
    const scrollRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
      count: filteredRows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 12,
      getItemKey: (index) => filteredRows[index]?.key ?? index,
    });

    // Jump back to the top whenever the visible set changes.
    useEffect(() => {
      virtualizer.scrollToOffset(0);
    }, [filteredRows, virtualizer]);

    const openResource = (uid: string) => {
      onOpenChange(false);
      navigate(`${ROUTES.RESOURCE}/${uid}`);
    };

    return (
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container size="lg">
          <Modal.Dialog className="!max-w-3xl w-full">
            <Modal.CloseTrigger className="absolute right-3 top-3 z-10" />
            <ModalHeader className="flex items-center gap-2">
              {title}
              <span className="text-sm font-normal text-muted ml-1">
                ({filteredRows.length}
                {filteredRows.length !== rows.length ? ` / ${rows.length}` : ""}
                )
              </span>
            </ModalHeader>
            <ModalBody className="px-0 py-0 gap-0">
              {/* Filters */}
              <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                  <Input
                    className="pl-8"
                    placeholder="Filter findings…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SEVERITIES.map((sev) => {
                    const active = activeSeverities.has(sev);
                    return (
                      <Chip
                        key={sev}
                        size="sm"
                        variant={active ? "primary" : "soft"}
                        color={severityChipColor(sev)}
                        className="cursor-pointer uppercase"
                        onClick={() => toggleSeverity(sev)}
                      >
                        {sev}
                      </Chip>
                    );
                  })}
                </div>
              </div>

              {/* List */}
              {loading ? (
                <div className="flex justify-center py-10">
                  <Spinner size="sm" />
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="text-center text-muted text-sm py-10">
                  No findings.
                </div>
              ) : (
                <div
                  ref={scrollRef}
                  className="overflow-y-auto"
                  style={{ height: "60vh" }}
                >
                  <div
                    style={{
                      height: `${virtualizer.getTotalSize()}px`,
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    {virtualizer.getVirtualItems().map((vItem) => {
                      const row = filteredRows[vItem.index];
                      return (
                        <div
                          key={vItem.key}
                          className="absolute top-0 left-0 w-full border-b border-border overflow-hidden"
                          style={{
                            height: `${ROW_HEIGHT}px`,
                            transform: `translateY(${vItem.start}px)`,
                          }}
                        >
                          <div className="flex items-start gap-3 px-4 py-2.5">
                            <Chip
                              size="sm"
                              color={severityChipColor(row.severity)}
                              variant="soft"
                              className="flex-shrink-0 uppercase"
                            >
                              {row.severity || "—"}
                            </Chip>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {row.title}
                                </p>
                                {row.link && (
                                  <a
                                    href={row.link}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="More info"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-shrink-0 text-muted hover:text-foreground"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                              {row.detail && (
                                <p className="text-xs text-muted truncate">
                                  {row.detail}
                                </p>
                              )}
                              {row.targetLabel &&
                                (row.targetUid ? (
                                  <button
                                    type="button"
                                    onClick={() => openResource(row.targetUid!)}
                                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                                  >
                                    {row.targetLabel}
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <p className="text-xs text-muted mt-0.5">
                                    {row.targetLabel}
                                  </p>
                                ))}
                            </div>

                            {/* Expand — full text without changing row height */}
                            <Popover>
                              <Popover.Trigger>
                                <button
                                  type="button"
                                  aria-label="Expand finding"
                                  className="flex-shrink-0 text-muted hover:text-foreground p-1 rounded-md hover:bg-surface-secondary"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                              </Popover.Trigger>
                              <Popover.Content
                                placement="left top"
                                className="max-w-sm p-4 rounded-lg border-small border-default-100 shadow-xl"
                              >
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <Chip
                                      size="sm"
                                      color={severityChipColor(row.severity)}
                                      variant="soft"
                                      className="uppercase"
                                    >
                                      {row.severity || "—"}
                                    </Chip>
                                  </div>
                                  <p className="text-sm font-medium break-words">
                                    {row.title}
                                  </p>
                                  {row.detail && (
                                    <p className="text-xs text-muted break-words whitespace-pre-wrap">
                                      {row.detail}
                                    </p>
                                  )}
                                  {row.link && (
                                    <a
                                      href={row.link}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-foreground hover:underline self-start"
                                    >
                                      View advisory
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                  {row.targetLabel &&
                                    (row.targetUid ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openResource(row.targetUid!)
                                        }
                                        className="inline-flex items-center gap-1 text-xs text-foreground hover:underline self-start"
                                      >
                                        {row.targetLabel}
                                        <ExternalLink className="w-3 h-3" />
                                      </button>
                                    ) : (
                                      <p className="text-xs text-muted">
                                        {row.targetLabel}
                                      </p>
                                    ))}
                                </div>
                              </Popover.Content>
                            </Popover>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter className="py-2">
              <span className="flex items-center gap-1 text-[11px] text-muted ml-auto">
                Powered by
                <SiTrivy className="w-3 h-3" color="currentColor" />
                Trivy
              </span>
            </ModalFooter>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    );
  },
);

export default TrivyFindingsModal;
