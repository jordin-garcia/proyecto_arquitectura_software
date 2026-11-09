# 7. Asistente MIA

MIA es la asistente virtual de la casa. **Claude decide qué hacer; la página lo ejecuta en el ESP32; el ESP32 lo valida.** Claude nunca toca el hardware directamente.

## 7.1 Servidor intermedio (`servidor/`)

Cloudflare Worker con `@anthropic-ai/sdk` ^1.3.0 y `wrangler` ^4.154.

| Elemento | Valor |
|---|---|
| Configuración | `wrangler.toml`: `name = "casa-ia-asistente"`, `main = "src/index.js"`, `compatibility_date = "2026-09-01"`, `compatibility_flags = ["nodejs_compat"]`, `[vars] ORIGEN_PERMITIDO = "*"` (cambiar por la dirección de GitHub Pages al publicar) |
| Secretos | `ANTHROPIC_API_KEY` y `CODIGO_ACCESO` (`npx wrangler secret put …`). Para desarrollo local: `.dev.vars` a partir de `.dev.vars.example`. |
| Ruta | Solo `POST /chat` (y `OPTIONS` para CORS) |
| Scripts | `npm run dev` (local) · `npm run deploy` |

### Petición
```
POST /chat
Content-Type: application/json
X-Codigo-Acceso: <frase del equipo>

{"mensajes": [ ...historial en formato de la API de Claude... ]}
```

### Validaciones, en orden
| Validación | Respuesta si falla |
|---|---|
| Método y ruta | 404 "Ruta no encontrada" |
| `Origin` igual a `ORIGEN_PERMITIDO` (si no es `*`) | 403 "Origen no permitido" |
| `X-Codigo-Acceso` igual a `CODIGO_ACCESO` (que debe existir) | 401 "Código de acceso incorrecto" |
| Cuerpo ≤ 400 000 caracteres | 413 "La conversación es muy larga. Inicia una nueva." |
| JSON válido | 400 "JSON inválido" |
| `mensajes` es un arreglo de 1 a 120 elementos, el primero con rol `user` y todos con rol `user` o `assistant` | 400 "Formato de conversación inválido" |

### Llamada al modelo
```js
cliente.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 16000,
  output_config: { effort: "high" },    // razonamiento alto
  cache_control: { type: "ephemeral" }, // caché de instrucciones y conversación
  system: SISTEMA,
  tools: HERRAMIENTAS,
  messages: mensajes,
});
```

**Respuesta exitosa (200):** `{ content, stop_reason, stop_details, model, usage }`.

**Errores de la API:**

| Error | Código devuelto |
|---|---|
| `AuthenticationError` | 500 "La clave de la API de Claude no es válida" |
| `RateLimitError` | 429 |
| `BadRequestError` | 400 con el mensaje |
| Otro `APIError` | 502 |
| Cualquier otro | 500 |

## 7.2 Instrucciones del sistema (`SISTEMA`)

Es un texto fijo, para aprovechar el caché. Contenido, en resumen:

- **Identidad:** MIA, asistente de una maqueta con ESP32 del curso; español de Guatemala, cálida, con humor ligero.
- **Forma de responder:**
  - de 1 a 3 oraciones aptas para voz;
  - sin listas, markdown, emojis ni símbolos;
  - cantidades escritas de forma natural;
  - empieza de inmediato;
  - una sola pregunta si algo es ambiguo;
  - confirma lo que hizo, y nunca dice que hizo algo si la herramienta falló.
- **Información en vivo:** cada mensaje del usuario trae `<estado_casa>`. Usar `consultar_estado` solo si hace falta un dato más reciente. Nunca inventar lecturas.
- **Dispositivos:** qué hace cada uno.
  - El foco interior solo cambia por orden del usuario y en cualquier modo, sin pasar a manual.
  - El foco exterior depende de la luz, el ventilador de la temperatura y el riego de la humedad.
  - La bomba tiene límites: 60 s y luego 1 minuto de pausa.
  - La alarma suena tras varios segundos de presencia y se apaga sola o con `silenciar_alarma`.
