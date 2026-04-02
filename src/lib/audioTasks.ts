import * as tf from '@tensorflow/tfjs';
import * as speechCommands from '@tensorflow-models/speech-commands';

let recognizer: speechCommands.SpeechCommandRecognizer | null = null;

export async function initAudioTasks(onCommand: (command: string, score: number) => void) {
  recognizer = speechCommands.create('BROWSER_FFT');
  await recognizer.ensureModelLoaded();
  
  await recognizer.listen(async (result) => {
    const scores = result.scores as Float32Array;
    const labels = recognizer!.wordLabels();
    const maxScore = Math.max(...Array.from(scores));
    const index = Array.from(scores).indexOf(maxScore);
    const command = labels[index];
    
    if (maxScore > 0.85) {
      onCommand(command, maxScore);
    }
  }, {
    includeSpectrogram: true,
    probabilityThreshold: 0.75,
    invokeCallbackOnNoiseAndUnknown: true,
    overlapFactor: 0.5
  });

  console.log("Audio Tasks initialized");
}

export function stopAudioTasks() {
  if (recognizer) {
    recognizer.stopListening();
  }
}

export function getLoudness(analyser: AnalyserNode) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return sum / data.length;
}
