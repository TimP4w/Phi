import "@testing-library/jest-dom/vitest";
import "reflect-metadata";

document.documentElement.setAttribute("data-reduce-motion", "true");
document.documentElement.classList.add("dark");

// Overlays drive press handling through the PointerEvent API, which jsdom doesn't
// implement; polyfill enough of it for tooltips/popovers/modals to open in tests.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    width: number;
    height: number;
    pressure: number;
    constructor(type: string, props: PointerEventInit = {}) {
      super(type, props);
      this.pointerId = props.pointerId ?? 1;
      this.pointerType = props.pointerType ?? "mouse";
      this.isPrimary = props.isPrimary ?? true;
      this.width = props.width ?? 1;
      this.height = props.height ?? 1;
      this.pressure = props.pressure ?? 0.5;
    }
  }
  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

// React Flow relies on ResizeObserver, which jsdom does not implement; a no-op stub is enough for rendering in tests.
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
