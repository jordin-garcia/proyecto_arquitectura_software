# 6. Página web

- Página estática en `web/`, sin compilación: HTML, CSS y módulos ES.
- Se publica en GitHub Pages con `.github/workflows/pagina.yml`, que usa `actions/checkout@v4`, `configure-pages@v5`, `upload-pages-artifact@v3` y `deploy-pages@v4`.
- Se sirve por HTTPS, requisito de Web Bluetooth, del micrófono y de las notificaciones.

## 6.1 Dependencias externas

| Recurso | Origen | Uso |
|---|---|---|
| mqtt.js 5.10.1 | `unpkg.com/mqtt@5.10.1/dist/mqtt.min.js` (global `mqtt`) | MQTT por WebSocket |
| Chart.js 4.4.1 | `cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js` (global `Chart`) | Gráfica |
| Plus Jakarta Sans | Google Fonts | Tipografía |

Si Chart.js no carga, la página funciona sin la gráfica.

## 6.2 Módulos

| Archivo | Responsabilidad | Exporta |
|---|---|---|
| `js/app.js` | Arranque, armado y pintado de la interfaz, avisos de la alarma, eventos, ajustes, chat | — |
| `js/conexion.js` | Estado compartido `casa`, MQTT, BLE, simulador, envío y confirmación de comandos | `casa`, `suscribir`, `conectarMqtt`, `desconectarMqtt`, `conectarBle`, `desconectarBle`, `bluetoothDisponible`, `iniciarSimulador`, `enviarComando`, `esperar`, `hayDatosRecientes` |
| `js/modelo.js` | Catálogo de dispositivos, sensores y umbrales; validaciones; textos | `DISPOSITIVOS`, `DISPOSITIVOS_REGLAS`, `SENSORES`, `UMBRALES`, `MAX_REGLAS`, `nombrePorClave`, `validarValorDispositivo`, `validarUmbral`, `formatoHora`, `textoValorDispositivo`, `textoRegla` |
| `js/asistente.js` | Historial de Claude, contexto en vivo, herramientas y ciclo de conversación | `conversar`, `nuevaConversacion`, `describirAccion` |
| `js/voz.js` | Reconocimiento y síntesis de voz | `escuchar`, `detenerEscucha`, `hablar`, `callar`, `reconocimientoDisponible`, `sintesisDisponible` |
| `js/simulador.js` | ESP32 simulado con el mismo protocolo | `crearSimulador` |
| `js/iconos.js` | Iconos SVG de trazo | `icono`, `pintarIconos` |

### Estado compartido (`casa`)

```js
{ estado, config, actualizado, mqtt: "desconectado|conectando|conectado",
  ble: "desconectado|conectando|conectado", esp32EnLinea, simulador }
```

- `suscribir(fn)` avisa de los eventos `"estado"`, `"config"` y `"conexion"`.
- `hayDatosRecientes()` es verdadero si el último estado tiene menos de 5 s.

## 6.3 Catálogo (`modelo.js`)

### Dispositivos (todos de encendido y apagado)

| Nombre interno | Clave | Interfaz | Icono | Marca |
|---|---|---|---|---|
| `luz_interior` | `li` | Foco interior | foco | `siempreManual`: se controla en cualquier modo |
| `luz_exterior` | `le` | Foco exterior | luna | — |
| `ventilador` | `f` | Ventilador | viento | — |
| `bomba_riego` | `b` | Riego | gota | — |
| `alarma` | `al` | Alarma | campana | `soloAlarma`: en automático solo se puede apagar |

- `DISPOSITIVOS_REGLAS` = `luz_exterior`, `ventilador` y `bomba_riego`.
- Textos de estado:
  - alarma: "Sonando" o "En silencio";
  - riego: "Regando" o "Apagado";
  - los demás: "Encendido" o "Apagado".

### Sensores, en orden de las tarjetas

| Sensor | Clave | Unidad |
|---|---|---|
| Temperatura | `t` | °C |
| Humedad del aire | `h` | % |
| Humedad del suelo | `s` | % |
| Luz exterior | `l` | % |
| Presencia | `p` | — |
| Hora | `hm` | — |

