import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Decorative hero scene: the top of a slowly turning celestial sphere of stars, like a horizon.
// A great-circle band sweeps round it the way SPHEREx scans the sky; stars under the band brighten.
// Drag to turn. Pauses when off-screen or when the tab is hidden;
// with `still` (reduced motion) it draws a single frame.

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aTint;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPx;
  uniform vec3 uScanN;
  varying vec3 vTint;
  varying float vFade;
  varying float vScan;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float facing = normalize(normalMatrix * position).z;          // > 0: on the near side of the sphere
    vFade = mix(0.22, 1.0, smoothstep(-0.25, 0.55, facing));
    vScan = 1.0 - smoothstep(0.0, 0.085, abs(dot(normalize(position), uScanN)));
    float twinkle = 0.85 + 0.15 * sin(uTime * 1.3 + aPhase);
    vFade *= twinkle;
    vTint = aTint;
    gl_PointSize = aSize * uPx * (1.0 + 1.5 * vScan) * (4.2 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uBand;
  varying vec3 vTint;
  varying float vFade;
  varying float vScan;
  vec3 infrared(float t) {                                        // the scan band: pale blue -> blue -> white
    vec3 a = vec3(0.62, 0.80, 1.0), b = vec3(0.16, 0.59, 1.0), c = vec3(0.92, 0.96, 1.0);
    float s = abs(fract(t) * 2.0 - 1.0);
    return s < 0.5 ? mix(a, b, s * 2.0) : mix(b, c, (s - 0.5) * 2.0);
  }
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    vec3 col = mix(vTint, infrared(uBand), vScan * 0.9);
    gl_FragColor = vec4(col, core * core * vFade * (0.75 + 0.6 * vScan));
  }
`;

// small seeded generator, so the sky looks the same on every visit
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const onSphere = (lat: number, lon: number, r = 1) =>
  new THREE.Vector3(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lon));

export default function SkySphere({ still }: { still: boolean }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      el.classList.add('sky-fallback'); // no WebGL: static CSS stars
      return;
    }
    const px = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(px);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.z = 4.2;
    const tilt = new THREE.Group(); // pole tipped towards the viewer; also carries the scan ring
    const spin = new THREE.Group(); // the sky itself
    tilt.rotation.x = 0.35;
    tilt.add(spin);
    scene.add(tilt);
    const trash: { dispose: () => void }[] = [];

    // ---- stars ----
    const rand = mulberry32(20261115);
    const count = el.clientWidth < 600 ? 2600 : 6000;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const tint = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const tints = [[1, 1, 1], [0.78, 0.86, 1], [0.9, 0.94, 1], [1, 1, 1]];
    for (let i = 0; i < count; i++) {
      const y = rand() * 2 - 1;
      const lon = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      pos.set([r * Math.cos(lon), y, r * Math.sin(lon)], i * 3);
      size[i] = 1.3 + 7 * Math.pow(rand(), 7); // many faint stars, few bright ones
      tint.set(tints[Math.floor(rand() * tints.length)], i * 3);
      phase[i] = rand() * 6.283;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const uniforms = { uTime: { value: 0 }, uPx: { value: px }, uBand: { value: 0 }, uScanN: { value: new THREE.Vector3(1, 0, 0) } };
    const starMat = new THREE.ShaderMaterial({ uniforms, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthTest: false, blending: THREE.AdditiveBlending });
    spin.add(new THREE.Points(starGeo, starMat));
    trash.push(starGeo, starMat);

    // ---- faint coordinate grid (RA / Dec) ----
    const grid: number[] = [];
    const seg = 96;
    const arc = (f: (t: number) => THREE.Vector3) => {
      for (let i = 0; i < seg; i++) {
        const a = f((i / seg) * Math.PI * 2), b = f(((i + 1) / seg) * Math.PI * 2);
        grid.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    };
    for (let d = -60; d <= 60; d += 30) arc((t) => onSphere((d * Math.PI) / 180, t));
    for (let h = 0; h < 12; h++) arc((t) => onSphere(t, (h * Math.PI) / 6));
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: 0x8a94a8, transparent: true, opacity: 0.12, depthTest: false });
    spin.add(new THREE.LineSegments(gridGeo, gridMat));
    trash.push(gridGeo, gridMat);

    // ---- scan ring: the great circle being observed right now ----
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) ringPts.push(new THREE.Vector3(Math.cos((i / 128) * Math.PI * 2), Math.sin((i / 128) * Math.PI * 2), 0).multiplyScalar(1.003));
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    const ringMat = new THREE.LineBasicMaterial({ color: 0x2997ff, transparent: true, opacity: 0.45, depthTest: false });
    const ring = new THREE.Line(ringGeo, ringMat);
    tilt.add(ring);
    trash.push(ringGeo, ringMat);

    // ---- layout ----
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      // a big sphere sunk below the tile, so only its top dome shows, spanning most of the width
      const r = Math.max(1.5, Math.min(halfH * camera.aspect * 0.95, 3.2));
      tilt.scale.setScalar(r);
      tilt.position.set(0, halfH * 0.72 - r, 0);
      draw();
    };

    // ---- time ----
    let t = 7; // start a little way in, so the first frame already shows the band mid-sweep
    let velocity = 0; // extra spin from dragging, decays
    let raf = 0, last = 0, onScreen = true;
    const draw = () => {
      const a = t * 0.24; // band: one turn every ~26 s
      ring.rotation.y = Math.PI / 2 - a;
      uniforms.uScanN.value.set(Math.cos(a + spin.rotation.y), 0, Math.sin(a + spin.rotation.y));
      uniforms.uTime.value = t;
      uniforms.uBand.value = t * 0.045;
      renderer.render(scene, camera);
    };
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;
      spin.rotation.y += dt * 0.03 + velocity;
      velocity *= 0.94;
      draw();
      raf = requestAnimationFrame(tick);
    };
    const running = () => !still && onScreen && !document.hidden;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (running()) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    // ---- drag to turn ----
    let dragging = false, lx = 0, ly = 0;
    const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      spin.rotation.y += dx * 0.004;
      velocity = dx * 0.0008;
      tilt.rotation.x = Math.min(0.7, Math.max(0.1, tilt.rotation.x + dy * 0.003));
      if (!raf) draw();
    };
    const up = () => { dragging = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    resize();
    sync();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      trash.forEach((x) => x.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [still]);

  return <div ref={host} className="hero-sky" aria-hidden="true" />;
}
