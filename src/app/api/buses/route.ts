// Live bus tracking requires GT PTS credentials — not publicly accessible.
// The client-side simulation in the Pulse map handles bus animation.
export async function GET(): Promise<Response> {
  return Response.json({ buses: [], simulated: true });
}
