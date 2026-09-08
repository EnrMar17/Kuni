-- Transporte SMS opcional mediante capcom6/android-sms-gateway.
-- La migración base ya está aplicada: ampliar constraints sin reescribir 0001.

alter table public.bot_interactions
  drop constraint if exists bot_interactions_provider_check;
alter table public.bot_interactions
  add constraint bot_interactions_provider_check
  check (provider in ('twilio', 'meta', 'demo', 'smsgate'));

alter table public.webhook_events
  drop constraint if exists webhook_events_provider_check;
alter table public.webhook_events
  add constraint webhook_events_provider_check
  check (provider in ('twilio', 'meta', 'demo', 'smsgate'));
