// The Server Sent Events channel the brief route writes to. SPEC.md section 12.
//
// A brief takes tens of seconds, and the consumer can leave at any point in it:
// the visitor navigates away, or the offline run closes the reader as soon as
// it has what it wanted. The model loop and the citation check keep running
// after that, and every write they then make lands on a controller that is
// already closed. That is what produced the offline run's
// "Invalid state: Controller is already closed": the catch path sent its error
// event after the reader had gone, and the throw replaced the real failure in
// the log with a second one about the controller.
//
// So every write goes through here instead. The channel knows when it is over,
// whether because it closed itself or because the stream was cancelled, and a
// write after that is dropped rather than thrown.

/** The part of a stream controller this channel uses. */
export interface EnqueueOnly {
  enqueue(chunk: Uint8Array): void;
  close(): void;
}

export interface SseChannel {
  /** Writes one event, or does nothing once the channel is over. */
  send(event: string, data: unknown): void;
  /** Closes once. Safe to call after a cancel. */
  close(): void;
  /** The consumer went away. Called from the stream's own `cancel`. */
  cancel(): void;
  /** True once this channel has closed or been cancelled. */
  readonly over: boolean;
}

/** One SSE frame: the wire format the browser's EventSource parses. */
export function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Wrap a stream controller so no write can outlive the reader.
 *
 * The flag is checked before each call and set again from the catch, because a
 * reader can go away between the check and the enqueue: the guard has to hold
 * for a cancel that has already been recorded and for one that arrives in the
 * middle of a write.
 */
export function sseChannel(controller: EnqueueOnly): SseChannel {
  const encoder = new TextEncoder();
  let over = false;

  return {
    get over() {
      return over;
    },
    send(event: string, data: unknown): void {
      if (over) return;
      try {
        controller.enqueue(encoder.encode(sse(event, data)));
      } catch {
        // The consumer left mid write. Nothing more can be sent, and this is
        // not a failure of the brief: it is the reader that is gone.
        over = true;
      }
    },
    close(): void {
      if (over) return;
      over = true;
      try {
        controller.close();
      } catch {
        // Already closed from the other side. Nothing to do.
      }
    },
    cancel(): void {
      over = true;
    },
  };
}