- **Alertas:** si el estado muestra una alerta de la alarma, mencionarla primero, con calma.
- **Modos:**
  - En automático solo se mueve a mano el foco interior; también se puede apagar la alarma.
  - Para mover otro dispositivo: `cambiar_modo("manual")` y luego `controlar_dispositivo`, en la misma respuesta, y avisar.
  - "Que funcione sola" significa cambiar a automático.
- **Escenas:** varias llamadas en la misma respuesta.
- **Reglas:**
  - forma y sensores;
  - solo para el foco exterior, el ventilador y el riego (el foco interior es solo manual y la alarma solo la activa el PIR);
  - ejemplos;
  - qué hacer si piden algo imposible;
  - avisar si la casa está en manual.
- **Umbrales:** `temp_max`, `humedad_suelo_min`, `luz_noche`, `tiempo_alarma`, con sus rangos y la histéresis.
- **Alcance:** solo controla esta maqueta y solo con sus herramientas.

## 7.3 Herramientas

Todas usan `strict: true` y `additionalProperties: false`. No se fuerza `tool_choice`.

| Herramienta | Entrada | Qué hace la página | Confirmación |
|---|---|---|---|
| `consultar_estado` | `{}` | Devuelve el bloque `<estado_casa>` actual | Error si no hay datos recientes |
| `cambiar_modo` | `modo`: `automatico` \| `manual` | `{"c":"modo","v":"A"\|"M"}` | `estado.m` cambió |
| `controlar_dispositivo` | `dispositivo`: `luz_interior` \| `luz_exterior` \| `ventilador` \| `bomba_riego` \| `alarma`; `valor`: entero 0 o 1 | Valida. Apagar la alarma se resuelve con `silenciar_alarma`. El foco interior funciona en cualquier modo; los demás exigen manual. Envía `set`. | `estado[clave] == valor`. Si falla con la bomba, menciona la pausa de seguridad. |
| `ajustar_umbral` | `parametro`: `temp_max` \| `humedad_suelo_min` \| `luz_noche` \| `tiempo_alarma`; `valor`: número | `validarUmbral` y luego `cfg` | `config.u[clave]` igual al valor (±0.01) |
| `crear_regla` | `sensor`: `temperatura` \| `humedad_aire` \| `humedad_suelo` \| `luz` \| `presencia` \| `hora`; `operador`: `<` \| `>` \| `=`; `umbral`: número; `dispositivo`: `luz_exterior` \| `ventilador` \| `bomba_riego`; `valor`: 0 o 1 | Máximo 6; rechaza el foco interior y la alarma; asigna el primer `rN` libre; envía `regla+` | La configuración incluye la regla; avisa si la casa está en manual |
| `eliminar_regla` | `id`: texto | Verifica que exista y envía `regla-` | La regla ya no está |
| `silenciar_alarma` | `{}` | Si no está sonando, lo dice; si suena, envía `alarma` | `estado.al == 0`. Si la persona sigue ahí, avisa que se rearma cuando se vaya. |

Cada herramienta exige datos recientes de la casa: si no los hay, devuelve un error. Los errores se devuelven como `tool_result` con `is_error: true` y un texto en español que Claude le explica al usuario.

## 7.4 Contexto en vivo (`<estado_casa>`)

Se agrega como primer bloque de texto de **cada** mensaje del usuario:

