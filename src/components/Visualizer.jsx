import * as THREE from "three";
import { Html, Sphere } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { analyzePercussionOnsets } from "../audio/beatAnalysis";
import fragmentShader from "../shaders/sphere/fragment.glsl";
import vertexShader from "../shaders/sphere/vertex.glsl";

const VISUAL_LEAD_SECONDS = 0.025;
const trackCache = new Map();

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

const follow = (current, target, delta, attack, release) => {
  const time = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-delta / time));
};

const loadAndAnalyzeTrack = (source, context) => {
  if (!trackCache.has(source)) {
    const loadBuffer =
      source instanceof Blob
        ? source
            .arrayBuffer()
            .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
        : new THREE.AudioLoader().loadAsync(source);
    const promise = loadBuffer
      .then(async (buffer) => ({
        buffer,
        analysis: await analyzePercussionOnsets(buffer),
      }))
      .catch((error) => {
        trackCache.delete(source);
        throw error;
      });

    trackCache.set(source, promise);
  }

  return trackCache.get(source);
};

export const createAudioBus = () => ({
  status: "idle",
  isPlaying: false,
  position: 0,
  duration: 0,
  seek: null,
  seekVersion: 0,
  beat: 0,
  impact: 0,
  kick: 0,
  clap: 0,
  hat: 0,
  body: 0,
  sub: 0,
  bass: 0,
  lowMid: 0,
  presence: 0,
  high: 0,
  mid: 0,
  treble: 0,
  subFlux: 0,
  bassFlux: 0,
  lowMidFlux: 0,
  presenceFlux: 0,
  highFlux: 0,
  beatCount: 0,
  impactCount: 0,
  kickHitCount: 0,
  clapHitCount: 0,
  hatHitCount: 0,
  bpm: null,
  visualBpm: null,
  beatOffset: 0,
  visualBeatOffset: 0,
  loudness: 0,
  onsetCount: 0,
  kickCount: 0,
  clapCount: 0,
  hatCount: 0,
});

class MusicReactiveEngine {
  constructor(listener, audioBus) {
    this.audioBus = audioBus;
    this.context = listener.context;
    this.sound = new THREE.Audio(listener);
    this.analyser = new THREE.AudioAnalyser(this.sound, 2048);
    this.analyser.analyser.smoothingTimeConstant = 0.55;
    this.analyser.analyser.minDecibels = -90;
    this.analyser.analyser.maxDecibels = -18;
    this.previousFrequencyData = new Uint8Array(
      this.analyser.analyser.frequencyBinCount
    );
    this.timeDomainData = new Float32Array(this.analyser.analyser.fftSize);
    this.bandCalibration = new Map();
    this.skipFluxFrame = true;
    this.analysis = null;
    this.onsetCursor = 0;
    this.previousSyncPosition = -1;
    this.lastComfortFlash = -Infinity;
    this.disposed = false;
  }

