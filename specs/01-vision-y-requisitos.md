# 1. Visión y requisitos

## 1.1 Objetivo

Construir una maqueta de casa inteligente controlada por un ESP32 que:

1. funcione sola con sus sensores (modo automático), aun sin internet;
2. se pueda controlar a mano desde una PC y desde un celular, por WiFi y por Bluetooth;
3. muestre en tiempo real lo que miden los sensores y lo que hacen los actuadores;
4. avise en la página cuando la alarma detecta a una persona;
5. tenga una asistente virtual, **MIA**, con la que se conversa por texto y por voz, que entiende la casa, la controla y le enseña reglas nuevas.

## 1.2 Público y contexto

- **Usuarios:** el equipo del proyecto y el catedrático durante la presentación presencial.
- **Uso:** demostración en un salón de clase. La maqueta está sobre una mesa y se muestra desde una laptop conectada a un proyector y desde un celular.
- **Restricciones:**
  - presupuesto de estudiante;
  - componentes que se consiguen en tiendas de electrónica de Guatemala;
  - el ESP32 es un modelo fijo: ESP32-WROOM-32 de 38 pines con USB-C.

## 1.3 Requisitos del curso y cómo se cumplen

Fuente: `Proyecto-Evaluacion Final.docx`.

| # | Requisito | Cómo se cumple | Dónde se verifica |
|---|---|---|---|
| R1 | Plataforma en PC | Página web en `web/`, publicada en GitHub Pages | [06](06-pagina-web.md) |
| R2 | Aplicación en el celular | La misma página, adaptada a pantallas angostas con pestañas inferiores y accesos rápidos. No hay app nativa. | [06](06-pagina-web.md) |
| R3 | Conexión WiFi | ESP32 ↔ EMQX Cloud Serverless (MQTT con TLS, puerto 8883) ↔ página (MQTT por WebSocket seguro, puerto 8084) | [05](05-protocolo.md) |
| R4 | Conexión Bluetooth | ESP32 (servidor BLE GATT) ↔ página (Web Bluetooth en Chrome y Edge), sin internet | [05](05-protocolo.md) |
| R5 | Automatización autónoma | Modo **Automático** en el ESP32: umbrales y reglas guardados en su memoria flash | [04](04-firmware.md) |
| R6 | Modo de control personalizado | Modo **Manual** desde la PC y el celular, con botones o con voz. El foco interior siempre es manual. | [06](06-pagina-web.md), [07](07-asistente-mia.md) |
| R7 | Visualización en tiempo real | Estado cada segundo, tarjetas de sensores y dispositivos, gráfica de los últimos 5 minutos, avisos de la alarma | [06](06-pagina-web.md) |
| R8 | Activación de dispositivos | Interruptores en la página; órdenes de MIA | [06](06-pagina-web.md) |
| R9 | Sensores y actuadores; los actuadores no pueden ser LEDs | Actuadores: 2 relés con focos de 120 V, y 3 transistores con ventilador, bomba y buzzer | [03](03-hardware.md) |
| R10 | Domótica: al menos 5 dispositivos | 5 dispositivos (tabla 1.4). El documento permite ideas propias "excepto encender un led". | [03](03-hardware.md) |
| R11 | Presentación presencial | Guion de demostración y lista de puesta en marcha | [09](09-pruebas-y-demostracion.md) |

## 1.4 Los 5 dispositivos

| # | Dispositivo | Sensor | Actuador | Comportamiento |
|---|---|---|---|---|
| D1 | Foco interior | — | Relé + foco de 120 V | Solo se enciende y apaga desde la página (botón o MIA), **en cualquier modo**. No tiene automatización. |
| D2 | Foco exterior | LDR | Relé + foco de 120 V | Enciende cuando la luz baja de 25 % (ajustable); apaga cuando sube de 35 % (umbral + 10) |
| D3 | Riego | Sensor de suelo resistivo + placa LM393 | Relé 3 + bomba de 5 V | Riega cuando la humedad baja de 35 % (ajustable), en ciclos de máximo 15 s con 60 s de espera; deja de regar al llegar a 45 % (umbral + 10) |
| D4 | Ventilador | DHT22 | Relé 2 + ventilador de 5 V | Enciende a 28 °C (ajustable); apaga cuando baja de 27.5 °C |
| D5 | Alarma | PIR HC-SR501 | Buzzer activo (con transistor 2N2222) | Si el PIR detecta a una persona **5 s seguidos** (ajustable de 2 a 30 s): suena de forma intermitente y la página muestra un aviso. Se apaga cuando ya no detecta a nadie (1.5 s sin señal) o cuando se desactiva desde la página. Si se desactiva con la persona todavía presente, no vuelve a sonar hasta que se vaya. |

## 1.5 Innovación

1. **Asistente por voz con IA real.** MIA entiende lenguaje natural, consulta sensores, controla dispositivos y aplica "escenas" como modo noche o "me voy de la casa".
2. **Reglas creadas por la IA que corren sin internet.** "Después de las 10 de la noche apaga el foco de afuera" se convierte en una regla que el ESP32 guarda en su flash y ejecuta aunque se caiga el internet.
3. **Alarma de presencia con aviso remoto.** El ESP32 decide la alarma; la página avisa con un banner, un mensaje emergente, un historial y, si se permite, una notificación del navegador.
4. **Doble canal.** WiFi y Bluetooth transportan el mismo protocolo; si se cae el internet, el celular controla la casa por Bluetooth.

## 1.6 Requisitos no funcionales

| Id | Requisito | Valor |
|---|---|---|
| NF1 | Frescura del estado | El ESP32 publica cada 1 s. La página marca "Sin datos recientes" después de 5 s sin estado. |
| NF2 | Confirmación de órdenes | La página espera hasta 3.5 s a que el estado del ESP32 refleje cada cambio. |
| NF3 | Autonomía | La automatización y la alarma no dependen de la red, del servidor ni de la IA. |
| NF4 | Tamaño del estado | Debe caber en un paquete BLE (MTU 247): claves de 1 a 2 letras. |
| NF5 | Aviso de alarma | La página avisa en ≤ 1 s después de que el ESP32 activa la alarma, mientras esté conectada. |
| NF6 | Respuesta de MIA | Esfuerzo bajo del modelo; respuestas de 1 a 3 oraciones, aptas para voz. |
| NF7 | Costo de IA | Alrededor de 1 a 3 centavos de dólar por mensaje, con caché. |
| NF8 | Navegadores | Chrome o Edge en PC y Android para Bluetooth y voz. En iPhone no hay Web Bluetooth: se usa WiFi y texto. |
| NF9 | Idioma | Toda la interfaz y MIA en español de Guatemala. |
| NF10 | Accesibilidad | Tema claro y oscuro, movimiento reducido respetado, controles con nombre accesible. |

## 1.7 Fuera de alcance

- App nativa de Android o iOS.
- Mensajes fuera de la página (SMS, correo, WhatsApp). El aviso llega a la página y, si se permite, como notificación del navegador mientras la página está abierta.
- Cuentas de usuario o varios hogares (hay un solo `ID_CASA`, cambiable en `config.h`).
- Actualización del firmware por aire (OTA).
- Verificación del certificado del broker en el ESP32 (se usa `setInsecure()` para la demo).
