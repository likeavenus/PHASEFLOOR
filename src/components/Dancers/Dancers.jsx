import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

const characterUrl = (filename) =>
  `${import.meta.env.BASE_URL}models/characters/${encodeURIComponent(filename)}`;

const models = {
  male: characterUrl("X Bot.fbx"),
  female: characterUrl("Y Bot.fbx"),
};

const animations = {
  dance: characterUrl("Dancing.fbx"),
  hipHop: characterUrl("Hip Hop Dancing.fbx"),
  samba: characterUrl("Samba Dancing.fbx"),
  silly: characterUrl("Silly Dancing.fbx"),
  twerk: characterUrl("Dancing Twerk.fbx"),
  aggressiveFemale: characterUrl("Dancing Maraschino Step.fbx"),
  aggressiveMale: characterUrl("DancingAgressive.fbx"),
  idle: characterUrl("Idle.fbx"),
  happyIdle: characterUrl("Happy Idle.fbx"),
};

const supportingDanceAnimations = ["dance", "hipHop", "samba", "silly"];
const randomSupportingDance = () =>
  supportingDanceAnimations[
    Math.floor(Math.random() * supportingDanceAnimations.length)
  ];

const wakeThresholds = [0.12, 0.3, 0.48, 0.68, 0.82, 0.38, 0.74, 0.22, 0.56];

const crowd = [
  {
    model: "female",
    animation: randomSupportingDance(),
    position: [-2.35, -0.96, 1.45],
    rotation: -0.18,
    tint: "#ffb6da",
    speed: 0.97,
    offset: 0.12,
  },
  {
    model: "male",
    animation: randomSupportingDance(),
    position: [-0.85, -0.96, 1.9],
    rotation: 0.12,
    tint: "#b8ddff",
    speed: 1.03,
    offset: 0.48,
  },
  {
    model: "female",
    animation: randomSupportingDance(),
    position: [0.9, -0.96, 1.75],
    rotation: -0.08,
    tint: "#d9b9ff",
    speed: 1.01,
    offset: 0.7,
  },
  {
    model: "male",
    animation: randomSupportingDance(),
    position: [2.35, -0.96, 1.2],
    rotation: 0.2,
    tint: "#ffd3a6",
    speed: 0.95,
    offset: 0.28,
  },
  {
    model: "male",
    animation: randomSupportingDance(),
    position: [-1.65, -0.96, -0.8],
    rotation: -0.28,
    tint: "#9deee5",
    speed: 0.98,
    offset: 0.84,
  },
  {
    model: "female",
    animation: randomSupportingDance(),
    position: [0, -0.96, -1.15],
    rotation: 0.14,
    tint: "#ffb3c4",
    speed: 1.04,
    offset: 0.36,
  },
  {
    model: "male",
    animation: randomSupportingDance(),
    position: [1.75, -0.96, -0.7],
    rotation: 0.3,
    tint: "#c4ccff",
    speed: 1,
    offset: 0.58,
  },
  {
    model: "female",
    animation: "twerk",
    position: [-2.75, -0.96, 0.08],
    rotation: 0.34,
    tint: "#ff9bc9",
    speed: 1.02,
    offset: 0.66,
  },
  {
    model: "male",
    animation: randomSupportingDance(),
    position: [2.78, -0.96, 0.02],
    rotation: -0.32,
    tint: "#92e8ff",
    speed: 0.99,
    offset: 0.18,
  },
];

const makeInPlace = (sourceClip) => {
  const clip = sourceClip.clone();

  clip.tracks.forEach((track) => {
    if (!/Hips\.position$/i.test(track.name)) return;

    const values = track.values;
    const anchorX = values[0];
    const anchorY = values[1];
    const anchorZ = values[2];

    for (let index = 0; index < values.length; index += 3) {
      values[index] = anchorX;
      values[index + 1] =
        anchorY + THREE.MathUtils.clamp(values[index + 1] - anchorY, -3, 8);
      values[index + 2] = anchorZ;
    }
  });

  clip.name = `${sourceClip.name || "dance"}-in-place`;
  return clip;
};

const getBeatAlignedRate = (clipDuration, bpm, preferredRate) => {
  if (!bpm || !clipDuration) return preferredRate;

  const idealBeatCount = (clipDuration * bpm) / (60 * preferredRate);
  const alignedBeatCount = Math.max(1, Math.floor(idealBeatCount * 2) / 2);
  return (clipDuration * bpm) / (60 * alignedBeatCount);
};

