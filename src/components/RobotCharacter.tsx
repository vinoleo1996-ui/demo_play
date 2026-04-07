import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Float, Sparkles, Environment, ContactShadows, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

const HumanoidRobot = ({ expression, isListening, isSpeaking, lookAt, isAwake }: { expression: string, isListening: boolean, isSpeaking: boolean, lookAt: { x: number, y: number }, isAwake: boolean }) => {
  const headRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const mouthRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftForearmRef = useRef<THREE.Group>(null);
  const rightForearmRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    
    // Idle animation
    if (headRef.current) {
      if (expression === '点头') {
        headRef.current.rotation.x = Math.sin(t * 10) * 0.3;
      } else if (expression === '摇头') {
        headRef.current.rotation.y = Math.sin(t * 10) * 0.3;
      } else {
        headRef.current.rotation.y = Math.sin(t * 0.5) * 0.1;
        headRef.current.rotation.x = Math.cos(t * 0.3) * 0.05;
        
        // Look at target (smoothly)
        headRef.current.rotation.y += (lookAt.x * 0.5 - headRef.current.rotation.y) * 0.1;
        headRef.current.rotation.x += (lookAt.y * 0.3 - headRef.current.rotation.x) * 0.1;
      }
    }

    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(t * 1.5) * 0.05;
    }

    // Arm animation (more natural)
    if (leftArmRef.current && leftForearmRef.current) {
      // Shoulder
      leftArmRef.current.rotation.z = 0.2 + Math.sin(t * 1.5) * 0.05;
      leftArmRef.current.rotation.x = isSpeaking ? -0.2 + Math.sin(t * 5) * 0.1 : 0;
      // Elbow
      leftForearmRef.current.rotation.x = isSpeaking ? -0.5 - Math.sin(t * 5) * 0.2 : -0.1;
    }
    
    if (rightArmRef.current && rightForearmRef.current) {
      // Shoulder
      rightArmRef.current.rotation.z = -0.2 - Math.cos(t * 1.5) * 0.05;
      rightArmRef.current.rotation.x = isSpeaking ? -0.2 + Math.cos(t * 5) * 0.1 : 0;
      // Elbow
      rightForearmRef.current.rotation.x = isSpeaking ? -0.5 - Math.cos(t * 5) * 0.2 : -0.1;
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

    // Awake/Listening animation (pulsing eyes)
    if (isAwake && leftEyeRef.current && rightEyeRef.current) {
      const s = 1 + Math.sin(t * 8) * 0.15;
      leftEyeRef.current.scale.set(s, s, s);
      rightEyeRef.current.scale.set(s, s, s);
      const leftMat = Array.isArray(leftEyeRef.current.material) ? leftEyeRef.current.material[0] : leftEyeRef.current.material;
      const rightMat = Array.isArray(rightEyeRef.current.material) ? rightEyeRef.current.material[0] : rightEyeRef.current.material;
      (leftMat as THREE.MeshBasicMaterial).color.setHex(0x4ade80); // Green when awake
      (rightMat as THREE.MeshBasicMaterial).color.setHex(0x4ade80);
    } else if (leftEyeRef.current && rightEyeRef.current) {
      leftEyeRef.current.scale.set(1, 1, 1);
      rightEyeRef.current.scale.set(1, 1, 1);
      const leftMat = Array.isArray(leftEyeRef.current.material) ? leftEyeRef.current.material[0] : leftEyeRef.current.material;
      const rightMat = Array.isArray(rightEyeRef.current.material) ? rightEyeRef.current.material[0] : rightEyeRef.current.material;
      (leftMat as THREE.MeshBasicMaterial).color.setHex(0x60a5fa); // Blue when asleep/idle
      (rightMat as THREE.MeshBasicMaterial).color.setHex(0x60a5fa);
    }
  });

  const getExpressionColor = () => {
    switch (expression) {
      case '开心': return '#4ade80';
      case '难过': return '#60a5fa';
      case '生气': return '#f87171';
      case '惊讶': return '#fbbf24';
      default: return isAwake ? '#4ade80' : '#60a5fa';
    }
  };

  const robotMaterial = <meshPhysicalMaterial color="#ffffff" roughness={0.2} metalness={0.1} clearcoat={1} clearcoatRoughness={0.1} />;
  const jointMaterial = <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.5} />;

  return (
    <group>
      {/* Body */}
      <group ref={bodyRef}>
        {/* Torso */}
        <mesh position={[0, -0.6, 0]} castShadow>
          <capsuleGeometry args={[0.35, 0.5, 16, 32]} />
          {robotMaterial}
        </mesh>

        {/* Chest Plate / Screen */}
        <mesh position={[0, -0.5, 0.32]}>
          <planeGeometry args={[0.4, 0.3]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0, -0.5, 0.33]}>
          <planeGeometry args={[0.3, 0.2]} />
          <meshBasicMaterial color={isAwake ? "#4ade80" : "#334155"} />
        </mesh>

        {/* Left Arm */}
        <group position={[-0.45, -0.3, 0]}>
          {/* Shoulder Joint */}
          <mesh castShadow>
            <sphereGeometry args={[0.12, 16, 16]} />
            {jointMaterial}
          </mesh>
          <group ref={leftArmRef}>
            {/* Upper Arm */}
            <mesh position={[-0.1, -0.25, 0]} rotation={[0, 0, -0.2]} castShadow>
              <capsuleGeometry args={[0.08, 0.3, 16, 16]} />
              {robotMaterial}
            </mesh>
            {/* Elbow Joint */}
            <group position={[-0.2, -0.55, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.09, 16, 16]} />
                {jointMaterial}
              </mesh>
              <group ref={leftForearmRef}>
                {/* Lower Arm */}
                <mesh position={[0, -0.25, 0]} castShadow>
                  <capsuleGeometry args={[0.06, 0.3, 16, 16]} />
                  {robotMaterial}
                </mesh>
                {/* Hand */}
                <group position={[0, -0.5, 0]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.12, 0.15, 0.12]} />
                    {robotMaterial}
                  </mesh>
                  {/* Fingers */}
                  <mesh position={[-0.04, -0.12, 0.03]} rotation={[0, 0, 0]} castShadow>
                    <capsuleGeometry args={[0.015, 0.08, 8, 8]} />
                    {jointMaterial}
                  </mesh>
                  <mesh position={[0, -0.12, 0.03]} castShadow>
                    <capsuleGeometry args={[0.015, 0.08, 8, 8]} />
                    {jointMaterial}
                  </mesh>
                  <mesh position={[0.04, -0.12, 0.03]} rotation={[0, 0, 0]} castShadow>
                    <capsuleGeometry args={[0.015, 0.08, 8, 8]} />
                    {jointMaterial}
                  </mesh>
                  {/* Thumb */}
                  <mesh position={[0.07, -0.05, 0.05]} rotation={[0, 0, 0.5]} castShadow>
                    <capsuleGeometry args={[0.015, 0.06, 8, 8]} />
                    {jointMaterial}
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* Right Arm */}
        <group position={[0.45, -0.3, 0]}>
          {/* Shoulder Joint */}
          <mesh castShadow>
            <sphereGeometry args={[0.12, 16, 16]} />
            {jointMaterial}
          </mesh>
          <group ref={rightArmRef}>
            {/* Upper Arm */}
            <mesh position={[0.1, -0.25, 0]} rotation={[0, 0, 0.2]} castShadow>
              <capsuleGeometry args={[0.08, 0.3, 16, 16]} />
              {robotMaterial}
            </mesh>
            {/* Elbow Joint */}
            <group position={[0.2, -0.55, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.09, 16, 16]} />
                {jointMaterial}
              </mesh>
              <group ref={rightForearmRef}>
                {/* Lower Arm */}
                <mesh position={[0, -0.25, 0]} castShadow>
                  <capsuleGeometry args={[0.06, 0.3, 16, 16]} />
                  {robotMaterial}
                </mesh>
                {/* Hand */}
                <group position={[0, -0.5, 0]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.12, 0.15, 0.12]} />
                    {robotMaterial}
                  </mesh>
                  {/* Fingers */}
                  <mesh position={[-0.04, -0.12, 0.03]} rotation={[0, 0, 0]} castShadow>
                    <capsuleGeometry args={[0.015, 0.08, 8, 8]} />
                    {jointMaterial}
                  </mesh>
                  <mesh position={[0, -0.12, 0.03]} castShadow>
                    <capsuleGeometry args={[0.015, 0.08, 8, 8]} />
                    {jointMaterial}
                  </mesh>
                  <mesh position={[0.04, -0.12, 0.03]} rotation={[0, 0, 0]} castShadow>
                    <capsuleGeometry args={[0.015, 0.08, 8, 8]} />
                    {jointMaterial}
                  </mesh>
                  {/* Thumb */}
                  <mesh position={[-0.07, -0.05, 0.05]} rotation={[0, 0, -0.5]} castShadow>
                    <capsuleGeometry args={[0.015, 0.06, 8, 8]} />
                    {jointMaterial}
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* Head */}
      <group ref={headRef} position={[0, 0.4, 0]}>
        {/* Neck Joint */}
        <mesh position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.2, 16]} />
          {jointMaterial}
        </mesh>

        {/* Head Base */}
        <mesh castShadow>
          <boxGeometry args={[0.7, 0.6, 0.6]} />
          {robotMaterial}
        </mesh>
        
        {/* Face Screen */}
        <mesh position={[0, 0, 0.31]}>
          <planeGeometry args={[0.6, 0.4]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>

        {/* Eyes */}
        <group position={[-0.15, 0.05, 0.32]}>
          <mesh ref={leftEyeRef}>
            <capsuleGeometry args={[0.04, 0.08, 16, 16]} />
            <meshBasicMaterial color="#60a5fa" />
          </mesh>
        </group>

        <group position={[0.15, 0.05, 0.32]}>
          <mesh ref={rightEyeRef}>
            <capsuleGeometry args={[0.04, 0.08, 16, 16]} />
            <meshBasicMaterial color="#60a5fa" />
          </mesh>
        </group>

        {/* Mouth */}
        <mesh ref={mouthRef} position={[0, -0.1, 0.32]} rotation={[expression === '难过' ? Math.PI : 0, 0, 0]}>
          <torusGeometry args={[0.05, 0.015, 16, 32, Math.PI]} />
          <meshBasicMaterial color="#60a5fa" />
        </mesh>

        {/* Antenna */}
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.1, 8]} />
          {jointMaterial}
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshBasicMaterial color={isAwake ? "#4ade80" : "#f87171"} />
        </mesh>

        {/* Expression Glow */}
        <pointLight position={[0, 0, 0.5]} intensity={0.5} color={getExpressionColor()} />
      </group>
    </group>
  );
};

export const RobotCharacter = ({ expression, isListening, isSpeaking, lookAt, isAwake }: { expression: string, isListening: boolean, isSpeaking: boolean, lookAt: { x: number, y: number }, isAwake?: boolean }) => {
  return (
    <div className="w-full h-full min-h-[300px] bg-slate-950/50 rounded-3xl overflow-hidden border border-slate-800 shadow-inner relative">
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 0, 3.5]} fov={45} />
        <ambientLight intensity={0.6} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1.5} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
          <HumanoidRobot expression={expression} isListening={isListening} isSpeaking={isSpeaking} lookAt={lookAt} isAwake={isAwake || false} />
        </Float>

        <ContactShadows position={[0, -1.8, 0]} opacity={0.4} scale={10} blur={2} far={4} />
        <Environment preset="city" />
        <Sparkles count={30} scale={4} size={2} speed={0.4} color={isAwake ? "#4ade80" : "#6366f1"} />
      </Canvas>
      
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center pointer-events-none">
        <div className="flex gap-2">
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isAwake ? 'bg-green-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
            {isAwake ? 'Awake' : 'Sleeping'}
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
            {isListening ? 'Listening' : 'Mic Off'}
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
