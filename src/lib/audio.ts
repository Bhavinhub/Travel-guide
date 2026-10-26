import soundManifest from '../data/audio.json';

/**
 * Sound engine.
 * - Ambience: real field recordings (birdsong, rain, waves, wind, city) from Wikimedia Commons,
 *   looped and cross-faded per background. Falls back to synthesised ambience if a file is missing.
 * - Music: optional freely licensed instrumental tracks matched to the background.
 * - Starts only after an explicit user action; one ambience + one music track at a time;
 *   suspends when the tab is hidden.
 */
export type Ambience = 'forest' | 'rain' | 'wind' | 'ocean' | 'city' | 'none';

interface SoundFile { file: string; src: string; author: string; license?: string; source: string; title?: string }
const SOUNDS = soundManifest as unknown as { ambience: Record<string, SoundFile>; music: Record<string, SoundFile> };
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

interface Track { key: string; el?: HTMLAudioElement; gain: GainNode; stop: () => void }

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambience: Track | null = null;
  private music: Track | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private volume = 0.5;
  private enabled = false;
  private musicOn = true;
  private wanted: { amb: Ambience; chapter?: string } = { amb: 'forest' };

  get isEnabled() {
    return this.enabled;
  }
  /** Currently playing credit lines (for the UI). */
  nowPlaying() {
    return [this.ambience?.key && SOUNDS.ambience[this.ambience.key], this.music?.key && SOUNDS.music[this.music.key]].filter(Boolean) as SoundFile[];
  }

  async enable(volume: number, musicOn = true) {
    this.volume = volume;
    this.musicOn = musicOn;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) {
          this.ctx.suspend();
          [this.ambience?.el, this.music?.el].forEach((e) => e?.pause());
        } else if (this.enabled) {
          this.ctx.resume();
          [this.ambience?.el, this.music?.el].forEach((e) => e?.play().catch(() => undefined));
        }
      });
    }
    await this.ctx.resume();
    this.enabled = true;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.4);
    this.play(this.wanted.amb, true, this.wanted.chapter);
    return true;
  }

  disable() {
    if (!this.ctx) return;
    this.enabled = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    setTimeout(() => {
      if (this.enabled) return;
      this.ambience?.stop();
      this.music?.stop();
      this.ambience = this.music = null;
      this.ctx?.suspend();
    }, 900);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx && this.enabled) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (!on && this.music) { this.fadeOut(this.music); this.music = null; }
    if (on) this.play(this.wanted.amb, true, this.wanted.chapter);
  }

  private fadeOut(t: Track) {
    if (!this.ctx) return;
    t.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.7);
    setTimeout(() => t.stop(), 3000);
  }

  private fileTrack(key: string, f: SoundFile, level: number): Track {
    const ctx = this.ctx!;
    const el = new Audio(`${base}${f.src}`);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const node = ctx.createMediaElementSource(el);
    node.connect(gain).connect(this.master);
    el.play().catch(() => undefined);
    gain.gain.setTargetAtTime(level, ctx.currentTime, 1.2);
    return { key, el, gain, stop: () => { el.pause(); el.src = ''; gain.disconnect(); } };
  }

  /** Cross-fade to the ambience (and music) that matches the current background. */
  play(name: Ambience, force = false, chapter?: string) {
    this.wanted = { amb: name, chapter };
    if (!this.ctx || !this.enabled) return;
    if (force || this.ambience?.key !== name) {
      if (this.ambience) this.fadeOut(this.ambience);
      this.ambience = null;
      if (name !== 'none') {
        const f = SOUNDS.ambience[name];
        this.ambience = f ? this.fileTrack(name, f, 0.8) : this.synth(name);
      }
    }
    const musicKey = chapter && SOUNDS.music[chapter] ? chapter : SOUNDS.music.default ? 'default' : undefined;
    if (this.musicOn && musicKey && (force || this.music?.key !== musicKey)) {
      if (this.music) this.fadeOut(this.music);
      this.music = this.fileTrack(musicKey, SOUNDS.music[musicKey], 0.35);
    }
  }

  private noise() {
    if (this.noiseBuf || !this.ctx) return this.noiseBuf!;
    const len = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b = (b + 0.02 * w) / 1.02;
      d[i] = w * 0.5 + b * 3;
    }
    this.noiseBuf = buf;
    return buf;
  }

  /** Synthesised fallback when no recording is available. */
  private synth(name: Ambience): Track {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const stops: (() => void)[] = [];
    const add = (type: BiquadFilterType, freq: number, level: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise();
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      src.connect(f).connect(g).connect(gain);
      src.start();
      stops.push(() => src.stop());
    };
    if (name === 'rain') add('highpass', 1400, 0.2);
    else if (name === 'ocean') add('lowpass', 600, 0.14);
    else if (name === 'city') add('lowpass', 220, 0.2);
    else add('bandpass', 420, 0.12);
    gain.gain.setTargetAtTime(0.6, ctx.currentTime, 0.8);
    return { key: name, gain, stop: () => { stops.forEach((s) => { try { s(); } catch { /* stopped */ } }); gain.disconnect(); } };
  }

  click() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.06);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.1);
  }

  whoosh() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.25);
    g.gain.linearRampToValueAtTime(0, t + 0.9);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1);
  }
}

export const audio = new AudioEngine();
export const soundCredits = SOUNDS;

export const sceneAmbience: Record<string, Ambience> = {
  forest: 'forest', rainforest: 'rain', mountain: 'wind', snow: 'wind', beach: 'ocean', city: 'city', heritage: 'city', desert: 'wind',
};