  async load(path) {
    this.audioBus.status = "analyzing";
    this.audioBus.isPlaying = false;
    this.audioBus.bpm = null;
    this.audioBus.visualBpm = null;
    this.audioBus.beatOffset = 0;
    this.audioBus.visualBeatOffset = 0;
    this.audioBus.loudness = 0;
    this.audioBus.position = 0;
    this.audioBus.duration = 0;
    this.audioBus.onsetCount = 0;
    this.audioBus.kickCount = 0;
    this.audioBus.clapCount = 0;
    this.audioBus.hatCount = 0;
    this.audioBus.beatCount = 0;
    this.audioBus.impactCount = 0;
    this.audioBus.kickHitCount = 0;
    this.audioBus.clapHitCount = 0;
    this.audioBus.hatHitCount = 0;
    this.audioBus.beat = 0;
    this.audioBus.impact = 0;
    this.audioBus.kick = 0;
    this.audioBus.clap = 0;
    this.audioBus.hat = 0;
    this.audioBus.body = 0;
    this.audioBus.sub = 0;
    this.audioBus.bass = 0;
    this.audioBus.lowMid = 0;
    this.audioBus.presence = 0;
    this.audioBus.high = 0;
    this.audioBus.mid = 0;
    this.audioBus.treble = 0;
    this.audioBus.subFlux = 0;
    this.audioBus.bassFlux = 0;
    this.audioBus.lowMidFlux = 0;
    this.audioBus.presenceFlux = 0;
    this.audioBus.highFlux = 0;
    const { buffer, analysis } = await loadAndAnalyzeTrack(path, this.context);
    if (this.disposed) return null;

    this.analysis = analysis;
    this.audioBus.bpm = analysis.musicalBpm || analysis.bpm;
    this.audioBus.visualBpm = analysis.visualBpm || this.audioBus.bpm;
    this.audioBus.beatOffset = analysis.beatOffset || 0;
    this.audioBus.visualBeatOffset =
      analysis.visualBeatOffset ?? this.audioBus.beatOffset;
    this.audioBus.onsetCount = analysis.onsets.length;
    this.audioBus.kickCount = analysis.kickCount;
    this.audioBus.clapCount = analysis.clapCount;
    this.audioBus.hatCount = analysis.hatCount;
    this.sound.setBuffer(buffer);
    this.sound.setLoop(true);
    this.sound.setVolume(0.72);
    this.audioBus.position = 0;
    this.audioBus.duration = buffer.duration;
    this.audioBus.status = "ready";
    this.bandCalibration.clear();
    this.previousFrequencyData.fill(0);
    this.skipFluxFrame = true;

    return analysis;
  }

  async play() {
    if (!this.sound.buffer || this.sound.isPlaying) return;

    await this.context.resume();
    if (this.disposed || this.sound.isPlaying) return;

    this.sound.play();
    this.skipFluxFrame = true;
    this.audioBus.isPlaying = true;
    this.audioBus.status = "playing";
  }

  pause() {
    if (this.sound.isPlaying) this.sound.pause();
    this.audioBus.position = this.getPlaybackPosition();
    this.audioBus.isPlaying = false;
    this.audioBus.status = this.analysis ? "paused" : "idle";
  }

  seek(position) {
    if (!this.sound.buffer) return 0;

    const duration = this.sound.duration || this.sound.buffer.duration;
    const nextPosition = THREE.MathUtils.clamp(
      Number.isFinite(position) ? position : 0,
      0,
      Math.max(duration - 0.001, 0)
    );
    const wasPlaying = this.sound.isPlaying;

    if (wasPlaying) this.sound.pause();

    this.sound.offset = 0;
    this.sound._progress = nextPosition;
    this.audioBus.position = nextPosition;
    this.audioBus.beat = 0;
    this.audioBus.impact = 0;
    this.audioBus.kick = 0;
    this.audioBus.clap = 0;
    this.audioBus.hat = 0;
    this.audioBus.body = 0;
    this.audioBus.subFlux = 0;
    this.audioBus.bassFlux = 0;
    this.audioBus.lowMidFlux = 0;
    this.audioBus.presenceFlux = 0;
    this.audioBus.highFlux = 0;

    const syncPosition = nextPosition + VISUAL_LEAD_SECONDS;
    const cursorPosition = Math.min(syncPosition, duration);
    const onsets = this.analysis?.onsets || [];
    let low = 0;
    let high = onsets.length;

    while (low < high) {
      const middle = (low + high) >> 1;
      if (onsets[middle].time <= cursorPosition) low = middle + 1;
      else high = middle;
    }

    this.onsetCursor = low;
    this.previousSyncPosition = syncPosition;
    this.lastComfortFlash = syncPosition;
    let kickHits = 0;
    let clapHits = 0;
    let hatHits = 0;

    for (let index = 0; index < low; index += 1) {
      const type = onsets[index].type;
      if (type === "kick" || type === "both") kickHits += 1;
      if (type === "clap" || type === "both") clapHits += 1;
      if (type === "hat") hatHits += 1;
    }

    this.audioBus.kickHitCount = kickHits;
    this.audioBus.clapHitCount = clapHits;
    this.audioBus.hatHitCount = hatHits;
    this.audioBus.beatCount = this.audioBus.bpm
      ? Math.floor(
          (Math.max(0, nextPosition - this.audioBus.beatOffset) *
            this.audioBus.bpm) /
            60
        )
      : 0;
    this.audioBus.seekVersion += 1;
    this.skipFluxFrame = true;

    if (wasPlaying) this.sound.play();
    return nextPosition;
  }

