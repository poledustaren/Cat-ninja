import { OrbitControls, PerspectiveCamera, Sky, Stars, useTexture } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, useBox, useSphere } from "@react-three/cannon";
import { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Heart, Play, RefreshCw, Info, Volume2, VolumeX, Activity, Zap, Sword, ChevronRight } from "lucide-react";
import * as THREE from "three";

// --- Types ---
type CharacterType = "master" | "apprentice";
type GameState = "menu" | "intro" | "playing" | "levelTransition" | "gameOver" | "victory" | "story";

interface StorySegment {
  title: string;
  text: string;
  character: CharacterType;
}

const STORY_DATA: Record<number, StorySegment> = {
  1: {
    title: "Путь Испытания",
    text: "Яша, слушай внимательно! На наш Священный Двор напали грязные Злые Ноги. Покажи им, чему научил тебя мастер Йося!",
    character: "master"
  },
  2: {
    title: "Ярость Мастера",
    text: "Неплохо, Яша. Но теперь в дело вступает настоящий профессионал. Смотри и учись, как Йося Какаши разделывается с обувью!",
    character: "master"
  },
  3: {
    title: "Великий Финал",
    text: "Их слишком много! Яша, Йося — вместе мы непобедимы. Да начнется финальное Какаши-безумие!",
    character: "apprentice"
  }
};

const CatAvatar = ({ type, className }: { type: CharacterType, className?: string }) => {
  const isMaster = type === "master";
  const color = isMaster ? "#1a1a1a" : "#fff";
  const eyeColor = isMaster ? "#eab308" : "#3b82f6";
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 80 C 20 40, 80 40, 80 80 Z" fill={color} stroke="#333" strokeWidth="2"/>
      <path d="M25 50 L 15 20 L 45 40 Z" fill={color} stroke="#333" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M75 50 L 85 20 L 55 40 Z" fill={color} stroke="#333" strokeWidth="2" strokeLinejoin="round"/>
      {isMaster && <path d="M 50 70 L 40 90 L 60 90 Z" fill="#fff" />}
      {type === "apprentice" && (
        <>
          <circle cx="35" cy="65" r="12" fill="#000" opacity="0.1"/>
          <circle cx="65" cy="65" r="12" fill="#000" opacity="0.1"/>
        </>
      )}
      <circle cx="35" cy="65" r="6" fill={eyeColor} />
      <circle cx="65" cy="65" r="6" fill={eyeColor} />
      <circle cx="35" cy="65" r="2" fill="#fff" />
      <circle cx="65" cy="65" r="2" fill="#fff" />
      <path d="M45 75 Q 50 80 55 75" stroke="#ff7675" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Whiskers */}
      <path d="M 25 70 L 10 65 M 25 75 L 5 75 M 25 80 L 10 85" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M 75 70 L 90 65 M 75 75 L 95 75 M 75 80 L 90 85" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
};

const FootAvatar = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 10 L30 60 Q30 90 60 90 L80 90 Q90 90 90 80 L90 50 Q90 40 70 40 L50 40 L50 10 Z" fill="#e17055" stroke="#d63031" strokeWidth="2" strokeLinejoin="round"/>
    <circle cx="60" cy="85" r="5" fill="#fab1a0" />
    <circle cx="72" cy="85" r="4" fill="#fab1a0" />
    <circle cx="82" cy="82" r="3" fill="#fab1a0" />
  </svg>
);

// --- Audio Manager ---
const AUDIO_ASSETS = {
  music: "soundtrack.mp3", // Updated to local file as per user request
  hit: "https://cdn.pixabay.com/audio/2021/08/04/audio_bb630aa364.mp3",
  step: "https://cdn.pixabay.com/audio/2021/08/13/audio_e6900f0732.mp3",
  dash: "https://cdn.pixabay.com/audio/2022/03/10/audio_e08e6f1f41.mp3",
  puff: "https://cdn.pixabay.com/audio/2022/03/15/audio_243467475f.mp3"
};

class SoundManager {
  private music: HTMLAudioElement | null = null;
  private isInitialized = false;
  private onActivityCallback: ((v: number) => void) | null = null;

  init() {
    if (this.isInitialized) return;
    try {
      this.music = new Audio(AUDIO_ASSETS.music);
      this.music.loop = true;
      this.music.preload = "auto";
      this.isInitialized = true;
    } catch (e) {
      console.error("Failed to init SoundManager", e);
    }
  }

  setActivityCallback(cb: (v: number) => void) {
    this.onActivityCallback = cb;
  }

  async playMusic(volume: number = 0.5, startTime: number = 20) {
    if (!this.isInitialized) this.init();
    if (!this.music) return;

    try {
      this.music.volume = volume;
      if (this.music.paused || Math.abs(this.music.currentTime - startTime) > 10) {
        this.music.currentTime = startTime;
      }
      await this.music.play();
    } catch (e) {
      console.warn("Music playback failed", e);
    }
  }

  isMusicPlaying() {
    return this.music ? !this.music.paused : false;
  }

  setMusicVolume(volume: number) {
    if (this.music && this.isInitialized) {
      this.music.volume = volume;
    }
  }

  stopMusic() {
    if (this.music) {
      this.music.pause();
    }
  }

  playSound(type: keyof typeof AUDIO_ASSETS, volume: number = 0.5) {
    try {
      const audio = new Audio(AUDIO_ASSETS[type]);
      audio.volume = volume;
      audio.play().catch(() => {});
      if (this.onActivityCallback) {
        this.onActivityCallback(volume * 100);
      }
    } catch (e) {
      // Ignore
    }
  }
}

const soundManager = new SoundManager();

// --- 3D Components ---

