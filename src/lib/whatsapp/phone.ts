/**
 * Normalización de teléfonos de WhatsApp para resolver al paciente.
 *
 * Problema real encontrado en la prueba end-to-end del 2026-09-08
 * (`docs/bitacora-canal-b.md`): WhatsApp entrega los números móviles de
 * México con un "1" extra después del código de país
 * (`+521XXXXXXXXXX`, 13 dígitos), mientras que el E.164 canónico que se
 * captura en `patients.whatsapp_e164` normalmente no lo trae
 * (`+52XXXXXXXXXX`, 12 dígitos). Un `eq()` exacto contra el `From` del
 * webhook no encuentra al paciente y el mensaje queda huérfano.
 *
 * Este módulo NO decide cuál de las dos formas es la "correcta": genera las
 * variantes equivalentes para buscarlas todas y dejar que los datos
 * existentes manden. Es una regla de transporte acotada a México (+52); no
 * pretende ser una librería de numeración internacional.
 */

/** `+52` seguido de 10 dígitos: E.164 canónico de México. */
const MX_CANONICAL = /^\+52(\d{10})$/;
/** `+521` seguido de 10 dígitos: la variante que manda WhatsApp. */
const MX_WHATSAPP = /^\+521(\d{10})$/;

/**
 * Quita el prefijo `whatsapp:` del `From`/`To` de Twilio y recorta espacios.
 * No valida el número: eso lo hace quien lo consulta.
 */
export function stripWhatsAppPrefix(address: string): string {
  return address.replace(/^whatsapp:/, "").trim();
}

/**
 * Variantes E.164 equivalentes con las que buscar un mismo teléfono, en
 * orden de preferencia (primero el número tal como llegó). Para cualquier
 * número que no sea de México devuelve solo esa forma: agregar o quitar
 * dígitos en otras numeraciones cambiaría de persona, no de formato.
 */
export function phoneLookupCandidates(address: string): string[] {
  const received = stripWhatsAppPrefix(address);
  const candidates = [received];

  const whatsappVariant = MX_WHATSAPP.exec(received);
  if (whatsappVariant) candidates.push(`+52${whatsappVariant[1]}`);

  const canonical = MX_CANONICAL.exec(received);
  if (canonical) candidates.push(`+521${canonical[1]}`);

  return [...new Set(candidates)];
}
