import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import smokeVertexShader from "../../shaders/smoke/vertex.glsl";
import smokeFragmentShader from "../../shaders/smoke/fragment.glsl";

const smokeBounds = [10, 4.5, 8];

export function ClubSmoke({ audioBus, lowPower = false }) {
  const mesh = useRef(null);
  const material = useRef(null);
  const camera = useThree((state) => state.camera);
  const cameraLocal = useMemo(() => new THREE.Vector3(), []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDensity: { value: 0.34 },
      uBeat: { value: 0 },
      uCameraLocal: { value: new THREE.Vector3() },
    }),
    []
  );

  useFrame((state, delta) => {
    if (!mesh.current || !material.current) return;

    mesh.current.updateWorldMatrix(true, false);
    cameraLocal.copy(camera.position);
    mesh.current.worldToLocal(cameraLocal);

    const values = material.current.uniforms;
    values.uTime.value = state.clock.elapsedTime;
    values.uCameraLocal.value.copy(cameraLocal);
    values.uDensity.value = THREE.MathUtils.damp(
      values.uDensity.value,
      0.32 + audioBus.body * 0.045,
      2.2,
      delta
    );
    values.uBeat.value = THREE.MathUtils.damp(
      values.uBeat.value,
      audioBus.kick,
      10,
      delta
    );
  });

  return (
    <mesh
      ref={mesh}
      position={[0, 1.02, -0.25]}
      scale={smokeBounds}
      renderOrder={3}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <shaderMaterial
        ref={material}
        vertexShader={smokeVertexShader}
        fragmentShader={smokeFragmentShader}
        uniforms={uniforms}
        defines={lowPower ? { LOW_POWER: 1 } : {}}
        side={THREE.BackSide}
        transparent
        depthTest={false}
        depthWrite={false}
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </mesh>
  );
}
