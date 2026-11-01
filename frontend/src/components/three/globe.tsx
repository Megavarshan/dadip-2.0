'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

function GlobeCore() {
  const meshRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.15;
    if (pointsRef.current) pointsRef.current.rotation.y += delta * 0.15;
  });

  // Generate disaster points on the globe (India-focused)
  const disasterPoints = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const disasters = [
      { lat: 26.1, lng: 91.7, color: [0.2, 0.5, 1] },    // Assam flood
      { lat: 16.5, lng: 86.0, color: [1, 0.5, 0.1] },     // Bay of Bengal cyclone
      { lat: 10.0, lng: 76.3, color: [0.2, 0.5, 1] },     // Kerala flood
      { lat: 30.7, lng: 78.4, color: [1, 0.3, 0.3] },     // Uttarakhand earthquake
      { lat: 11.5, lng: 92.8, color: [1, 0.3, 0.3] },     // Andaman earthquake
      { lat: 25.6, lng: 85.1, color: [0.2, 0.5, 1] },     // Bihar flood
      { lat: 17.7, lng: 83.3, color: [1, 0.5, 0.1] },     // Vizag cyclone
      { lat: 19.0, lng: 72.8, color: [0.2, 0.5, 1] },     // Mumbai flood
    ];

    // Add pulsing disaster markers
    for (const d of disasters) {
      const phi = (90 - d.lat) * (Math.PI / 180);
      const theta = (d.lng + 180) * (Math.PI / 180);
      const r = 2.02;
      positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      colors.push(d.color[0], d.color[1], d.color[2]);
    }

    // Add grid points for the globe wireframe effect
    for (let i = 0; i < 2000; i++) {
      const phi = Math.random() * Math.PI;
      const theta = Math.random() * 2 * Math.PI;
      const r = 2.0 + Math.random() * 0.01;
      positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      colors.push(0.2, 0.5, 0.8);
    }

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
    };
  }, []);

  return (
    <group>
      {/* Globe sphere */}
      <Sphere ref={meshRef} args={[2, 64, 64]}>
        <meshPhongMaterial
          color="#0a1628"
          emissive="#0d1f3c"
          specular="#22d3ee"
          shininess={15}
          transparent
          opacity={0.85}
          wireframe={false}
        />
      </Sphere>

      {/* Wireframe overlay */}
      <Sphere args={[2.01, 32, 32]}>
        <meshBasicMaterial color="#1e3a5f" wireframe transparent opacity={0.15} />
      </Sphere>

      {/* Disaster points */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[disasterPoints.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[disasterPoints.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.06} vertexColors transparent opacity={0.9} sizeAttenuation />
      </points>

      {/* Atmosphere glow */}
      <Sphere args={[2.15, 64, 64]}>
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.04} side={THREE.BackSide} />
      </Sphere>

      {/* Lights */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#22d3ee" />
      <pointLight position={[-5, -3, -5]} intensity={0.3} color="#a855f7" />
    </group>
  );
}

export default function Globe3D() {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 0, 5.5], fov: 45 }} gl={{ alpha: true, antialias: true }}>
        <GlobeCore />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 1.5} />
      </Canvas>
    </div>
  );
}