  readBandFeatures(data, minimumHz, maximumHz) {
    const binWidth = this.context.sampleRate / this.analyser.analyser.fftSize;
    const firstBin = Math.max(0, Math.floor(minimumHz / binWidth));
    const lastBin = Math.min(
      data.length - 1,
      Math.ceil(maximumHz / binWidth)
    );
    let sumSquares = 0;
    let fluxSquares = 0;

    for (let bin = firstBin; bin <= lastBin; bin += 1) {
      const normalized = data[bin] / 255;
      const previous = this.previousFrequencyData[bin] / 255;
      const positiveChange = Math.max(0, normalized - previous);
      sumSquares += normalized * normalized;
      fluxSquares += positiveChange * positiveChange;
    }

    const binCount = Math.max(1, lastBin - firstBin + 1);
    return {
      energy: Math.sqrt(sumSquares / binCount),
      flux: Math.sqrt(fluxSquares / binCount),
    };
  }

  normalizeFeature(key, value, delta, initialPeak = 0.08) {
    let calibration = this.bandCalibration.get(key);

    if (!calibration) {
      calibration = { floor: 0, peak: Math.max(initialPeak, value) };
      this.bandCalibration.set(key, calibration);
    }

    calibration.floor = follow(
      calibration.floor,
      value,
      delta,
      value < calibration.floor ? 0.65 : 8,
      value < calibration.floor ? 0.65 : 8
    );
    calibration.peak = follow(
      calibration.peak,
      value,
      delta,
      value > calibration.peak ? 0.06 : 3.8,
      value > calibration.peak ? 0.06 : 3.8
    );
    calibration.peak = Math.max(
      calibration.peak,
      calibration.floor + initialPeak * 0.18
    );

    const normalized = clamp01(
      (value - calibration.floor) /
        Math.max(calibration.peak - calibration.floor, 0.0001)
    );
    return Math.pow(normalized, 0.82);
  }

  getPlaybackPosition() {
    if (!this.sound.buffer) return 0;

    const elapsed = this.sound.isPlaying
      ? Math.max(this.context.currentTime - this.sound._startedAt, 0) *
        this.sound.playbackRate
      : 0;
    const duration = this.sound.duration || this.sound.buffer.duration;
    return (this.sound._progress + this.sound.offset + elapsed) % duration;
  }

