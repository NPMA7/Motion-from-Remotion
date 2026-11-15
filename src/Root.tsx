/**
 * Root.tsx — "Kenapa Manusia Belum Bisa Tinggal di Planet Mars?" (Remotion v4, 1080x1920, 30fps, 60 detik)
 *
 * Satu ThreeCanvas permanen sebagai latar 3D (Mars bertekstur kawah + atmosfer glowing, bulan Phobos & Deimos,
 * bintang, kristal es, aliran radiasi, roket Bumi -> Mars). Teks kinetik & kartu data ada di atasnya per scene.
 *
 * Timeline (30 fps):
 *   Scene 1 Hook      0-5 dtk   (frame    0-150)
 *   Scene 2 Atmosfer  5-18 dtk  (frame  150-540)
 *   Scene 3 Radiasi  18-31 dtk  (frame  540-930)
 *   Scene 4 Jarak    31-45 dtk  (frame  930-1350)
 *   Scene 5 CTA      45-60 dtk  (frame 1350-1800)
 *
 * Preview : npx remotion studio
 * Render  : npx remotion render MarsVideo out/video.mp4 --codec=h264
 */
import { Audio } from "@remotion/media";
import { ThreeCanvas } from "@remotion/three";
import React, { useMemo } from "react";
// @ts-ignore — @types/three belum terpasang di project ini; THREE diperlakukan sebagai any
import * as THREE from "three";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Interactive,
} from "remotion";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

/* ============================================================
 * 1. KONFIGURASI
 * ============================================================ */
const FPS = 30;
const DURATION = 60 * FPS; // 1800 frame
const T = 14; // durasi transisi masuk overlay (frame)
const SHOW_SAFE_AREA = false;

const AUDIO: { narration: string | null; music: string | null } = {
  narration: "voiceover.mp3",
  music: null,
};
const MUSIC_VOLUME = 0.2;

const C = {
  space: "#05060F",
  orange: "#FF6B3D",
  rust: "#E2492B",
  cream: "#FFE9D6",
  cyan: "#5CE1FF",
  gold: "#FFD27A",
};

const poppins = loadPoppins("normal", { weights: ["700", "800"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });
const FONT_TITLE = poppins.fontFamily;
const FONT_BODY = inter.fontFamily;

/* ============================================================
 * 2. UTILITAS
 * ============================================================ */
const ease = Easing.out(Easing.cubic);
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const useU = () => {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 1080;
};

const usePop = (delay = 0, config?: { damping?: number; stiffness?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: config ?? { damping: 12, stiffness: 130 },
  });
};

/** Pseudo-random deterministik (agar tekstur & bintang identik di setiap frame render) */
const rng = (seed: number) => {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const SafeArea: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width, height } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: width * 0.05,
        right: width * 0.05,
        top: height * 0.05,
        bottom: height * 0.05,
      }}
    >
      {children}
    </div>
  );
};

const SafeOverlay: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: width * 0.05,
        right: width * 0.05,
        top: height * 0.05,
        bottom: height * 0.05,
        border: "3px dashed rgba(255,0,0,0.8)",
        pointerEvents: "none",
      }}
    />
  );
};

/* ============================================================
 * 3. GENERATOR TEKSTUR PROSEDURAL (tanpa file gambar eksternal)
 * ============================================================ */
const MW = 2048;
const MH = 1024;

const toTexture = (canvas: HTMLCanvasElement, srgb: boolean) => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = "srgb";
  return tex;
};

