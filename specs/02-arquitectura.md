# 2. Arquitectura

## 2.1 Vista general

```
                          ┌──────────────────────────────────┐
                          │  Página web (GitHub Pages)       │
                          │  PC y celular · texto y voz      │
                          │  app.js · conexion.js · asistente.js
                          └──┬───────────────┬────────────┬──┘
           Bluetooth BLE     │   WiFi        │            │ HTTPS POST /chat
           (sin internet)    │   MQTT/WSS    │            ▼
                             │   :8084       │   ┌────────────────────────┐
                             │               ▼   │ Cloudflare Worker      │
                             │     ┌────────────┐│ guarda ANTHROPIC_API_KEY
                             │     │ EMQX       ││ valida código y formato│
                             │     │ Cloud      │└───────────┬────────────┘
                             │     └─────┬──────┘            │
                             │           │ MQTT/TLS :8883    ▼
                             ▼           ▼             ┌──────────────┐
                          ┌───────────────────────┐    │ API de Claude│
                          │ ESP32-WROOM-32        │    │ Haiku 5.5    │
                          │ núcleo 1: control     │    └──────────────┘
                          │ núcleo 0: WiFi + MQTT │
                          │ tarea NimBLE: BLE     │
                          └───────────┬───────────┘
                                      │ GPIO, ADC
                     sensores, 4 relés, buzzer (ver 03-hardware)
```

## 2.2 Componentes

| Componente | Tecnología | Responsabilidad | Especificación |
|---|---|---|---|
| Firmware | C++ Arduino sobre FreeRTOS (núcleo esp32 3.x) | Leer sensores, decidir, mover actuadores, alarma, persistencia, WiFi/MQTT, BLE | [04](04-firmware.md) |
| Broker MQTT | EMQX Cloud Serverless (gratis) | Reenviar estado y comandos entre el ESP32 y la página | [05](05-protocolo.md) |
| Página web | HTML, CSS y JavaScript con módulos ES, sin compilación | Panel en vivo, control manual, avisos de la alarma, reglas, umbrales, chat de voz, simulador | [06](06-pagina-web.md) |
| Servidor intermedio | Cloudflare Worker con `@anthropic-ai/sdk` | Esconder la clave, validar peticiones, llamar a Claude | [07](07-asistente-mia.md) |
| Modelo | Claude Haiku 5.5 (`claude-haiku-5-5`) | Entender al usuario y decidir qué herramientas usar | [07](07-asistente-mia.md) |

## 2.3 Flujos principales

### Estado (ESP32 → página)
1. El núcleo 0 serializa el estado cada 1 s, con el mutex tomado.
2. Lo publica en `casa/<id>/estado` (MQTT) y en la característica de estado (BLE, NOTIFY).
3. `conexion.js` lo recibe por el canal que esté activo y avisa a los suscriptores.
4. `app.js` repinta sensores, dispositivos, el aviso de la alarma y la gráfica.

### Comando (página → ESP32)
1. La interfaz o MIA llaman a `enviarComando(json)`.
2. El comando se envía por el primer canal disponible, en este orden:
   - **simulador**, si la página está en modo demo (`?demo=1`);
   - **Bluetooth**, con una cola de escrituras de una en una;
   - **MQTT**, publicando en `casa/<id>/cmd`.
3. En el ESP32, el callback copia el texto a una **cola de FreeRTOS** de 10 × 256 bytes.
4. El núcleo 1 vacía la cola con el mutex tomado, valida y aplica cada comando.
5. La página confirma con `esperar()`, que aguarda hasta 3.5 s a que el estado refleje el cambio. **El ESP32 no responde errores**: un comando rechazado se nota porque el estado no cambia.

### Alarma (ESP32 → página)
1. `leerPresencia()` registra desde cuándo el PIR detecta a alguien sin interrupción (`presenciaDesde`).
2. En automático, `automatizar()` activa la alarma cuando esa detección dura `ta` segundos (5 por defecto) e incrementa el contador `numAlarmas`.
3. El buzzer suena de forma intermitente. El estado publica `al = 1` y el nuevo valor de `na`.
4. La página detecta que `na` subió y muestra el aviso: banner, mensaje emergente, entrada en el historial y nota en el chat de MIA. Si el usuario lo permitió, también una notificación del navegador. Usar el contador evita perder avisos si la página no vio el instante exacto.
5. Se apaga sola cuando el PIR deja de detectar durante 1.5 s.
6. También se puede desactivar desde la página (`{"c":"alarma","v":0}`). En ese caso queda `as = 1` y no vuelve a sonar mientras la persona siga ahí.

