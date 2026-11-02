// Dot rasterisation and WebGL live here. Layout, stepped effects, input and hidden-tab
// scheduling remain on the page; the shader and its texture sizes are shared.
import { createTube, type Tube } from "./tube.ts";
import type { RenderMessage } from "./display-tube.ts";

let canvas: OffscreenCanvas;
let tube: Tube;
self.onmessage = (event: MessageEvent<OffscreenCanvas | RenderMessage>) => {
  if (event.data instanceof OffscreenCanvas) {
    canvas = event.data;
    try {
      const created = createTube(canvas);
      if (!created) {
        self.postMessage(false);
        return;
      }
      tube = created;
      self.postMessage(true);
    } catch {
      self.postMessage(false);
    }
    return;
  }
  const { width, height, frame, textures, reset, cells, relight } = event.data;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  if (reset) tube.resetLit(...reset);
  for (const cell of cells) tube.paintCell(cell);
  if (relight) tube.relight();
  for (const { unit, pixels } of textures) {
    tube.upload(unit, pixels);
  }
  tube.draw(frame);
  self.postMessage(true);
};
