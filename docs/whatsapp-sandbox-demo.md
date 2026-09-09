# Demo de WhatsApp sin verificación de Meta

## Alcance

Kuni puede usar **Twilio Sandbox for WhatsApp** mientras el remitente empresarial continúa en revisión. Es únicamente para pruebas/demostración: cada teléfono receptor debe unirse al Sandbox y el remitente visible será el número compartido de Twilio.

El botón manual de WhatsApp usa explícitamente las credenciales de Twilio y no cambia el proveedor del cron. Por eso puede conservarse SMS8 como transporte automático:

```dotenv
MESSAGE_PROVIDER=sms8
WHATSAPP_PROVIDER=twilio
```

También deben permanecer configurados, solo en el servidor, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` y `APP_PUBLIC_URL`. Si se agregan o cambian esas variables es obligatorio reiniciar Kuni.

## Preparación del teléfono receptor

1. En Twilio Console abrir `Messaging` → `Try WhatsApp`.
2. Desde cada teléfono de demostración, escanear el QR o enviar `join <código>` al número mostrado por Twilio.
3. Antes de presentar, enviar desde el receptor un mensaje como `Hola Kuni` al Sandbox. Cada mensaje entrante abre/renueva la ventana de servicio de 24 horas.
4. En el Sandbox configurar `When a message comes in` como `POST <APP_PUBLIC_URL>/api/webhooks/whatsapp`. Si cambia el túnel de ngrok, actualizar tanto Twilio como `APP_PUBLIC_URL` y la URL del cron guardada en Supabase Vault.

### Números de México

Kuni almacena el formato E.164 canónico para SMS (`+52` seguido de los 10
dígitos nacionales). Twilio/WhatsApp puede identificar esos mismos móviles
con el token histórico `1` (`+521...`). El adaptador agrega ese `1` solo al
destino enviado por WhatsApp; el expediente y los envíos SMS conservan
`+52...`. Sin esta adaptación, el Sandbox responde `63015` aunque el teléfono
sí haya enviado correctamente el mensaje `join`.

Kuni registra el mensaje entrante en `patient_messaging_state.last_inbound_at`. El botón falla cerrado cuando ese dato no existe, es futuro o tiene 24 horas o más; fuera de la ventana, WhatsApp exige una plantilla aprobada.

## Botón de prueba dentro de Kuni

Con las credenciales de Twilio configuradas, abrir `Pacientes` → ficha del paciente → `Contacto y consentimiento`. Aparece **Enviar WhatsApp de prueba** junto al control SMS cuando SMS8 también está activo.

Antes del envío muestra el número y el texto fijo:

> Kuni: este es un mensaje de prueba de WhatsApp. Tu número está conectado correctamente para recibir recordatorios. No necesitas responder.

La operación:

- exige usuario con escritura, paciente/unidad activos y consentimiento vigente;
- exige que el último mensaje entrante esté dentro de la ventana de 24 horas;
- es idempotente por solicitud y limita una prueba por paciente cada 30 segundos;
- persiste una interacción `manual_test` y no modifica adherencia, mediciones ni alertas;
- usa el mismo adaptador Twilio que los recordatorios, pero no ejecuta el job global ni envía otras interacciones pendientes.

`accepted` significa que Twilio aceptó la llamada a su API; los callbacks posteriores determinan entrega/lectura cuando estén disponibles.

## Funcionalidad automática

El botón es independiente del cron. Con `MESSAGE_PROVIDER=sms8`, `POST /api/jobs/tick` conserva los recordatorios automáticos por SMS y solo el botón de WhatsApp usa Twilio. Si se cambia explícitamente `MESSAGE_PROVIDER=twilio`, el cron también envía por WhatsApp: dentro de una ventana reciente usa texto libre; fuera de las 24 horas intenta el Content SID correspondiente y falla si la plantilla propia todavía no fue aprobada.

No hace falta cambiar `MESSAGE_PROVIDER` para usar el botón. Para impedir después cualquier salida real, usar `MESSAGE_PROVIDER=mock`, retirar temporalmente las credenciales Twilio y reiniciar Kuni.
