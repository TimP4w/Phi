import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { LogsTab } from "./LogsTab";
import { renderWithProviders, makeTestContainer } from "../../../test/render";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { makeDto } from "../../../test/fixtures";
import { PodLog } from "../../../core/fluxTree/models/tree";

describe("LogsTab", () => {
  it("prompts to select a pod when nothing is selected", () => {
    renderWithProviders(<LogsTab />);
    expect(screen.getByText("No pod selected")).toBeInTheDocument();
  });

  it("waits for logs when a pod is selected but has none", () => {
    const c = makeTestContainer();
    const store = c.get(FluxTreeStore);
    store.syncResources([makeDto({ uid: "pod" })]);
    store.setSelectedResource(store.findResourceByUid("pod")!);
    renderWithProviders(<LogsTab />, { container: c });
    expect(screen.getByText("Waiting for logs…")).toBeInTheDocument();
  });

  it("renders log lines with their container name", () => {
    const c = makeTestContainer();
    const store = c.get(FluxTreeStore);
    store.syncResources([makeDto({ uid: "pod" })]);
    store.setSelectedResource(store.findResourceByUid("pod")!);
    store.appendLog(new PodLog("2026-01-01T10:00:00.123Z", "hello world", "main"));
    renderWithProviders(<LogsTab />, { container: c });
    expect(screen.getByText("hello world")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
  });
});
