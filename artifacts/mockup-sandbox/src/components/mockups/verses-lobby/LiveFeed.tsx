import React, { useState } from 'react';
import { Search, Mic, Users, Coins, Key, Play, ChevronRight, Flame } from 'lucide-react';

const FEATURED_ROOMS = [
  {
    id: 'f1',
    title: 'Kendrick vs Drake: The Final Verdict',
    host: '@hiphophistory',
    listeners: 4200,
    genre: 'Hip-Hop',
    isLive: true,
    tokenGate: 0,
    image: 'https://images.unsplash.com/photo-1571266028243-cb20dbf01344?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'f2',
    title: 'SZA "SOS" Anniversary Listening Party',
    host: '@rnb_vessel',
    listeners: 2150,
    genre: 'R&B',
    isLive: true,
    tokenGate: 5,
    image: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=800&auto=format&fit=crop',
  }
];

const ROOMS = [
  { id: 'r1', title: 'Underground London Grime scene 🇬🇧', host: '@uk_bars', listeners: 843, genre: 'Hip-Hop', tokenGate: 0 },
  { id: 'r2', title: 'Producers only: flipping 70s soul samples', host: '@beatmakers', listeners: 412, genre: 'Electronic', tokenGate: 10 },
  { id: 'r3', title: 'Bad Bunny discography ranked', host: '@latinvibes', listeners: 1205, genre: 'Latin', tokenGate: 0 },
  { id: 'r4', title: 'Afrobeats taking over the globe 🌍', host: '@naijaboy', listeners: 3200, genre: 'Afrobeats', tokenGate: 0 },
  { id: 'r5', title: 'Pop punk revival: fleeting trend?', host: '@rocknrol', listeners: 210, genre: 'Rock', tokenGate: 2 },
  { id: 'r6', title: 'Top 10 verses of 2023', host: '@rapcritic', listeners: 550, genre: 'Hip-Hop', tokenGate: 0 },
  { id: 'r7', title: 'Midnight R&B feels 🌙', host: '@latenight', listeners: 900, genre: 'R&B', tokenGate: 0 },
  { id: 'r8', title: 'House music & chill', host: '@dj_pulse', listeners: 110, genre: 'Electronic', tokenGate: 0 },
];

const GENRES = ['All', 'Hip-Hop', 'R&B', 'Afrobeats', 'Latin', 'Pop', 'Rock', 'Electronic'];

