// Voz del navegador: reconocimiento (hablar -> texto) y sintesis (texto -> voz).
// Funciona en Chrome y Edge (PC y Android). Requiere HTTPS y permiso del microfono.

const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
export const reconocimientoDisponible = Boolean(Reconocimiento);
export const sintesisDisponible = "speechSynthesis" in window;

let idiomas = ["es-GT", "es-MX", "es-ES"];
let reconocedor = null;

/**
 * Escucha una frase. Devuelve una promesa con el texto reconocido ("" si no se dijo nada).
 * alParcial(texto) recibe el texto mientras la persona habla.
 */
export function escuchar(alParcial) {
  if (!reconocimientoDisponible) {
    return Promise.reject(new Error("Este navegador no reconoce voz. Usa Chrome o Edge."));
  }
  detenerEscucha();
  return new Promise((resolver, rechazar) => {
    const rec = new Reconocimiento();
    reconocedor = rec;
    rec.lang = idiomas[0];
    rec.interimResults = true;
    rec.continuous = false;
    let final = "";
    let ultimoParcial = "";
    let fallo = null;

    rec.onresult = (e) => {
      // Se recalcula con todos los resultados: en Android el mismo resultado
      // final puede llegar dos veces y sumarlo duplicaba la frase.
      let fin = "", parcial = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else parcial += e.results[i][0].transcript;
      }
      final = fin;
      ultimoParcial = (fin + " " + parcial).trim();
      alParcial?.(ultimoParcial);
    };
    rec.onerror = (e) => {
      if (e.error === "language-not-supported" && idiomas.length > 1) idiomas = idiomas.slice(1);
      if (e.error === "not-allowed") fallo = new Error("Permite el uso del micrófono para hablar con la asistente.");
      else if (e.error !== "no-speech" && e.error !== "aborted") fallo = new Error(`Error de reconocimiento de voz: ${e.error}`);
    };
    rec.onend = () => {
      if (reconocedor === rec) reconocedor = null;
      if (fallo) rechazar(fallo);
      // Si termino sin resultado final (pasa en algunos Android), se usa lo ultimo que se oyo
      else resolver(final.trim() || ultimoParcial);
    };
    rec.start();
  });
}

export function detenerEscucha() {
  if (reconocedor) {
    reconocedor.stop();
  }
}

// ------------------------------- Sintesis -------------------------------
let vozElegida = null;

function elegirVoz() {
  if (vozElegida || !sintesisDisponible) return vozElegida;
  const voces = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("es"));
  const preferencia = (v) =>
    (/google|natural|online/i.test(v.name) ? 4 : 0) +
    (/es-(us|mx|gt|419)/i.test(v.lang) ? 2 : 0) +
    (/paulina|sabina|dalia|elena|helena|monica|lupe|female|mujer/i.test(v.name) ? 1 : 0);
  vozElegida = voces.sort((a, b) => preferencia(b) - preferencia(a))[0] || null;
  return vozElegida;
}
if (sintesisDisponible) speechSynthesis.addEventListener?.("voiceschanged", () => { vozElegida = null; elegirVoz(); });

/**
 * Lee un texto en voz alta. La promesa termina cuando acaba de hablar.
 * alPalabra() se llama en cada palabra (sirve para mover la boca de MIA).
 */
export function hablar(texto, alPalabra) {
  if (!sintesisDisponible || !texto) return Promise.resolve();
  return new Promise((resolver) => {
    const frase = new SpeechSynthesisUtterance(texto);
    const voz = elegirVoz();
    if (voz) frase.voice = voz;
    frase.lang = voz?.lang || "es-MX";
    frase.rate = 1.05;
    frase.onboundary = () => alPalabra?.();
    frase.onend = resolver;
    frase.onerror = resolver;
    speechSynthesis.speak(frase);
  });
}

export function callar() {
  if (sintesisDisponible) speechSynthesis.cancel();
}

// --------------------------- Nivel del microfono ---------------------------
/**
 * Mide el volumen del microfono mientras la persona habla (0 a 1) para animar a MIA.
 * Devuelve una funcion para detener la medicion. Si no hay permiso, no hace nada.
 */
export async function medirMicrofono(alNivel) {
  if (!navigator.mediaDevices?.getUserMedia) return () => {};
  let flujo, ctx, cuadro = 0;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const analizador = ctx.createAnalyser();
    analizador.fftSize = 512;
    ctx.createMediaStreamSource(flujo).connect(analizador);
    const datos = new Uint8Array(analizador.fftSize);
    const medir = () => {
      analizador.getByteTimeDomainData(datos);
      let suma = 0;
      for (const v of datos) suma += ((v - 128) / 128) ** 2;
      alNivel(Math.min(1, Math.sqrt(suma / datos.length) * 5));
      cuadro = requestAnimationFrame(medir);
    };
    medir();
  } catch {
    flujo?.getTracks().forEach((t) => t.stop());
    return () => {};
  }
  return () => {
    cancelAnimationFrame(cuadro);
    flujo.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
    alNivel(0);
  };
}
