export default function FeedPage() {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Feed */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 pt-5 pb-10 flex flex-col gap-3 items-center">
          {/* Feed item */}
          <FeedItem
            timestamp="Today at 12:29 PM"
            bgColor="#C4736A"
            text={[
              "Dear Finn,",
              "I miss you!! Hope the hiking is treating you well.",
              "",
              "This Friday, Pabb and I went to a James Blake ballet at the War Memorial Museum. It was super cool.",
              "",
              "I swam on Sunday and went running near Tam. Weather here is like summer at the minute. I want it to last forever.",
              "",
              "Stopped for a cardamom bun at Equator. Yumm",
            ]}
          />
        </div>
      </main>
    </div>
  );
}

/* ─── Feed Item ─────────────────────────────────────────────────────────── */

function FeedItem({
  timestamp,
  bgColor,
  text,
}: {
  timestamp: string;
  bgColor: string;
  text: string[];
}) {
  return (
    <div className="flex flex-col items-center w-full">
      {/* Timestamp */}
      <p
        className="text-[13px] text-[#999] mb-2 px-1 self-start"
        style={{ width: "min(92vw, calc((100dvh - 160px) * 0.75))" }}
      >
        {timestamp}
      </p>

      {/* Postcard */}
      <div
        className="rounded-2xl overflow-hidden p-5 relative"
        style={{
          backgroundColor: bgColor,
          fontFamily: "MaryLouise, serif",
          aspectRatio: "4/3",
          width: "min(92vw, calc((100dvh - 160px) * (4/3)))",
        }}
      >
        {/* Top-right photos */}
        <div className="absolute top-5 right-4 flex flex-col gap-2">
          <PhotoFrame className="w-[130px] h-[96px]" rotate={1.5} />
          <PhotoFrame className="w-[130px] h-[100px]" rotate={-1} />
        </div>

        {/* Text — right-padded to leave room for photos */}
        <div
          className="text-[17px] leading-[1.55] text-[#1A1A1A] pr-[150px]"
        >
          {text.map((line, i) =>
            line === "" ? (
              <div key={i} className="h-3" />
            ) : (
              <p key={i}>{line}</p>
            )
          )}
        </div>

        {/* Bottom-left photo */}
        <div className="mt-4 flex items-start gap-4">
          <PhotoFrame className="w-[130px] h-[110px] flex-shrink-0" rotate={-2} />
          <p
            className="text-[17px] leading-[1.55] text-[#1A1A1A] mt-1"
          >
            Stopped for a cardamom bun at Equator. Yumm
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Photo Frame placeholder ───────────────────────────────────────────── */

function PhotoFrame({
  className,
  rotate,
}: {
  className?: string;
  rotate: number;
}) {
  return (
    <div
      className={`bg-white p-1.5 shadow-sm flex-shrink-0 ${className ?? ""}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <div className="w-full h-full bg-[#D9D0C8]" />
    </div>
  );
}

