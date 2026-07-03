export function ScannerAnimation() {
  return (
    <div className="relative mx-auto flex h-56 w-56 items-center justify-center">
      <style>{`
        .perspective-container {
          perspective: 1000px;
        }
        .transform-3d {
          transform-style: preserve-3d;
          transform: rotateX(55deg) rotateZ(-45deg);
          transition: transform 0.5s ease;
        }
        .transform-3d:hover {
          transform: rotateX(45deg) rotateZ(-35deg) translateZ(10px);
        }
        .animate-scan-laser {
          animation: scan-laser 2.5s ease-in-out infinite;
        }
        .animate-scan-glow {
          animation: scan-glow 2.5s ease-in-out infinite;
        }
        @keyframes scan-laser {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes scan-glow {
          0% { top: -20px; opacity: 0; height: 0px; }
          10% { opacity: 0.2; height: 40px; }
          90% { opacity: 0.2; height: 40px; }
          100% { top: calc(100% - 20px); opacity: 0; height: 0px; }
        }
        .float-1 { animation: float 3s ease-in-out infinite; }
        .float-2 { animation: float 4s ease-in-out infinite 1s; }
        .float-3 { animation: float 3.5s ease-in-out infinite 2s; }
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateZ(30px) rotateX(-55deg) rotateZ(45deg); }
          50% { transform: translateY(-10px) translateZ(30px) rotateX(-55deg) rotateZ(45deg); }
        }
      `}</style>
      
      <div className="perspective-container relative h-full w-full flex items-center justify-center">
        {/* The Document */}
        <div className="transform-3d relative h-40 w-32 rounded-lg bg-white shadow-[10px_10px_30px_rgba(0,0,0,0.1),-1px_-1px_0px_rgba(255,255,255,1)] ring-1 ring-zinc-200 overflow-hidden">
          {/* Document Content Grid */}
          <div className="absolute inset-0 p-3 flex flex-col gap-2 opacity-40">
            <div className="h-2 w-1/2 rounded bg-zinc-300"></div>
            <div className="h-1.5 w-3/4 rounded bg-zinc-200"></div>
            
            <div className="mt-2 flex gap-2">
              <div className="h-8 w-8 rounded bg-zinc-100"></div>
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-1.5 w-full rounded bg-zinc-200"></div>
                <div className="h-1.5 w-5/6 rounded bg-zinc-200"></div>
                <div className="h-1.5 w-4/6 rounded bg-zinc-200"></div>
              </div>
            </div>
            
            <div className="mt-auto h-1.5 w-1/3 rounded bg-zinc-200"></div>
          </div>
          
          {/* Laser Line */}
          <div className="animate-scan-laser absolute left-0 right-0 h-[2px] bg-blue-500 shadow-[0_0_15px_3px_rgba(59,130,246,0.6)] z-20" />
          
          {/* Laser Glow Area */}
          <div className="animate-scan-glow absolute left-0 right-0 bg-gradient-to-b from-transparent via-blue-400/20 to-transparent z-10" />
        </div>

        {/* Floating Data Nodes (Counter-rotated to face camera) */}
        <div className="absolute float-1 -right-2 top-8 rounded-lg bg-zinc-900/90 backdrop-blur-sm px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-white shadow-xl ring-1 ring-white/10">
          <span className="text-blue-400">#</span> EXTRACTING
        </div>
        
        <div className="absolute float-2 -left-4 bottom-12 rounded-lg bg-white/90 backdrop-blur-sm px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-zinc-800 shadow-xl ring-1 ring-zinc-200">
          <span className="text-emerald-500 mr-1">✓</span> PARSED
        </div>
      </div>
      
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 -z-10 rounded-full bg-blue-500/5 blur-[50px] animate-pulse" />
    </div>
  );
}
