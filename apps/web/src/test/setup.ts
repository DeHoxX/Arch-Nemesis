/**
 * Vitest environment setup for JSDOM.
 * Mocks browser APIs (ResizeObserver, DOMRect, element dimensions) required by @xyflow/react.
 */

class ResizeObserverMock {
  private callback?: ResizeObserverCallback;

  constructor(callback?: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    if (this.callback) {
      this.callback(
        [
          {
            target,
            contentRect: {
              x: 0,
              y: 0,
              width: 220,
              height: 72,
              top: 0,
              bottom: 72,
              left: 0,
              right: 220,
              toJSON: () => {},
            },
            borderBoxSize: [{ inlineSize: 220, blockSize: 72 }],
            contentBoxSize: [{ inlineSize: 220, blockSize: 72 }],
            devicePixelContentBoxSize: [],
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
  }

  unobserve(): void {}
  disconnect(): void {}
}

global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

if (typeof window !== "undefined") {
  if (!window.DOMRect) {
    window.DOMRect = class DOMRect {
      bottom = 0;
      left = 0;
      right = 0;
      top = 0;
      x = 0;
      y = 0;
      width = 0;
      height = 0;
      toJSON() {
        return JSON.stringify(this);
      }
      static fromRect(other?: DOMRectInit) {
        const rect = new DOMRect();
        rect.x = other?.x ?? 0;
        rect.y = other?.y ?? 0;
        rect.width = other?.width ?? 0;
        rect.height = other?.height ?? 0;
        rect.top = rect.y;
        rect.left = rect.x;
        rect.right = rect.x + rect.width;
        rect.bottom = rect.y + rect.height;
        return rect;
      }
    } as unknown as typeof window.DOMRect;
  }

  if (!window.DOMMatrixReadOnly) {
    class DOMMatrixReadOnly {
      m11 = 1;
      m12 = 0;
      m13 = 0;
      m14 = 0;
      m21 = 0;
      m22 = 1;
      m23 = 0;
      m24 = 0;
      m31 = 0;
      m32 = 0;
      m33 = 1;
      m34 = 0;
      m41 = 0;
      m42 = 0;
      m43 = 0;
      m44 = 1;
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      is2D = true;
      isIdentity = true;

      constructor(init?: string | number[]) {
        if (typeof init === "string") {
          const match = init.match(/matrix\(([^)]+)\)/);
          if (match && match[1]) {
            const parts = match[1].split(",").map((s) => parseFloat(s.trim()));
            if (parts.length >= 6) {
              const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = parts;
              this.a = this.m11 = a;
              this.b = this.m12 = b;
              this.c = this.m21 = c;
              this.d = this.m22 = d;
              this.e = this.m41 = e;
              this.f = this.m42 = f;
            }
          }
        }
      }
    }
    window.DOMMatrixReadOnly = DOMMatrixReadOnly as unknown as typeof window.DOMMatrixReadOnly;
    if (!window.DOMMatrix) {
      window.DOMMatrix = DOMMatrixReadOnly as unknown as typeof window.DOMMatrix;
    }
  }

  // Provide default element layout dimensions in JSDOM so React Flow can compute viewport bounds
  if (!Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "offsetWidth")) {
    Object.defineProperties(window.HTMLElement.prototype, {
      offsetWidth: {
        configurable: true,
        get() {
          return parseFloat(this.style?.width) || 800;
        },
      },
      offsetHeight: {
        configurable: true,
        get() {
          return parseFloat(this.style?.height) || 600;
        },
      },
    });
  }
}
