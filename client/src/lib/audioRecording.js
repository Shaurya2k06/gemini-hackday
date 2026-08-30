/** Best available MediaRecorder mime type, preferring opus-in-webm. */
export function pickAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}
