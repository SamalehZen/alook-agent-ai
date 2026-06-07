import * as React from "react";

interface LongPressOptions {
  /** Hold duration before the press fires. Default 450ms. */
  delay?: number;
  /**
   * Movement (px) that cancels the press. Keeps a drag-to-select gesture from
   * being read as a long-press, so text selection is never hijacked. Default 10.
   */
  moveThreshold?: number;
}

/**
 * Long-press gesture for touch / coarse pointers. Returns pointer handlers to
 * spread onto the target element.
 *
 * Cancellation is deliberate so it never fights native text selection: the
 * timer is cleared the moment the pointer moves beyond `moveThreshold`, or on
 * pointerup / pointercancel / pointerleave before `delay` elapses. Only fires
 * for non-mouse pointers (touch/pen) — a mouse keeps its normal click/select.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 450, moveThreshold = 10 }: LongPressOptions = {},
) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = React.useRef<{ x: number; y: number } | null>(null);
  const firedRef = React.useRef(false);
  const cbRef = React.useRef(onLongPress);
  React.useEffect(() => {
    cbRef.current = onLongPress;
  });

  const clear = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      // Mouse keeps its normal behavior; long-press is touch/pen only.
      if (e.pointerType === "mouse") return;
      clear();
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        startRef.current = null;
        timerRef.current = null;
        cbRef.current();
      }, delay);
    },
    [clear, delay],
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > moveThreshold || dy > moveThreshold) clear();
    },
    [clear, moveThreshold],
  );

  // If the long-press fired, swallow the trailing click so it doesn't also
  // trigger the bubble's own click (e.g. opening a card).
  const onClick = React.useCallback((e: React.MouseEvent) => {
    if (firedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      firedRef.current = false;
    }
  }, []);

  React.useEffect(() => clear, [clear]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClick,
  };
}
