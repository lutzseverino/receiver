// The same tube on a worker when supported: software WebGL must not hold
// the page's input thread while it rasterises the cover and the glow.
import type { CellPaint } from "./phosphor.ts";
import { createTube, type Tube, type Unit } from "./tube.ts";

export type TubeFrame = Parameters<Tube["draw"]>[0];
export type RenderMessage = {
  width: number;
  height: number;
  frame: TubeFrame;
  reset: [number, number, number] | null;
  cells: CellPaint[];
  relight: boolean;
  textures: { unit: Unit; pixels: ImageData }[];
};

/** Starts the worker before transferring the visible canvas, leaving the
 * HTML layer readable if WebGL or the worker cannot start. Older browsers
 * keep the original main-thread renderer. */
export async function createDisplayTube(
  canvas: HTMLCanvasElement,
  onFailure: () => void,
): Promise<Tube | null> {
  if (!canvas.transferControlToOffscreen || typeof Worker === "undefined")
    return createTube(canvas);
  const worker = new Worker(new URL("./tube-worker.ts", import.meta.url), {
    type: "module",
  });
  try {
    const ready = new Promise<boolean>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<boolean>) => resolve(event.data);
      worker.onerror = reject;
    });
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage(offscreen, [offscreen]);
    if (!(await ready)) {
      worker.terminate();
      return null;
    }
  } catch {
    worker.terminate();
    return null;
  }
  const sources = new Map<Unit, TexImageSource>();
  let disposed = false;
  let busy = false;
  let width = canvas.width;
  let height = canvas.height;
  let latest: TubeFrame | null = null;
  let reset: [number, number, number] | null = null;
  let relight = false;
  const cells = new Map<string, CellPaint>();
  // Like the browser compositor, present the newest frame when the renderer
  // is ready rather than accumulating a queue of obsolete animation steps.
  function present() {
    if (busy || disposed || !latest || document.hidden) return;
    busy = true;
    const frame = latest;
    latest = null;
    const size = { width, height };
    const textures = [...sources].map(([unit, source]) => {
      const image = source as HTMLCanvasElement;
      return {
        unit,
        pixels: image
          .getContext("2d")!
          .getImageData(0, 0, image.width, image.height),
      };
    });
    sources.clear();
    worker.postMessage(
      {
        ...size,
        frame,
        textures,
        reset,
        relight,
        cells: [...cells.values()],
      } satisfies RenderMessage,
      textures.map(({ pixels }) => pixels.data.buffer),
    );
    reset = null;
    relight = false;
    cells.clear();
  }

  worker.onerror = () => {
    worker.terminate();
    disposed = true;
    onFailure();
  };
  worker.onmessage = () => {
    busy = false;
    present();
  };
  return {
    resetLit(w, h, dpr) {
      reset = [w, h, dpr];
      cells.clear();
    },
    paintCell(cell) {
      cells.set(`${cell.x},${cell.y}`, cell);
    },
    relight() {
      relight = true;
    },
    resize(w, h) {
      width = Math.floor(w);
      height = Math.floor(h);
    },
    upload(unit, source) {
      sources.set(unit, source);
    },
    draw(frame) {
      latest = frame;
      present();
    },
    dispose() {
      disposed = true;
      worker.terminate();
    },
  };
}