```
<estado_casa>
Fecha y hora: viernes, 30 de octubre de 2026, 11:26
Conexión: Bluetooth y WiFi            (o "simulador (demostración sin hardware)")
Modo: automatico
Sensores: temperatura 26.4 °C; humedad_aire 55 %; humedad_suelo 42 %; luz 51 %; presencia sí (1); hora 11:26 (HHMM 1126)
ALERTA: la alarma está sonando porque el sensor de movimiento detectó a una persona. Se puede desactivar con silenciar_alarma.
                                      (o "Alarma silenciada: …" si as = 1; nada si no hay alarma)
Dispositivos: luz_interior 1 (Encendido); luz_exterior 0 (Apagado); ventilador 0 (Apagado); bomba_riego 0 (Apagado); alarma 1 (Sonando)
Umbrales: temp_max 28 °C; humedad_suelo_min 35 %; luz_noche 25 %; tiempo_alarma 5 s
Reglas (1/6): r1: Si hora > 22:00 → foco exterior: apagado
</estado_casa>
```

Si no hay datos recientes, dice "Conexión con la casa: SIN DATOS (la maqueta no está conectada)."

## 7.5 Ciclo de conversación (`conversar`)

1. Si el historial pasa de **100 mensajes**, se reinicia y se muestra la nota "La conversación era muy larga; empecé una nueva."
2. Se agrega el mensaje del usuario: `[contexto, texto]`.
3. Hasta **8 vueltas**:
   1. Se hace `POST /chat`.
   2. Si `stop_reason == "refusal"`: se recorta el historial al inicio del turno y se responde "Prefiero no ayudar con eso. ¿Te ayudo con algo de la casa?".
   3. Se guarda la respuesta del asistente **completa y sin cambios**, incluidos los bloques internos del modelo.
   4. Se muestra el texto (y se lee en voz alta si la voz está activa).
   5. Si `stop_reason == "tool_use"`: se ejecutan las herramientas **en orden**, se muestra cada acción con ✓ o ⚠ (excepto `consultar_estado`), se agregan los `tool_result` como un mensaje `user` y se repite la vuelta.
   6. Si `stop_reason == "pause_turn"`: se repite la vuelta.
   7. Si `stop_reason == "max_tokens"`: se avisa "(La respuesta se cortó por ser muy larga.)".
   8. En cualquier otro caso, termina.
4. Si se agotan las 8 vueltas: "Hice varias acciones seguidas y me detuve por seguridad. ¿Continúo?"
5. Si hay un error de red o del servidor y el turno quedó a medias (el último mensaje es del usuario o contiene `tool_use`), se recorta el historial al inicio del turno para que siga siendo válido. El error se muestra en el chat.

**Invariante:** el historial **solo crece al final**; nunca se editan mensajes anteriores.

## 7.6 Costo

- Claude Haiku 5.5 cuesta $0.10 por millón de tokens de entrada y $0.50 por millón de salida (con conversaciones de hasta 100 000 tokens).
- Con caché y esfuerzo alto, cada mensaje cuesta aproximadamente **menos de medio centavo de dólar**.
- Haiku 5.5 no tiene respaldo automático de modelo: si un filtro de seguridad rechaza una petición, la página descarta el turno y responde con amabilidad.
- Unos pocos dólares de crédito prepagado alcanzan para el desarrollo y la presentación.

## 7.7 Ejemplos de comportamiento esperado

| El usuario dice | Herramientas esperadas |
|---|---|
| "¿Cómo está la casa?" | Ninguna (usa `<estado_casa>`) |
| "Enciende el foco de la sala" (en automático) | `controlar_dispositivo(luz_interior, 1)`, sin cambiar de modo |
| "Enciende el ventilador" (en automático) | `cambiar_modo(manual)`, `controlar_dispositivo(ventilador, 1)` |
| "Activa el modo noche" | Varias: foco interior 0, foco exterior 1, … |
| "Después de las 10 de la noche apaga el foco de afuera" | `crear_regla(hora, >, 2200, luz_exterior, 0)` |
| "Enciende el ventilador desde los 26 grados" | `ajustar_umbral(temp_max, 26)` |
| "Que la alarma suene a los 8 segundos" | `ajustar_umbral(tiempo_alarma, 8)` |
| "Desactiva la alarma" | `silenciar_alarma` |
| "Que el foco de la sala se encienda cuando haya alguien" | Explica que el foco interior solo se controla por órdenes y propone encenderlo ahora |
