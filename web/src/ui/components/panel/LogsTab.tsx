import { observer } from "mobx-react-lite";
import AnsiToHtml from "ansi-to-html";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { ArrowUp, Terminal } from "lucide-react";

const ansiToHtml = new AnsiToHtml({ escapeXML: true });

const CONTAINER_COLORS = [
  "text-blue-400",
  "text-emerald-400",
  "text-yellow-400",
  "text-purple-400",
  "text-pink-400",
  "text-cyan-400",
];

const containerColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CONTAINER_COLORS[Math.abs(hash) % CONTAINER_COLORS.length];
};

export const LogsTab = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const logs = fluxTreeStore.selectedResource?.logs ?? [];
  const displayedLogs = [...logs].reverse();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs.length, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 24;
    setAutoScroll(atTop);
  };

  const scrollToTop = () => {
    setAutoScroll(true);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  };

  if (!fluxTreeStore.selectedResource) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-default-400 py-20">
        <Terminal className="w-10 h-10 opacity-30" />
        <span className="text-sm">No pod selected</span>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-default-400 py-20">
        <Terminal className="w-10 h-10 opacity-30" />
        <span className="text-sm">Waiting for logs…</span>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col bg-[#0d1117] font-mono text-xs">
      {/* Log lines */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-0"
      >
        {displayedLogs.map((log, i) => (
          <div
            key={`${log.timestamp.getTime()}-${i}`}
            className="flex gap-3 hover:bg-white/5 px-1 py-0.5 rounded group leading-5"
          >
            <span className="text-[#6e7681] flex-shrink-0 tabular-nums select-none">
              {format(log.timestamp, "HH:mm:ss.SSS")}
            </span>
            <span
              className={`flex-shrink-0 select-none ${containerColor(log.container)}`}
            >
              {log.container}
            </span>
            <span
              className="text-[#e6edf3] break-all whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: ansiToHtml.toHtml(log.log) }}
            />
          </div>
        ))}
      </div>

      {!autoScroll && (
        <div className="absolute bottom-4 right-4">
          <Button
            size="sm"
            variant="flat"
            className="bg-content1/90 backdrop-blur-sm shadow-lg"
            onPress={scrollToTop}
            startContent={<ArrowUp className="w-3.5 h-3.5" />}
          >
            Latest
          </Button>
        </div>
      )}
    </div>
  );
});