### Umbrales
`temp_max`, `humedad_suelo_min`, `luz_noche` y `tiempo_alarma`, con los rangos de [05](05-protocolo.md).

## 6.4 Interfaz

### Barra superior

- Marca "Casa IA".
- Chip **WiFi**, con un punto de color:

  | Estado | Significado |
  |---|---|
  | `desconectado` | Sin conexión; al tocarlo abre los ajustes |
  | `conectando` | Conectando al broker |
  | `conectado` | Conectado al broker y con el ESP32 en línea |
  | `sin-casa` | Conectado al broker, pero el ESP32 no está en línea |

- Chip **Bluetooth**: toca para conectar o desconectar.
- Selector **Automático / Manual**.
- Botón de **Ajustes**.

### Panel "Casa"

1. **Aviso de la alarma.** Solo se muestra con datos recientes.

   | Situación | Título | Detalle | Botón |
   |---|---|---|---|
   | `al = 1` | "¡Persona detectada! La alarma está sonando" | "El sensor de movimiento detectó a alguien durante más de N segundos…" | **Desactivar alarma**: envía `{"c":"alarma","v":0}` |
   | `al = 0` y `as = 1` | "Alarma silenciada" | "El sensor todavía detecta a alguien. La alarma se rearma cuando ya no haya nadie." | Ninguno |

   Mientras suena, el icono parpadea, salvo que el sistema pida movimiento reducido.

2. **Sensores:** 6 tarjetas.
   - Las de porcentaje muestran una barra.
   - Temperatura se resalta si `t ≥ tmax`.
   - Presencia se marca en rojo mientras suena la alarma.
   - Indicador "En vivo / Sin datos recientes / Sin datos".
   - En modo demo, botón **"Simular una persona"**.

3. **Dispositivos:** 5 tarjetas con interruptor.

   | Interruptor | Habilitado cuando… |
   |---|---|
   | Foco interior | Hay datos recientes, **en cualquier modo**. Su estado dice "· desde la página". |
   | Alarma | En manual; en automático solo mientras suena, para apagarla |
   | Los demás | Hay datos recientes y la casa está en manual |

4. **Gráfica "Últimos 5 minutos":** un punto cada 2 s, máximo 150. Temperatura en el eje izquierdo; humedad del suelo y luz en el derecho.

5. **Reglas personalizadas:** lista con id, texto y botón para borrar.

6. **Alertas de la alarma:**
   - historial de esta visita, las últimas 10, con hora y texto;
   - opción **"Avisarme también con notificaciones del navegador"**: al marcarla pide permiso con `Notification.requestPermission()`; si se niega, se desmarca y avisa.

7. **Umbrales de automatización:** formulario con los 4 umbrales.
   - Se valida cada valor y solo se envían los que cambiaron, confirmando cada uno.
   - El formulario no se sobrescribe mientras el usuario edita.

### Aviso de una alarma nueva (`revisarNuevaAlarma`)

1. Al recibir el primer estado se guarda `na` sin avisar.
2. Cuando `na` sube:
   - agrega una entrada al historial ("Persona detectada: la alarma se activó", con la hora);
   - muestra un mensaje emergente rojo;
   - agrega una nota en el chat de Aurora;
   - si la opción está activa y hay permiso, muestra una notificación del navegador "Casa IA: alarma activada".
3. Si `na` baja (el ESP32 se reinició), solo se actualiza el valor guardado.

### Panel "Aurora"
- Orbe con cuatro estados: `reposo`, `escuchando`, `pensando` y `hablando`.
- Botón de nueva conversación y chat con cinco tipos de mensaje: usuario, asistente, acción (✓ o ⚠), nota y error.
- Sugerencias: "¿Cómo está la casa?", "Activa el modo noche", "Enciende el foco de la sala" y "Me voy de la casa".
- Micrófono, campo de texto y botón de enviar.
- Opciones "Responder con voz" (activada) y "Conversación continua".

### Ajustes (`<dialog>`)