function Ground() {
  const [ref] = useBox(() => ({ rotation: [-Math.PI / 2, 0, 0], position: [0, -0.5, 0], args: [100, 100, 1] }));
  
  // Создаем детальную процедурную текстуру деревянного пола
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Светлый базовый цвет дерева (татами/кедр)
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(0, 0, 1024, 1024);

      // Рисуем длинные доски
      const plankWidth = 128;
      for (let x = 0; x < 1024; x += plankWidth) {
        // Текстура волокон
        for (let i = 0; i < plankWidth; i++) {
          for (let y = 0; y < 1024; y += 4) {
            const grain = Math.random() * 40;
            ctx.fillStyle = `rgba(30, 20, 10, ${0.15 + grain / 255})`;
            ctx.fillRect(x + i, y, 1, 2);
          }
        }

        // Границы досок (глубокие щели)
        ctx.strokeStyle = '#2d1b15';
        ctx.lineWidth = 6;
        ctx.strokeRect(x, 0, plankWidth, 1024);

        // Сучки и "гвозди"
        for (let k = 0; k < 3; k++) {
          const knotY = Math.random() * 1024;
          const knotX = x + Math.random() * plankWidth;
          ctx.beginPath();
          ctx.ellipse(knotX, knotY, 4, 12, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(45, 27, 21, 0.6)';
          ctx.fill();
        }
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }, []);

  return (
    <mesh ref={ref as any} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial map={texture} roughness={0.6} metalness={0.1} color="#ffffff" />
    </mesh>
  );
}

function FollowCamera({ playerPos, level }: { playerPos: React.MutableRefObject<[number, number, number]>; level: number }) {
  useFrame((state) => {
    // Smoothly follow player position
    const targetX = playerPos.current[0];
    const targetZ = playerPos.current[2];
    
    state.camera.position.x += (targetX - state.camera.position.x) * 0.05;
    state.camera.position.z += (targetZ + 12 - state.camera.position.z) * 0.05;
    state.camera.position.y += (12 - state.camera.position.y) * 0.05;
    
    state.camera.lookAt(targetX, 0, targetZ);
  });
  return null;
}

