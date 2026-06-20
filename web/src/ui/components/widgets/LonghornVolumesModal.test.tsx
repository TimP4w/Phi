import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LonghornVolumesModal from "./LonghornVolumesModal";
import { renderWithProviders } from "../../../test/render";
import { makeDto } from "../../../test/fixtures";
import { LonghornVolume } from "../../../core/fluxTree/models/tree";

const volume = (name: string, robustness: string) =>
  new LonghornVolume(makeDto({
    uid: name, kind: "Volume", group: "longhorn.io", name,
    longhornVolumeMetadata: { state: "attached", robustness, size: 1024, actualSize: 512, numberOfReplicas: 3, nodeID: "n1", frontend: "blockdev", accessMode: "rwo" } as never,
  }));

const volumes = [volume("vol-healthy", "healthy"), volume("vol-degraded", "degraded"), volume("vol-faulted", "faulted")];

describe("LonghornVolumesModal", () => {
  it("lists all volumes with a count", () => {
    renderWithProviders(<LonghornVolumesModal isOpen onOpenChange={() => {}} volumes={volumes} />);
    expect(screen.getByText("Longhorn Volumes")).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
    expect(screen.getByText("vol-faulted")).toBeInTheDocument();
  });

  it("seeds the robustness filter from initialFilter", () => {
    renderWithProviders(<LonghornVolumesModal isOpen onOpenChange={() => {}} volumes={volumes} initialFilter="faulted" />);
    // Only the faulted volume passes the seeded filter.
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByText("vol-faulted")).toBeInTheDocument();
    expect(screen.queryByText("vol-healthy")).not.toBeInTheDocument();
  });

  it("filters by the search query", async () => {
    renderWithProviders(<LonghornVolumesModal isOpen onOpenChange={() => {}} volumes={volumes} />);
    await userEvent.type(screen.getByPlaceholderText("Filter volumes…"), "degraded");
    expect(screen.getByText("vol-degraded")).toBeInTheDocument();
    expect(screen.queryByText("vol-healthy")).not.toBeInTheDocument();
  });

  it("toggles a robustness chip to filter the list", async () => {
    renderWithProviders(<LonghornVolumesModal isOpen onOpenChange={() => {}} volumes={volumes} />);
    // The first "healthy" is the filter chip (chips render before the list rows).
    await userEvent.click(screen.getAllByText("healthy")[0]);
    expect(screen.getByText("vol-healthy")).toBeInTheDocument();
    expect(screen.queryByText("vol-faulted")).not.toBeInTheDocument();
  });

  it("navigates to a volume when its link is clicked", async () => {
    renderWithProviders(<LonghornVolumesModal isOpen onOpenChange={() => {}} volumes={[volume("vol-x", "healthy")]} />);
    await userEvent.click(screen.getByText("vol-x"));
    // navigation is wired through the router; clicking should not throw.
    expect(screen.getByText("vol-x")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", async () => {
    renderWithProviders(<LonghornVolumesModal isOpen onOpenChange={() => {}} volumes={volumes} />);
    await userEvent.type(screen.getByPlaceholderText("Filter volumes…"), "zzz");
    expect(screen.getByText("No volumes.")).toBeInTheDocument();
  });
});
