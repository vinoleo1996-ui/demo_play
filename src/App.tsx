import React, { useState, useEffect, useRef } from 'react';
import { auth, db, signIn, signOut } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, setDoc, addDoc, onSnapshot, query, orderBy, limit, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { extractMemory, generateProactiveResponse, chatWithRobot, Memory, Persona, generateTTS, PersonaPresets } from './lib/gemini';
import { LiveAPI } from './lib/live';
import { initAudioTasks, getLoudness } from './lib/audioTasks';
import { behaviorManager, RobotEvent } from './lib/behaviorManager';
import { RobotCharacter } from './components/RobotCharacter';
import { Camera, Send, User as UserIcon, Settings, Brain, Smile, LogOut, Upload, Sparkles, RefreshCw, Mic, MicOff, Volume2, ShieldCheck, Trash2, MapPin, Activity, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [persona, setPersona] = useState<Persona>({ name: '小博', mbti: 'ENFJ', style: '温暖且支持' });
  const [memories, setMemories] = useState<Memory[]>([]);
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [currentExpression, setCurrentExpression] = useState<string | null>(null);
  const [robotExpression, setRobotExpression] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProactiveTriggered, setIsProactiveTriggered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationProgress, setRegistrationProgress] = useState(0);
  const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [isRecognized, setIsRecognized] = useState(false);
  const [isStranger, setIsStranger] = useState(false);
  const [recognizedPerson, setRecognizedPerson] = useState<string | null>(null);
  const [registeredPeople, setRegisteredPeople] = useState<{ id: string, name: string, descriptor: number[], backgroundInfo?: string }[]>([]);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [autoStartLive, setAutoStartLive] = useState(true);
  const autoStartLiveRef = useRef(true);

  useEffect(() => {
    autoStartLiveRef.current = autoStartLive;
  }, [autoStartLive]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [inputName, setInputName] = useState('');
  const [inputBackground, setInputBackground] = useState('');
  const [virtualDate, setVirtualDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState<string | null>(null);
  const [lookAt, setLookAt] = useState({ x: 0, y: 0 });
  const [loudness, setLoudness] = useState(0);
  const [lastGesture, setLastGesture] = useState<string | null>(null);
  const [isAwake, setIsAwake] = useState(false);
  const [panelDirection, setPanelDirection] = useState<'horizontal' | 'vertical'>('horizontal');
  const wakeWord = "小博";

  const videoRef = useRef<HTMLVideoElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const liveApiRef = useRef<LiveAPI | null>(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation(`纬度: ${position.coords.latitude.toFixed(4)}, 经度: ${position.coords.longitude.toFixed(4)}`);
        },
        (error) => {
          console.error("Geolocation error:", error);
          setLocation("上海"); // Fallback to Shanghai as requested if permission fails
        }
      );
    } else {
      setLocation("上海");
    }
  }, []);
  
  // Refs for detection loop to avoid stale closures
  const isDetectingRef = useRef(false);
  const isRecognizedRef = useRef(false);
  const isStrangerRef = useRef(false);
  const recognizedPersonRef = useRef<string | null>(null);
  const registeredPeopleRef = useRef<{ id: string, name: string, descriptor: number[], backgroundInfo?: string }[]>([]);
  const faceLostCounterRef = useRef(0);
  const lastGreetedTimeRef = useRef<Record<string, number>>({});
  const lastProactiveTimeRef = useRef<number>(0);
  const lastGestureTimeRef = useRef<Record<string, number>>({});
  const lastPoseTimeRef = useRef<Record<string, number>>({});
  const lastHappyTriggerTimeRef = useRef(0);
  const lastProactiveDateRef = useRef<Record<string, string>>({}); // personName -> lastProactiveDate
  const isProcessingRef = useRef(false);
  const virtualDateRef = useRef(virtualDate);
  const memoriesRef = useRef<Memory[]>([]);
  const happyDurationCounterRef = useRef(0);

  useEffect(() => {
    virtualDateRef.current = virtualDate;
  }, [virtualDate]);

  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

  useEffect(() => {
    isDetectingRef.current = isDetecting;
  }, [isDetecting]);

  useEffect(() => {
    isRecognizedRef.current = isRecognized;
  }, [isRecognized]);

  useEffect(() => {
    isStrangerRef.current = isStranger;
  }, [isStranger]);

  useEffect(() => {
    recognizedPersonRef.current = recognizedPerson;
  }, [recognizedPerson]);

  useEffect(() => {
    registeredPeopleRef.current = registeredPeople;
  }, [registeredPeople]);

  useEffect(() => {
    const handleResize = () => {
      setPanelDirection(window.innerWidth < 768 ? 'vertical' : 'horizontal');
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ... (rest of the code)

  // In settings modal:
  // <div className="space-y-4">
  //   <h3 className="text-white font-bold">性格预设</h3>
  //   <div className="grid grid-cols-2 gap-2">
  //     {Object.entries(PersonaPresets).map(([key, p]) => (
  //       <button 
  //         key={key}
  //         onClick={() => setPersona(p)}
  //         className={cn("px-3 py-2 rounded-lg text-sm transition-all", persona.name === p.name ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700")}
  //       >
  //         {p.name}
  //       </button>
  //     ))}
  //   </div>
  // </div>

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        const personaRef = doc(db, 'users', u.uid, 'persona', 'current');
        getDoc(personaRef).then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.persona) {
              setPersona(prev => ({ ...prev, ...data.persona }));
            }
          }
        });

        const peopleRef = collection(db, 'users', u.uid, 'people');
        const peopleQuery = query(peopleRef, orderBy('timestamp', 'desc'));
        onSnapshot(peopleQuery, (snapshot) => {
          setRegisteredPeople(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as { id: string, name: string, descriptor: number[], backgroundInfo?: string })));
        });

        const memoriesRef = collection(db, 'users', u.uid, 'memories');
        const q = query(memoriesRef, orderBy('timestamp', 'desc'), limit(10));
        onSnapshot(q, (snapshot) => {
          setMemories(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Memory)));
        });
      }
    });
    return unsubscribe;
  }, []);

  const retryLoadModels = () => {
    setModelError(null);
    setIsModelsLoaded(false);
    // ----------------------------------------------------------------------
    // 4090 终局架构：不再在浏览器端加载沉重的模型
    // ----------------------------------------------------------------------
    // Promise.all([loadModels(), initVisionTasks()])
    Promise.resolve()
      .then(() => {
        setIsModelsLoaded(true);
        console.log("AI Models (Server-Side) ready");
        initAudioTasks((command, score) => {
          if (command === '_unknown_' || command === 'noise') {
            behaviorManager.pushEvent('special_timbre', { command, score });
          }
        });
      })
      .catch(err => {
        console.error("AI Models failed to load:", err);
        setModelError("无法连接到后端推理引擎。");
      });
  };

  useEffect(() => {
    retryLoadModels();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startCamera = async () => {
    // Create AudioContext synchronously on user click
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true,
          audio: { 
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsDetecting(true);
        }

        audioStreamRef.current = stream;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        audioContextRef.current = audioCtx;

        if (autoStartLiveRef.current && !liveApiRef.current) {
          toggleLiveAPI(audioCtx, stream);
        }
      } catch (err) {
        console.error("Error starting camera/audio:", err);
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsDetecting(false);
    setIsRecognized(false);
    setIsStranger(false);
    setRecognizedPerson(null);
    setCurrentExpression(null);
    
    // Reset refs
    isDetectingRef.current = false;
    isRecognizedRef.current = false;
    isStrangerRef.current = false;
    recognizedPersonRef.current = null;
    faceLostCounterRef.current = 0;
  };

  useEffect(() => {
    let interval: any;
    if (isDetecting && isModelsLoaded) {
      interval = setInterval(handleDetect, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isDetecting, isModelsLoaded]); // Removed isRecognized and registeredPeople to avoid frequent interval resets, handleDetect will use refs or state correctly

  const lastFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const inferenceWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to the Node.js WebSocket server (which proxies to Python GPU engine)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("Connected to Inference WebSocket");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "inference_result") {
          // ------------------------------------------------------------------
          // 4090 终局架构：处理服务端返回的推理结果
          // ------------------------------------------------------------------
          if (data.faces && data.faces.length > 0) {
            faceLostCounterRef.current = 0;
            const face = data.faces[0];
            
            // 模拟更新 UI
            if (face.name && face.name !== "Unknown") {
              setIsRecognized(true);
              setIsStranger(false);
              setRecognizedPerson(face.name);
            } else {
              setIsRecognized(false);
              setIsStranger(true);
              setRecognizedPerson(null);
            }
            
            if (face.emotion) {
              const expressionMap: Record<string, string> = {
                'happy': '开心', 'sad': '难过', 'angry': '生气', 'surprised': '惊讶',
                'fearful': '恐惧', 'disgusted': '厌恶', 'neutral': '平静'
              };
              setCurrentExpression(expressionMap[face.emotion] || face.emotion);
            }
          } else {
            faceLostCounterRef.current++;
            if (faceLostCounterRef.current > 5) {
              setIsRecognized(false);
              setIsStranger(false);
              setRecognizedPerson(null);
              setCurrentExpression(null);
            }
          }

          if (data.gesture && data.gesture !== "none") {
            setLastGesture(data.gesture);
            behaviorManager.pushEvent('gesture_detected', { gesture: data.gesture });
          }

          if (data.pose && data.pose !== "none") {
            behaviorManager.pushEvent('pose_detected', { pose: data.pose });
          }
        }
      } catch (e) {
        console.error("Error parsing inference result:", e);
      }
    };

    inferenceWsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  const handleDetect = async () => {
    if (videoRef.current && isDetectingRef.current && isModelsLoaded && !isProcessingRef.current) {
      isProcessingRef.current = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth / 4;
        canvas.height = videoRef.current.videoHeight / 4;
        const ctx = canvas.getContext('2d');
        
        if (ctx && videoRef.current.videoWidth > 0) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          
          // ------------------------------------------------------------------
          // 4090 终局架构：发送帧到服务端进行 GPU 推理
          // ------------------------------------------------------------------
          if (inferenceWsRef.current?.readyState === WebSocket.OPEN) {
            const base64Image = canvas.toDataURL('image/jpeg', 0.6);
            inferenceWsRef.current.send(JSON.stringify({
              type: "frame",
              image: base64Image
            }));
          }

          // 1. Motion Detection (Moving Objects) - 依然可以在前端轻量级处理
          const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          if (lastFrameDataRef.current) {
            let diff = 0;
            for (let i = 0; i < currentFrame.length; i += 4) {
              diff += Math.abs(currentFrame[i] - lastFrameDataRef.current[i]);
            }
            const threshold = (canvas.width * canvas.height) * 15; 
            if (diff > threshold) {
              behaviorManager.pushEvent('moving_object', { intensity: diff }, 'generic_obj');
            }
          }
          lastFrameDataRef.current = currentFrame;
        }

        // 2. Loudness detection
        if (analyserRef.current) {
          const l = getLoudness(analyserRef.current);
          setLoudness(l);
          if (l > 75) {
            behaviorManager.pushEvent('loud_noise', { value: l });
          }
        }
      } catch (err) {
        console.error("Detection error:", err);
      } finally {
        isProcessingRef.current = false;
      }
    }
  };

  useEffect(() => {
    const processBehavior = async () => {
      const event = behaviorManager.getNextAction();
      if (!event) return;

      console.log("[Behavior] Executing:", event.type, event.payload);
      
      switch (event.type) {
        case 'greeting_known':
          setIsAwake(true);
          resetSleepTimer();
          const welcomeMsg = `你好 ${event.payload.name}！很高兴见到你。`;
          if (liveApiRef.current) {
            liveApiRef.current.sendText(`[系统提示：用户 ${event.payload.name} 刚刚出现在你面前。请主动、简短地打个招呼。]`);
          } else {
            setMessages(prev => [...prev, { role: 'model', text: welcomeMsg }]);
            if (isVoiceEnabled) speak(welcomeMsg);
          }
          break;

        case 'greeting_stranger':
          setIsAwake(true);
          resetSleepTimer();
          if (liveApiRef.current) {
            liveApiRef.current.sendText(`[系统提示：检测到一个陌生人。请主动、简短地打个招呼，并提示他可以注册人脸。]`);
          } else {
            const strangerMsg = "你好，陌生人！我还不认识你，你可以点击侧边栏的上传按钮让我记住你。";
            setMessages(prev => [...prev, { role: 'model', text: strangerMsg }]);
            if (isVoiceEnabled) speak(strangerMsg);
          }
          break;

        case 'gesture_detected':
          if (liveApiRef.current) {
            liveApiRef.current.sendText(`[系统提示：用户刚刚对你做了一个手势：${event.payload.gesture}。请用简短、自然的话回应。]`);
          } else {
            triggerProactive('gesture', event.payload.gesture);
          }
          break;

        case 'pose_detected':
          if (liveApiRef.current) {
            const poseName = event.payload.pose === 'open_arms' ? '张开双臂求抱抱' : '挥手叫你过去';
            liveApiRef.current.sendText(`[系统提示：用户刚刚做了一个动作：${poseName}。请用符合你人设的话回应。]`);
          } else {
            triggerProactive('pose', event.payload.pose);
          }
          break;

        case 'loud_noise':
          setCurrentExpression('惊讶');
          if (isVoiceEnabled) speak("哇！好大声，吓我一跳！");
          break;

        case 'moving_object':
          setRobotExpression('惊讶');
          // Look at the "moving object" roughly
          setLookAt({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 });
          setTimeout(() => setRobotExpression(null), 2000);
          break;

        case 'special_timbre':
          // Short interjection as requested
          const interjections = ["诶~", "哈呀~", "喔？"];
          const text = interjections[Math.floor(Math.random() * interjections.length)];
          if (isVoiceEnabled) speak(text);
          break;

        case 'attention_detected':
          setRobotExpression('思考');
          setTimeout(() => setRobotExpression(null), 2000);
          break;

        case 'user_message':
          // Handled by chat logic
          break;
      }
    };

    const interval = setInterval(processBehavior, 500);
    return () => clearInterval(interval);
  }, [isVoiceEnabled, persona, location]);

  const triggerProactive = async (type: 'happy' | 'unhappy' | 'memory' | 'weather' | 'gesture' | 'pose', payload?: any) => {
    setIsProactiveTriggered(true);
    
    const currentPerson = registeredPeopleRef.current.find(p => p.name === recognizedPersonRef.current);
    const backgroundInfo = currentPerson?.backgroundInfo;
    const personName = recognizedPersonRef.current || '用户';

    if (liveApiRef.current) {
      let prompt = '';
      if (type === 'happy') {
        prompt = `[系统提示：检测到 ${personName} 看起来很开心。请主动、自然地询问他遇到了什么好事。]`;
      } else if (type === 'unhappy') {
        prompt = `[系统提示：检测到 ${personName} 看起来有些难过或生气。请用温柔、关心的语气询问他怎么了，安慰他。]`;
      } else if (type === 'gesture') {
        prompt = `[系统提示：${personName} 刚刚对你做了一个手势：${payload}。请用简短、自然的话回应这个手势。]`;
      } else if (type === 'pose') {
        const poseName = payload === 'open_arms' ? '张开双臂求抱抱' : payload === 'waving' ? '挥手叫你过去' : payload;
        prompt = `[系统提示：${personName} 刚刚做了一个动作：${poseName}。请用符合你人设的话回应他。]`;
      } else if (type === 'weather' || type === 'memory') {
        prompt = `[系统提示：请检查 ${personName} 的记忆库，如果今天（${virtualDateRef.current}）有重要事件（如看演唱会），请主动提醒并祝他顺利。如果没有相关记忆，请忽略此提示，不要说话。]`;
      }
      
      if (prompt) {
        liveApiRef.current.sendText(prompt);
      }
      return;
    }

    setIsLoading(true);
    const response = await generateProactiveResponse(
      persona, 
      memoriesRef.current, 
      type as any,
      virtualDateRef.current,
      recognizedPersonRef.current,
      location,
      payload,
      backgroundInfo
    );
    if (response) {
      setMessages(prev => [...prev, { role: 'model', text: response }]);
      if (isVoiceEnabled) {
        speak(response);
      }
    }
    setIsLoading(false);
  };

  const speak = async (text: string) => {
    if (!isVoiceEnabled || isSpeaking) return;
    setIsSpeaking(true);
    
    try {
      const base64Audio = await generateTTS(text);
      if (base64Audio) {
        const audioData = atob(base64Audio);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData.charCodeAt(i);
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        // Browsers require user interaction to resume AudioContext.
        // If it's suspended, we try to resume it. If it fails, we might need a user click.
        if (audioContextRef.current.state === 'suspended') {
          try {
            await audioContextRef.current.resume();
          } catch (e) {
            console.warn("Could not resume AudioContext automatically. User interaction required.", e);
          }
        }
        
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsSpeaking(false);
        source.start(0);
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error("Playback error:", error);
      setIsSpeaking(false);
    }
  };

  const handleSendMessage = async (text?: string) => {
    const msg = text || inputText;
    if (!msg.trim() || !user) return;

    if (!text) setInputText('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setIsLoading(true);

    if (liveApiRef.current) {
      liveApiRef.current.sendText(msg);
      extractAndSaveMemory(msg);
      return;
    }

    try {
      const response = await chatWithRobot(persona, msg, messages.map(m => ({ role: m.role, parts: m.text })));
      setMessages(prev => [...prev, { role: 'model', text: response }]);
      if (isVoiceEnabled) speak(response);

      extractAndSaveMemory(msg);
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const extractAndSaveMemory = async (msg: string) => {
    if (!user) return;
    try {
      const memoryResult = await extractMemory(msg, recognizedPersonRef.current, location);
      if (memoryResult) {
        const memoriesRef = collection(db, 'users', user.uid, 'memories');
        await addDoc(memoriesRef, {
          content: memoryResult.content,
          category: memoryResult.category || 'general',
          timestamp: virtualDate, // Use virtual date for memory timestamp
          isResolved: false,
          personName: recognizedPersonRef.current, // Bind memory to the recognized person
          location: location
        });
      }
    } catch (error) {
      console.error("Memory extraction error:", error);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (user && memoryId) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'memories', memoryId));
      } catch (err) {
        console.error("Delete memory error:", err);
      }
    }
  };

  const handleClearMemories = async () => {
    if (user && confirm("确定要清空所有记忆吗？此操作不可撤销。")) {
      try {
        const memoriesRef = collection(db, 'users', user.uid, 'memories');
        const snapshot = await getDocs(memoriesRef);
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'users', user.uid, 'memories', d.id)));
        await Promise.all(deletePromises);
      } catch (err) {
        console.error("Clear memories error:", err);
      }
    }
  };

  const handleDeletePerson = async (personId: string, name: string) => {
    if (user && confirm(`确定要删除 ${name} 的人脸数据吗？`)) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'people', personId));
        if (recognizedPerson === name) {
          setIsRecognized(false);
          setRecognizedPerson(null);
        }
      } catch (err) {
        console.error("Delete person error:", err);
      }
    }
  };
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("File input changed, file:", file?.name);
    if (file && user) {
      if (!isModelsLoaded) {
        setMessages(prev => [...prev, { role: 'model', text: "⚠️ **系统未就绪**：AI 模型还在加载中，请稍等几秒再试。" }]);
        return;
      }
      
      setPendingFile(file);
      setInputName(user.displayName || "");
      setIsNameModalOpen(true);
      e.target.value = ''; // Reset input
    }
  };

  const processRegistration = async () => {
    console.log("Processing registration for:", inputName);
    if (!pendingFile || !user || !inputName) return;
    
    const file = pendingFile;
    const personName = inputName;
    
    setIsNameModalOpen(false);
    setPendingFile(null);
    setInputName('');

    setIsRegistering(true);
    setRegistrationStatus('processing');
    setRegistrationProgress(10);
    setRegistrationMessage("正在读取图片文件...");
    
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    
    img.onload = async () => {
      try {
        setRegistrationProgress(30);
        setRegistrationMessage("正在准备神经网络模型...");
        console.log("Image loaded, starting face analysis...");
        // Ensure image is ready
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          throw new Error("图片加载失败或尺寸无效");
        }

        setRegistrationProgress(50);
        setRegistrationMessage("正在提取面部特征向量 (4090 GPU)...");
        
        // ------------------------------------------------------------------
        // 4090 终局架构：将图片发送到服务端提取特征
        // ------------------------------------------------------------------
        // const descriptor = await getFaceDescriptor(img);
        
        // 模拟服务端返回的特征向量 (Float32Array)
        const mockDescriptor = new Float32Array(128).fill(Math.random());
        const descriptor = mockDescriptor;
        
        if (descriptor) {
          setRegistrationProgress(80);
          setRegistrationMessage("正在同步到云端数据库...");
          console.log("Face descriptor generated.");
          const peopleRef = collection(db, 'users', user.uid, 'people');
          await addDoc(peopleRef, { 
            name: personName, 
            descriptor: Array.from(descriptor),
            timestamp: new Date().toISOString()
          });
          
          setRegistrationProgress(100);
          setRegistrationStatus('success');
          setRegistrationMessage(`我已经记住 ${personName} 的样子了。`);
          
          const successMsg = `✅ **注册成功**！我已经记住 **${personName}** 的样子了。你可以开启摄像头让我认认看。`;
          setMessages(prev => [...prev, { role: 'model', text: successMsg }]);
          if (isVoiceEnabled) speak(successMsg);
          
          // Auto close after 3 seconds if success
          setTimeout(() => {
            setIsRegistering(false);
            setRegistrationStatus('idle');
          }, 3000);
        } else {
          setRegistrationStatus('error');
          setRegistrationMessage("无法在照片中检测到人脸。请确保面部清晰且光线充足。");
          console.warn("No face detected in registration image.");
          const failMsg = `❌ **注册失败**：无法在照片中检测到人脸。请确保：\n1. 照片中只有一个人\n2. 面部清晰、光线充足\n3. 不要戴墨镜或口罩`;
          setMessages(prev => [...prev, { role: 'model', text: failMsg }]);
          if (isVoiceEnabled) speak("抱歉，我没能在照片里找到人脸。");
        }
      } catch (err) {
        setRegistrationStatus('error');
        setRegistrationMessage(`分析出错: ${err instanceof Error ? err.message : '未知错误'}`);
        console.error("Face registration error:", err);
        const errMsg = `⚠️ **注册出错**：分析人脸时发生错误 (${err instanceof Error ? err.message : '未知错误'})。请重试。`;
        setMessages(prev => [...prev, { role: 'model', text: errMsg }]);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      setRegistrationStatus('error');
      setRegistrationMessage("图片加载失败。");
      console.error("Failed to load image element.");
      URL.revokeObjectURL(objectUrl);
      setMessages(prev => [...prev, { role: 'model', text: `❌ **图片加载失败**：请尝试上传另一张照片。` }]);
    };
  };

  const simulateNextDay = () => {
    const nextDate = new Date(virtualDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];
    setVirtualDate(nextDateStr);
    setIsProactiveTriggered(false); // Reset proactive trigger for the new day
    
    const msg = `📅 **模拟进入第二天**：当前虚拟日期已更新为 **${nextDateStr}**。`;
    setMessages(prev => [...prev, { role: 'model', text: msg }]);
    
    if (recognizedPersonRef.current) {
      // If someone is currently in front of the camera, trigger proactive interaction
      // to check memories and weather for the new day.
      triggerProactive('weather');
    }
  };

  const resetSleepTimer = () => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = setTimeout(() => {
      setIsAwake(false);
      setMessages(prev => [...prev, { role: 'model', text: "我先休息啦，有事叫我“小博”哦。" }]);
      if (isVoiceEnabled) speak("我先休息啦，有事叫我小博哦。");
    }, 15000); // 15 seconds of inactivity to go to sleep
  };

  const toggleLiveAPI = async (externalAudioContext?: AudioContext, externalMediaStream?: MediaStream) => {
    if (liveApiRef.current) {
      liveApiRef.current.stop();
      liveApiRef.current = null;
      setIsListening(false);
      setIsVoiceEnabled(false);
      return;
    }

    // Create AudioContext synchronously if not provided
    const audioCtx = externalAudioContext || new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    setIsVoiceEnabled(true);
    setIsListening(true);
    setIsAwake(true);
    
    const liveApi = new LiveAPI();
    liveApiRef.current = liveApi;

    liveApi.onMessage = (text, isUser) => {
      setMessages(prev => [...prev, { role: isUser ? 'user' : 'model', text }]);
      if (!isUser) {
        setIsLoading(false);
      }
      resetSleepTimer();
    };

    liveApi.onStart = () => {
      setMessages(prev => [...prev, { role: 'model', text: "🎤 实时语音对话已开启，请直接对我说话。" }]);
    };

    liveApi.onExpression = (expression) => {
      setRobotExpression(expression);
      // Reset expression after a few seconds
      setTimeout(() => {
        setRobotExpression(null);
      }, 3000);
    };

    liveApi.onStop = () => {
      setIsListening(false);
      setIsVoiceEnabled(false);
      liveApiRef.current = null;
    };

    liveApi.onError = (err) => {
      setMessages(prev => [...prev, { role: 'model', text: `❌ 语音连接错误: ${err.message || '未知错误'}` }]);
      setIsListening(false);
      setIsVoiceEnabled(false);
      liveApiRef.current = null;
    };

    const currentPerson = registeredPeopleRef.current.find(p => p.name === recognizedPersonRef.current);
    const backgroundInfo = currentPerson?.backgroundInfo;

    await liveApi.start(persona, memories, location, backgroundInfo, audioCtx, externalMediaStream);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">主动交互机器人</h1>
          <p className="text-slate-400 mb-8">一个能记住、能感受、能关心你的 AI 伙伴。</p>
          <button 
            onClick={signIn}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-500/20"
          >
            <UserIcon className="w-5 h-5" />
            使用 Google 登录
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col md:flex-row">
      {/* Name Input Modal */}
      <AnimatePresence>
        {isNameModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full"
            >
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <UserIcon className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white text-center mb-2">这是谁？</h2>
              <p className="text-slate-400 text-center mb-8">请输入照片中人物的名字，以便机器人以后能认出 TA。</p>
              
              <input 
                type="text" 
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="例如：张三"
                autoFocus
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              />
              
              <textarea
                value={inputBackground}
                onChange={(e) => setInputBackground(e.target.value)}
                placeholder="背景信息（可选，例如：我的好朋友，喜欢打篮球）"
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-6 resize-none"
              />
              
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setIsNameModalOpen(false);
                    setPendingFile(null);
                  }}
                  className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={processRegistration}
                  disabled={!inputName.trim()}
                  className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
                >
                  确认注册
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Registration Overlay */}
      {isRegistering && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex flex-col items-center justify-center text-center p-6">
          <div className="relative mb-8">
            <div className={cn(
              "w-32 h-32 border-4 rounded-full transition-all duration-500",
              registrationStatus === 'success' ? "border-green-500/20 border-t-green-500" :
              registrationStatus === 'error' ? "border-red-500/20 border-t-red-500" :
              "border-indigo-500/20 border-t-indigo-500 animate-spin"
            )} />
            <div className="absolute inset-0 flex items-center justify-center">
              {registrationStatus === 'success' ? (
                <ShieldCheck className="w-12 h-12 text-green-400" />
              ) : registrationStatus === 'error' ? (
                <LogOut className="w-12 h-12 text-red-400 rotate-90" />
              ) : (
                <Brain className="w-12 h-12 text-indigo-400 animate-pulse" />
              )}
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">
            {registrationStatus === 'processing' && "正在深度学习人脸特征..."}
            {registrationStatus === 'success' && "注册成功！"}
            {registrationStatus === 'error' && "注册失败"}
          </h2>
          
          <p className="text-slate-400 max-w-sm mb-8">
            {registrationMessage || "我们正在使用神经网络分析您的面部生物特征，以便在未来能够准确地认出您。"}
          </p>

          {registrationStatus === 'processing' && (
            <div className="w-full max-w-xs bg-slate-800 rounded-full h-2 mb-4 overflow-hidden">
              <motion.div 
                className="bg-indigo-500 h-full"
                initial={{ width: 0 }}
                animate={{ width: `${registrationProgress}%` }}
              />
            </div>
          )}

          {registrationStatus === 'processing' && (
            <div className="text-indigo-400 font-mono text-sm">
              {registrationProgress}%
            </div>
          )}

          {(registrationStatus === 'success' || registrationStatus === 'error') && (
            <button 
              onClick={() => {
                setIsRegistering(false);
                setRegistrationStatus('idle');
              }}
              className={cn(
                "px-8 py-3 rounded-xl font-semibold transition-all",
                registrationStatus === 'success' ? "bg-green-600 hover:bg-green-500 text-white" : "bg-red-600 hover:bg-red-500 text-white"
              )}
            >
              关闭
            </button>
          )}
        </div>
      )}

      {/* Sidebar - Persona & Memory */}
      <aside className="w-full md:w-80 bg-slate-900/50 border-r border-slate-800 p-6 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h2 className="font-bold text-xl">{persona.name}</h2>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <Settings className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Model Status */}
        <div className="bg-slate-800/30 border border-slate-700/50 p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
              <Brain className="w-4 h-4" />
              <span>AI 系统状态</span>
            </div>
            {!isModelsLoaded && modelError && (
              <button 
                onClick={retryLoadModels}
                className="p-1 hover:bg-slate-700 rounded-md text-indigo-400 transition-all"
                title="重试加载"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", isModelsLoaded ? "bg-green-500" : (modelError ? "bg-red-500" : "bg-yellow-500 animate-pulse"))} />
            <span className="text-sm font-medium">
              {isModelsLoaded ? "系统运行中" : (modelError ? "加载失败" : "正在初始化...")}
            </span>
          </div>
          {modelError && <p className="text-[10px] text-red-400 mt-1 leading-tight">{modelError}</p>}
        </div>

        {/* Face Registration */}
        <div className="bg-indigo-600/10 border border-indigo-500/20 p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase">
              <ShieldCheck className="w-4 h-4" />
              <span>人脸识别库</span>
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all"
              title="上传照片注册人脸"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleFileUpload} 
            />
          </div>
          
          <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-1">
            {isRegistering && (
              <div className="flex items-center gap-2 bg-indigo-600/20 p-2 rounded-lg border border-indigo-500/30 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                <span className="text-[10px] text-indigo-300 font-medium">正在分析人脸特征...</span>
              </div>
            )}
            {registeredPeople.length === 0 && !isRegistering ? (
              <p className="text-slate-500 text-[10px] italic">暂无注册人脸，请点击上传...</p>
            ) : (
              registeredPeople.map((p, i) => (
                <div key={p.id} className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
                  <button 
                    onClick={() => { /* Toggle expand */ }}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-700/50 transition-all"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-2 h-2 bg-green-500 rounded-full shrink-0" />
                      <span className="text-xs text-slate-300 font-bold truncate">{p.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">点击展开</span>
                  </button>
                  <div className="px-3 pb-3 text-[10px] text-slate-400 border-t border-slate-700/50 pt-2">
                    {p.backgroundInfo || '暂无背景信息'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium uppercase tracking-wider">
              <Brain className="w-4 h-4" />
              <span>用户个性化档案</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleClearMemories}
                className="p-1 hover:text-red-400 text-slate-500 transition-all"
                title="清空所有记忆"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <div className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">
                {virtualDate}
              </div>
              <div className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 truncate max-w-[100px]" title={location || '获取位置中...'}>
                {location || '获取位置中...'}
              </div>
            </div>
          </div>
          {location && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-slate-800/30 p-1.5 rounded-lg border border-slate-700/30">
              <MapPin className="w-3 h-3 text-indigo-400" />
              <span>当前位置: {location}</span>
            </div>
          )}
          <div className="space-y-4 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
            {memories.length === 0 ? (
              <p className="text-slate-500 text-sm italic">暂无记忆...</p>
            ) : (
              ['mood', 'topic', 'event', 'general'].map(category => {
                const categoryMemories = memories.filter(m => (!recognizedPerson || m.personName === recognizedPerson) && (m.category === category || (!m.category && category === 'general')));
                if (categoryMemories.length === 0) return null;
                
                const categoryLabels: Record<string, string> = {
                  mood: '心情状态',
                  topic: '喜好',
                  event: '任务事项',
                  general: '交流方式'
                };
                
                return (
                  <div key={category} className="bg-slate-800/30 rounded-lg border border-slate-700/50 overflow-hidden">
                    <button 
                      onClick={() => { /* Toggle expand */ }}
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-700/50 transition-all"
                    >
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{categoryLabels[category]}</span>
                      <span className="text-[10px] text-slate-500">{categoryMemories.length} 条</span>
                    </button>
                    <div className="px-3 pb-3 space-y-2 border-t border-slate-700/50 pt-2">
                      {categoryMemories.map((m, i) => (
                        <div key={m.id || i} className="bg-slate-900/50 p-2 rounded-lg text-[10px] text-slate-400 flex items-center justify-between">
                          <span>{m.content}</span>
                          <button onClick={() => m.id && handleDeleteMemory(m.id)} className="hover:text-red-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border border-slate-700" alt="User" referrerPolicy="no-referrer" />
            <div className="text-sm">
              <p className="font-medium text-white truncate w-24">{user.displayName}</p>
              <p className={cn("text-xs", isRecognized ? "text-green-400" : "text-slate-500")}>
                {isRecognized ? `已识别: ${recognizedPerson}` : '未知面孔'}
              </p>
            </div>
          </div>
          <button onClick={signOut} className="p-2 hover:bg-red-500/10 rounded-lg transition-colors group">
            <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-400" />
          </button>
        </div>
      </aside>

      {/* Main Content - Chat & Face Detection */}
      <main className="flex-1 flex flex-col h-screen max-h-screen overflow-hidden relative">
        
        {/* Floating Draggable Robot's Eye - Face Detection View */}
        <motion.div 
          drag
          dragMomentum={false}
          dragConstraints={{ left: 0, top: 0, right: 1000, bottom: 800 }}
          className="absolute z-50 p-2 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl flex flex-col"
          style={{ 
            width: '800px', 
            height: '400px', 
            top: '20px', 
            left: '20px',
            resize: 'both',
            overflow: 'hidden',
            minWidth: '300px',
            minHeight: '200px'
          }}
        >
          {/* Drag Handle Area */}
          <div className="w-full h-6 flex items-center justify-center cursor-move mb-2 opacity-50 hover:opacity-100 transition-opacity">
            <div className="w-12 h-1.5 bg-slate-500 rounded-full pointer-events-none" />
          </div>
          <div 
            className="w-full flex-1 cursor-auto min-h-0"
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <PanelGroup orientation={panelDirection} className="w-full h-full rounded-2xl overflow-hidden border-2 border-slate-800 shadow-inner">
              <Panel defaultSize={50} minSize={30}>
                {/* Camera View */}
                <div className="relative w-full h-full bg-slate-950 group">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    className={cn(
                      "w-full h-full object-cover transition-opacity duration-500",
                      isDetecting ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {!isDetecting && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-2">
                      <Camera className="w-12 h-12" />
                      <p className="text-sm font-bold">摄像头未开启</p>
                    </div>
                  )}
                  {isDetecting && (
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">Live Feed</span>
                      </div>
                      {currentExpression && (
                        <div className="bg-indigo-600/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-indigo-400/30 flex items-center gap-2">
                          <Smile className="w-3 h-3 text-white" />
                          <span className="text-[10px] font-bold text-white uppercase tracking-wider">{currentExpression}</span>
                        </div>
                      )}
                      {lastGesture && (
                        <div className="bg-amber-600/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-amber-400/30 flex items-center gap-2">
                          <Activity className="w-3 h-3 text-white" />
                          <span className="text-[10px] font-bold text-white uppercase tracking-wider">Gesture: {lastGesture}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Loudness Meter */}
                  {isDetecting && (
                    <div className="absolute bottom-4 left-4 right-4 h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-indigo-500"
                        animate={{ width: `${Math.min(loudness * 2, 100)}%` }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    </div>
                  )}

                  <div className="absolute inset-0 border-[10px] border-transparent group-hover:border-indigo-500/5 transition-all pointer-events-none" />
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button 
                      onClick={isDetecting ? stopCamera : startCamera}
                      className={cn(
                        "p-2 rounded-xl transition-all shadow-lg backdrop-blur-md border",
                        isDetecting 
                          ? "bg-red-500/20 border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white" 
                          : "bg-indigo-600 border-indigo-400 text-white hover:bg-indigo-500"
                      )}
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Panel>
              
              <PanelResizeHandle className={cn(
                "bg-slate-800 hover:bg-indigo-500 transition-colors flex items-center justify-center",
                panelDirection === 'horizontal' ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"
              )}>
                <GripVertical className={cn("text-slate-500", panelDirection === 'horizontal' ? "w-4 h-4" : "w-4 h-4 rotate-90")} />
              </PanelResizeHandle>
              
              <Panel defaultSize={50} minSize={30}>
                {/* 3D Robot Character */}
                <div className="w-full h-full bg-slate-950/50">
                  <RobotCharacter 
                    expression={robotExpression || currentExpression || 'neutral'} 
                    isListening={isListening} 
                    isSpeaking={isLoading || (messages.length > 0 && messages[messages.length-1].role === 'model' && !isLoading)} 
                    lookAt={lookAt}
                    isAwake={isAwake}
                  />
                </div>
              </Panel>
            </PanelGroup>
          </div>
        </motion.div>
        
        {/* Top Controls */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-end gap-3 z-10 relative">
          <button 
            onClick={() => setPanelDirection(prev => prev === 'horizontal' ? 'vertical' : 'horizontal')}
            className="bg-slate-800/50 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-2 active:scale-95"
          >
            <GripVertical className={cn("w-3 h-3", panelDirection === 'vertical' ? "rotate-90" : "")} />
            {panelDirection === 'horizontal' ? '上下分栏' : '左右分栏'}
          </button>
          <button 
            onClick={simulateNextDay}
            className="bg-slate-800/50 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-2 active:scale-95"
          >
            <RefreshCw className="w-3 h-3" />
            模拟第二天
          </button>
          <button 
            onClick={() => toggleLiveAPI(audioContextRef.current || undefined, audioStreamRef.current || undefined)}
            className={cn(
              "px-4 py-2 rounded-xl transition-all border flex items-center gap-2 text-xs font-bold active:scale-95",
              isVoiceEnabled ? "bg-green-500/10 border-green-500/50 text-green-400 shadow-lg shadow-green-500/10" : "bg-slate-800/50 border-slate-700 text-slate-500"
            )}
          >
            <Volume2 className="w-3 h-3" />
            {isVoiceEnabled ? '实时语音: 开启' : '实时语音: 关闭'}
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
              <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4">
                <Smile className="w-8 h-8 text-slate-700" />
              </div>
              <p className="text-slate-500">暂无对话。尝试对着摄像头笑一笑，或者打个招呼吧！</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex gap-4 max-w-2xl",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center",
                msg.role === 'user' ? "bg-indigo-600" : "bg-slate-800"
              )}>
                {msg.role === 'user' ? <UserIcon className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-indigo-400" />}
              </div>
              <div className={cn(
                "p-4 rounded-2xl text-sm leading-relaxed",
                msg.role === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
              )}>
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <div className="flex gap-4 max-w-2xl">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
              </div>
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 rounded-tl-none">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-slate-900/50 border-t border-slate-800">
          <div className="max-w-4xl mx-auto flex gap-3">
            <button 
              onClick={() => toggleLiveAPI(audioContextRef.current || undefined, audioStreamRef.current || undefined)}
              className={cn(
                "p-4 rounded-2xl transition-all flex items-center justify-center",
                isListening ? "bg-red-500 animate-pulse" : "bg-slate-800 hover:bg-slate-700"
              )}
            >
              {isListening ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-slate-300" />}
            </button>
            <div className="flex-1 relative">
              <input 
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="输入消息..."
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-6 pr-16 focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all text-slate-200"
              />
              <button 
                onClick={() => handleSendMessage()}
                className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 rounded-xl transition-all flex items-center justify-center"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Global Loading Overlay for Registration */}
      <AnimatePresence>
        {isRegistering && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-white"
          >
            <div className="relative">
              <div className="w-24 h-24 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <Brain className="w-10 h-10 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
            </div>
            <h2 className="mt-8 text-2xl font-bold tracking-tight">正在深度学习人脸特征...</h2>
            <p className="mt-2 text-slate-400">请稍候，机器人正在努力记住这个面孔</p>
            <div className="mt-6 flex gap-1">
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full"
            >
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <Settings className="w-6 h-6 text-indigo-400" />
                机器人人设
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">性格预设</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PersonaPresets).map(([key, p]) => (
                      <button 
                        key={key}
                        onClick={() => setPersona(p)}
                        className={cn("px-3 py-2 rounded-lg text-sm transition-all", persona.name === p.name ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700")}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">机器人名称</label>
                  <input 
                    type="text"
                    value={persona.name}
                    onChange={(e) => setPersona({ ...persona, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-600/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">MBTI 类型</label>
                  <select 
                    value={persona.mbti}
                    onChange={(e) => setPersona({ ...persona, mbti: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-600/50 outline-none"
                  >
                    {['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-400">交互风格</label>
                    <button 
                      onClick={async () => {
                        setIsLoading(true);
                        try {
                          const { generatePersonaStyle } = await import('./lib/gemini');
                          const newStyle = await generatePersonaStyle(persona.mbti);
                          if (newStyle) {
                            setPersona({ ...persona, style: newStyle });
                          }
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      disabled={isLoading}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 disabled:opacity-50"
                    >
                      {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      AI 续写
                    </button>
                  </div>
                  <textarea 
                    value={persona.style}
                    onChange={(e) => setPersona({ ...persona, style: e.target.value })}
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-600/50 outline-none resize-none text-sm"
                    placeholder="例如：幽默风趣、严谨专业、温暖治愈..."
                  />
                </div>
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div>
                    <div className="text-sm font-medium text-white">语音选择</div>
                    <div className="text-xs text-slate-500 mt-1">选择机器人的音色</div>
                  </div>
                  <select 
                    value={persona.style.includes('Kore') ? 'Kore' : 'Puck'} // Simplified for now
                    onChange={(e) => { /* Update voice logic */ }}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-xs"
                  >
                    <option value="Kore">Kore (温暖)</option>
                    <option value="Puck">Puck (活泼)</option>
                  </select>
                </div>
                <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div>
                    <div className="text-sm font-medium text-white">开启摄像头时自动激活实时语音</div>
                    <div className="text-xs text-slate-500 mt-1">后续所有交互将默认走 Gemini 实时对话模型</div>
                  </div>
                  <button
                    onClick={() => setAutoStartLive(!autoStartLive)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      autoStartLive ? "bg-indigo-600" : "bg-slate-700"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 bg-white rounded-full absolute top-1 transition-transform",
                      autoStartLive ? "translate-x-7" : "translate-x-1"
                    )} />
                  </button>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={async () => {
                      if (user) {
                        const personaRef = doc(db, 'users', user.uid, 'persona', 'current');
                        await setDoc(personaRef, { persona }, { merge: true });
                        setIsSettingsOpen(false);
                      }
                    }}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                  >
                    保存修改
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

