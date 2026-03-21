import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock server-only module so server components can be tested
vi.mock("server-only", () => ({}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  send = vi.fn();
  close = vi.fn();

  constructor(public url: string) {
    setTimeout(() => this.onopen?.(), 0);
  }
}

Object.defineProperty(window, "WebSocket", { value: MockWebSocket });

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, "ResizeObserver", { value: MockResizeObserver });
