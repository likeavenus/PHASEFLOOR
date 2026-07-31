import { Center, Text3D } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";

const FONT_URL = `${import.meta.env.BASE_URL}fonts/Roboto_Bold.json`;

const smoothstep = (value) => value * value * (3 - 2 * value);

const cleanLabel = (value, maximumLength) => {
  const cleaned = value
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase();

  return cleaned.length > maximumLength
    ? `${cleaned.slice(0, maximumLength - 3).trim()}...`
    : cleaned;
};

const parseTrackName = (filename = "") => {
  const basename = filename
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s*\d{1,3}[\s._-]+/, "")
    .trim();
  const parts = basename.split(/\s+[-–—]\s+/);
  const hasArtist = parts.length > 1;

  return {
    artist: hasArtist ? cleanLabel(parts.shift(), 28) : "",
    title: cleanLabel(hasArtist ? parts.join(" - ") : basename, 42) || "TRACK",
  };
};

const fitTextSize = (text, preferredSize, minimumSize, targetWidth) =>
  Math.max(
    minimumSize,
    Math.min(preferredSize, targetWidth / Math.max(text.length * 0.62, 1))
  );

export const Experience = ({ audioBus, introStarted, trackName }) => {
  const camera = useThree((state) => state.camera);
  const group = useRef(null);
  const artistMaterial = useRef(null);
  const titleMaterial = useRef(null);
  const introStartedAt = useRef(null);
  const label = useMemo(() => parseTrackName(trackName), [trackName]);
  const artistSize = fitTextSize(label.artist, 0.23, 0.14, 3.7);
  const titleSize = fitTextSize(label.title, 0.46, 0.17, 4.6);

  useLayoutEffect(() => {
    introStartedAt.current = null;
    group.current?.scale.setScalar(0);
    if (artistMaterial.current) artistMaterial.current.opacity = 0;
    if (titleMaterial.current) titleMaterial.current.opacity = 0;
  }, [trackName]);

  useFrame((state) => {
    if (!group.current) return;

    if (introStarted && introStartedAt.current === null) {
      introStartedAt.current = state.clock.elapsedTime;
    }

    const introAge =
      introStartedAt.current === null
        ? 0
        : state.clock.elapsedTime - introStartedAt.current;
    const revealProgress = Math.min(Math.max(introAge / 0.78, 0), 1);
    const reveal = smoothstep(revealProgress);
    const float = Math.sin(state.clock.elapsedTime * 0.72) * 0.035;
    const kickLift = audioBus.kick * 0.105;
    const scale = reveal * (1 + audioBus.kick * 0.075 + audioBus.body * 0.018);

    group.current.position.set(0, 3.65 + float + kickLift, 0.02);
    group.current.quaternion.copy(camera.quaternion);
    group.current.rotateZ(
      Math.sin(state.clock.elapsedTime * 0.46) * 0.008 +
        audioBus.kick * 0.018
    );
    group.current.scale.setScalar(scale);

    if (artistMaterial.current) {
      artistMaterial.current.opacity = reveal * 0.88;
      artistMaterial.current.emissiveIntensity =
        0.22 + audioBus.kick * 0.36 + audioBus.body * 0.08;
    }

    if (titleMaterial.current) {
      titleMaterial.current.opacity = reveal;
      titleMaterial.current.emissiveIntensity =
        0.2 + audioBus.kick * 0.56 + audioBus.body * 0.1;
    }
  });

  return (
    <group ref={group} position={[0, 3.65, 0.02]} scale={0}>
      {label.artist && (
        <Center position={[0, 0.34, 0]}>
          <Text3D
            font={FONT_URL}
            size={artistSize}
            height={0.035}
            curveSegments={8}
            bevelEnabled
            bevelSize={0.008}
            bevelThickness={0.012}
            bevelSegments={2}
          >
            {label.artist}
            <meshStandardMaterial
              ref={artistMaterial}
              color="#65d8ff"
              emissive="#2abfff"
              emissiveIntensity={0.22}
              metalness={0.42}
              roughness={0.28}
              transparent
              opacity={0}
            />
          </Text3D>
        </Center>
      )}

      <Center position={[0, 0, 0]}>
        <Text3D
          font={FONT_URL}
          size={titleSize}
          height={0.075}
          curveSegments={10}
          bevelEnabled
          bevelSize={0.014}
          bevelThickness={0.022}
          bevelSegments={3}
        >
          {label.title}
          <meshStandardMaterial
            ref={titleMaterial}
            color="#f5efff"
            emissive="#a64dff"
            emissiveIntensity={0.2}
            metalness={0.54}
            roughness={0.24}
            transparent
            opacity={0}
          />
        </Text3D>
      </Center>
    </group>
  );
};
