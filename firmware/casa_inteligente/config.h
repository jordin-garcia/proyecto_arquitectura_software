// =====================================================================
//  Casa inteligente con asistente virtual - Configuracion de hardware
//  Placa: ESP32-WROOM-32 DevKit (38 pines)
//  Las conexiones coinciden con el cableado probado de la maqueta (8 nov 2026).
// =====================================================================
#pragma once

// ---------------- Sensores ----------------
// Solo usamos pines ADC1 (32-39) para lecturas analogicas: los pines ADC2
// dejan de funcionar cuando el WiFi esta encendido.
#define PIN_PIR          27   // Sensor de movimiento HC-SR501 (salida digital de 3.3 V)
#define PIN_DHT          21   // Sensor de temperatura y humedad DHT22
#define PIN_SUELO        35   // Salida analogica del sensor de humedad del suelo (ADC1_CH7, solo entrada)
#define PIN_SUELO_VCC    -1   // -1: el sensor de suelo esta alimentado siempre.
                              // Con un GPIO (por ejemplo 32) se enciende solo al medir y la sonda dura mas.
#define PIN_LDR          34   // Nodo del divisor LDR + resistencia 10k (ADC1_CH6, solo entrada)
#define LDR_SUBE_CON_LUZ true // true si la lectura cruda SUBE con mas luz; false si baja (tapen el LDR y vean)

// ---------------- Actuadores ----------------
// Focos de 120 V: modulo de reles con optoacoplador (se activan con nivel BAJO)
#define PIN_RELE_LUZ_INT 19   // Rele del foco interior (solo se controla desde la pagina y MIA)
#define PIN_RELE_LUZ_EXT 22   // Rele del foco exterior (automatico con el LDR)
#define RELE_ACTIVO_BAJO true // cambiar a false si sus reles se activan con nivel ALTO

// Motores y buzzer: transistor 2N2222 con resistencia de 1k en la base; ALTO = encendido
#define PIN_VENT         23   // Ventilador de 5 V
#define PIN_BOMBA        26   // Bomba del riego de 5 V
#define PIN_BUZZER       25   // Buzzer de la alarma

// ---------------- Calibracion de sensores ----------------
// Activen DEPURAR_SENSORES, abran el Monitor Serie (115200) y anoten las
// lecturas crudas con la sonda seca (en el aire) y dentro de un vaso de agua.
#define DEPURAR_SENSORES 0
#define SUELO_SECO       4095 // lectura ADC con la sonda en el aire (medido el 9 nov 2026)
#define SUELO_MOJADO     2800 // lectura ADC con la sonda dentro de agua (medido: ~2790)
#define LDR_MAX          1600 // lectura del LDR con mucha luz (linterna: ~1200-1575); equivale a 100 %
#define SUELO_CADA_MS    3000 // cada cuanto se mide el suelo
#define SUELO_ESPERA_MS  30   // tiempo encendido antes de medir

// ---------------- Umbrales por defecto (se pueden cambiar desde la web) ----------------
#define DEF_TEMP_MAX     28.0f // °C: desde aqui se enciende el ventilador
#define DEF_SUELO_MIN    35    // %: abajo de esto la tierra esta seca y se riega
#define DEF_LUZ_NOCHE    25    // %: abajo de esto no hay luz y se enciende el foco exterior
#define DEF_ALARMA_SEG   5     // s: tiempo que el PIR debe detectar a alguien sin parar para sonar la alarma

// Histeresis: evita que un dispositivo se encienda y apague sin parar cerca del umbral
#define HIST_TEMP        0.5f  // °C: el ventilador se apaga por debajo de tmax - 0.5
#define HIST_LUZ         10    // %: el foco exterior se apaga por encima de ln + 10
#define HIST_SUELO       10    // %: la tierra esta humeda (se deja de regar) en smin + 10
#define PIR_LIBRE_MS     1500  // ms sin deteccion para considerar que ya no hay nadie

// ---------------- Limites de seguridad ----------------
#define RIEGO_MAX_SEG       15    // riego automatico: maximo encendido por ciclo
#define RIEGO_PAUSA_SEG     60    // riego automatico: espera para que el agua se absorba
#define BOMBA_MANUAL_MAX_S  60    // la bomba se apaga sola despues de esto, incluso en manual
#define MAX_REGLAS          6

// ---------------- Comunicaciones ----------------
#define ID_CASA          "casa01"           // cambia los topicos MQTT: casa/<ID_CASA>/...
#define NOMBRE_BLE       "CasaIA"
#define ZONA_HORARIA     "CST6"             // Guatemala (UTC-6, sin horario de verano)
#define SERVIDOR_NTP     "pool.ntp.org"
#define PERIODO_ESTADO_MS 1000              // cada cuanto se publica el estado

// UUID del servicio Bluetooth (deben coincidir con web/conexion.js)
#define UUID_SERVICIO    "6f1a0001-3c2b-4f5e-9a8d-1b2c3d4e5f60"
#define UUID_ESTADO      "6f1a0002-3c2b-4f5e-9a8d-1b2c3d4e5f60" // READ | NOTIFY
#define UUID_COMANDO     "6f1a0003-3c2b-4f5e-9a8d-1b2c3d4e5f60" // WRITE
#define UUID_CONFIG      "6f1a0004-3c2b-4f5e-9a8d-1b2c3d4e5f60" // READ | NOTIFY (umbrales + reglas)
