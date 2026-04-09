"use client";

import { useState, useCallback, useEffect, useRef } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface CanvasImage {
  kind: "image";
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
}

interface CanvasText {
  kind: "text";
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  boxWidth: number; // controls text wrapping
}

type CanvasItem = CanvasImage | CanvasText;

type DragOp =
  | { kind: "move"; id: string; ox: number; oy: number }
  | { kind: "resize-image"; id: string; startX: number; startW: number }
  | { kind: "resize-text-font"; id: string; startX: number; startFontSize: number }
  | { kind: "resize-text-width"; id: string; edge: "left" | "right"; startX: number; startBoxWidth: number; startItemX: number };

/* ─── Main component ─────────────────────────────────────────────────────── */

export default function CreatePage() {
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragOp | null>(null);

  const hasContent = items.length > 0;

  /* ── Global pointer move / up ─────────────────────────────────────────── */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const op = dragRef.current;
      if (!op || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();

      if (op.kind === "move") {
        const x = Math.max(0, (e.clientX - rect.left) - op.ox);
        const y = Math.max(0, (e.clientY - rect.top) - op.oy);
        setItems((prev) =>
          prev.map((item) => (item.id === op.id ? { ...item, x, y } : item))
        );
      } else if (op.kind === "resize-image") {
        const dx = e.clientX - op.startX;
        const newW = Math.max(60, Math.min(op.startW + dx, rect.width * 0.95));
        setItems((prev) =>
          prev.map((item) =>
            item.id === op.id && item.kind === "image" ? { ...item, width: newW } : item
          )
        );
      } else if (op.kind === "resize-text-font") {
        const dx = e.clientX - op.startX;
        const newSize = Math.max(10, Math.min(op.startFontSize + dx / 3, 120));
        setItems((prev) =>
          prev.map((item) =>
            item.id === op.id && item.kind === "text" ? { ...item, fontSize: newSize } : item
          )
        );
      } else if (op.kind === "resize-text-width") {
        const dx = e.clientX - op.startX;
        if (op.edge === "right") {
          const newW = Math.max(60, op.startBoxWidth + dx);
          setItems((prev) =>
            prev.map((item) =>
              item.id === op.id && item.kind === "text" ? { ...item, boxWidth: newW } : item
            )
          );
        } else {
          // left edge: move x and shrink width inversely
          const newW = Math.max(60, op.startBoxWidth - dx);
          const newX = op.startItemX + (op.startBoxWidth - newW);
          setItems((prev) =>
            prev.map((item) =>
              item.id === op.id && item.kind === "text" ? { ...item, boxWidth: newW, x: newX } : item
            )
          );
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

  /* ── Start move ───────────────────────────────────────────────────────── */
  const startMove = useCallback((e: React.PointerEvent, item: CanvasItem) => {
    e.stopPropagation();
    setSelectedId(item.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      kind: "move",
      id: item.id,
      ox: e.clientX - rect.left - item.x,
      oy: e.clientY - rect.top - item.y,
    };
  }, []);

  /* ── Start resize (image) ─────────────────────────────────────────────── */
  const startResizeImage = useCallback((e: React.PointerEvent, item: CanvasImage) => {
    e.stopPropagation();
    dragRef.current = { kind: "resize-image", id: item.id, startX: e.clientX, startW: item.width };
  }, []);

  /* ── Start resize (text font size) ───────────────────────────────────── */
  const startResizeTextFont = useCallback((e: React.PointerEvent, item: CanvasText) => {
    e.stopPropagation();
    dragRef.current = { kind: "resize-text-font", id: item.id, startX: e.clientX, startFontSize: item.fontSize };
  }, []);

  /* ── Start resize (text box width) ───────────────────────────────────── */
  const startResizeTextWidth = useCallback((e: React.PointerEvent, item: CanvasText, edge: "left" | "right") => {
    e.stopPropagation();
    dragRef.current = {
      kind: "resize-text-width",
      id: item.id,
      edge,
      startX: e.clientX,
      startBoxWidth: item.boxWidth,
      startItemX: item.x,
    };
  }, []);

  /* ── Add text ─────────────────────────────────────────────────────────── */
  const addText = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    const id = crypto.randomUUID();
    const boxWidth = width * 0.55;
    setItems((prev) => [
      ...prev,
      { kind: "text", id, x: (width - boxWidth) / 2, y: height * 0.1, text: "", fontSize: 18, boxWidth },
    ]);
    setSelectedId(id);
    setEditingId(id);
  }, []);

  /* ── Drop photos ──────────────────────────────────────────────────────── */
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
        setItems((prev) => [
          ...prev,
          { kind: "image", id, src, x: (rect.width - w) / 2 + i * 16, y: rect.height * 0.15 + i * 16, width: w },
        ]);
        setSelectedId(id);
      });
  }, []);

  /* ── Undo ─────────────────────────────────────────────────────────────── */
  const handleUndo = useCallback(() => {
    setItems((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      if (last.kind === "image") URL.revokeObjectURL(last.src);
      return prev.slice(0, -1);
    });
    setSelectedId(null);
    setEditingId(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !editingId) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, editingId]);

  /* ── Commit text (remove if empty) ───────────────────────────────────── */
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
      onPointerDown={() => { setSelectedId(null); setEditingId(null); }}
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
          <button
            onClick={handleUndo}
            disabled={!hasContent}
            className="w-9 h-9 flex items-center justify-center text-[#1A1A1A] hover:opacity-60 transition-opacity disabled:opacity-25"
            aria-label="Undo"
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
          style={{
            aspectRatio: "3/4",
            width: "min(92vw, calc((100dvh - 160px) * 0.75))",
            borderColor: isDragOver ? "#AAAAAA" : "#D7D7D7",
          }}
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
          {items.filter((i): i is CanvasImage => i.kind === "image").map((img) => (
            <div
              key={img.id}
              onPointerDown={(e) => startMove(e, img)}
              className="absolute"
              style={{
                left: img.x, top: img.y, width: img.width,
                cursor: "grab",
                outline: selectedId === img.id ? "2px solid rgba(0,120,255,0.6)" : "none",
                outlineOffset: "2px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt="" draggable={false} className="w-full block" />
              {selectedId === img.id && (
                <div
                  onPointerDown={(e) => startResizeImage(e, img)}
                  className="absolute bottom-0 right-0 w-4 h-4 bg-white border border-[rgba(0,120,255,0.6)] rounded-sm"
                  style={{ cursor: "se-resize", transform: "translate(50%,50%)" }}
                />
              )}
            </div>
          ))}

          {/* Text items */}
          {items.filter((i): i is CanvasText => i.kind === "text").map((item) => (
            <TextItem
              key={item.id}
              item={item}
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

function TextItem({
  item,
  isEditing,
  isSelected,
  onPointerDown,
  onDoubleClick,
  onCommit,
  onChange,
  onResizeFontStart,
  onResizeWidthStart,
}: {
  item: CanvasText;
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

  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 6 + "px";
  }, []);

  // Re-grow whenever font size, box width, or text changes
  useEffect(() => { autoGrow(); }, [item.fontSize, item.boxWidth, item.text, autoGrow]);

  useEffect(() => {
    if (isEditing && taRef.current) {
      taRef.current.focus();
      const len = taRef.current.value.length;
      taRef.current.setSelectionRange(len, len);
      autoGrow();
    }
  }, [isEditing, autoGrow]);

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className="absolute"
      style={{
        left: item.x,
        top: item.y,
        cursor: isEditing ? "text" : "grab",
        outline: isSelected && !isEditing ? "2px solid rgba(0,120,255,0.6)" : "none",
        outlineOffset: "4px",
      }}
    >
      <textarea
        ref={taRef}
        value={item.text}
        readOnly={!isEditing}
        onChange={(e) => { onChange(e.target.value); autoGrow(); }}
        onBlur={() => onCommit(item.text)}
        onPointerDown={(e) => isEditing && e.stopPropagation()}
        rows={1}
        className="block bg-transparent border-none outline-none resize-none overflow-hidden leading-snug"
        style={{
          fontFamily: "MaryLouise, serif",
          fontSize: item.fontSize,
          color: "#1A1A1A",
          width: item.boxWidth,
          padding: 0,
          margin: 0,
          WebkitAppearance: "none",
          caretColor: isEditing ? "#1A1A1A" : "transparent",
          cursor: isEditing ? "text" : "grab",
        }}
        placeholder={isEditing ? "Type something…" : ""}
      />

      {isSelected && !isEditing && (
        <>
          {/* Left edge — resize box width */}
          <div
            onPointerDown={(e) => onResizeWidthStart(e, "left")}
            className="group/edge absolute top-0 bottom-0 flex items-center justify-center"
            style={{ left: -8, width: 16, cursor: "ew-resize" }}
          >
            <div className="w-px h-full bg-[rgba(0,120,255,0.6)] opacity-0 group-hover/edge:opacity-100 transition-opacity" />
          </div>

          {/* Right edge — resize box width */}
          <div
            onPointerDown={(e) => onResizeWidthStart(e, "right")}
            className="group/edge absolute top-0 bottom-0 flex items-center justify-center"
            style={{ right: -8, width: 16, cursor: "ew-resize" }}
          >
            <div className="w-px h-full bg-[rgba(0,120,255,0.6)] opacity-0 group-hover/edge:opacity-100 transition-opacity" />
          </div>

          {/* Bottom-right corner — resize font size */}
          <div
            onPointerDown={onResizeFontStart}
            className="absolute bottom-0 right-0 w-4 h-4 bg-white border border-[rgba(0,120,255,0.6)] rounded-sm"
            style={{ cursor: "se-resize", transform: "translate(50%, 50%)" }}
          />
        </>
      )}
    </div>
  );
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */

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
