"use client";

// The viewer the sheet is read through. SPEC.md section 11.
//
// The sheet is authored for 36 by 24 inches at 72 units to the inch, so the
// document is 2592 by 1728 units and the smallest authored text is 6 units. Fit
// to a 1014 px column that is a scale of 0.391, which sets the 6 unit text at
// 2.3 px: present, correct, and unreadable. The drawing is not wrong. It was
// being shown at one sixth of the size it was drawn for.
//
// So the sheet is not scaled to the container any more. The container becomes a
// window onto it, and the window moves: drag to pan, scroll or pinch to zoom
// about the pointer, and a control to jump to 100 percent, where one sheet unit
// is one CSS pixel and the 6 unit text reads at 6 px.
//
// Zoom is driven by the `viewBox` attribute, never by a CSS transform. A
// transformed SVG can be composited from a bitmap rasterized at the pre
// transform size, which is exactly the blur this component exists to remove;
// changing the viewBox makes the browser re render the geometry at the new
// scale, so the drawing stays vector at every zoom (SPEC section 11: the sheet
// is vector on screen and in the export).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  FIT,
  PAN_STEP_PX,
  SHEET_H,
  SHEET_W,
  ZOOM_STEP,
  clampView,
  panBy,
  scaleOf,
  zoomAbout,
  type View,
} from "@/lib/datum/sheet/view";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  /** The sheet's own content: defs, the paper, and one group per panel. */
  children: React.ReactNode;
  /**
   * True while a citation chip is hovered. It lands on the <svg> because the
   * dimming rule in SheetCanvas selects on it, and the <svg> is this
   * component's element rather than that one's.
   */
  highlighting?: boolean;
}

