// Ordenes sencillas que MIA entiende sin el servidor de Claude (simulador o sin internet).
// Solo traduce el texto a las mismas herramientas; con servidor configurado no se usa.
import { DISPOSITIVOS, ESCENAS, formatoHora, textoValorDispositivo } from "./modelo.js";

const normalizar = (t) =>
  ` ${t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ")} `;

const FRASES_ESCENAS = {
  hogar: /modo (hogar|normal|casa)|escena hogar|vuelv\w* a la normalidad/,
  descanso: /modo (noche|descanso|dormir)|escena descanso|a dormir|buenas noches|descansar/,
  pelicula: /pelicula|cine/,
  ahorro: /ahorr|me voy|salgo de (la )?casa|apaga todo/,
};

// El orden importa: el foco exterior se revisa antes que la "luz" generica
const NOMBRES = [
  ["alarma", /alarma|buzzer|sirena/],
  ["luz_exterior", /(foco|luz|luces|lampara)( de)? (afuera|exterior|del? (jardin|patio|entrada))/],
  ["ventilador", /ventilador|abanico/],
  ["bomba_riego", /riego|regar|bomba|riega|plantas?|maceta/],
  ["luz_interior", /foco|luz|luces|lampara/],
];

const APAGAR = / (apaga|apagar|apagues|desactiva|desactivar|deten|detener|quita|quitar|silencia|silenciar|cierra) /;
const ENCENDER = / (enciende|encender|enciendas|prende|prender|activa|activar|pon|poner|abre|riega|regar|inicia|arranca) /;

/**
 * Devuelve lo que MIA debe hacer:
 * { tipo: "escena", id } | { tipo: "herramientas", llamadas: [{ name, input }] } | { tipo: "respuesta", texto }
 */
export function interpretar(texto, estado) {
  const t = normalizar(texto);

  for (const [id, re] of Object.entries(FRASES_ESCENAS)) if (re.test(t) && ESCENAS[id]) return { tipo: "escena", id };

  if (/modo manual|control manual/.test(t)) return { tipo: "herramientas", llamadas: [{ name: "cambiar_modo", input: { modo: "manual" } }] };
  if (/modo (automatico|auto)|funcion\w* sola/.test(t)) return { tipo: "herramientas", llamadas: [{ name: "cambiar_modo", input: { modo: "automatico" } }] };

  const disp = NOMBRES.find(([, re]) => re.test(t))?.[0];
  const apagar = APAGAR.test(t);
  if (disp && (apagar || ENCENDER.test(t))) {
    if (disp === "alarma") {
      return apagar
        ? { tipo: "herramientas", llamadas: [{ name: "silenciar_alarma", input: {} }] }
        : { tipo: "respuesta", texto: "La alarma solo la enciende el sensor de movimiento cuando la casa está en automático." };
    }
    const llamadas = [];
    if (!DISPOSITIVOS[disp].siempreManual && estado?.m === "A") llamadas.push({ name: "cambiar_modo", input: { modo: "manual" } });
    llamadas.push({ name: "controlar_dispositivo", input: { dispositivo: disp, valor: apagar ? 0 : 1 } });
    return { tipo: "herramientas", llamadas };
  }

  if (/ (hola|buenas|buenos dias|hey) /.test(t)) return { tipo: "respuesta", texto: "¡Hola! Aquí estoy, lista para ayudarte con la casa." };
  if (/ gracias /.test(t)) return { tipo: "respuesta", texto: "¡Con mucho gusto! Para eso estoy." };
  if (/quien eres|que puedes|ayuda|que sabes/.test(t)) {
    return { tipo: "respuesta", texto: "Soy MIA, la asistente de esta casa. Puedo encender o apagar los dispositivos, activar escenas y contarte qué dicen los sensores." };
  }

  const e = estado;
  const hayDatos = Boolean(e);
  const sinDatos = { tipo: "respuesta", texto: "Todavía no recibo datos de la casa. Conéctala por WiFi o Bluetooth." };
  if (/temperatura|calor|frio|grados/.test(t)) {
    if (!hayDatos) return sinDatos;
    return { tipo: "respuesta", texto: e.t == null ? "El sensor de temperatura no tiene lectura en este momento." : `La temperatura es de ${e.t} grados y la humedad del aire de ${e.h} por ciento.` };
  }
  if (/humedad|suelo|tierra|seca/.test(t)) {
    if (!hayDatos) return sinDatos;
    return { tipo: "respuesta", texto: `La tierra de la maceta tiene ${e.s} por ciento de humedad y el aire ${e.h ?? "sin lectura de"} por ciento.` };
  }
  if (/ (luz|claridad|oscuro|de noche) /.test(t)) {
    if (!hayDatos) return sinDatos;
    return { tipo: "respuesta", texto: `Afuera hay ${e.l} por ciento de luz, y el foco exterior está ${textoValorDispositivo("luz_exterior", e.le).toLowerCase()}.` };
  }
  if (/ hora /.test(t)) {
    if (!hayDatos) return sinDatos;
    return { tipo: "respuesta", texto: e.hm >= 0 ? `Según el ESP32 son las ${formatoHora(e.hm)}.` : "El ESP32 todavía no sincroniza la hora." };
  }
  if (/como esta|estado|resumen|que pasa|todo bien/.test(t)) {
    if (!hayDatos) return sinDatos;
    const encendidos = Object.entries(DISPOSITIVOS).filter(([, d]) => e[d.clave]).map(([, d]) => d.nombre.toLowerCase());
    const alarma = e.al ? "¡Ojo! La alarma está sonando. " : "";
    return {
      tipo: "respuesta",
      texto: `${alarma}Estamos a ${e.t ?? "sin lectura de"} grados, en modo ${e.m === "A" ? "automático" : "manual"}. ${encendidos.length ? `Encendido: ${encendidos.join(", ")}.` : "Todo está apagado."}`,
    };
  }

  return {
    tipo: "respuesta",
    texto: "Sin mi servidor solo entiendo órdenes sencillas, como encender el ventilador o activar el modo película. Configura el servidor en Ajustes para conversar de todo.",
  };
}
