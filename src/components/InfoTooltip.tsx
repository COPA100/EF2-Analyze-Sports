import { useState } from "react";

export default function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="w-5 h-5 rounded-full bg-gray-600/80 hover:bg-blue-500/60 text-gray-300 hover:text-white text-[11px] font-bold leading-none flex items-center justify-center transition-colors cursor-help border border-gray-500/50 hover:border-blue-400/60"
        aria-label="Info"
      >
        i
      </button>
      {show && (
        <div className="absolute z-50 right-0 top-full mt-1 w-52 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 shadow-lg leading-relaxed pointer-events-none">
          {text}
        </div>
      )}
    </div>
  );
}
