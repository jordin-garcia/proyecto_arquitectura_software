# 3. Hardware

Referencia visual: [maqueta 3D interactiva](https://claude.ai/artifact/YVD5HeXeccF4JXbPQwJwjb). Tiene los mismos componentes, posiciones y cables que este documento, con filtros por dispositivo y 12 pasos de armado.

## 3.1 Lista de componentes

### Electrónica principal
| Cant. | Componente | Detalle | Para |
|---|---|---|---|
| 1 | ESP32-WROOM-32 DevKit | 38 pines, USB-C | Control |
| 1 | Sensor de movimiento PIR | HC-SR501, jumper en **H** | D5 Alarma |
| 1 | Sensor de temperatura y humedad | DHT22 en módulo de 3 pines (+ · out · −), con resistencia incluida | D4 Ventilador |
| 1 | Sensor de humedad de suelo | Sonda **resistiva** de dos puntas + placa LM393 (VCC, GND, DO, AO) | D3 Riego |
| 1 | Fotorresistencia | LDR de 5 mm (GL5528) | D2 Foco exterior |
| 1 | Módulo de relés | 4 canales, bobina de 5 V (SRD-05VDC-SL-C), optoacoplador PC817, activación por nivel bajo, jumper VCC/JD-VCC | D1 a D4 |
| 2 | Focos | LED de 12 V con portalámparas (el interior en plafonera E27, sin enchufe de 120 V) | D1, D2 |
| 1 | Ventilador | 5 V DC | D4 |
| 1 | Mini bomba sumergible | 3 a 5 V DC | D3 |
| ≈40 cm | Manguera de silicona | Del diámetro de la salida de la bomba | D3 |
| 1 | Buzzer **activo** | 5 V, suena con voltaje continuo | D5 |
| 1 | Transistor NPN | 2N2222 o PN2222A (TO-92) | D5 |
| 1 | Resistencia | 1 kΩ (café-negro-rojo), base del transistor | D5 |
| 1 | Resistencia | 10 kΩ (café-negro-naranja), divisor del LDR | D2 |

### Alimentación
| Cant. | Componente | Detalle |
|---|---|---|
| 1 | Adaptador | 12 V 2 A, plug de 5.5 × 2.1 mm |
| 1 | Jack DC hembra | 5.5 × 2.1 mm con bornera de tornillos |
| 1 | Módulo MB102 | Para protoboard: entrada de 6.5 a 12 V, jumpers 3.3 V / 5 V por lado |
| 1 | Plug DC macho | 5.5 × 2.1 mm con bornera; lleva los 12 V al MB102 |
| 1 | Reductor LM2596 | Ajustado a **5.0 V** antes de conectar cargas |
| 1 | Capacitor electrolítico | 470 µF 16 V, en la salida del LM2596 |

### Montaje
| Cant. | Componente |
|---|---|
| 1 | Protoboard de 830 puntos (MB-102) |
| 6 | Borneras de 2 tornillos, paso de 5.08 mm (forman 3 buses) |
| ≈40 c/u | Cables Dupont macho-macho, macho-hembra y **hembra-hembra** (≈15 hembra-hembra para ESP32 ↔ módulos) |
| 3 m | Cable de 22 AWG rojo y negro (extensiones hacia la casa) |
| — | Termoencogible, estaño, separadores para el ESP32 |
| — | MDF de 6 mm (base) y cartón pluma de 5 mm o MDF de 3 mm (casa), bandeja plástica, recipiente transparente, maceta |

### Herramientas
Multímetro (indispensable para ajustar el LM2596), cautín, pistola de silicona caliente, desarmador plano pequeño, broca de 8 mm.

### Ya no se usan (diseño anterior)
Servo SG90, detector de llama, segunda bomba y conector T. Si ya los tienen, pueden guardarlos como repuesto.

## 3.2 Maqueta

Coordenadas en centímetros, vistas desde arriba, iguales a las de la maqueta 3D:
- **x** crece hacia la derecha y **z** crece hacia el frente (donde se para el público);
- la pared del fondo de la casa está en z = −20;
- la pared izquierda de la sala está en x = −10.

| Elemento | Medidas | Ubicación |
|---|---|---|
| Base | MDF de 60 × 62 cm, 6 mm, sobre la mesa | x −30..30, z −42..20 |
| Casa | 40 × 30 cm, paredes de 18 cm, frente abierto, techo de 0.5 cm | x −10..30, z −20..10 |
| Sala | 24 cm de ancho | x −10..14 |
| Cocina | 16 cm de ancho | x 14..30 |
| Pared divisoria | Puerta libre en z 4..10 | x = 14 |
| Ventana de la sala (decorativa) | 10 × 8 cm en la pared izquierda | x = −10, z −8..2 |
| Jardín | Bandeja de 17 × 28 cm, 2 cm de alto, con pasto | x −29..−12, z −19..9 |
| Base técnica | Franja de 60 × 21 cm al mismo nivel, detrás de la pared del fondo | z −41.5..−21 |

### Dónde va cada pieza
| Pieza | Posición | Notas |
|---|---|---|
| Foco interior (plafonera) | Pared del fondo de la sala, centro en x −2, a 12 cm de altura | Apunta al frente |
| Foco exterior | **Afuera**, en la cara exterior de la pared izquierda (lado del jardín), z 6, a 14 cm de altura | Ilumina el jardín. Lejos del LDR. |
| LDR | **Afuera**, sobre el techo de la cocina (x 22, z −2), mirando hacia arriba | En el lado opuesto al foco exterior y con la casa en medio, para que el foco no lo ilumine. Patas por un agujero pequeño. |
| PIR | Techo, esquina delantera izquierda de la sala (x −7.6, z 7.2), cúpula hacia abajo | Vigila la entrada de la sala. Tubo de cartulina si detecta afuera de la maqueta. |
| Buzzer | Pared divisoria, lado de la cocina, x 14.8, z −6, 2.5 cm bajo el techo | Patas hacia abajo |
| DHT22 | Pared izquierda de la sala, z −13, a 9 cm de altura | Lejos del foco y del ventilador |
| Ventilador 5 V | Pared del fondo de la sala, x 8, a 11 cm de altura | Sopla hacia el frente |
| Tanque | Jardín, centro en x −24, z −12 (9 × 9 × 10 cm, transparente) | Siempre con agua |
| Bomba | Fondo del tanque, centro | Acostada |
| Maceta | x −19, z 2 (Ø 10 cm, 9 cm de alto) | Con tierra y una planta |
| Sonda de humedad | En la maceta (x −16.8, z 3.5), enterrada unos 3 cm | Hasta donde empiezan las pistas |
| Manguera (≈35 cm) | Bomba → sube por el borde del tanque → baja sobre la maceta | — |

### Pasos de los cables
Agujeros de 8 mm en la pared del fondo, a 1.5 cm sobre el piso. Por dentro, los cables corren pegados a las paredes o al techo.

| Paso | x | Cables |
|---|---|---|
| Sala: foco interior y ventilador | 2.5 | 4 |
| Sala: DHT22 | −7.5 | 3 |
| Sala: PIR | −5.0 | 3 (suben por la pared del fondo y corren por el techo) |
| Cocina: LDR | 27.0 | 2 (suben por la pared derecha y salen al techo por un agujero pequeño) |
| Cocina: buzzer | 15.2 | 2 |

Sin perforar la pared:
- Los cables del **foco exterior** corren por afuera, entre el jardín y la pared izquierda (x −10.6).
- Los de la **bomba** y la **sonda** llegan al jardín directo desde la base técnica.

### Distribución de la base técnica
| Pieza | Posición (x, z) | Orientación |
|---|---|---|
| Adaptador de 12 V | Fuera de la base, a la izquierda | Al tomacorriente |
| Jack DC hembra | (−27, −24.5) | |
| LM2596 + capacitor | (−19, −24.5) y (−16.2, −24.5) | Entrada hacia el jack |
| Protoboard de 830 | Centro en (−3, −31) | MB102 en el extremo izquierdo; buses en la mitad de atrás, a la derecha; transistor en la mitad de adelante |
| ESP32 | Centro en (12, −31), sobre 4 separadores de 2.5 cm | Pines hacia abajo, antena hacia la casa, USB-C hacia atrás |
| Módulo de relés | Centro en (22, −27) | Tornillos hacia la casa |
| Placa del sensor de suelo | (−22, −36) | Lejos del agua |

## 3.3 Alimentación

```
Adaptador 12 V 2 A ─► Jack hembra ─┬─► Bus 12 V ─┬─► COM1 ─► foco interior 12 V
                                   │             │     └─ puente ─► COM4 ─► foco exterior 12 V
                                   │             ├─► LM2596 IN+ ─► 5.0 V ─► Bus 5 V motores ─┬─► COM2 ─► ventilador
                                   │             │                         (+ capacitor 470 µF) └─► COM3 ─► bomba
                                   │             └─► Plug macho ─► MB102 ─┬─ riel de atrás 3.3 V: DHT22, LDR, VCC de los relés
                                   │                                     └─ riel de adelante 5 V: JD-VCC de los relés, PIR, buzzer
                                   └─► Bus GND ─► LM2596 IN−, plug − (MB102), − de los dos focos (soldados juntos)
ESP32 ◄─ cable USB-C (laptop o cargador de 5 V)

LM2596 OUT− (tierra de los motores) ◄─ − ventilador, − bomba, − capacitor
Todas las tierras quedan unidas: Bus GND = IN− = OUT− del LM2596 = GND del MB102 = GND del ESP32.
```

### Buses en la protoboard
- Cada bus son **2 borneras unidas con un puente** Dupont macho-macho, lo que da 4 tornillos.
- Cada bornera va con **sus dos patas en la misma columna** de 5 agujeros (filas a y c), en la mitad de atrás.
- Entre bus y bus se deja al menos una columna vacía.
- El cable entra por la ventanita del costado: se afloja el tornillo de arriba, se mete la punta pelada (6 mm, estañada) debajo de la lámina metálica y se aprieta.

| Bus | Tornillos |
|---|---|
| Bus 12 V | + del jack · IN+ del LM2596 · + del plug del MB102 · COM1 |
| Bus GND | − del jack · IN− del LM2596 · − del plug del MB102 · − de los dos focos (soldados juntos) |
| Bus 5 V motores | OUT+ del LM2596 · COM2 · COM3 · libre |

### Consumo estimado
| Carga | Fuente | Típica | Pico |
|---|---|---|---|
| Foco LED 12 V (cada uno) | 12 V | 0.25–0.4 A | — |
| Ventilador 5 V | LM2596 | 0.1–0.2 A | 0.3 A |
| Bomba | LM2596 | 0.15–0.25 A | 0.4 A al arrancar |
| Bobinas de relé (cada una) | MB102 5 V | ≈75 mA | — |
| PIR, buzzer y sensores | MB102 | ≈60 mA en total | — |
| ESP32 | USB | 0.1–0.25 A | 0.35 A con WiFi y BLE |

- En el peor caso la casa toma ≈1.5 A de los 12 V (dos focos, ventilador y bomba arrancando, más el MB102). El adaptador de 2 A alcanza.
- El MB102 queda por debajo de ≈400 mA con los 4 relés activos.

## 3.4 Mapa de pines del ESP32

Fila izquierda, de la antena al USB: 3V3, EN, VP(36), VN(39), 34, 35, 32, 33, 25, 26, 27, 14, 12, GND, 13, SD2, SD3, CMD, 5V.
Fila derecha: GND, 23, 22, TX, RX, 21, GND, 19, 18, 5, 17, 16, 4, 0, 2, 15, SD1, SD0, CLK.

| GPIO | Fila | Dirección | Uso | Conecta a | Cable |
|---|---|---|---|---|---|
| 34 | izq. | ADC1_CH6 | Humedad de suelo, `PIN_SUELO` | AO de la placa LM393 | Dupont H-H |
| 35 | izq. | ADC1_CH7 | Luz, `PIN_LDR` | Nodo del divisor LDR / 10 kΩ | Dupont M-H |
| 32 | izq. | Salida | Alimenta el sensor de suelo, `PIN_SUELO_VCC` | VCC de la placa LM393 | Dupont H-H |
| 33 | izq. | Salida | Relé 3, bomba | IN3 | Dupont H-H |
| 25 | izq. | Salida | Relé 2, ventilador | IN2 | Dupont H-H |
| 26 | izq. | Salida | Relé 1, foco interior | IN1 | Dupont H-H |
| 27 | izq. | Entrada + interrupción | PIR, `PIN_PIR` | OUT del PIR | Dupont H-H + extensión |
| GND | izq. | — | Tierra común | Riel GND de adelante | Dupont M-H |
| 23 | der. | Salida | Relé 4, foco exterior | IN4 | Dupont H-H |
| 18 | der. | Salida | Buzzer, `PIN_BUZZER` (ALTO = suena) | Resistencia de 1 kΩ → base del 2N2222 | Dupont M-H |
| 4 | der. | Bidireccional | DHT22, `PIN_DHT` | out del DHT22 | Dupont H-H + extensión |

**Reglas:**
- Las lecturas analógicas van solo en ADC1 (32 a 39), porque ADC2 no funciona con WiFi.
- No se usan los pines de arranque 0, 2, 5, 12 ni 15.
- Ningún sensor se alimenta del pin 3V3 del ESP32 en la versión final: todos toman 3.3 V del MB102. Para pruebas cortas por USB sí se pueden usar los pines 3V3 y 5V del ESP32 con los sensores, nunca con focos ni motores.

## 3.5 Módulo de relés

- **Jumper VCC–JD-VCC quitado.** VCC va al riel de 3.3 V, JD-VCC al riel de 5 V y GND a tierra.
- Se activan con nivel BAJO (`RELE_ACTIVO_BAJO true`).
- En cada canal se usan **COM** y **NO**; NC queda libre. Revisen en la placa el orden de los tres tornillos.

| Canal | Entrada | COM ← | NO → |
|---|---|---|---|
| 1 | GPIO 26 | Bus 12 V | + del foco interior |
| 2 | GPIO 25 | Bus 5 V motores | + (rojo) del ventilador |
| 3 | GPIO 33 | Bus 5 V motores | + (rojo) de la bomba |
| 4 | GPIO 23 | Puente desde COM1 (12 V) | + del foco exterior |

## 3.6 Lista completa de cables

Colores de la maqueta 3D:
- amarillo = 12 V;
- rojo = 5 V;
- naranja = 3.3 V;
- negro = GND;
- otros colores = señales.

En la práctica: rojo para los positivos, negro para GND, y las señales marcadas con termoencogible de color.

### Alimentación y control
| Id | Desde | Hasta | Cable |
|---|---|---|---|
| a1 | Adaptador | Jack DC hembra | Cable del adaptador |
| a2 | Jack + | Bus 12 V, tornillo 1 | 22 AWG rojo (marcar 12 V) |
| a3 | Jack − | Bus GND, tornillo 1 | 22 AWG negro |
| j1, j2, j3 | Bornera 1 de cada bus | Bornera 2 del mismo bus | Dupont M-M (puente) |
| a4 | Bus 12 V, tornillo 2 | LM2596 IN+ | 22 AWG rojo |
| a5 | Bus GND, tornillo 2 | LM2596 IN− | 22 AWG negro |
| a8 | LM2596 OUT+ | Bus 5 V motores, tornillo 1 | 22 AWG rojo |
| a15, a16 | Capacitor + / − | LM2596 OUT+ / OUT− | Patas soldadas |
| a6 | Bus 12 V, tornillo 3 | Plug DC macho + | 22 AWG rojo |
| a7 | Bus GND, tornillo 3 | Plug DC macho − | 22 AWG negro |
| a13 | ESP32 GND | Riel GND de adelante | Dupont M-H |
| a14 | ESP32 USB-C | Laptop o cargador | Cable USB-C |
| r1 | Riel 3.3 V | Relés VCC | Dupont M-H |
| r2 | Riel 5 V | Relés JD-VCC | Dupont M-H |
| r3 | Riel GND de adelante | Relés GND | Dupont M-H |

### D1 Foco interior
| Id | Desde | Hasta | Cable |
|---|---|---|---|
| i1 | GPIO 26 | Relés IN1 | Dupont H-H |
| i2 | Bus 12 V, tornillo 4 | Relés COM1 | 22 AWG rojo |
| i3 | Relés NO1 | Foco interior, terminal + | 22 AWG rojo |
| i4 | Foco interior, terminal − | Bus GND, tornillo 4 | 22 AWG negro (soldado junto con el − del foco exterior) |

### D2 Foco exterior
| Id | Desde | Hasta | Cable |
|---|---|---|---|
| e1 | GPIO 23 | Relés IN4 | Dupont H-H |
| e2 | Relés COM1 | Relés COM4 | 22 AWG rojo (puente corto) |
| e3 | Relés NO4 | Foco exterior, terminal + | 22 AWG rojo |
| e4 | Foco exterior, terminal − | Bus GND, tornillo 4 (junto con i4) | 22 AWG negro |
| e5 | Riel 3.3 V | LDR, pata 1 | Dupont macho + 22 AWG soldado |
| e6 | LDR, pata 2 | Nodo del LDR (columna de la protoboard) | Dupont macho + 22 AWG soldado |
| — | Nodo del LDR | Riel GND de adelante | Resistencia de 10 kΩ |
| e7 | Nodo del LDR | GPIO 35 | Dupont M-H |

### D3 Riego
| Id | Desde | Hasta | Cable |
|---|---|---|---|
| g1 | GPIO 33 | Relés IN3 | Dupont H-H |
| g2 | Bus 5 V motores, tornillo 3 | Relés COM3 | 22 AWG rojo |
| g3 | Relés NO3 | Bomba, rojo | 22 AWG rojo soldado |
| g4 | Bomba, negro | LM2596 OUT− | 22 AWG negro soldado |
| g5 | GPIO 32 | Placa LM393 VCC | Dupont H-H |
| g6 | Placa LM393 GND | Riel GND de atrás | Dupont M-H |
| g7 | Placa LM393 AO | GPIO 34 | Dupont H-H |
| g8, g9 | Placa LM393, pines de sonda | Sonda, pines 1 y 2 | Cable H-H del sensor + extensión |

### D4 Ventilador
| Id | Desde | Hasta | Cable |
|---|---|---|---|
| c1 | GPIO 25 | Relés IN2 | Dupont H-H |
| c2 | Bus 5 V motores, tornillo 2 | Relés COM2 | 22 AWG rojo |
| c3 | Relés NO2 | Ventilador, rojo | 22 AWG rojo soldado |
| c4 | Ventilador, negro | LM2596 OUT− | 22 AWG negro soldado |
| c5 | Riel 3.3 V | DHT22 + | Dupont M-H + extensión |
| c6 | DHT22 out | GPIO 4 | Dupont H-H + extensión |
| c7 | DHT22 − | Riel GND de atrás | Dupont M-H + extensión |

### D5 Alarma
| Id | Desde | Hasta | Cable |
|---|---|---|---|
| p1 | Riel 5 V | PIR VCC | Dupont M-H + extensión |
| p2 | PIR OUT | GPIO 27 | Dupont H-H + extensión |
| p3 | PIR GND | Riel GND de adelante | Dupont M-H + extensión |
| b1 | GPIO 18 | Resistencia de 1 kΩ → base del 2N2222 | Dupont M-H |
| b2 | Emisor del 2N2222 | Riel GND de adelante | Dupont M-M |
| b3 | Riel 5 V | Buzzer, pata larga (+) | Dupont macho + 22 AWG soldado |
| b4 | Buzzer, pata corta (−) | Colector del 2N2222 | 22 AWG soldado + Dupont macho |

**Transistor 2N2222:** con la cara plana al frente y las patas hacia abajo, el orden suele ser E · B · C (confirmar con la hoja de datos). Cada pata va en su propia columna de la protoboard.

## 3.7 Ajustes y calibración del hardware

| Pieza | Ajuste |
|---|---|
| LM2596 | Antes de conectar cargas: solo la entrada a 12 V; girar el potenciómetro hasta medir **5.0 V** entre OUT+ y OUT− |
| MB102 | Jumper del lado de atrás en 3.3 V, del lado de adelante en 5 V |
| Relés | Quitar el jumper VCC–JD-VCC |
| PIR | Jumper en **H** (la salida sigue en alto mientras la persona se mueve, necesario para contar 5 s); potenciómetro de tiempo al mínimo (≈3 s); sensibilidad media o baja |
| LDR y foco exterior | Comprobar que encender el foco exterior no cambia la lectura de luz; si la cambia, separarlos más o poner una visera al LDR |
| Sensor de suelo | Valores crudos en seco y en agua → `SUELO_SECO` y `SUELO_MOJADO` (ver [04](04-firmware.md)) |
