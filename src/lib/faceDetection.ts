import * as faceapi from '@vladmandic/face-api';

// Use a more reliable model source (CDN)
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/';

export async function loadModels() {
  try {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    console.log("Face-api models loaded successfully");
  } catch (error) {
    console.error("Error loading face-api models:", error);
  }
}

export async function detectExpression(imageElement: HTMLImageElement | HTMLVideoElement) {
  const detections = await faceapi
    .detectAllFaces(imageElement)
    .withFaceLandmarks()
    .withFaceExpressions();

  if (detections.length > 0) {
    const expressions = detections[0].expressions;
    const dominantExpression = Object.keys(expressions).reduce((a, b) => 
      expressions[a as keyof typeof expressions] > expressions[b as keyof typeof expressions] ? a : b
    );
    return {
      expression: dominantExpression,
      confidence: expressions[dominantExpression as keyof typeof expressions]
    };
  }
  return null;
}

export async function getFaceDescriptor(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
  const detection = await faceapi
    .detectSingleFace(imageElement)
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  return detection ? Array.from(detection.descriptor) : null;
}

export function computeFaceMatcher(people: { name: string, descriptor: number[] }[]) {
  if (people.length === 0) {
    console.log("No registered people to match against.");
    return null;
  }
  console.log(`Computing face matcher for ${people.length} people.`);
  const labeledDescriptors = people.map(p => {
    // Ensure descriptor is a Float32Array
    const desc = new Float32Array(p.descriptor);
    return new faceapi.LabeledFaceDescriptors(p.name, [desc]);
  });
  // Increase threshold to 0.7 for more leniency (default is 0.6)
  return new faceapi.FaceMatcher(labeledDescriptors, 0.7);
}

export async function recognizeFace(imageElement: HTMLImageElement | HTMLVideoElement, matcher: faceapi.FaceMatcher) {
  const detections = await faceapi
    .detectAllFaces(imageElement)
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (detections.length > 0) {
    // Return the best match for the first face detected for simplicity in greeting
    const match = matcher.findBestMatch(detections[0].descriptor);
    return match;
  }
  return null;
}

export async function detectAll(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
  return await faceapi
    .detectAllFaces(imageElement)
    .withFaceLandmarks()
    .withFaceExpressions()
    .withFaceDescriptors();
}
