export async function initAudioTasks(onCommand: (command: string, score: number) => void) {
  console.log("Audio Tasks (Server-Side) ready");
  // 4090 终局架构：语音命令识别也可以放在服务端处理，这里暂时 mock
}

export function stopAudioTasks() {
  // Mock stop
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
