import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Icosahedron, Sphere } from "@react-three/drei";
import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useLayoutEffect,
} from "react";
import * as Tone from "tone";
import fragmentShader from "../shaders/sphere/fragment.glsl";
import vertexShader from "../shaders/sphere/vertex.glsl";
import { Visualizer } from "./Visualizer";
import { AudioVisualizer } from "./Visualizer";

import track from "/music/track.mp3";

const WIREFRAME_DELTA = 0.015;

export const Analyzer = ({ sound }) => {
  // <Analyzer /> will not run before everything else in the suspense block is resolved.
  // That means <PositionalAudio/>, which executes async, is ready by the time we're here.
  // The next frame (useEffect) is guaranteed(!) to access positional-audios ref.
  const mesh = useRef();
  const analyser = useRef();
  useEffect(() => {
    analyser.current = new THREE.AudioAnalyser(sound.current, 32);

    return () => (analyser.current = null);
  }, []);

  const uniforms = useMemo(() => {
    return {
      uTime: {
        value: 0,
      },
      //   uv: {
      //     value: 0.0,
      //   },
    };
  }, []);

  //   useFrame(() => {
  //     if (analyser.current) {
  //       const data = analyser.current.getAverageFrequency();
  //       mesh.current.material.color.setRGB(data / 100, 0, 0);
  //       mesh.current.scale.x =
  //         mesh.current.scale.y =
  //         mesh.current.scale.z =
  //           (data / 100) * 2;
  //     }
  //   });

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    mesh.current.material.uniforms.uTime.value = time;
  });

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 100, 100));

  //   useEffect(() => {
  //     if (lineSegmentsRef.current) {
  //       lineSegmentsRef.current.scale.setScalar(1 + WIREFRAME_DELTA);
  //     }
  //   }, []);

  return (
    // <Sphere ref={mesh} args={[1, 64, 64]} position={[0, 3, 0]}>
    //   <meshBasicMaterial wireframe />
    // </Sphere>
    // <Icosahedron ref={mesh} position={[0, 3, 0]}>
    //   <meshStandardMaterial />
    // </Icosahedron>
    <>
      <Sphere ref={mesh} args={[1, 64, 64]} position={[0, 1, 0]}>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
        />
        <lineSegments
          ref={mesh}
          scale={[
            1 + WIREFRAME_DELTA,
            1 + WIREFRAME_DELTA,
            1 + WIREFRAME_DELTA,
          ]}
        >
          {/* <edgesGeometry attach="geometry" args={[geometry]} /> */}
          <sphereGeometry attach="geometry" />
          <shaderMaterial
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            uniforms={uniforms}
          />
        </lineSegments>
      </Sphere>
    </>
  );
};
