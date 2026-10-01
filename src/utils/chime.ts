const base = import.meta.env.BASE_URL;

export interface ChimeSound {
  id: string;
  label: string;
  src: string;
}

export const CHIME_SOUNDS: readonly ChimeSound[] = [
  { id: "glass", label: "Glass", src: `${base}sounds/glass.mp3` },
  { id: "tink", label: "Tink", src: `${base}sounds/tink.mp3` },
  { id: "pop", label: "Pop", src: `${base}sounds/pop.mp3` },
  { id: "ping", label: "Ping", src: `${base}sounds/ping.mp3` },
  { id: "purr", label: "Purr", src: `${base}sounds/purr.mp3` },
  { id: "blow", label: "Blow", src: `${base}sounds/blow.mp3` },
  { id: "bottle", label: "Bottle", src: `${base}sounds/bottle.mp3` },
];

export const DEFAULT_CHIME_ID = "glass";
export const DEFAULT_CHIME_VOLUME = 0.6;

const FALLBACK_CHIME: ChimeSound = { id: "glass", label: "Glass", src: `${base}sounds/glass.mp3` };

export function getChimeById(id: string | null | undefined): ChimeSound {
  return CHIME_SOUNDS.find((s) => s.id === id) ?? CHIME_SOUNDS[0] ?? FALLBACK_CHIME;
}

// Cache Audio elements so we don't pay network/decoding costs on every play.
const audioCache = new Map<string, HTMLAudioElement>();

function getAudio(id: string): HTMLAudioElement {
  const cached = audioCache.get(id);
  if (cached) return cached;
  const sound = getChimeById(id);
  const el = new Audio(sound.src);
  el.preload = "auto";
  audioCache.set(id, el);
  return el;
}

function errorMessage(err: unknown): unknown {
  return err instanceof Error ? err.message : err;
}

export function playChime(id: string = DEFAULT_CHIME_ID, volume: number = DEFAULT_CHIME_VOLUME): void {
  try {
    const template = getAudio(id);
    const el = template.paused ? template : (template.cloneNode(true) as HTMLAudioElement);
    el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, volume));
    el.play().catch((err: unknown) => {
      console.warn("[chime] playback blocked:", errorMessage(err));
    });
  } catch (err) {
    console.warn("[chime] play failed:", errorMessage(err));
  }
}