/** Tekstur Mars: warna karat + kawah (rim terang, dasar gelap) + ngarai Valles Marineris + tudung es kutub */
const makeMarsMaps = () => {
  const colorCv = document.createElement("canvas");
  colorCv.width = MW;
  colorCv.height = MH;
  const bumpCv = document.createElement("canvas");
  bumpCv.width = MW;
  bumpCv.height = MH;
  const c = colorCv.getContext("2d");
  const b = bumpCv.getContext("2d");
  if (!c || !b) throw new Error("Canvas 2D tidak tersedia");
  const r = rng(20261115);

  const base = c.createLinearGradient(0, 0, 0, MH);
  base.addColorStop(0, "#8a4630");
  base.addColorStop(0.5, "#c0643a");
  base.addColorStop(1, "#8a4630");
  c.fillStyle = base;
  c.fillRect(0, 0, MW, MH);
  b.fillStyle = "#808080";
  b.fillRect(0, 0, MW, MH);

  const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, rgb: string, a: number) => {
    for (const dx of [-MW, 0, MW]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - rad, y - rad, rad * 2, rad * 2);
    }
  };

  // dataran gelap (maria) & debu terang
  for (let i = 0; i < 150; i++) {
    const x = r() * MW;
    const y = MH * 0.1 + r() * MH * 0.8;
    const rad = 40 + r() * 170;
    const dark = r() < 0.55;
    blob(c, x, y, rad, dark ? "64,28,20" : "240,176,120", dark ? 0.4 : 0.3);
    blob(b, x, y, rad, dark ? "0,0,0" : "255,255,255", 0.08);
  }

  // ngarai Valles Marineris
  const canyon = (ctx: CanvasRenderingContext2D, col: string, lw: number) => {
    ctx.strokeStyle = col;
    ctx.lineCap = "round";
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(MW * 0.22, MH * 0.52);
    for (let i = 1; i <= 28; i++) {
      const t = i / 28;
      ctx.lineTo(MW * (0.22 + 0.3 * t), MH * (0.52 + Math.sin(t * 5) * 0.012 + t * 0.03));
    }
    ctx.stroke();
  };
  canyon(c, "rgba(60,26,18,0.35)", 22);
  canyon(c, "rgba(40,16,10,0.75)", 9);
  canyon(b, "rgba(10,10,10,0.9)", 12);

  // kawah
  const crater = (x: number, y: number, rad: number) => {
    const lat = (y / MH - 0.5) * Math.PI;
    const sx = 1 / Math.max(0.3, Math.cos(lat));
    for (const dx of [-MW, 0, MW]) {
      const cx = x + dx;
      if (cx + rad * sx < 0 || cx - rad * sx > MW) continue;
      c.save();
      c.translate(cx, y);
      c.scale(sx, 1);
      const fl = c.createRadialGradient(0, 0, 0, 0, 0, rad);
      fl.addColorStop(0, "rgba(58,26,18,0.55)");
      fl.addColorStop(0.68, "rgba(84,38,26,0.4)");
      fl.addColorStop(0.86, "rgba(244,176,126,0.62)");
      fl.addColorStop(1, "rgba(244,176,126,0)");
      c.fillStyle = fl;
      c.beginPath();
      c.arc(0, 0, rad, 0, Math.PI * 2);
      c.fill();
      c.restore();

      b.save();
      b.translate(cx, y);
      b.scale(sx, 1);
      const bg = b.createRadialGradient(0, 0, 0, 0, 0, rad);
      bg.addColorStop(0, "rgba(36,36,36,0.95)");
      bg.addColorStop(0.7, "rgba(66,66,66,0.75)");
      bg.addColorStop(0.86, "rgba(240,240,240,0.95)");
      bg.addColorStop(1, "rgba(128,128,128,0)");
      b.fillStyle = bg;
      b.beginPath();
      b.arc(0, 0, rad, 0, Math.PI * 2);
      b.fill();
      b.restore();
    }
  };
  for (let i = 0; i < 14; i++) crater(r() * MW, MH * 0.12 + r() * MH * 0.76, 44 + r() * 46);
  for (let i = 0; i < 90; i++) crater(r() * MW, MH * 0.08 + r() * MH * 0.84, 16 + r() * 28);
  for (let i = 0; i < 520; i++) crater(r() * MW, MH * 0.04 + r() * MH * 0.92, 4 + r() * 12);

  // butiran halus
  for (let i = 0; i < 9000; i++) {
    const x = r() * MW;
    const y = r() * MH;
    c.fillStyle = r() < 0.5 ? "rgba(40,18,12,0.12)" : "rgba(255,200,150,0.1)";
    c.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
  }

  // tudung es kutub
  const capTop = c.createLinearGradient(0, 0, 0, MH * 0.1);
  capTop.addColorStop(0, "rgba(250,246,240,0.95)");
  capTop.addColorStop(0.55, "rgba(250,246,240,0.7)");
  capTop.addColorStop(1, "rgba(250,246,240,0)");
  c.fillStyle = capTop;
  c.fillRect(0, 0, MW, MH * 0.1);
  const capBot = c.createLinearGradient(0, MH, 0, MH * 0.9);
  capBot.addColorStop(0, "rgba(250,246,240,0.95)");
  capBot.addColorStop(0.55, "rgba(250,246,240,0.7)");
  capBot.addColorStop(1, "rgba(250,246,240,0)");
  c.fillStyle = capBot;
  c.fillRect(0, MH * 0.9, MW, MH * 0.1);

  return { color: toTexture(colorCv, true), bump: toTexture(bumpCv, false) };
};

