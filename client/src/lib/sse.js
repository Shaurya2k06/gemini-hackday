/**
 * Consume an SSE response from the API (progress + result/error events).
 */
export async function consumeSseStream(res, { onProgress } = {}) {
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;
  let streamError = null;

  const paint = () => new Promise((resolve) => requestAnimationFrame(resolve));

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      if (!chunk.trim() || chunk.startsWith(':')) continue;

      const lines = chunk.split('\n');
      let event = 'message';
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;

      let data;
      try {
        data = JSON.parse(dataLine);
      } catch {
        continue;
      }

      if (event === 'progress') {
        onProgress?.(data);
        await paint();
      }
      if (event === 'result') finalResult = data;
      if (event === 'error') streamError = data.error || 'Request failed';
    }
  }

  if (streamError) throw new Error(streamError);
  if (!finalResult) throw new Error('Stream ended without a result');
  return finalResult;
}