export default function SheetViewer({ children, highlighting }: Props) {
  const [view, setView] = useState<View>(FIT);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fullScreen, setFullScreen] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  const windowRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  /** Live pointers, so one is a drag and two are a pinch. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; x: number; y: number } | null>(null);

  // The window's own pixel size drives both the fit scale and the viewBox, so
  // it is measured rather than assumed. This fires on the column resizing, on
  // the full screen layer opening, and on an orientation change.
  useEffect(() => {
    const node = windowRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize({ w: box.width, h: box.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fullScreen]);

  /**
   * Every zoom goes through here so the pointer origin rule is written once.
   * `at` is in client coordinates; the window's own rectangle is read live, so
   * this callback never has to change identity and the wheel listener below is
   * attached once.
   */
  const zoomBy = useCallback((factor: number, at?: { x: number; y: number }) => {
    const node = windowRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const px = at ? at.x - rect.left : rect.width / 2;
    const py = at ? at.y - rect.top : rect.height / 2;
    setView((previous) =>
      zoomAbout(
        previous,
        rect.width,
        rect.height,
        px,
        py,
        scaleOf(previous, rect.width) * factor,
      ),
    );
  }, []);

  const setScale = useCallback((scale: number) => {
    const node = windowRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setView((previous) =>
      zoomAbout(previous, rect.width, rect.height, rect.width / 2, rect.height / 2, scale),
    );
  }, []);

  const pan = useCallback((dx: number, dy: number) => {
    const node = windowRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setView((previous) => panBy(previous, rect.width, rect.height, dx, dy));
  }, []);

  // React attaches wheel at the root as a passive listener, where
  // preventDefault does nothing, so the zoom is bound natively and non passive.
  // It is bound to the window element and not to the document, which is what
  // leaves the page scrolling normally everywhere else on the page.
  useEffect(() => {
    const node = windowRef.current;
    if (!node) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      // deltaMode 1 counts lines and 2 counts pages; both are far coarser than
      // pixels, so they are scaled up before the exponent.
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      zoomBy(Math.exp(-event.deltaY * unit * 0.0015), {
        x: event.clientX,
        y: event.clientY,
      });
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomBy, fullScreen]);

  // Escape closes, Tab stays inside, the body does not scroll behind the layer,
  // and focus returns to the control that opened it.
  useEffect(() => {
    if (!fullScreen) return;
    const previouslyFocused = openerRef.current;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    windowRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setFullScreen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const layer = overlayRef.current;
      if (!layer) return;
      const focusable = Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && layer.contains(active);
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = bodyOverflow;
      previouslyFocused?.focus();
    };
  }, [fullScreen]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // A secondary mouse button is the context menu, not a drag.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) setGrabbing(true);
    if (pointers.current.size === 2) pinch.current = pinchStateOf(pointers.current);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const live = pointers.current;
    const previous = live.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    live.set(event.pointerId, next);

    if (live.size >= 2) {
      const current = pinchStateOf(live);
      const start = pinch.current;
      pinch.current = current;
      if (!start || start.distance <= 0 || current.distance <= 0) return;
      // The pinch moves and spreads at the same time: zoom about the midpoint,
      // then pan by however far the midpoint itself travelled.
      zoomBy(current.distance / start.distance, { x: current.x, y: current.y });
      pan(current.x - start.x, current.y - start.y);
      return;
    }

    pan(next.x - previous.x, next.y - previous.y);
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setGrabbing(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? PAN_STEP_PX * 3 : PAN_STEP_PX;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        pan(step, 0);
        return;
      case "ArrowRight":
        event.preventDefault();
        pan(-step, 0);
        return;
      case "ArrowUp":
        event.preventDefault();
        pan(0, step);
        return;
      case "ArrowDown":
        event.preventDefault();
        pan(0, -step);
        return;
      case "+":
      case "=":
        event.preventDefault();
        zoomBy(ZOOM_STEP);
        return;
      case "-":
      case "_":
        event.preventDefault();
        zoomBy(1 / ZOOM_STEP);
        return;
      case "0":
        event.preventDefault();
        setView(FIT);
        return;
      default:
    }
  }

  // The stored view is clamped here rather than written back through an effect,
  // so a resize or the full screen layer opening needs no state change: the next
  // render simply reads the view against the new window.
  const current = clampView(view, size.w, size.h);
  const scale = scaleOf(current, size.w);
  const percent = Math.round(scale * 100);
  const atFit = current.scale === null;
  // Before the first measurement the whole sheet is the honest answer, and it
  // is what the fit view resolves to a frame later.
  const viewBox =
    size.w > 0 && size.h > 0
      ? `${current.x} ${current.y} ${size.w / scale} ${size.h / scale}`
      : `0 0 ${SHEET_W} ${SHEET_H}`;

  // Two copies, one per place the controls appear. The page keeps the button
  // that opens the layer mounted the whole time it is open, which is what the
  // layer focuses back to when it closes.
  function controlsFor(inLayer: boolean) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <span className="meta" data-datum-zoom={percent}>
          {percent}%
        </span>
        <span className="meta text-[var(--color-brown-light)]">
          {atFit ? "fit to width" : "1 sheet unit to 1 px at 100%"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <ViewerButton onClick={() => zoomBy(1 / ZOOM_STEP)} label="Zoom out">
            &minus;
          </ViewerButton>
          <ViewerButton onClick={() => zoomBy(ZOOM_STEP)} label="Zoom in">
            +
          </ViewerButton>
          <ViewerButton onClick={() => setView(FIT)} pressed={atFit}>
            Fit
          </ViewerButton>
          <ViewerButton
            onClick={() => setScale(1)}
            pressed={!atFit && Math.abs(scale - 1) < 0.005}
          >
            100%
          </ViewerButton>
          {inLayer ? (
            <ViewerButton onClick={() => setFullScreen(false)}>
              Close (Esc)
            </ViewerButton>
          ) : (
            <ViewerButton
              ref={openerRef}
              onClick={() => setFullScreen(true)}
              disabled={fullScreen}
            >
              Full screen
            </ViewerButton>
          )}
        </div>
      </div>
    );
  }

  const surface = (
    <div
      ref={windowRef}
      tabIndex={0}
      role="group"
      aria-label="Site analysis sheet viewer. Drag to pan, scroll to zoom. Arrow keys pan, plus and minus zoom, zero fits the sheet to the width."
      data-datum-sheet-viewer
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onKeyDown={onKeyDown}
      className={`relative w-full overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-terracotta)] ${
        fullScreen ? "flex-1" : "aspect-[3/2]"
      }`}
      // touch-action none is what lets one finger pan and two fingers pinch.
      // It is set on this element only, so a gesture that starts anywhere else
      // on the page still scrolls the page.
      style={{ touchAction: "none", cursor: grabbing ? "grabbing" : "grab" }}
    >
      <svg
        viewBox={viewBox}
        className="block h-full w-full"
        role="img"
        aria-label="Site analysis sheet"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        data-highlighting={highlighting ? "true" : undefined}
      >
        {children}
      </svg>
    </div>
  );

  return (
    <>
      <div className="flex flex-col">
        {controlsFor(false)}
        {/* While the layer is open the sheet lives in it, and a box of the same
            shape holds the page open so nothing behind the layer reflows. */}
        {fullScreen ? (
          <div className="aspect-[3/2] w-full" aria-hidden="true" />
        ) : (
          surface
        )}
      </div>
      {fullScreen
        ? createPortal(
            <div
              ref={overlayRef}
              role="dialog"
              aria-modal="true"
              aria-label="Site analysis sheet, full screen"
              className="fixed inset-0 z-[100] flex flex-col bg-[var(--color-paper)]"
            >
              {controlsFor(true)}
              {surface}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** The midpoint and separation of the first two live pointers. */
function pinchStateOf(
  live: Map<number, { x: number; y: number }>,
): { distance: number; x: number; y: number } {
  const [a, b] = Array.from(live.values());
  return {
    distance: Math.hypot(b.x - a.x, b.y - a.y),
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function ViewerButton({
  ref,
  onClick,
  children,
  label,
  pressed,
  disabled,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      className={`meta rounded-full border px-3 py-1 transition-colors ${
        pressed
          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
          : "border-[var(--color-line)] text-[var(--color-brown)] hover:border-[var(--color-brown)]"
      }`}
    >
      {children}
    </button>
  );
}