/** Tekstur Bumi sederhana (samudra, benua, awan, kutub) untuk adegan perjalanan */
const makeEarthMap = () => {
  const W = 1024;
  const H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d");
  if (!c) throw new Error("Canvas 2D tidak tersedia");
  const r = rng(777);
  const sea = c.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, "#1b4f9c");
  sea.addColorStop(0.5, "#1f6fc4");
  sea.addColorStop(1, "#1b4f9c");
  c.fillStyle = sea;
  c.fillRect(0, 0, W, H);
  const land = ["#2f7d32", "#4f8f3a", "#8a9a45", "#b69b57"];
  for (let k = 0; k < 9; k++) {
    const cx = r() * W;
    const cy = H * 0.2 + r() * H * 0.6;
    for (let i = 0; i < 30; i++) {
      c.fillStyle = land[Math.floor(r() * land.length)];
      c.beginPath();
      c.arc(cx + (r() - 0.5) * 150, cy + (r() - 0.5) * 90, 14 + r() * 36, 0, Math.PI * 2);
      c.fill();
    }
  }
  for (let i = 0; i < 160; i++) {
    c.fillStyle = "rgba(255,255,255,0.28)";
    c.beginPath();
    c.ellipse(r() * W, r() * H, 20 + r() * 50, 4 + r() * 8, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "rgba(250,250,255,0.9)";
  c.fillRect(0, 0, W, H * 0.06);
  c.fillRect(0, H * 0.94, W, H * 0.06);
  return toTexture(cv, true);
};

/** Sprite cahaya lembut (bintang, debu, nebula, partikel radiasi) */
const makeGlowTexture = () => {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 128;
  const c = cv.getContext("2d");
  if (!c) throw new Error("Canvas 2D tidak tersedia");
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
};

const makePoints = (n: number, fn: (rand: () => number) => [number, number, number], seed: number) => {
  const rand = rng(seed);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = fn(rand);
    arr[i * 3] = p[0];
    arr[i * 3 + 1] = p[1];
    arr[i * 3 + 2] = p[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  return g;
};

/* ============================================================
 * 4. KOMPONEN 3D
 * ============================================================ */

/** Shader atmosfer glowing: shell luar (BackSide, memudar keluar) + rim tipis di permukaan planet (FrontSide) */
const ATMO_VERT = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;
const ATMO_FRAG = `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uPower;
uniform float uDMax;
uniform float uBack;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  float d = dot(n, v);
  float a;
  if (uBack > 0.5) {
    float k = clamp(-d / uDMax, 0.0, 1.0);
    a = pow(k, uPower);
  } else {
    a = pow(1.0 - clamp(d, 0.0, 1.0), uPower);
  }
  a *= uIntensity;
  gl_FragColor = vec4(uColor, a);
}
`;

const makeAtmoUniforms = (color: string, back: number) => ({
  uColor: { value: new THREE.Color(color) },
  uIntensity: { value: 1 },
  uPower: { value: 2.4 },
  uDMax: { value: 0.5 },
  uBack: { value: back },
});

const Atmosphere: React.FC<{ color: string; thickness: number; intensity: number }> = ({
  color,
  thickness,
  intensity,
}) => {
  const outer = useMemo(() => makeAtmoUniforms(color, 1), [color]);
  const rim = useMemo(() => makeAtmoUniforms(color, 0), [color]);
  const k = 1 + thickness;
  outer.uIntensity.value = intensity;
  outer.uDMax.value = Math.sqrt(1 - 1 / (k * k));
  outer.uPower.value = 2.2;
  rim.uIntensity.value = intensity * 0.85;
  rim.uPower.value = 3.2;
  return (
    <>
      <mesh scale={k}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          uniforms={outer}
          vertexShader={ATMO_VERT}
          fragmentShader={ATMO_FRAG}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={1.012}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          uniforms={rim}
          vertexShader={ATMO_VERT}
          fragmentShader={ATMO_FRAG}
          side={THREE.FrontSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
};

/** Phobos / Deimos: bulan berbentuk kentang mengorbit Mars */
const Moon: React.FC<{ orbit: number; speed: number; phase: number; size: number; color: string }> = ({
  orbit,
  speed,
  phase,
  size,
  color,
}) => {
  const frame = useCurrentFrame();
  const a = phase + frame * speed;
  return (
    <mesh position={[Math.cos(a) * orbit, 0, Math.sin(a) * orbit]} rotation={[frame * 0.01, frame * 0.014, 0]} scale={[1, 0.8, 0.9]}>
      <dodecahedronGeometry args={[size, 1]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
  );
};

/** Aliran partikel radiasi (angin surya + sinar kosmik) yang menghantam permukaan Mars langsung */
const RAD_N = 300;
const RAD_C: [number, number, number] = [0.35, 0.2, 0];
const RAD_R = 0.85 * 1.04;
const RAD_D: [number, number, number] = (() => {
  const v = [1, -0.07, -0.04];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l] as [number, number, number];
})();

const RadiationStream: React.FC<{ opacity: number; tex: any }> = ({ opacity, tex }) => {
  const frame = useCurrentFrame();
  const init = useMemo(() => {
    const r = rng(4242);
    const origin = new Float32Array(RAD_N * 3);
    const life = new Float32Array(RAD_N);
    const phase = new Float32Array(RAD_N);
    for (let i = 0; i < RAD_N; i++) {
      const ox = -3.4 + r() * 1.8;
      const oy = -2.0 + r() * 4.4;
      const oz = -1.3 + r() * 2.2;
      origin[i * 3] = ox;
      origin[i * 3 + 1] = oy;
      origin[i * 3 + 2] = oz;
      const ex = ox - RAD_C[0];
      const ey = oy - RAD_C[1];
      const ez = oz - RAD_C[2];
      const bb = ex * RAD_D[0] + ey * RAD_D[1] + ez * RAD_D[2];
      const cc = ex * ex + ey * ey + ez * ez - RAD_R * RAD_R;
      const disc = bb * bb - cc;
      let L = 8;
      if (disc > 0) {
        const t = -bb - Math.sqrt(disc);
        if (t > 0) L = t;
      }
      life[i] = L;
      phase[i] = r() * L;
    }
    const pos = new Float32Array(RAD_N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { origin, life, phase, pos, geo };
  }, []);

  for (let i = 0; i < RAD_N; i++) {
    const s = (init.phase[i] + frame * 0.05) % init.life[i];
    init.pos[i * 3] = init.origin[i * 3] + RAD_D[0] * s;
    init.pos[i * 3 + 1] = init.origin[i * 3 + 1] + RAD_D[1] * s;
    init.pos[i * 3 + 2] = init.origin[i * 3 + 2] + RAD_D[2] * s;
  }
  init.geo.attributes.position.needsUpdate = true;

  return (
    <points geometry={init.geo} frustumCulled={false} visible={opacity > 0.01}>
      <pointsMaterial
        map={tex}
        size={0.07}
        sizeAttenuation
        color={C.gold}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

/** Roket sederhana (silinder + kerucut + sirip + api) */
const Rocket: React.FC<{ spin: number; flame: number }> = ({ spin, flame }) => (
  <group rotation={[0, spin, 0]}>
    <mesh>
      <cylinderGeometry args={[0.045, 0.05, 0.26, 24]} />
      <meshStandardMaterial color="#f4f1ec" metalness={0.3} roughness={0.35} />
    </mesh>
    <mesh position={[0, 0.19, 0]}>
      <coneGeometry args={[0.045, 0.12, 24]} />
      <meshStandardMaterial color="#ff5a36" metalness={0.2} roughness={0.4} />
    </mesh>
    {[0, 1, 2].map((i) => (
      <group key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
        <mesh position={[0.06, -0.1, 0]} rotation={[0, 0, -0.25]}>
          <boxGeometry args={[0.05, 0.1, 0.012]} />
          <meshStandardMaterial color="#ff5a36" roughness={0.5} />
        </mesh>
      </group>
    ))}
    <mesh position={[0, 0.04, 0.046]}>
      <sphereGeometry args={[0.022, 16, 16]} />
      <meshStandardMaterial color="#7fe3ff" emissive="#2aa7d8" emissiveIntensity={1} />
    </mesh>
    <mesh position={[0, -0.21 - flame * 0.05, 0]} rotation={[Math.PI, 0, 0]} scale={[1, 0.8 + flame, 1]}>
      <coneGeometry args={[0.035, 0.18, 16]} />
      <meshBasicMaterial color="#ffb347" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  </group>
);

type V3 = [number, number, number];
const CRYSTALS: { p: V3; s: number }[] = [
  { p: [-1.15, 0.95, 0.6], s: 0.17 },
  { p: [1.15, 0.85, 0.7], s: 0.14 },
  { p: [-1.15, -0.65, 0.8], s: 0.15 },
  { p: [1.15, -0.75, 0.5], s: 0.19 },
];

// Jalur roket Bumi -> Mars (kurva Bezier kuadratik, koordinat dunia x,y)
const P0: [number, number] = [-0.62, -0.6];
const P1: [number, number] = [0.3, -0.6];
const P2: [number, number] = [0.42, 0.14];
const bez = (t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]];
};
const bezTan = (t: number): [number, number] => [
  2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]),
  2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]),
];

/** Seluruh dunia 3D, dikendalikan oleh frame global */
const MarsWorld: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const marsMaps = useMemo(() => makeMarsMaps(), []);
  const earthMap = useMemo(() => makeEarthMap(), []);
  const glowTex = useMemo(() => makeGlowTexture(), []);
  const stars = useMemo(
    () =>
      makePoints(
        1400,
        (rand) => {
          const z = rand() * 2 - 1;
          const phi = rand() * Math.PI * 2;
          const rad = Math.sqrt(1 - z * z);
          const d = 40 + rand() * 50;
          return [Math.cos(phi) * rad * d, z * d, Math.sin(phi) * rad * d];
        },
        99
      ),
    []
  );
  const dust = useMemo(
    () => makePoints(170, (rand) => [(rand() - 0.5) * 5, (rand() - 0.5) * 8, -2 + rand() * 5], 31),
    []
  );

  // koreografi planet (x, y, skala) per scene — halus dengan easing inOut
  const K = [0, 150, 180, 540, 570, 930, 960, 1350, 1380, 1800];
  const io = Easing.inOut(Easing.cubic);
  const px = interpolate(frame, K, [0, 0, 0, 0, 0.35, 0.35, 0.45, 0.45, 0, 0], { ...CL, easing: io });
  const py = interpolate(frame, K, [0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0.7, 0.7, 0.3, 0.3], { ...CL, easing: io });
  const ps = interpolate(frame, K, [1.0, 1.06, 0.88, 0.88, 0.85, 0.85, 0.5, 0.5, 0.9, 1.0], { ...CL, easing: io });
  const pop = spring({ frame, fps, config: { damping: 13, stiffness: 100 } });
  const popS = 0.6 + 0.4 * pop;
  const sx = Math.sin(frame / 95) * 0.04;
  const sy = Math.cos(frame / 120) * 0.03;
  const spin = 2.6 + frame * 0.0125;

  // atmosfer: tebal di hook, menipis di scene 2, kembali menguat di penutup
  const thick = interpolate(frame, [0, 150, 200, 330, 1350, 1500, 1800], [0.18, 0.2, 0.2, 0.05, 0.07, 0.16, 0.2], CL);
  const glowI = 1 + Math.sin(frame / 18) * 0.08;

  const cryS = interpolate(frame, [150, 190, 530, 570], [0, 1, 1, 0], CL);
  const radOp = interpolate(frame, [545, 585, 925, 960], [0, 0.95, 0.95, 0], CL);
  const sunOp = interpolate(frame, [540, 600, 930, 960], [0, 0.8, 0.8, 0], CL);
  const earthS = interpolate(frame, [930, 975, 1345, 1390], [0, 1, 1, 0], CL);
  const rocketS = interpolate(frame, [960, 985, 1345, 1385], [0, 1, 1, 0], CL) * 0.9;
  const tNow = interpolate(frame, [975, 1300], [0, 1], { ...CL, easing: Easing.inOut(Easing.quad) });
  const rp = bez(tNow);
  const rt = bezTan(tNow);
  const rAngle = Math.atan2(rt[1], rt[0]) - Math.PI / 2;
  const flame = 0.5 + 0.5 * Math.sin(frame * 0.9);

  return (
    <>
      <color attach="background" args={[C.space]} />
      <ambientLight intensity={0.55} color="#ffd9c8" />
      <directionalLight position={[-4, 2.5, 5]} intensity={3.2} color="#fff1e4" />
      <directionalLight position={[5, 1, -4]} intensity={1.4} color="#ff7a4a" />

      {/* bintang & nebula */}
      <group rotation={[0, frame * 0.0015, 0]}>
        <points geometry={stars} frustumCulled={false}>
          <pointsMaterial map={glowTex} size={0.12} sizeAttenuation color="#ffffff" transparent opacity={0.9} depthWrite={false} />
        </points>
      </group>
      <sprite position={[-9, 7, -35]} scale={[45, 45, 1]}>
        <spriteMaterial map={glowTex} color="#7a2248" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite position={[10, -8, -35]} scale={[48, 48, 1]}>
        <spriteMaterial map={glowTex} color="#1b2a6b" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite position={[0, 0, -45]} scale={[70, 70, 1]}>
        <spriteMaterial map={glowTex} color="#33122e" transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <group rotation={[0, frame * 0.002, Math.sin(frame / 200) * 0.05]}>
        <points geometry={dust} frustumCulled={false}>
          <pointsMaterial map={glowTex} size={0.035} sizeAttenuation color="#ffb08a" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      </group>

      {/* matahari (cahaya kuning di scene radiasi) */}
      <sprite position={[-3.0, 1.9, -3]} scale={[8, 8, 1]} visible={sunOp > 0.01}>
        <spriteMaterial map={glowTex} color="#ffb36b" transparent opacity={sunOp} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* PLANET MARS */}
      <group position={[px + sx, py + sy, 0]} scale={ps * popS}>
        <group rotation={[0, 0, 0.436]}>
          <mesh rotation={[0, spin, 0]}>
            <sphereGeometry args={[1, 96, 96]} />
            <meshStandardMaterial
              map={marsMaps.color}
              bumpMap={marsMaps.bump}
              bumpScale={1.2}
              roughness={0.95}
              metalness={0}
              emissive="#2b0f08"
              emissiveIntensity={0.35}
            />
          </mesh>
        </group>
        <Atmosphere color="#ff6a3d" thickness={thick} intensity={glowI} />
        <group rotation={[0.9, 0, 0.25]}>
          <Moon orbit={1.45} speed={0.03} phase={0.5} size={0.07} color="#8a7a6c" />
          <Moon orbit={1.85} speed={0.016} phase={3.2} size={0.05} color="#9a8b7d" />
        </group>
      </group>

      {/* Kristal es (scene atmosfer & dingin) */}
      <group position={[px, py, 0]}>
        {CRYSTALS.map((cr, i) => (
          <mesh
            key={i}
            position={[cr.p[0], cr.p[1] + Math.sin(frame / 20 + i) * 0.05, cr.p[2]]}
            rotation={[frame * (0.01 + i * 0.004), frame * (0.014 + i * 0.003), 0]}
            scale={cryS}
            visible={cryS > 0.001}
          >
            <icosahedronGeometry args={[cr.s, 0]} />
            <meshStandardMaterial color="#bdefff" metalness={0.2} roughness={0.15} emissive="#2a8fb0" emissiveIntensity={0.6} flatShading />
          </mesh>
        ))}
      </group>

      {/* Aliran radiasi (scene radiasi) */}
      <RadiationStream opacity={radOp} tex={glowTex} />

      {/* Bumi kecil + roket + jalur (scene jarak) */}
      <group position={[-0.9, -0.6, 0]} scale={earthS} visible={earthS > 0.001}>
        <mesh rotation={[0, frame * 0.02, 0.4]}>
          <sphereGeometry args={[0.3, 48, 48]} />
          <meshStandardMaterial map={earthMap} roughness={0.8} />
        </mesh>
        <Atmosphere color="#5aa9ff" thickness={0.12} intensity={1} />
      </group>
      {Array.from({ length: 26 }).map((_, i) => {
        const t = (i + 1) / 27;
        if (t > tNow - 0.01 || earthS < 0.5) return null;
        const p = bez(t);
        return (
          <mesh key={i} position={[p[0], p[1], 0.1]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
          </mesh>
        );
      })}
      <group position={[rp[0], rp[1], 0.2]} rotation={[0, 0, rAngle]} scale={rocketS} visible={rocketS > 0.001}>
        <Rocket spin={frame * 0.05} flame={flame} />
      </group>
    </>
  );
};

