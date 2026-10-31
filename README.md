# Casa inteligente con asistente virtual (Aurora)

Proyecto final de **Arquitectura del Computador** (Universidad Rafael Landívar).

Es una maqueta de casa controlada por un **ESP32**. Funciona sola con sus sensores y se controla desde una **página web** (PC y celular) por **WiFi** y **Bluetooth**. También tiene una asistente virtual, **Aurora**, hecha con la API de Claude, a la que se le habla por **texto o voz**.

```
                         ┌──────────────────────────────┐
                         │  Página web (GitHub Pages)   │
                         │  PC y celular · texto y voz  │
                         └──┬─────────────┬──────────┬──┘
              Bluetooth BLE │    WiFi     │          │ HTTPS
           (sin internet)   │  (MQTT/WSS) │          ▼
                            │             │   ┌───────────────────┐
                            │             ▼   │ Servidor intermedio│
                            │   ┌───────────┐ │ (Cloudflare Worker)│
                            │   │ HiveMQ    │ │ guarda la clave    │
                            │   │ Cloud     │ └─────────┬─────────┘
                            │   └─────┬─────┘           │
                            ▼         ▼ MQTT/TLS        ▼
                         ┌──────────────────┐   ┌──────────────┐
                         │      ESP32       │   │ API de Claude│
                         │ sensores + reles │   │ (Opus 5.5)   │
                         └──────────────────┘   └──────────────┘
```

**Cómo trabaja la asistente:** Claude decide *qué* hacer (por ejemplo "encender el foco de la sala y desactivar la alarma"). La página web ejecuta esas acciones en el ESP32 y le devuelve el resultado. Claude nunca toca el hardware directamente, y el ESP32 vuelve a validar cada orden.

---

## Cómo cumple cada requisito

| Requisito del documento | Cómo se cumple |
|---|---|
| Plataforma en PC | Página web (`web/`) |
| App en celular | La misma página, adaptada a celular (pestañas Casa / Aurora) |
| Conexión WiFi | ESP32 ↔ HiveMQ Cloud (MQTT con TLS) ↔ página |
| Conexión Bluetooth | ESP32 (BLE) ↔ página con Web Bluetooth, sin internet |
| Automatización autónoma | El ESP32 decide solo en modo **Automático**, aunque no haya internet |
| Modo de control personalizado | Modo **Manual** desde PC y celular, botones o voz |
| Visualización en tiempo real | Sensores cada segundo, estado de cada actuador y gráfica de 5 minutos |
| Sensores y actuadores (sin LEDs) | 5 sensores; relés con 2 focos de 12 V, ventilador y bomba, y un buzzer |
| Domótica: 5 dispositivos | Ver la tabla siguiente |
| Idea innovadora | Asistente con IA por voz que **crea reglas nuevas** que el ESP32 ejecuta sin internet, y alarma de presencia con aviso en la página |

| # | Dispositivo | Cómo funciona | Sensor → Actuador |
|---|---|---|---|
| 1 | Foco interior | Solo se enciende y apaga desde la página (en cualquier modo) | — → relé 1 + foco LED de 12 V |
| 2 | Foco exterior | Se enciende cuando no hay luz y se apaga cuando vuelve la luz | LDR → relé 4 + foco LED de 12 V |
| 3 | Riego | Riega cuando la tierra está seca y para cuando está húmeda | Sensor de humedad resistivo → relé 3 + bomba de 5 V |
| 4 | Ventilador | Se enciende cuando sube la temperatura y se apaga cuando baja | DHT22 → relé 2 + ventilador de 5 V |
| 5 | Alarma | Si el PIR detecta a una persona **5 s seguidos**, suena el buzzer y la página recibe un aviso. Se apaga cuando ya no detecta a nadie o desde la página. | PIR HC-SR501 → buzzer activo (con transistor) |

La **maqueta 3D** del proyecto muestra dónde va cada pieza y cada cable de pin a pin, con 12 pasos de armado.

