// ============================================================
//  VidMate Shared Data Layer — shared.js
//  Acts as the "API" connecting Website ↔ App ↔ Admin
// ============================================================

// ── YouTube API ───────────────────────────────────────────
const YOUTUBE_API_KEY = 'AIzaSyBznR7oQroK6YhNQBoI6kohLmsFTa1f3rs';

const YT = {
  // جلب فيديوهات ترند حسب المنطقة
  async getTrending(regionCode = 'EG', maxResults = 20) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=${regionCode}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`
      );
      const data = await res.json();
      if (!data.items) return [];
      return data.items.map(v => ({
        id: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        thumbnail: v.snippet.thumbnails.medium?.url || v.snippet.thumbnails.default?.url,
        thumbnailHigh: v.snippet.thumbnails.high?.url,
        views: YT.formatNum(v.statistics?.viewCount),
        duration: YT.parseDuration(v.contentDetails?.duration),
        publishedAt: v.snippet.publishedAt,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        category: v.snippet.categoryId,
        platform: 'YouTube',
      }));
    } catch(e) { console.error('YT API error:', e); return []; }
  },

  // بحث في يوتيوب
  async search(query, maxResults = 20) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`
      );
      const data = await res.json();
      if (!data.items) return [];
      return data.items.map(v => ({
        id: v.id.videoId,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        thumbnail: v.snippet.thumbnails.medium?.url,
        thumbnailHigh: v.snippet.thumbnails.high?.url,
        views: '—',
        duration: '—',
        url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
        platform: 'YouTube',
      }));
    } catch(e) { console.error('YT search error:', e); return []; }
  },

  // فيديوهات حسب تصنيف
  async getByCategory(categoryId, regionCode = 'EG', maxResults = 12) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&videoCategoryId=${categoryId}&regionCode=${regionCode}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`
      );
      const data = await res.json();
      if (!data.items) return [];
      return data.items.map(v => ({
        id: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        thumbnail: v.snippet.thumbnails.medium?.url,
        thumbnailHigh: v.snippet.thumbnails.high?.url,
        views: YT.formatNum(v.statistics?.viewCount),
        duration: YT.parseDuration(v.contentDetails?.duration),
        url: `https://www.youtube.com/watch?v=${v.id}`,
        platform: 'YouTube',
      }));
    } catch(e) { return []; }
  },

  // تنسيق الأرقام
  formatNum(n) {
    if (!n) return '—';
    n = parseInt(n);
    if (n >= 1000000000) return (n/1000000000).toFixed(1) + 'B';
    if (n >= 1000000)    return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000)       return (n/1000).toFixed(0) + 'K';
    return n.toString();
  },

  // تحويل مدة ISO 8601 لنص مقروء
  parseDuration(iso) {
    if (!iso) return '—';
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '—';
    const h = parseInt(m[1]||0), min = parseInt(m[2]||0), sec = parseInt(m[3]||0);
    if (h > 0) return `${h}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${min}:${String(sec).padStart(2,'0')}`;
  },

  // معرّفات التصنيفات
  categories: {
    trending: null,
    music:    '10',
    gaming:   '20',
    sports:   '17',
    news:     '25',
    comedy:   '23',
    movies:   '1',
    tech:     '28',
  }
};

const VM = {
  // ── defaults ──────────────────────────────────────────────
  defaults: {
    stats: {
      totalDownloads: 18472,
      totalUsers: 4231,
      activeToday: 312,
      totalGB: 9840,
    },
    users: [
      { id: 1, name: 'أحمد محمد', email: 'ahmed@example.com', downloads: 142, joined: '2025-01-10', status: 'active' },
      { id: 2, name: 'سارة علي',  email: 'sara@example.com',  downloads: 98,  joined: '2025-02-03', status: 'active' },
      { id: 3, name: 'محمد حسن', email: 'mo@example.com',    downloads: 57,  joined: '2025-03-15', status: 'banned' },
    ],
    downloads: [
      { id: 1, userId: 1, title: 'أجمل مناظر الطبيعة', quality: '1080p', size: '245 MB', platform: 'YouTube', date: '2026-03-16', status: 'done' },
      { id: 2, userId: 2, title: 'أغنية 2025',          quality: 'MP3',   size: '8 MB',  platform: 'SoundCloud', date: '2026-03-16', status: 'done' },
      { id: 3, userId: 1, title: 'مباراة الكأس',        quality: '720p',  size: '120 MB',platform: 'Facebook',   date: '2026-03-17', status: 'done' },
    ],
    settings: {
      siteName: 'VidMate',
      maxQuality: '4K',
      allowedPlatforms: ['YouTube','Facebook','TikTok','Instagram','Twitter','Dailymotion','Vimeo'],
      maintenanceMode: false,
      maxConcurrentDownloads: 5,
    },
    activity: [
      { time: '09:12', action: 'تحميل فيديو', user: 'أحمد محمد', detail: 'YouTube 1080p' },
      { time: '09:45', action: 'تسجيل مستخدم جديد', user: 'سارة علي', detail: '' },
      { time: '10:20', action: 'تحميل صوت', user: 'أحمد محمد', detail: 'MP3 320kbps' },
      { time: '11:05', action: 'تحليل رابط', user: 'محمد حسن', detail: 'TikTok' },
    ]
  },

  // ── helpers ───────────────────────────────────────────────
  _load(key) {
    try { return JSON.parse(localStorage.getItem('vm_' + key)); } catch { return null; }
  },
  _save(key, val) {
    localStorage.setItem('vm_' + key, JSON.stringify(val));
  },

  // ── public API ────────────────────────────────────────────
  getStats()    { return this._load('stats')    || this.defaults.stats; },
  getUsers()    { return this._load('users')    || this.defaults.users; },
  getDownloads(){ return this._load('downloads')|| this.defaults.downloads; },
  getSettings() { return this._load('settings') || this.defaults.settings; },
  getActivity() { return this._load('activity') || this.defaults.activity; },

  saveStats(d)    { this._save('stats', d); },
  saveUsers(d)    { this._save('users', d); },
  saveDownloads(d){ this._save('downloads', d); },
  saveSettings(d) { this._save('settings', d); },

  addDownload(entry) {
    const list = this.getDownloads();
    entry.id   = Date.now();
    entry.date = new Date().toISOString().split('T')[0];
    entry.status = 'done';
    list.unshift(entry);
    this.saveDownloads(list);
    // bump stats
    const s = this.getStats();
    s.totalDownloads++;
    s.totalGB += Math.round(parseInt(entry.size||'0') / 1024 * 10) / 10;
    this.saveStats(s);
    // log activity
    const act = this.getActivity();
    act.unshift({ time: new Date().toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'}), action:'تحميل فيديو', user:'أنت', detail: entry.platform+' '+entry.quality });
    this._save('activity', act.slice(0,20));
  },

  banUser(id) {
    const users = this.getUsers();
    const u = users.find(x=>x.id===id);
    if (u) { u.status = u.status==='banned'?'active':'banned'; this.saveUsers(users); }
    return users;
  }
};
