import { describe, it, expect } from "vitest";
import { collectVolumes, isVolume, volumeSize } from "./volumes";
import {
  KubeResource,
  LonghornVolume,
  PersistentVolume,
  PersistentVolumeClaim,
} from "../../core/fluxTree/models/tree";
import { makeDto } from "../../test/fixtures";

const pvc = (over = {}) =>
  new PersistentVolumeClaim(makeDto({ kind: "PersistentVolumeClaim", ...over }));
const pv = (over = {}) =>
  new PersistentVolume(makeDto({ kind: "PersistentVolume", ...over }));
const lhv = (over = {}) =>
  new LonghornVolume(makeDto({ kind: "Volume", group: "longhorn.io", ...over }));

describe("isVolume", () => {
  it("recognises the three volume kinds and rejects others", () => {
    expect(isVolume(pvc())).toBe(true);
    expect(isVolume(pv())).toBe(true);
    expect(isVolume(lhv())).toBe(true);
    expect(isVolume(new KubeResource(makeDto({ kind: "Pod" })))).toBe(false);
  });
});

describe("volumeSize", () => {
  it("reads the size field for each kind", () => {
    expect(volumeSize(pvc({ pvcMetadata: { requested: 5 } }))).toBe(5);
    expect(volumeSize(pv({ pvMetadata: { capacity: 7 } }))).toBe(7);
    expect(volumeSize(lhv({ longhornVolumeMetadata: { size: 9 } }))).toBe(9);
  });

  it("defaults to 0 when metadata is missing", () => {
    expect(volumeSize(pvc())).toBe(0);
  });
});

describe("collectVolumes", () => {
  it("collects volumes across the subtree, cycle-safe", () => {
    const root = new KubeResource(makeDto({ uid: "root", kind: "Kustomization" }));
    const claim = pvc({ uid: "pvc1" });
    const volume = pv({ uid: "pv1" });
    root.children = [claim];
    claim.children = [volume];
    expect(collectVolumes(root).map((v) => v.uid)).toEqual(["pvc1", "pv1"]);
  });
});