/* ============================================================
 * 5. KOMPONEN UI (teks kinetik, kartu data)
 * ============================================================ */
const Words: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  color?: string;
  font?: string;
  weight?: number;
  stagger?: number;
  hi?: string[];
  hiColor?: string;
}> = ({
  text,
  delay = 0,
  size = 96,
  color = C.cream,
  font = FONT_TITLE,
  weight = 800,
  stagger = 4,
  hi = [],
  hiColor = C.orange,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const u = useU();
  const words = text.split(" ");
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: `0 ${0.28 * size * u}px`,
        fontFamily: font,
        fontWeight: weight,
        fontSize: size * u,
        lineHeight: 1.15,
        textAlign: "center",
        textShadow: `0 ${4 * u}px ${24 * u}px rgba(0,0,0,0.65)`,
      }}
    >
      {words.map((w, i) => {
        const p = spring({
          frame: Math.max(0, frame - delay - i * stagger),
          fps,
          config: { damping: 13, stiffness: 150 },
        });
        const isHi = hi.includes(w.replace(/[.,!?:]/g, ""));
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: Math.min(1, p * 1.5),
              transform: `translateY(${(1 - p) * 0.6 * size * u}px) scale(${0.7 + 0.3 * p})`,
              color: isHi ? hiColor : color,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

const Chip: React.FC<{ label: string; delay?: number; bg?: string; color?: string }> = ({
  label,
  delay = 0,
  bg = C.orange,
  color = "#1a0a05",
}) => {
  const u = useU();
  const p = usePop(delay, { damping: 10, stiffness: 140 });
  return (
    <div
      style={{
        display: "inline-block",
        background: bg,
        color,
        fontFamily: FONT_TITLE,
        fontWeight: 800,
        fontSize: 42 * u,
        padding: `${10 * u}px ${34 * u}px`,
        borderRadius: 999,
        letterSpacing: 3 * u,
        boxShadow: `0 0 ${36 * u}px ${bg}88`,
        transform: `scale(${p}) rotate(${(1 - p) * -8}deg)`,
      }}
    >
      {label}
    </div>
  );
};

const AnimNumber: React.FC<{
  to: number;
  delay?: number;
  dur?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}> = ({ to, delay = 0, dur = 60, decimals = 0, prefix = "", suffix = "" }) => {
  const frame = useCurrentFrame();
  const n = interpolate(frame, [delay, delay + dur], [0, to], { ...CL, easing: ease });
  const s = Math.abs(n).toFixed(decimals).replace(".", ",");
  return (
    <>
      {n < 0 ? "−" : ""}
      {prefix}
      {s}
      {suffix}
    </>
  );
};

const StatCard: React.FC<{
  value: React.ReactNode;
  label: string;
  delay: number;
  width: number;
  accent?: string;
  valueSize?: number;
}> = ({ value, label, delay, width, accent = C.orange, valueSize = 84 }) => {
  const u = useU();
  const p = usePop(delay, { damping: 12, stiffness: 120 });
  return (
    <div
      style={{
        width: width * u,
        padding: `${22 * u}px ${18 * u}px`,
        borderRadius: 32 * u,
        background: "rgba(10,6,16,0.64)",
        border: `${2 * u}px solid ${accent}88`,
        boxShadow: `0 0 ${40 * u}px ${accent}33`,
        textAlign: "center",
        transform: `translateY(${(1 - p) * 80}px) scale(${0.85 + 0.15 * p})`,
        opacity: Math.min(1, p * 1.6),
      }}
    >
      <div style={{ fontFamily: FONT_TITLE, fontWeight: 800, fontSize: valueSize * u, color: accent, lineHeight: 1.05 }}>
        {value}
      </div>
      <div style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 30 * u, color: C.cream, opacity: 0.9, marginTop: 8 * u }}>
        {label}
      </div>
    </div>
  );
};

const CheckItem: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const u = useU();
  const p = usePop(delay, { damping: 14, stiffness: 140 });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20 * u,
        transform: `translateX(${(1 - p) * -140}px)`,
        opacity: Math.min(1, p * 2),
      }}
    >
      <svg viewBox="0 0 60 60" width={58 * u} height={58 * u}>
        <circle cx="30" cy="30" r="28" fill={C.cyan} />
        <path
          d="M16 31 L26 41 L45 20"
          stroke="#06121a"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="50"
          strokeDashoffset={50 * (1 - p)}
        />
      </svg>
      <div
        style={{
          fontFamily: FONT_TITLE,
          fontWeight: 700,
          fontSize: 40 * u,
          color: C.cream,
          textShadow: `0 ${3 * u}px ${16 * u}px rgba(0,0,0,0.7)`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Tata letak: blok teks di atas, blok data di bawah, ruang tengah dikosongkan untuk planet 3D */
const Overlay: React.FC<{ top: React.ReactNode; bottom?: React.ReactNode }> = ({ top, bottom }) => {
  const u = useU();
  return (
    <SafeArea>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 * u, paddingTop: 10 * u }}>
          {top}
        </div>
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18 * u,
            paddingBottom: 230 * u,
          }}
        >
          {bottom}
        </div>
      </div>
    </SafeArea>
  );
};

