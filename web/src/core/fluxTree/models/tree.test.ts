import { describe, it, expect, vi } from "vitest";
import {
  GitRepository,
  Kustomization,
  OCIRepository,
  PersistentVolumeClaim,
  ResourceStatus,
  sumRequestedStorage,
} from "./tree";
import { makeDto } from "../../../test/fixtures";

describe("KubeResource construction from DTO", () => {
  it("maps annotations and labels into Maps and parses timestamps to Dates", () => {
    const r = new GitRepository(
      makeDto({
        annotations: { "a/b": "1" },
        labels: { team: "core" },
        createdAt: "2026-01-02T03:04:05Z",
        deletedAt: "2026-02-02T00:00:00Z",
      }),
    );

    expect(r.annotations.get("a/b")).toBe("1");
    expect(r.labels.get("team")).toBe("core");
    expect(r.createdAt).toBeInstanceOf(Date);
    expect(r.createdAt.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(r.deletedAt?.toISOString()).toBe("2026-02-02T00:00:00.000Z");
  });

  it("maps a known status string to the ResourceStatus enum", () => {
    const r = new Kustomization(makeDto({ status: "failed" }));
    expect(r.status).toBe(ResourceStatus.FAILED);
  });

  it("falls back to UNKNOWN and warns for an unrecognised status", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // status is typed as a union, but the backend could send anything.
    const r = new Kustomization(
      makeDto({ status: "bogus" as never }),
    );
    expect(r.status).toBe(ResourceStatus.UNKNOWN);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("defaults Flux metadata flags to false when absent", () => {
    const r = new Kustomization(makeDto());
    expect(r.isReconciling).toBe(false);
    expect(r.isSuspended).toBe(false);
    expect(r.lastSyncAt).toBeUndefined();
  });
});

describe("Kustomization.getLastAttemptedHash", () => {
  it("returns the segment after the colon", () => {
    const k = new Kustomization(
      makeDto({
        kustomizationMetadata: {
          path: "./",
          sourceRef: { kind: "GitRepository", name: "repo" },
          lastAppliedRevision: "",
          lastAttemptedRevision: "main@sha1:deadbeef",
          dependsOn: [],
        },
      }),
    );
    expect(k.getLastAttemptedHash()).toBe("deadbeef");
  });

  it("returns an empty string when there is no metadata", () => {
    const k = new Kustomization(makeDto());
    expect(k.getLastAttemptedHash()).toBe("");
  });
});

describe("GitRepository.getCode", () => {
  const make = (meta: Record<string, string>) =>
    new GitRepository(
      makeDto({
        gitRepositoryMetadata: {
          url: "https://example.com/repo.git",
          branch: "",
          tag: "",
          semver: "",
          name: "",
          commit: "",
          ...meta,
        },
      }),
    );

  it("prefers the branch with an @ prefix", () => {
    expect(make({ branch: "main" }).getCode()).toBe("@main");
  });

  it("uses the tag with a colon prefix when there is no branch", () => {
    expect(make({ tag: "v1.0.0" }).getCode()).toBe(":v1.0.0");
  });

  it("truncates a commit hash to 8 characters", () => {
    expect(make({ commit: "0123456789abcdef" }).getCode()).toBe(":01234567");
  });

  it("returns an empty string when there is no metadata", () => {
    expect(new GitRepository(makeDto()).getCode()).toBe("");
    expect(new GitRepository(makeDto()).getURL()).toBe("");
  });
});

describe("OCIRepository.getCode", () => {
  it("strips the sha256: prefix from a digest", () => {
    const o = new OCIRepository(
      makeDto({
        ociRepositoryMetadata: {
          url: "oci://example.com/repo",
          digest: "sha256:abc123",
          tag: "",
          semver: "",
          semverFilter: "",
        },
      }),
    );
    expect(o.getCode()).toBe("@abc123");
  });
});

describe("sumRequestedStorage", () => {
  const pvc = (uid: string, requested?: number) =>
    new PersistentVolumeClaim(
      makeDto({
        uid,
        kind: "PersistentVolumeClaim",
        pvcMetadata: {
          storageClass: "standard",
          volumeName: "",
          volumeMode: "Filesystem",
          accessModes: [],
          capacity: {},
          phase: "Bound",
          requested,
        },
      }),
    );

  it("totals requested storage across all PVCs in the subtree", () => {
    const root = new Kustomization(makeDto({ kind: "Kustomization" }));
    const child = new Kustomization(makeDto({ kind: "Kustomization" }));
    child.children = [pvc("pvc-1", 100), pvc("pvc-2", 250)];
    root.children = [pvc("pvc-0", 50), child];

    const { requested, pvcCount } = sumRequestedStorage(root);

    expect(pvcCount).toBe(3);
    expect(requested).toBe(400);
  });

  it("counts a PVC without a requested figure but adds zero", () => {
    const root = new Kustomization(makeDto({ kind: "Kustomization" }));
    root.children = [pvc("pvc-0")];

    const { requested, pvcCount } = sumRequestedStorage(root);

    expect(pvcCount).toBe(1);
    expect(requested).toBe(0);
  });
});
