const base = import.meta.env.BASE_URL;
export const CHIME_SOUNDS = [
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

export function getChimeById(id) {
  return CHIME_SOUNDS.find((s) => s.id === id) || CHIME_SOUNDS[0];
}

// Cache Audio elements so we don't pay network/decoding costs on every play.
const audioCache = new Map();

function getAudio(id) {
  const cached = audioCache.get(id);
  if (cached) return cached;
  const sound = getChimeById(id);
  const el = new Audio(sound.src);
  el.preload = "auto";
  audioCache.set(id, el);
  return el;
}

export function playChime(id = DEFAULT_CHIME_ID, volume = DEFAULT_CHIME_VOLUME) {
  try {
    const template = getAudio(id);
    const el = template.paused ? template : template.cloneNode(true);
    el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, volume));
    const result = el.play();
    if (result && typeof result.catch === "function") {
      result.catch((err) => {
        console.warn("[chime] playback blocked:", err?.message || err);
      });
    }
  } catch (err) {
    console.warn("[chime] play failed:", err?.message || err);
  }
}
