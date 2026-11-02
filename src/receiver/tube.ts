// The display's VFD tube, as the prototype's round 13 renders it: one WebGL
// pass bends the dot matrix, drawn on 2D canvases, onto a gently curved
// glass (curve k .03) behind a scratched, smoked acrylic cover that reflects
// streetlights and lights its scratches where the dots shine. `createTube`
// returns `null` where WebGL is unavailable, and throws where its shader
// fails, so the receiver leaves the plain page in place.

/** The cover's curve: above 0 it bulges. */
export const CURVE = 0.03;

const VERTEX =
  "attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }";

const FRAGMENT = `precision highp float;
varying vec2 vUv;
uniform sampler2D uLit, uGhost, uScratch, uLight;
uniform vec2 uTexSize, uOff, uRefOff;
uniform float uK, uFil;
// round 2's acrylic, layer by layer, on a gently curved, borderless screen
vec3 blob(vec2 p, vec2 at, vec2 r, vec3 c, float a) { return c * a * (1. - smoothstep(0., .7, length((p - at) / r))); }
void main() {
  vec2 sp = vec2(vUv.x, 1. - vUv.y);                      // screen position, top-left origin
  vec2 c = vUv * 2. - 1.;
  vec2 cd = c * (1. + uK * c.yx * c.yx);                  // curvature: >0 bulges, <0 is concave
  vec2 uv = vec2(cd.x * .5 + .5, .5 - cd.y * .5), tp = uv * uTexSize, px = sp * uTexSize;
  float inTex = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
  // the tube: dark glass, ghost dots, lit dots with a tight glow, under the grid mesh and filaments
  vec3 col = mix(vec3(.039, .075, .086), vec3(.012, .02, .024), smoothstep(0., 1.25, length((uv - vec2(.5, .45)) * 2.)));
  float a = texture2D(uLit, uv).a * inTex, b1 = 0.;
  for (int i = 0; i < 8; i++) { float an = float(i) * .785398; vec2 o = vec2(cos(an), sin(an)) / uTexSize; b1 += texture2D(uLit, uv + o * 1.5).a + .7 * texture2D(uLit, uv + o * 3.5).a; }
  b1 *= inTex / 13.6;
  vec4 g = texture2D(uGhost, uv) * inTex;
  float light = texture2D(uLight, uv).a * inTex;
  vec3 glow = vec3(.47, .86, 1.);
  col += g.rgb * g.a + vec3(.9, .98, 1.) * a + glow * (b1 * .55 + light * .35);
  col *= (1. - .42 * step(mod(tp.y, 3.), 1.)) * (1. - .32 * step(mod(tp.x, 3.), 1.));
  col *= 1. - .19 * step(mod(tp.y, uFil), 1.);
  // smoked acrylic tint, darker toward the edges
  float tt = length((sp - .5) / vec2(1.3, 1.2));
  col = mix(col, mix(vec3(.07, .04, .016), vec3(.031, .02, .008), tt * 2.), mix(.08, .5, tt * 2.));
  // the cover: scratches show where the display lights them, faintly where the room does
  float sc = texture2D(uScratch, uv + uOff).a * inTex;
  float d = dot(sp - .5, normalize(vec2(.342, .94)));
  float amb = d < -.18 ? 1. : d < .0 ? mix(1., .4, (d + .18) / .18) : d < .18 ? mix(.4, .1, d / .18) : mix(.1, .55, min(1., (d - .18) / .32));
  col += vec3(.85, .95, 1.) * 1.4 * min(1., light * 4.) * sc;
  col += vec3(1.) * .07 * sc * amb;
  col += vec3(.9, .98, 1.) * light * .05;
  // what the cover reflects: sodium streetlights and a soft glare, moving a little with the viewer
  vec2 rp = mix(sp, uv, .5) + uRefOff;
  col += blob(rp, vec2(.79, .17), vec2(.16, .09), vec3(1., .59, .24), .055);
  col += blob(rp, vec2(.87, .27), vec2(.09, .06), vec3(1., .67, .35), .04);
  col += blob(rp, vec2(.70, .09), vec2(.06, .04), vec3(1., .78, .55), .03);
  float gt = dot(rp, vec2(.259, .966)) / 1.225;
  col += vec3(1.) * (gt < .3 ? mix(.05, .012, gt / .3) : mix(.012, 0., min(1., (gt - .3) / .15)));
  // the curve itself: a faint sheen that bows with the glass, and the edges falling away
  float bow = .62 - uK * 5. * c.x * c.x;
  col += vec3(.75, .85, .95) * .012 * abs(uK) * 25. * exp(-pow((c.y - bow) * 3.5, 2.));
  float e = min(min(px.x, uTexSize.x - px.x), min(px.y, uTexSize.y - px.y));
  col *= 1. - .85 * pow(1. - smoothstep(0., 160., e), 2.);
  col *= 1. - abs(uK) * 2.2 * pow(length(c) / 1.414, 3.);
  gl_FragColor = vec4(col, 1.);
}
`;

/** The textures the shader reads, by unit. */
export const Texture = { Lit: 0, Ghost: 1, Scratch: 2, Light: 3 } as const;
type Unit = (typeof Texture)[keyof typeof Texture];

export type Tube = {
  upload(unit: Unit, source: TexImageSource): void;
  draw(frame: {
    width: number;
    height: number;
    filament: number;
    offset: readonly [number, number];
    reflection: readonly [number, number];
  }): void;
};

