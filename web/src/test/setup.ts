import "@testing-library/jest-dom/vitest";
import "reflect-metadata";

// React Flow (and some HeroUI components) rely on ResizeObserver, which jsdom does not implement. A no-op stub is enough for rendering in tests.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  globalThis.ResizeObserver ??
  (ResizeObserverStub as unknown as typeof ResizeObserver);

// jsdom has no matchMedia; the dashboard uses it to decide the default sidebar state. Default to "matches: true" (desktop) so layout-dependent code runs.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