const getDanceBpm = (bpm) => {
  if (!bpm) return null;
  if (bpm > 168) return bpm / 2;
  if (bpm < 68) return bpm * 2;
  return bpm;
};

const createCrowdDirector = () => ({
  mode: "dance",
  pendingMode: null,
  activation: 0,
  activity: 0,
  wakeHold: 0,
  quietHold: 0,
  aggression: 0,
  density: 0,
  enterHold: 0,
  exitHold: 0,
  modeDuration: 0,
  lastBeatIndex: null,
  lastKickHits: 0,
  lastClapHits: 0,
  lastHatHits: 0,
  lastSeekVersion: -1,
});

function Dancer({ audioBus, crowdDirector, dancer, index }) {
  const sourceModel = useLoader(FBXLoader, models[dancer.model]);
  const sourceAnimation = useLoader(FBXLoader, animations[dancer.animation]);
  const sourceAggressiveAnimation = useLoader(
    FBXLoader,
    animations[
      dancer.model === "female" ? "aggressiveFemale" : "aggressiveMale"
    ]
  );
  const sourceIdle = useLoader(FBXLoader, animations.idle);
  const sourceHappyIdle = useLoader(FBXLoader, animations.happyIdle);
  const group = useRef(null);
  const actions = useRef(null);
  const activeMode = useRef(null);
  const activeAction = useRef(null);
  const idleVariant = useRef(Math.random() < 0.5 ? 0 : 1);
  const smoothedDanceRate = useRef(1);
  const smoothedAggressiveRate = useRef(1);
  const lastSeekVersion = useRef(audioBus.seekVersion);

  const character = useMemo(() => {
    const cloned = cloneSkeleton(sourceModel);
    const tint = new THREE.Color(dancer.tint);

    cloned.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const clonedMaterials = materials.map((material) => {
        const clonedMaterial = material.clone();
        if (clonedMaterial.color) clonedMaterial.color.multiply(tint);
        clonedMaterial.roughness = Math.max(
          0.32,
          clonedMaterial.roughness ?? 0.5
        );
        return clonedMaterial;
      });

      child.material = Array.isArray(child.material)
        ? clonedMaterials
        : clonedMaterials[0];
    });

    return cloned;
  }, [dancer.tint, sourceModel]);

  const danceClip = useMemo(
    () => makeInPlace(sourceAnimation.animations[0]),
    [sourceAnimation]
  );
  const aggressiveClip = useMemo(
    () => makeInPlace(sourceAggressiveAnimation.animations[0]),
    [sourceAggressiveAnimation]
  );
  const idleClips = useMemo(
    () => [
      makeInPlace(sourceIdle.animations[0]),
      makeInPlace(sourceHappyIdle.animations[0]),
    ],
    [sourceHappyIdle, sourceIdle]
  );
  const mixer = useMemo(() => new THREE.AnimationMixer(character), [character]);

  useEffect(() => {
    const danceAction = mixer.clipAction(danceClip);
    const aggressiveAction = mixer.clipAction(aggressiveClip);
    const idleActions = idleClips.map((idleClip) => mixer.clipAction(idleClip));
    const chosenIdleAction = idleActions[idleVariant.current];
    const chosenIdleClip = idleClips[idleVariant.current];

    [danceAction, aggressiveAction, ...idleActions].forEach((action) => {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
    });

    const startsDancing =
      audioBus.isPlaying &&
      crowdDirector.activation >= wakeThresholds[index];
    const initialAction = startsDancing ? danceAction : chosenIdleAction;
    initialAction.reset();
    initialAction.time = startsDancing
      ? danceClip.duration * dancer.offset
      : chosenIdleClip.duration * ((dancer.offset + index * 0.17) % 1);
    initialAction.fadeIn(0.45);
    initialAction.play();

    actions.current = {
      dance: danceAction,
      danceClip,
      aggressive: aggressiveAction,
      aggressiveClip,
      idle: chosenIdleAction,
      idleClip: chosenIdleClip,
    };
    activeMode.current = startsDancing ? "dance" : "idle";
    activeAction.current = initialAction;

    return () => {
      actions.current = null;
      activeAction.current = null;
      activeMode.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(character);
    };
  }, [
    audioBus,
    aggressiveClip,
    character,
    crowdDirector,
    danceClip,
    dancer.offset,
    idleClips,
    index,
    mixer,
  ]);

  useFrame((state, delta) => {
    const dancerActions = actions.current;
    if (!dancerActions) return;

    const awake =
      audioBus.isPlaying &&
      crowdDirector.activation >= wakeThresholds[index];
    const nextMode = !awake
      ? "idle"
      : crowdDirector.mode === "aggressive"
        ? "aggressive"
        : "dance";
    const animationBpm = getDanceBpm(audioBus.bpm || audioBus.visualBpm);
    const beatBpm = audioBus.visualBpm || animationBpm;
    const motionOffset =
      audioBus.visualBeatOffset ?? audioBus.beatOffset ?? 0;
    const bpmRatio = THREE.MathUtils.clamp(
      (animationBpm || 110) / 100,
      0.72,
      1.55
    );
    const tempoResponse = Math.pow(bpmRatio, 0.72);
    const microTempo = 0.975 + ((index * 37) % 9) * 0.006;
    const preferredDanceRate =
      dancer.speed * microTempo * 1.14 * tempoResponse;
    const danceRate = getBeatAlignedRate(
      dancerActions.danceClip.duration,
      animationBpm,
      preferredDanceRate
    );
    const aggressiveBpm = animationBpm;
    const aggressiveTempoRatio = THREE.MathUtils.clamp(
      (aggressiveBpm || 110) / 100,
      0.85,
      1.65
    );
    const preferredAggressiveRate =
      1.16 * Math.pow(aggressiveTempoRatio, 0.72);
    const aggressiveRate = getBeatAlignedRate(
      dancerActions.aggressiveClip.duration,
      aggressiveBpm,
      preferredAggressiveRate
    );
    const sustainedEnergy =
      (audioBus.bass +
        audioBus.lowMid +
        audioBus.presence +
        audioBus.high) /
      4;
    const trackDrive = audioBus.isPlaying
      ? sustainedEnergy * 0.16 + audioBus.body * 0.08
      : 0;
    const percussionDrive = audioBus.isPlaying
      ? audioBus.kick * 0.16 +
        audioBus.clap * 0.075 +
        audioBus.hat * 0.045
      : 0;
    const targetDanceRate = THREE.MathUtils.clamp(
      danceRate * (1 + trackDrive + percussionDrive),
      0.78,
      1.62
    );
    const targetAggressiveRate = THREE.MathUtils.clamp(
      aggressiveRate * (1 + trackDrive * 0.58 + percussionDrive * 0.42),
      0.86,
      1.68
    );

    smoothedDanceRate.current = THREE.MathUtils.damp(
      smoothedDanceRate.current,
      targetDanceRate,
      targetDanceRate > smoothedDanceRate.current ? 16 : 7,
      delta
    );
    smoothedAggressiveRate.current = THREE.MathUtils.damp(
      smoothedAggressiveRate.current,
      targetAggressiveRate,
      targetAggressiveRate > smoothedAggressiveRate.current ? 18 : 8,
      delta
    );

    dancerActions.dance.setEffectiveTimeScale(
      smoothedDanceRate.current
    );
    dancerActions.aggressive.setEffectiveTimeScale(
      smoothedAggressiveRate.current
    );
    dancerActions.idle.setEffectiveTimeScale(0.88 + index * 0.018);

    if (lastSeekVersion.current !== audioBus.seekVersion) {
      dancerActions.dance.time =
        (audioBus.position * danceRate +
          dancerActions.danceClip.duration * dancer.offset) %
        dancerActions.danceClip.duration;
      const aggressiveOffset = ((index % 3) - 1) * 0.012;
      dancerActions.aggressive.time =
        (audioBus.position * aggressiveRate +
          dancerActions.aggressiveClip.duration * (1 + aggressiveOffset)) %
        dancerActions.aggressiveClip.duration;
      lastSeekVersion.current = audioBus.seekVersion;
    }

    if (nextMode !== activeMode.current) {
      const previousAction = activeAction.current;
      const nextAction = dancerActions[nextMode];

      nextAction.enabled = true;
      nextAction.setEffectiveWeight(1);
      nextAction.reset();
      if (nextMode === "dance") {
        nextAction.time =
          (audioBus.position * danceRate +
            dancerActions.danceClip.duration * dancer.offset) %
          dancerActions.danceClip.duration;
      } else if (nextMode === "aggressive") {
        const aggressiveOffset = (index % 3) * 0.012;
        nextAction.time =
          dancerActions.aggressiveClip.duration * aggressiveOffset;
      } else {
        nextAction.time =
          dancerActions.idleClip.duration *
          ((dancer.offset + index * 0.17) % 1);
      }
      nextAction.play();

      if (previousAction) {
        const crossFadeDuration =
          nextMode === "aggressive"
            ? 0.34
            : nextMode === "dance"
              ? 0.9
              : 0.72;
        nextAction.crossFadeFrom(
          previousAction,
          crossFadeDuration,
          false
        );
      } else {
        nextAction.fadeIn(0.55);
      }

      activeMode.current = nextMode;
      activeAction.current = nextAction;
    }

    mixer.timeScale = 1;
    mixer.update(Math.min(delta, 0.1));

    if (group.current) {
      const aggressiveMode = activeMode.current === "aggressive";
      const movingMode = activeMode.current !== "idle";
      const targetScale =
        1 +
        (movingMode ? audioBus.body * (aggressiveMode ? 0.012 : 0.008) : 0) +
        (movingMode ? audioBus.kick * (aggressiveMode ? 0.018 : 0.012) : 0);
      const smoothedScale = THREE.MathUtils.damp(
        group.current.scale.x,
        targetScale,
        targetScale > group.current.scale.x ? 15 : 8,
        delta
      );
      group.current.scale.setScalar(smoothedScale);

      const beatPhase =
        (audioBus.position - motionOffset) *
        ((beatBpm || 120) / 60) *
        Math.PI *
        2;
      const phaseOffset = aggressiveMode ? index * 0.12 : index * 0.82;
      const danceFloat = movingMode
        ? Math.sin(beatPhase + phaseOffset) *
            (aggressiveMode ? 0.009 + audioBus.body * 0.009 : 0.005 + audioBus.body * 0.006) +
          audioBus.kick *
            (aggressiveMode ? 0.03 + (index % 3) * 0.002 : 0.022 + (index % 3) * 0.003)
        : 0;
      group.current.position.y = THREE.MathUtils.damp(
        group.current.position.y,
        dancer.position[1] + danceFloat,
        danceFloat > 0 ? 14 : 8,
        delta
      );

      const clapDirection = index % 2 === 0 ? 1 : -1;
      const targetTilt = movingMode
        ? clapDirection *
          (audioBus.clap * (aggressiveMode ? 0.024 : 0.018) +
            audioBus.beat * (aggressiveMode ? 0.009 : 0.006))
        : 0;
      group.current.rotation.z = THREE.MathUtils.damp(
        group.current.rotation.z,
        targetTilt,
        targetTilt !== 0 ? 15 : 7,
        delta
      );
      const socialSway = movingMode
        ? Math.sin(state.clock.elapsedTime * (0.32 + index * 0.017) + index) *
          (aggressiveMode ? 0.018 : 0.035)
        : Math.sin(state.clock.elapsedTime * 0.18 + index) * 0.012;
      group.current.rotation.y = THREE.MathUtils.damp(
        group.current.rotation.y,
        dancer.rotation + socialSway,
        2.4,
        delta
      );
    }
  });

  return (
    <group
      ref={group}
      position={dancer.position}
      rotation-y={dancer.rotation}
    >
      <primitive object={character} scale={0.0115} />
    </group>
  );
}

