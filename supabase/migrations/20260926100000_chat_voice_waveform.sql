-- Voice-message waveforms.
--
-- The recorder measures the recording's loudness as a few dozen bar heights
-- (0–100) and sends them with the upload, so the player can draw the
-- WhatsApp-style waveform instantly, without downloading or decoding the audio.
-- Null for non-audio attachments and for recordings made before this column
-- existed (the player draws flat placeholder bars for those).

alter table chat_attachments
  add column if not exists waveform smallint[]
    check (waveform is null or cardinality(waveform) <= 64);
