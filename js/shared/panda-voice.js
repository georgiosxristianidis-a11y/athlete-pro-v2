// @ts-check
/* ════════════════════════════════════════════════════════
   panda-voice.js — Local Voice Interaction Engine
   ────────────────────────────────────────────────────────
   Zero-network voice synthesis for P.A.N.D.A. mascot.
   Uses SpeechSynthesis API + Haptic Gate to bypass iOS
   audio blocking. Syncs animation with speech lifecycle.
   ════════════════════════════════════════════════════════ */

import { emitMood } from './panda-mood.js';
import { generateInsights } from '../insights.engine.js';

let synth = null;
let unlocked = false;

function initSynth() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    synth = window.speechSynthesis;
    // Voices are loaded asynchronously on some platforms
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = () => synth.getVoices();
    }
  }
}

/** 
 * Haptic Gate: Call this synchronously on pointerdown/click
 * to silently unlock the audio context on iOS Safari.
 */
export function hapticGate() {
  if (!synth || unlocked) return;
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  synth.speak(u);
  unlocked = true;
}

/** Cancel any ongoing speech immediately */
export function cancelSpeech() {
  if (synth && synth.speaking) {
    synth.cancel();
    emitMood('chew');
  }
}

/**
 * Generates a local insight and speaks it.
 * @param {(text: string|null) => void} onTextReady Callback to show/hide subtitle bubble
 */
export async function speakInsight(onTextReady) {
  if (!synth) return;
  
  // If already speaking, cancel it (Interrupt mechanism)
  if (synth.speaking) {
    cancelSpeech();
    if (onTextReady) onTextReady(null);
    return;
  }

  // 1. Get data locally (0ms network latency)
  const insights = await generateInsights();
  const insight = insights.length > 0 ? insights[0] : null;
  const text = insight ? `${insight.title}. ${insight.body}` : "Тренировка идет по плану.";
  
  // 2. Show bubble immediately
  if (onTextReady) onTextReady(text);

  // 3. Speak
  const u = new SpeechSynthesisUtterance(text);
  
  const voices = synth.getVoices();
  const isRuText = /[а-яА-Я]/i.test(text);
  const targetLang = isRuText ? 'ru' : 'en';
  const targetVoice = voices.find(v => v.lang.startsWith(targetLang));
  if (targetVoice) u.voice = targetVoice;

  u.onstart = () => {
    emitMood('cheer'); 
  };
  
  u.onend = () => {
    emitMood('chew'); 
    if (onTextReady) onTextReady(null); 
  };
  
  u.onerror = () => {
    emitMood('chew');
    if (onTextReady) onTextReady(null);
  };
  
  synth.speak(u);
}

initSynth();
