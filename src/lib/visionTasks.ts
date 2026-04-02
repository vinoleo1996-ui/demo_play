import { GestureRecognizer, PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let gestureRecognizer: GestureRecognizer | null = null;
let poseLandmarker: PoseLandmarker | null = null;

export async function initVisionTasks() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2
  });

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });

  console.log("MediaPipe Vision Tasks initialized");
}

export function detectGestures(video: HTMLVideoElement) {
  if (!gestureRecognizer) return null;
  const nowInMs = Date.now();
  const results = gestureRecognizer.recognizeForVideo(video, nowInMs);
  return results;
}

export function detectPose(video: HTMLVideoElement) {
  if (!poseLandmarker) return null;
  const nowInMs = Date.now();
  const results = poseLandmarker.detectForVideo(video, nowInMs);
  return results;
}
