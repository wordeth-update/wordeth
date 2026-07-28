import React, { useState } from 'react';
import { Key, Search, Users, Activity, Radio, Lock, Headphones } from 'lucide-react';
import './_group.css';

const ROOMS = [
  { id: 1, rank: "01", title: "Kendrick vs Drake: who had better bars?", host: "@hiphophead", genre: "Hip-Hop", listeners: "1.4k", isLive: true, tokenCost: 0 },
  { id: 2, rank: "02", title: "SZA album listening party", host: "@rnbvibes", genre: "R&B", listeners: "850", isLive: true, tokenCost: 50 },
  { id: 3, rank: "03", title: "Bad Bunny's impact on Latin Pop", host: "@latinpop", genre: "Latin", listeners: "900", isLive: true, tokenCost: 10 },
  { id: 4, rank: "04", title: "Afrobeats to the world", host: "@dj_t", genre: "Afrobeats", listeners: "420", isLive: true, tokenCost: 0 },
  { id: 5, rank: "05", title: "Synthwave classics", host: "@neon_dreams", genre: "Electronic", listeners: "310", isLive: true, tokenCost: 0 },
  { id: 6, rank: "06", title: "Underground rap battle", host: "@bars_only", genre: "Hip-Hop", listeners: "210", isLive: true, tokenCost: 0 },
  { id: 7, rank: "07", title: "90s RnB Slow Jams", host: "@smooth", genre: "R&B", listeners: "560", isLive: true, tokenCost: 0 },
  { id: 8, rank: "08", title: "Pop vocal analysis", host: "@vocalcoach", genre: "Pop", listeners: "120", isLive: true, tokenCost: 20 },
  { id: 9, rank: "09", title: "Drill beats showcase", host: "@prodbyx", genre: "Hip-Hop", listeners: "180", isLive: true, tokenCost: 5 },
  { id: 10, rank: "10", title: "Classic Rock Deep Dives", host: "@rockhistorian", genre: "Rock", listeners: "245", isLive: true, tokenCost: 0 },
];

const GENRES = ["All", "Hip-Hop", "R&B", "Pop", "Rock", "Afrobeats", "Latin", "Electronic"];

