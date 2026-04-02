import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Float, MeshWobbleMaterial, Sparkles, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

const Snowman = ({ expression, isListening, isSpeaking, lookAt }: { expression: string, isListening: boolean, isSpeaking: boolean, lookAt: { x: number, y: number } }) => {
  const headRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const mouthRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    
    // Idle animation
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.5) * 0.1;
      headRef.current.rotation.x = Math.cos(t * 0.3) * 0.05;
      
      // Look at target (smoothly)
      headRef.current.rotation.y += (lookAt.x * 0.5 - headRef.current.rotation.y) * 0.1;
      headRef.current.rotation.x += (lookAt.y * 0.3 - headRef.current.rotation.x) * 0.1;
    }

    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(t * 1.5) * 0.05;
    }

    // Arm animation
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = -Math.PI / 4 + Math.sin(t * 2) * 0.1;
      if (isSpeaking) leftArmRef.current.rotation.z += Math.sin(t * 10) * 0.2;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = Math.PI / 4 + Math.cos(t * 2) * 0.1;
      if (isSpeaking) rightArmRef.current.rotation.z -= Math.sin(t * 10) * 0.2;
    }

    // Speaking animation (mouth)
    if (mouthRef.current) {
      if (isSpeaking) {
        mouthRef.current.scale.y = 1 + Math.sin(t * 15) * 0.8;
        mouthRef.current.scale.x = 1 + Math.cos(t * 10) * 0.2;
      } else {
        mouthRef.current.scale.y = expression === '开心' ? 0.5 : 0.2;
        mouthRef.current.scale.x = expression === '惊讶' ? 1.5 : 1;
      }
    }

    // Listening animation (pulsing eyes)
    if (isListening && leftEyeRef.current && rightEyeRef.current) {
      const s = 1 + Math.sin(t * 10) * 0.2;
      leftEyeRef.current.scale.set(s, s, s);
      rightEyeRef.current.scale.set(s, s, s);
    }
  });

  const getExpressionColor = () => {
    switch (expression) {
      case '开心': return '#4ade80';
      case '难过': return '#60a5fa';
      case '生气': return '#f87171';
      case '惊讶': return '#fbbf24';
      default: return '#ffffff';
    }
  };

  return (
    <group>
      {/* Body */}
      <group ref={bodyRef}>
        {/* Bottom ball */}
        <mesh position={[0, -1, 0]} castShadow>
          <sphereGeometry args={[0.8, 32, 32]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.1} />
        </mesh>
        {/* Middle ball */}
        <mesh position={[0, -0.2, 0]} castShadow>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.1} />
        </mesh>

        {/* Feet */}
        <mesh position={[-0.4, -1.6, 0]} castShadow>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.1} />
        </mesh>
        <mesh position={[0.4, -1.6, 0]} castShadow>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.1} />
        </mesh>

        {/* Arms */}
        <group ref={leftArmRef} position={[-0.5, -0.2, 0]}>
          <mesh rotation={[0, 0, 0]} position={[-0.4, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.8, 8]} />
            <meshStandardMaterial color="#451a03" />
          </mesh>
          {/* Fingers */}
          <mesh position={[-0.8, 0.1, 0]} rotation={[0, 0, 0.5]}>
            <cylinderGeometry args={[0.01, 0.01, 0.2, 8]} />
            <meshStandardMaterial color="#451a03" />
          </mesh>
          <mesh position={[-0.8, -0.1, 0]} rotation={[0, 0, -0.5]}>
            <cylinderGeometry args={[0.01, 0.01, 0.2, 8]} />
            <meshStandardMaterial color="#451a03" />
          </mesh>
        </group>

        <group ref={rightArmRef} position={[0.5, -0.2, 0]}>
          <mesh rotation={[0, 0, 0]} position={[0.4, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.8, 8]} />
            <meshStandardMaterial color="#451a03" />
          </mesh>
          {/* Fingers */}
          <mesh position={[0.8, 0.1, 0]} rotation={[0, 0, -0.5]}>
            <cylinderGeometry args={[0.01, 0.01, 0.2, 8]} />
            <meshStandardMaterial color="#451a03" />
          </mesh>
          <mesh position={[0.8, -0.1, 0]} rotation={[0, 0, 0.5]}>
            <cylinderGeometry args={[0.01, 0.01, 0.2, 8]} />
            <meshStandardMaterial color="#451a03" />
          </mesh>
        </group>
      </group>

      {/* Head */}
      <group ref={headRef} position={[0, 0.5, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.1} />
        </mesh>

        {/* Eyes */}
        <group position={[-0.18, 0.15, 0.4]}>
          <mesh ref={leftEyeRef}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
        </group>

        <group position={[0.18, 0.15, 0.4]}>
          <mesh ref={rightEyeRef}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshBasicMaterial color="#000000" />
          </mesh>
        </group>

        {/* Eyebrows */}
        <mesh position={[-0.18, 0.3, 0.4]} rotation={[0, 0, expression === '生气' ? 0.3 : -0.1]}>
          <boxGeometry args={[0.15, 0.02, 0.02]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        <mesh position={[0.18, 0.3, 0.4]} rotation={[0, 0, expression === '生气' ? -0.3 : 0.1]}>
          <boxGeometry args={[0.15, 0.02, 0.02]} />
          <meshBasicMaterial color="#000000" />
        </mesh>

        {/* Nose (Carrot) */}
        <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.06, 0.25, 16]} />
          <meshStandardMaterial color="#fb923c" />
        </mesh>

        {/* Mouth */}
        <mesh ref={mouthRef} position={[0, -0.2, 0.4]} rotation={[expression === '难过' ? Math.PI : 0, 0, 0]}>
          <torusGeometry args={[0.1, 0.02, 16, 32, Math.PI]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>

        {/* Expression Glow */}
        <pointLight position={[0, 0, 0.6]} intensity={0.5} color={getExpressionColor()} />
      </group>

      {/* Buttons */}
      <mesh position={[0, -0.2, 0.55]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, -0.5, 0.65]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, -0.8, 0.75]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
};

export const RobotCharacter = ({ expression, isListening, isSpeaking, lookAt }: { expression: string, isListening: boolean, isSpeaking: boolean, lookAt: { x: number, y: number } }) => {
  return (
    <div className="w-full h-full min-h-[300px] bg-slate-950/50 rounded-3xl overflow-hidden border border-slate-800 shadow-inner relative">
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 0, 4]} fov={45} />
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <Snowman expression={expression} isListening={isListening} isSpeaking={isSpeaking} lookAt={lookAt} />
        </Float>

        <ContactShadows position={[0, -1.8, 0]} opacity={0.4} scale={10} blur={2} far={4} />
        <Environment preset="city" />
        <Sparkles count={50} scale={5} size={2} speed={0.4} color="#6366f1" />
      </Canvas>
      
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center pointer-events-none">
        <div className="flex gap-2">
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
            {isListening ? 'Listening' : 'Idle'}
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isSpeaking ? 'bg-indigo-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
            {isSpeaking ? 'Speaking' : 'Silent'}
          </div>
        </div>
        <div className="px-3 py-1 bg-slate-800/80 backdrop-blur-sm rounded-full text-[10px] font-bold text-indigo-400 uppercase tracking-wider border border-slate-700">
          Mood: {expression || 'Neutral'}
        </div>
      </div>
    </div>
  );
};