---

## Lista de componentes

| Cantidad | Componente | Uso |
|---|---|---|
| 1 | ESP32-WROOM-32 DevKit de 38 pines | Cerebro del sistema |
| 1 | Sensor de movimiento PIR HC-SR501 | Alarma de presencia |
| 1 | Sensor DHT22 en módulo de 3 pines | Temperatura y humedad |
| 1 | Sensor de humedad de suelo resistivo con placa LM393 | Riego |
| 1 | Fotorresistencia LDR + resistencia de 10 kΩ | Luz de afuera |
| 1 | Módulo de 4 relés de 5 V con optoacoplador | Los 2 focos, el ventilador y la bomba |
| 2 | Focos LED de 12 V con portalámparas | Foco interior y foco exterior |
| 1 | Ventilador de 5 V | Clima |
| 1 | Mini bomba sumergible de 5 V + manguera + recipiente | Riego |
| 1 | Buzzer activo + transistor 2N2222 + resistencia de 1 kΩ | Alarma |
| 1 | Adaptador de 12 V 2 A + jack DC hembra | Fuente de todo el proyecto |
| 1 | Módulo MB102 + plug DC macho | 3.3 V y 5 V para sensores, relés, PIR y buzzer |
| 1 | Reductor LM2596 ajustado a 5.0 V + capacitor de 470 µF 16 V | 5 V para el ventilador y la bomba |
| — | Protoboard de 830 puntos, 6 borneras, cables Dupont, cable 22 AWG | Montaje |

> Los LEDs no cuentan como actuadores, por eso las luces son **focos controlados por relés**.

---

## Conexiones

**Importante:** todas las tierras (GND) van unidas. La bomba, el ventilador y los focos **nunca** se alimentan desde los pines del ESP32.

**Alimentación:**
- El adaptador de 12 V entra al jack hembra, que reparte a 3 buses de la protoboard (2 borneras por bus): **12 V**, **GND** y **5 V motores**.
- El MB102 recibe 12 V por su plug y da **3.3 V** al riel de atrás y **5 V** al riel de adelante.
- El LM2596 baja los 12 V a 5.0 V para el ventilador y la bomba. Su OUT− es la tierra de esos motores.

| Componente | Pin del componente | Conectar a |
|---|---|---|
| PIR HC-SR501 (jumper en **H**) | VCC / OUT / GND | Riel 5 V / **GPIO 27** / GND |
| DHT22 | + / out / − | Riel 3.3 V / **GPIO 4** / GND |
| Sensor de suelo (placa LM393) | VCC / AO / GND | **GPIO 32** (se enciende solo al medir) / **GPIO 34** / GND |
| LDR | Una pata a 3.3 V; la otra a **GPIO 35** y, con la resistencia de 10 kΩ, a GND | — |
| Módulo de relés | VCC / JD-VCC / GND (**quitar el jumper**) | Riel 3.3 V / riel 5 V / GND |
| Relé 1 (foco interior) | IN1 · COM · NO | **GPIO 26** · Bus 12 V · + del foco interior |
| Relé 2 (ventilador) | IN2 · COM · NO | **GPIO 25** · Bus 5 V motores · + del ventilador |
| Relé 3 (bomba) | IN3 · COM · NO | **GPIO 33** · Bus 5 V motores · + de la bomba |
| Relé 4 (foco exterior) | IN4 · COM · NO | **GPIO 23** · puente desde COM1 · + del foco exterior |
| Buzzer activo | pata larga / pata corta | Riel 5 V / colector del 2N2222 |
| Transistor 2N2222 | base / emisor | **GPIO 18** con resistencia de 1 kΩ / GND |

