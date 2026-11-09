# 6. Página web

- Página estática en `web/`, sin compilación: HTML, CSS y módulos ES.
- Se publica en GitHub Pages con `.github/workflows/pagina.yml`, que usa `actions/checkout@v4`, `configure-pages@v5`, `upload-pages-artifact@v3` y `deploy-pages@v4`.
- Se sirve por HTTPS, requisito de Web Bluetooth, del micrófono y de las notificaciones.

## 6.1 Dependencias externas

| Recurso | Origen | Uso |
|---|---|---|
| mqtt.js 5.10.1 | `unpkg.com/mqtt@5.10.1/dist/mqtt.min.js` (global `mqtt`) | MQTT por WebSocket |
| Exo 2 y Plus Jakarta Sans | Google Fonts | Títulos y números / texto |
| `img/sala.jpg`, `img/planta.png` | En el repositorio (generadas con IA) | Fondo del escenario de MIA y planta decorativa |

La gráfica, el avatar, los sonidos y el fondo animado están hechos a mano (CSS, SVG, Canvas y Web Audio); no hay más bibliotecas.

## 6.2 Módulos

| Archivo | Responsabilidad | Exporta |
|---|---|---|
| `js/app.js` | Arranque, armado y pintado de la interfaz, escenas, buscador, notificaciones, alarma, ajustes, chat | — |
| `js/mia.js` | Avatar animado de MIA: estados, expresiones, mirada, parpadeo y nivel de voz | `crearMia` |
| `js/local.js` | Órdenes sencillas sin servidor (simulador o sin internet) traducidas a las mismas herramientas | `interpretar` |
| `js/fondo.js` | Red de partículas del fondo que reacciona al puntero y se pone roja con la alarma | `iniciarFondo` |
| `js/sonidos.js` | Efectos de sonido sintetizados con Web Audio | `sonar`, `activarSonidos` |
| `js/conexion.js` | Estado compartido `casa`, MQTT, BLE, simulador, envío y confirmación de comandos | `casa`, `suscribir`, `conectarMqtt`, `desconectarMqtt`, `conectarBle`, `desconectarBle`, `bluetoothDisponible`, `iniciarSimulador`, `enviarComando`, `esperar`, `hayDatosRecientes` |
| `js/modelo.js` | Catálogo de dispositivos, sensores, umbrales y escenas; validaciones; textos | `DISPOSITIVOS`, `DISPOSITIVOS_REGLAS`, `SENSORES`, `UMBRALES`, `ESCENAS`, `MAX_REGLAS`, `nombrePorClave`, `validarValorDispositivo`, `validarUmbral`, `formatoHora`, `textoValorDispositivo`, `textoRegla` |
| `js/asistente.js` | Historial de Claude, contexto en vivo, herramientas y ciclo de conversación | `conversar`, `nuevaConversacion`, `ejecutarAccion`, `describirAccion` |
| `js/voz.js` | Reconocimiento y síntesis de voz, nivel del micrófono | `escuchar`, `detenerEscucha`, `hablar`, `callar`, `medirMicrofono`, `reconocimientoDisponible`, `sintesisDisponible` |
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
| `luz_exterior` | `le` | Foco exterior | focoExterior | — |
| `ventilador` | `f` | Ventilador | ventilador | — |
| `bomba_riego` | `b` | Riego | gota | — |
| `alarma` | `al` | Alarma | sirena | `soloAlarma`: en automático solo se puede apagar |

- `DISPOSITIVOS_REGLAS` = `luz_exterior`, `ventilador` y `bomba_riego`.
- Textos de estado:
  - alarma: "Sonando" o "En silencio";
  - riego: "Regando" o "Apagado";
  - los demás: "Encendido" o "Apagado".

### Sensores

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

### Escenas (`ESCENAS`)

Solo existen en la página. Se aplican con las mismas herramientas de MIA (`cambiar_modo` y `controlar_dispositivo`), así que pasan las mismas validaciones. La alarma no aparece en ninguna escena.

| Escena | Modo | Dispositivos |
|---|---|---|
| Hogar | automático | — |
| Descanso | automático | foco interior apagado |
| Película | manual | focos apagados, ventilador encendido, riego apagado |
| Ahorro | manual | todo apagado |