  settle(delta) {
    this.audioBus.loudness = follow(
      this.audioBus.loudness,
      0,
      delta,
      0.04,
      0.28
    );
    this.audioBus.sub = follow(this.audioBus.sub, 0, delta, 0.04, 0.22);
    this.audioBus.bass = follow(this.audioBus.bass, 0, delta, 0.04, 0.18);
    this.audioBus.lowMid = follow(
      this.audioBus.lowMid,
      0,
      delta,
      0.05,
      0.24
    );
    this.audioBus.presence = follow(
      this.audioBus.presence,
      0,
      delta,
      0.045,
      0.2
    );
    this.audioBus.high = follow(this.audioBus.high, 0, delta, 0.025, 0.13);
    this.audioBus.mid = follow(this.audioBus.mid, 0, delta, 0.05, 0.2);
    this.audioBus.treble = follow(this.audioBus.treble, 0, delta, 0.04, 0.16);
    this.audioBus.subFlux = follow(this.audioBus.subFlux, 0, delta, 0.02, 0.1);
    this.audioBus.bassFlux = follow(this.audioBus.bassFlux, 0, delta, 0.02, 0.1);
    this.audioBus.lowMidFlux = follow(
      this.audioBus.lowMidFlux,
      0,
      delta,
      0.02,
      0.1
    );
    this.audioBus.presenceFlux = follow(
      this.audioBus.presenceFlux,
      0,
      delta,
      0.02,
      0.09
    );
    this.audioBus.highFlux = follow(
      this.audioBus.highFlux,
      0,
      delta,
      0.012,
      0.075
    );
    this.audioBus.beat *= Math.exp(-delta / 0.16);
    this.audioBus.impact *= Math.exp(-delta / 0.14);
    this.audioBus.kick *= Math.exp(-delta / 0.16);
    this.audioBus.clap *= Math.exp(-delta / 0.12);
    this.audioBus.hat *= Math.exp(-delta / 0.075);
    this.audioBus.body *= Math.exp(-delta / 0.3);
  }

  triggerOnsets(until, after = -1) {
    const onsets = this.analysis?.onsets || [];

    while (
      this.onsetCursor < onsets.length &&
      onsets[this.onsetCursor].time <= until
    ) {
      const onset = onsets[this.onsetCursor];

      if (onset.time > after) {
        const isKick = onset.type === "kick" || onset.type === "both";
        const isClap = onset.type === "clap" || onset.type === "both";
        const isHat = onset.type === "hat";

        if (isKick) {
          this.audioBus.kick = Math.max(this.audioBus.kick, onset.strength);
          this.audioBus.kickHitCount += 1;
        }
        if (isClap) {
          this.audioBus.clap = Math.max(this.audioBus.clap, onset.strength);
          this.audioBus.clapHitCount += 1;
        }
        if (isHat) {
          this.audioBus.hat = Math.max(this.audioBus.hat, onset.strength);
          this.audioBus.highFlux = Math.max(
            this.audioBus.highFlux,
            onset.strength * 0.82
          );
          this.audioBus.hatHitCount += 1;
        } else {
          this.audioBus.impact = Math.max(this.audioBus.impact, onset.strength);
          this.audioBus.body = Math.max(
            this.audioBus.body,
            0.38 + onset.strength * 0.5
          );
          this.audioBus.impactCount += 1;
        }

        if (!isHat && onset.time - this.lastComfortFlash >= 0.24) {
          this.audioBus.beat = Math.max(
            this.audioBus.beat,
            0.34 + onset.strength * 0.36
          );
          this.audioBus.beatCount += 1;
          this.lastComfortFlash = onset.time;
        }
      }

      this.onsetCursor += 1;
    }
  }