Notas:
- Los sensores analógicos usan los pines **34 y 35 (ADC1)**: los pines ADC2 dejan de funcionar cuando el WiFi está encendido.
- No usen los pines 0, 2, 5, 12 ni 15: afectan el arranque del ESP32.
- Si sus relés se activan con nivel ALTO, cambien `RELE_ACTIVO_BAJO` a `false` en `firmware/casa_inteligente/config.h`.
- El PIR debe tener el jumper en **H** (repetición) para que su salida siga en alto mientras la persona se mueve; si no, la alarma no llega a los 5 s.
- Pongan el **LDR lejos del foco exterior** (el foco en un lado de la casa y el LDR en el techo del otro lado). Si el foco ilumina el LDR, se encenderá y apagará sin parar.

---

## Instalación paso a paso

### 1. Servidor MQTT (HiveMQ Cloud, gratis)
1. Creen una cuenta en hivemq.com/cloud y un clúster **Serverless** gratuito.
2. En **Access Management** creen dos usuarios con permiso de publicar y suscribirse: uno para el ESP32 (`esp32-casa`) y otro para la página (`web-casa`).
3. Anoten el **host** del clúster (`xxxx.s1.eu.hivemq.cloud`). El ESP32 usa el puerto **8883** y la página `wss://HOST:8884/mqtt`.