/* ============================================================
 * 6. SCENE (overlay UI di atas dunia 3D)
 * ============================================================ */

// 1. HOOK (0-5 dtk)
const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const u = useU();
  const pop = usePop(14, { damping: 9, stiffness: 110 });
  const pulse = 1 + Math.sin(frame / 7) * 0.02;
  return (
    <Overlay
      top={
        <>
          <Chip label="MISTERI LUAR ANGKASA" delay={4} />
          <Words text="Kenapa Manusia Belum Bisa Tinggal di" size={74} delay={8} hi={["Tinggal"]} />
        </>
      }
      bottom={
        <div
          style={{
            fontFamily: FONT_TITLE,
            fontWeight: 800,
            fontSize: 250 * u,
            color: C.orange,
            lineHeight: 1,
            transform: `scale(${pop * pulse})`,
            textShadow: `0 0 ${60 * u}px ${C.rust}, 0 ${8 * u}px ${30 * u}px rgba(0,0,0,0.6)`,
          }}
        >
          MARS?
        </div>
      }
    />
  );
};

// 2. ATMOSFER (5-18 dtk)
const SceneAtmosfer: React.FC = () => (
  <Overlay
    top={
      <>
        <Chip label="ALASAN #1" delay={4} />
        <Words text="Atmosfernya Terlalu Tipis" size={84} delay={8} hi={["Tipis"]} hiColor={C.cyan} />
      </>
    }
    bottom={
      <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
        <StatCard
          width={440}
          delay={30}
          accent={C.orange}
          value={<AnimNumber to={0.6} decimals={1} suffix="%" delay={30} />}
          label="tekanan udara Bumi"
        />
        <StatCard
          width={440}
          delay={46}
          accent={C.cyan}
          value={<AnimNumber to={-60} suffix="°C" delay={46} />}
          label="suhu rata-rata"
        />
      </div>
    }
  />
);

