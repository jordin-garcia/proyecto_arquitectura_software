# CLAUDE.md

Guía para trabajar en este repositorio. Las especificaciones completas están en [`specs/`](specs/README.md); léelas antes de cambiar el comportamiento de la casa.

## Qué es

Casa inteligente en maqueta para el proyecto final de **Arquitectura del Computador** (Ingeniería en Sistemas, Universidad Rafael Landívar). Un **ESP32-WROOM-32** controla 5 dispositivos con sensores. Se maneja desde una **página web** (PC y celular) por **WiFi (MQTT)** y **Bluetooth (BLE)**, y tiene una asistente por texto y voz, **MIA**, hecha con la API de Claude a través de un **Cloudflare Worker**.

Los 5 dispositivos:

- foco interior de 120 V (por relé), que solo se controla desde la página;
- foco exterior de 120 V (por relé), que se enciende con el LDR cuando no hay luz;
- riego, con sensor de suelo y bomba de 5 V;
- ventilador de 5 V, con el DHT22;
- alarma: el PIR detecta a una persona 5 s seguidos, suena el buzzer y la página recibe un aviso.

## Estructura

```
firmware/casa_inteligente/   ESP32 (Arduino, núcleo esp32 3.x)
  casa_inteligente.ino         lógica, FreeRTOS, MQTT, BLE
  config.h                     pines, umbrales, límites y UUID
  secrets.h.example            plantilla; secrets.h está en .gitignore
servidor/                    Cloudflare Worker (POST /chat → API de Claude)
  src/index.js                 validación, CORS, código de acceso, llamada al modelo
  src/asistente.js             prompt de sistema de MIA y esquemas de herramientas
web/                         Página estática (GitHub Pages), módulos ES sin build
  index.html, estilos.css
  js/app.js                    interfaz
  js/conexion.js               MQTT (mqtt.js) y Web Bluetooth
  js/asistente.js              ciclo de herramientas de Claude
  js/modelo.js                 dispositivos, sensores, umbrales y validaciones
  js/simulador.js              ESP32 simulado (?demo=1)
  js/mia.js                    avatar animado de MIA (estados y expresiones)
  js/local.js                  órdenes sencillas sin servidor
  js/fondo.js, js/sonidos.js   fondo de partículas y efectos de sonido
  img/                         foto de la sala y planta
  js/voz.js, js/iconos.js
specs/                       Especificaciones del proyecto
.github/workflows/pagina.yml Publica web/ en GitHub Pages
```

## Comandos

Compilar el firmware (el CLI viene con el Arduino IDE). Necesita `secrets.h`; para solo compilar, copien `secrets.h.example` como `secrets.h` en una copia temporal de la carpeta:

```bash
"/c/Program Files/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe" compile --config-file "$HOME/.arduinoIDE/arduino-cli.yaml" --fqbn esp32:esp32:esp32:PartitionScheme=huge_app --warnings default firmware/casa_inteligente
```

La primera compilación tarda varios minutos. No lancen dos a la vez sobre la misma carpeta.

Página web local con la casa simulada (configuración `web` de `.claude/launch.json`):

```bash
python -m http.server 8080 --directory web
```

Abrir `http://localhost:8080/?demo=1`. El botón "Simular una persona" prueba la alarma.

Servidor de MIA:

```bash
cd servidor && npm install && npm run dev
```

`npm run deploy` para publicar. Los secretos (`ANTHROPIC_API_KEY`, `CODIGO_ACCESO`) se cargan con `npx wrangler secret put`.

Revisar sintaxis de JavaScript:

```bash
for f in web/js/*.js servidor/src/*.js; do node --check "$f"; done
```

## Reglas del proyecto

- **Una sola fuente de verdad por dato, copiada en varios lugares.** Si cambian un pin, un dispositivo, una clave JSON o un rango, actualicen todos estos:
  - `config.h` y el `.ino` (firmware);
  - `web/js/modelo.js` y `web/js/simulador.js`;
  - `servidor/src/asistente.js` (prompt y esquemas);
  - `README.md` y `specs/`;
  - la maqueta 3D, si cambia el cableado.
- **Validación en tres capas:** esquemas `strict` de las herramientas, `modelo.js` en la página y `aplicarUmbral()` / `reglaDesdeJson()` en el ESP32. El ESP32 es la autoridad final.
- **Reglas de los dispositivos especiales** (firmware, página y MIA):
  - el foco interior (`li`) se controla desde la página en cualquier modo y no tiene automatización;
  - la alarma (`al`) solo la enciende el PIR en modo automático y se puede apagar en cualquier modo;
  - ninguno de los dos se puede usar en reglas;
  - la bomba tiene límites de tiempo en `aplicarSeguridad()`.
- **Protocolo con claves cortas:** el JSON de estado debe caber en un paquete BLE (MTU 247). No agreguen campos largos.
- **Solo ADC1 (GPIO 32-39)** para lecturas analógicas: ADC2 no funciona con el WiFi encendido. No usen los pines de arranque 0, 2, 5, 12 ni 15.
- **El loop no se bloquea:** nada de `delay()` en el núcleo 1; usen temporizadores con `millis()`. El estado compartido entre núcleos se toca solo con el `mutex` tomado.
- **Historial de Claude solo crece:** en `web/js/asistente.js` nunca se editan mensajes anteriores. Las respuestas del asistente se guardan completas, incluidos los bloques internos. Si un turno falla, se recorta hasta su inicio.
- **Secretos:** la clave de la API solo existe en Cloudflare. `secrets.h` y `servidor/.dev.vars` nunca se suben.
- **Idioma:** código, comentarios, textos de la interfaz y documentación en español. Los comentarios del firmware van sin tildes por compatibilidad.
- **Bibliotecas del firmware:**
  - PubSubClient 2.8;
  - ArduinoJson 7.x (usar `JsonDocument`, `is<T>()` y `as<JsonObjectConst>()`);
  - DHT sensor library;
  - NimBLE-Arduino 2.x, con callbacks que reciben `NimBLEConnInfo&`; los servicios no se inician a mano.
- **Partición "Huge APP":** obligatoria; WiFi y BLE juntos no caben en la partición normal.

## Cómo verificar un cambio

1. `node --check` sobre los archivos de JavaScript tocados.
2. Probar la página con `?demo=1`:
   - si el cambio afecta al protocolo, actualicen también `simulador.js`;
   - para MIA sin servidor real, simulen `fetch` con respuestas `tool_use`.
3. Compilar el firmware sin advertencias.
4. Si cambia el hardware: actualicen [`specs/03-hardware.md`](specs/03-hardware.md) y la maqueta 3D.

## Referencias

- Lineamientos del curso: `Proyecto-Evaluacion Final.docx`.
- Maqueta 3D interactiva con cada cable de pin a pin: https://claude.ai/artifact/YVD5HeXeccF4JXbPQwJwjb
- Lista de compras: `Lista_de_compras_Casa_IA.pdf` (lo que falta comprar).
