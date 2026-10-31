// Servidor intermedio (Cloudflare Worker) entre la pagina web y la API de Claude.
// - Guarda la clave de la API como secreto: nunca llega al navegador.
// - No ejecuta acciones: devuelve a la pagina las herramientas que Claude quiere usar,
//   la pagina las envia al ESP32 (WiFi o Bluetooth) y regresa con los resultados.
import Anthropic from "@anthropic-ai/sdk";
import { SISTEMA, HERRAMIENTAS } from "./asistente.js";

const MODELO = "claude-opus-5-5";
const MAX_MENSAJES = 120;
const MAX_BYTES = 400_000;

function encabezadosCors(origen, env) {
  const permitido = env.ORIGEN_PERMITIDO || "*";
  return {
    "Access-Control-Allow-Origin": permitido === "*" ? "*" : permitido,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Codigo-Acceso",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function responder(datos, estado, cors) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const origen = request.headers.get("Origin") || "";
    const cors = encabezadosCors(origen, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || url.pathname !== "/chat") {
      return responder({ error: "Ruta no encontrada" }, 404, cors);
    }

    // Seguridad basica: solo la pagina del proyecto y con el codigo de acceso del equipo
    const permitido = env.ORIGEN_PERMITIDO || "*";
    if (permitido !== "*" && origen !== permitido) {
      return responder({ error: "Origen no permitido" }, 403, cors);
    }
    if (!env.CODIGO_ACCESO || request.headers.get("X-Codigo-Acceso") !== env.CODIGO_ACCESO) {
      return responder({ error: "Código de acceso incorrecto" }, 401, cors);
    }

    const texto = await request.text();
    if (texto.length > MAX_BYTES) {
      return responder({ error: "La conversación es muy larga. Inicia una nueva." }, 413, cors);
    }
    let cuerpo;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return responder({ error: "JSON inválido" }, 400, cors);
    }
    const mensajes = cuerpo?.mensajes;
    if (
      !Array.isArray(mensajes) ||
      mensajes.length === 0 ||
      mensajes.length > MAX_MENSAJES ||
      mensajes[0]?.role !== "user" ||
      mensajes.some((m) => m?.role !== "user" && m?.role !== "assistant")
    ) {
      return responder({ error: "Formato de conversación inválido" }, 400, cors);
    }

    const cliente = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const r = await cliente.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        // Si un filtro de seguridad rechaza la peticion por error, Claude la
        // reintenta automaticamente con el modelo de respaldo recomendado.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Esfuerzo bajo = respuestas mas rapidas, ideal para una conversacion por voz
        output_config: { effort: "low" },
        // Guarda en cache las instrucciones y la conversacion para abaratar cada turno
        cache_control: { type: "ephemeral" },
        system: SISTEMA,
        tools: HERRAMIENTAS,
        messages: mensajes,
      });
      return responder(
        {
          content: r.content,
          stop_reason: r.stop_reason,
          stop_details: r.stop_details ?? null,
          model: r.model,
          usage: r.usage,
        },
        200,
        cors,
      );
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        return responder({ error: "La clave de la API de Claude no es válida" }, 500, cors);
      }
      if (error instanceof Anthropic.RateLimitError) {
        return responder({ error: "Demasiadas peticiones, intenta en unos segundos" }, 429, cors);
      }
      if (error instanceof Anthropic.BadRequestError) {
        return responder({ error: `Petición rechazada por la API: ${error.message}` }, 400, cors);
      }
      if (error instanceof Anthropic.APIError) {
        return responder({ error: `Error de la API de Claude (${error.status})` }, 502, cors);
      }
      return responder({ error: "Error interno del servidor" }, 500, cors);
    }
  },
};