// 3. RADIASI (18-31 dtk)
const SceneRadiasi: React.FC = () => (
  <Overlay
    top={
      <>
        <Chip label="ALASAN #2" delay={4} />
        <Words text="Radiasi Menghantam Langsung" size={84} delay={8} hi={["Radiasi"]} hiColor={C.gold} />
      </>
    }
    bottom={
      <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
        <StatCard
          width={440}
          delay={30}
          accent={C.gold}
          value={<AnimNumber to={100} prefix="≈" suffix="×" delay={30} />}
          label="dosis vs rata-rata Bumi"
        />
        <StatCard width={440} delay={46} accent={C.rust} value="0" label="medan magnet global" />
      </div>
    }
  />
);

// 4. JARAK, TANAH, GRAVITASI (31-45 dtk)
const SceneJarak: React.FC = () => (
  <Overlay
    top={
      <>
        <Chip label="ALASAN #3" delay={4} />
        <Words text="Jauh, Beracun, & Gravitasi Lemah" size={76} delay={8} hi={["Jauh", "Beracun"]} hiColor={C.orange} />
      </>
    }
    bottom={
      <div style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
        <StatCard width={308} delay={28} accent={C.cyan} valueSize={48} value="7 bulan" label="perjalanan" />
        <StatCard width={308} delay={44} accent={C.rust} valueSize={48} value="Perklorat" label="tanah beracun" />
        <StatCard
          width={308}
          delay={60}
          accent={C.gold}
          valueSize={48}
          value={<AnimNumber to={38} suffix="%" delay={60} dur={45} />}
          label="gravitasi Bumi"
        />
      </div>
    }
  />
);

