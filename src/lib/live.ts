import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export class LiveAPI {
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextPlayTime = 0;

  public onMessage?: (text: string, isUser: boolean) => void;
  public onError?: (err: any) => void;
  public onStart?: () => void;
  public onStop?: () => void;
  public onExpression?: (expression: string) => void;

  async start(persona: any, memories: any[], location: string | null, backgroundInfo?: string, externalAudioContext?: AudioContext, externalMediaStream?: MediaStream) {
    try {
      this.audioContext = externalAudioContext || new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Request specific audio constraints to avoid phone mic if possible
      // By explicitly requesting audio without video, and setting constraints, 
      // it forces the browser to use the default desktop microphone.
      this.mediaStream = externalMediaStream || await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      const memoryContext = memories.length > 0 
        ? `\n\n你的记忆库：\n${memories.map(m => `- [${m.timestamp}] 关于${m.personName || '某人'}: ${m.content}`).join('\n')}`
        : '';

      const locationContext = location ? `\n\n用户当前位置：${location}` : '';
      const backgroundContext = backgroundInfo ? `\n\n当前交互人物的背景信息：${backgroundInfo}` : '';

      this.sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [{
            functionDeclarations: [{
              name: "set_expression",
              description: "在交流时触发对应的微动作和表情。当你说话时，如果情绪发生变化，请调用此函数。",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  expression: {
                    type: Type.STRING,
                    description: "要触发的表情或微动作",
                    enum: ["开心", "难过", "生气", "惊讶", "恐惧", "厌恶", "平静", "思考", "点头", "摇头"]
                  }
                },
                required: ["expression"]
              }
            }]
          }],
          systemInstruction: `你是 ${persona.name}，一个具有 ${persona.mbti} 人格的 AI。你的风格是 ${persona.style}。请表现得主动且友好。请使用中文回答。
          
          【重要交互规则】：
          1. 接收到以 [系统提示：...] 开头的消息时，这不是用户说的话，而是系统发给你的事件通知（例如用户做了什么动作、表情，或者系统让你检查记忆）。请根据提示内容，直接用语音对用户做出自然的回应。
          2. 如果聊天中刚好提到用户记忆中喜欢的话题，请表现出兴奋并主动展开讨论。
          3. 在和用户交流时，请根据你说话的内容和情绪，频繁调用 set_expression 函数来触发对应的微动作和表情，让交互更生动。
          ${memoryContext}${locationContext}${backgroundContext}`,
        },
        callbacks: {
          onopen: () => {
            this.startRecording();
            this.onStart?.();
          },
          onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
          onclose: () => {
            this.stop();
            this.onStop?.();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.onError?.(err);
            this.stop();
          }
        }
      });
      
      await this.sessionPromise;
    } catch (err) {
      console.error("Failed to start Live API:", err);
      this.onError?.(err);
      this.stop();
    }
  }

  sendText(text: string) {
    this.sessionPromise?.then(session => {
      try {
        session.sendRealtimeInput({ text });
      } catch (err) {
        console.error("Error sending text input:", err);
      }
    });
  }

  private startRecording() {
    if (!this.audioContext || !this.mediaStream || !this.sessionPromise) return;
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        let s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      const buffer = new ArrayBuffer(pcm16.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(i * 2, pcm16[i], true);
      }
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      
      this.sessionPromise?.then(session => {
        try {
          session.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
        } catch (err) {
          console.error("Error sending audio input:", err);
        }
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // console.log("Received message:", JSON.stringify(message, null, 2));
    
    const parts = message.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        // console.log("Found audio part, length:", part.inlineData.data.length);
        this.playAudio(part.inlineData.data);
      }
      if (part.text) {
        // console.log("Found text part:", part.text);
        this.onMessage?.(part.text, false);
      }
    }

    const toolCall = message.toolCall;
    if (toolCall && toolCall.functionCalls) {
      for (const call of toolCall.functionCalls) {
        if (call.name === 'set_expression' && call.args && call.args.expression) {
          this.onExpression?.(call.args.expression as string);
        }
      }
      
      // Send tool response back
      if (this.sessionPromise) {
        this.sessionPromise.then(session => {
          session.sendToolResponse({
            functionResponses: toolCall.functionCalls.map(call => ({
              id: call.id,
              name: call.name,
              response: { result: "success" }
            }))
          });
        });
      }
    }
    
    if (message.serverContent?.interrupted) {
      this.nextPlayTime = 0;
    }
  }

  private async playAudio(base64: string) {
    if (!this.audioContext) return;
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const view = new DataView(bytes.buffer);
      const float32 = new Float32Array(binary.length / 2);
      for (let i = 0; i < float32.length; i++) {
        const pcm = view.getInt16(i * 2, true); // true for little-endian
        float32[i] = pcm / 32768.0;
      }
      
      const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      if (this.nextPlayTime < this.audioContext.currentTime) {
        this.nextPlayTime = this.audioContext.currentTime;
      }
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
    } catch (err) {
      console.error("Error playing audio chunk:", err);
    }
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.sessionPromise) {
      this.sessionPromise.then(s => s.close());
      this.sessionPromise = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.onStop?.();
  }
}