"Nueva" abre la conversación con MIA para crear una regla.

## 6.4 Interfaz

Tema oscuro holográfico (azul marino, cristal y brillos cian) basado en `mockup_UI.jpeg`. Respeta `prefers-reduced-motion`: sin arranque animado, sin partículas en movimiento y con transiciones instantáneas.

### Encabezado

Sin marco exterior. El encabezado queda fijo arriba; la barra lateral y la columna de MIA (escenario + pie de estado) miden exactamente el alto que queda de pantalla (`--alto-app`) y también quedan fijas, así que se ven completas sin desplazarse. Solo la columna de paneles se desplaza. Dentro del escenario, los espacios se ajustan con la altura y MIA ocupa el hueco que queda (unidades de contenedor `cqh`/`cqw`).

- Logotipo de MIA y lema "Asistente de Hogar Inteligente".
- **Buscador de comandos** (Ctrl+K): busca dispositivos, escenas, modos, sensores, vistas y ajustes, y ejecuta la opción elegida. Siempre ofrece "Pedírselo a MIA".
- **Notificaciones** con contador: alarmas y cambios de conexión.
- **Mi Hogar**: punto de estado y menú con WiFi (estados `desconectado`, `conectando`, `conectado`, `sin-casa`), Bluetooth y Ajustes.

### Menú lateral

Inicio, Dispositivos, Escenas, Sensores, Historial, Automatizaciones y Ajustes. Las cuatro del medio desplazan la vista al panel y lo resaltan; Automatizaciones cambia la columna derecha.

### Escenario de MIA (siempre visible en escritorio)

- Saludo "Hola, soy MIA" sobre la foto de la sala, con olas animadas.
- Avatar de MIA (ver 6.4.1). Al tocarlo, escucha.
- Subtítulo que escribe letra por letra lo que dice MIA o, en cursiva, lo que dice el usuario, y burbujas con las acciones confirmadas.
- Sugerencias: "Encender la luz", "Activar una escena" y "Ver la temperatura".
- Micrófono con ondas que siguen el volumen real, botón "Presiona para hablar" y botón de teclado que abre la conversación.
- **Aviso de la alarma** arriba del escenario:

  | Situación | Título | Botón |
  |---|---|---|
  | `al = 1` | "¡Persona detectada! La alarma está sonando" | **Desactivar alarma**: herramienta `silenciar_alarma` |
  | `al = 0` y `as = 1` | "Alarma silenciada" | Ninguno |

  Mientras suena, toda la página se tiñe de rojo (viñeta, fondo y partículas) y MIA pasa a `alerta`.

#### 6.4.1 Avatar de MIA (`mia.js`)

Esfera de cristal con cara (ojos y boca SVG que se interpolan cuadro a cuadro), anillo orbital, base holográfica, aro de HUD y halo. Sigue al puntero con la mirada, se inclina en 3D y parpadea sola.

| Estado | Cuándo | Expresión y movimiento |
|---|---|---|
| `reposo` | Esperando | Ojos felices, flota |
| `escuchando` | Micrófono abierto | Ojos abiertos, ondas "((( )))", crece con el volumen |
| `pensando` | Esperando a Claude | Mira arriba de lado a lado, el anillo gira con una luna |
| `hablando` | Respondiendo | Boca que se mueve con cada palabra, barras de voz |
| `ejecutando` | Aplicando herramientas o escenas | Aro punteado girando, mirada concentrada |
| `exito` | Acción confirmada | Sonrisa grande, mejillas y destellos (verde) |
| `error` | Acción fallida | Ojos tristes, se sacude (ámbar) |
| `alerta` | Alarma sonando | Ojos muy abiertos, boca en "O", pulsos rojos |
| `dormida` | 75 s sin actividad | Ojos cerrados, "z z Z"; despierta con un guiño |
| `curiosa`, `guino`, `cosquillas` | Al pasar el puntero, al despertar, al saludar | Reacciones cortas |

`exito`, `error` y las reacciones cortas duran 1-2 s y vuelven solas al estado base.

### Columna de paneles (vista Inicio)

