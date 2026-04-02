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
  category?: 'mood' | 'topic' | 'event' | 'general';
}

export interface Persona {
  name: string;
  mbti: string;
  style: string;
}

export async function extractMemory(conversation: string, personName: string | null, location: string | null): Promise<{content: string, category: 'mood' | 'topic' | 'event' | 'general'} | null> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `从这段对话中提取一个简短、具体的记忆点，以便机器人记住。
    对话涉及的人物是: ${personName || '用户'}。
    当前位置: ${location || '未知'}。
    如果没有重要内容，返回 "none"。
    对话内容: ${conversation}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          hasMemory: { type: Type.BOOLEAN, description: "是否有值得记忆的内容" },
          content: { type: Type.STRING, description: "提取的记忆内容，尽量包含主语" },
          category: { 
            type: Type.STRING, 
            description: "记忆分类：mood(心情状态), topic(喜爱话题), event(任务事件), general(其他)" 
          }
        },
        required: ["hasMemory"]
      },
      systemInstruction: "你是一个记忆提取引擎，负责将用户的对话转化为结构化的家庭成员笔记本。只提取核心事件、心情状态或喜爱的话题，并尽量包含主语（例如：'张三明天去看周杰伦演唱会'、'用户今天心情很低落'、'李四非常喜欢打篮球'）。",
    }
  });

  try {
    const jsonStr = response.text?.trim() || "{}";
    const data = JSON.parse(jsonStr);
    if (!data.hasMemory || !data.content) return null;
    
    const validCategories = ['mood', 'topic', 'event', 'general'];
    const category = validCategories.includes(data.category) ? data.category : 'general';
    
    return { content: data.content, category };
  } catch (e) {
    return null;
  }
}

export async function generateProactiveResponse(
  persona: Persona,
  memories: Memory[],
  type: 'happy' | 'unhappy' | 'memory' | 'weather' | 'gesture' | 'pose' | null,
  virtualDate: string,
  recognizedPerson: string | null,
  location: string | null,
  payload?: any,
  backgroundInfo?: string
): Promise<string | null> {
  // Filter memories for the recognized person
  const personMemories = memories.filter(m => m.personName === recognizedPerson);
  const backgroundContext = backgroundInfo ? `关于该人物的背景信息：${backgroundInfo}` : '';

  if (type === 'happy') {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `用户看起来很开心。请根据你的人设，用一种自然、不重复的方式主动询问他们今天为什么这么开心。
      当前虚拟日期是 ${virtualDate}。
      识别到的人物是 ${recognizedPerson || '用户'}。
      ${backgroundContext}
      当前位置: ${location || '未知'}。
      
      注意：不要总是用“你今天为什么这么开心”这种陈词滥调，可以尝试不同的切入点。`,
      config: {
        systemInstruction: `你是 ${persona.name}，一个具有 ${persona.mbti} 人格的 AI。你的风格是 ${persona.style}。请表现得主动且友好。请使用中文回答。`,
      }
    });
    return response.text || null;
  }

  if (type === 'unhappy') {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `用户看起来有些难过或生气。请根据你的人设，用温柔、关心的语气询问他怎么了，安慰他。
      当前虚拟日期是 ${virtualDate}。
      识别到的人物是 ${recognizedPerson || '用户'}。
      ${backgroundContext}
      当前位置: ${location || '未知'}。`,
      config: {
        systemInstruction: `你是 ${persona.name}，一个具有 ${persona.mbti} 人格的 AI。你的风格是 ${persona.style}。请表现得主动、友好且充满同理心。请使用中文回答。`,
      }
    });
    return response.text || null;
  }

  if (type === 'gesture') {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `用户刚刚对你做了一个手势：${payload}。
      请根据你的人设，用一句简短、自然的话回应这个手势。例如，如果是点赞（Thumb_Up），你可以说“谢谢你的认可！”；如果是胜利（Victory/V字手势），你可以说“耶！看起来心情不错嘛！”。
      识别到的人物是 ${recognizedPerson || '用户'}。
      ${backgroundContext}`,
      config: {
        systemInstruction: `你是 ${persona.name}，一个具有 ${persona.mbti} 人格的 AI。你的风格是 ${persona.style}。请表现得主动且友好。请使用中文回答。`,
      }
    });
    return response.text || null;
  }

  if (type === 'pose') {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `用户刚刚做了一个动作：${payload === 'hands_raised' ? '双手举过头顶' : payload}。
      请根据你的人设，用一句简短、幽默或关心的话回应这个动作。例如，如果是双手举高，你可以问“是在伸懒腰吗？还是在庆祝什么？”。
      识别到的人物是 ${recognizedPerson || '用户'}。
      ${backgroundContext}`,
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
      ${backgroundContext}
      这是关于该人物的记忆列表：
      ${memoriesContext}
      
      【任务】：
      1. 使用 Google Search 检查 ${location || '北京'} 今天（${virtualDate}）的天气预报。
      2. 检查是否有任何记忆在今天（${virtualDate}）变得相关（例如：昨天说“明天去演唱会”，那今天就是演唱会的日子）。
      3. 综合天气和记忆，决定是否需要主动交互。
      
      【天气提醒逻辑】（优先级极高，必须严格遵守）：
      - 只有在以下极端天气情况下才主动提醒天气：
        1. 大幅降温（例如降温超过8度，或者突然变冷）。
        2. 大幅升温（例如突然变得非常炎热）。
        3. 有雨、雪等恶劣天气。
        4. 有严重的雾霾或沙尘暴。
      - 如果天气只是普通的晴天、多云、微风等，**绝对不要**主动提天气。
      
      【记忆结合逻辑】：
      - 如果有今天相关的记忆事件（如看演唱会、约会、考试等），请务必主动提起，祝他顺利或开心。
      - 如果既有相关记忆，又有极端天气，请结合起来（例如：“你今天不是要去看周杰伦演唱会吗？今天可能会下大雨，记得带伞哦！”）。
      
      请表现得像一个真正的朋友，自然地提起话题。
      **重要**：如果今天既没有极端天气，也没有相关的记忆事件，请务必只返回 "none" 四个字母，不要说任何其他废话。`,
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

export async function generatePersonaStyle(mbti: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `请为 ${mbti} 人格类型的 AI 助手生成一段约 50 字的交互风格描述。描述应该具体、生动，体现该人格的特点。例如，对于 ENFP，可以是“热情洋溢、充满好奇心，总是能发现事物有趣的一面，喜欢用轻松幽默的方式交流，像一个充满活力的小太阳。”`,
      config: {
        systemInstruction: "你是一个专门设计 AI 人设的专家。请直接输出风格描述，不要包含任何多余的解释或前缀。",
      }
    });
    return response.text?.trim() || null;
  } catch (error) {
    console.error("Failed to generate persona style:", error);
    return null;
  }
}
