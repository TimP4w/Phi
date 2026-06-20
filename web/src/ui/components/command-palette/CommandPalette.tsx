import React, { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useInjection } from "inversify-react";
import { useNavigate } from "react-router-dom";
import { Chip } from "@heroui/react";
import {
  Search,
  Box,
  Calendar,
  Pause,
  Play,
  RefreshCw,
  CornerDownLeft,
  ChevronRight,
  X,
} from "lucide-react";

import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { EventsStore } from "../../../core/fluxTree/stores/events.store";
import { TYPES } from "../../../core/shared/types";
import { ReconcileUseCase } from "../../../core/resource/usecases/reconcile.usecase";
import { SuspendUseCase } from "../../../core/resource/usecases/suspend.usecase";
import { ResumeUseCase } from "../../../core/resource/usecases/resume.usecase";
import {
  KubeResource,
  FluxResource,
} from "../../../core/fluxTree/models/tree";
import { KubeEvent } from "../../../core/fluxTree/models/kubeEvent";
import { ROUTES } from "../../routes/routes.enum";
import { statusChipColor } from "../../shared/helpers";
import EventDetailModal from "./EventDetailModal";
import {
  CommandName,
  FilterToken,
  Suggestion,
  buildSuggestions,
  collectFilters,
  eligibleTargets,
  eventMatches,
  hasResourceFilters,
  isCompleteFilter,
  parseInput,
  resourceMatches,
} from "./palette";

const RESULT_LIMIT = 50;

type Item =
  | { type: "suggestion"; suggestion: Suggestion }
  | { type: "resource"; resource: KubeResource }
  | { type: "event"; event: KubeEvent }
  | { type: "command"; command: CommandName; resource: FluxResource };

const COMMAND_ICON: Record<CommandName, React.ReactNode> = {
  suspend: <Pause className="w-4 h-4" />,
  resume: <Play className="w-4 h-4" />,
  reconcile: <RefreshCw className="w-4 h-4" />,
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded bg-surface-secondary text-muted text-[10px] font-mono">
    {children}
  </kbd>
);