1. **Dispositivos del Hogar:** selector Auto / Manual y 5 tarjetas.
   - Foco interior: interruptor en cualquier modo.
   - Foco exterior, ventilador y riego: en automático muestran un candado; al tocarlos se ofrece "Pasar a manual".
   - Alarma: "Vigilando" / "¡Sonando!" / "Silenciada" / "En manual"; botón **Silenciar** solo mientras suena.
   - El ventilador gira, el riego gotea y los focos brillan al estar encendidos.
2. **Escenas Inteligentes:** las 4 escenas y "Nueva". La escena aplicada queda marcada mientras el estado coincida.
3. **Sensores del Hogar:** movimiento (verde, ámbar con persona, rojo con alarma), temperatura (resaltada si `t ≥ tmax`), humedad del aire, humedad del suelo y luz con barra, y hora del ESP32. Los números se animan. En modo demo, botón **"Simular una persona"**.
4. **Estado de la ESP32:** WiFi (o "Simulador"), Bluetooth (tocar para conectar), ESP32 con su hora y "Funcionando correctamente" / "Sin datos recientes". Píldora "En línea / Conectando / Sin conexión".
5. **Historial de Sensores:** selector de sensor, valor actual con la tendencia del último minuto y 7 barras con el promedio de cada 10 s. (El mockup mostraba consumo en kWh, pero la maqueta no tiene medidor de energía.)

### Vista Automatizaciones

- **Reglas personalizadas:** id, texto y botón para borrar; botón "Crear con MIA".
- **Umbrales:** deslizadores con el valor al lado. Solo se envían los que cambiaron, confirmando cada uno. No se sobrescriben mientras el usuario edita.
- **Alertas de la alarma:** últimas 10 de esta visita y la opción de notificaciones del navegador (pide permiso; si se niega, se desmarca y avisa).

### Conversación (panel lateral)

- MIA pequeña que copia el estado de la principal.
- Chat con cinco tipos de mensaje: usuario, asistente, acción (✓ o ⚠), nota y error; puntos animados mientras piensa.
- Micrófono, campo de texto y enviar. Opciones "Responder con voz" (activada) y "Conversación continua".
- Botón de nueva conversación.

### Aviso de una alarma nueva (`revisarNuevaAlarma`)

1. Al recibir el primer estado se guarda `na` sin avisar.
2. Cuando `na` sube:
   - agrega una entrada al historial ("Persona detectada: la alarma se activó", con la hora) y una notificación;
   - muestra un mensaje emergente rojo con el botón "Silenciar" y suena un aviso;
   - agrega una nota en el chat y MIA lo dice en el subtítulo;
   - si la opción está activa y hay permiso, muestra una notificación del navegador "MIA: alarma activada".
3. Si `na` baja (el ESP32 se reinició), solo se actualiza el valor guardado.

### Ajustes (`<dialog>`)

| Campo | Ejemplo |
|---|---|
| `mqttUrl` | `wss://xxxx.ala.us-east-1.emqxsl.com:8084/mqtt` |
| `mqttUsuario`, `mqttClave` | `web-casa` |
| `idCasa` | `casa01` |
| `servidorUrl` | `https://casa-ia-asistente.<cuenta>.workers.dev` |
| `codigoAcceso` | Frase secreta del equipo |

- Se guardan en `localStorage["casaIA.ajustes"]`, dentro de try/catch.
- Preferencias (voz, conversación continua, efectos de sonido, animación de inicio) en `localStorage["casaIA.preferencias"]`.
- Al guardar: reconecta MQTT y reinicia la conversación.

### MIA sin servidor

Si `servidorUrl` está vacío, `local.js` entiende órdenes sencillas: encender o apagar dispositivos (pasa a manual si hace falta), modos, escenas, silenciar la alarma y preguntas por temperatura, humedad, luz, hora o el estado general. Usa las mismas herramientas y validaciones. Con servidor configurado, todo va a Claude.

### Atajos

| Tecla | Acción |
|---|---|
| Ctrl+K | Buscador de comandos |
| M | Hablar con MIA |
| Esc | Cerrar conversación, menús y desplegables |

### Diseño adaptable