function CrowdContactShadows({ dancers }) {
  const shadows = useRef(null);

  useLayoutEffect(() => {
    if (!shadows.current) return;

    const transform = new THREE.Object3D();
    dancers.forEach((dancer, index) => {
      transform.position.set(dancer.position[0], -0.969, dancer.position[2]);
      transform.rotation.set(-Math.PI / 2, 0, dancer.rotation);
      transform.scale.set(0.48, 0.78, 1);
      transform.updateMatrix();
      shadows.current.setMatrixAt(index, transform.matrix);
    });
    shadows.current.instanceMatrix.needsUpdate = true;
  }, [dancers]);

  return (
    <instancedMesh ref={shadows} args={[null, null, dancers.length]}>
      <circleGeometry args={[0.55, 20]} />
      <meshBasicMaterial
        color="#000000"
        transparent
        opacity={0.24}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

export function ClubDJ({ audioBus }) {
  const sourceModel = useLoader(FBXLoader, models.male);
  const sourceIdle = useLoader(FBXLoader, animations.happyIdle);
  const sourcePerformance = useLoader(FBXLoader, animations.hipHop);
  const group = useRef(null);
  const actions = useRef(null);
  const activeMode = useRef("idle");
  const character = useMemo(() => {
    const cloned = cloneSkeleton(sourceModel);
    const tint = new THREE.Color("#d6e8ff");
    cloned.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const nextMaterials = materials.map((material) => {
        const next = material.clone();
        next.color?.multiply(tint);
        next.roughness = Math.max(0.38, next.roughness ?? 0.5);
        return next;
      });
      child.material = Array.isArray(child.material)
        ? nextMaterials
        : nextMaterials[0];
    });
    return cloned;
  }, [sourceModel]);
  const idleClip = useMemo(
    () => makeInPlace(sourceIdle.animations[0]),
    [sourceIdle]
  );
  const performanceClip = useMemo(
    () => makeInPlace(sourcePerformance.animations[0]),
    [sourcePerformance]
  );
  const mixer = useMemo(() => new THREE.AnimationMixer(character), [character]);

  useEffect(() => {
    const idle = mixer.clipAction(idleClip);
    const performance = mixer.clipAction(performanceClip);
    [idle, performance].forEach((action) => {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
    });
    idle.reset().fadeIn(0.3).play();
    actions.current = { idle, performance };

    return () => {
      actions.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(character);
    };
  }, [character, idleClip, mixer, performanceClip]);

  useFrame((state, delta) => {
    if (!actions.current) return;

    const audible =
      audioBus.isPlaying &&
      (audioBus.loudness || 0) > 0.06 &&
      (audioBus.body + audioBus.presence + audioBus.high) / 3 > 0.13;
    const nextMode = audible ? "performance" : "idle";
    if (nextMode !== activeMode.current) {
      const previous = actions.current[activeMode.current];
      const next = actions.current[nextMode];
      next.reset().play().crossFadeFrom(previous, 0.85, false);
      activeMode.current = nextMode;
    }

    const bpmRatio = THREE.MathUtils.clamp(
      (getDanceBpm(audioBus.bpm || audioBus.visualBpm) || 110) / 110,
      0.72,
      1.24
    );
    actions.current.performance.setEffectiveTimeScale(0.72 * bpmRatio);
    actions.current.idle.setEffectiveTimeScale(0.82);
    mixer.update(Math.min(delta, 0.1));

    if (group.current) {
      const groove = audible
        ? Math.sin(state.clock.elapsedTime * bpmRatio * 2.2) * 0.018
        : 0;
      group.current.rotation.z = THREE.MathUtils.damp(
        group.current.rotation.z,
        groove + audioBus.clap * 0.012,
        5,
        delta
      );
    }
  });

  return (
    <group ref={group} position={[0, -0.96, -3.72]} rotation-y={0.04}>
      <primitive object={character} scale={0.0115} />
    </group>
  );
}

