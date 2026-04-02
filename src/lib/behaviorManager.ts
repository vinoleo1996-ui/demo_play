type EventType = 'face_detected' | 'gesture_detected' | 'pose_detected' | 'audio_detected' | 'idle' | 'user_message';

interface RobotEvent {
  type: EventType;
  payload: any;
  priority: number;
  timestamp: number;
}

class BehaviorManager {
  private events: RobotEvent[] = [];
  private cooldowns: Record<string, number> = {};
  private lastActionTime: number = 0;
  private currentAction: string | null = null;

  // Priority: 1 (highest) to 10 (lowest)
  private priorities: Record<EventType, number> = {
    'user_message': 1,
    'face_detected': 2,
    'audio_detected': 3,
    'gesture_detected': 4,
    'pose_detected': 5,
    'idle': 10
  };

  private cooldownTimes: Record<string, number> = {
    'face_detected': 10000, // 10s
    'audio_detected': 5000,  // 5s
    'gesture_detected': 3000, // 3s
    'pose_detected': 5000,   // 5s
    'idle': 2000            // 2s
  };

  public pushEvent(type: EventType, payload: any) {
    const now = Date.now();
    const lastTrigger = this.cooldowns[type] || 0;
    
    if (now - lastTrigger < this.cooldownTimes[type]) {
      return;
    }

    this.events.push({
      type,
      payload,
      priority: this.priorities[type],
      timestamp: now
    });
    
    this.cooldowns[type] = now;
    this.events.sort((a, b) => a.priority - b.priority);
  }

  public getNextAction() {
    if (this.events.length === 0) return null;
    
    // Simple priority-based selection
    const event = this.events.shift();
    if (!event) return null;

    this.lastActionTime = Date.now();
    return event;
  }

  public clearEvents() {
    this.events = [];
  }
}

export const behaviorManager = new BehaviorManager();
export type { RobotEvent, EventType };
