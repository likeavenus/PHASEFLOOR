import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const createBrush = (geometry, position = [0, 0, 0], rotation = [0, 0, 0]) => {
  geometry.clearGroups();
  const brush = new Brush(geometry);
  brush.position.set(...position);
  brush.rotation.set(...rotation);
  brush.updateMatrixWorld(true);
  return brush;
};

const subtractBrushes = (base, cutters) => {
  const evaluator = new Evaluator();
  evaluator.useGroups = false;

  let result = base;

  cutters.forEach((cutter) => {
    const previous = result;
    result = evaluator.evaluate(previous, cutter, SUBTRACTION);
    result.updateMatrixWorld(true);

    if (previous.geometry !== result.geometry) previous.geometry.dispose();
    cutter.geometry.dispose();
  });

  result.geometry.computeVertexNormals();
  result.geometry.computeBoundingBox();
  result.geometry.computeBoundingSphere();
  return result.geometry;
};

const createClubWall = () => {
  return subtractBrushes(createBrush(new THREE.BoxGeometry(12, 5.2, 0.56)), [
    createBrush(
      new THREE.CylinderGeometry(1.72, 1.72, 1.2, 72),
      [0, 0.18, 0],
      [Math.PI / 2, 0, 0]
    ),
    createBrush(new THREE.BoxGeometry(2.15, 2.95, 1.2), [-3.75, 0.05, 0]),
    createBrush(new THREE.BoxGeometry(2.15, 2.95, 1.2), [3.75, 0.05, 0]),
    createBrush(new THREE.BoxGeometry(6.5, 0.16, 1.2), [0, 2.08, 0]),
  ]);
};

const createSpeakerCabinet = () =>
  subtractBrushes(createBrush(new THREE.BoxGeometry(1.18, 3.35, 0.72)), [
    createBrush(
      new THREE.CylinderGeometry(0.48, 0.48, 1, 48),
      [0, 0.72, 0],
      [Math.PI / 2, 0, 0]
    ),
    createBrush(
      new THREE.CylinderGeometry(0.37, 0.37, 1, 48),
      [0, -0.31, 0],
      [Math.PI / 2, 0, 0]
    ),
    createBrush(new THREE.BoxGeometry(0.72, 0.22, 1), [0, -1.23, 0]),
  ]);

const createDjBoothShell = () =>
  subtractBrushes(createBrush(new THREE.BoxGeometry(4.45, 1.12, 0.86)), [
    createBrush(new THREE.BoxGeometry(3.72, 0.72, 0.34), [0, 0.02, 0.4]),
  ]);

const createSideWall = () =>
  subtractBrushes(createBrush(new THREE.BoxGeometry(0.38, 3.65, 5.8)), [
    ...[-1.75, 0, 1.75].map((z) =>
      createBrush(
        new THREE.CylinderGeometry(0.72, 0.72, 0.9, 56),
        [0, 0.38, z],
        [0, 0, Math.PI / 2]
      )
    ),
    ...[-1.75, 0, 1.75].map((z) =>
      createBrush(new THREE.BoxGeometry(0.9, 0.18, 0.96), [0, -1.28, z])
    ),
  ]);

const createRotor = () => {
  const blades = Array.from({ length: 6 }, (_, index) => {
    const blade = new THREE.BoxGeometry(0.11, 0.38, 0.035);
    blade.translate(0, 0.29, 0);
    blade.rotateZ((index / 6) * Math.PI * 2 + 0.38);
    return blade;
  });
  const geometry = mergeGeometries(blades, false);
  blades.forEach((blade) => blade.dispose());
  geometry.computeBoundingSphere();
  return geometry;
};

const bars = Array.from({ length: 8 }, (_, index) => index);
const stageSegments = Array.from({ length: 12 }, (_, index) => index);
const djPadSegments = Array.from({ length: 8 }, (_, index) => index);
const djControlColors = ["#27c9ff", "#8d70ff", "#f4f7ff", "#ff5a92"];
const speakerDrivers = [
  { y: 0.72, radius: 0.435 },
  { y: -0.31, radius: 0.325 },
];
const sideOpenings = [-1.75, 0, 1.75];
const ceilingRibs = [-2.7, -0.55, 1.6];
const cabinetBolts = [
  [-0.48, 1.48],
  [0.48, 1.48],
  [-0.48, -1.48],
  [0.48, -1.48],
];
const fixtureMounts = [
  [-4.1, 4.2, 2.7],
  [-2.35, 4.65, -2.7],
  [0, 4.85, 2.8],
  [2.35, 4.65, -2.7],
  [4.1, 4.2, 2.7],
  [0, 5.1, -3.8],
];

const spectrumVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const spectrumFragmentShader = /* glsl */ `
  uniform vec3 uLowBands;
  uniform vec2 uHighBands;
  uniform vec3 uHits;
  uniform float uTime;
  uniform float uPlaying;
  uniform float uMirror;
  uniform float uIntensity;

  varying vec2 vUv;

  float readSpectrum(float x) {
    if (x < 0.25) return mix(uLowBands.x, uLowBands.y, x * 4.0);
    if (x < 0.5) return mix(uLowBands.y, uLowBands.z, (x - 0.25) * 4.0);
    if (x < 0.75) return mix(uLowBands.z, uHighBands.x, (x - 0.5) * 4.0);
    return mix(uHighBands.x, uHighBands.y, (x - 0.75) * 4.0);
  }

  void main() {
    float spectrumX = mix(vUv.x, 1.0 - vUv.x, uMirror);
    float columns = 32.0;
    float column = floor(spectrumX * columns);
    float localX = fract(spectrumX * columns);
    float barMask =
      smoothstep(0.1, 0.22, localX) *
      (1.0 - smoothstep(0.78, 0.9, localX));

    float spectrum = readSpectrum(spectrumX);
    float hit =
      uHits.x * (1.0 - spectrumX) * 0.2 +
      uHits.y * (1.0 - abs(spectrumX - 0.55) * 1.8) * 0.13 +
      uHits.z * spectrumX * 0.2;
    float motion =
      sin(column * 1.73 + uTime * 3.1) * 0.024 +
      sin(column * 0.43 - uTime * 1.65) * 0.018;
    float activeHeight = clamp(0.08 + spectrum * 0.72 + hit + motion, 0.06, 0.93);
    float height = mix(0.055, activeHeight, uPlaying);

    float fill = smoothstep(height + 0.012, height - 0.012, vUv.y);
    float cellY = fract(vUv.y * 13.0);
    float segmentMask =
      smoothstep(0.08, 0.18, cellY) *
      (1.0 - smoothstep(0.78, 0.92, cellY));
    float peak = exp(-abs(vUv.y - height) * 72.0) * barMask;

    vec3 cyan = vec3(0.08, 0.72, 1.0);
    vec3 violet = vec3(0.52, 0.22, 1.0);
    vec3 magenta = vec3(1.0, 0.12, 0.48);
    vec3 color = mix(cyan, violet, smoothstep(0.18, 0.58, spectrumX));
    color = mix(color, magenta, smoothstep(0.62, 1.0, spectrumX));
    color = mix(color, vec3(0.94, 0.98, 1.0), peak * 0.55);

    float gridX = 1.0 - smoothstep(0.0, 0.035, abs(fract(vUv.x * 8.0) - 0.5));
    float gridY = 1.0 - smoothstep(0.0, 0.045, abs(fract(vUv.y * 5.0) - 0.5));
    float grid = max(gridX, gridY) * 0.035;
    float edgeFade =
      smoothstep(0.0, 0.035, vUv.x) *
      (1.0 - smoothstep(0.965, 1.0, vUv.x)) *
      smoothstep(0.0, 0.06, vUv.y) *
      (1.0 - smoothstep(0.94, 1.0, vUv.y));
    float alpha =
      (fill * barMask * segmentMask * 0.72 + peak * 0.7 + grid) *
      edgeFade *
      uIntensity;

    gl_FragColor = vec4(color * (0.76 + peak * 0.72), alpha);
  }
`;

