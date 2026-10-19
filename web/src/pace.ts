// The engine answers a fast host in a burst; the reader should still see the ring climb. The
// pacer releases events to the view one at a time, at a steady interval, in order.

export interface Pacer<T> {
  push(event: T): void;
  /** No more events will come; call the end callback once the queue has drained. */
  end(): void;
  /** Drop whatever has not been shown. */
  cancel(): void;
}

/**
 * @param rank optional display order: among queued events the lowest rank goes first, so a burst
 * is shown worse-to-better (legacy answers before hybrid ones) while every event stays real.
 */
export function pacer<T>(onEvent: (e: T) => void, onEnd: () => void, intervalMs: number, rank?: (e: T) => number): Pacer<T> {
  const queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ended = false;
  let cancelled = false;

  const tick = () => {
    timer = null;
    if (cancelled) return;
    let index = 0;
    if (rank && queue.length > 1) {
      for (let i = 1; i < queue.length; i++) if (rank(queue[i]) < rank(queue[index])) index = i;
    }
    const next = queue.length ? queue.splice(index, 1)[0] : undefined;
    if (next !== undefined) {
      onEvent(next);
      timer = setTimeout(tick, intervalMs);
    } else if (ended) {
      onEnd();
    }
  };

  return {
    push(event) {
      if (cancelled) return;
      queue.push(event);
      if (!timer) tick();
    },
    end() {
      ended = true;
      if (!timer && queue.length === 0 && !cancelled) onEnd();
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