  update(delta) {
    this.audioBus.position = this.getPlaybackPosition();
    this.audioBus.isPlaying = Boolean(this.sound.isPlaying);

    if (!this.analysis || !this.sound.isPlaying) {
      this.settle(delta);
      return;
    }

    const data = this.analyser.getFrequencyData();
    this.analyser.analyser.getFloatTimeDomainData(this.timeDomainData);
    let timeSquares = 0;
    for (let index = 0; index < this.timeDomainData.length; index += 1) {
      const sample = this.timeDomainData[index];
      timeSquares += sample * sample;
    }
    const rms = Math.sqrt(timeSquares / this.timeDomainData.length);
    const loudnessDb = 20 * Math.log10(Math.max(rms, 0.000001));
    const loudnessTarget = clamp01((loudnessDb + 58) / 40);
    this.audioBus.loudness = follow(
      this.audioBus.loudness,
      loudnessTarget,
      delta,
      0.07,
      0.38
    );
    const features = {
      sub: this.readBandFeatures(data, 25, 80),
      bass: this.readBandFeatures(data, 80, 200),
      lowMid: this.readBandFeatures(data, 200, 700),
      presence: this.readBandFeatures(data, 700, 4000),
      high: this.readBandFeatures(data, 4000, 12000),
    };

    if (this.skipFluxFrame) {
      Object.values(features).forEach((feature) => {
        feature.flux = 0;
      });
      this.skipFluxFrame = false;
    }

    const targets = {};
    Object.entries(features).forEach(([name, feature]) => {
      targets[name] = this.normalizeFeature(name, feature.energy, delta, 0.08);
      targets[`${name}Flux`] = this.normalizeFeature(
        `${name}Flux`,
        feature.flux,
        delta,
        0.018
      );
    });
    this.previousFrequencyData.set(data);

    this.audioBus.sub = follow(
      this.audioBus.sub,
      targets.sub,
      delta,
      0.03,
      0.22
    );
    this.audioBus.bass = follow(
      this.audioBus.bass,
      targets.bass,
      delta,
      0.035,
      0.2
    );
    this.audioBus.lowMid = follow(
      this.audioBus.lowMid,
      targets.lowMid,
      delta,
      0.05,
      0.25
    );
    this.audioBus.presence = follow(
      this.audioBus.presence,
      targets.presence,
      delta,
      0.04,
      0.2
    );
    this.audioBus.high = follow(
      this.audioBus.high,
      targets.high,
      delta,
      0.018,
      0.12
    );
    this.audioBus.subFlux = follow(
      this.audioBus.subFlux,
      targets.subFlux,
      delta,
      0.012,
      0.09
    );
    this.audioBus.bassFlux = follow(
      this.audioBus.bassFlux,
      targets.bassFlux,
      delta,
      0.014,
      0.1
    );
    this.audioBus.lowMidFlux = follow(
      this.audioBus.lowMidFlux,
      targets.lowMidFlux,
      delta,
      0.016,
      0.11
    );
    this.audioBus.presenceFlux = follow(
      this.audioBus.presenceFlux,
      targets.presenceFlux,
      delta,
      0.012,
      0.09
    );
    this.audioBus.highFlux = Math.max(
      this.audioBus.highFlux * Math.exp(-delta / 0.085),
      targets.highFlux
    );
    this.audioBus.mid =
      this.audioBus.lowMid * 0.68 + this.audioBus.presence * 0.32;
    this.audioBus.treble = this.audioBus.high;

    this.audioBus.beat *= Math.exp(-delta / 0.2);
    this.audioBus.impact *= Math.exp(-delta / 0.15);
    this.audioBus.kick *= Math.exp(-delta / 0.18);
    this.audioBus.clap *= Math.exp(-delta / 0.12);
    this.audioBus.hat *= Math.exp(-delta / 0.075);
    this.audioBus.body *= Math.exp(-delta / 0.42);

    const duration = this.analysis.duration;
    const syncPosition = this.getPlaybackPosition() + VISUAL_LEAD_SECONDS;

    if (syncPosition >= duration) {
      this.triggerOnsets(duration, this.previousSyncPosition);
      this.onsetCursor = 0;
      this.lastComfortFlash = -Infinity;
      this.triggerOnsets(syncPosition - duration, -1);
      this.previousSyncPosition = syncPosition - duration;
    } else if (syncPosition < this.previousSyncPosition) {
      this.onsetCursor = 0;
      this.lastComfortFlash = -Infinity;
      this.triggerOnsets(syncPosition, -1);
      this.previousSyncPosition = syncPosition;
    } else {
      this.triggerOnsets(syncPosition, this.previousSyncPosition);
      this.previousSyncPosition = syncPosition;
    }
  }

  dispose() {
    this.disposed = true;

    if (this.sound.isPlaying) this.sound.stop();
    this.sound.disconnect();
    this.analyser.analyser.disconnect();
    this.audioBus.status = "idle";
    this.audioBus.isPlaying = false;
    this.audioBus.position = 0;
    this.audioBus.duration = 0;
  }
}

