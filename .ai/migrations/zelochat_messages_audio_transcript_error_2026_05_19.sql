-- Applied to Supabase project xnnjyrblpvsqrtsshawa on 2026-05-19.
-- Adds audio_transcript_error so failed transcriptions persist the OpenAI
-- error message alongside audio_transcript_status='failed'. Today the admin
-- dashboard only knows a transcription failed (error_count in
-- zelochat_ai_usage_daily) but the reason has to be dug out of worker logs.
-- The ZeloChat backend that calls gpt-4o-mini-transcribe must be updated
-- separately to populate this column on failure.

alter table public.zelochat_messages
  add column if not exists audio_transcript_error text;