export function StationDial() {
  const [activeGenre, setActiveGenre] = useState("All");
  const [mode, setMode] = useState<'live'|'replays'>('live');
  const [sortTab, setSortTab] = useState("Live Now");

  return (
    <div className="station-dial-root min-h-screen w-full bg-[var(--bg)] text-[var(--text-primary)] font-outfit relative flex flex-col">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-20 bg-[var(--bg)] flex flex-col shadow-[0_10px_20px_rgba(0,0,0,0.5)]">
        
        {/* Top Bar: Stats & Balance */}
        <header className="px-4 py-3 flex justify-between items-center border-b border-[var(--border)]">
          <div className="flex flex-col">
            <div className="font-syne font-bold text-xl tracking-tight text-white flex items-center gap-2">
              <Radio size={20} className="text-[var(--mint)]" />
              VERSES
            </div>
            <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)] font-medium mt-0.5 uppercase tracking-wider">
              <span className="flex items-center gap-1"><Activity size={10} className="text-[var(--mint)]" /> 842 Live</span>
              <span className="flex items-center gap-1"><Users size={10} className="text-[var(--violet)]" /> 12.4k Active</span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-[var(--surface)] px-2.5 py-1.5 rounded-full border border-[var(--border)] shadow-[inset_0_0_10px_rgba(0,229,168,0.05)]">
            <span className="text-[var(--mint)] font-syne font-bold text-sm leading-none pt-0.5">450</span>
            <span className="text-[9px] text-white/50 font-bold tracking-widest leading-none pt-0.5">$WRD</span>
          </div>
        </header>

        {/* Search & Mode */}
        <div className="px-4 py-3 flex gap-3 items-center border-b border-[var(--border)] bg-[var(--surface)]/50 backdrop-blur-md">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input 
              type="text" 
              placeholder="Search stations, artists..." 
              className="w-full bg-[var(--bg)] text-xs rounded-lg pl-8 pr-3 py-2 border border-[var(--border)] focus:outline-none focus:border-[var(--violet)] text-white placeholder:text-[var(--text-secondary)] font-medium transition-colors shadow-inner"
            />
          </div>
          <div className="flex bg-[var(--bg)] p-0.5 rounded-lg border border-[var(--border)] flex-shrink-0">
            <button 
              onClick={() => setMode('live')}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors ${mode === 'live' ? 'bg-[var(--violet)] text-white shadow-[0_0_10px_rgba(139,47,255,0.3)]' : 'text-[var(--text-secondary)] hover:text-white'}`}
            >
              Live
            </button>
            <button 
              onClick={() => setMode('replays')}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors ${mode === 'replays' ? 'bg-[var(--violet)] text-white shadow-[0_0_10px_rgba(139,47,255,0.3)]' : 'text-[var(--text-secondary)] hover:text-white'}`}
            >
              Replays
            </button>
          </div>
        </div>

        {/* Filters & Sort */}
        <div className="bg-[var(--bg)]">
          <div className="px-4 py-3 overflow-x-auto no-scrollbar flex gap-2">
            {GENRES.map(g => (
              <button 
                key={g} 
                onClick={() => setActiveGenre(g)}
                className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-all ${
                  activeGenre === g 
                    ? 'bg-[var(--mint)]/10 border-[var(--mint)] text-[var(--mint)] shadow-[0_0_10px_rgba(0,229,168,0.15)]' 
                    : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:border-gray-500'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="px-4 pt-1 pb-0 flex gap-6 border-b border-[var(--border)]">
            {["Live Now", "Trending", "Most Listeners"].map((tab) => (
              <button 
                key={tab} 
                onClick={() => setSortTab(tab)}
                className={`text-xs font-syne font-bold whitespace-nowrap pb-2.5 border-b-2 transition-all ${sortTab === tab ? 'text-white border-[var(--mint)]' : 'text-[var(--text-secondary)] border-transparent hover:text-white/80'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="p-4 pb-28 grid grid-cols-2 gap-3 flex-1 items-stretch content-start">
        {ROOMS.filter(r => activeGenre === "All" || r.genre === activeGenre).map(room => (
          <div key={room.id} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-3 flex flex-col gap-2 relative overflow-hidden group hover:border-[var(--mint)]/50 transition-colors shadow-sm">
            
            {/* Rank and Genre */}
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1.5">
                <span className="font-syne font-black text-xs text-[var(--text-secondary)]/50">{room.rank}</span>
                <span className="text-[8px] uppercase tracking-widest font-bold text-[var(--text-primary)] bg-[var(--border)] px-1.5 py-0.5 rounded-sm">
                  {room.genre}
                </span>
              </div>
              {room.tokenCost > 0 ? (
                <span className="text-[10px] font-syne font-bold text-[var(--violet)] flex items-center gap-0.5">
                  <Lock size={10} /> {room.tokenCost}
                </span>
              ) : (
                <span className="text-[10px] font-bold text-[var(--mint)] flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--mint)] animate-pulse shadow-[0_0_5px_#00E5A8]"></div>
                </span>
              )}
            </div>

            {/* Title */}
            <div className="flex-1 flex flex-col justify-start mt-1">
              <h3 className="font-syne font-bold text-sm leading-[1.2] text-gray-100 line-clamp-3">
                {room.title}
              </h3>
            </div>
            
            {/* Footer */}
            <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span className="truncate pr-2 font-medium text-[10px]">{room.host}</span>
              <span className="flex items-center gap-1 flex-shrink-0 font-syne text-[var(--mint)] text-[10px] font-bold">
                <Headphones size={10} className="text-[var(--text-secondary)]" />
                {room.listeners}
              </span>
            </div>
            
            {/* subtle hover gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--mint)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
          </div>
        ))}
      </div>

      {/* Floating CTA */}
      <div className="fixed bottom-6 left-0 right-0 px-4 flex justify-center pointer-events-none z-30">
        <button className="pointer-events-auto bg-[var(--mint)] hover:bg-[#00c993] text-black font-syne font-extrabold text-sm tracking-wide px-8 py-3.5 rounded-full flex items-center gap-2 shadow-[0_0_30px_rgba(0,229,168,0.3)] border border-[#00E5A8]/50 transition-all active:scale-95 hover:shadow-[0_0_40px_rgba(0,229,168,0.5)]">
          <Key size={16} strokeWidth={2.5} />
          OPEN A ROOM
        </button>
      </div>

    </div>
  );
}
