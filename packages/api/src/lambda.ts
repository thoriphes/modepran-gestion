// STUB provisional (P4, infra): permite que `cdk synth` empaquete la Lambda antes de que exista la API.
// La tarea de la API (P3) lo sustituye por el handler real de Hono (`hono/aws-lambda`).
export const handler = async (): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => ({
  statusCode: 501,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ error: { code: 'not_implemented', message: 'API pendiente de implementar' } }),
});
