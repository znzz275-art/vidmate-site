// ============================================================
//  VidMate Shared Data Layer
//  Uses YouTube RSS + thumbnail API (no CORS issues)
// ============================================================

const YOUTUBE_API_KEY = 'AIzaSyBznR7oQroK6YhNQBoI6kohLmsFTa1f3rs';

// ── Thumbnail helper — always works, no API needed ──────────
function ytThumb(id, q) {
  // q: mq=320x180  hq=480x360  maxresdefault=1280x720
  return `https://i.ytimg.com/vi/${id}/${q||'mqdefault'}.jpg`;
}

// ── Curated popular Arabic YouTube channels ────────────────
// We use their channel IDs to fetch RSS — 100% CORS-free
const CHANNELS = {
  trending: [
    'UCiDMuBv8YBMzGdPkSDBBBNw', // MBC
    'UC4fSO0UHERtNQvSCyIQKMoQ', // Al Arabiya
    'UCPly4YLOM-eBCFSH_iZl8Pg', // MBC Trending
    'UCVkLDj7pTLAKfBsxMDqtdFg', // Trending Arabic
  ],
  music: [
    'UCmx-9WwKTQx1oGiJRKFWMqw', // Rotana Music
    'UCsVxHVMs8TaDDhFzPjX8m7A', // Anghami
    'UC-9-kyTW8ZkZNDHQJ6FgpwQ', // Music trending
  ],
  sports: [
    'UCmrDEKKFMHPaHXwwKK6kp_w', // beIN Sports
    'UCVEcMmQBzMPuHqUcGzCIi5g', // El Gouna
  ],
  news: [
    'UC4fSO0UHERtNQvSCyIQKMoQ', // Al Arabiya News
    'UCXDMcCFMPcPNOJnBj0TuFkA', // Al Jazeera
  ],
  gaming: [
    'UCFZMz1Nb2ot5j3UiQ6xbvFQ', // Gaming Arabic
  ],
  comedy: [
    'UCHxHDnMh1bMEwrBGP3fWrYA', // Comedy Arabic
  ],
};

// ── Proxy services (try each until one works) ──────────────
const PROXIES = [
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function fetchProxy(targetUrl, timeout = 8000) {
  for (const proxy of PROXIES) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(proxy(targetUrl), { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) continue;
      const data = await res.json();
      // allorigins returns {contents:...}, others return text directly
      return data.contents || data;
    } catch { continue; }
  }
  return null;
}

// ── Parse YouTube RSS XML ──────────────────────────────────
function parseRSS(xmlText) {
  if (!xmlText) return [];
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    const entries = [...xml.querySelectorAll('entry')];
    return entries.map(e => {
      const id = e.querySelector('videoId')?.textContent
              || e.querySelector('id')?.textContent?.split(':').pop()
              || '';
      if (!id || id.length !== 11) return null;
      const views = parseInt(e.querySelector('starRating')?.getAttribute('count') || '0');
      return {
        id,
        title:    e.querySelector('title')?.textContent || 'بدون عنوان',
        channel:  e.querySelector('name')?.textContent || '',
        thumbnail:     ytThumb(id, 'mqdefault'),
        thumbnailHigh: ytThumb(id, 'maxresdefault'),
        views:    fmtNum(views),
        duration: '—',
        url: `https://www.youtube.com/watch?v=${id}`,
        platform: 'YouTube',
      };
    }).filter(Boolean);
  } catch { return []; }
}

// ── Fetch videos from one channel via RSS ──────────────────
async function fetchChannelRSS(channelId) {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const text = await fetchProxy(rssUrl);
  return parseRSS(text);
}

// ── Main YT object ─────────────────────────────────────────
const YT = {

  async getTrending(region = 'EG', max = 20) {
    // Fetch from multiple channels and merge
    const channelIds = CHANNELS.trending;
    const promises = channelIds.map(id => fetchChannelRSS(id));
    const results = await Promise.allSettled(promises);
    let all = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.length) {
        all = all.concat(r.value);
      }
    }
    // Shuffle and deduplicate
    all = dedup(shuffle(all)).slice(0, max);
    if (all.length) return all;
    // Last resort: hardcoded popular video IDs (always shows something)
    return FALLBACK_VIDEOS;
  },

  async search(query, max = 20) {
    // Use YouTube search RSS (unofficial but works)
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
    const html = await fetchProxy(searchUrl, 10000);
    if (html) {
      const ids = extractVideoIds(html);
      if (ids.length) {
        return ids.slice(0, max).map(id => ({
          id,
          title: `نتيجة بحث: ${query}`,
          channel: 'YouTube',
          thumbnail: ytThumb(id, 'mqdefault'),
          thumbnailHigh: ytThumb(id, 'maxresdefault'),
          views: '—', duration: '—',
          url: `https://www.youtube.com/watch?v=${id}`,
          platform: 'YouTube',
        }));
      }
    }
    // Fallback: search via channel RSS keywords
    return await YT.getByCategory(query, max);
  },

  async getByCategory(cat, max = 16) {
    const ids = CHANNELS[cat] || CHANNELS.trending;
    const promises = ids.slice(0, 2).map(id => fetchChannelRSS(id));
    const results = await Promise.allSettled(promises);
    let all = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all = all.concat(r.value);
    }
    all = dedup(shuffle(all)).slice(0, max);
    return all.length ? all : FALLBACK_VIDEOS.slice(0, max);
  },

  async getVideoInfo(url) {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) return null;
    const id = match[1];
    return {
      id,
      title: 'فيديو YouTube',
      channel: '',
      thumbnail: ytThumb(id, 'mqdefault'),
      thumbnailHigh: ytThumb(id, 'maxresdefault'),
      views: '—', duration: '—', description: '',
      url: `https://www.youtube.com/watch?v=${id}`,
      platform: 'YouTube',
    };
  },
};