| Ancho | Distribución |
|---|---|
| > 1360 px | Menú, escenario de MIA fijo y columna de paneles |
| ≤ 1360 px | Sin lema |
| ≤ 1180 px | Menú a la izquierda; escenario arriba (alto de pantalla, máximo 760 px) y paneles en 2 columnas debajo |
| ≤ 860 px | Paneles en 1 columna; dispositivos y escenas en 3 columnas |
| ≤ 760 px | Celular: el escenario ocupa la pantalla entre el encabezado y las pestañas; menú hamburguesa, buscador desplegable, accesos rápidos (Luces, Alarma, Clima, Escenas), pestañas inferiores (Inicio, Dispositivos, Escenas, Sensores, Ajustes), conversación como hoja inferior |

**Modo ligero en celulares y tabletas** (≤ 760 px o pantalla táctil). En Chrome de Android, el vidrio desenfocado sobre el fondo animado agotaba la memoria gráfica: la pantalla parpadeaba en negro y quedaban rectángulos sin dibujar (9 nov 2026). En estos dispositivos:
- no se usa `backdrop-filter`: la cabecera, las pestañas y los avisos tienen fondo opaco;
- el fondo de partículas dibuja a 1× con 50 partículas como máximo;
- el lienzo solo se rehace si cambia el ancho, no cuando la barra de direcciones cambia la altura al deslizar;
- se quita el destello que recorre el borde de los paneles;
- los íconos que se redibujan con los datos del ESP32 (dispositivos, paneles, escenas, conexión) y el logo no usan `filter: drop-shadow`: en Chrome de Android se pintaba como un rectángulo negro fijo sobre el foco encendido;
- paneles y tarjetas usan colores sólidos, sin degradados, sombras ni el brillo que sigue al dedo: las capas semitransparentes sobre el fondo animado se dibujaban con bloques de otro tono.

## 6.5 Ciclo de vida

1. `iniciar()` arma la interfaz, crea a MIA y el fondo, pinta el estado inicial y saluda.
2. Animación de arranque (una vez por sesión, se puede saltar y desactivar en Ajustes) y entrada escalonada de los paneles.
3. Se suscribe a los eventos de `casa`. Con cada estado: sensores, dispositivos, escenas, aviso, `revisarNuevaAlarma()`, historial y ESP32.
4. Cada 1 s repinta la frescura, los dispositivos y el aviso.
5. Conexión inicial:
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
| Reconocimiento | `SpeechRecognition` / `webkitSpeechRecognition`. Idioma `es-GT`; si no está disponible, `es-MX` y después `es-ES`. Resultados parciales; una frase por vez. El texto se recalcula con todos los resultados (en Android el final puede llegar repetido) y, si termina sin resultado final, se usa el último parcial. |
| Errores | `not-allowed` → "Permite el uso del micrófono…". Se ignoran `no-speech` y `aborted`. |
| Síntesis | `speechSynthesis` a velocidad 1.05. Prefiere voces "Google", "Natural" u "Online", de español latinoamericano y femeninas. |
| Cola | Las respuestas se leen en orden; un mensaje nuevo calla la voz anterior. |
| Nivel del micrófono | En computadora, `medirMicrofono` usa `getUserMedia` y un `AnalyserNode` para que MIA y las ondas sigan el volumen. **En celulares y tabletas no se usa:** el micrófono no se comparte y el reconocimiento recibía silencio (9 nov 2026). Ahí MIA se anima con cada texto parcial reconocido. |
| Boca de MIA | `hablar(texto, alPalabra)` llama a `alPalabra` en cada evento `boundary` de la síntesis. |
| Compatibilidad | Probado en Chrome y Edge en PC y Android. Si no hay reconocimiento, el micrófono lo avisa y ofrece escribir. |

## 6.8 Errores visibles

| Situación | Mensaje |
|---|---|
| Comando sin conexión | "La casa no está conectada. Conéctala por WiFi o Bluetooth." |
| Navegador sin Bluetooth | "Este navegador no soporta Bluetooth. Usa Chrome o Edge." |
| El ESP32 no confirmó un umbral | "El ESP32 no aceptó: <umbral>" |
| Notificaciones no permitidas | "El navegador no dio permiso para mostrar notificaciones." |
| Error de MIA | Mensaje de error en el chat |