const CommandPalette: React.FC = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);
  const eventsStore = useInjection(EventsStore);
  const reconcileUseCase = useInjection<ReconcileUseCase>(TYPES.ReconcileUseCase);
  const suspendUseCase = useInjection<SuspendUseCase>(TYPES.SuspendUseCase);
  const resumeUseCase = useInjection<ResumeUseCase>(TYPES.ResumeUseCase);
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [tokens, setTokens] = useState<FilterToken[]>([]);
  const [input, setInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modalEvent, setModalEvent] = useState<KubeEvent | null>(null);
  // Tab-completion cycling: `tabStem` is the text typed before cycling started
  // (so the suggestion list stays stable while Tab rotates through it); null
  // when not cycling. `menuDismissed` hides the hint menu after a pill is
  // committed, until the user types again.
  const [tabStem, setTabStem] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Cmd/Ctrl+K toggles the palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Reset on close, focus on open.
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else {
      setInput("");
      setTokens([]);
      setSelectedIndex(0);
      setTabStem(null);
      setMenuDismissed(false);
    }
  }, [isOpen]);

  // Reset highlight when the pill set changes. Input-driven resets are handled
  // explicitly (onChange/Tab) so Tab cycling can set its own highlight without
  // being clobbered here.
  useEffect(() => {
    setSelectedIndex(0);
  }, [tokens]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const close = useCallback(() => setIsOpen(false), []);

  // --- derive results (only while open) ---
  const allResources = isOpen ? Array.from(fluxTreeStore.resources.values()) : [];
  const parsed = parseInput(input);
  const filters = collectFilters(tokens, parsed);

  // Cached store computeds — recomputed only when the resource set changes, not
  // per keystroke. Reading them while closed is cheap (MobX returns the memo).
  const kinds = isOpen ? fluxTreeStore.kinds : [];
  const namespaces = isOpen ? fluxTreeStore.namespaces : [];

  // While Tab-cycling, suggestions are computed from the original stem so the
  // list stays stable as the applied completion rotates through it.
  const suggestionSource = tabStem ?? input;
  const suggestions =
    isOpen && !menuDismissed
      ? buildSuggestions(suggestionSource, { kinds, namespaces })
      : [];

  const eventMode =
    tokens.some((t) => t.prefix === "event") ||
    (parsed.kind === "filter" && parsed.prefix === "event");

  let results: Item[] = [];
  if (isOpen) {
    if (parsed.kind === "command") {
      const arg = parsed.arg.toLowerCase();
      results = eligibleTargets(parsed.command, allResources)
        .filter((r) => !arg || r.name.toLowerCase().includes(arg))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, RESULT_LIMIT)
        .map((resource) => ({
          type: "command" as const,
          command: parsed.command,
          resource,
        }));
    } else if (eventMode) {
      results = eventsStore.events
        .filter((e) => eventMatches(e, filters))
        .slice()
        .sort((a, b) => b.lastObserved.getTime() - a.lastObserved.getTime())
        .slice(0, RESULT_LIMIT)
        .map((event) => ({ type: "event" as const, event }));
    } else if (hasResourceFilters(filters)) {
      results = allResources
        .filter((r) => resourceMatches(r, filters))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, RESULT_LIMIT)
        .map((resource) => ({ type: "resource" as const, resource }));
    }
  }

  const items: Item[] = [
    ...suggestions.map((s) => ({ type: "suggestion" as const, suggestion: s })),
    ...results,
  ];
  const safeIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));

  // Applying a suggestion via Enter/click ends any Tab cycle.
  const applyCompletion = (completion: string) => {
    setInput(completion);
    setTabStem(null);
    setMenuDismissed(false);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  // Tab rotates through the suggestion list, applying each completion in turn
  // (first → next → … → wrap). The suggestion set is derived from the stem the
  // user typed, so it doesn't collapse as the input is rewritten.
  const cycleCompletion = () => {
    const stem = tabStem ?? input;
    const sugs = buildSuggestions(stem, { kinds, namespaces });
    if (sugs.length === 0) return;
    const next = tabStem === null ? 0 : (tabIndex + 1) % sugs.length;
    setTabStem(stem);
    setTabIndex(next);
    setMenuDismissed(false);
    setInput(sugs[next].completion);
    setSelectedIndex(next); // highlight the cycled suggestion
    inputRef.current?.focus();
  };

  const commitToken = () => {
    if (!isCompleteFilter(input)) return false;
    const p = parseInput(input);
    if (p.kind !== "filter") return false;
    setTokens((prev) => [...prev, { prefix: p.prefix, value: p.value.trim() }]);
    setInput("");
    setTabStem(null);
    // After pilling, show only results until the user starts writing again.
    setMenuDismissed(true);
    return true;
  };

  const runCommand = (command: CommandName, resource: FluxResource) => {
    const useCase =
      command === "suspend"
        ? suspendUseCase
        : command === "resume"
        ? resumeUseCase
        : reconcileUseCase;
    void useCase.execute(resource.uid).catch(() => undefined);
    close();
  };

  const activate = (item: Item) => {
    switch (item.type) {
      case "suggestion":
        applyCompletion(item.suggestion.completion);
        break;
      case "resource":
        navigate(`${ROUTES.RESOURCE}/${item.resource.uid}`);
        close();
        break;
      case "event":
        setIsOpen(false);
        setModalEvent(item.event);
        break;
      case "command":
        runCommand(item.command, item.resource);
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setTabStem(null);
        setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setTabStem(null);
        setSelectedIndex((i) => Math.max(0, i - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (items[safeIndex]) activate(items[safeIndex]);
        else commitToken();
        break;
      case "Tab":
        e.preventDefault();
        cycleCompletion();
        break;
      case " ":
        if (isCompleteFilter(input)) {
          e.preventDefault();
          commitToken();
        }
        break;
      case "Backspace":
        if (input === "" && tokens.length > 0) {
          e.preventDefault();
          setTokens((prev) => prev.slice(0, -1));
          setMenuDismissed(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  };

  const renderItem = (item: Item, index: number) => {
    const active = index === safeIndex;
    const base = `w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
      active ? "bg-surface-secondary" : "hover:bg-surface-secondary/50"
    }`;
    const common = {
      key: index,
      ref: active ? selectedRef : undefined,
      className: base,
      onMouseMove: () => setSelectedIndex(index),
      onClick: () => activate(item),
    };

    if (item.type === "suggestion") {
      return (
        <button {...common}>
          <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
          <span className="font-mono text-sm">{item.suggestion.label}</span>
          {item.suggestion.hint && (
            <span className="ml-auto text-xs text-muted">
              {item.suggestion.hint}
            </span>
          )}
        </button>
      );
    }

    if (item.type === "resource") {
      const r = item.resource;
      return (
        <button {...common}>
          <Box className="w-4 h-4 text-muted flex-shrink-0" />
          <span className="text-sm truncate">{r.name}</span>
          <span className="text-xs text-muted truncate">
            {r.kind}
            {r.namespace ? ` · ${r.namespace}` : ""}
          </span>
          <Chip
            size="sm"
            variant="soft"
            color={statusChipColor(r.status)}
            className="ml-auto flex-shrink-0"
          >
            {r.status}
          </Chip>
        </button>
      );
    }

    if (item.type === "event") {
      const ev = item.event;
      return (
        <button {...common}>
          <Calendar
            className={`w-4 h-4 flex-shrink-0 ${
              ev.type === "Warning" ? "text-warning" : "text-muted"
            }`}
          />
          <span className="text-sm truncate flex-shrink-0">{ev.reason}</span>
          <span className="text-xs text-muted truncate">{ev.message}</span>
          <span className="ml-auto text-xs text-muted flex-shrink-0 truncate max-w-[40%]">
            {ev.kind}/{ev.name}
          </span>
        </button>
      );
    }

    // command
    return (
      <button {...common}>
        <span className="text-muted flex-shrink-0">
          {COMMAND_ICON[item.command]}
        </span>
        <span className="text-sm capitalize flex-shrink-0">{item.command}</span>
        <span className="text-sm truncate">{item.resource.name}</span>
        <span className="text-xs text-muted truncate ml-auto">
          {item.resource.kind}
          {item.resource.namespace ? ` · ${item.resource.namespace}` : ""}
        </span>
      </button>
    );
  };

  const showEmpty =
    items.length === 0 && (tokens.length > 0 || input.trim().length > 0);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="dark w-full max-w-2xl mx-4 bg-surface text-foreground rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col">
            {/* Input row with pills */}
            <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 border-b border-border">
              <Search className="w-4 h-4 text-muted flex-shrink-0" />
              {tokens.map((t, i) => (
                <Chip
                  key={`${t.prefix}-${t.value}-${i}`}
                  size="sm"
                  variant="soft"
                  color="accent"
                  className="font-mono"
                >
                  <span className="flex items-center gap-1">
                    {t.prefix}:{t.value}
                    <button
                      type="button"
                      aria-label="Remove filter"
                      onClick={() =>
                        setTokens((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="opacity-60 hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                </Chip>
              ))}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setTabStem(null);
                  setMenuDismissed(false);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  tokens.length
                    ? "add another filter…"
                    : "Search resources, events, or run a command…"
                }
                className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm placeholder:text-muted py-1"
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto py-1">
              {items.map(renderItem)}
              {showEmpty && (
                <div className="px-3 py-6 text-center text-sm text-muted">
                  No matches
                </div>
              )}
            </div>

            {/* Footer hints */}
            <div className="px-3 py-2 border-t border-border text-xs text-muted flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="w-3 h-3" /> select
              </span>
              <span className="flex items-center gap-1">
                <Kbd>tab</Kbd> complete
              </span>
              <span className="flex items-center gap-1">
                <Kbd>esc</Kbd> close
              </span>
            </div>
          </div>
        </div>
      )}

      <EventDetailModal
        event={modalEvent}
        isOpen={modalEvent !== null}
        onClose={() => setModalEvent(null)}
      />
    </>
  );
});

export default CommandPalette;