export function createTube(canvas: HTMLCanvasElement): Tube | null {
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? "The shader did not compile.");
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(
      gl.getProgramInfoLog(program) ?? "The shader did not link.",
    );
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const textures = ["uLit", "uGhost", "uScratch", "uLight"].map((name, i) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const [parameter, value] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ] as const)
      gl.texParameteri(gl.TEXTURE_2D, parameter, value);
    gl.uniform1i(uniform(name), i);
    return texture;
  });
  return {
    upload(unit, source) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[unit]!);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
    },
    draw(frame) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniform("uTexSize"), frame.width, frame.height);
      gl.uniform2f(uniform("uOff"), frame.offset[0], frame.offset[1]);
      gl.uniform2f(
        uniform("uRefOff"),
        frame.reflection[0],
        frame.reflection[1],
      );
      gl.uniform1f(uniform("uK"), CURVE);
      gl.uniform1f(uniform("uFil"), frame.filament);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

/** Window pixel to display pixel: the projection and curve the shader
 * applies, for finding what the pointer is over. */
export function toDisplay(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number] {
  const cx = (x / width) * 2 - 1;
  const cy = -((y / height) * 2 - 1);
  const dx = cx * (1 + CURVE * cy * cy);
  const dy = cy * (1 + CURVE * cx * cx);
  return [(dx * 0.5 + 0.5) * width, (0.5 - dy * 0.5) * height];
}

/** A seeded random number generator, so the cover keeps its scratches. */
export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A stable pseudo-random number in [0, 1) for a pair of integers. */
export const hash01 = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const ACRYLIC = {
  seed: 7,
  hair: 150,
  swirl: 2,
  smudge: 3,
  finger: 1,
  dust: 260,
  dir: -0.35,
};

/** The cover's hairlines, swirls, smudges, a fingerprint and dust. */
export function scratches(width: number, height: number): HTMLCanvasElement {
  const o = ACRYLIC;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  const R = rng(o.seed);
  g.lineCap = "round";
  for (let i = 0; i < o.hair; i++) {
    const x = R() * width;
    const y = R() * height;
    const len = 30 + Math.pow(R(), 2) * 700;
    const ang = o.dir + (R() - 0.5) * (R() < 0.7 ? 0.35 : 3);
    const bend = (R() - 0.5) * len * 0.15;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    g.strokeStyle = `rgba(255,255,255,${0.03 + Math.pow(R(), 3) * 0.42})`;
    g.lineWidth = 0.35 + R() * 0.9;
    g.setLineDash(R() < 0.5 ? [] : [2 + R() * 30, 1 + R() * 6]);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      (x + x2) / 2 - Math.sin(ang) * bend,
      (y + y2) / 2 + Math.cos(ang) * bend,
      x2,
      y2,
    );
    g.stroke();
  }
  g.setLineDash([]);
  for (let i = 0; i < o.swirl; i++) {
    const cx = R() * width;
    const cy = R() * height;
    const r0 = 60 + R() * 300;
    for (let k = 0; k < 90; k++) {
      const r = r0 + (R() - 0.5) * 120;
      const a0 = R() * Math.PI * 2;
      g.strokeStyle = `rgba(255,255,255,${0.015 + R() * 0.07})`;
      g.lineWidth = 0.4 + R() * 0.5;
      g.beginPath();
      g.arc(cx, cy, Math.max(4, r), a0, a0 + 0.2 + R() * 0.9);
      g.stroke();
    }
  }
  for (let i = 0; i < o.smudge; i++) {
    const cx = R() * width;
    const cy = R() * height;
    const rx = 60 + R() * 220;
    const ry = rx * (0.4 + R() * 0.5);
    const gradient = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
    gradient.addColorStop(0, `rgba(255,255,255,${0.04 + R() * 0.05})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / rx);
    g.translate(-cx, -cy);
    g.fillStyle = gradient;
    g.beginPath();
    g.arc(cx, cy, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  for (let i = 0; i < o.finger; i++) {
    const cx = width * (0.15 + R() * 0.7);
    const cy = height * (0.2 + R() * 0.6);
    g.save();
    g.translate(cx, cy);
    g.rotate(R() * Math.PI);
    g.lineWidth = 0.8;
    for (let r = 3; r < 46; r += 2.7) {
      g.strokeStyle = `rgba(255,255,255,${0.04 + R() * 0.06})`;
      g.setLineDash([3 + R() * 12, 1 + R() * 3]);
      g.beginPath();
      g.ellipse(0, 0, r * 0.72, r, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    g.setLineDash([]);
  }
  for (let i = 0; i < o.dust; i++) {
    const r = 0.4 + Math.pow(R(), 4) * 2.2;
    g.fillStyle = `rgba(255,255,255,${0.12 + R() * 0.4})`;
    g.beginPath();
    g.arc(R() * width, R() * height, r, 0, Math.PI * 2);
    g.fill();
  }
  return canvas;
}

/** Display pixel to window pixel: `toDisplay` undone, by a few steps of
 * fixed-point iteration, which the gentle curve lets converge. */
export function fromDisplay(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number] {
  let sx = x;
  let sy = y;
  for (let i = 0; i < 12; i++) {
    const [dx, dy] = toDisplay(sx, sy, width, height);
    sx -= dx - x;
    sy -= dy - y;
  }
  return [sx, sy];
}