const djFacadeFragmentShader = /* glsl */ `
  uniform vec4 uBands;
  uniform vec3 uHits;
  uniform float uTime;
  uniform float uPlaying;
  uniform float uPulseAge;
  uniform float uFlashAge;
  uniform float uBeatPhase;

  varying vec2 vUv;

  float hash21(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float gradientNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 blend = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0));
    return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
  }

  float fbm(vec2 point) {
    float value = 0.0;
    value += gradientNoise(point) * 0.52;
    point = point * 2.03 + vec2(17.3, 9.2);
    value += gradientNoise(point) * 0.26;
#ifndef LOW_POWER
    point = point * 2.01 + vec2(5.7, 21.4);
    value += gradientNoise(point) * 0.13;
    point = point * 1.97 + vec2(31.2, 4.8);
    value += gradientNoise(point) * 0.065;
#endif
    return value;
  }

  float lineGlow(float distanceToLine, float coreWidth, float haloWidth) {
    float core = 1.0 - smoothstep(0.0, coreWidth, distanceToLine);
    float halo = 1.0 - smoothstep(0.0, haloWidth, distanceToLine);
    return core + halo * 0.42;
  }

  void main() {
    float bass = clamp(uBands.x, 0.0, 1.0);
    float body = clamp(uBands.y, 0.0, 1.0);
    float presence = clamp(uBands.z, 0.0, 1.0);
    float high = clamp(max(uBands.w, uHits.z), 0.0, 1.0);
    float active = mix(0.22, 1.0, uPlaying);
    float time = uTime;

    // Work in facade proportions so waves remain round rather than stretched.
    vec2 point = vec2((vUv.x - 0.5) * 5.68, vUv.y - 0.5);
    float flowSpeed = 0.18 + high * 0.28 + presence * 0.08;
    float noiseA = fbm(vec2(point.x * 0.48 + time * flowSpeed, point.y * 2.8 - time * 0.09));
    float noiseB = fbm(vec2(point.x * 0.72 - time * (0.11 + high * 0.16), point.y * 3.6 + noiseA * 1.7));
    float warp = (noiseA - 0.5) * 0.2 + (noiseB - 0.5) * 0.12;

    float amplitude = 0.055 + bass * 0.075 + uHits.x * 0.035;
    float phaseBreath = sin(uBeatPhase * 6.2831853) * bass * 0.018;
    float waveA = -0.205 + sin(point.x * 1.18 + time * 0.72 + noiseA * 2.2) * amplitude + warp;
    float waveB = 0.005 + sin(point.x * 1.52 - time * 0.54 + noiseB * 2.7 + 2.1) * (amplitude * 0.82) - warp * 0.55;
    float waveC = 0.205 + sin(point.x * 0.94 + time * 0.42 + noiseA * 3.1 + 4.3) * (amplitude * 0.68) + warp * 0.38;
    waveA -= phaseBreath;
    waveC += phaseBreath;

    float width = 0.011 + body * 0.009;
    float ribbonsA = lineGlow(abs(point.y - waveA), width, 0.085 + bass * 0.035);
    float ribbonsB = lineGlow(abs(point.y - waveB), width * 0.82, 0.072 + presence * 0.035);
    float ribbonsC = lineGlow(abs(point.y - waveC), width * 0.72, 0.064 + high * 0.03);
    float ribbons = ribbonsA + ribbonsB * 0.9 + ribbonsC * 0.72;

    // Each kick sends one luminous front from the centre to the facade edges.
    float radialDistance = length(vec2(point.x * 0.31, point.y * 1.8));
    float pulseRadius = uPulseAge * (1.25 + bass * 0.45);
    float kickEnvelope = exp(-uPulseAge * 2.15) * step(uPulseAge, 2.0);
    float kickWave = exp(-abs(radialDistance - pulseRadius) * 25.0) * kickEnvelope;

    // Clap is a soft, wide photographic flash, never a full-frame hard strobe.
    float flashEnvelope = exp(-uFlashAge * 4.5) * step(uFlashAge, 1.4);
    float flashShape = 0.38 + 0.62 * (1.0 - smoothstep(0.0, 0.58, abs(point.y)));
    float clapFlash = flashEnvelope * flashShape * (0.78 + noiseB * 0.22);

    float plasma = smoothstep(0.42, 0.84, noiseA * 0.62 + noiseB * 0.5);
    float filaments = 1.0 - smoothstep(0.025, 0.14, abs(sin((noiseA - noiseB) * 8.0 + point.x * 0.42)));

    float sparks = 0.0;
#ifndef LOW_POWER
    vec2 sparkPoint = vec2(point.x * 2.35 + time * (0.55 + high), point.y * 10.0);
    vec2 sparkCell = floor(sparkPoint);
    vec2 sparkLocal = fract(sparkPoint) - 0.5;
    float sparkSeed = hash21(sparkCell);
    float sparkGate = smoothstep(0.91 - high * 0.08, 0.99, sparkSeed);
    float sparkCore = 1.0 - smoothstep(0.02, 0.34, length(sparkLocal));
    sparks = sparkGate * sparkCore * (0.28 + high * 1.15);
#else
    float mobileGlint = sin(point.x * 3.1 - time * (1.0 + high)) * 0.5 + 0.5;
    sparks = pow(mobileGlint, 14.0) * high * 0.38;
#endif

    vec3 cyan = vec3(0.015, 0.68, 1.35);
    vec3 violet = vec3(0.42, 0.08, 1.28);
    vec3 magenta = vec3(1.35, 0.025, 0.48);
    vec3 amber = vec3(1.45, 0.32, 0.035);
    float colorFlow = smoothstep(0.18, 0.88, noiseB + sin(point.x * 0.37 + time * 0.16) * 0.16);
    vec3 fieldColor = mix(cyan, violet, colorFlow);
    fieldColor = mix(fieldColor, magenta, smoothstep(0.48, 0.92, noiseA + presence * 0.16));
    vec3 ribbonColor = mix(cyan, magenta, clamp(vUv.x * 0.72 + noiseB * 0.34, 0.0, 1.0));
    ribbonColor = mix(ribbonColor, violet, ribbonsB * 0.24);

    float background = (0.085 + plasma * 0.22 + filaments * 0.11) * active;
    vec3 color = fieldColor * background;
    color += ribbonColor * ribbons * (0.72 + body * 0.38) * active;
    color += mix(cyan, magenta, noiseA) * kickWave * (1.3 + bass * 0.75);
    color += mix(magenta, vec3(1.15, 0.72, 1.0), noiseB) * clapFlash * (0.68 + presence * 0.42);
    color += mix(cyan, amber, high) * sparks * active;
    color += amber * kickWave * high * 0.24;

    float edge =
      smoothstep(0.0, 0.035, vUv.x) *
      (1.0 - smoothstep(0.965, 1.0, vUv.x)) *
      smoothstep(0.0, 0.09, vUv.y) *
      (1.0 - smoothstep(0.91, 1.0, vUv.y));
    float alpha = clamp(
      0.08 * active + background + ribbons * 0.62 + kickWave * 0.86 + clapFlash * 0.42 + sparks * 0.56,
      0.0,
      1.0
    ) * edge;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function DjFacadeGenerativeDisplay({ audioBus, lowPower }) {
  const displayTime = useRef(0);
  const eventState = useRef({
    kickCount: audioBus.kickHitCount || 0,
    clapCount: audioBus.clapHitCount || 0,
    seekVersion: audioBus.seekVersion || 0,
    pulseAge: 10,
    flashAge: 10,
  });
  const uniforms = useMemo(
    () => ({
      uBands: { value: new THREE.Vector4() },
      uHits: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uPlaying: { value: 0 },
      uPulseAge: { value: 10 },
      uFlashAge: { value: 10 },
      uBeatPhase: { value: 0 },
    }),
    []
  );

  useFrame((_, delta) => {
    if (audioBus.isPlaying) displayTime.current += delta;
    uniforms.uTime.value = displayTime.current;
    const smoothSignal = (current, target, attack, release) =>
      THREE.MathUtils.damp(
        current,
        target,
        target > current ? attack : release,
        delta
      );
    const bands = uniforms.uBands.value;
    bands.x = smoothSignal(bands.x, audioBus.bass, 5.2, 2.3);
    bands.y = smoothSignal(bands.y, audioBus.lowMid, 4.8, 2.1);
    bands.z = smoothSignal(bands.z, audioBus.presence, 4.4, 1.9);
    bands.w = smoothSignal(bands.w, audioBus.high, 5.8, 2.6);

    const hits = uniforms.uHits.value;
    hits.x = smoothSignal(hits.x, audioBus.kick, 7.2, 3.1);
    hits.y = smoothSignal(hits.y, audioBus.clap, 7.8, 3.4);
    hits.z = smoothSignal(
      hits.z,
      Math.max(audioBus.hat, audioBus.highFlux),
      9.2,
      3.8
    );

    const events = eventState.current;
    const seekVersion = audioBus.seekVersion || 0;
    if (seekVersion !== events.seekVersion) {
      events.seekVersion = seekVersion;
      events.kickCount = audioBus.kickHitCount || 0;
      events.clapCount = audioBus.clapHitCount || 0;
    } else {
      if (audioBus.isPlaying && (audioBus.kickHitCount || 0) !== events.kickCount) {
        events.pulseAge = 0;
        events.kickCount = audioBus.kickHitCount || 0;
      }
      if (audioBus.isPlaying && (audioBus.clapHitCount || 0) !== events.clapCount) {
        events.flashAge = 0;
        events.clapCount = audioBus.clapHitCount || 0;
      }
    }
    events.pulseAge += delta;
    events.flashAge += delta;
    uniforms.uPulseAge.value = events.pulseAge;
    uniforms.uFlashAge.value = events.flashAge;

    const bpm = audioBus.visualBpm || audioBus.bpm || 0;
    const beatOffset = audioBus.visualBeatOffset || audioBus.beatOffset || 0;
    uniforms.uBeatPhase.value = bpm
      ? (((audioBus.position - beatOffset) * bpm) / 60) % 1
      : 0;
    uniforms.uPlaying.value = THREE.MathUtils.damp(
      uniforms.uPlaying.value,
      audioBus.isPlaying ? 1 : 0,
      audioBus.isPlaying ? 8 : 4,
      delta
    );
  });

  return (
    <mesh position={[0, 0.58, 0.461]} renderOrder={3}>
      <planeGeometry args={[3.52, 0.62]} />
      <shaderMaterial
        uniforms={uniforms}
        defines={lowPower ? { LOW_POWER: 1 } : {}}
        vertexShader={spectrumVertexShader}
        fragmentShader={djFacadeFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

const liveCameraShots = [
  { position: [0, 2.15, 5.7], target: [0, 0.35, 0.55], fov: 46 },
  { position: [-4.7, 1.35, 2.75], target: [0.4, 0.05, 0.25], fov: 50 },
  { position: [4.35, 0.55, 2.35], target: [-0.35, 0.2, 0.35], fov: 48 },
  { position: [0.2, 4.8, 2.15], target: [0, -0.25, 0.4], fov: 52 },
  { position: [-2.6, 0.15, -1.35], target: [0.65, 0.15, 1.25], fov: 54 },
];

function LiveCameraPortal({ audioBus, lowPower }) {
  const { gl, scene } = useThree();
  const screen = useRef(null);
  const elapsed = useRef(0);
  const renderAccumulator = useRef(0);
  const shotIndex = useRef(0);
  const switchAt = useRef(5.5);
  const smoothTarget = useRef(new THREE.Vector3(...liveCameraShots[0].target));
  const desiredPosition = useMemo(() => new THREE.Vector3(), []);
  const desiredTarget = useMemo(() => new THREE.Vector3(), []);
  const liveCamera = useMemo(() => {
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 36);
    camera.position.fromArray(liveCameraShots[0].position);
    camera.lookAt(smoothTarget.current);
    return camera;
  }, []);
  const renderTarget = useMemo(() => {
    const size = lowPower ? 160 : 256;
    const target = new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    target.texture.generateMipmaps = false;
    target.texture.colorSpace = THREE.SRGBColorSpace;
    return target;
  }, [lowPower]);

  useEffect(() => () => renderTarget.dispose(), [renderTarget]);

  useFrame((state, delta) => {
    elapsed.current += delta;
    const time = elapsed.current;
    const onKick = (audioBus.kick || 0) > 0.34;
    if (
      time >= switchAt.current &&
      (onKick || !audioBus.isPlaying || time >= switchAt.current + 1.35)
    ) {
      const stride = 1 + ((audioBus.beatCount || 0) % 2);
      shotIndex.current = (shotIndex.current + stride) % liveCameraShots.length;
      switchAt.current = time + (audioBus.isPlaying ? 5.2 : 8.5);
    }

    const shot = liveCameraShots[shotIndex.current];
    const drift = audioBus.isPlaying ? 1 : 0.35;
    desiredPosition.fromArray(shot.position);
    desiredPosition.x +=
      Math.sin(time * 0.27 + shotIndex.current) * 0.13 * drift;
    desiredPosition.y += Math.sin(time * 0.19) * 0.07 * drift;
    desiredPosition.z +=
      Math.cos(time * 0.23 + shotIndex.current) * 0.1 * drift;
    desiredTarget.fromArray(shot.target);
    desiredTarget.x += Math.sin(time * 0.16) * 0.1 * drift;
    desiredTarget.y += (audioBus.body || 0) * 0.06;
    desiredTarget.z += Math.cos(time * 0.13) * 0.08 * drift;
    const moveBlend = 1 - Math.exp(-delta * 0.82);
    liveCamera.position.lerp(desiredPosition, moveBlend);
    smoothTarget.current.lerp(desiredTarget, moveBlend);
    liveCamera.fov = THREE.MathUtils.damp(liveCamera.fov, shot.fov, 1.4, delta);
    liveCamera.updateProjectionMatrix();
    liveCamera.lookAt(smoothTarget.current);

    renderAccumulator.current += delta;
    const frameInterval = 1 / (lowPower ? 6 : 12);
    if (renderAccumulator.current < frameInterval || !screen.current) return;
    renderAccumulator.current %= frameInterval;

    const previousTarget = gl.getRenderTarget();
    const xrEnabled = gl.xr.enabled;
    screen.current.visible = false;
    gl.xr.enabled = false;
    try {
      gl.setRenderTarget(renderTarget);
      gl.clear();
      gl.render(scene, liveCamera);
    } finally {
      gl.setRenderTarget(previousTarget);
      gl.xr.enabled = xrEnabled;
      screen.current.visible = true;
    }
  }, -1);

  return (
    <mesh ref={screen} position={[0, 1.56, -4.105]} renderOrder={1}>
      <circleGeometry args={[1.63, lowPower ? 40 : 64]} />
      <meshBasicMaterial map={renderTarget.texture} toneMapped={false} />
    </mesh>
  );
}

function WallSpectrumPanel({ audioBus, lowPower, side }) {
  const displayTime = useRef(0);
  const uniforms = useMemo(
    () => ({
      uLowBands: { value: new THREE.Vector3() },
      uHighBands: { value: new THREE.Vector2() },
      uHits: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uPlaying: { value: 0 },
      uMirror: { value: side > 0 ? 1 : 0 },
      uIntensity: { value: lowPower ? 0.68 : 0.86 },
    }),
    [lowPower, side]
  );
  const accent = side < 0 ? "#27c9ff" : "#ff357d";

  useFrame((_, delta) => {
    if (audioBus.isPlaying) displayTime.current += delta;

    uniforms.uTime.value = displayTime.current;
    uniforms.uLowBands.value.set(audioBus.sub, audioBus.bass, audioBus.lowMid);
    uniforms.uHighBands.value.set(audioBus.presence, audioBus.high);
    uniforms.uHits.value.set(
      audioBus.kick,
      audioBus.clap,
      Math.max(audioBus.hat, audioBus.highFlux)
    );
    uniforms.uPlaying.value = THREE.MathUtils.damp(
      uniforms.uPlaying.value,
      audioBus.isPlaying ? 1 : 0,
      audioBus.isPlaying ? 10 : 5,
      delta
    );
  });

  return (
    <group
      position={[side * 5.49, 2.3, -0.35]}
      rotation-y={side < 0 ? Math.PI / 2 : -Math.PI / 2}
    >
      <mesh>
        <boxGeometry args={[4.48, 0.94, 0.12]} />
        <meshStandardMaterial
          color="#0d0e15"
          metalness={0.86}
          roughness={0.27}
        />
      </mesh>
      <mesh position={[0, 0, 0.066]}>
        <planeGeometry args={[4.18, 0.7]} />
        <meshBasicMaterial color="#02040a" />
      </mesh>
      <mesh position={[0, 0, 0.071]} renderOrder={3}>
        <planeGeometry args={[4.12, 0.66]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={spectrumVertexShader}
          fragmentShader={spectrumFragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {[-1, 1].map((edge) => (
        <mesh key={`spectrum-edge-${edge}`} position={[edge * 2.18, 0, 0.075]}>
          <boxGeometry args={[0.045, 0.82, 0.05]} />
          <meshStandardMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={0.16}
            toneMapped={false}
          />
        </mesh>
      ))}
      {[-1.86, 0, 1.86].map((x, index) => (
        <mesh key={`spectrum-status-${x}`} position={[x, -0.405, 0.081]}>
          <circleGeometry args={[index === 1 ? 0.035 : 0.024, 16]} />
          <meshBasicMaterial
            color={index === 1 ? "#eefaff" : accent}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function ClubArchitecture({ audioBus, lowPower = false }) {
  const wallGeometry = useMemo(createClubWall, []);
  const speakerGeometry = useMemo(createSpeakerCabinet, []);
  const sideWallGeometry = useMemo(createSideWall, []);
  const rotorGeometry = useMemo(createRotor, []);
  const djBoothGeometry = useMemo(createDjBoothShell, []);
  const portal = useRef(null);
  const portalCore = useRef(null);
  const lightBars = useRef([]);
  const speakerCones = useRef([]);
  const speakerRings = useRef([]);
  const sideRings = useRef([]);
  const ceilingBars = useRef([]);
  const ventLights = useRef([]);
  const sideRotors = useRef([]);
  const stageMeters = useRef([]);
  const djPlatters = useRef([]);
  const djDeckRings = useRef([]);
  const djPadMaterials = useRef([]);
  const djScreen = useRef(null);

  useEffect(
    () => () => {
      wallGeometry.dispose();
      speakerGeometry.dispose();
      sideWallGeometry.dispose();
      rotorGeometry.dispose();
      djBoothGeometry.dispose();
    },
    [
      djBoothGeometry,
      rotorGeometry,
      sideWallGeometry,
      speakerGeometry,
      wallGeometry,
    ]
  );

  useFrame((state, delta) => {
    if (portal.current) {
      portal.current.emissiveIntensity =
        0.34 + audioBus.presence * 0.52 + audioBus.clap * 0.28;
    }

    if (portalCore.current) {
      portalCore.current.opacity =
        0.2 + audioBus.presence * 0.1 + audioBus.presenceFlux * 0.08;
    }

    lightBars.current.forEach((material, index) => {
      if (!material) return;

      const wave =
        0.5 +
        0.5 * Math.sin(state.clock.elapsedTime * 1.15 + index * 0.72);
      material.emissiveIntensity =
        0.14 +
        (audioBus.isPlaying ? wave * audioBus.lowMid * 0.36 : 0.025) +
        audioBus.lowMidFlux * (0.42 + index * 0.018);
    });

    speakerCones.current.forEach((cone, index) => {
      if (!cone) return;

      const lowEnd = Math.max(audioBus.bass * 0.82, audioBus.kick);
      const response = 1 + lowEnd * (index % 2 === 0 ? 0.07 : 0.045);
      cone.scale.setScalar(response);
      cone.position.z = 0.374 + lowEnd * 0.018;
      cone.material.emissiveIntensity = 0.035 + lowEnd * 0.18;
    });

    speakerRings.current.forEach((material, index) => {
      if (!material) return;
      material.emissiveIntensity =
        0.06 + audioBus.kick * 0.3 + audioBus.bass * (0.12 + index * 0.01);
    });

    sideRings.current.forEach((material, index) => {
      if (!material) return;

      const chaseIndex =
        (audioBus.clapHitCount + audioBus.hatHitCount) %
        sideRings.current.length;
      const isActive = index === chaseIndex;
      const idleWave =
        0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 0.62 + index * 1.37);
      material.emissiveIntensity =
        0.08 +
        (audioBus.isPlaying ? idleWave * audioBus.presence * 0.16 : 0.02) +
        (isActive
          ? audioBus.presenceFlux * 0.66
          : audioBus.clap * 0.06);
    });

    ceilingBars.current.forEach((material, index) => {
      if (!material) return;
      const isActive = index === audioBus.hatHitCount % ceilingRibs.length;
      material.emissiveIntensity =
        0.06 +
        audioBus.high * 0.18 +
        (isActive ? Math.max(audioBus.highFlux, audioBus.hat) * 0.62 : 0);
    });

    ventLights.current.forEach((material, index) => {
      if (!material) return;
      const alternatingAccent = (audioBus.beatCount + index) % 3 === 0;
      material.emissiveIntensity =
        0.04 +
        audioBus.lowMid * 0.16 +
        (alternatingAccent ? audioBus.lowMidFlux * 0.34 : 0);
    });

    sideRotors.current.forEach((rotor, index) => {
      if (!rotor) return;

      if (audioBus.isPlaying) {
        const direction = index % 2 === 0 ? 1 : -1;
        rotor.rotation.z +=
          delta *
          direction *
          (0.16 + audioBus.presence * 0.72 + audioBus.lowMid * 0.14);
      }

      const targetScale =
        1 + audioBus.presenceFlux * 0.045 + audioBus.clap * 0.018;
      const scale = THREE.MathUtils.damp(
        rotor.scale.x,
        targetScale,
        targetScale > rotor.scale.x ? 14 : 7,
        delta
      );
      rotor.scale.setScalar(scale);
    });

    stageMeters.current.forEach((meter, index) => {
      if (!meter) return;

      const band =
        index % 3 === 0
          ? audioBus.lowMid
          : index % 3 === 1
            ? audioBus.presence
            : audioBus.high;
      const chase = index === audioBus.beatCount % stageSegments.length ? 1 : 0;
      const targetScale =
        0.42 + band * 1.18 + audioBus.lowMidFlux * 0.22;
      meter.scale.y = THREE.MathUtils.damp(
        meter.scale.y,
        targetScale,
        targetScale > meter.scale.y ? 16 : 7,
        delta
      );
      meter.material.emissiveIntensity =
        0.08 + band * 0.42 + chase * audioBus.beat * 0.55;
    });

    djPlatters.current.forEach((platter, index) => {
      if (!platter || !audioBus.isPlaying) return;
      const direction = index === 0 ? 1 : -1;
      platter.rotation.y +=
        delta * direction * (1.05 + (audioBus.bpm || 120) / 150);
    });

    djDeckRings.current.forEach((material) => {
      if (!material) return;
      material.emissiveIntensity =
        0.12 + audioBus.bass * 0.42 + audioBus.kick * 0.7;
    });

    djPadMaterials.current.forEach((material, index) => {
      if (!material) return;
      const visiblePadCount = lowPower ? djPadSegments.length / 2 : djPadSegments.length;
      const activePadIndex =
        (audioBus.clapHitCount + audioBus.hatHitCount) % visiblePadCount;
      const activePad = lowPower ? activePadIndex * 2 : activePadIndex;
      const isActive = index === activePad;
      material.emissiveIntensity =
        0.08 +
        audioBus.presence * 0.2 +
        (isActive ? Math.max(audioBus.clap, audioBus.hat, audioBus.highFlux) : 0) *
          0.9;
    });

    if (djScreen.current) {
      djScreen.current.emissiveIntensity =
        0.16 + audioBus.presence * 0.34 + audioBus.highFlux * 0.52;
    }
  });

  return (
    <group>
      <mesh
        geometry={wallGeometry}
        position={[0, 1.38, -4.45]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#111119"
          metalness={0.62}
          roughness={0.42}
        />
      </mesh>

      <mesh position={[0, 1.56, -4.62]}>
        <circleGeometry args={[1.66, 72]} />
        <meshBasicMaterial
          ref={portalCore}
          color="#291144"
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      <LiveCameraPortal audioBus={audioBus} lowPower={lowPower} />
      <mesh position={[0, 1.56, -4.09]}>
        <torusGeometry args={[1.82, 0.075, 16, 96]} />
        <meshStandardMaterial
          ref={portal}
          color="#6d36a8"
          emissive="#8f3cff"
          emissiveIntensity={0.42}
          metalness={0.35}
          roughness={0.25}
        />
      </mesh>

      {[-3.75, 3.75].map((x, rackIndex) => (
        <group key={x} position={[x, 1.44, -4.1]}>
          {bars.map((index) => {
            const materialIndex = rackIndex * bars.length + index;
            const isCyan = (index + rackIndex) % 2 === 0;

            return (
              <mesh key={index} position={[0, -1.14 + index * 0.325, 0]}>
                <boxGeometry args={[1.72, 0.075, 0.07]} />
                <meshStandardMaterial
                  ref={(material) => {
                    lightBars.current[materialIndex] = material;
                  }}
                  color={isCyan ? "#29bfff" : "#ff2a75"}
                  emissive={isCyan ? "#29bfff" : "#ff2a75"}
                  emissiveIntensity={0.22}
                  toneMapped={false}
                />
              </mesh>
            );
          })}
        </group>
      ))}

      <mesh position={[0, -0.68, -3.52]} castShadow receiveShadow>
        <boxGeometry args={[5.5, 0.58, 1.35]} />
        <meshStandardMaterial
          color="#15151e"
          metalness={0.72}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, -0.37, -3.15]}>
        <boxGeometry args={[4.65, 0.055, 0.58]} />
        <meshStandardMaterial
          color="#8f42ff"
          emissive="#8f42ff"
          emissiveIntensity={0.28}
          toneMapped={false}
        />
      </mesh>

      <group position={[0, -0.67, -2.83]}>
        {stageSegments.map((index) => {
          const colors = ["#27c9ff", "#f2edf9", "#ff357d"];
          const color = colors[index % colors.length];

          return (
            <mesh
              key={index}
              ref={(mesh) => {
                stageMeters.current[index] = mesh;
              }}
              position={[-2.28 + index * 0.415, 0, 0]}
              scale-y={0.42}
            >
              <boxGeometry args={[0.24, 0.22, 0.025]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.08}
                metalness={0.35}
                roughness={0.28}
                toneMapped={false}
              />
            </mesh>
          );
        })}
      </group>

      <group position={[0, -0.91, -2.95]}>
        <mesh
          geometry={djBoothGeometry}
          position={[0, 0.56, 0]}
          castShadow={!lowPower}
          receiveShadow
        >
          <meshStandardMaterial
            color="#101018"
            metalness={0.78}
            roughness={0.3}
          />
        </mesh>

        <mesh position={[0, 0.58, 0.442]}>
          <boxGeometry args={[3.74, 0.74, 0.032]} />
          <meshStandardMaterial
            color="#080811"
            metalness={0.48}
            roughness={0.42}
          />
        </mesh>
        <DjFacadeGenerativeDisplay audioBus={audioBus} lowPower={lowPower} />

        <mesh position={[0, 1.14, 0.02]} castShadow={!lowPower} receiveShadow>
          <boxGeometry args={[4.72, 0.1, 1.08]} />
          <meshStandardMaterial
            color="#282936"
            metalness={0.88}
            roughness={0.22}
          />
        </mesh>

        {[-1, 1].map((side, deckIndex) => (
          <group key={`dj-deck-${side}`} position={[side * 1.34, 1.24, -0.22]}>
            <mesh castShadow={!lowPower}>
              <boxGeometry args={[1.15, 0.09, 0.72]} />
              <meshStandardMaterial
                color="#171821"
                metalness={0.76}
                roughness={0.28}
              />
            </mesh>

            <group
              ref={(group) => {
                djPlatters.current[deckIndex] = group;
              }}
              position={[0, 0.075, 0]}
            >
              <mesh>
                <cylinderGeometry args={[0.31, 0.31, 0.045, 36]} />
                <meshStandardMaterial
                  color="#0a0b10"
                  metalness={0.86}
                  roughness={0.24}
                />
              </mesh>
              <mesh position={[0, 0.027, 0.17]}>
                <boxGeometry args={[0.035, 0.016, 0.16]} />
                <meshBasicMaterial color="#e9ecf6" />
              </mesh>
              <mesh position={[0, 0.027, 0]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.315, 0.018, 8, 40]} />
                <meshStandardMaterial
                  ref={(material) => {
                    djDeckRings.current[deckIndex] = material;
                  }}
                  color={side < 0 ? "#27c9ff" : "#ff357d"}
                  emissive={side < 0 ? "#27c9ff" : "#ff357d"}
                  emissiveIntensity={0.12}
                  toneMapped={false}
                />
              </mesh>
            </group>

            <mesh position={[side * -0.43, 0.085, 0.23]}>
              <boxGeometry args={[0.11, 0.025, 0.11]} />
              <meshStandardMaterial
                color={side < 0 ? "#27c9ff" : "#ff357d"}
                emissive={side < 0 ? "#27c9ff" : "#ff357d"}
                emissiveIntensity={0.1}
                toneMapped={false}
              />
            </mesh>
          </group>
        ))}

        <group position={[0, 1.245, -0.2]}>
          <mesh castShadow={!lowPower}>
            <boxGeometry args={[0.9, 0.1, 0.74]} />
            <meshStandardMaterial
              color="#14151d"
              metalness={0.74}
              roughness={0.3}
            />
          </mesh>

          {(lowPower ? [-0.24, 0, 0.24] : [-0.3, -0.15, 0, 0.15, 0.3]).map(
            (x, index) => (
              <group key={`mixer-channel-${x}`} position={[x, 0.075, -0.08]}>
                <mesh>
                  <cylinderGeometry args={[0.032, 0.032, 0.035, 12]} />
                  <meshStandardMaterial
                    color="#a9abb8"
                    metalness={0.9}
                    roughness={0.2}
                  />
                </mesh>
                <mesh position={[0, 0, 0.23]}>
                  <boxGeometry args={[0.035, 0.026, 0.18]} />
                  <meshStandardMaterial
                    color={djControlColors[index % djControlColors.length]}
                    emissive={djControlColors[index % djControlColors.length]}
                    emissiveIntensity={0.08}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            )
          )}
        </group>

        {(lowPower
          ? djPadSegments.filter((index) => index % 2 === 0)
          : djPadSegments
        ).map((index) => {
          const column = index % 4;
          const row = Math.floor(index / 4);
          const color = index % 2 === 0 ? "#27c9ff" : "#ff357d";

          return (
            <mesh
              key={`dj-pad-${index}`}
              position={[-0.27 + column * 0.18, 1.325, -0.34 + row * 0.16]}
            >
              <boxGeometry args={[0.12, 0.025, 0.12]} />
              <meshStandardMaterial
                ref={(material) => {
                  djPadMaterials.current[index] = material;
                }}
                color={color}
                emissive={color}
                emissiveIntensity={0.08}
                toneMapped={false}
              />
            </mesh>
          );
        })}

        <mesh position={[0, 1.31, -0.25]} rotation-x={-0.12} castShadow={!lowPower}>
          <boxGeometry args={[1.22, 0.045, 0.5]} />
          <meshStandardMaterial
            color="#20212b"
            metalness={0.78}
            roughness={0.28}
          />
        </mesh>
        <group
          position={[0.92, 1.56, -0.45]}
          rotation={[-0.08, -2.05, 0]}
          scale={0.78}
        >
          <mesh castShadow={!lowPower}>
            <boxGeometry args={[1.18, 0.68, 0.055]} />
            <meshStandardMaterial
              color="#171821"
              metalness={0.82}
              roughness={0.25}
            />
          </mesh>
          <mesh position={[0, 0, 0.031]}>
            <planeGeometry args={[1.04, 0.54]} />
            <meshStandardMaterial
              ref={djScreen}
              color="#17152d"
              emissive="#7f42ff"
              emissiveIntensity={0.16}
              metalness={0.2}
              roughness={0.34}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <ringGeometry args={[0.09, 0.135, 32]} />
            <meshBasicMaterial
              color="#d7c8ff"
              transparent
              opacity={0.62}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>

        {[-1, 1].map((side) => (
          <mesh key={`booth-edge-${side}`} position={[side * 2.04, 0.58, 0.455]}>
            <boxGeometry args={[0.045, 0.82, 0.035]} />
            <meshStandardMaterial
              color={side < 0 ? "#27c9ff" : "#ff357d"}
              emissive={side < 0 ? "#27c9ff" : "#ff357d"}
              emissiveIntensity={0.18}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      {[-1, 1].map((side, sideIndex) => (
        <group key={`speaker-${side}`} position={[side * 5.08, 0.66, -3.83]}>
          <mesh geometry={speakerGeometry} castShadow receiveShadow>
            <meshStandardMaterial
              color="#101016"
              metalness={0.72}
              roughness={0.38}
            />
          </mesh>

          {speakerDrivers.map((driver, driverIndex) => {
            const refIndex = sideIndex * speakerDrivers.length + driverIndex;

            return (
              <group key={driver.y} position={[0, driver.y, 0]}>
                <mesh
                  ref={(mesh) => {
                    speakerCones.current[refIndex] = mesh;
                  }}
                  position={[0, 0, 0.374]}
                >
                  <circleGeometry args={[driver.radius, 48]} />
                  <meshStandardMaterial
                    color="#090a0f"
                    emissive={side < 0 ? "#163a52" : "#4a1734"}
                    emissiveIntensity={0.035}
                    metalness={0.28}
                    roughness={0.7}
                  />
                </mesh>
                <mesh position={[0, 0, 0.39]}>
                  <circleGeometry args={[driver.radius * 0.31, 40]} />
                  <meshStandardMaterial
                    color="#20212b"
                    metalness={0.55}
                    roughness={0.38}
                  />
                </mesh>
                <mesh position={[0, 0, 0.397]}>
                  <torusGeometry args={[driver.radius, 0.035, 12, 48]} />
                  <meshStandardMaterial
                    ref={(material) => {
                      speakerRings.current[refIndex] = material;
                    }}
                    color={side < 0 ? "#2bc9ff" : "#ff2f79"}
                    emissive={side < 0 ? "#2bc9ff" : "#ff2f79"}
                    emissiveIntensity={0.06}
                    metalness={0.5}
                    roughness={0.32}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            );
          })}

          <mesh position={[0, -1.23, 0.39]}>
            <boxGeometry args={[0.66, 0.1, 0.025]} />
            <meshBasicMaterial color="#020207" />
          </mesh>

          {!lowPower && cabinetBolts.map(([x, y]) => (
            <mesh key={`${x}-${y}`} position={[x, y, 0.375]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.032, 0.032, 0.035, 12]} />
              <meshStandardMaterial
                color="#838494"
                metalness={0.95}
                roughness={0.22}
              />
            </mesh>
          ))}

          <mesh position={[0, -1.52, 0.378]}>
            <boxGeometry args={[0.42, 0.055, 0.025]} />
            <meshStandardMaterial
              color={side < 0 ? "#2bc9ff" : "#ff2f79"}
              emissive={side < 0 ? "#2bc9ff" : "#ff2f79"}
              emissiveIntensity={0.1}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      <WallSpectrumPanel audioBus={audioBus} lowPower={lowPower} side={-1} />
      <WallSpectrumPanel audioBus={audioBus} lowPower={lowPower} side={1} />

      {[-1, 1].map((side, sideIndex) => (
        <group key={`side-wall-${side}`}>
          <mesh
            geometry={sideWallGeometry}
            position={[side * 5.78, 0.82, -0.35]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color="#12121a"
              metalness={0.68}
              roughness={0.4}
            />
          </mesh>

          {sideOpenings.map((z, openingIndex) => {
            const refIndex = sideIndex * sideOpenings.length + openingIndex;
            const color =
              (openingIndex + sideIndex) % 2 === 0 ? "#26c9ff" : "#ff317c";

            return (
              <group
                key={z}
                position={[side * 5.57, 1.2, -0.35 + z]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <mesh position={[0, 0, side * 0.012]}>
                  <circleGeometry args={[0.665, 48]} />
                  <meshBasicMaterial
                    color="#080812"
                    transparent
                    opacity={0.72}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                <group
                  ref={(group) => {
                    sideRotors.current[refIndex] = group;
                  }}
                  position={[0, 0, side * 0.024]}
                >
                  <mesh geometry={rotorGeometry}>
                    <meshStandardMaterial
                      color="#282933"
                      metalness={0.86}
                      roughness={0.32}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                  <mesh position={[0, 0, 0.025]}>
                    <circleGeometry args={[0.135, 32]} />
                    <meshStandardMaterial
                      color="#111219"
                      emissive={color}
                      emissiveIntensity={0.08}
                      metalness={0.72}
                      roughness={0.26}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                  <mesh position={[0, 0, 0.032]}>
                    <torusGeometry args={[0.17, 0.018, 8, 32]} />
                    <meshStandardMaterial
                      color="#777986"
                      metalness={0.9}
                      roughness={0.22}
                    />
                  </mesh>
                </group>
                <mesh>
                  <torusGeometry args={[0.76, 0.035, 12, 56]} />
                  <meshStandardMaterial
                    ref={(material) => {
                      sideRings.current[refIndex] = material;
                    }}
                    color={color}
                    emissive={color}
                    emissiveIntensity={0.08}
                    metalness={0.48}
                    roughness={0.3}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            );
          })}

          {sideOpenings.map((z, openingIndex) => {
            const refIndex = sideIndex * sideOpenings.length + openingIndex;
            const color =
              (openingIndex + sideIndex) % 2 === 0 ? "#26c9ff" : "#ff317c";

            return (
              <group
                key={`vent-${z}`}
                position={[side * 5.57, -0.46, -0.35 + z]}
              >
                {(lowPower ? [0] : [-0.27, 0, 0.27]).map((offset) => (
                  <mesh key={offset} position={[0, 0, offset]}>
                    <boxGeometry args={[0.035, 0.065, 0.19]} />
                    <meshStandardMaterial
                      ref={(material) => {
                        if (offset === 0) ventLights.current[refIndex] = material;
                      }}
                      color={color}
                      emissive={color}
                      emissiveIntensity={0.04}
                      metalness={0.45}
                      roughness={0.3}
                      toneMapped={false}
                    />
                  </mesh>
                ))}
              </group>
            );
          })}

          <mesh position={[side * 5.55, 2.25, -0.35]} castShadow>
            <boxGeometry args={[0.055, 0.075, 4.35]} />
            <meshStandardMaterial
              color="#393a45"
              metalness={0.9}
              roughness={0.25}
            />
          </mesh>
          {sideOpenings.map((z, openingIndex) => {
            const color =
              (openingIndex + sideIndex) % 2 === 0 ? "#26c9ff" : "#ff317c";

            return (
              <group key={`conduit-${z}`}>
                <mesh position={[side * 5.55, 1.76, -0.35 + z]} castShadow>
                  <boxGeometry args={[0.055, 0.92, 0.05]} />
                  <meshStandardMaterial
                    color="#33343e"
                    metalness={0.88}
                    roughness={0.28}
                  />
                </mesh>
                <mesh position={[side * 5.52, 2.25, -0.35 + z]}>
                  <boxGeometry args={[0.075, 0.18, 0.26]} />
                  <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={0.06}
                    metalness={0.58}
                    roughness={0.3}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
      ))}

      {ceilingRibs.map((z, index) => (
        <group key={z} position={[0, 5.52, z]}>
          <mesh castShadow>
            <boxGeometry args={[11.5, 0.13, 0.18]} />
            <meshStandardMaterial
              color="#171720"
              metalness={0.82}
              roughness={0.28}
            />
          </mesh>
          <mesh position={[0, -0.085, 0]}>
            <boxGeometry args={[10.7, 0.025, 0.055]} />
            <meshStandardMaterial
              ref={(material) => {
                ceilingBars.current[index] = material;
              }}
              color={index % 2 === 0 ? "#24566b" : "#682642"}
              emissive={index % 2 === 0 ? "#1c8db4" : "#c32964"}
              emissiveIntensity={0.12}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      {[-1, 1].flatMap((side) =>
        ceilingRibs.map((z, index) => (
          <group key={`upper-support-${side}-${z}`}>
            <mesh position={[side * 5.66, 4.08, z]} castShadow>
              <boxGeometry args={[0.16, 2.82, 0.16]} />
              <meshStandardMaterial
                color="#171720"
                metalness={0.84}
                roughness={0.27}
              />
            </mesh>
            <mesh
              position={[side * 5.25, 4.64, z]}
              rotation-z={side * -0.62}
              castShadow
            >
              <boxGeometry args={[1.28, 0.095, 0.105]} />
              <meshStandardMaterial
                color={index % 2 === 0 ? "#202b32" : "#302029"}
                metalness={0.78}
                roughness={0.3}
              />
            </mesh>
          </group>
        ))
      )}

      {fixtureMounts.map(([x, y, z], index) => {
        const cableLength = 5.46 - y;

        return (
          <group key={`fixture-mount-${x}-${z}`}>
            <mesh position={[x, y + cableLength * 0.5, z]}>
              <cylinderGeometry args={[0.012, 0.012, cableLength, 8]} />
              <meshStandardMaterial
                color="#454653"
                metalness={0.92}
                roughness={0.24}
              />
            </mesh>
            <mesh position={[x, y + 0.08, z]} castShadow>
              <cylinderGeometry args={[0.13, 0.18, 0.24, 16]} />
              <meshStandardMaterial
                color="#13131a"
                metalness={0.82}
                roughness={0.3}
              />
            </mesh>
            <mesh position={[x, y - 0.045, z]} rotation-x={Math.PI / 2}>
              <circleGeometry args={[0.105, 20]} />
              <meshStandardMaterial
                color={index % 2 === 0 ? "#79ddff" : "#ff6b9c"}
                emissive={index % 2 === 0 ? "#29bfff" : "#ff2a75"}
                emissiveIntensity={0.16}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}

      <mesh position={[0, 5.48, -1.25]} castShadow>
        <boxGeometry args={[9.4, 0.12, 0.16]} />
        <meshStandardMaterial color="#191922" metalness={0.8} roughness={0.28} />
      </mesh>
      <mesh position={[-4.4, 2.24, -1.25]} castShadow>
        <boxGeometry args={[0.12, 6.48, 0.16]} />
        <meshStandardMaterial color="#191922" metalness={0.8} roughness={0.28} />
      </mesh>
      <mesh position={[4.4, 2.24, -1.25]} castShadow>
        <boxGeometry args={[0.12, 6.48, 0.16]} />
        <meshStandardMaterial color="#191922" metalness={0.8} roughness={0.28} />
      </mesh>

      <pointLight
        position={[0, 1.55, -3.75]}
        color="#8f3cff"
        intensity={3.2}
        distance={6}
        decay={2}
      />
    </group>
  );
}
