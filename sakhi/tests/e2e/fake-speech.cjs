// Simulated browser speech engines for browser tests (copied from speech-e2e.cjs). NOT real speech.
const INJECT = () => {
  window.__spoken = []
  window.__cancels = 0
  window.__sttStarts = []
  window.__stt = { kind: 'result', transcript: '' }
  class Rec {
    constructor() {
      this.lang = ''
    }
    start() {
      const s = window.__stt
      window.__sttStarts.push(this.lang)
      setTimeout(() => {
        if (s.kind === 'error') {
          this.onerror && this.onerror({ error: s.error })
          return this.onend && this.onend()
        }
        this.onstart && this.onstart()
        setTimeout(() => {
          const alt = { transcript: s.transcript, confidence: 0.9 }
          const res = Object.assign([alt], { isFinal: true })
          this.onresult && this.onresult({ resultIndex: 0, results: [res] })
          this.onspeechend && this.onspeechend()
          this.onend && this.onend()
        }, 150)
      }, 50)
    }
    abort() {
      this.onerror && this.onerror({ error: 'aborted' })
      this.onend && this.onend()
    }
    stop() {}
  }
  window.webkitSpeechRecognition = Rec
  window.SpeechRecognition = Rec
  const voices = [
    { name: 'Sim English India', lang: 'en-IN', localService: true },
    { name: 'Sim Hindi', lang: 'hi-IN', localService: true },
    ...(window.__noTelugu ? [] : [{ name: 'Sim Telugu', lang: 'te-IN', localService: true }]),
  ]
  let current = null
  const synth = {
    getVoices: () => voices,
    addEventListener() {},
    removeEventListener() {},
    speak(u) {
      window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name, rate: u.rate })
      current = u
      setTimeout(() => current === u && (current = null, u.onend && u.onend()), 1500)
    },
    cancel() {
      window.__cancels++
      const c = current
      current = null
      c && c.onerror && c.onerror({ error: 'interrupted' })
    },
    pause() {},
    resume() {},
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  window.SpeechSynthesisUtterance = class {
    constructor(t) {
      this.text = t
    }
  }
}
module.exports = { INJECT }