function Cat({ type, velocity, isDashing, puffAmount = 1 }: { type: CharacterType; velocity?: [number, number, number]; isDashing?: boolean; puffAmount?: number }) {
  const group = useRef<any>(null);
  const tailRef = useRef<any>(null);
  const bodyRef = useRef<any>(null);
  const nunchuckRef = useRef<any>(null);
  const beardRef = useRef<any>(null);
  const eyesRef = useRef<any>(null);
  
  const bodyColor = type === "master" ? "#1a1a1a" : "#ffffff";
  const pawColor = type === "master" ? "#ffffff" : "#1a1a1a";
  
  useFrame((state) => {
    if (!group.current) return;
    
    const time = state.clock.getElapsedTime();
    const speed = velocity ? Math.sqrt(velocity[0]**2 + velocity[2]**2) : 0;
    const isMoving = speed > 0.1;

    // Звук ходьбы
    if (isMoving && Math.floor(time * 6) % 2 === 0 && Math.random() > 0.8) {
      soundManager.playSound("step", 0.1);
    }

    // Сглаженный поворот
    if (isMoving) {
      const targetRotation = Math.atan2(velocity![0], velocity![2]);
      if (group.current) {
        group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetRotation, 0.15);
      }
      
      if (bodyRef.current) {
        bodyRef.current.position.y = Math.abs(Math.sin(time * 12)) * 0.1;
        bodyRef.current.rotation.z = Math.sin(time * 10) * 0.1;
      }
    } else {
      if (bodyRef.current) {
        bodyRef.current.position.y = Math.sin(time * 2) * 0.05;
      }
    }

    // Анимация нунчак
    if (nunchuckRef.current) {
      nunchuckRef.current.rotation.z = time * 12;
      nunchuckRef.current.rotation.x = Math.sin(time * 8) * 0.8;
    }

    // Анимация бороды
    if (beardRef.current && type === "master") {
      beardRef.current.rotation.x = 0.2 + Math.sin(time * 3) * 0.1;
    }

    // Blink animation
    if (eyesRef.current) {
       // Blink logic: every 3-5 seconds blink for 150ms
       const isBlinking = time % 4 < 0.15;
       eyesRef.current.scale.y = isBlinking ? 0.1 : 1;
    }

    // Анимация хвоста
    if (tailRef.current) {
      const tailSpeed = isMoving ? 15 : 4;
      const tailRange = isMoving ? 0.4 : 0.2;
      tailRef.current.rotation.x = -0.5 + Math.sin(time * tailSpeed) * tailRange;
      tailRef.current.rotation.y = Math.cos(time * tailSpeed * 0.5) * tailRange;
    }

    // Раздувание (Мастер)
    if (type === "master") {
      group.current.scale.setScalar(puffAmount);
    }
  });

  return (
    <group ref={group}>
      <group ref={bodyRef}>
        {/* Тело (У Мастера реально толстое) */}
        <mesh castShadow scale={type === "master" ? [1.8, 1.2, 1.8] : [1, 1, 1]}>
          <capsuleGeometry args={[0.3, 0.4, 8, 16]} />
          <meshStandardMaterial color={bodyColor} roughness={0.7} />
        </mesh>
        
        {/* Голова */}
        <mesh position={[0, 0.6, 0.2]} castShadow scale={type === "master" ? 1.2 : 1}>
          <sphereGeometry args={[0.32, 20, 20]} />
          <meshStandardMaterial color={bodyColor} roughness={0.7} />
          
          {/* Очень пышная борода (Только для Мастера) */}
          {type === "master" && (
            <group ref={beardRef} position={[0, -0.2, 0.25]}>
              <mesh position={[0, -0.1, 0]} rotation={[0.4, 0, 0]}>
                <coneGeometry args={[0.25, 0.6, 12]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[-0.15, 0, -0.05]} rotation={[0.2, 0, 0.4]}>
                <coneGeometry args={[0.12, 0.4, 8]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[0.15, 0, -0.05]} rotation={[0.2, 0, -0.4]}>
                <coneGeometry args={[0.12, 0.4, 8]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
            </group>
          )}

          {/* Глаза */}
          <group ref={eyesRef} position={[0, 0, 0.2]}>
            {type === "apprentice" && (
              <>
                <mesh position={[-0.15, 0, 0.05]}>
                  <planeGeometry args={[0.2, 0.25]} />
                  <meshBasicMaterial color="#1a1a1a" transparent opacity={0.9} />
                </mesh>
                <mesh position={[0.15, 0, 0.05]}>
                  <planeGeometry args={[0.2, 0.25]} />
                  <meshBasicMaterial color="#1a1a1a" transparent opacity={0.9} />
                </mesh>
              </>
            )}
            
            <mesh position={[-0.15, 0, 0.06]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color={type === "master" ? "#f1c40f" : "#4bcffa"} />
            </mesh>
            <mesh position={[0.15, 0, 0.06]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color={type === "master" ? "#f1c40f" : "#4bcffa"} />
            </mesh>
            <mesh position={[-0.15, 0, 0.12]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshBasicMaterial color="#000000" />
            </mesh>
            <mesh position={[0.15, 0, 0.12]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshBasicMaterial color="#000000" />
            </mesh>
          </group>
        </mesh>

        {/* Уши */}
        <mesh position={[-0.18, 0.75, 0.2]} rotation={[0, 0, 0.3]}>
          <coneGeometry args={[0.1, 0.25, 4]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        <mesh position={[0.18, 0.75, 0.2]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[0.1, 0.25, 4]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>

        {/* Усы */}
        <group position={[0, 0.5, 0.45]}>
          <mesh position={[-0.2, 0, 0]} rotation={[0, 0, 0.2]}>
             <cylinderGeometry args={[0.005, 0.005, 0.3, 3]} />
             <meshBasicMaterial color="#555" />
          </mesh>
          <mesh position={[-0.2, -0.05, 0]} rotation={[0, 0, 0.4]}>
             <cylinderGeometry args={[0.005, 0.005, 0.3, 3]} />
             <meshBasicMaterial color="#555" />
          </mesh>
          <mesh position={[0.2, 0, 0]} rotation={[0, 0, -0.2]}>
             <cylinderGeometry args={[0.005, 0.005, 0.3, 3]} />
             <meshBasicMaterial color="#555" />
          </mesh>
          <mesh position={[0.2, -0.05, 0]} rotation={[0, 0, -0.4]}>
             <cylinderGeometry args={[0.005, 0.005, 0.3, 3]} />
             <meshBasicMaterial color="#555" />
          </mesh>
        </group>

        {/* Лапы и Нунчаки */}
        <group position={[-0.3, -0.3, 0.4]}>
          <mesh castShadow>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color={pawColor} />
          </mesh>
          {/* Нунчаки - грубые куски дерева */}
          <group ref={nunchuckRef} position={[0, 0.2, 0]}>
            <mesh position={[0, 0.2, 0]}>
              <boxGeometry args={[0.08, 0.4, 0.08]} />
              <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.1, 0.1]} rotation={[1.2, 0, 0.5]}>
              <boxGeometry args={[0.08, 0.4, 0.08]} />
              <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </mesh>
            {/* Цепь (металлические кольца) */}
            <mesh position={[0, 0.05, 0.05]} rotation={[0.6, 0, 0]}>
              <torusGeometry args={[0.03, 0.01, 8, 16]} />
              <meshStandardMaterial color="#95a5a6" metalness={0.8} />
            </mesh>
          </group>
        </group>

        <mesh position={[0.3, -0.3, 0.4]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color={pawColor} />
        </mesh>

        {/* Хвост */}
        <group ref={tailRef} position={[0, -0.1, -0.3]}>
          <mesh position={[0, 0, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.06, type === "master" ? 0.8 : 0.4, 4, 12]} />
            <meshStandardMaterial color={bodyColor} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// --- Player Controller ---

function PlayerController({ type, onHit, onPosUpdate, speedMultiplier = 1, joystickInput, isDashingMobile }: { type: CharacterType; onHit: () => void; onPosUpdate?: (pos: [number, number, number]) => void; speedMultiplier?: number; joystickInput?: {x: number, y: number}, isDashingMobile?: boolean }) {
  const [puffAmount, setPuffAmount] = useState(1);
  const isInvulnerable = useRef(false);
  const lastPuffTime = useRef(0);

  const [ref, api] = useSphere(() => ({ 
    mass: type === "master" ? 4 : 1, 
    position: type === "master" ? [2, 5, 0] : [-2, 5, 0], 
    args: [0.5],
    userData: { type: "player" },
    onCollide: (e) => {
      // КРИТИЧЕСКИЙ УРОН ПРИ КОЛЛИЗИИ
      if (e.body.userData?.type === "enemy") {
        if (!isInvulnerable.current) {
          onHit();
        } else {
          // Отбрасываем ногу
          const contactNormal = e.contact.contactNormal; // Из Cannon.js
          const impact = 20;
          // Здесь мы можем попробовать применить импульс к ноге, если у нас есть доступ к её API, 
          // но достаточно того, что игрок теперь тяжелый (mass 4-50) и нога сама отскакивает физически.
        }
      }
    }
  }));

  const position = useRef<[number, number, number]>([0, 0, 0]);
  useEffect(() => api.position.subscribe(p => {
    position.current = p as [number, number, number];
    if (onPosUpdate) onPosUpdate(p as [number, number, number]);
  }), [api.position, onPosUpdate]);

  const velocity = useRef([0, 0, 0]);
  useEffect(() => api.velocity.subscribe(v => velocity.current = v), [api.velocity]);

  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => keys.current[e.key.toLowerCase()] = true;
    const handleUp = (e: KeyboardEvent) => keys.current[e.key.toLowerCase()] = false;
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
    };
  }, []);

  const moveSpeed = type === "master" ? 3 : 8;
  const dashSpeed = type === "master" ? 10 : 25;

  useFrame((state) => {
    const { w, s, a, d, space } = keys.current;
    let x = joystickInput?.x || 0;
    let z = joystickInput?.y || 0;

    if (w) z -= 1;
    if (s) z += 1;
    if (a) x -= 1;
    if (d) x += 1;

    const length = Math.sqrt(x * x + z * z);
    if (length > 0) {
      x /= length;
      z /= length;
    }

    const dashing = space || isDashingMobile;
    
    // Способность Мастера: Раздувание
    if (type === "master" && dashing) {
      const now = state.clock.getElapsedTime();
      if (now - lastPuffTime.current > 2) { // 2s cooldown
        lastPuffTime.current = now;
        setPuffAmount(2.5);
        isInvulnerable.current = true;
        api.mass.set(50); // Делаем тяжелым
        soundManager.playSound("puff", 0.8);
        setTimeout(() => {
          setPuffAmount(1);
          isInvulnerable.current = false;
          api.mass.set(4);
        }, 1000);
      }
    } else if (type === "apprentice" && dashing) {
      // Продвинутый звук рывка для ученика
      const now = state.clock.getElapsedTime();
      if (now - lastPuffTime.current > 0.5) {
        lastPuffTime.current = now;
        soundManager.playSound("dash", 0.4);
      }
    }

    const currentSpeed = dashing ? dashSpeed : moveSpeed;
    api.velocity.set(x * currentSpeed, velocity.current[1], z * currentSpeed);
  });

  return (
    <group ref={ref as any}>
      <Cat 
        type={type} 
        velocity={velocity.current as [number, number, number]} 
        puffAmount={puffAmount}
      />
    </group>
  );
}

// --- Enemy Spawner ---

function EnemySpawner({ onHitPlayer, count = 5, playerPos }: { onHitPlayer: () => void; count?: number, playerPos: React.MutableRefObject<[number, number, number]> }) {
  const [enemies, setEnemies] = useState<number[]>([]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setEnemies(prev => [...prev.slice(-(count * 2)), Date.now()]);
    }, 2000);
    return () => clearInterval(interval);
  }, [count]);

  return (
    <>
      {enemies.map(id => (
        <LegEnemy 
          key={id} 
          id={id}
          position={[(Math.random() - 0.5) * 40, 25, (Math.random() - 0.5) * 40]} 
          onHitPlayer={onHitPlayer}
          targetPos={playerPos}
        />
      ))}
    </>
  );
}

function LegEnemy({ id, position, onHitPlayer, targetPos }: { id: number; position: [number, number, number]; onHitPlayer: () => void, targetPos: React.MutableRefObject<[number, number, number]> }) {
  const [ref, api] = useBox(() => ({ 
    mass: 5, 
    position, 
    args: [1.2, 9, 1.8], // Увеличенный размер для точного попадания по ботинку
    userData: { type: "enemy" },
    onCollide: (e) => {
      // Прямая проверка столкновения с игроком
      if (e.body.userData?.type === "player") {
        onHitPlayer();
      }
    }
  }));

  const pos = useRef([0, 0, 0]);
  useEffect(() => api.position.subscribe(p => pos.current = p), [api.position]);

  const legMesh = useRef<any>(null);
  const footRef = useRef<any>(null);
  const shoeType = useMemo(() => Math.floor(Math.random() * 3), []); // 0: Sneaker, 1: Boot, 2: Sandal

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    const dx = targetPos.current[0] - pos.current[0];
    const dz = targetPos.current[2] - pos.current[2];
    const dist = Math.sqrt(dx*dx + dz*dz);
    
    if (dist > 0.1) {
      api.velocity.set(dx / dist * 5, -10, dz / dist * 5);
      // Звук шага ноги
      if (Math.floor(state.clock.getElapsedTime() * 4) % 4 === 0 && Math.random() > 0.95) {
        soundManager.playSound("step", 0.15);
      }
    }

    if (legMesh.current && footRef.current) {
      const stretchFreq = 2 + (id % 5) * 0.5;
      const stretchAmount = Math.sin(time * stretchFreq) * 1.5;
      legMesh.current.scale.y = 1 + stretchAmount * 0.1;
      footRef.current.position.y = -4 * (1 + stretchAmount * 0.1);
    }
  });

  const shoeColor = shoeType === 0 ? "#0984e3" : shoeType === 1 ? "#6d4c41" : "#ffeaa7";
  const pantColor = shoeType === 1 ? "#2d3436" : "#e17055";

  return (
    <group ref={ref as any}>
      {/* Leg - Skin or Pant */}
      <mesh ref={legMesh} castShadow>
        <cylinderGeometry args={[0.5, 0.4, 8, 16]} />
        <meshStandardMaterial color={pantColor} />
      </mesh>
      {/* Foot / Shoe */}
      <mesh ref={footRef} position={[0, -4, 0.3]} castShadow>
        <boxGeometry args={[1, 0.8, 1.6]} />
        <meshStandardMaterial color={shoeColor} />
        
        {/* Toes added for bare foot (sandal) or shoe tip details */}
        {shoeType === 2 && ( // Barefoot/Sandal toes
          <group position={[0, 0, 0.8]}>
            <mesh position={[-0.3, -0.2, 0.2]} castShadow>
              <sphereGeometry args={[0.2, 8, 8]} />
              <meshStandardMaterial color={shoeColor} />
            </mesh>
            <mesh position={[-0.1, -0.2, 0.25]} castShadow>
              <sphereGeometry args={[0.18, 8, 8]} />
              <meshStandardMaterial color={shoeColor} />
            </mesh>
            <mesh position={[0.1, -0.2, 0.22]} castShadow>
              <sphereGeometry args={[0.15, 8, 8]} />
              <meshStandardMaterial color={shoeColor} />
            </mesh>
            <mesh position={[0.3, -0.2, 0.15]} castShadow>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshStandardMaterial color={shoeColor} />
            </mesh>
          </group>
        )}
        {shoeType !== 2 && (
          <group position={[0, -0.1, 0.8]}>
             <boxGeometry args={[0.9, 0.6, 0.4]} />
             <meshStandardMaterial color={shoeType === 0 ? "white" : "#4e342e"} />
          </group>
        )}

        {/* Additional shoe details */}
        {shoeType === 0 && ( // Sneaker stripes
          <group position={[0, 0.1, 0]}>
            <mesh position={[0, 0.3, 0.2]}>
              <boxGeometry args={[1.05, 0.1, 0.2]} />
              <meshStandardMaterial color="white" />
            </mesh>
            <mesh position={[0, 0.1, 0.2]}>
              <boxGeometry args={[1.05, 0.1, 0.2]} />
              <meshStandardMaterial color="white" />
            </mesh>
          </group>
        )}
        {shoeType === 1 && ( // Boot sole
           <mesh position={[0, -0.4, 0]}>
             <boxGeometry args={[1.1, 0.2, 1.7]} />
             <meshStandardMaterial color="#1a1a1a" />
           </mesh>
        )}
        {shoeType === 2 && ( // Sandal straps
          <group position={[0, 0.4, 0]}>
            <mesh position={[0, 0, 0.3]}>
              <boxGeometry args={[1.05, 0.1, 0.2]} />
              <meshStandardMaterial color="#6d4c41" />
            </mesh>
            <mesh position={[0, 0, -0.2]}>
              <boxGeometry args={[1.05, 0.1, 0.2]} />
              <meshStandardMaterial color="#6d4c41" />
            </mesh>
          </group>
        )}
      </mesh>
    </group>
  );
}

