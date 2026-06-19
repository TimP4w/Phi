import { describe, it, expect } from "vitest";
import { computeReconciliation } from "./reconciliation";
import {
  gitRepository,
  helmRelease,
  kubeResource,
  kustomization,
  withChildren,
} from "../../../test/fixtures";

describe("computeReconciliation", () => {
  it("returns an all-clear, success state for an undefined root", () => {
    const r = computeReconciliation(undefined);
    expect(r.apps).toEqual([]);
    expect(r.sources).toEqual([]);
    expect(r.tone).toBe("success");
    expect(r.label).toBe("All reconciled");
  });

  it("collects apps and sources across the whole subtree", () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      kustomization({ status: "success" }),
      withChildren(helmRelease({ status: "success" }), [
        gitRepository({ status: "success" }),
      ]),
    ]);

    const r = computeReconciliation(root);

    expect(r.apps).toHaveLength(2);
    expect(r.sources).toHaveLength(1);
    expect(r.tone).toBe("success");
    expect(r.label).toBe("All reconciled");
  });

  it("does not revisit nodes reachable by more than one path", () => {
    const shared = kustomization({ uid: "shared", status: "failed" });
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      shared,
      withChildren(kubeResource({ kind: "Group" }), [shared]),
    ]);

    const r = computeReconciliation(root);

    expect(r.apps).toHaveLength(1);
    expect(r.failed).toBe(1);
  });

  it("reports a danger tone and failure label when an app has failed", () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      kustomization({ status: "failed" }),
      kustomization({ status: "pending" }),
    ]);

    const r = computeReconciliation(root);

    expect(r.failed).toBe(1);
    expect(r.reconciling).toBe(1);
    expect(r.tone).toBe("danger");
    expect(r.label).toBe("1 failed · 1 reconciling");
  });

  it("counts both pending and warning apps as reconciling", () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      kustomization({ status: "pending" }),
      kustomization({ status: "warning" }),
    ]);

    const r = computeReconciliation(root);

    expect(r.reconciling).toBe(2);
    expect(r.tone).toBe("warning");
    expect(r.label).toBe("2 reconciling");
  });

  it("surfaces a failed source when no apps have failed", () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      kustomization({ status: "success" }),
      gitRepository({ status: "failed" }),
      gitRepository({ status: "failed" }),
    ]);

    const r = computeReconciliation(root);

    expect(r.sourcesFailed).toBe(2);
    expect(r.tone).toBe("danger");
    expect(r.label).toBe("2 sources failed");
  });

  it("prioritises a failed app over a failed source in the label", () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      kustomization({ status: "failed" }),
      gitRepository({ status: "failed" }),
    ]);

    const r = computeReconciliation(root);

    expect(r.label).toBe("1 failed");
    expect(r.tone).toBe("danger");
  });

  it("counts suspended Flux apps", () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      kustomization({ status: "success", fluxMetadata: { isReconciling: false, isSuspended: true } }),
      kustomization({ status: "success" }),
    ]);

    const r = computeReconciliation(root);

    expect(r.suspended).toBe(1);
  });

  it("flags drift when a Kustomization's applied and attempted revisions differ", () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      kustomization({
        status: "success",
        kustomizationMetadata: {
          path: "./",
          sourceRef: { kind: "GitRepository", name: "repo" },
          lastAppliedRevision: "main@sha1:aaa",
          lastAttemptedRevision: "main@sha1:bbb",
          dependsOn: [],
        },
      }),
    ]);

    const r = computeReconciliation(root);

    expect(r.drift).toBe(1);
    expect(r.tone).toBe("warning");
    expect(r.label).toBe("1 out of sync");
  });

  it("does not flag drift when applied and attempted revisions match", () => {
    const root = withChildren(kubeResource({ kind: "Cluster" }), [
      kustomization({
        status: "success",
        kustomizationMetadata: {
          path: "./",
          sourceRef: { kind: "GitRepository", name: "repo" },
          lastAppliedRevision: "main@sha1:aaa",
          lastAttemptedRevision: "main@sha1:aaa",
          dependsOn: [],
        },
      }),
    ]);

    const r = computeReconciliation(root);

    expect(r.drift).toBe(0);
    expect(r.tone).toBe("success");
  });
});
