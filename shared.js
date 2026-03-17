// ============================================================
//  VidMate Shared Data Layer — shared.js
//  Website ↔ App ↔ Admin
// ============================================================

const YOUTUBE_API_KEY = 'AIzaSyBznR7oQroK6YhNQBoI6kohLmsFTa1f3rs';

// Invidious instances (open source YouTube proxy — no CORS)
const INV_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.io.lol',
  'https://yt.cdaut.de',
];

const YT = {
  _inst: 0,
  inst() { return INV_INSTANCES[this._inst % INV_INSTANCES.length]; },

  // جلب ترند
  async getTrending(region='EG', max=20) {
    for (let i = 0; i < INV_INSTANCES.length; i++) {
      try {
        const base = INV_INSTANCES[(this._inst + i) % INV_INSTANCES.length];
        const res = await fetch(`${base}/api/v1/trending?region=${region}&type=default`, {signal: AbortSignal.timeout(6000)});
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data)) continue;
        return data.slice(0, max).map(v => YT._map(v));
      } catch(e) { continue; }
    }
    // fallback: YouTube RSS via AllOrigins proxy
    return await YT._rss('trending');
  },

  // بحث
  async search(q, max=20) {
    for (let i = 0; i < INV_INSTANCES.length; i++) {
      try {
        const base = INV_INSTANCES[(this._inst + i) % INV_INSTANCES.length];
        const res = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, {signal: AbortSignal.timeout(6000)});
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data)) continue;
        return data.slice(0, max).map(v => YT._map(v));
      } catch(e) { continue; }
    }
    return [];
  },

  // تصنيف — نستخدم بحث بكلمة مفتاحية
  async getByCategory(cat, max=16) {
    const queries = {
      music: 'اغاني عربية 2025', gaming: 'العاب 2025',
      sports: 'رياضة اهداف 2025', news: 'اخبار اليوم',
      comedy: 'كوميديا عربية', movies: 'افلام 2025', tech: 'تقنية 2025',
    };
    return await YT.search(queries[cat] || cat, max);
  },

  // map Invidious video object → our format
  _map(v) {
    const id = v.videoId || v.id;
    // Invidious thumbnail
    const thumb = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    const thumbHigh = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    return {
      id,
      title:        v.title || 'بدون عنوان',
      channel:      v.author || v.channelTitle || '',
      thumbnail:    thumb,
      thumbnailHigh:thumbHigh,
      views:        YT.formatNum(v.viewCount || v.views),
      duration:     YT.fmtSec(v.lengthSeconds || 0),
      url:          `https://www.youtube.com/watch?v=${id}`,
      watchUrl:     `https://www.youtube.com/watch?v=${id}`,
      platform:     'YouTube',
    };
  },

  // تحليل رابط YouTube وجلب بياناته
  async getVideoInfo(url) {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) return null;
    const id = match[1];
    for (let i = 0; i < INV_INSTANCES.length; i++) {
      try {
        const base = INV_INSTANCES[(this._inst + i) % INV_INSTANCES.length];
        const res = await fetch(`${base}/api/v1/videos/${id}`, {signal: AbortSignal.timeout(6000)});
        if (!res.ok) continue;
        const v = await res.json();
        return YT._map(v);
      } catch(e) { continue; }
    }
    // fallback: return basic info from ID
    return {
      id, title: 'فيديو YouTube', channel: '',
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      thumbnailHigh: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      views: '—', duration: '—',
      url: `https://www.youtube.com/watch?v=${id}`,
      platform: 'YouTube',
    };
  },

  // RSS fallback via allorigins
  async _rss(type) {
    try {
      const feed = 'https://www.youtube.com/feeds/videos.xml?playlist_id=PLbpi6ZahtOH6Ar_3GPy3workshift';
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(feed)}`, {signal: AbortSignal.timeout(8000)});
      if (!res.ok) return [];
      // return empty, will show fallback static cards
      return [];
    } catch { return []; }
  },

  // تنسيق الأرقام
  formatNum(n) {
    if (!n) return '—';
    n = parseInt(n);
    if (n >= 1000000000) return (n/1000000000).toFixed(1) + 'B';
    if (n >= 1000000)    return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000)       return (n/1000).toFixed(0) + 'K';
    return String(n);
  },

  // تحويل ثواني لـ mm:ss
  fmtSec(s) {
    s = parseInt(s) || 0;
    if (s === 0) return '—';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  },

  categories: { music:'music', gaming:'gaming', sports:'sports', news:'news', comedy:'comedy', movies:'movies', tech:'tech' }
};

// ============================================================
//  VM — Shared data store (localStorage)
// ============================================================
const VM = {
  defaults: {
    stats: { totalDownloads:18472, totalUsers:4231, activeToday:312, totalGB:9840 },
    users: [
      { id:1, name:'أحمد محمد', email:'ahmed@example.com', downloads:142, joined:'2025-01-10', status:'active' },
      { id:2, name:'سارة علي',  email:'sara@example.com',  downloads:98,  joined:'2025-02-03', status:'active' },
      { id:3, name:'محمد حسن', email:'mo@example.com',    downloads:57,  joined:'2025-03-15', status:'banned' },
    ],
    downloads: [
      { id:1, userId:1, title:'أجمل مناظر الطبيعة', quality:'1080p', size:'245 MB', platform:'YouTube', date:'2026-03-16', status:'done' },
      { id:2, userId:2, title:'أغنية 2025',          quality:'MP3',  size:'8 MB',  platform:'SoundCloud',date:'2026-03-16', status:'done' },
      { id:3, userId:1, title:'مباراة الكأس',        quality:'720p', size:'120 MB',platform:'Facebook',  date:'2026-03-17', status:'done' },
    ],
    settings: {
      siteName:'VidMate', maxQuality:'4K', maintenanceMode:false,
      maxConcurrentDownloads:5,
      allowedPlatforms:['YouTube','Facebook','TikTok','Instagram','Twitter','Dailymotion','Vimeo'],
    },
    activity: [
      { time:'09:12', action:'تحميل فيديو',       user:'أحمد محمد', detail:'YouTube 1080p' },
      { time:'09:45', action:'تسجيل مستخدم جديد', user:'سارة علي',  detail:'' },
      { time:'10:20', action:'تحميل صوت',          user:'أحمد محمد', detail:'MP3 320kbps' },
      { time:'11:05', action:'تحليل رابط',         user:'محمد حسن',  detail:'TikTok' },
    ]
  },

  _load(k) { try { return JSON.parse(localStorage.getItem('vm_'+k)); } catch { return null; } },
  _save(k,v){ localStorage.setItem('vm_'+k, JSON.stringify(v)); },

  getStats()    { return this._load('stats')    || this.defaults.stats; },
  getUsers()    { return this._load('users')    || this.defaults.users; },
  getDownloads(){ return this._load('downloads')|| this.defaults.downloads; },
  getSettings() { return this._load('settings') || this.defaults.settings; },
  getActivity() { return this._load('activity') || this.defaults.activity; },

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
    this.saveDownloads(list);
    const s = this.getStats();
    s.totalDownloads++;
    this.saveStats(s);
    const act = this.getActivity();
    act.unshift({ time: new Date().toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'}), action:'تحميل فيديو', user:'أنت', detail:(entry.platform||'')+'  '+entry.quality });
    this._save('activity', act.slice(0,30));
  },

  banUser(id) {
    const users = this.getUsers();
    const u = users.find(x=>x.id===id);
    if (u) { u.status = u.status==='banned'?'active':'banned'; this.saveUsers(users); }
    return users;
  }
};
