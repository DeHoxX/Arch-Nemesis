import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import Waves from "./Waves";

/**
 * jsdom unit guards for Waves lifecycle & DOM styling (D-354).
 * NOTE: jsdom stubs WebGL2 calls and cannot verify actual GPU shader pixel
 * output or Chromium compositor behavior.
 */
describe("Waves", () => {
  let loseContextSpy: ReturnType<typeof vi.fn>;
  let drawArraysInstancedSpy: ReturnType<typeof vi.fn>;
  let clearColorSpy: ReturnType<typeof vi.fn>;
  let contextLostFlag: boolean;

  beforeEach(() => {
    loseContextSpy = vi.fn();
    drawArraysInstancedSpy = vi.fn();
    clearColorSpy = vi.fn();
    contextLostFlag = false;

    class IntersectionObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId: string) => {
      if (contextId === "2d") {
        return {
          clearRect: vi.fn(),
          fillStyle: "#ffffff",
          fillRect: vi.fn(),
          getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
        } as unknown as CanvasRenderingContext2D;
      }

      if (contextId === "webgl2") {
        const LINK_STATUS = 0x8b82;
        const COMPILE_STATUS = 0x8b8b;
        const ACTIVE_UNIFORMS = 0x8b86;

        const glMock = {
          VERTEX_SHADER: 0x8b31,
          FRAGMENT_SHADER: 0x8b30,
          COMPILE_STATUS,
          LINK_STATUS,
          ACTIVE_UNIFORMS,
          TEXTURE_2D: 0x0de1,
          TEXTURE0: 0x84c0,
          TEXTURE_MIN_FILTER: 0x2801,
          TEXTURE_MAG_FILTER: 0x2800,
          TEXTURE_WRAP_S: 0x2802,
          TEXTURE_WRAP_T: 0x2803,
          NEAREST: 0x2600,
          CLAMP_TO_EDGE: 0x812f,
          UNPACK_ALIGNMENT: 0x0cf5,
          RG32F: 0x8230,
          RG: 0x8227,
          FLOAT: 0x1406,
          COLOR_BUFFER_BIT: 0x4000,
          BLEND: 0x0be2,
          ONE: 1,
          ONE_MINUS_SRC_ALPHA: 0x0303,
          TRIANGLE_STRIP: 0x0005,
          isContextLost: () => contextLostFlag,
          createShader: vi.fn(() => (contextLostFlag ? null : {})),
          shaderSource: vi.fn(),
          compileShader: vi.fn(),
          getShaderParameter: vi.fn((_shader: unknown, pname: number) =>
            pname === COMPILE_STATUS ? !contextLostFlag : false,
          ),
          deleteShader: vi.fn(),
          createProgram: vi.fn(() => (contextLostFlag ? null : {})),
          attachShader: vi.fn(),
          linkProgram: vi.fn(),
          getProgramParameter: vi.fn((_prog: unknown, pname: number) => {
            if (pname === LINK_STATUS) return !contextLostFlag;
            if (pname === ACTIVE_UNIFORMS) return 0;
            return 0;
          }),
          getActiveUniform: vi.fn(),
          getUniformLocation: vi.fn(() => null),
          deleteProgram: vi.fn(),
          createVertexArray: vi.fn(() => ({})),
          bindVertexArray: vi.fn(),
          deleteVertexArray: vi.fn(),
          createTexture: vi.fn(() => ({})),
          bindTexture: vi.fn(),
          texParameteri: vi.fn(),
          pixelStorei: vi.fn(),
          texImage2D: vi.fn(),
          texSubImage2D: vi.fn(),
          deleteTexture: vi.fn(),
          viewport: vi.fn(),
          clearColor: clearColorSpy,
          clear: vi.fn(),
          enable: vi.fn(),
          blendFunc: vi.fn(),
          useProgram: vi.fn(),
          activeTexture: vi.fn(),
          uniform1i: vi.fn(),
          uniform2f: vi.fn(),
          uniform1f: vi.fn(),
          uniform1ui: vi.fn(),
          uniform2i: vi.fn(),
          uniform3fv: vi.fn(),
          drawArraysInstanced: drawArraysInstancedSpy,
          getExtension: vi.fn((name: string) =>
            name === "WEBGL_lose_context" ? { loseContext: loseContextSpy } : null,
          ),
        };
        return glMock as unknown as WebGL2RenderingContext;
      }

      return null;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders transparent container and survives StrictMode remount without calling loseContext() (D-354)", () => {
    const { container, unmount } = render(
      <StrictMode>
        <Waves
          lineColor="#ffffff"
          spacing={5}
          amplitude={13}
          twist={0}
          speed={0.45}
          mouseRadius={100}
          mouseStrength={0.3}
          accentColor="#10b981"
          lineStyle="dashed"
          lineWidth={0.5}
          scale={0.7}
          bounce={0.3}
          returnDuration={1}
          opacity={0.55}
          lightMode
        />
      </StrictMode>,
    );

    const wrapper = container.querySelector(".waves") as HTMLDivElement | null;
    const canvas = container.querySelector("canvas.waves__canvas") as HTMLCanvasElement | null;

    expect(wrapper).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper?.className).toContain("pointer-events-none");
    expect(wrapper?.style.backgroundColor).toBe("transparent");
    expect(container.querySelectorAll("img")).toHaveLength(0);

    // Must render via WebGL2 after StrictMode mount-cleanup-remount and never call loseContext()
    expect(loseContextSpy).not.toHaveBeenCalled();
    expect(drawArraysInstancedSpy).toHaveBeenCalled();
    expect(clearColorSpy).toHaveBeenCalledWith(0, 0, 0, 0);

    unmount();
    expect(loseContextSpy).not.toHaveBeenCalled();
  });

  it("prevents default on webglcontextlost event", () => {
    const { container } = render(<Waves />);
    const canvas = container.querySelector("canvas.waves__canvas") as HTMLCanvasElement;
    expect(canvas).not.toBeNull();

    contextLostFlag = true;
    const event = new Event("webglcontextlost", { cancelable: true });
    fireEvent(canvas, event);

    expect(event.defaultPrevented).toBe(true);
  });
});