### Conversación con MIA
1. El usuario escribe o habla; el reconocimiento de voz del navegador convierte la voz en texto.
2. `asistente.js` agrega al historial el bloque `<estado_casa>` y el texto del usuario.
3. Hace `POST /chat` al Worker con el historial completo y el código de acceso.
4. El Worker valida y llama a Claude con el sistema, las herramientas, el caché y el esfuerzo alto.
5. Si Claude pide herramientas, la página las ejecuta contra el ESP32, confirma cada una y vuelve al paso 3 con los resultados. Máximo 8 vueltas por turno.
6. El texto final se muestra y se lee en voz alta.

## 2.4 Decisiones de diseño

| # | Decisión | Alternativas descartadas | Motivo |
|---|---|---|---|
| A1 | Página web en lugar de app nativa | Android Studio, Flutter | El curso aceptó la página; un solo código para PC y celular |
| A2 | MQTT con broker en la nube | Servidor web en el ESP32 | Funciona desde cualquier red y la página puede estar en GitHub Pages con HTTPS |
| A3 | BLE con Web Bluetooth | Bluetooth clásico (SPP) | El navegador solo habla BLE |
| A4 | Worker intermedio para la IA | Llamar a Claude desde la página o el ESP32 | La clave no puede vivir en el navegador ni en el firmware |
| A5 | Claude decide, la página ejecuta | Ejecutar herramientas en el Worker | El Worker no tiene acceso al ESP32 por Bluetooth; la página sí tiene ambos canales |
| A6 | El ESP32 valida todo otra vez | Confiar en la IA o en la interfaz | Defensa en profundidad: es el único que conoce el estado real |
| A7 | Reglas declarativas guardadas en el ESP32 | Que la IA controle la casa continuamente | Siguen funcionando sin internet y sin gastar en la API |
| A8 | Doble núcleo: control en el 1, red en el 0 | Todo en `loop()` | Las reconexiones de WiFi bloquean; el control no debe esperar a la red |
| A9 | Cola de FreeRTOS para comandos | Ejecutar en el callback de red | Serializa los comandos y evita condiciones de carrera |
| A10 | Claves JSON cortas | Nombres descriptivos | El estado debe caber en un paquete BLE |
| A11 | Foco interior siempre manual | Encenderlo con el PIR | Decisión del equipo (30 oct): el PIR pasó a la alarma |
| A12 | Alarma decidida en el firmware | Decidirla en la página | Funciona sin red ni pantalla abierta |
| A13 | Aviso por contador `na` | Tópico MQTT de eventos | El mismo mecanismo sirve por WiFi y por Bluetooth, y no se pierde si la página se reconecta |
| A14 | Detección continua de 5 s | Sonar al primer movimiento | Evita falsas alarmas por movimientos breves |
| A15 | Alarma silenciada hasta que la persona se va | Rearmarla de inmediato | Si no, volvería a sonar enseguida con la persona presente |
| A16 | Histéresis en focos, ventilador y riego | Un solo umbral | Evita que los relés se activen y desactiven sin parar cerca del umbral |
| A17 | Buzzer con transistor 2N2222 | Directo al GPIO o en un relé | Los 4 relés están ocupados y el transistor da corriente sin cargar el GPIO |
| A18 | Riego por ciclos | Bomba encendida hasta que el sensor diga húmedo | El agua tarda en llegar al sensor; los ciclos evitan inundar la maceta |
| A19 | Base técnica detrás de la casa | Debajo de la base | Se ve desde arriba durante la presentación y se arma más fácil |

## 2.5 Modos de falla y degradación

| Falla | Qué sigue funcionando | Qué deja de funcionar |
|---|---|---|
| Sin internet | Automatización, alarma (buzzer), reglas, Bluetooth | WiFi/MQTT, MIA, hora (si nunca se sincronizó) |
| Página cerrada | Todo en el ESP32, incluida la alarma | El aviso en la página (se verá por `na` al volver a abrirla solo si el ESP32 no se reinició) |
| Broker caído | Bluetooth y todo lo local | Control por WiFi |
| Worker o API caídos | Panel completo | MIA (muestra el error en el chat) |
| DHT22 desconectado | Lo demás | Ventilador automático (temperatura "sin lectura") |
| LDR iluminado por el foco exterior | — | El foco exterior parpadea; ver la ubicación en [03](03-hardware.md) |
| ESP32 reiniciado | Recupera umbrales y reglas de la flash; arranca en automático con todo apagado | El foco interior queda apagado; el contador `na` vuelve a 0 |
