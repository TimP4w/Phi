import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionState } from "./useSessionState";

describe("useSessionState", () => {
  beforeEach(() => sessionStorage.clear());

  it("falls back to the initial value when nothing is stored", () => {
    const { result } = renderHook(() => useSessionState("k", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("hydrates from a previously stored value", () => {
    sessionStorage.setItem("k", JSON.stringify("stored"));
    const { result } = renderHook(() => useSessionState("k", "default"));
    expect(result.current[0]).toBe("stored");
  });

  it("persists updates back to sessionStorage", () => {
    const { result } = renderHook(() => useSessionState("k", 1));
    act(() => result.current[1](42));
    expect(result.current[0]).toBe(42);
    expect(JSON.parse(sessionStorage.getItem("k")!)).toBe(42);
  });

  it("recovers from corrupt stored JSON by using the initial value", () => {
    sessionStorage.setItem("k", "{not json");
    const { result } = renderHook(() => useSessionState("k", "fallback"));
    expect(result.current[0]).toBe("fallback");
  });
});
