// Sons sur events critiques. WebAudio API : pas d'asset externe a charger,
// on synthetise direct. Volume max 30% pour pas exploser les oreilles en demo.
//
// 3 sons : success (mission completed), alert (robot offline), beep (notif).

let ctx: AudioContext | null = null
let enabled = true

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    } catch {
      return null
    }
  }
  return ctx
}

function playTone(freq: number, durMs: number, type: OscillatorType = 'sine'): void {
  if (!enabled) return
  const audio = getCtx()
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.value = 0.3
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + durMs / 1000)
  osc.connect(gain).connect(audio.destination)
  osc.start()
  osc.stop(audio.currentTime + durMs / 1000)
}

export const sounds = {
  setEnabled: (v: boolean): void => { enabled = v },
  isEnabled: (): boolean => enabled,
  // 2 tons montants — feedback positif
  success: (): void => {
    playTone(660, 120)
    setTimeout(() => playTone(880, 200), 120)
  },
  // 3 beeps urgents
  alert: (): void => {
    playTone(880, 80, 'square')
    setTimeout(() => playTone(880, 80, 'square'), 150)
    setTimeout(() => playTone(880, 80, 'square'), 300)
  },
  // 1 bip neutre
  beep: (): void => {
    playTone(770, 80)
  },
}