// 5. KESIMPULAN + CTA (45-60 dtk)
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const u = useU();
  const btn = usePop(150, { damping: 8, stiffness: 120 });
  const pulse = 1 + Math.sin(frame / 6) * 0.05;
  return (
    <Overlay
      top={
        <>
          <Chip label="KESIMPULAN" delay={4} bg={C.cyan} />
          <Words text="Belum Siap, Tapi Bukan Mustahil!" size={80} delay={8} hi={["Mustahil"]} hiColor={C.cyan} />
        </>
      }
      bottom={
        <>
          <CheckItem text="MOXIE NASA: oksigen dari udara Mars" delay={60} />
          <div
            style={{
              background: C.orange,
              color: "#1a0a05",
              fontFamily: FONT_TITLE,
              fontWeight: 800,
              fontSize: 64 * u,
              padding: `${16 * u}px ${72 * u}px`,
              borderRadius: 999,
              transform: `scale(${btn * pulse})`,
              boxShadow: `0 0 ${50 * u}px ${C.orange}99, 0 ${10 * u}px 0 rgba(0,0,0,0.3)`,
            }}
          >
            FOLLOW
          </div>
          <div style={{ fontFamily: FONT_BODY, fontWeight: 600, fontSize: 36 * u, color: C.cream, opacity: 0.9 }}>
            #Mars #FaktaLuarAngkasa
          </div>
        </>
      }
    />
  );
};

/* ============================================================
 * 7. DATA SCENE, TRANSISI, SUBTITLE
 * ============================================================ */
type Transition = "none" | "slide" | "zoom" | "wipe";

type SceneDef = {
  id: string;
  label: string;
  start: number; // detik
  dur: number; // detik
  transition: Transition;
  cues: [number, string][]; // [detik relatif terhadap awal scene, teks subtitle]
  Component: React.FC;
};

