// The lit dots and their light map, shared by the worker and fallback tube.
export type CellPaint = {
  x: number;
  y: number;
  pitch: number;
  width: number;
  height: number;
  brightness: number;
  levels: Float32Array;
};

function surface() {
  return typeof OffscreenCanvas === "undefined"
    ? document.createElement("canvas")
    : new OffscreenCanvas(1, 1);
}

export function createPhosphor() {
  const lit = surface();
  const small = surface();
  const light = surface();
  const context = lit.getContext("2d", { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const smaller = small.getContext("2d", {
    willReadFrequently: true,
  }) as typeof context;
  const smallest = light.getContext("2d", {
    willReadFrequently: true,
  }) as typeof context;
  return {
    lit,
    light,
    reset(width: number, height: number, dpr: number) {
      lit.width = width * dpr;
      lit.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = "#e6fbff";
      small.width = Math.ceil(width / 4);
      small.height = Math.ceil(height / 4);
      light.width = Math.ceil(width / 14);
      light.height = Math.ceil(height / 14);
    },
    paint(cell: CellPaint) {
      const { x, y, pitch, width, height, brightness, levels } = cell;
      context.clearRect(x - 0.5, y - 0.5, width + 1, height + 1);
      const size = pitch * 0.8;
      for (let i = 0; i < 40; i++) {
        const level = levels[i]!;
        if (level > 0) {
          context.globalAlpha = level * brightness;
          context.fillRect(
            x + ((i / 8) | 0) * pitch,
            y + (i % 8) * pitch,
            size,
            size,
          );
        }
      }
      context.globalAlpha = 1;
    },
    relight() {
      smaller.clearRect(0, 0, small.width, small.height);
      smaller.drawImage(lit, 0, 0, small.width, small.height);
      smallest.clearRect(0, 0, light.width, light.height);
      smallest.drawImage(small, 0, 0, light.width, light.height);
    },
  };
}
