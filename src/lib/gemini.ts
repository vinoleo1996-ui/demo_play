import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateTTS(text: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say warmly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

export interface Memory {
  id?: string;
  content: string;
  timestamp: string;
  isResolved: boolean;
  personName?: string | null;
  location?: string | null;
}

export interface Persona {
  name: string;
  mbti: string;
  style: string;
}

export async function extractMemory(conversation: string, personName: string | null, location: string | null): Promise<string | null> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `从这段对话中提取一个简短、具体的未来事件或重要事实，以便机器人记住。
    对话涉及的人物是: ${personName || '用户'}。
    当前位置: ${location || '未知'}。
    如果没有重要内容，返回 "none"。
    对话内容: ${conversation}`,
    config: {
      systemInstruction: "你是一个记忆提取引擎。只提取核心事件，并尽量包含主语（例如：'张三明天去看周杰伦演唱会' 或 '用户明天要出差'）。如果对话中提到了地点，也请包含在内。",
    }
  });

  const text = response.text?.trim() || "none";
  return text.toLowerCase() === "none" ? null : text;
}

export async function generateProactiveResponse(
  persona: Persona,
  memories: Memory[],
  type: 'happy' | 'memory' | 'weather' | null,
  virtualDate: string,
  recognizedPerson: string | null,
  location: string | null
): Promise<string | null> {
  // Filter memories for the recognized person
  const personMemories = memories.filter(m => m.personName === recognizedPerson);

  if (type === 'happy') {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `用户看起来很开心。请根据你的人设，用一种自然、不重复的方式主动询问他们今天为什么这么开心。
      当前虚拟日期是 ${virtualDate}。
      识别到的人物是 ${recognizedPerson || '用户'}。
      当前位置: ${location || '未知'}。
      
      注意：不要总是用“你今天为什么这么开心”这种陈词滥调，可以尝试不同的切入点。`,
      config: {
        systemInstruction: `你是 ${persona.name}，一个具有 ${persona.mbti} 人格的 AI。你的风格是 ${persona.style}。请表现得主动且友好。请使用中文回答。`,
      }
    });
    return response.text || null;
  }

  if (type === 'weather' || (type === 'memory' && personMemories.length > 0)) {
    const memoriesContext = personMemories.map(m => `- ${m.content} (记录于虚拟日期: ${m.timestamp}, 地点: ${m.location || '未知'})`).join('\n');
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `当前虚拟日期是 ${virtualDate}。识别到的人物是 ${recognizedPerson}。
      当前位置: ${location || '未知'}。
      这是关于该人物的记忆列表：
      ${memoriesContext}
      
      【任务】：
      1. 使用 Google Search 检查 ${location || '北京'} 今天（${virtualDate}）的天气预报。
      2. 检查是否有任何记忆在今天变得相关。
      3. 综合天气和记忆，给出一个贴心的、多变的主动交互。
      
      【天气提醒逻辑】：
      - 如果有大幅升温，提醒防晒。
      - 如果有大幅降温，提醒加衣。
      - 如果有雨雪，提醒带伞。
      
      【记忆结合逻辑】：
      - 如果记忆说今天要去户外活动，结合天气给出建议。
      - 如果记忆说今天有重要会议，提醒准时并注意天气影响。
      
      请表现得像一个真正的朋友，自然地提起话题。如果没有任何值得主动提起的（既无天气剧变也无相关记忆），请返回 "none"。`,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: `你是 ${persona.name}，一个具有 ${persona.mbti} 人格的 AI。你的风格是 ${persona.style}。请表现得主动且友好。请使用中文回答。`,
      }
    });
    
    const text = response.text?.trim() || "none";
    return text.toLowerCase() === "none" ? null : text;
  }

  return null;
}

export async function chatWithRobot(
  persona: Persona,
  message: string,
  history: { role: 'user' | 'model', parts: string }[]
) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: history.map(h => ({ role: h.role, parts: [{ text: h.parts }] })).concat([{ role: 'user', parts: [{ text: message }] }]),
    config: {
      systemInstruction: `你是 ${persona.name}，一个具有 ${persona.mbti} 人格的 AI。你的风格是 ${persona.style}。请自然地与用户交流。请使用中文回答。`,
    }
  });

  return response.text || "";
}

export async function getFashionAdvice(persona: Persona, event: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `用户要去参加 "${event}"。根据你的人设给他们一些穿搭建议。`,
    config: {
      systemInstruction: `你是 ${persona.name}，一个具有 ${persona.mbti} 人格的 AI。你的风格是 ${persona.style}。你也是一名时尚专家。请使用中文回答。`,
    }
  });

  return response.text || "";
}
