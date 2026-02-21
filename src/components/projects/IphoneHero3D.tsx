"use client";

import { Html, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";

type IphoneHero3DProps = {
  revealProgress: number;
  wakeProgress: number;
  interactive: boolean;
  screen: ReactNode;
  className?: string;
};

function IphoneScene({ revealProgress, wakeProgress, interactive, screen }: Omit<IphoneHero3DProps, "className">) {
  const gltf = useGLTF("/models/iphone.glb");
  const phoneScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const reveal = THREE.MathUtils.clamp(revealProgress, 0, 1);
  const wake = THREE.MathUtils.clamp(wakeProgress, 0, 1);

  const spotlightIntensity = 0.08 + reveal * 1.26;
  const rimIntensity = 0.14 + reveal * 0.58;
  const fillIntensity = 0.1 + reveal * 0.2;

  return (
    <>
      <ambientLight intensity={0.28} color="#e6eefc" />
      <spotLight
        position={[0, 2.35, 1.85]}
        angle={0.48}
        penumbra={0.78}
        intensity={spotlightIntensity}
        color="#f8fbff"
        distance={8.5}
        decay={1.45}
      />
      <directionalLight position={[1.9, 0.2, 2.5]} intensity={rimIntensity} color="#d7e8ff" />
      <directionalLight position={[-1.65, -0.4, 1.9]} intensity={fillIntensity} color="#b8c6de" />
      <pointLight position={[0, -1.15, 2.2]} intensity={0.03 + reveal * 0.06} color="#dbe6fa" distance={4.4} decay={2} />

      <group position={[0, -0.02, 0]} rotation={[-0.032, 0, 0]} scale={1.12}>
        <primitive object={phoneScene} dispose={null} />

        <mesh position={[0, 0.02, 0.092]} renderOrder={20}>
          <planeGeometry args={[0.78, 1.62]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Html
            transform
            occlude={false}
            distanceFactor={1.18}
            position={[0, 0, 0.001]}
            style={{
              width: "360px",
              height: "740px",
              pointerEvents: interactive ? "auto" : "none",
            }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-[42px] border border-white/[0.06] bg-black">
              <div
                className="h-full w-full transition-[filter,transform,opacity] duration-500 ease-out"
                style={{
                  filter: `brightness(${0.58 + wake * 0.42}) saturate(${0.68 + wake * 0.32})`,
                  transform: `scale(${0.992 + wake * 0.008})`,
                  opacity: 0.78 + wake * 0.22,
                }}
              >
                {screen}
              </div>

              <div
                className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-500 ease-out"
                style={{ opacity: 1 - wake }}
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.08),rgba(0,0,0,0)_48%)]" />
            </div>
          </Html>
        </mesh>
      </group>
    </>
  );
}

export function IphoneHero3D({ revealProgress, wakeProgress, interactive, screen, className }: IphoneHero3DProps) {
  return (
    <div className={`relative h-full w-full ${className ?? ""}`.trim()}>
      <Canvas
        dpr={[1, 1.8]}
        camera={{ position: [0, 0.05, 2.65], fov: 35, near: 0.1, far: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        className="h-full w-full"
      >
        <Suspense fallback={null}>
          <IphoneScene
            revealProgress={revealProgress}
            wakeProgress={wakeProgress}
            interactive={interactive}
            screen={screen}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

if (typeof window !== "undefined") {
  useGLTF.preload("/models/iphone.glb");
}
