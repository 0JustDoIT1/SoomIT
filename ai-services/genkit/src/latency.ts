export function startedAt(): number {
  return performance.now();
}

export function logLatency(stage: string, started: number): void {
  const elapsedSeconds = (performance.now() - started) / 1000;
  console.info(
    `latency service=genkit stage=${stage} elapsed_seconds=${elapsedSeconds.toFixed(3)}`,
  );
}
