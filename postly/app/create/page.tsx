"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { prepareWithSegments, layoutNextLine, type LayoutCursor } from "@chenglou/pretext";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const WRAP_WIDTH = 280;
const LINE_HEIGHT_RATIO = 1.35;

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Point { x: number; y: number; }

interface CanvasImage {
  kind: "image";
  id: string;
  src: string;
  x: number;
  y: number;
  fullWidth: number;  // natural display size before crop
  fullHeight: number; // natural display size before crop
  shape: "rect" | "circle";
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  lassoPoints: Point[] | null; // points relative to frame (px), null = no lasso clip
}

// Derived helpers
function imgFrameW(img: CanvasImage) { return Math.max(10, img.fullWidth - img.cropLeft - img.cropRight); }
function imgFrameH(img: CanvasImage) { return Math.max(10, img.fullHeight - img.cropTop - img.cropBottom); }

interface CanvasText {
  kind: "text";
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  boxWidth: number;
}

type CanvasItem = CanvasImage | CanvasText;

type DragOp =
  | { kind: "move"; id: string; ox: number; oy: number }
  | { kind: "resize-image"; id: string; startX: number; startW: number; startH: number }
  | { kind: "crop-edge"; id: string; edge: "left" | "right" | "top" | "bottom"; startPos: number; startCrop: number; startItemX: number; startItemY: number }
  | { kind: "resize-text-font"; id: string; startX: number; startFontSize: number }
  | { kind: "resize-text-width"; id: string; edge: "left" | "right"; startX: number; startBoxWidth: number; startItemX: number };

/* ─── Avoidance helper ───────────────────────────────────────────────────── */

interface LineLayout { indent: number; width: number; }

/**
 * Scan polygon edges to find the min/max x intercepts at a given y (in polygon-local coords).
 * Returns { left, right } in absolute canvas coords, or null if the line misses the polygon.
 */