export function DanceCrowd({ audioBus, lowPower = false }) {
  const crowdDirector = useMemo(createCrowdDirector, []);
  const visibleCrowd = lowPower
    ? crowd.filter((_, index) => [0, 1, 2, 7, 8].includes(index))
    : crowd;

  useFrame((_, delta) => {
    const seekChanged =
      crowdDirector.lastSeekVersion !== audioBus.seekVersion;

    if (seekChanged) {
      crowdDirector.mode = "dance";
      crowdDirector.pendingMode = null;
      crowdDirector.activation = 0;
      crowdDirector.activity = 0;
      crowdDirector.wakeHold = 0;
      crowdDirector.quietHold = 0;
      crowdDirector.aggression = 0;
      crowdDirector.density = 0;
      crowdDirector.enterHold = 0;
      crowdDirector.exitHold = 0;
      crowdDirector.modeDuration = 0;
      crowdDirector.lastBeatIndex = null;
      crowdDirector.lastKickHits = audioBus.kickHitCount;
      crowdDirector.lastClapHits = audioBus.clapHitCount;
      crowdDirector.lastHatHits = audioBus.hatHitCount;
      crowdDirector.lastSeekVersion = audioBus.seekVersion;
    }

    if (!audioBus.isPlaying) {
      crowdDirector.mode = "dance";
      crowdDirector.pendingMode = null;
      crowdDirector.activation = THREE.MathUtils.damp(
        crowdDirector.activation,
        0,
        2.8,
        delta
      );
      crowdDirector.activity = THREE.MathUtils.damp(
        crowdDirector.activity,
        0,
        3.5,
        delta
      );
      crowdDirector.wakeHold = 0;
      crowdDirector.quietHold = 0;
      crowdDirector.aggression = THREE.MathUtils.damp(
        crowdDirector.aggression,
        0,
        4,
        delta
      );
      crowdDirector.density = 0;
      crowdDirector.enterHold = 0;
      crowdDirector.exitHold = 0;
      crowdDirector.modeDuration = 0;
      crowdDirector.lastBeatIndex = null;
      crowdDirector.lastKickHits = audioBus.kickHitCount;
      crowdDirector.lastClapHits = audioBus.clapHitCount;
      crowdDirector.lastHatHits = audioBus.hatHitCount;
      return;
    }

    const kickHits = Math.max(
      0,
      audioBus.kickHitCount - crowdDirector.lastKickHits
    );
    const clapHits = Math.max(
      0,
      audioBus.clapHitCount - crowdDirector.lastClapHits
    );
    const hatHits = Math.max(
      0,
      audioBus.hatHitCount - crowdDirector.lastHatHits
    );
    crowdDirector.lastKickHits = audioBus.kickHitCount;
    crowdDirector.lastClapHits = audioBus.clapHitCount;
    crowdDirector.lastHatHits = audioBus.hatHitCount;

    const densityImpulse = kickHits * 0.26 + clapHits * 0.18 + hatHits * 0.055;
    crowdDirector.density = THREE.MathUtils.clamp(
      crowdDirector.density * Math.exp(-delta / 1.35) + densityImpulse,
      0,
      1
    );

    const sustainedActivity = THREE.MathUtils.clamp(
      audioBus.sub * 0.12 +
        audioBus.bass * 0.23 +
        audioBus.lowMid * 0.23 +
        audioBus.presence * 0.2 +
        audioBus.high * 0.1 +
        audioBus.body * 0.12,
      0,
      1
    );
    const transientActivity = THREE.MathUtils.clamp(
      Math.max(audioBus.subFlux, audioBus.bassFlux) * 0.28 +
        audioBus.lowMidFlux * 0.2 +
        audioBus.presenceFlux * 0.18 +
        audioBus.highFlux * 0.12 +
        audioBus.kick * 0.13 +
        audioBus.clap * 0.06 +
        audioBus.hat * 0.03,
      0,
      1
    );
    const audibilityGate = THREE.MathUtils.smoothstep(
      audioBus.loudness || 0,
      0.035,
      0.22
    );
    const rawActivity = THREE.MathUtils.clamp(
      (sustainedActivity * 0.82 +
        transientActivity * 0.28 +
        crowdDirector.density * 0.12) *
        audibilityGate,
      0,
      1
    );
    crowdDirector.activity = THREE.MathUtils.damp(
      crowdDirector.activity,
      rawActivity,
      rawActivity > crowdDirector.activity ? 3.1 : 0.62,
      delta
    );

    const audible =
      audibilityGate > 0.08 &&
      (crowdDirector.activity > 0.105 ||
        transientActivity > 0.24 ||
        crowdDirector.density > 0.2);
    crowdDirector.wakeHold = audible
      ? Math.min(1, crowdDirector.wakeHold + delta)
      : Math.max(0, crowdDirector.wakeHold - delta * 1.6);
    crowdDirector.quietHold = audible
      ? 0
      : crowdDirector.quietHold + delta;

    let targetActivation = crowdDirector.activation;
    if (crowdDirector.wakeHold >= 0.32) {
      targetActivation = Math.max(
        THREE.MathUtils.smoothstep(crowdDirector.activity, 0.08, 0.52),
        THREE.MathUtils.smoothstep(crowdDirector.density, 0.08, 0.75) * 0.78
      );
    } else if (crowdDirector.quietHold >= 1.8) {
      targetActivation = 0;
    }
    crowdDirector.activation = THREE.MathUtils.damp(
      crowdDirector.activation,
      targetActivation,
      targetActivation > crowdDirector.activation ? 1.18 : 0.34,
      delta
    );

    const spectralBody = THREE.MathUtils.clamp(
      audioBus.bass * 0.3 +
        audioBus.lowMid * 0.28 +
        audioBus.presence * 0.22 +
        audioBus.body * 0.2,
      0,
      1
    );
    const transientDrive = THREE.MathUtils.clamp(
      Math.max(audioBus.subFlux, audioBus.bassFlux) * 0.3 +
        audioBus.lowMidFlux * 0.22 +
        audioBus.presenceFlux * 0.22 +
        audioBus.highFlux * 0.14 +
        audioBus.kick * 0.2 +
        audioBus.clap * 0.12 +
        audioBus.hat * 0.06,
      0,
      1
    );
    const tempoDrive = THREE.MathUtils.clamp(
      ((audioBus.bpm || 90) - 78) / 72,
      0,
      1
    );
    const aggressionWakeGate = THREE.MathUtils.smoothstep(
      crowdDirector.activation,
      0.45,
      0.78
    );
    const rawAggression =
      (spectralBody * 0.36 +
        transientDrive * 0.32 +
        crowdDirector.density * 0.25 +
        tempoDrive * 0.07) *
      aggressionWakeGate;
    crowdDirector.aggression = THREE.MathUtils.damp(
      crowdDirector.aggression,
      rawAggression,
      rawAggression > crowdDirector.aggression ? 2.8 : 0.85,
      delta
    );

    const choreographyBpm = audioBus.visualBpm || audioBus.bpm;
    const choreographyOffset =
      audioBus.visualBeatOffset ?? audioBus.beatOffset ?? 0;
    const musicalBeat = choreographyBpm
      ? ((audioBus.position - choreographyOffset) * choreographyBpm) / 60
      : audioBus.beatCount;
    const beatIndex = Math.floor(musicalBeat + 0.025);
    const beatChanged =
      crowdDirector.lastBeatIndex !== null &&
      beatIndex !== crowdDirector.lastBeatIndex;
    const phraseBoundary = beatChanged && ((beatIndex % 4) + 4) % 4 === 0;
    crowdDirector.lastBeatIndex = beatIndex;

    if (crowdDirector.activation < 0.48) {
      crowdDirector.mode = "dance";
      crowdDirector.pendingMode = null;
      crowdDirector.enterHold = 0;
      crowdDirector.exitHold = 0;
      crowdDirector.modeDuration = 0;
    } else if (crowdDirector.mode === "dance") {
      crowdDirector.modeDuration = 0;
      crowdDirector.exitHold = 0;
      crowdDirector.enterHold =
        crowdDirector.aggression > 0.58
          ? crowdDirector.enterHold + delta
          : Math.max(0, crowdDirector.enterHold - delta * 1.4);

      if (crowdDirector.enterHold >= 1.8) {
        crowdDirector.pendingMode = "aggressive";
      }
      if (
        crowdDirector.pendingMode === "aggressive" &&
        crowdDirector.aggression < 0.46
      ) {
        crowdDirector.pendingMode = null;
      }
    } else {
      crowdDirector.modeDuration += delta;
      crowdDirector.enterHold = 0;
      crowdDirector.exitHold =
        crowdDirector.aggression < 0.39
          ? crowdDirector.exitHold + delta
          : Math.max(0, crowdDirector.exitHold - delta * 1.2);

      if (
        crowdDirector.modeDuration >= 5.5 &&
        crowdDirector.exitHold >= 2.4
      ) {
        crowdDirector.pendingMode = "dance";
      }
      if (
        crowdDirector.pendingMode === "dance" &&
        crowdDirector.aggression > 0.52
      ) {
        crowdDirector.pendingMode = null;
      }
    }

    if (phraseBoundary && crowdDirector.pendingMode) {
      crowdDirector.mode = crowdDirector.pendingMode;
      crowdDirector.pendingMode = null;
      crowdDirector.enterHold = 0;
      crowdDirector.exitHold = 0;
      crowdDirector.modeDuration = 0;
    }
  });

  return (
    <group>
      <CrowdContactShadows dancers={visibleCrowd} />
      {visibleCrowd.map((dancer) => {
        const index = crowd.indexOf(dancer);

        return (
          <Dancer
            key={`${dancer.model}-${dancer.animation}-${index}`}
            audioBus={audioBus}
            crowdDirector={crowdDirector}
            dancer={dancer}
            index={index}
          />
        );
      })}
    </group>
  );
}