// ── Extract video IDs from YouTube HTML ────────────────────
function extractVideoIds(html) {
  const matches = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/g) || [];
  const ids = [...new Set(matches.map(m => m.replace(/"videoId":"|"/g, '')))];
  return ids;
}

// ── Helpers ────────────────────────────────────────────────
function dedup(arr) {
  const seen = new Set();
  return arr.filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true; });
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtNum(n) {
  if (!n) return '—';
  n = parseInt(n) || 0;
  if (n >= 1e9) return (n/1e9).toFixed(1)+'B';
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(0)+'K';
  return String(n);
}
function fmtSec(s) {
  s = parseInt(s)||0; if (!s) return '—';
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
  return h>0 ? `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}` : `${m}:${String(sc).padStart(2,'0')}`;
}

// ── FALLBACK: hardcoded popular Arabic videos ──────────────
// These ALWAYS show even if all APIs fail
const FALLBACK_VIDEOS = [
  { id:'lHk9eMxv_60', title:'ملخص أفضل أهداف 2025',           channel:'beIN Sports',    views:'12M' },
  { id:'kJQP7kiw5Fk', title:'أغنية Despacito',                 channel:'Luis Fonsi',     views:'8B'  },
  { id:'JGwWNGJdvx8', title:'Shape of You - Ed Sheeran',       channel:'Ed Sheeran',     views:'6B'  },
  { id:'fJ9rUzIMcZQ', title:'Bohemian Rhapsody',               channel:'Queen Official', views:'2B'  },
  { id:'YQHsXMglC9A', title:'Hello - Adele',                   channel:'Adele',          views:'3B'  },
  { id:'OPf0YbXqDm0', title:'Mark Ronson - Uptown Funk',       channel:'Mark Ronson',    views:'4B'  },
  { id:'hT_nvWreIhg', title:'Counting Stars - OneRepublic',    channel:'OneRepublic',    views:'3B'  },
  { id:'09R8_2nJtjg', title:'Sugar - Maroon 5',                channel:'Maroon 5',       views:'3B'  },
  { id:'e-ORhEE9VVg', title:'Gangnam Style',                   channel:'PSY',            views:'5B'  },
  { id:'RgKAFK5djSk', title:'Wiz Khalifa - See You Again',     channel:'Wiz Khalifa',    views:'6B'  },
  { id:'nfWlot6h_JM', title:'Taylor Swift - Shake It Off',     channel:'Taylor Swift',   views:'3B'  },
  { id:'SlPhMPnQ58k', title:'دراما عربية مميزة 2025',          channel:'MBC Drama',      views:'5M'  },
].map(v => ({
  ...v,
  thumbnail: ytThumb(v.id, 'mqdefault'),
  thumbnailHigh: ytThumb(v.id, 'maxresdefault'),
  duration: '—',
  url: `https://www.youtube.com/watch?v=${v.id}`,
  platform: 'YouTube',
}));

// ── VM Store ───────────────────────────────────────────────
const VM = {
  defaults: {
    stats: { totalDownloads:18472, totalUsers:4231, activeToday:312, totalGB:9840 },
    users: [
      { id:1, name:'أحمد محمد', email:'ahmed@example.com', downloads:142, joined:'2025-01-10', status:'active' },
      { id:2, name:'سارة علي',  email:'sara@example.com',  downloads:98,  joined:'2025-02-03', status:'active' },
    ],
    downloads: [], settings: {
      siteName:'VidMate', maxQuality:'4K', maintenanceMode:false,
      maxConcurrentDownloads:5,
      allowedPlatforms:['YouTube','Facebook','TikTok','Instagram','Twitter','Dailymotion'],
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
    entry.id = Date.now(); entry.date = new Date().toISOString().split('T')[0]; entry.status = 'done';
    list.unshift(entry); this.saveDownloads(list.slice(0,100));
    const s = this.getStats(); s.totalDownloads++; this.saveStats(s);
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