function polygonXAtY(points: Point[], imgX: number, imgY: number, lineMid: number): { left: number; right: number } | null {
  const localY = lineMid - imgY;
  let minX = Infinity;
  let maxX = -Infinity;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    // Does this edge cross localY?
    if ((a.y <= localY && b.y > localY) || (b.y <= localY && a.y > localY)) {
      const t = (localY - a.y) / (b.y - a.y);
      const x = a.x + t * (b.x - a.x);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  if (!isFinite(minX)) return null;
  return { left: imgX + minX, right: imgX + maxX };
}

function lineLayout(lineIndex: number, item: CanvasText, lineHeight: number, images: CanvasImage[]): LineLayout {
  const lineTop = item.y + lineIndex * lineHeight;
  const lineBottom = lineTop + lineHeight;
  const lineMid = (lineTop + lineBottom) / 2;
  const GUTTER = 8;
  const textLeft = item.x;
  const textRight = item.x + item.boxWidth;

  let indentAbs = textLeft;
  let rightAbs  = textRight;

  for (const img of images) {
    const fW = imgFrameW(img);
    const fH = imgFrameH(img);
    const imgX = img.x;
    const imgY = img.y;
    const imgBottom = imgY + fH;

    if (imgY >= lineBottom || imgBottom <= lineTop) continue;

    let imgLeft: number;
    let imgRight: number;

    if (img.lassoPoints && img.lassoPoints.length >= 3) {
      // Use polygon x-intercepts at this line's midpoint
      const intercept = polygonXAtY(img.lassoPoints, imgX, imgY, lineMid);
      if (!intercept) continue;
      imgLeft  = intercept.left;
      imgRight = intercept.right;
    } else if (img.shape === "circle") {
      const cx = imgX + fW / 2;
      const cy = imgY + fH / 2;
      const r  = Math.min(fW, fH) / 2;
      const dy = lineMid - cy;
      if (Math.abs(dy) >= r) continue;
      const chordHalf = Math.sqrt(r * r - dy * dy);
      imgLeft  = cx - chordHalf;
      imgRight = cx + chordHalf;
    } else {
      imgLeft  = imgX;
      imgRight = imgX + fW;
    }

    // Intrudes from the right of the text block
    if (imgLeft < textRight && imgLeft > indentAbs)  rightAbs  = Math.min(rightAbs,  imgLeft  - GUTTER);
    // Intrudes from the left of the text block
    if (imgRight > textLeft && imgRight < rightAbs)  indentAbs = Math.max(indentAbs, imgRight + GUTTER);
  }

  const indent = Math.max(0, indentAbs - textLeft);
  const width  = Math.max(20, rightAbs - textLeft - indent);
  return { indent, width };
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export default function CreatePage() {
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cropId, setCropId] = useState<string | null>(null);
  const [scissorsId, setScissorsId] = useState<string | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragOp | null>(null);

  const hasContent = items.length > 0;
  const images = items.filter((i): i is CanvasImage => i.kind === "image");

  /* ── Global pointer move / up ─────────────────────────────────────────── */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const op = dragRef.current;
      if (!op || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();

      if (op.kind === "move") {
        const x = Math.max(0, (e.clientX - rect.left) - op.ox);
        const y = Math.max(0, (e.clientY - rect.top) - op.oy);
        setItems((prev) => prev.map((item) => item.id === op.id ? { ...item, x, y } : item));
      } else if (op.kind === "resize-image") {
        const dx = e.clientX - op.startX;
        const newW = Math.max(60, Math.min(op.startW + dx, rect.width * 0.95));
        const scale = newW / op.startW;
        const newH = op.startH * scale;
        setItems((prev) => prev.map((item) =>
          item.id === op.id && item.kind === "image"
            ? { ...item, fullWidth: newW, fullHeight: newH, cropLeft: item.cropLeft * scale, cropRight: item.cropRight * scale, cropTop: item.cropTop * scale, cropBottom: item.cropBottom * scale }
            : item
        ));
      } else if (op.kind === "crop-edge") {
        const delta = op.edge === "left" || op.edge === "right"
          ? e.clientX - op.startPos
          : e.clientY - op.startPos;

        setItems((prev) => prev.map((item) => {
          if (item.id !== op.id || item.kind !== "image") return item;
          const maxCropW = item.fullWidth * 0.9;
          const maxCropH = item.fullHeight * 0.9;
          if (op.edge === "left") {
            const newCrop = Math.max(0, Math.min(op.startCrop + delta, maxCropW));
            return { ...item, cropLeft: newCrop, x: op.startItemX + (newCrop - op.startCrop) };
          }
          if (op.edge === "right")  return { ...item, cropRight:  Math.max(0, Math.min(op.startCrop - delta, maxCropW)) };
          if (op.edge === "top") {
            const newCrop = Math.max(0, Math.min(op.startCrop + delta, maxCropH));
            return { ...item, cropTop: newCrop, y: op.startItemY + (newCrop - op.startCrop) };
          }
          if (op.edge === "bottom") return { ...item, cropBottom: Math.max(0, Math.min(op.startCrop - delta, maxCropH)) };
          return item;
        }));
      } else if (op.kind === "resize-text-font") {
        const dx = e.clientX - op.startX;
        const newSize = Math.max(10, Math.min(op.startFontSize + dx / 3, 120));
        setItems((prev) => prev.map((item) =>
          item.id === op.id && item.kind === "text" ? { ...item, fontSize: newSize } : item
        ));
      } else if (op.kind === "resize-text-width") {
        const dx = e.clientX - op.startX;
        if (op.edge === "right") {
          const newW = Math.max(60, op.startBoxWidth + dx);
          setItems((prev) => prev.map((item) =>
            item.id === op.id && item.kind === "text" ? { ...item, boxWidth: newW } : item
          ));
        } else {
          const newW = Math.max(60, op.startBoxWidth - dx);
          const newX = op.startItemX + (op.startBoxWidth - newW);
          setItems((prev) => prev.map((item) =>
            item.id === op.id && item.kind === "text" ? { ...item, boxWidth: newW, x: newX } : item
          ));
        }
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  /* ── Callbacks ────────────────────────────────────────────────────────── */
  const startMove = useCallback((e: React.PointerEvent, item: CanvasItem) => {
    e.stopPropagation();
    setSelectedId(item.id);
    setCropId(null);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { kind: "move", id: item.id, ox: e.clientX - rect.left - item.x, oy: e.clientY - rect.top - item.y };
  }, []);

  const startResizeImage = useCallback((e: React.PointerEvent, item: CanvasImage) => {
    e.stopPropagation();
    dragRef.current = { kind: "resize-image", id: item.id, startX: e.clientX, startW: item.fullWidth, startH: item.fullHeight };
  }, []);

  const startCropEdge = useCallback((e: React.PointerEvent, img: CanvasImage, edge: "left" | "right" | "top" | "bottom") => {
    e.stopPropagation();
    const startPos = (edge === "left" || edge === "right") ? e.clientX : e.clientY;
    const startCrop = edge === "left" ? img.cropLeft : edge === "right" ? img.cropRight : edge === "top" ? img.cropTop : img.cropBottom;
    dragRef.current = { kind: "crop-edge", id: img.id, edge, startPos, startCrop, startItemX: img.x, startItemY: img.y };
  }, []);

  const startResizeTextFont = useCallback((e: React.PointerEvent, item: CanvasText) => {
    e.stopPropagation();
    dragRef.current = { kind: "resize-text-font", id: item.id, startX: e.clientX, startFontSize: item.fontSize };
  }, []);

  const startResizeTextWidth = useCallback((e: React.PointerEvent, item: CanvasText, edge: "left" | "right") => {
    e.stopPropagation();
    dragRef.current = { kind: "resize-text-width", id: item.id, edge, startX: e.clientX, startBoxWidth: item.boxWidth, startItemX: item.x };
  }, []);

  const setImageShape = useCallback((id: string, shape: "rect" | "circle") => {
    setItems((prev) => prev.map((item) =>
      item.id === id && item.kind === "image" ? { ...item, shape } : item
    ));
  }, []);

  const addText = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    const id = crypto.randomUUID();
    setItems((prev) => [
      ...prev,
      { kind: "text", id, x: (width - WRAP_WIDTH) / 2, y: height * 0.1, text: "", fontSize: 18, boxWidth: WRAP_WIDTH },
    ]);
    setSelectedId(id);
    setEditingId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    Array.from(e.dataTransfer.files)
      .filter((f) => f.type.startsWith("image/"))
      .forEach((file, i) => {
        const src = URL.createObjectURL(file);
        const w = rect.width * 0.5;
        const id = crypto.randomUUID();
        // Load image to get natural dimensions
        const tmpImg = new window.Image();
        tmpImg.onload = () => {
          const ratio = tmpImg.naturalHeight / tmpImg.naturalWidth;
          setItems((prev) => [
            ...prev,
            {
              kind: "image", id, src,
              x: (rect.width - w) / 2 + i * 16,
              y: rect.height * 0.15 + i * 16,
              fullWidth: w,
              fullHeight: w * ratio,
              shape: "rect",
              cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0,
              lassoPoints: null,
            },
          ]);
          setSelectedId(id);
        };
        tmpImg.src = src;
      });
  }, []);

  const handleUndo = useCallback(() => {
    setItems((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      if (last.kind === "image") URL.revokeObjectURL(last.src);
      return prev.slice(0, -1);
    });
    setSelectedId(null);
    setEditingId(null);
    setCropId(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !editingId) { e.preventDefault(); handleUndo(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, editingId]);

  /* ── Scissors lasso ───────────────────────────────────────────────────── */
  const startScissors = useCallback((id: string) => {
    setScissorsId(id);
    setDrawingPoints([]);
    setPreviewPoint(null);
    setCropId(null);
    setSelectedId(id);
  }, []);

  const cancelScissors = useCallback(() => {
    setScissorsId(null);
    setDrawingPoints([]);
    setPreviewPoint(null);
  }, []);

  const handleLassoClick = useCallback((e: React.MouseEvent, img: CanvasImage) => {
    e.stopPropagation();
    const fW = imgFrameW(img);
    const fH = imgFrameH(img);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(fW, e.clientX - rect.left));
    const y = Math.max(0, Math.min(fH, e.clientY - rect.top));

    setDrawingPoints((prev) => {
      // Close path if clicking near the first point
      if (prev.length >= 3) {
        const first = prev[0];
        const dist = Math.hypot(x - first.x, y - first.y);
        if (dist < 16) {
          // Apply lasso
          setItems((items) => items.map((item) =>
            item.id === img.id && item.kind === "image"
              ? { ...item, lassoPoints: prev }
              : item
          ));
          setScissorsId(null);
          setDrawingPoints([]);
          setPreviewPoint(null);
          return prev;
        }
      }
      return [...prev, { x, y }];
    });
  }, []);

  const handleLassoMouseMove = useCallback((e: React.MouseEvent, img: CanvasImage) => {
    if (scissorsId !== img.id) return;
    const fW = imgFrameW(img);
    const fH = imgFrameH(img);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(fW, e.clientX - rect.left));
    const y = Math.max(0, Math.min(fH, e.clientY - rect.top));
    setPreviewPoint({ x, y });
  }, [scissorsId]);

  const clearLasso = useCallback((id: string) => {
    setItems((prev) => prev.map((item) =>
      item.id === id && item.kind === "image" ? { ...item, lassoPoints: null } : item
    ));
  }, []);

  const commitText = useCallback((id: string, text: string) => {
    setEditingId(null);
    if (!text.trim()) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedId(null);
    }
  }, []);

  return (
    <div
      className="flex flex-col h-full bg-white select-none"
      onPointerDown={() => { setSelectedId(null); setEditingId(null); setCropId(null); cancelScissors(); }}
    >
      {/* Toolbar */}
      <header className="relative flex items-center h-14 px-4 bg-white border-b border-[#E5E5E5] flex-shrink-0">
        <div className="flex items-center gap-4 mx-auto">
          <button className="w-9 h-9 flex items-center justify-center text-[#1A1A1A] hover:opacity-60 transition-opacity" aria-label="Add photo">
            <PhotoIcon />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={addText}
            className="w-9 h-9 flex items-center justify-center text-[#1A1A1A] hover:opacity-60 transition-opacity"
            aria-label="Add text"
          >
            <TextIcon />
          </button>
          <button className="w-9 h-9 flex items-center justify-center text-[#1A1A1A] hover:opacity-60 transition-opacity" aria-label="Color palette">
            <PaletteIcon />
          </button>
          <button onClick={handleUndo} disabled={!hasContent}
            className="w-9 h-9 flex items-center justify-center text-[#1A1A1A] hover:opacity-60 transition-opacity disabled:opacity-25"
          >
            <UndoIcon />
          </button>
        </div>
        <div className="absolute right-4">
          <button className="flex items-center justify-center h-8 px-4 bg-[#1A1A1A] text-white rounded-full text-[13px] font-semibold tracking-wide hover:bg-[#333] active:bg-[#000] transition-colors">
            Share
          </button>
        </div>
      </header>

      {/* Workspace */}
      <main className="flex-1 flex items-center justify-center bg-[#EEEEEE] overflow-hidden">
        <div
          ref={canvasRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="bg-white border rounded-sm relative overflow-hidden transition-colors"
          style={{ aspectRatio: "4/3", width: "min(92vw, calc((100dvh - 160px) * (4/3)))", borderColor: isDragOver ? "#AAAAAA" : "#D7D7D7" }}
        >
          {isDragOver && (
            <div className="absolute inset-0 bg-black/5 flex items-center justify-center z-10 pointer-events-none">
              <p className="text-[15px] text-[#888]">Drop photo</p>
            </div>
          )}
          {!hasContent && !isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-[18px] text-[#C8C8C8] text-center px-8 leading-relaxed" style={{ fontFamily: "MaryLouise, serif" }}>
                Add delightful content to your canvas
              </p>
            </div>
          )}

          {/* Images */}
          {images.map((img) => {
            const isCropping = cropId === img.id;
            const isSelected = selectedId === img.id;
            const fW = imgFrameW(img);
            const fH = imgFrameH(img);

            return (
              <div key={img.id}>
                {/* Per-image floating toolbar */}
                {(isSelected || isCropping) && (
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute flex gap-1 bg-white rounded-full shadow-md px-1.5 py-1 z-20"
                    style={{ left: img.x + fW / 2, top: img.y - 40, transform: "translateX(-50%)" }}
                  >
                    <button onClick={() => setImageShape(img.id, "rect")}
                      className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${img.shape === "rect" ? "bg-black text-white" : "text-[#888] hover:bg-black/5"}`}
                    ><RectIcon /></button>
                    <button onClick={() => setImageShape(img.id, "circle")}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${img.shape === "circle" ? "bg-black text-white" : "text-[#888] hover:bg-black/5"}`}
                    ><CircleIcon /></button>
                    {!isCropping && scissorsId !== img.id
                      ? <>
                          <button onClick={(e) => { e.stopPropagation(); setCropId(img.id); setSelectedId(img.id); }}
                            className="w-6 h-6 rounded flex items-center justify-center text-[#888] hover:bg-black/5 transition-colors"
                          ><CropIcon /></button>
                          <button onClick={(e) => { e.stopPropagation(); startScissors(img.id); }}
                            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${img.lassoPoints ? "bg-black text-white" : "text-[#888] hover:bg-black/5"}`}
                          ><ScissorsIcon /></button>
                          {img.lassoPoints && (
                            <button onClick={(e) => { e.stopPropagation(); clearLasso(img.id); }}
                              className="w-6 h-6 rounded flex items-center justify-center text-[#888] hover:bg-black/5 transition-colors text-[9px] font-bold"
                              title="Clear lasso"
                            >✕</button>
                          )}
                        </>
                      : isCropping
                        ? <button onClick={(e) => { e.stopPropagation(); setCropId(null); }}
                            className="w-6 h-6 rounded flex items-center justify-center bg-black text-white text-[10px] font-bold"
                          >✓</button>
                        : <button onClick={(e) => { e.stopPropagation(); cancelScissors(); }}
                            className="w-6 h-6 rounded flex items-center justify-center text-[#888] hover:bg-black/5 transition-colors text-[9px] font-bold"
                            title="Cancel"
                          >✕</button>
                    }
                  </div>
                )}

                {/* Image frame — clipped to cropped area */}
                {(() => {
                  const isLassoing = scissorsId === img.id;
                  // Build clip-path string from stored lasso points
                  const clipPath = img.lassoPoints && img.lassoPoints.length >= 3 && !isLassoing
                    ? `polygon(${img.lassoPoints.map(p => `${(p.x / fW * 100).toFixed(2)}% ${(p.y / fH * 100).toFixed(2)}%`).join(", ")})`
                    : img.shape === "circle" ? "circle(50%)" : undefined;

                  return (
                    <div
                      onPointerDown={(e) => { if (!isCropping && !isLassoing) startMove(e, img); else e.stopPropagation(); }}
                      onDoubleClick={(e) => { e.stopPropagation(); setSelectedId(img.id); setCropId(img.id); }}
                      className="absolute overflow-hidden"
                      style={{
                        left: img.x,
                        top: img.y,
                        width: fW,
                        height: fH,
                        clipPath,
                        borderRadius: img.shape === "circle" || clipPath ? 0 : 0,
                        cursor: isCropping || isLassoing ? "default" : "grab",
                        outline: isSelected && !isCropping && !isLassoing ? "2px solid rgba(0,120,255,0.6)" : "none",
                        outlineOffset: "2px",
                        boxShadow: isCropping ? "0 0 0 2px rgba(0,120,255,0.6)" : "none",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.src}
                        alt=""
                        draggable={false}
                        style={{
                          position: "absolute",
                          width: img.fullWidth,
                          height: img.fullHeight,
                          maxWidth: "none",
                          left: -img.cropLeft,
                          top: -img.cropTop,
                          pointerEvents: "none",
                        }}
                      />

                      {/* Lasso outline — shown when selected and a lasso exists */}
                      {isSelected && !isLassoing && img.lassoPoints && img.lassoPoints.length >= 3 && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
                          <polygon
                            points={img.lassoPoints.map(p => `${p.x},${p.y}`).join(" ")}
                            fill="none"
                            stroke="rgba(0,120,255,0.8)"
                            strokeWidth="1.5"
                            strokeDasharray="5 3"
                          />
                          {img.lassoPoints.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke="rgba(0,120,255,0.8)" strokeWidth="1.5" />
                          ))}
                        </svg>
                      )}

                      {/* Lasso drawing overlay */}
                      {isLassoing && (
                        <svg
                          className="absolute inset-0 w-full h-full"
                          style={{ cursor: "crosshair", zIndex: 10 }}
                          onClick={(e) => handleLassoClick(e, img)}
                          onMouseMove={(e) => handleLassoMouseMove(e, img)}
                        >
                          {/* Dim overlay */}
                          <rect width="100%" height="100%" fill="rgba(0,0,0,0.35)" />

                          {/* Drawn polygon so far */}
                          {drawingPoints.length >= 2 && (
                            <polyline
                              points={[...drawingPoints, ...(previewPoint ? [previewPoint] : [])].map(p => `${p.x},${p.y}`).join(" ")}
                              fill="none"
                              stroke="white"
                              strokeWidth="1.5"
                              strokeDasharray="4 3"
                            />
                          )}
                          {/* Preview line from last point to cursor */}
                          {drawingPoints.length >= 1 && previewPoint && (
                            <line
                              x1={drawingPoints[drawingPoints.length - 1].x}
                              y1={drawingPoints[drawingPoints.length - 1].y}
                              x2={previewPoint.x}
                              y2={previewPoint.y}
                              stroke="white"
                              strokeWidth="1.5"
                              strokeDasharray="4 3"
                              strokeOpacity="0.6"
                            />
                          )}
                          {/* Placed points */}
                          {drawingPoints.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 7 : 3}
                              fill={i === 0 ? "rgba(255,255,255,0.9)" : "white"}
                              stroke="rgba(0,120,255,0.8)" strokeWidth="1.5"
                            />
                          ))}
                          {/* Instruction */}
                          {drawingPoints.length === 0 && (
                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                              fill="white" fontSize="12" fontFamily="system-ui">
                              Click to place points
                            </text>
                          )}
                          {drawingPoints.length >= 3 && (
                            <text x="50%" y="92%" textAnchor="middle" fill="white" fontSize="11" fontFamily="system-ui">
                              Click ● to close
                            </text>
                          )}
                        </svg>
                      )}
                    </div>
                  );
                })()}

                {/* Crop edge handles — rendered outside the clipped frame */}
                {isCropping && (() => {
                  const handleStyle = (edge: "left"|"right"|"top"|"bottom"): React.CSSProperties => {
                    const T = 8; // touch target half-thickness
                    const VIS = 3; // visible bar thickness
                    if (edge === "left")   return { position: "absolute", left: img.x - T,        top: img.y,           width: T * 2, height: fH, cursor: "ew-resize" };
                    if (edge === "right")  return { position: "absolute", left: img.x + fW - T,   top: img.y,           width: T * 2, height: fH, cursor: "ew-resize" };
                    if (edge === "top")    return { position: "absolute", left: img.x,             top: img.y - T,       width: fW,    height: T * 2, cursor: "ns-resize" };
                    return                        { position: "absolute", left: img.x,             top: img.y + fH - T,  width: fW,    height: T * 2, cursor: "ns-resize" };
                    void VIS;
                  };
                  return (["left","right","top","bottom"] as const).map((edge) => (
                    <div
                      key={edge}
                      onPointerDown={(e) => startCropEdge(e, img, edge)}
                      style={handleStyle(edge)}
                      className="z-20 flex items-center justify-center"
                    >
                      {/* Visible bar */}
                      <div style={{
                        width: edge === "left" || edge === "right" ? 3 : "100%",
                        height: edge === "top" || edge === "bottom" ? 3 : "100%",
                        background: "rgba(0,120,255,0.7)",
                        borderRadius: 2,
                      }} />
                    </div>
                  ));
                })()}

                {/* Resize handle (bottom-right, only when selected not cropping) */}
                {isSelected && !isCropping && (
                  <div
                    onPointerDown={(e) => startResizeImage(e, img)}
                    className="absolute w-4 h-4 bg-white border border-[rgba(0,120,255,0.6)] rounded-sm z-10"
                    style={{ left: img.x + fW, top: img.y + fH, cursor: "se-resize", transform: "translate(-50%,-50%)" }}
                  />
                )}
              </div>
            );
          })}

          {/* Text items */}
          {items.filter((i): i is CanvasText => i.kind === "text").map((item) => (
            <TextItem
              key={item.id}
              item={item}
              images={images}
              isEditing={editingId === item.id}
              isSelected={selectedId === item.id}
              onPointerDown={(e) => { if (editingId === item.id) return; startMove(e, item); }}
              onDoubleClick={() => setEditingId(item.id)}
              onCommit={(text) => commitText(item.id, text)}
              onChange={(text) => setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, text } : i))}
              onResizeFontStart={(e) => startResizeTextFont(e, item)}
              onResizeWidthStart={(e, edge) => startResizeTextWidth(e, item, edge)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

/* ─── TextItem ───────────────────────────────────────────────────────────── */

interface TextLine { text: string; indent: number; }

function TextItem({
  item, images, isEditing, isSelected,
  onPointerDown, onDoubleClick, onCommit, onChange, onResizeFontStart, onResizeWidthStart,
}: {
  item: CanvasText;
  images: CanvasImage[];
  isEditing: boolean;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onCommit: (text: string) => void;
  onChange: (text: string) => void;
  onResizeFontStart: (e: React.PointerEvent) => void;
  onResizeWidthStart: (e: React.PointerEvent, edge: "left" | "right") => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lineHeight = item.fontSize * LINE_HEIGHT_RATIO;
  const fontString = `${item.fontSize}px MaryLouise, serif`;

  const lines = useMemo<TextLine[]>(() => {
    if (!item.text) return [];
    try {
      const prepared = prepareWithSegments(item.text, fontString, { whiteSpace: "pre-wrap" });
      const result: TextLine[] = [];
      let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
      let lineIndex = 0;
      while (lineIndex < 500) {
        const { indent, width } = lineLayout(lineIndex, item, lineHeight, images);
        const line = layoutNextLine(prepared, cursor, width);
        if (line === null) break;
        result.push({ text: line.text, indent });
        cursor = line.end;
        lineIndex++;
      }
      return result;
    } catch {
      return [{ text: item.text, indent: 0 }];
    }
  }, [item, fontString, lineHeight, images]);

  const totalHeight = (lines.length || 1) * lineHeight + 6;

  useEffect(() => {
    if (isEditing && taRef.current) {
      taRef.current.focus();
      const len = taRef.current.value.length;
      taRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="absolute"
      style={{
        left: item.x, top: item.y, width: item.boxWidth, height: totalHeight,
        cursor: isEditing ? "text" : "grab",
        outline: isSelected && !isEditing ? "2px solid rgba(0,120,255,0.6)" : "none",
        outlineOffset: "4px",
      }}
    >
      {isEditing ? (
        <textarea
          ref={taRef}
          value={item.text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(item.text)}
          onPointerDown={(e) => e.stopPropagation()}
          rows={1}
          className="block bg-transparent border-none outline-none resize-none overflow-hidden leading-snug w-full h-full"
          style={{ fontFamily: "MaryLouise, serif", fontSize: item.fontSize, lineHeight: LINE_HEIGHT_RATIO, color: "#1A1A1A", padding: 0, margin: 0, WebkitAppearance: "none" }}
          placeholder="Type something…"
        />
      ) : (
        <div style={{ fontFamily: "MaryLouise, serif", fontSize: item.fontSize, lineHeight: LINE_HEIGHT_RATIO, color: "#1A1A1A", position: "relative", width: item.boxWidth, height: totalHeight }}>
          {lines.map((line, i) => (
            <span key={i} style={{ position: "absolute", top: i * lineHeight, left: line.indent, whiteSpace: "pre", display: "block" }}>
              {line.text}
            </span>
          ))}
          {lines.length === 0 && <span style={{ opacity: 0.35 }}>Type something…</span>}
        </div>
      )}

      {isSelected && !isEditing && (
        <>
          <div onPointerDown={(e) => onResizeWidthStart(e, "left")}
            className="group/edge absolute top-0 bottom-0 flex items-center justify-center"
            style={{ left: -8, width: 16, cursor: "ew-resize" }}>
            <div className="w-px h-full bg-[rgba(0,120,255,0.6)] opacity-0 group-hover/edge:opacity-100 transition-opacity" />
          </div>
          <div onPointerDown={(e) => onResizeWidthStart(e, "right")}
            className="group/edge absolute top-0 bottom-0 flex items-center justify-center"
            style={{ right: -8, width: 16, cursor: "ew-resize" }}>
            <div className="w-px h-full bg-[rgba(0,120,255,0.6)] opacity-0 group-hover/edge:opacity-100 transition-opacity" />
          </div>
          <div onPointerDown={onResizeFontStart}
            className="absolute bottom-0 right-0 w-4 h-4 bg-white border border-[rgba(0,120,255,0.6)] rounded-sm"
            style={{ cursor: "se-resize", transform: "translate(50%, 50%)" }}
          />
        </>
      )}
    </div>
  );
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */

function ScissorsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="3" cy="3.5" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="3" cy="9.5" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.6 4.5L11 11M4.6 8.5L11 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function CropIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 1v7a1 1 0 001 1h7M1 3h7a1 1 0 011 1v7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function RectIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 4h14M10 4v13M7 17h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2a8 8 0 100 16c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.3-.5-.7-.5-1.1 0-1.1.9-2 2-2h2a4 4 0 000-8 8 8 0 00-5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="8.5" r="1.25" fill="currentColor" />
      <circle cx="10" cy="5.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 7H13a4 4 0 010 8H6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 4L4 7l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="2" y="4" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7.5" cy="9" r="1.75" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 15l4.5-4.5a1 1 0 011.4 0L12 14.5l2.5-2.5a1 1 0 011.4 0L20 15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