export const AudioVisualizer = ({
  path,
  audioBus,
  onReady,
  shouldPlay = true,
  showStatus = true,
}) => {
  const camera = useThree((state) => state.camera);
  const sphereRef = useRef(null);
  const lightRef = useRef(null);
  const engineRef = useRef(null);
  const shouldPlayRef = useRef(shouldPlay);
  const visualTime = useRef(0);
  const [status, setStatus] = useState("ANALYZING 5-BAND AUDIO");

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAudioFrequency: { value: 0 },
      uBeat: { value: 0 },
    }),
    []
  );

  useEffect(() => {
    shouldPlayRef.current = shouldPlay;

    const engine = engineRef.current;
    if (!engine?.analysis) return;

    if (shouldPlay) {
      engine.play().catch((error) => {
        console.error("Unable to resume music", error);
        setStatus("AUDIO PLAYBACK FAILED");
      });
      setStatus("");
    } else {
      engine.pause();
      setStatus("PAUSED · IDLE MODE");
    }
  }, [shouldPlay]);

  useEffect(() => {
    const listener = new THREE.AudioListener();
    const engine = new MusicReactiveEngine(listener, audioBus);
    let active = true;

    camera.add(listener);
    engineRef.current = engine;
    const seek = (position) => engine.seek(position);
    audioBus.seek = seek;
    audioBus.status = "analyzing";
    audioBus.isPlaying = false;
    window.__PHASEFLOOR_AUDIO__ = audioBus;

    engine
      .load(path)
      .then(async (analysis) => {
        if (!active || !analysis) return;

        if (shouldPlayRef.current) {
          await engine.play();
        } else {
          engine.pause();
        }
        if (!active) return;

        setStatus(
          `${analysis.bpm ? `${analysis.bpm} BPM · ` : ""}${
            analysis.kickCount
          } KICKS · ${analysis.clapCount} CLAPS · ${analysis.hatCount} HIGHS`
        );
        onReady?.(analysis);
        window.setTimeout(
          () =>
            active &&
            setStatus(shouldPlayRef.current ? "" : "PAUSED · IDLE MODE"),
          1600
        );
      })
      .catch((error) => {
        console.error("Unable to initialize music analysis", error);
        if (active) {
          setStatus("AUDIO ANALYSIS FAILED");
          onReady?.(null);
        }
      });

    return () => {
      active = false;
      engine.dispose();
      camera.remove(listener);
      engineRef.current = null;
      if (audioBus.seek === seek) audioBus.seek = null;
      if (path instanceof Blob) trackCache.delete(path);
    };
  }, [audioBus, camera, onReady, path]);

  useFrame((state, delta) => {
    engineRef.current?.update(Math.min(delta, 0.1));

    if (audioBus.isPlaying) visualTime.current += delta;
    uniforms.uTime.value = visualTime.current;
    uniforms.uAudioFrequency.value = audioBus.sub * 0.48;
    uniforms.uBeat.value = Math.max(audioBus.kick, audioBus.subFlux * 0.58);

    if (sphereRef.current) {
      const scale =
        0.7 * (1 + audioBus.sub * 0.085 + audioBus.kick * 0.07);
      sphereRef.current.scale.setScalar(scale);
      if (audioBus.isPlaying) {
        sphereRef.current.rotation.y +=
          delta * (0.08 + audioBus.sub * 0.055);
      }
    }

    if (lightRef.current) {
      lightRef.current.intensity =
        2.4 + audioBus.sub * 10 + audioBus.kick * 14;
    }
  });

  return (
    <group>
      {showStatus && status && (
        <Html center position={[0, 3.25, 0]}>
          <div className="audio-status">{status}</div>
        </Html>
      )}
      <Sphere ref={sphereRef} args={[1, 64, 64]} position={[0, 2, 0]}>
        <pointLight
          ref={lightRef}
          castShadow
          color="#bd5cff"
          distance={9}
          decay={2}
        />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
        />
      </Sphere>
    </group>
  );
};