export function LiveFeed() {
  const [activeMode, setActiveMode] = useState<'Live' | 'Replays'>('Live');
  const [activeGenre, setActiveGenre] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="w-full h-full min-h-[100dvh] bg-[#060409] text-white font-body overflow-hidden flex flex-col relative">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Syne:wght@500;600;700;800&display=swap');
        
        .font-display { font-family: 'Syne', sans-serif; }
        .font-body { font-family: 'Outfit', sans-serif; }
        
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-12 pb-4 shrink-0 bg-[#060409]/95 backdrop-blur-md z-20 sticky top-0">
        <div className="flex items-center gap-2">
          <h1 className="font-display font-bold text-2xl text-white tracking-tight">VERSES</h1>
          <div className="flex flex-col ml-2 border-l border-white/10 pl-3">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Live Rooms</span>
            <span className="text-xs text-[#00E5A8] font-bold">543</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-full border border-white/5 shadow-inner">
            <Coins size={14} className="text-[#8B2FFF]" />
            <span className="text-sm font-semibold tracking-tight text-zinc-200">24</span>
          </div>
          <button className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8B2FFF] to-[#00E5A8] p-[2px] transition hover:scale-105 active:scale-95">
            <div className="w-full h-full bg-[#060409] rounded-full overflow-hidden">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop" alt="User avatar" />
            </div>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-28">
        {/* Sticky Controls Container */}
        <div className="sticky top-0 bg-[#060409]/95 backdrop-blur-md z-10 pt-2 pb-4 border-b border-white/5">
          {/* Tabs */}
          <div className="px-4 mb-4">
            <div className="flex items-center bg-white/5 p-1 rounded-2xl">
              <button 
                onClick={() => setActiveMode('Live')}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                  activeMode === 'Live' ? 'bg-[#2A2A2A] text-white shadow-md' : 'text-zinc-500 hover:text-white'
                }`}
              >
                Live
              </button>
              <button 
                onClick={() => setActiveMode('Replays')}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                  activeMode === 'Replays' ? 'bg-[#2A2A2A] text-white shadow-md' : 'text-zinc-500 hover:text-white'
                }`}
              >
                Replays
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div className="px-4 mb-4">
            <div className="relative group">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-[#00E5A8] transition-colors" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rooms, artists, beefs..." 
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-[#00E5A8]/50 focus:ring-1 focus:ring-[#00E5A8]/50 transition-all placeholder-zinc-600 font-body shadow-inner"
              />
            </div>
          </div>

          {/* Filter Chips */}
          <div className="overflow-x-auto no-scrollbar flex items-center gap-2 px-4">
            {GENRES.map(g => (
              <button 
                key={g} 
                onClick={() => setActiveGenre(g)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-300 ${
                  activeGenre === g 
                    ? 'bg-[#8B2FFF] text-white border-[#8B2FFF] shadow-[0_0_15px_rgba(139,47,255,0.3)]' 
                    : 'bg-transparent text-zinc-400 border-white/10 hover:border-white/30 hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Featured Carousel */}
        <div className="mt-6 mb-8">
          <div className="px-4 mb-4 flex items-center justify-between">
            <h2 className="font-display font-extrabold text-xl flex items-center gap-2 text-white">
              <Flame size={20} className="text-[#00E5A8] animate-pulse" fill="#00E5A8" fillOpacity={0.2} /> 
              Featured
            </h2>
          </div>
          
          <div className="flex overflow-x-auto no-scrollbar gap-4 snap-x snap-mandatory px-4 pb-4">
            {FEATURED_ROOMS.map(room => (
              <div key={room.id} className="snap-center shrink-0 w-[290px] h-[360px] rounded-[32px] relative overflow-hidden group border border-white/10 shadow-xl">
                <img src={room.image} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={room.title} />
                <div className="absolute inset-0 bg-gradient-to-b from-[#060409]/40 via-[#060409]/20 to-[#060409] opacity-90" />
                
                <div className="absolute inset-x-0 bottom-0 p-6 flex flex-col justify-end h-full">
                  <div className="flex items-center gap-2 mb-4">
                    {room.isLive && (
                      <span className="bg-[#00E5A8]/20 text-[#00E5A8] border border-[#00E5A8]/30 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide flex items-center gap-1.5 backdrop-blur-md">
                        <span className="w-1.5 h-1.5 bg-[#00E5A8] rounded-full animate-pulse shadow-[0_0_8px_#00E5A8]"></span> LIVE
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5 bg-black/40 border border-white/5 px-2.5 py-1 rounded-full backdrop-blur-md">
                      <Users size={12} className="text-zinc-400" /> {room.listeners.toLocaleString()}
                    </span>
                    {room.tokenGate > 0 && (
                       <span className="text-[11px] font-semibold text-white flex items-center gap-1.5 bg-[#8B2FFF]/20 border border-[#8B2FFF]/40 px-2.5 py-1 rounded-full backdrop-blur-md">
                       <Coins size={12} className="text-[#8B2FFF]" /> {room.tokenGate}
                     </span>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="font-display font-bold text-2xl leading-tight mb-2 text-white group-hover:text-[#00E5A8] transition-colors">{room.title}</h3>
                    <p className="text-zinc-400 text-sm font-medium flex items-center gap-1">
                      Host <span className="text-white bg-white/10 px-2 py-0.5 rounded-md ml-1">{room.host}</span>
                    </p>
                  </div>
                  
                  <button className="w-full mt-5 py-3.5 bg-white text-black font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-[#00E5A8] active:scale-95 transition-all shadow-[0_4px_14px_rgba(255,255,255,0.25)]">
                    Join Verse <ChevronRight size={18} strokeWidth={3} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vertical Feed */}
        <div className="px-4 flex flex-col">
          <h2 className="font-display font-extrabold text-lg mb-4 text-zinc-100">Trending Now</h2>
          <div className="flex flex-col gap-2">
            {ROOMS.map(room => (
              <div key={room.id} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/10 transition-all rounded-2xl group cursor-pointer active:scale-[0.98]">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="relative w-[52px] h-[52px] rounded-2xl bg-[#060409] flex items-center justify-center shrink-0 border border-white/10 overflow-hidden group-hover:border-[#8B2FFF]/50 transition-colors">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#8B2FFF]/10 to-transparent"></div>
                    <Mic size={22} className="text-zinc-400 group-hover:text-[#8B2FFF] transition-colors relative z-10" />
                    {room.tokenGate > 0 && (
                      <div className="absolute top-0 right-0 w-full h-full flex items-start justify-end p-1">
                        <div className="w-2 h-2 rounded-full bg-[#8B2FFF]"></div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col flex-1 min-w-0 pr-2">
                    <h4 className="font-display font-semibold text-[15px] truncate text-zinc-100 group-hover:text-white transition-colors">{room.title}</h4>
                    <div className="flex items-center gap-2 text-[13px] text-zinc-500 mt-0.5">
                      <span className="truncate font-medium text-zinc-400">{room.host}</span>
                      <span className="text-[10px] text-zinc-700">•</span>
                      <span className="flex items-center gap-1 font-medium">
                        <Users size={12} className="text-zinc-500" /> {room.listeners}
                      </span>
                    </div>
                  </div>
                </div>
                
                <button className="shrink-0 w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center group-hover:bg-[#8B2FFF] group-hover:text-white transition-all text-zinc-400 border border-white/5 group-hover:border-[#8B2FFF]">
                  {room.tokenGate > 0 ? (
                    <Key size={18} className="group-hover:text-white transition-colors" />
                  ) : (
                    <Play size={18} className="ml-0.5 group-hover:text-white transition-colors" fill="currentColor" fillOpacity={0.2} />
                  )}
                </button>
              </div>
            ))}
          </div>
          
          {/* Loading Indicator */}
          <div className="py-10 flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-[3px] border-[#00E5A8]/20 border-t-[#00E5A8] rounded-full animate-spin"></div>
            <span className="text-xs text-zinc-600 font-medium">Loading deeper cuts...</span>
          </div>
        </div>
      </div>

      {/* Floating CTA */}
      <div className="absolute bottom-6 left-0 right-0 px-4 flex justify-center pointer-events-none z-30">
        <button className="pointer-events-auto bg-gradient-to-r from-[#8B2FFF] to-[#5a1bb5] text-white px-8 py-4 rounded-full font-display font-bold shadow-[0_8px_30px_rgba(139,47,255,0.4)] flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all w-full max-w-[320px] border border-white/10 group">
          <div className="bg-white/10 p-1.5 rounded-full group-hover:rotate-12 transition-transform">
            <Key size={18} className="text-[#00E5A8]" /> 
          </div>
          <span className="text-[15px] tracking-wide">Open a Room</span>
        </button>
      </div>
      
      {/* Bottom Gradient for smooth scroll hiding under CTA */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#060409] to-transparent pointer-events-none z-20" />
    </div>
  );
}
