import { Search, Plus, Users, Radio, Lock, ChevronRight } from "lucide-react";
import { useState } from "react";

export function ChannelGuide() {
  const [activeTab, setActiveTab] = useState<"live" | "replays">("live");
  const [searchQuery, setSearchQuery] = useState("");

  // Mock data
  const stats = {
    activeUsers: 12847,
    liveRooms: 234,
  };

  const userTokens = 1250;

  const genreRows = [
    {
      title: "🔥 Hot Right Now",
      rooms: [
        {
          id: 1,
          name: "Kendrick vs Drake: who had the better bars?",
          genre: "Hip-Hop",
          host: "MC_Theory",
          listeners: 847,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 2,
          name: "SZA album listening party",
          genre: "R&B",
          host: "SoulVibes",
          listeners: 623,
          isLive: true,
          tokenGated: 50,
        },
        {
          id: 3,
          name: "Travis Scott production breakdown",
          genre: "Hip-Hop",
          host: "BeatArchitect",
          listeners: 412,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 4,
          name: "Is Afrobeats taking over the world?",
          genre: "Afrobeats",
          host: "GlobalSound",
          listeners: 389,
          isLive: true,
          tokenGated: false,
        },
      ],
    },
    {
      title: "Hip-Hop",
      rooms: [
        {
          id: 5,
          name: "Metro Boomin's best beats ranked",
          genre: "Hip-Hop",
          host: "ProducerTalk",
          listeners: 234,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 6,
          name: "90s vs 2020s: Golden Age debate",
          genre: "Hip-Hop",
          host: "HipHopHistorian",
          listeners: 198,
          isLive: true,
          tokenGated: 100,
        },
        {
          id: 7,
          name: "New York drill scene deep dive",
          genre: "Hip-Hop",
          host: "DrillWatch",
          listeners: 156,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 8,
          name: "J. Cole lyrical analysis session",
          genre: "Hip-Hop",
          host: "LyricLab",
          listeners: 142,
          isLive: true,
          tokenGated: false,
        },
      ],
    },
    {
      title: "R&B",
      rooms: [
        {
          id: 9,
          name: "Brent Faiyaz midnight listening",
          genre: "R&B",
          host: "LateNightVibes",
          listeners: 267,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 10,
          name: "Summer Walker vocal appreciation",
          genre: "R&B",
          host: "VocalCoach",
          listeners: 189,
          isLive: true,
          tokenGated: 75,
        },
        {
          id: 11,
          name: "90s R&B love songs deep cut marathon",
          genre: "R&B",
          host: "NostalgiaKing",
          listeners: 134,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 12,
          name: "The Weeknd trilogy revisited",
          genre: "R&B",
          host: "TrilogyFan",
          listeners: 112,
          isLive: true,
          tokenGated: false,
        },
      ],
    },
    {
      title: "Afrobeats",
      rooms: [
        {
          id: 13,
          name: "Burna Boy Grammy performance breakdown",
          genre: "Afrobeats",
          host: "AfroExpert",
          listeners: 298,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 14,
          name: "Wizkid vs Davido: the eternal debate",
          genre: "Afrobeats",
          host: "NigerianMusic",
          listeners: 276,
          isLive: true,
          tokenGated: 50,
        },
        {
          id: 15,
          name: "Amapiano is the future",
          genre: "Afrobeats",
          host: "SAVibes",
          listeners: 187,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 16,
          name: "Tems vocal run masterclass",
          genre: "Afrobeats",
          host: "AfroSoul",
          listeners: 143,
          isLive: true,
          tokenGated: false,
        },
      ],
    },
    {
      title: "Latin",
      rooms: [
        {
          id: 17,
          name: "Bad Bunny album reactions",
          genre: "Latin",
          host: "ReggaetonDaily",
          listeners: 312,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 18,
          name: "Karol G collab tier list",
          genre: "Latin",
          host: "LatinaPower",
          listeners: 201,
          isLive: true,
          tokenGated: 50,
        },
        {
          id: 19,
          name: "Peso Pluma corridos breakdown",
          genre: "Latin",
          host: "CorridosCulture",
          listeners: 167,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 20,
          name: "Rosalía experimental era discussion",
          genre: "Latin",
          host: "ArtPop",
          listeners: 128,
          isLive: true,
          tokenGated: false,
        },
      ],
    },
    {
      title: "Electronic",
      rooms: [
        {
          id: 21,
          name: "Fred again.. live set reactions",
          genre: "Electronic",
          host: "RaveReviews",
          listeners: 289,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 22,
          name: "Flume production techniques",
          genre: "Electronic",
          host: "ElectroLab",
          listeners: 176,
          isLive: true,
          tokenGated: 100,
        },
        {
          id: 23,
          name: "UK Garage revival talk",
          genre: "Electronic",
          host: "UKBasement",
          listeners: 145,
          isLive: true,
          tokenGated: false,
        },
        {
          id: 24,
          name: "Boiler Room best sets ever",
          genre: "Electronic",
          host: "SetCurator",
          listeners: 134,
          isLive: true,
          tokenGated: false,
        },
      ],
    },
  ];

  return (
    <div
      className="min-h-[100dvh] w-full overflow-x-hidden"
      style={{
        backgroundColor: "#060409",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-50 px-4 pt-4 pb-3"
        style={{
          background: "linear-gradient(180deg, #060409 0%, #060409 85%, transparent 100%)",
        }}
      >
        {/* Compact stats + tokens */}
        <div className="flex items-center justify-between mb-3 text-xs opacity-60">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Users size={12} className="opacity-70" />
              <span style={{ color: "#00E5A8" }}>{stats.activeUsers.toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-1">
              <Radio size={12} className="opacity-70" />
              <span style={{ color: "#8B2FFF" }}>{stats.liveRooms}</span> live
            </span>
          </div>
          <div
            className="px-2.5 py-1 rounded-full font-semibold"
            style={{
              background: "linear-gradient(135deg, #00E5A8 0%, #8B2FFF 100%)",
              color: "#060409",
            }}
          >
            {userTokens} 🔑
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40"
            style={{ color: "#00E5A8" }}
          />
          <input
            type="text"
            placeholder="Search rooms, artists, topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none placeholder-opacity-40"
            style={{
              backgroundColor: "#0f0a14",
              border: "1px solid rgba(0, 229, 168, 0.15)",
              color: "#fff",
            }}
          />
        </div>

        {/* Mode toggle + CTA */}
        <div className="flex items-center gap-2">
          <div
            className="flex rounded-lg p-0.5 flex-1"
            style={{ backgroundColor: "#0f0a14" }}
          >
            <button
              onClick={() => setActiveTab("live")}
              className="flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all"
              style={{
                backgroundColor: activeTab === "live" ? "#00E5A8" : "transparent",
                color: activeTab === "live" ? "#060409" : "#fff",
              }}
            >
              Live Rooms
            </button>
            <button
              onClick={() => setActiveTab("replays")}
              className="flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all"
              style={{
                backgroundColor: activeTab === "replays" ? "#8B2FFF" : "transparent",
                color: activeTab === "replays" ? "#fff" : "#fff",
              }}
            >
              Replays
            </button>
          </div>

          {/* Open Room CTA */}
          <button
            className="px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 shadow-lg"
            style={{
              background: "linear-gradient(135deg, #8B2FFF 0%, #00E5A8 100%)",
              color: "#fff",
            }}
          >
            <Plus size={16} strokeWidth={3} />
            🔑
          </button>
        </div>
      </div>

      {/* Genre Rows */}
      <div className="px-4 pb-6 space-y-6">
        {genreRows.map((row, idx) => (
          <div key={idx}>
            {/* Row header */}
            <div className="flex items-center justify-between mb-3">
              <h2
                className="font-bold text-base tracking-tight"
                style={{
                  fontFamily: "'Syne', sans-serif",
                  color: "#fff",
                }}
              >
                {row.title}
              </h2>
              <button
                className="flex items-center gap-1 text-xs font-semibold opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: "#00E5A8" }}
              >
                See all
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Horizontal scroll */}
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
              {row.rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex-shrink-0 w-[160px] p-3 rounded-xl relative overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, rgba(139, 47, 255, 0.08) 0%, rgba(0, 229, 168, 0.08) 100%)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                  }}
                >
                  {/* Live indicator */}
                  {room.isLive && (
                    <div
                      className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: "#00E5A8",
                        color: "#060409",
                      }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ backgroundColor: "#060409" }}
                      />
                      LIVE
                    </div>
                  )}

                  {/* Token gate */}
                  {room.tokenGated && (
                    <div
                      className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: "rgba(139, 47, 255, 0.9)",
                        color: "#fff",
                      }}
                    >
                      <Lock size={10} />
                      {room.tokenGated}
                    </div>
                  )}

                  {/* Room info */}
                  <div className="mt-6">
                    <h3
                      className="text-xs font-semibold mb-1.5 line-clamp-2 leading-tight"
                      style={{
                        color: "#fff",
                        minHeight: "2.5rem",
                      }}
                    >
                      {room.name}
                    </h3>

                    <div className="flex items-center gap-1.5 mb-2">
                      <div
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: "rgba(0, 229, 168, 0.1)",
                          color: "#00E5A8",
                        }}
                      >
                        {room.genre}
                      </div>
                    </div>

                    <div className="text-[11px] opacity-60 mb-1">@{room.host}</div>

                    <div
                      className="flex items-center gap-1 text-xs font-semibold"
                      style={{ color: "#00E5A8" }}
                    >
                      <Users size={12} />
                      {room.listeners.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Load more indicator */}
        <button
          className="w-full py-3 rounded-xl font-semibold text-sm opacity-60 hover:opacity-100 transition-opacity"
          style={{
            border: "1px dashed rgba(0, 229, 168, 0.3)",
            color: "#00E5A8",
          }}
        >
          Load More Genres
        </button>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
