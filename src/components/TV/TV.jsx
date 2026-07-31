import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import url from "/video/swag.mp4";

export const TV = ({
  audioBus,
  position = [0, 4.1, -4.04],
  rotation = [0, 0, 0],
  scale = 1,
  screenSize = [5.2, 2.1],
  shouldPlay = false,
  lowPower = false,
}) => {
  const accentMaterial = useRef(null);
  const [width, height] = screenSize;
  const [{ video, texture }] = useState(() => {
    const element = document.createElement("video");
    element.src = url;
    element.crossOrigin = "anonymous";
    element.loop = true;
    element.muted = true;
    element.playsInline = true;
    element.preload = lowPower ? "metadata" : "auto";

    const videoTexture = new THREE.VideoTexture(element);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;

    return { video: element, texture: videoTexture };
  });

  useEffect(() => {
    video.preload = lowPower ? "metadata" : "auto";

    if (shouldPlay) video.play().catch(() => {});
    else video.pause();

    const handleVisibility = () => {
      if (document.hidden || !shouldPlay) video.pause();
      else video.play().catch(() => {});
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      video.pause();
    };
  }, [lowPower, shouldPlay, video]);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(() => {
    if (!accentMaterial.current) return;

    accentMaterial.current.emissiveIntensity =
      0.16 +
      (audioBus?.presence || 0) * 0.3 +
      (audioBus?.highFlux || 0) * 0.42;
  });

  const bezel = 0.14;
  const frontZ = 0.08;
  const supportY = height * 0.5 + 0.24;

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh position={[0, 0, -0.075]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.42, height + 0.42, 0.24]} />
        <meshStandardMaterial
          color="#08090d"
          metalness={0.86}
          roughness={0.28}
        />
      </mesh>

      <mesh position={[0, 0, frontZ]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      <mesh position={[0, 0, frontZ + 0.008]} renderOrder={4}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color="#8db9ff"
          transparent
          opacity={0.035}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, height * 0.5 + bezel * 0.5, frontZ + 0.04]} castShadow>
        <boxGeometry args={[width + bezel * 2, bezel, 0.12]} />
        <meshStandardMaterial color="#151721" metalness={0.92} roughness={0.24} />
      </mesh>
      <mesh position={[0, -height * 0.5 - bezel * 0.5, frontZ + 0.04]} castShadow>
        <boxGeometry args={[width + bezel * 2, bezel, 0.12]} />
        <meshStandardMaterial
          ref={accentMaterial}
          color="#6d38a3"
          emissive="#9f43ff"
          emissiveIntensity={0.2}
          metalness={0.68}
          roughness={0.25}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[-width * 0.5 - bezel * 0.5, 0, frontZ + 0.04]} castShadow>
        <boxGeometry args={[bezel, height, 0.12]} />
        <meshStandardMaterial color="#151721" metalness={0.92} roughness={0.24} />
      </mesh>
      <mesh position={[width * 0.5 + bezel * 0.5, 0, frontZ + 0.04]} castShadow>
        <boxGeometry args={[bezel, height, 0.12]} />
        <meshStandardMaterial color="#151721" metalness={0.92} roughness={0.24} />
      </mesh>

      {[-width * 0.31, width * 0.31].map((x) => (
        <mesh key={x} position={[x, supportY, -0.02]} castShadow>
          <boxGeometry args={[0.1, 0.34, 0.13]} />
          <meshStandardMaterial color="#1b1d27" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
      <mesh position={[0, height * 0.5 + 0.42, -0.02]} castShadow>
        <boxGeometry args={[width + 0.92, 0.13, 0.17]} />
        <meshStandardMaterial color="#1b1d27" metalness={0.92} roughness={0.24} />
      </mesh>

      <pointLight
        position={[0, -0.1, 1.15]}
        color="#8664ff"
        intensity={1.1}
        distance={5.5}
        decay={2}
      />
    </group>
  );
};