const SCENES: SceneDef[] = [
  {
    id: "hook", label: "1 Hook", start: 0, dur: 5, transition: "none", Component: SceneHook,
    cues: [[0.2, "Mars, calon rumah kedua manusia?"], [2.3, "Ini alasan kita belum bisa tinggal di sana!"]],
  },
  {
    id: "atmosfer", label: "2 Atmosfer", start: 5, dur: 13, transition: "slide", Component: SceneAtmosfer,
    cues: [
      [0, "Alasan pertama, atmosfernya."],
      [1.6, "Udara Mars hampir semuanya karbon dioksida,"],
      [4.2, "dengan tekanan kurang dari satu persen Bumi."],
      [7.0, "Suhunya rata-rata minus enam puluh derajat."],
      [9.6, "Tanpa pakaian bertekanan, cairan tubuhmu bisa mendidih."],
    ],
  },
  {
    id: "radiasi", label: "3 Radiasi", start: 18, dur: 13, transition: "wipe", Component: SceneRadiasi,
    cues: [
      [0, "Kedua, radiasi."],
      [1.1, "Mars tidak punya medan magnet global"],
      [3.6, "dan atmosfernya tipis, jadi radiasi kosmik"],
      [6.0, "dan matahari menghantam permukaannya langsung."],
      [8.6, "Dosisnya sekitar seratus kali lipat rata-rata di Bumi."],
    ],
  },
  {
    id: "jarak", label: "4 Jarak", start: 31, dur: 14, transition: "zoom", Component: SceneJarak,
    cues: [
      [0, "Ketiga, jaraknya."],
      [1.3, "Perjalanan ke Mars sekitar tujuh bulan,"],
      [3.6, "dan bantuan Bumi tidak bisa datang cepat."],
      [6.3, "Tanahnya beracun, dan gravitasinya"],
      [8.4, "cuma tiga puluh delapan persen Bumi,"],
      [10.8, "melemahkan tulang dan otot."],
    ],
  },
  {
    id: "cta", label: "5 Kesimpulan CTA", start: 45, dur: 15, transition: "slide", Component: SceneCTA,
    cues: [
      [0, "Jadi, Mars belum siap jadi rumah kita."],
      [2.9, "Tapi alat NASA bernama MOXIE sudah berhasil"],
      [5.7, "membuat oksigen dari udara Mars."],
      [7.8, "Mungkin suatu hari nanti, kita bisa."],
      [10.4, "Follow untuk fakta luar angkasa lainnya!"],
    ],
  },
];

const CUES = SCENES.flatMap((s) =>
  s.cues.map((c, i) => ({
    from: Math.round((s.start + c[0]) * FPS),
    to: Math.round((i + 1 < s.cues.length ? s.start + s.cues[i + 1][0] : s.start + s.dur) * FPS),
    text: c[1],
  }))
);

/** Transisi masuk (T frame) + fade-out singkat di akhir scene agar overlay tidak menumpuk */
const Shell: React.FC<{ kind: Transition; last: boolean; children: React.ReactNode }> = ({ kind, last, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = kind === "none" ? 1 : interpolate(frame, [0, T], [0, 1], { ...CL, easing: ease });
  const out = last ? 1 : interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], CL);
  const style: React.CSSProperties = { opacity: out };
  if (kind === "slide") {
    style.transform = `translateY(${(1 - p) * 70}px)`;
    style.opacity = out * p;
  }
  if (kind === "zoom") {
    style.transform = `scale(${1.25 - 0.25 * p})`;
    style.opacity = out * p;
  }
  if (kind === "wipe") style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const u = useU();
  const cue = CUES.find((c) => frame >= c.from && frame < c.to);
  if (!cue) return null;
  const local = frame - cue.from;
  const p = spring({ frame: local, fps, config: { damping: 15, stiffness: 180 } });
  const out = interpolate(frame, [cue.to - 4, cue.to], [1, 0], CL);
  return (
    <div
      style={{
        position: "absolute",
        left: width * 0.05,
        right: width * 0.05,
        bottom: height * 0.075,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "rgba(6,4,12,0.72)",
          color: C.cream,
          padding: `${16 * u}px ${28 * u}px`,
          borderRadius: 24 * u,
          fontFamily: FONT_BODY,
          fontWeight: 600,
          fontSize: 44 * u,
          textAlign: "center",
          maxWidth: "100%",
          transform: `translateY(${(1 - p) * 20}px)`,
          opacity: Math.min(1, p * 1.5) * out,
        }}
      >
        {cue.text}
      </div>
    </div>
  );
};

/* ============================================================
 * 8. KOMPOSISI UTAMA
 * ============================================================ */
const Video: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const fadeOut = interpolate(frame, [DURATION - 10, DURATION], [0, 1], CL);
  return (
    <>
      <AbsoluteFill style={{ backgroundColor: C.space }}>
        <AbsoluteFill>
          <ThreeCanvas width={width} height={height} camera={{ fov: 35, position: [0, 0, 8], near: 0.1, far: 200 }}>
            <MarsWorld />
          </ThreeCanvas>
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            background: "radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.55) 100%)",
            pointerEvents: "none",
          }}
        />
        {SCENES.map((s, i) => {
          const SceneComp = s.Component;
          return (
            <Sequence key={s.id} name={s.label} from={Math.round(s.start * FPS)} durationInFrames={Math.round(s.dur * FPS)}>
              <Shell kind={s.transition} last={i === SCENES.length - 1}>
                <SceneComp />
              </Shell>
            </Sequence>
          );
        })}
        <Subtitles />
        {AUDIO.narration ? null : null}
        {AUDIO.music ? (
          <Audio
            src={staticFile(AUDIO.music)}
            loop
            volume={(f) => interpolate(f, [0, 30, DURATION - 45, DURATION], [0, MUSIC_VOLUME, MUSIC_VOLUME, 0], CL)}
          />
        ) : null}
        <AbsoluteFill style={{ backgroundColor: "#000", opacity: fadeOut, pointerEvents: "none" }} />
        {SHOW_SAFE_AREA ? <SafeOverlay /> : null}
      </AbsoluteFill>
      <Audio src={staticFile("voiceover.mp3")} durationInFrames={1815.8} />
    </>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition id="MarsVideo" component={Video} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
);