| Campo | Ejemplo |
|---|---|
| `mqttUrl` | `wss://xxxx.s1.eu.hivemq.cloud:8884/mqtt` |
| `mqttUsuario`, `mqttClave` | `web-casa` |
| `idCasa` | `casa01` |
| `servidorUrl` | `https://casa-ia-asistente.<cuenta>.workers.dev` |
| `codigoAcceso` | Frase secreta del equipo |

- Se guardan en `localStorage["casaIA.ajustes"]`, dentro de try/catch.
- Al guardar: reconecta MQTT y reinicia la conversación.

### Diseño adaptable

| Ancho | Distribución |
|---|---|
| > 1200 px | Panel de la casa y panel de Aurora lado a lado |
| ≤ 1200 px | Sensores en 3 columnas, dispositivos en 2; gráfica y reglas apiladas |
| ≤ 900 px | Pestañas inferiores **Casa / Aurora**; sensores en 2 columnas, dispositivos en 1; chips solo con icono |
| ≤ 420 px | Sin el nombre de la marca; umbrales en una columna |

Tema claro y oscuro según `prefers-color-scheme`. Se respeta `prefers-reduced-motion`.

## 6.5 Ciclo de vida

1. `iniciar()` arma la interfaz, pinta el estado inicial (incluidos el aviso y el historial vacío) y saluda.
2. Se suscribe a los eventos de `casa`. Con cada estado: sensores, dispositivos, aviso, `revisarNuevaAlarma()` y gráfica.
3. Cada 1 s repinta la frescura, los dispositivos y el aviso.
4. Conexión inicial:
   - con `?demo=1` inicia el simulador y muestra "Simular una persona";
   - si no, MQTT si hay `mqttUrl`;
   - si tampoco hay `servidorUrl`, abre los ajustes.

## 6.6 Simulador (`?demo=1`)

`crearSimulador(alEstado, alConfig)` imita el firmware:

- **Sensores:**
  - luz sinusoidal entre ≈5 y ≈95 %;
  - temperatura con ruido, baja con el ventilador;
  - el suelo se seca lento y se moja con la bomba.
- **Automatización:** igual que el firmware.
  - Foco exterior con histéresis de 10.
  - Ventilador con histéresis de 0.5.
  - Riego por umbral más 10.
  - Alarma tras `ta` segundos de presencia, con contador `na` y estado silenciado `as`.
  - Reglas.
- **Comandos:**
  - los mismos que el firmware, con las mismas restricciones: `li` en cualquier modo, `set al 0` en cualquier modo;
  - además `demo-persona`, que simula a una persona frente al PIR durante 12 s.
- Publica cada 1 s y responde a los comandos con 150 ms de demora.

## 6.7 Voz (`voz.js`)

| Función | Detalle |
|---|---|
| Reconocimiento | `SpeechRecognition` / `webkitSpeechRecognition`. Idioma `es-GT`; si no está disponible, `es-MX` y después `es-ES`. Resultados parciales; una frase por vez. |
| Errores | `not-allowed` → "Permite el uso del micrófono…". Se ignoran `no-speech` y `aborted`. |
| Síntesis | `speechSynthesis` a velocidad 1.05. Prefiere voces "Google", "Natural" u "Online", de español latinoamericano y femeninas. |
| Cola | Las respuestas se leen en orden; un mensaje nuevo calla la voz anterior. |
| Compatibilidad | Probado en Chrome y Edge en PC y Android. Si no hay reconocimiento, el micrófono lo avisa y se usa texto. |

## 6.8 Errores visibles

| Situación | Mensaje |
|---|---|
| Comando sin conexión | "La casa no está conectada. Conéctala por WiFi o Bluetooth." |
| Navegador sin Bluetooth | "Este navegador no soporta Bluetooth. Usa Chrome o Edge." |
| El ESP32 no confirmó un umbral | "El ESP32 no aceptó: <umbral>" |
| Notificaciones no permitidas | "El navegador no dio permiso para mostrar notificaciones." |
| Error de Aurora | Mensaje de error en el chat |
