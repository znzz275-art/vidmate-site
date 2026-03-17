// ============================================================
//  VidMate Shared Data Layer — shared.js
// ============================================================

const YOUTUBE_API_KEY = 'AIzaSyBznR7oQroK6YhNQBoI6kohLmsFTa1f3rs';

// ── YouTube thumbnail helper (always works, no API needed) ──
function ytThumb(id, quality='mq') {
  // mq=320x180, hq=480x360, maxres=1280x720
  return `https://i.ytimg.com/vi/${id}/${quality}default.jpg`;
}

// ── Multiple data sources with auto-fallback ────────────────
const SOURCES = {
  // Source 1: Invidious instances
  invidious: [
    'https://inv.nadeko.net',
    'https://invidious.io.lol',
    'https://yt.cdaut.de',
    'https://invidious.privacydev.net',
    'https://iv.ggtyler.dev',
  ],

  // Source 2: Piped API (alternative YouTube frontend)
  piped: [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://piped-api.garudalinux.org',
  ],

  // Source 3: YouTube RSS via CORS proxy (always works)
  rssProxy: 'https://api.allorigins.win/get?url=',
};

// ── Core fetch with timeout ──────────────────────────────────
async function safeFetch(url, timeout=7000) {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Map video from any source to unified format ──────────────
function mapVideo(v, source='inv') {
  const id = v.videoId || v.id || v.url?.split('v=')[1]?.split('&')[0] || '';
  if (!id) return null;
  return {
    id,
    title:         v.title || 'بدون عنوان',
    channel:       v.author || v.uploaderName || v.channelTitle || '',
    channelId:     v.authorId || v.uploaderUrl?.split('/').pop() || '',
    thumbnail:     ytThumb(id, 'mq'),
    thumbnailHigh: ytThumb(id, 'maxres'),
    views:         fmtNum(v.viewCount || v.views || v.viewCountText || 0),
    duration:      fmtSec(v.lengthSeconds || v.duration || 0),
    description:   v.description || v.shortDescription || '',
    publishedAt:   v.published || v.publishedText || v.uploadDate || '',
    url:           `https://www.youtube.com/watch?v=${id}`,
    platform:      'YouTube',
  };
}

// ── Main API object ──────────────────────────────────────────
const YT = {

  async getTrending(region='EG', max=20) {
    // Try each Invidious instance
    for (const base of SOURCES.invidious) {
      const data = await safeFetch(`${base}/api/v1/trending?region=${region}&type=default`);
      if (Array.isArray(data) && data.length) {
        return data.slice(0, max).map(v => mapVideo(v)).filter(Boolean);
      }
    }
    // Try Piped
    for (const base of SOURCES.piped) {
      const data = await safeFetch(`${base}/trending?region=${region}`);
      if (Array.isArray(data) && data.length) {
        return data.slice(0, max).map(v => mapVideo(v, 'piped')).filter(Boolean);
      }
    }
    // Final fallback: popular Arabic channels RSS
    return await YT._rssFallback();
  },

  async search(q, max=20) {
    for (const base of SOURCES.invidious) {
      const data = await safeFetch(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video&page=1`);
      if (Array.isArray(data) && data.length) {
        return data.slice(0, max).map(v => mapVideo(v)).filter(Boolean);
      }
    }
    for (const base of SOURCES.piped) {
      const data = await safeFetch(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`);
      if (data?.items?.length) {
        return data.items.slice(0, max).map(v => mapVideo(v, 'piped')).filter(Boolean);
      }
    }
    return [];
  },

  async getByCategory(cat, max=16) {
    const queries = {
      music:   'اغاني عربية 2025',
      gaming:  'العاب 2025',
      sports:  'ملخص اهداف 2025',
      news:    'اخبار اليوم العربية',
      comedy:  'كوميديا عربية 2025',
      movies:  'افلام عربية 2025',
      tech:    'تقنية وتكنولوجيا 2025',
    };
    return await YT.search(queries[cat] || cat, max);
  },

  async getVideoInfo(url) {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) return null;
    const id = match[1];
    // Try to get full details
    for (const base of SOURCES.invidious) {
      const data = await safeFetch(`${base}/api/v1/videos/${id}`);
      if (data?.videoId || data?.id) {
        const v = mapVideo(data);
        if (v) {
          v.description = data.description || '';
          v.tags = data.keywords || [];
          v.likeCount = fmtNum(data.likeCount || 0);
          v.subCount = data.authorSubs || '';
          return v;
        }
      }
    }
    // Fallback: return basic info from ID only
    return {
      id, title: 'فيديو YouTube', channel: '', channelId: '',
      thumbnail: ytThumb(id, 'mq'), thumbnailHigh: ytThumb(id, 'maxres'),
      views: '—', duration: '—', description: '', tags: [],
      url: `https://www.youtube.com/watch?v=${id}`, platform: 'YouTube',
    };
  },

  async getChannelVideos(channelId, max=12) {
    for (const base of SOURCES.invidious) {
      const data = await safeFetch(`${base}/api/v1/channels/${channelId}/videos?page=1`);
      if (data?.videos?.length) {
        return data.videos.slice(0, max).map(v => mapVideo(v)).filter(Boolean);
      }
    }
    return [];
  },

  // RSS fallback using popular Arabic YouTube channels
  async _rssFallback() {
    const channelIds = [
      'UCPly4YLOM-eBCFSH_iZl8Pg', // قناة MBC
      'UC4fSO0UHERtNQvSCyIQKMoQ', // Al Arabiya
    ];
    for (const cid of channelIds) {
      try {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`;
        const proxyUrl = `${SOURCES.rssProxy}${encodeURIComponent(rssUrl)}`;
        const data = await safeFetch(proxyUrl, 10000);
        if (data?.contents) {
          const parser = new DOMParser();
          const xml = parser.parseFromString(data.contents, 'text/xml');
          const entries = [...xml.querySelectorAll('entry')].slice(0, 10);
          if (entries.length) {
            return entries.map(e => {
              const id = e.querySelector('videoId')?.textContent || '';
              return {
                id, title: e.querySelector('title')?.textContent || 'فيديو',
                channel: e.querySelector('name')?.textContent || '',
                thumbnail: ytThumb(id, 'mq'), thumbnailHigh: ytThumb(id, 'hq'),
                views: '—', duration: '—', url: `https://www.youtube.com/watch?v=${id}`,
                platform: 'YouTube',
              };
            }).filter(v => v.id);
          }
        }
      } catch {}
    }
    return [];
  },

  categories: { music:'music', gaming:'gaming', sports:'sports', news:'news', comedy:'comedy', movies:'movies', tech:'tech' }
};

