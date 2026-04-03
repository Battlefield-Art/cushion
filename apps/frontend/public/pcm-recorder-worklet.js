// AudioWorklet processor that captures raw PCM and downsamples to 16kHz mono.
// Runs in the audio rendering thread for low-latency capture.

class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inputSampleRate = options.processorOptions?.sampleRate ?? sampleRate;
    this.targetRate = 16000;
    this.chunks = [];
    this.stopped = false;

    this.port.onmessage = (e) => {
      if (e.data === 'stop') {
        this.stopped = true;
        this.flush();
      }
    };
  }

  process(inputs) {
    if (this.stopped) return false;

    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    // Take first channel (mono)
    this.chunks.push(new Float32Array(input[0]));
    return true;
  }

  flush() {
    // Concatenate all chunks
    let totalLength = 0;
    for (const chunk of this.chunks) totalLength += chunk.length;

    const fullBuffer = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      fullBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];

    // Downsample to 16kHz
    const ratio = this.inputSampleRate / this.targetRate;
    const outputLength = Math.floor(fullBuffer.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      // Linear interpolation for better quality than nearest-neighbor
      const srcIndex = i * ratio;
      const lo = Math.floor(srcIndex);
      const hi = Math.min(lo + 1, fullBuffer.length - 1);
      const frac = srcIndex - lo;
      output[i] = fullBuffer[lo] * (1 - frac) + fullBuffer[hi] * frac;
    }

    this.port.postMessage({ samples: output.buffer }, [output.buffer]);
  }
}

registerProcessor('pcm-recorder-processor', PCMRecorderProcessor);
