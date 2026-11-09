// Efectos de sonido de la interfaz, sintetizados con Web Audio (no hay archivos de audio).
let ctx = null;
let activo = true;

export function activarSonidos(valor) {
  activo = Boolean(valor);
}

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Un tono corto con envolvente suave. hasta: frecuencia final (barrido)
function tono(frec, dur, { tipo = "sine", vol = 0.04, hasta, retraso = 0 } = {}) {
  const c = contexto();
  if (!c) return;
  const t0 = c.currentTime + retraso;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frec, t0);
  if (hasta) osc.frequency.exponentialRampToValueAtTime(hasta, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SONIDOS = {
  clic: () => tono(1700, 0.045, { tipo: "triangle", vol: 0.02 }),
  abrir: () => tono(620, 0.12, { hasta: 1100, vol: 0.025 }),
  encender: () => { tono(660, 0.09, { vol: 0.035 }); tono(990, 0.14, { vol: 0.035, retraso: 0.07 }); },
  apagar: () => { tono(880, 0.09, { vol: 0.03 }); tono(520, 0.14, { vol: 0.03, retraso: 0.07 }); },
  escuchar: () => { tono(540, 0.16, { hasta: 1080, vol: 0.035 }); tono(1620, 0.08, { vol: 0.015, retraso: 0.14 }); },
  fin: () => tono(1080, 0.16, { hasta: 540, vol: 0.03 }),
  pensar: () => tono(880, 0.06, { tipo: "triangle", vol: 0.015 }),
  exito: () => [784, 988, 1318].forEach((f, i) => tono(f, 0.16, { vol: 0.03, retraso: i * 0.07 })),
  error: () => { tono(240, 0.16, { tipo: "square", vol: 0.018 }); tono(190, 0.22, { tipo: "square", vol: 0.018, retraso: 0.12 }); },
  alerta: () => {
    for (let i = 0; i < 3; i++) {
      tono(920, 0.14, { tipo: "sawtooth", vol: 0.022, retraso: i * 0.32 });
      tono(680, 0.14, { tipo: "sawtooth", vol: 0.022, retraso: i * 0.32 + 0.16 });
    }
  },
  arranque: () => {
    tono(110, 1.1, { hasta: 440, vol: 0.03 });
    [523, 659, 784, 1046].forEach((f, i) => tono(f, 0.5, { vol: 0.018, retraso: 0.5 + i * 0.09 }));
  },
};

export function sonar(nombre) {
  if (!activo) return;
  try {
    SONIDOS[nombre]?.();
  } catch {
    /* el navegador bloqueo el audio */
  }
}