// ── Number formatters ────────────────────────────────────────
function fmtNum(n) {
  if (!n) return '—';
  n = parseInt(String(n).replace(/,/g, '')) || 0;
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'K';
  return String(n);
}

function fmtSec(s) {
  s = parseInt(s) || 0;
  if (!s) return '—';
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

// ── VM Store ─────────────────────────────────────────────────
const VM = {
  defaults: {
    stats: { totalDownloads:18472, totalUsers:4231, activeToday:312, totalGB:9840 },
    users: [
      { id:1, name:'أحمد محمد', email:'ahmed@example.com', downloads:142, joined:'2025-01-10', status:'active' },
      { id:2, name:'سارة علي',  email:'sara@example.com',  downloads:98,  joined:'2025-02-03', status:'active' },
      { id:3, name:'محمد حسن', email:'mo@example.com',    downloads:57,  joined:'2025-03-15', status:'banned' },
    ],
    downloads: [],
    settings: {
      siteName:'VidMate', maxQuality:'4K', maintenanceMode:false,
      maxConcurrentDownloads:5,
      allowedPlatforms:['YouTube','Facebook','TikTok','Instagram','Twitter','Dailymotion','Vimeo'],
    },
    activity: []
  },
  _load(k)  { try { return JSON.parse(localStorage.getItem('vm_'+k)); } catch { return null; } },
  _save(k,v){ localStorage.setItem('vm_'+k, JSON.stringify(v)); },
  getStats()    { return this._load('stats')     || this.defaults.stats; },
  getUsers()    { return this._load('users')     || this.defaults.users; },
  getDownloads(){ return this._load('downloads') || this.defaults.downloads; },
  getSettings() { return this._load('settings')  || this.defaults.settings; },
  getActivity() { return this._load('activity')  || this.defaults.activity; },
  saveStats(d)    { this._save('stats',d); },
  saveUsers(d)    { this._save('users',d); },
  saveDownloads(d){ this._save('downloads',d); },
  saveSettings(d) { this._save('settings',d); },
  addDownload(entry) {
    const list = this.getDownloads();
    entry.id   = Date.now();
    entry.date = new Date().toISOString().split('T')[0];
    entry.status = 'done';
    list.unshift(entry);
    this.saveDownloads(list.slice(0, 100));
    const s = this.getStats();
    s.totalDownloads++;
    this.saveStats(s);
    const act = this.getActivity();
    act.unshift({ time: new Date().toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'}), action:'تحميل فيديو', user:'أنت', detail:(entry.platform||'')+' '+entry.quality });
    this._save('activity', act.slice(0,30));
  },
  banUser(id) {
    const users = this.getUsers();
    const u = users.find(x=>x.id===id);
    if (u) { u.status = u.status==='banned'?'active':'banned'; this.saveUsers(users); }
    return users;
  }
};
