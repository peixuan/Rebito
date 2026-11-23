import type { Page } from "@playwright/test";

export interface AudioSample {
  time: number;
  samples: number;
  drops: number;
  underflows: number;
  sourceRate: number;
  outputRate: number;
  delayed: boolean;
  targetFrames: number;
}
export type AudioProbeWindow = typeof window & { audioSamples: AudioSample[] };

/** Observe actual queues; optionally delay delivery once without dropping/reordering PCM. */
export async function observeDosAudio(page: Page, outputRate: number, delayMs = 0) {
  await page.addInitScript(
    ({ sampleRate, delayMs }) => {
      const host = window as AudioProbeWindow;
      host.audioSamples = [];
      window.AudioContext = new Proxy(AudioContext, {
        construct(Target, args) {
          return new Target({ ...args[0], sampleRate });
        },
      });
      const addModule = AudioWorklet.prototype.addModule;
      AudioWorklet.prototype.addModule = async function (url, options) {
        const source = await (await fetch(url)).text();
        const registration = 'registerProcessor("jsdos-audio", Processor);';
        if (!source.includes(registration)) throw new Error("Unreviewed DOS audio worklet");
        const observed = source.replace(
          registration,
          `class ObservedProcessor extends Processor {
          constructor() {
            super();
            this.samples = 0;
            this.drops = 0;
            this.underflows = 0;
            this.nextReport = 0;
            this.delayed = false;
            this.held = [];
            for (const ring of [this.sourceQueue, this.queue, this.outputQueue]) {
              const push = ring.push;
              const processor = this;
              ring.push = function (sample) {
                if (this.samplesCount === this.samples.length) processor.drops++;
                return push.call(this, sample);
              };
            }
            const receive = this.port.onmessage;
            this.flush = () => {
              if (currentTime >= this.releaseAt) {
                for (const event of this.held) receive(event);
                this.held = [];
              }
            };
            this.port.onmessage = event => {
              if (event.data?.observer) { this.observer = event.data.observer; return; }
              this.flush();
              if (event.data instanceof Float32Array) {
                this.samples += event.data.length;
                if (${delayMs} && !this.delayed && currentTime >= 5) {
                  this.delayed = true;
                  this.releaseAt = currentTime + ${delayMs} / 1000;
                }
                if (currentTime < this.releaseAt) { this.held.push(event); return; }
              }
              receive(event);
            };
          }
          process(inputs, outputs) {
            this.flush();
            const started = this.started;
            const result = super.process(inputs, outputs);
            if (started && !this.started) this.underflows++;
            if (this.observer && currentTime >= this.nextReport) {
              this.nextReport = currentTime + 1;
              this.observer.postMessage({ time: currentTime, samples: this.samples,
                drops: this.drops, underflows: this.underflows,
                sourceRate: this.sourceRate, outputRate: this.outputRate,
                delayed: this.delayed, targetFrames: this.targetFrames });
            }
            return result;
          }
        }
        registerProcessor("jsdos-audio", ObservedProcessor);`,
        );
        const blob = URL.createObjectURL(new Blob([observed], { type: "text/javascript" }));
        try {
          return await addModule.call(this, blob, options);
        } finally {
          URL.revokeObjectURL(blob);
        }
      };
      window.AudioWorkletNode = new Proxy(AudioWorkletNode, {
        construct(Target, args: ConstructorParameters<typeof AudioWorkletNode>) {
          const node = new Target(...args);
          const channel = new MessageChannel();
          channel.port1.onmessage = (event) => host.audioSamples.push(event.data);
          node.port.postMessage({ observer: channel.port2 }, [channel.port2]);
          return node;
        },
      });
    },
    { sampleRate: outputRate, delayMs },
  );
}
