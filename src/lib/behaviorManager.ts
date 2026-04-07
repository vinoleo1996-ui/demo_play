import { GoogleGenAI, Type } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type EventType = 
  | 'greeting_known' 
  | 'greeting_stranger' 
  | 'gesture_detected' 
  | 'pose_detected' 
  | 'special_timbre' 
  | 'loud_noise' 
  | 'moving_object' 
  | 'attention_detected' 
  | 'user_message' 
  | 'idle';

interface RobotEvent {
  type: EventType;
  payload: any;
  priority: number;
  timestamp: number;
  id?: string;
}

// Behavior Tree Node Types
type BTNodeStatus = 'SUCCESS' | 'FAILURE' | 'RUNNING';
interface BTNode {
  execute(event: RobotEvent): BTNodeStatus;
}

class SequenceNode implements BTNode {
  constructor(private children: BTNode[]) {}
  execute(event: RobotEvent): BTNodeStatus {
    for (const child of this.children) {
      const status = child.execute(event);
      if (status !== 'SUCCESS') return status;
    }
    return 'SUCCESS';
  }
}

class SelectorNode implements BTNode {
  constructor(private children: BTNode[]) {}
  execute(event: RobotEvent): BTNodeStatus {
    for (const child of this.children) {
      const status = child.execute(event);
      if (status !== 'FAILURE') return status;
    }
    return 'FAILURE';
  }
}

class BehaviorManager {
  private events: RobotEvent[] = [];
  private cooldowns: Record<string, number> = {};
  private activeEvent: RobotEvent | null = null;
  private lastActionTime: number = 0;
  private rootNode: BTNode;
  private actionHistory: string[] = [];

  constructor() {
    this.rootNode = new SelectorNode([
      new SequenceNode([
        { execute: (e) => (e.type === 'user_message' ? 'SUCCESS' : 'FAILURE') },
      ]),
      new SequenceNode([
        { execute: (e) => (['greeting_known', 'greeting_stranger', 'gesture_detected', 'pose_detected'].includes(e.type) ? 'SUCCESS' : 'FAILURE') },
      ]),
      new SequenceNode([
        { execute: (e) => (['special_timbre', 'loud_noise', 'moving_object', 'attention_detected'].includes(e.type) ? 'SUCCESS' : 'FAILURE') },
      ]),
      { execute: () => 'SUCCESS' }
    ]);
  }

  public checkRepetition(type: EventType, id?: string): boolean {
    const key = id ? `${type}:${id}` : type;
    return this.actionHistory.includes(key);
  }

  public async reasoningLoop(context: any) {
    // 5-Dimensional Motivation Assessment
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `分析以下当前场景，对五个维度进行评分(1-5分，4分及以上触发主动行为):
      1. 视觉场景变化 (Visual Scene Changes)
      2. 用户意图信号 (User Intent Signals)
      3. 对话状态 (Conversation State)
      4. 社交协议需求 (Social Protocol Requirements)
      5. 情感响应需求 (Emotional Response Needs)
      
      场景上下文: ${JSON.stringify(context)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scores: {
              type: Type.OBJECT,
              properties: {
                visualSceneChanges: { type: Type.INTEGER },
                userIntentSignals: { type: Type.INTEGER },
                conversationState: { type: Type.INTEGER },
                socialProtocolRequirements: { type: Type.INTEGER },
                emotionalResponseNeeds: { type: Type.INTEGER }
              }
            },
            reasoning: { type: Type.STRING },
            actionPlan: { type: Type.STRING }
          },
          required: ["scores", "reasoning", "actionPlan"]
        }
      }
    });

    try {
      const result = JSON.parse(response.text || "{}");
      const maxScore = Math.max(...Object.values(result.scores) as number[]);
      
      if (maxScore >= 4) {
        console.log("Proactive Action Triggered:", result.reasoning);
        // Trigger action based on actionPlan
        this.pushEvent('attention_detected', { plan: result.actionPlan }, 'proactive_trigger');
      }
    } catch (e) {
      console.error("Failed to parse reasoning result", e);
    }
  }

  private priorities: Record<EventType, number> = {
    'user_message': 0,
    'greeting_known': 1,
    'greeting_stranger': 2,
    'gesture_detected': 3,
    'pose_detected': 4,
    'special_timbre': 5,
    'loud_noise': 6,
    'moving_object': 7,
    'attention_detected': 8,
    'idle': 10
  };

  private defaultCooldowns: Record<EventType, number> = {
    'greeting_known': 30 * 60 * 1000,
    'greeting_stranger': 30 * 60 * 1000,
    'gesture_detected': 120 * 1000,
    'pose_detected': 120 * 1000,
    'special_timbre': 60 * 1000,
    'loud_noise': 60 * 1000,
    'moving_object': 30 * 60 * 1000,
    'attention_detected': 300 * 1000,
    'user_message': 0,
    'idle': 2000
  };

  public pushEvent(type: EventType, payload: any = {}, id?: string) {
    const now = Date.now();
    const cooldownKey = id ? `${type}:${id}` : type;
    const lastTrigger = this.cooldowns[cooldownKey] || 0;
    const cooldownTime = this.defaultCooldowns[type];

    if (now - lastTrigger < cooldownTime) return false;

    const priority = this.priorities[type];
    const newEvent: RobotEvent = { type, payload, priority, timestamp: now, id };

    if (this.activeEvent && priority < this.activeEvent.priority) {
      this.events.unshift(newEvent);
      this.activeEvent = null;
      return true;
    }

    if (type === 'special_timbre' && this.activeEvent && this.activeEvent.type !== 'user_message') {
      this.events.unshift(newEvent);
      return true;
    }

    this.events.push(newEvent);
    this.events.sort((a, b) => a.priority - b.priority);
    return true;
  }

  public getNextAction() {
    const now = Date.now();
    if (this.activeEvent && (now - this.lastActionTime < 3000)) return null;
    if (this.events.length === 0) return null;
    
    const event = this.events.shift()!;
    
    // Execute through Behavior Tree
    this.rootNode.execute(event);

    const cooldownKey = event.id ? `${event.type}:${event.id}` : event.type;
    this.cooldowns[cooldownKey] = now;
    this.activeEvent = event;
    this.lastActionTime = now;
    return event;
  }

  public clearEvents() {
    this.events = [];
    this.activeEvent = null;
  }

  public getActiveEvent() {
    return this.activeEvent;
  }
}

export const behaviorManager = new BehaviorManager();
export type { RobotEvent, EventType };