### 2. Firmware del ESP32 (Arduino IDE)
1. En **Gestor de placas** instalen **esp32 de Espressif, versión 3.x**.
2. En **Gestor de bibliotecas** instalen: **PubSubClient** (Nick O'Leary), **ArduinoJson 7.x**, **DHT sensor library** (Adafruit) con **Adafruit Unified Sensor**, y **NimBLE-Arduino 2.x** (h2zero).
3. Copien `firmware/casa_inteligente/secrets.h.example` como `secrets.h` y llenen su WiFi y los datos de HiveMQ.
4. En **Herramientas**: placa **ESP32 Dev Module** y **Partition Scheme: Huge APP (3MB No OTA/1MB SPIFFS)**. Usar WiFi y Bluetooth al mismo tiempo no cabe en la partición normal.
5. Suban el programa y abran el **Monitor Serie a 115200**.
6. **Calibren el sensor de suelo:** pongan `DEPURAR_SENSORES` en `1` dentro de `config.h`, anoten la lectura cruda con la sonda en el aire y dentro de un vaso con agua, y pónganlas en `SUELO_SECO` y `SUELO_MOJADO`. Después regresen `DEPURAR_SENSORES` a `0`.

### 3. Clave de la API de Claude
1. En **platform.claude.com** creen una cuenta, compren créditos prepagados y generen una **API key**.
2. **Nunca** la pongan en la página ni en el ESP32: solo va en el servidor intermedio (paso 4).

### 4. Servidor intermedio (Cloudflare Workers, gratis)
```bash
cd servidor
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put CODIGO_ACCESO
npx wrangler deploy
```
- `CODIGO_ACCESO` es una frase secreta del equipo; la página la pide para poder usar la asistente.
- Al final, Wrangler muestra la dirección del servidor (`https://casa-ia-asistente.SU-CUENTA.workers.dev`).
- Cuando la página esté publicada (paso 5), cambien `ORIGEN_PERMITIDO` en `servidor/wrangler.toml` por la dirección de la página y vuelvan a ejecutar `npx wrangler deploy`.
- Para probar en su PC: copien `.dev.vars.example` como `.dev.vars` y ejecuten `npm run dev`. Si npm avisa sobre *install scripts*, ejecuten `npm install-scripts approve esbuild workerd`.

### 5. Página web (GitHub Pages)
1. Suban este proyecto a un repositorio de GitHub.
2. En **Settings → Pages → Source**, elijan **GitHub Actions**. El archivo `.github/workflows/pagina.yml` publica la carpeta `web/` en cada cambio.
3. Abran la página en **Chrome o Edge** (en PC o Android), toquen **Ajustes** y llenen: el servidor MQTT, el usuario `web-casa`, el ID de la casa (`casa01`), la dirección del servidor intermedio y el código de acceso. Los ajustes se guardan solo en ese navegador.

### Probar sin hardware
Agreguen `?demo=1` a la dirección (por ejemplo `https://SU-USUARIO.github.io/SU-REPO/?demo=1`). La casa se simula dentro del navegador, así que pueden probar el panel y la asistente antes de armar la maqueta. El botón **Simular una persona** simula al PIR detectando a alguien durante 12 segundos para probar la alarma. En su PC también pueden servir la carpeta con `python -m http.server 8080 --directory web` y abrir `http://localhost:8080/?demo=1`.

---

## Cómo se usa

- **Automático / Manual** (arriba): en automático la casa decide sola; en manual se controla cada dispositivo.
- **WiFi / Bluetooth** (arriba): el punto verde indica conexión. Bluetooth se conecta tocando el botón; funciona sin internet.
- **Alarma**: si el PIR detecta a alguien 5 segundos seguidos aparece un aviso rojo arriba, un mensaje emergente y una entrada en **Alertas de la alarma**; también puede llegar una notificación del navegador si la activan. Se desactiva con su botón, con el interruptor o pidiéndoselo a Aurora.
- **Foco interior**: se controla con su interruptor en cualquier modo; no tiene automatización.
- **Aurora**: escriban o toquen el micrófono. Con **Conversación continua** activada, Aurora vuelve a escuchar después de responder.
- Ejemplos para Aurora:
  - "¿Cómo está la casa?"
  - "Enciende el foco de la sala"
  - "Activa el modo noche" (Aurora elige varias acciones a la vez)
  - "Después de las 10 de la noche apaga el foco de afuera" (crea una regla que el ESP32 guarda en su memoria)
  - "Enciende el ventilador desde los 26 grados"
  - "Que la alarma suene a los 8 segundos"
  - "Desactiva la alarma"

**Reglas personalizadas:** tienen la forma *si sensor operador valor entonces dispositivo = valor*. Se guardan en la memoria flash del ESP32 (máximo 6), funcionan en modo automático y siguen funcionando **sin internet**.

---

## Seguridad

- **Clave de la API:** solo vive en Cloudflare como secreto.
- **Servidor intermedio:** solo acepta peticiones con el código de acceso y desde la dirección de la página. Además, rechaza conversaciones con un formato extraño o demasiado largas.
- **Acciones de la IA:** Claude solo puede usar 7 acciones definidas, con argumentos validados por esquema (*strict tool use*). La página vuelve a validar los rangos y el ESP32 los valida una tercera vez.
- **Límites en el firmware**, aunque la orden venga de la IA o de un botón:
  - el foco interior y la alarma no se pueden usar en reglas;
  - la bomba se apaga sola a los 60 s y descansa 1 minuto;
  - los umbrales fuera de rango se rechazan.
- **Si falla un filtro de seguridad:** el servidor activa el respaldo automático de modelo (`fallbacks: "default"`). Si un filtro de Claude rechaza una petición normal por error, se reintenta con el modelo recomendado.
- **Demo:** para simplificar, el ESP32 no verifica el certificado del broker (`setInsecure()` en el firmware). Para más seguridad, carguen el certificado raíz con `setCACert()`.

## Costo aproximado de la IA

Aurora usa **Claude Opus 5.5** ($4 por millón de tokens de entrada y $20 por millón de salida) con esfuerzo bajo para responder rápido. Las instrucciones y la conversación se guardan en caché, así que cada mensaje cuesta aproximadamente **1 a 3 centavos de dólar**. Con unos pocos dólares de crédito alcanza para el desarrollo y la presentación.

---

## Guion sugerido para la presentación

1. **Autonomía:**
   - tapen el LDR: se enciende el foco exterior; al destaparlo se apaga;
   - calienten el DHT22 con la mano o una secadora: arranca el ventilador;
   - saquen la sonda de la tierra: riega la maceta;
   - párense frente al PIR y muévanse 5 segundos: suena la alarma y la página muestra el aviso; al alejarse se apaga.
2. **Control manual desde la PC:** cambien a Manual y muevan los dispositivos; la gráfica y los sensores se actualizan en vivo.
3. **Celular por Bluetooth:** apaguen el WiFi del celular, conéctense por Bluetooth y controlen la casa. Así se demuestran las dos conexiones.
4. **Aurora por voz:**
   - "¿Cómo está la casa?";
   - "Enciende el foco de la sala";
   - "Después de las 10 de la noche apaga el foco de afuera".
5. **Sin internet:** desconecten el internet, tapen el LDR y muestren que el foco exterior y las reglas siguen funcionando en el ESP32.

## Temas de Arquitectura del Computador que pueden explicar

- **Doble núcleo:**
  - el núcleo 1 ejecuta el control en tiempo real;
  - el núcleo 0 maneja WiFi y MQTT (`xTaskCreatePinnedToCore`).
- **Sistema operativo en tiempo real (FreeRTOS):**
  - una **cola** recibe los comandos de WiFi y Bluetooth (`xQueueSend` / `xQueueReceive`);
  - un **mutex** protege el estado compartido entre núcleos.
- **Interrupciones:** el sensor PIR usa una rutina de interrupción guardada en la RAM interna (`IRAM_ATTR`).
- **Periféricos:**
  - **ADC** de 12 bits (y por qué solo ADC1 funciona con WiFi);
  - GPIO para los relés, el transistor del buzzer y para encender el sensor de suelo solo al medir;
  - temporizadores con `millis()` para contar los 5 s de presencia sin bloquear el programa;
  - histéresis para que los focos, el ventilador y la bomba no se enciendan y apaguen sin parar.
- **Memoria:**
  - **flash** (NVS / `Preferences`) para guardar reglas y umbrales;
  - esquema de particiones;
  - **RAM** limitada (por eso el JSON usa claves cortas).
- **Comunicaciones:** pila **BLE (GATT)**, **TLS** sobre WiFi, protocolo **MQTT** de publicación y suscripción.

## Estructura del proyecto

```
firmware/casa_inteligente/   Programa del ESP32 (Arduino)
  casa_inteligente.ino         lógica, comunicaciones y tareas
  config.h                     pines, umbrales y límites
  secrets.h.example            plantilla para WiFi y MQTT
servidor/                    Servidor intermedio con la API de Claude (Cloudflare Worker)
  src/index.js                 recibe la conversación y llama a Claude
  src/asistente.js             personalidad de Aurora y sus herramientas
web/                         Página web (PC y celular)
  index.html, estilos.css
  js/conexion.js               WiFi (MQTT) y Bluetooth
  js/asistente.js              conversación con Claude y ejecución de acciones
  js/voz.js                    reconocimiento y síntesis de voz
  js/simulador.js              casa simulada (?demo=1)
```

## Protocolo de mensajes (ESP32)

Tópicos MQTT: `casa/casa01/estado`, `casa/casa01/config` (retenido), `casa/casa01/online` (retenido) y `casa/casa01/cmd`. Por Bluetooth se usan las mismas cadenas JSON (los UUID están en `config.h`).

```jsonc
// Estado (cada segundo). li/le/f/b/al = foco interior, foco exterior, ventilador, bomba, alarma; as = alarma silenciada; na = número de alarmas
{"t":24.5,"h":60,"s":45,"l":70,"p":1,"hm":2215,"m":"A","li":1,"le":0,"f":0,"b":0,"al":1,"as":0,"na":3}
// Comandos
{"c":"modo","v":"M"}
{"c":"set","d":"li","v":1}      // el foco interior funciona en cualquier modo
{"c":"cfg","k":"ta","v":5}
{"c":"regla+","r":{"i":"r1","s":"hm","o":">","x":2200,"d":"le","v":0}}
{"c":"regla-","i":"r1"}
{"c":"alarma","v":0}            // desactivar la alarma
```