// --- Main App Component ---

export default function App() {
  const [gameState, setGameState] = useState<GameState>("menu");
  const [level, setLevel] = useState(1);
  const [health, setHealth] = useState(100);
  const [lives, setLives] = useState(3);
  const [physicsKey, setPhysicsKey] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isMusicActive, setIsMusicActive] = useState(false);
  const [audioActivity, setAudioActivity] = useState(0);
  const [introStep, setIntroStep] = useState(0);
  const [joystick, setJoystick] = useState({ x: 0, y: 0 });
  const [isDashing, setIsDashing] = useState(false);
  const [isHitFlash, setIsHitFlash] = useState(false);
  const lastHitTime = useRef(0);

  const getLevelDuration = (lvl: number) => {
    if (lvl === 1) return 30;
    if (lvl === 2) return 60;
    return 90;
  };

  useEffect(() => {
    soundManager.setActivityCallback((v) => {
      setAudioActivity(v);
      setTimeout(() => setAudioActivity(0), 150);
    });
  }, []);

  useEffect(() => {
    // Управление музыкой
    if (gameState === "menu" || gameState === "intro" || gameState === "story" || gameState === "gameOver" || gameState === "victory") {
      soundManager.playMusic(0.4, 20).then(() => setIsMusicActive(true));
    } else if (gameState === "playing" || gameState === "levelTransition") {
      soundManager.setMusicVolume(0.1);
      soundManager.playMusic(0.1, 20).then(() => setIsMusicActive(true));
    }
  }, [gameState]);

  useEffect(() => {
    let interval: any;
    if (gameState === "playing" && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (gameState === "playing" && timeLeft <= 0) {
      nextLevel();
    }
    return () => clearInterval(interval);
  }, [gameState, timeLeft]);

  const startGame = () => {
    soundManager.init();
    soundManager.playMusic(0.4, 20).then(() => setIsMusicActive(true));
    setGameState("intro");
    setIntroStep(0);
  };

  const skipIntro = () => {
    setLevel(1);
    setLives(3);
    setHealth(100);
    setTimeLeft(getLevelDuration(1));
    lastHitTime.current = 0;
    setIsHitFlash(false);
    setPhysicsKey(k => k + 1);
    playerPos.current = [0, 0, 0];
    startStory(1);
  };

  useEffect(() => {
    if (gameState === "intro") {
      const timer = setInterval(() => {
        setIntroStep(prev => {
          if (prev >= 10) {
            clearInterval(timer);
            skipIntro();
            return 10;
          }
          return prev + 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState]);

  const restartCurrentLevel = () => {
    setHealth(100);
    setTimeLeft(getLevelDuration(level));
    lastHitTime.current = 0;
    setIsHitFlash(false);
    setPhysicsKey(k => k + 1);
    playerPos.current = [0, 0, 0];
    setGameState("story");
  };

  const onHit = () => {
    const now = Date.now();
    if (now - lastHitTime.current < 500) return; // 500ms cooldown
    lastHitTime.current = now;
    setHealth(prev => Math.max(0, prev - 50));
    setIsHitFlash(true);
    soundManager.playSound("hit", 0.6);
    setTimeout(() => setIsHitFlash(false), 300);
  };

  const startStory = (lvl: number) => {
    setLevel(lvl);
    setTimeLeft(getLevelDuration(lvl));
    setGameState("story");
  };

  const proceedToGameplay = () => {
    setGameState("levelTransition");
    setTimeout(() => setGameState("playing"), 2000);
  };

  const nextLevel = () => {
    if (level < 3) {
      startStory(level + 1);
    } else {
      setGameState("victory");
    }
  };

  useEffect(() => {
    if (health <= 0 && gameState === "playing") {
      if (lives > 1) {
        setLives(prev => prev - 1);
        restartCurrentLevel();
      } else {
        setLives(0);
        setGameState("gameOver");
      }
    }
  }, [health, gameState, lives]);

  const playerPos = useRef<[number, number, number]>([0, 0, 0]);

  return (
    <div className="w-full h-screen bg-[#1e272e] flex flex-col overflow-hidden text-white font-sans touch-none">
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 z-10 flex justify-between items-start pointer-events-none">
        <AnimatePresence>
          {isHitFlash && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-red-600 pointer-events-none z-50 shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]"
            />
          )}
        </AnimatePresence>
        {/* Audio Controls & Activity */}
        <div className="flex flex-col gap-3 items-end">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (isMusicActive) {
                soundManager.stopMusic();
                setIsMusicActive(false);
              } else {
                soundManager.playMusic(gameState === "playing" ? 0.1 : 0.4, 20);
                setIsMusicActive(true);
              }
            }}
            className="pointer-events-auto p-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-lg"
          >
            {isMusicActive ? <Volume2 size={20} /> : <VolumeX size={20} className="text-red-400" />}
          </motion.button>

          {/* Audio Activity Meter */}
          <div className="flex flex-col items-center gap-1 pointer-events-none">
            <div className="text-[10px] uppercase font-bold tracking-widest opacity-50 mb-1">Impact Meter</div>
            <div className="flex gap-1 h-12 items-end">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: audioActivity > (i * 20) ? `${Math.min(100, audioActivity)}%` : "10%" 
                  }}
                  className={`w-1 rounded-full ${audioActivity > 80 ? 'bg-orange-500' : 'bg-blue-400'}`}
                />
              ))}
            </div>
            <div className="text-[10px] font-mono text-blue-300">
              {Math.floor(audioActivity)}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {gameState === "playing" && (
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex items-center gap-4"
            >
              <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-white/20">
                <img 
                  src={level === 2 ? "https://api.dicebear.com/7.x/bottts/svg?seed=master" : "https://api.dicebear.com/7.x/bottts/svg?seed=apprentice"} 
                  alt="avatar" 
                  className="w-full h-full object-cover bg-gray-800"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center w-48">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-60">ОЗ</span>
                  <div className="flex gap-1">
                    {[...Array(3)].map((_, i) => (
                      <Heart 
                        key={i} 
                        size={12} 
                        fill={i < lives ? "#ef4444" : "none"} 
                        className={i < lives ? "text-red-500" : "text-gray-600"} 
                      />
                    ))}
                  </div>
                  <span className="text-xs font-mono">{health}%</span>
                </div>
                <div className="w-48 h-2 bg-gray-700/50 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: "100%" }}
                    animate={{ width: `${health}%` }}
                    className={`h-full ${health < 30 ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-green-500 shadow-[0_0_10px_#22c55e]'}`}
                  />
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex justify-between items-center w-24">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60">ВРЕМЯ</span>
                    <span className={`text-xs font-mono font-bold ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-yellow-500'}`}>
                      {timeLeft}с
                    </span>
                  </div>
                  <div className="w-24 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                    <motion.div 
                      className={`h-full ${timeLeft < 10 ? 'bg-red-500' : 'bg-yellow-500'}`}
                      initial={{ width: "100%" }}
                      animate={{ width: `${(timeLeft / getLevelDuration(level)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {gameState === "playing" && (
            <motion.div 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="bg-black/40 backdrop-blur-md p-3 px-6 rounded-full border border-white/10"
            >
              <span className="text-sm font-bold uppercase tracking-widest text-yellow-500">УРОВЕНЬ {level}</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* 3D Scene */}
      <div className="w-full h-full">
        <Canvas shadows>
          <Suspense fallback={null}>
            <PerspectiveCamera makeDefault position={[0, 15, 20]} fov={45} />
            <ambientLight intensity={0.7} />
            <pointLight position={[20, 20, 20]} intensity={1.5} castShadow shadow-blur={10} />
            <spotLight position={[-20, 30, 20]} angle={0.4} intensity={2.5} castShadow />
            <directionalLight position={[0, 50, 0]} intensity={0.8} castShadow />
            
            <Sky sunPosition={[100, 20, 100]} />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            
            <Physics key={physicsKey} gravity={[0, -30, 0]}>
              <Ground />
              <FollowCamera playerPos={playerPos} level={level} />
              {gameState === "playing" && (
                <>
                  {level === 3 ? (
                    <>
                      <PlayerController 
                        key="apprentice-lvl3"
                        type="apprentice" 
                        onHit={onHit}
                        onPosUpdate={(p) => playerPos.current = p}
                        joystickInput={joystick}
                        isDashingMobile={isDashing}
                      />
                      <PlayerController 
                        key="master-lvl3"
                        type="master" 
                        onHit={onHit} 
                        joystickInput={joystick}
                        isDashingMobile={isDashing}
                      />
                    </>
                  ) : (
                    <PlayerController 
                      key={`player-lvl${level}`}
                      type={level === 2 ? "master" : "apprentice"} 
                      onHit={onHit}
                      onPosUpdate={(p) => playerPos.current = p}
                      joystickInput={joystick}
                      isDashingMobile={isDashing}
                    />
                  )}
                  <EnemySpawner onHitPlayer={onHit} count={level * 5} playerPos={playerPos} />
                </>
              )}
            </Physics>

            <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.1} />
          </Suspense>
        </Canvas>
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {gameState === "intro" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] bg-black flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="absolute top-10 right-10 z-10">
              <button 
                onClick={skipIntro}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-md transition-all active:scale-95 pointer-events-auto"
              >
                Пропустить Skip
              </button>
            </div>

            <div className="max-w-3xl w-full space-y-12">
              <AnimatePresence mode="wait">
                {introStep < 3 ? (
                  <motion.div 
                    key="step1"
                    initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 1.5, rotate: 20 }}
                    className="flex flex-col items-center gap-6"
                  >
                    <motion.div 
                      animate={{ y: [0, -20, 0], rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="w-48 h-48 bg-gray-800 rounded-3xl p-4 border-4 border-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.4)] overflow-hidden"
                    >
                       <CatAvatar type="master" className="w-full h-full" />
                    </motion.div>
                    <div className="space-y-2">
                       <p className="text-yellow-500 text-sm font-bold uppercase tracking-[0.3em]">Мастер Йося</p>
                       <p className="text-3xl font-black text-white italic leading-tight drop-shadow-lg">
                         "МАСТЕР ЙОСЯ КУЕТ СТАЛЬНЫЕ НУНЧАКИ В ПЛАМЕНИ СПРАВЕДЛИВОСТИ!"
                       </p>
                    </div>
                  </motion.div>
                ) : introStep < 6 ? (
                  <motion.div 
                    key="step2"
                    initial={{ opacity: 0, x: -100, rotate: -10 }}
                    animate={{ opacity: 1, x: 0, rotate: 0 }}
                    exit={{ opacity: 0, x: 100, rotate: 10 }}
                    className="flex flex-col items-center gap-6"
                  >
                    <motion.div 
                      animate={{ x: [-10, 10, -10] }}
                      transition={{ duration: 0.2, repeat: Infinity }}
                      className="w-48 h-48 bg-gray-800 rounded-3xl p-4 border-4 border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.4)] overflow-hidden"
                    >
                       <CatAvatar type="apprentice" className="w-full h-full" />
                    </motion.div>
                    <div className="space-y-2">
                       <p className="text-blue-400 text-sm font-bold uppercase tracking-[0.3em]">Ученик Яша</p>
                       <p className="text-3xl font-black text-white italic leading-tight drop-shadow-lg">
                         "ЯША ТРЕНИРУЕТ ТЕХНИКУ СКРЫТЫХ ЛАП, ГОТОВЯСЬ К ГНЕВУ НОГ!"
                       </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="step3"
                    initial={{ opacity: 0, scale: 2 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, filter: "blur(20px)" }}
                    className="flex flex-col items-center gap-6"
                  >
                    <div className="flex gap-4 relative">
                      <motion.div 
                        animate={{ x: [-50, 0] }}
                        className="w-32 h-32 bg-gray-800 rounded-3xl p-2 border border-white/10"
                      >
                        <CatAvatar type="master" className="w-full h-full" />
                      </motion.div>
                      <div className="w-40 h-40 bg-red-600 rounded-3xl p-4 border-4 border-white flex items-center justify-center shadow-[0_0_100px_rgba(220,38,38,0.8)]">
                         <Sword size={80} className="text-white animate-bounce" />
                      </div>
                      <motion.div 
                        animate={{ x: [50, 0] }}
                        className="w-32 h-32 bg-gray-800 rounded-3xl p-2 border border-white/10"
                      >
                        <CatAvatar type="apprentice" className="w-full h-full" />
                      </motion.div>
                    </div>
                    <div className="space-y-2">
                       <p className="text-red-500 text-sm font-bold uppercase tracking-[0.3em] animate-pulse">КРИТИЧЕСКАЯ УГРОЗА</p>
                       <p className="text-4xl font-black text-white italic leading-tight uppercase tracking-tighter">
                         "ЗЛЫЕ НОГИ БЛИЗКО! ЙОСЯ И ЯША ВЫХОДЯТ НА ТРОПУ ВОЙНЫ!"
                       </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-64 h-1 bg-white/10 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${introStep * 10}%` }}
                 className="h-full bg-yellow-500"
               />
            </div>
          </motion.div>
        )}

        {gameState === "story" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-6 overflow-hidden"
          >
            {/* Visual Action Background Elements */}
            <div className="absolute inset-0 opacity-20 pointer-events-none flex justify-center items-center">
              <motion.div 
                animate={{ x: [-500, 500], rotate: [0, 360] }}
                transition={{ duration: 4, repeat: Infinity, repeatType: "mirror" }}
                className="w-[800px] h-[800px] absolute"
              >
                <Sword size={800} className="text-white opacity-10" />
              </motion.div>
            </div>

            <div className="max-w-3xl w-full bg-gray-900/80 backdrop-blur-md border border-red-500/30 rounded-3xl p-10 flex flex-col items-center gap-8 shadow-[0_0_80px_rgba(220,38,38,0.3)] text-center relative z-10">
              
              <div className="flex gap-8 justify-center items-center mb-4">
                <motion.div 
                  initial={{ x: -100, rotate: -20, opacity: 0 }}
                  animate={{ x: 0, rotate: 0, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.6 }}
                  className="w-32 h-32 bg-gray-800 rounded-full border-4 border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)] overflow-hidden p-2"
                >
                  <CatAvatar type="master" className="w-full h-full" />
                </motion.div>
                
                <motion.div
                   animate={{ scale: [1, 1.5, 1], rotate: [0, 15, -15, 0] }}
                   transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                >
                  <Sword size={48} className="text-red-500" />
                </motion.div>

                <motion.div 
                  initial={{ x: 100, rotate: 20, opacity: 0 }}
                  animate={{ x: 0, rotate: 0, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.6, delay: 0.2 }}
                  className="w-32 h-32 bg-gray-800 rounded-full border-4 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.5)] overflow-hidden p-2"
                >
                  {level === 3 ? <CatAvatar type="apprentice" className="w-full h-full" /> : <FootAvatar className="w-full h-full" />}
                </motion.div>
              </div>

              <div className="space-y-4">
                <motion.h2 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm font-bold uppercase tracking-[0.3em] text-red-500"
                >
                  СЦЕНА {level}
                </motion.h2>
                <motion.h1 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-4xl font-black italic tracking-tighter text-white uppercase drop-shadow-md"
                >
                  {STORY_DATA[level].title}
                </motion.h1>
                <p className="text-xl text-gray-300 leading-relaxed font-medium mt-4 italic max-w-xl mx-auto">
                  "{STORY_DATA[level].text}"
                </p>
              </div>
              <button 
                onClick={proceedToGameplay}
                className="group flex items-center justify-center gap-3 w-full py-5 bg-gradient-to-r from-red-600 to-orange-600 text-white font-black uppercase text-xl tracking-wider rounded-2xl hover:scale-105 transition-all shadow-[0_10px_40px_rgba(220,38,38,0.4)] active:scale-95"
              >
                ПРОДОЛЖИТЬ <ChevronRight className="group-hover:translate-x-2 transition-transform" />
              </button>
            </div>
          </motion.div>
        )}

        {gameState === "menu" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]"
          >
            {/* Animated Background Layers */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
              <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-transparent to-black" />
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] opacity-10"
                style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '100px 100px' }}
              />
            </div>

            <div className="max-w-md w-full p-8 bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-3xl text-center space-y-8 shadow-[0_0_100px_rgba(234,179,8,0.2)]">
              <div className="space-y-2">
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 via-orange-500 to-red-600 leading-tight">
                    ЙОСИ И ЯШИ:<br/>КАКАШИ-НИНДЗЯ
                  </h1>
                </motion.div>
                <p className="text-yellow-500/80 text-sm font-bold uppercase tracking-widest">Битва против Гигантских Ног</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-left group hover:bg-white/10 transition-colors">
                  <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center mb-2 border border-yellow-500/30">
                    <CatAvatar type="master" className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-yellow-500 uppercase">Йося</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed uppercase">Мастер какаши-до. Медленный, но сокрушительный.</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-left group hover:bg-white/10 transition-colors">
                  <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center mb-2 border border-blue-500/30">
                    <CatAvatar type="apprentice" className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-blue-400 uppercase">Яша</p>
                  <p className="text-[10px] text-gray-400 leading-relaxed uppercase">Ученик-молния. Скорость — его главное оружие.</p>
                </div>
              </div>

              <button 
                onClick={startGame}
                className="w-full py-5 bg-gradient-to-r from-yellow-500 to-orange-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-lg pointer-events-auto"
              >
                <Sword size={24} className="animate-pulse" />
                ВСТУПИТЬ В БОЙ
              </button>
            </div>
          </motion.div>
        )}

        {gameState === "levelTransition" && (
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          >
            <h2 className="text-8xl font-black italic tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">
              LEVEL {level}
            </h2>
          </motion.div>
        )}
        {gameState === "gameOver" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-red-900/80 backdrop-blur-md"
          >
            <div className="text-center space-y-6">
              <h1 className="text-6xl font-black italic tracking-tighter">МИССИЯ ПРОВАЛЕНА</h1>
              <p className="text-xl text-white/60">Ноги сегодня оказались сильнее...</p>
              <button 
                onClick={startGame}
                className="px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-yellow-400 transition-colors"
              >
                ПОПРОБОВАТЬ СНОВА
              </button>
            </div>
          </motion.div>
        )}

        {gameState === "victory" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-blue-900/80 backdrop-blur-md"
          >
            <div className="text-center space-y-6">
              <h1 className="text-7xl font-black italic tracking-tighter text-yellow-400">ПОБЕДА</h1>
              <p className="text-2xl font-bold">Путь Лапы торжествует!</p>
              <div className="p-4 bg-white/10 rounded-2xl border border-white/20">
                <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-2">Ранг Ниндзя</p>
                <p className="text-3xl font-black">ВЕРХОВНЫЙ ИСТРЕБИТЕЛЬ НОГ</p>
              </div>
              <button 
                onClick={() => setGameState("menu")}
                className="px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-yellow-400 transition-colors"
              >
                ВЕРНУТЬСЯ В ХРАМ
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Controls */}
      {gameState === "playing" && (
        <div className="absolute bottom-0 left-0 w-full p-10 z-20 flex justify-between items-end pointer-events-none md:hidden">
          {/* Virtual Joystick Area */}
          <div 
            className="w-44 h-44 bg-white/5 rounded-full border-2 border-white/10 flex items-center justify-center pointer-events-auto relative shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]"
            onTouchMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const touch = e.touches[0];
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = touch.clientX - centerX;
              const dy = touch.clientY - centerY;
              const dist = Math.sqrt(dx*dx + dy*dy);
              const maxDist = rect.width / 2;
              
              const x = dx / maxDist;
              const y = dy / maxDist;
              setJoystick({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
            }}
            onTouchEnd={() => setJoystick({ x: 0, y: 0 })}
          >
            <div 
              className="absolute w-16 h-16 bg-white/30 rounded-full shadow-2xl border border-white/50" 
              style={{ 
                transform: `translate(${joystick.x * 40}px, ${joystick.y * 40}px)`,
                transition: joystick.x === 0 ? 'transform 0.1s ease-out' : 'none'
              }}
            />
          </div>

          <button 
            className="w-24 h-24 bg-yellow-500/80 rounded-full flex items-center justify-center pointer-events-auto active:scale-90 active:bg-yellow-400 transition-all shadow-[0_0_20px_rgba(234,179,8,0.4)]"
            onTouchStart={() => setIsDashing(true)}
            onTouchEnd={() => setIsDashing(false)}
          >
            <Zap size={32} className="text-black fill-black" />
          </button>
        </div>
      )}

      {/* Bottom Controls Help */}
      {gameState === "playing" && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none hidden md:flex">
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md p-2 px-4 rounded-xl border border-white/5 text-[10px] font-bold uppercase tracking-widest opacity-60">
            <span>WASD — Движение</span>
          </div>
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md p-2 px-4 rounded-xl border border-white/5 text-[10px] font-bold uppercase tracking-widest opacity-60">
            <span>Пробел — Рывок</span>
          </div>
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md p-2 px-4 rounded-xl border border-white/5 text-[10px] font-bold uppercase tracking-widest opacity-60">
            <span>Мышь — Обзор</span>
          </div>
        </div>
      )}
    </div>
  );
}
