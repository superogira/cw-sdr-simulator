/**
 * CW SDR — White Noise AudioWorklet Processor
 * Generates continuous white noise on the audio thread
 */
class NoiseProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        for (let channel = 0; channel < output.length; channel++) {
            const data = output[channel];
            for (let i = 0; i < data.length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        }
        return true;
    }
}
registerProcessor('noise-processor', NoiseProcessor);
