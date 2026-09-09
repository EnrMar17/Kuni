-- Transporte SMS8 opcional para la demo manual en iPhone.
-- Sólo amplía los valores permitidos; no altera filas existentes.

alter table public.bot_interactions
  drop constraint if exists bot_interactions_provider_check;
alter table public.bot_interactions
  add constraint bot_interactions_provider_check
  check (provider in ('twilio', 'meta', 'demo', 'smsgate', 'sms8'));

alter table public.webhook_events
  drop constraint if exists webhook_events_provider_check;
alter table public.webhook_events
  add constraint webhook_events_provider_check
  check (provider in ('twilio', 'meta', 'demo', 'smsgate', 'sms8'));
