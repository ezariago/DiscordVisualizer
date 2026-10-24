/* ═══════════════════════════════════════════
   Discord Wrapped — script.js
   All data parsing, analytics, charts, UI
═══════════════════════════════════════════ */
'use strict';

// ── Chart.js global defaults ──────────────────────────────────────────────
Chart.defaults.color = '#8b8fa8';
Chart.defaults.borderColor = '#2e3140';
Chart.defaults.font.family = '-apple-system,"Segoe UI",system-ui,sans-serif';
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#222530';
Chart.defaults.plugins.tooltip.borderColor = '#2e3140';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
Chart.defaults.plugins.tooltip.bodyColor = '#8b8fa8';

// ── Module-level state ────────────────────────────────────────────────────
let RAW = null;           // parsed JSON
let DATA = null;          // normalized analytics object
let CHARTS = {};          // Chart.js instances keyed by canvas id
let FILTERS = { year: 'all', month: 'all', type: 'all' };
let wrappedSlideIndex = 0;

// ══════════════════════════════════════════════════════════════════════════
// 1. FILE HANDLING
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const fileInput  = document.getElementById('file-input');
  const dropZone   = document.getElementById('drop-zone');
  const demoBtn    = document.getElementById('use-demo-btn');
  const errMsg     = document.getElementById('upload-error');

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) readFile(file);
  });

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });

  demoBtn.addEventListener('click', () => {
    fetch('data.json')
      .then(r => r.json())
      .then(json => init(json))
      .catch(() => showError('Could not load bundled data.json'));
  });

  document.getElementById('new-file-btn').addEventListener('click', () => {
    document.getElementById('upload-overlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    // reset file input
    fileInput.value = '';
  });

  function readFile(file) {
    if (!file.name.endsWith('.json')) { showError('Please upload a .json file.'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target.result);
        init(json);
      } catch {
        showError('Invalid JSON file. Please check your export.');
      }
    };
    reader.readAsText(file);
  }

  function showError(msg) {
    errMsg.textContent = msg;
    errMsg.classList.remove('hidden');
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 2. INIT — parse & render everything
// ══════════════════════════════════════════════════════════════════════════
function init(json) {
  RAW = json;
  DATA = normalize(json);
  document.getElementById('upload-overlay').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderAll();
}

// ══════════════════════════════════════════════════════════════════════════
// 3. NORMALIZE — extract clean analytics object from raw JSON
// ══════════════════════════════════════════════════════════════════════════
function normalize(j) {
  const msgs = j.messages || {};
  const settings = j.settings || {};
  const stats = j.statistics || {};
  const guilds = j.guilds || {};

  // ── Hourly distribution [0..23] ──
  const hourly = msgs.hoursValues?.hourly || new Array(24).fill(0);

  // ── Daily distribution [0=Mon..6=Sun] ──
  const daily = msgs.hoursValues?.daily || new Array(7).fill(0);

  // ── Monthly distribution [0=Jan..11=Dec] ──
  const monthly = msgs.hoursValues?.monthly || new Array(12).fill(0);

  // ── Yearly distribution — array, index 0 is oldest year ──
  const yearlyRaw = msgs.hoursValues?.yearly || [];

  // Work out actual years from oldestMessages timestamps
  const oldestMsgs = msgs.oldestMessages || [];
  const allTimestamps = oldestMsgs.map(m => new Date(m.timestamp)).filter(d => !isNaN(d));
  const minYear = allTimestamps.length ? Math.min(...allTimestamps.map(d => d.getFullYear())) : new Date().getFullYear() - yearlyRaw.length + 1;
  const yearly = yearlyRaw.map((count, i) => ({ year: minYear + i, count }));

  // ── Peak hour ──
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const peakDay  = daily.indexOf(Math.max(...daily));
  const peakMonth = monthly.indexOf(Math.max(...monthly));

  // ── Total messages ──
  const totalMessages = msgs.messageCount || 0;
  // characterCount in this export is a small aggregate (not all messages).
  // Estimate real averages from the oldestMessages sample instead.
  const sampleChars = oldestMsgs.reduce((a,m) => a + (m.sentence||'').length, 0);
  const sampleWords = oldestMsgs.reduce((a,m) => a + (m.sentence||'').split(/\s+/).filter(Boolean).length, 0);
  const sampleCount = oldestMsgs.length || 1;
  const avgCharsPerMsgSample = sampleChars / sampleCount;
  const avgWordsPerMsgSample = sampleWords / sampleCount;
  // Estimated totals from sample * total message count
  const totalChars = Math.round(avgCharsPerMsgSample * totalMessages);
  const totalWords = Math.round(avgWordsPerMsgSample * totalMessages);

  // ── Channels / DMs / Groups ──
  const topChannels = msgs.topChannels || [];
  const topDMs      = msgs.topDMs || [];
  const topGuilds   = msgs.topGuilds || [];
  const topGroupDMs = msgs.topGroupDMs || [];

  // ── Emojis ──
  const topEmojis       = msgs.topEmojis || [];
  const topCustomEmojis = msgs.topCustomEmojis || [];

  // ── Words ──
  const favoriteWords = msgs.favoriteWords || [];
  const topCursed     = msgs.topCursed || [];
  const topLinks      = msgs.topLinks || [];
  const topDiscordLinks = msgs.topDiscordLinks || [];

  // ── User ──
  const user = j.user || {};
  const username = user.username || 'You';

  // ── Settings ──
  const recentEmojis = settings.recentEmojis || [];

  // ── Payments ──
  const payments = j.payments || {};

  // ── Guilds map ──
  const guildMap = guilds;

  // ── Data quality ──
  const quality = {
    imported: oldestMsgs.length,
    valid: allTimestamps.length,
    skipped: oldestMsgs.length - allTimestamps.length,
    earliest: allTimestamps.length ? new Date(allTimestamps.reduce((a,d) => d < a ? d : a)) : null,
    latest:   allTimestamps.length ? new Date(allTimestamps.reduce((a,d) => d > a ? d : a)) : null,
    totalMessages,
    totalChars,
  };

  // ── Derived analytics ──
  // Peak hour label
  const peakHourLabel = fmtHour(peakHour);
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const peakDayLabel   = DAYS[peakDay] || '—';
  const peakMonthLabel = MONTHS[peakMonth] || '—';

  // Weekend vs weekday (daily index: Mon=0..Sun=6; Sat=5, Sun=6)
  const weekdayTotal = daily.slice(0,5).reduce((a,b)=>a+b,0);
  const weekendTotal = daily.slice(5).reduce((a,b)=>a+b,0);
  const weekendPct   = totalMessages ? Math.round(weekendTotal / (weekdayTotal + weekendTotal) * 100) : 0;

  // Night activity (22-04 hours)
  const nightHours = [22,23,0,1,2,3,4];
  const nightTotal = nightHours.reduce((a,h) => a + (hourly[h]||0), 0);
  const nightPct   = totalMessages ? Math.round(nightTotal / totalMessages * 100) : 0;

  // Avg words/chars per message (from sample)
  const avgCharsPerMsg = Math.round(avgCharsPerMsgSample);
  const avgWordsPerMsg = Math.round(avgWordsPerMsgSample);

  // Personality
  const personality = calcPersonality({ hourly, daily, nightPct, weekendPct, avgWordsPerMsg, topEmojis, recentEmojis, totalMessages, yearly });

  // Typing energy tier
  const typingEnergy = calcTypingEnergy(totalMessages, quality.earliest, quality.latest);

  // Longest message from oldestMessages
  const longestMsg = oldestMsgs.reduce((best, m) => {
    const len = (m.sentence || '').length;
    return len > (best.sentence||'').length ? m : best;
  }, {});

  // Top channel by messages
  const topChannel = topChannels[0] || null;
  const topDM      = topDMs[0] || null;

  return {
    user, username, quality,
    hourly, daily, monthly, yearly,
    peakHour, peakHourLabel, peakDay, peakDayLabel, peakMonth, peakMonthLabel,
    totalMessages, totalChars, totalWords, avgCharsPerMsg, avgWordsPerMsg,
    weekdayTotal, weekendTotal, weekendPct, nightPct,
    topChannels, topDMs, topGuilds, topGroupDMs,
    topEmojis, topCustomEmojis, recentEmojis,
    favoriteWords, topCursed, topLinks, topDiscordLinks,
    guildMap, payments, stats,
    personality, typingEnergy,
    longestMsg, topChannel, topDM,
    oldestMsgs,
    DAYS, MONTHS,
  };
}

// ── Personality classifier ───────────────────────────────────────────────
function calcPersonality({ hourly, daily, nightPct, weekendPct, avgWordsPerMsg, topEmojis, recentEmojis, totalMessages, yearly }) {
  const scores = [];

  // Night Owl: >30% of messages between 10pm-4am
  if (nightPct >= 30) scores.push({ id: 'night-owl', score: nightPct, title: 'The Night Owl', icon: '🦉', color: '#5865F2',
    desc: 'When everyone else is asleep, you\'re just warming up. The Discord dark side is your home.',
    stats: [`${nightPct}% of messages after 10pm`, `Peak hour: ${fmtHour(hourly.indexOf(Math.max(...hourly)))}`] });

  // Early Bird: peak hour 5-9am
  const peakH = hourly.indexOf(Math.max(...hourly));
  if (peakH >= 5 && peakH <= 9) scores.push({ id: 'early-bird', score: 100 - nightPct, title: 'The Early Bird', icon: '🐦', color: '#fee75c',
    desc: 'You\'re online before your coffee is even brewed. Impressive dedication.',
    stats: [`Peak hour: ${fmtHour(peakH)}`, `${100 - nightPct}% daytime activity`] });

  // Essay Writer: avg > 12 words per message
  if (avgWordsPerMsg >= 12) scores.push({ id: 'essay', score: avgWordsPerMsg * 3, title: 'The Essay Writer', icon: '📝', color: '#57f287',
    desc: 'You don\'t send messages, you publish manifestos. Every reply is a paragraph.',
    stats: [`~${avgWordsPerMsg} words per message`, `${fmtNum(totalMessages)} total messages`] });

  // Speed Texter: avg < 4 words per message
  if (avgWordsPerMsg > 0 && avgWordsPerMsg <= 4) scores.push({ id: 'speed', score: (10 - avgWordsPerMsg) * 8, title: 'The Speed Texter', icon: '⚡', color: '#eb459e',
    desc: 'Short. Fast. Deadly. Your messages are bite-sized and your typing speed is probably illegal.',
    stats: [`~${avgWordsPerMsg} words per message`, 'One-liner champion'] });

  // Weekend Warrior: >60% weekend
  if (weekendPct >= 55) scores.push({ id: 'weekend', score: weekendPct, title: 'The Weekend Warrior', icon: '🏖️', color: '#fee75c',
    desc: 'Monday through Friday? Not for you. The weekend is when you truly come alive.',
    stats: [`${weekendPct}% of messages on weekends`, 'Mon–Fri: background character'] });

  // Consistent Chatter: check yearly spread
  const yearCounts = yearly.map(y => y.count);
  if (yearCounts.length >= 3) {
    const minY = Math.min(...yearCounts);
    const maxY = Math.max(...yearCounts);
    const consistency = maxY > 0 ? Math.round((minY/maxY)*100) : 0;
    if (consistency >= 40) scores.push({ id: 'consistent', score: consistency, title: 'The Consistent Chatter', icon: '🔄', color: '#9b59b6',
      desc: 'Year after year, you show up. Rain or shine, you\'re typing. Remarkably steady.',
      stats: [`${consistency}% year-over-year consistency`, `${yearCounts.length} active years`] });
  }

  // Emoji Enthusiast: many unique emojis
  const emojiCount = topEmojis.length + recentEmojis.length;
  if (emojiCount >= 100) scores.push({ id: 'emoji', score: Math.min(emojiCount, 200), title: 'The Emoji Enthusiast', icon: '🎭', color: '#fee75c',
    desc: 'Words alone can\'t contain your soul. You communicate in emojis, reactions, and pure vibes.',
    stats: [`${topEmojis.length} unique emojis used`, `${fmtNum(recentEmojis.length)} emoji interactions tracked`] });

  if (!scores.length) {
    return { title: 'The Discord Veteran', icon: '🎖️', color: '#5865F2',
      desc: 'You\'ve been around long enough that Discord is basically a second home.',
      stats: [`${fmtNum(totalMessages)} total messages`] };
  }

  scores.sort((a,b) => b.score - a.score);
  return scores[0];
}

// ── Typing energy tier ───────────────────────────────────────────────────
function calcTypingEnergy(totalMessages, earliest, latest) {
  let days = 365;
  if (earliest && latest) {
    days = Math.max(1, Math.round((latest - earliest) / 86400000));
  }
  const msgsPerDay = totalMessages / days;

  // Thresholds: < 5 = Low-key, 5-15 = Casual, 15-40 = Certified, >40 = Legendary
  if (msgsPerDay < 5)   return { tier: 'Low-key Chatter',        color: '#57f287', bg: 'rgba(87,242,135,.12)', border: 'rgba(87,242,135,.3)',  icon: '😴', formula: `${msgsPerDay.toFixed(1)} msgs/day (< 5 threshold)` };
  if (msgsPerDay < 15)  return { tier: 'Casual Conversationalist', color: '#fee75c', bg: 'rgba(254,231,92,.12)',  border: 'rgba(254,231,92,.3)',   icon: '💬', formula: `${msgsPerDay.toFixed(1)} msgs/day (5–15 threshold)` };
  if (msgsPerDay < 40)  return { tier: 'Certified Yapaholic',     color: '#5865F2', bg: 'rgba(88,101,242,.12)', border: 'rgba(88,101,242,.3)',  icon: '🔥', formula: `${msgsPerDay.toFixed(1)} msgs/day (15–40 threshold)` };
  return                       { tier: 'Legendary Yapper',        color: '#eb459e', bg: 'rgba(235,69,158,.12)', border: 'rgba(235,69,158,.3)',  icon: '👑', formula: `${msgsPerDay.toFixed(1)} msgs/day (> 40 threshold)` };
}

// ══════════════════════════════════════════════════════════════════════════
// 4. RENDER ALL
// ══════════════════════════════════════════════════════════════════════════
function renderAll() {
  renderNav();
  renderStatCards();
  renderPersonality();
  renderQuality();
  renderHeatmap();
  renderCharts();
  renderFunStuff();
  renderFilters();
  setupWrapped();
}

// ── Nav + Hero ────────────────────────────────────────────────────────────
function renderNav() {
  const D = DATA;
  document.getElementById('nav-username').textContent = `— ${D.username}'s Stats`;

  // Hero
  document.getElementById('hero-username').textContent = D.username;
  const taglineEl = document.getElementById('hero-tagline');
  taglineEl.textContent = `${fmtNum(D.totalMessages)} messages · ${fmtNum(D.totalWords)} words · since ${D.quality.earliest ? D.quality.earliest.getFullYear() : '?'}`;

  // Avatar
  const avatarEl = document.getElementById('hero-avatar');
  if (D.user.avatar) {
    const img = document.createElement('img');
    img.src = D.user.avatar;
    img.onerror = () => { avatarEl.textContent = D.username[0]?.toUpperCase() || '?'; };
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = D.username[0]?.toUpperCase() || '?';
  }

  // Badges
  if (D.user.badges && D.user.badges.length) {
    const badgeEl = document.createElement('div');
    badgeEl.className = 'flex flex-wrap justify-center gap-1 mt-4';
    const badgeLabels = {
      DISCORD_EMPLOYEE: '🏠 Staff',
      DISCORD_PARTNER: '🤝 Partner',
      HYPESQUAD_EVENTS: '🎪 HypeSquad',
      BUG_HUNTER_LEVEL_1: '🐛 Bug Hunter',
      BUG_HUNTER_LEVEL_2: '🐛 Gold Bug Hunter',
      EARLY_SUPPORTER: '⭐ Early Supporter',
      VERIFIED_BOT_DEVELOPER: '🤖 Bot Dev',
      CERTIFIED_MODERATOR: '🛡️ Moderator',
      ACTIVE_DEVELOPER: '💻 Active Dev',
    };
    D.user.badges.slice(0, 8).forEach(b => {
      if (badgeLabels[b]) {
        const pill = document.createElement('span');
        pill.style.cssText = 'background:rgba(88,101,242,.15);border:1px solid rgba(88,101,242,.3);color:#a5b4fc;border-radius:999px;padding:.15rem .55rem;font-size:.72rem;font-weight:600';
        pill.textContent = badgeLabels[b];
        badgeEl.appendChild(pill);
      }
    });
    document.getElementById('hero-banner').querySelector('.relative.z-10').appendChild(badgeEl);
  }

  // Wire hero button
  document.getElementById('hero-wrapped-btn').addEventListener('click', openWrapped);
}

// ── Stat cards ───────────────────────────────────────────────────────────
function renderStatCards() {
  const D = DATA;
  const totalWords = D.totalWords;

  const cards = [
    {
      icon: '💬',
      value: fmtNum(D.totalMessages),
      label: 'Total Messages',
      quip: D.totalMessages > 500000 ? 'Your keyboard deserves a vacation.' :
            D.totalMessages > 100000 ? 'You\'ve typed a small novel\'s worth of text.' :
            D.totalMessages > 10000  ? 'Not bad for a "casual" Discord user.' :
                                        'Quality over quantity, right?',
    },
    {
      icon: '📝',
      value: fmtNum(totalWords),
      label: 'Total Words Typed',
      quip: totalWords > 1000000 ? 'That\'s multiple full novels. You ok?' :
            totalWords > 100000  ? 'Your word count beats most published authors.' :
                                   'You\'ve had a lot to say.',
    },
    {
      icon: '🕐',
      value: D.peakHourLabel,
      label: 'Peak Chatting Hour',
      quip: D.peakHour >= 0 && D.peakHour <= 4 ? 'Apparently, ' + D.peakHourLabel + ' is your natural habitat.' :
            D.peakHour >= 22 ? 'Night owl confirmed.' :
            D.peakHour >= 5 && D.peakHour <= 8 ? 'Good morning! You\'re already typing at dawn.' :
            'Classic ' + D.peakHourLabel + ' energy.',
    },
    {
      icon: '📅',
      value: D.peakMonthLabel,
      label: 'Most Active Month',
      quip: 'Your Discord obsession peaked here.',
    },
    {
      icon: '🔥',
      value: D.peakDayLabel,
      label: 'Most Active Weekday',
      quip: `${D.peakDayLabel}s? Busy.`,
    },
    {
      icon: '💸',
      value: D.payments.total ? `$${D.payments.total.toFixed(2)}` : '$0',
      label: 'Spent on Discord',
      quip: D.payments.total > 50 ? 'Discord has your credit card memorized.' :
            D.payments.total > 0  ? 'Supporting the platform, respect.' :
                                    'F2P legend.',
    },
    {
      icon: '⚡',
      value: D.stats.addReaction || 0,
      label: 'Reactions Added',
      quip: 'Sometimes a 👍 says it all.',
    },
    {
      icon: '🎙️',
      value: D.stats.joinVoiceChannel || 0,
      label: 'Voice Channel Joins',
      quip: 'You don\'t just type. You talk too.',
    },
  ];

  const container = document.getElementById('stat-cards');
  container.innerHTML = '';
  cards.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = `stat-card anim-up delay-${Math.min(i+1,5)}`;
    el.innerHTML = `
      <div class="stat-accent"></div>
      <div class="stat-icon">${c.icon}</div>
      <div class="stat-value counter-anim">${c.value}</div>
      <div class="stat-label">${c.label}</div>
      <div class="stat-quip">${c.quip}</div>
    `;
    container.appendChild(el);
  });
}

// ── Personality ──────────────────────────────────────────────────────────
function renderPersonality() {
  const p = DATA.personality;
  document.getElementById('personality-icon-bg').textContent = p.icon;
  document.getElementById('personality-title').textContent = `${p.icon} ${p.title}`;
  document.getElementById('personality-title').style.color = p.color;
  document.getElementById('personality-desc').textContent = p.desc;

  const pillsEl = document.getElementById('personality-stats');
  pillsEl.innerHTML = '';
  (p.stats || []).forEach(s => {
    const pill = document.createElement('span');
    pill.className = 'personality-stat-pill';
    pill.textContent = s;
    pillsEl.appendChild(pill);
  });
}

// ── Data quality panel ───────────────────────────────────────────────────
function renderQuality() {
  const q = DATA.quality;
  const items = [
    { label: 'Total Messages',          value: fmtNum(q.totalMessages) },
    { label: 'Message Samples',         value: fmtNum(q.imported) },
    { label: 'Valid Samples',           value: fmtNum(q.valid) },
    { label: 'Skipped',                 value: q.skipped },
    { label: 'Earliest Activity',       value: q.earliest ? q.earliest.toLocaleDateString() : '—' },
    { label: 'Latest Activity',         value: q.latest   ? q.latest.toLocaleDateString()   : '—' },
    { label: 'Est. Total Words',        value: fmtNum(DATA.totalWords) + ' (sample-based)' },
  ];
  const panel = document.getElementById('quality-panel');
  panel.innerHTML = items.map(i => `
    <div class="quality-item">
      <span class="q-label">${i.label}</span>
      <span class="q-value">${i.value}</span>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════════════════════
// 5. HEATMAP
// ══════════════════════════════════════════════════════════════════════════
function renderHeatmap() {
  const D = DATA;
  const container = document.getElementById('heatmap');
  container.innerHTML = '';

  // Build a day-indexed map from oldestMessages
  const dayMap = {};
  D.oldestMsgs.forEach(m => {
    const d = new Date(m.timestamp);
    if (isNaN(d)) return;
    const key = d.toISOString().slice(0,10);
    if (!dayMap[key]) dayMap[key] = { msgs: 0, words: 0 };
    dayMap[key].msgs++;
    dayMap[key].words += (m.sentence || '').split(/\s+/).filter(Boolean).length;
  });

  if (!Object.keys(dayMap).length) {
    container.textContent = 'Not enough timestamped data to build heatmap.';
    return;
  }

  const allDates = Object.keys(dayMap).sort();
  const startDate = new Date(allDates[0]);
  const endDate   = new Date(allDates[allDates.length - 1]);

  // Start heatmap on the Monday before startDate
  const startMonday = new Date(startDate);
  startMonday.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));

  const maxMsgs = Math.max(...Object.values(dayMap).map(v => v.msgs));

  // Build week columns
  let current = new Date(startMonday);
  let weekCol = null;
  let lastMonth = -1;

  const tooltip = document.createElement('div');
  tooltip.id = 'hm-tooltip';
  tooltip.className = 'heatmap-tooltip';
  tooltip.style.opacity = '0';
  document.body.appendChild(tooltip);

  while (current <= endDate) {
    const dayOfWeek = (current.getDay() + 6) % 7; // Mon=0

    if (dayOfWeek === 0) {
      // New week — add month label column
      weekCol = document.createElement('div');
      weekCol.style.display = 'flex';
      weekCol.style.flexDirection = 'column';
      weekCol.style.gap = '3px';

      // Month label
      const monthLabel = document.createElement('div');
      monthLabel.className = 'heatmap-month-label';
      const curMonth = current.getMonth();
      if (curMonth !== lastMonth) {
        monthLabel.textContent = current.toLocaleString('default', { month: 'short' });
        lastMonth = curMonth;
      }
      weekCol.appendChild(monthLabel);
      container.appendChild(weekCol);
    }

    const key = current.toISOString().slice(0,10);
    const data = dayMap[key];
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    const level = data ? Math.min(4, Math.ceil((data.msgs / maxMsgs) * 4)) : 0;
    cell.setAttribute('data-level', level);
    cell.setAttribute('data-date', key);

    // Capture snapshot of date and data for the tooltip closure
    const snapDate = new Date(current);
    const snapData = data ? { ...data } : null;
    cell.addEventListener('mousemove', e => {
      if (snapData) {
        tooltip.innerHTML = `<strong>${formatDateNice(snapDate)}</strong>${snapData.msgs} message${snapData.msgs !== 1 ? 's' : ''} · ${snapData.words} words`;
        tooltip.style.opacity = '1';
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top  = (e.clientY - 28) + 'px';
      }
    });
    cell.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });

    weekCol.appendChild(cell);
    current.setDate(current.getDate() + 1);
  }

  // Streak calculation
  const sortedDays = Object.keys(dayMap).sort();
  let longest = 0, cur = 0, prev = null;
  sortedDays.forEach(d => {
    if (prev) {
      const diff = (new Date(d) - new Date(prev)) / 86400000;
      if (diff === 1) { cur++; longest = Math.max(longest, cur); }
      else cur = 1;
    } else cur = 1;
    prev = d;
  });

  // Current streak (from today back)
  let currentStreak = 0;
  const today = new Date().toISOString().slice(0,10);
  let checkDate = new Date();
  while (true) {
    const k = checkDate.toISOString().slice(0,10);
    if (dayMap[k]) { currentStreak++; checkDate.setDate(checkDate.getDate()-1); }
    else break;
    if (currentStreak > 10000) break;
  }

  document.getElementById('streak-current').textContent = `⚡ Current streak: ${currentStreak} day${currentStreak!==1?'s':''}`;
  document.getElementById('streak-longest').textContent  = `🏆 Longest streak: ${longest} day${longest!==1?'s':''}`;
}

// ══════════════════════════════════════════════════════════════════════════
// 6. CHARTS
// ══════════════════════════════════════════════════════════════════════════
function renderCharts() {
  const D = DATA;
  destroyCharts();

  const blurple = '#5865F2';
  const purple  = '#9b59b6';
  const fuchsia = '#eb459e';

  function mkGradient(ctx, c1, c2) {
    const g = ctx.createLinearGradient(0, 0, 0, 220);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
  }

  // ── Hourly ──
  {
    const ctx = document.getElementById('chart-hourly').getContext('2d');
    const labels = Array.from({length:24}, (_,i) => fmtHour(i));
    const peakIdx = D.peakHour;
    CHARTS['chart-hourly'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: D.hourly,
          backgroundColor: D.hourly.map((_,i) => i === peakIdx ? fuchsia : blurple + '88'),
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.y)} messages` } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#2e314055' }, ticks: { callback: v => fmtNum(v) } }
        }
      }
    });
  }

  // ── Daily (weekday) ──
  {
    const ctx = document.getElementById('chart-daily').getContext('2d');
    const peakIdx = D.peakDay;
    CHARTS['chart-daily'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: D.DAYS.map(d => d.slice(0,3)),
        datasets: [{
          data: D.daily,
          backgroundColor: D.daily.map((_,i) => i === peakIdx ? fuchsia : purple + 'aa'),
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.y)} messages` } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#2e314055' }, ticks: { callback: v => fmtNum(v) } }
        }
      }
    });
  }

  // ── Monthly ──
  {
    const ctx = document.getElementById('chart-monthly').getContext('2d');
    const grad = mkGradient(ctx, blurple + 'cc', blurple + '22');
    const peakIdx = D.peakMonth;
    CHARTS['chart-monthly'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: D.MONTHS.map(m => m.slice(0,3)),
        datasets: [{
          data: D.monthly,
          backgroundColor: D.monthly.map((_,i) => i === peakIdx ? fuchsia : blurple + '88'),
          borderRadius: 5,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.y)} messages` } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#2e314055' }, ticks: { callback: v => fmtNum(v) } }
        }
      }
    });
  }

  // ── Yearly ──
  {
    const ctx = document.getElementById('chart-yearly').getContext('2d');
    CHARTS['chart-yearly'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: D.yearly.map(y => y.year),
        datasets: [{
          data: D.yearly.map(y => y.count),
          borderColor: blurple,
          backgroundColor: blurple + '22',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: fuchsia,
          pointRadius: 5,
          pointHoverRadius: 8,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.y)} messages` } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#2e314055' }, ticks: { callback: v => fmtNum(v) } }
        }
      }
    });
  }

  // ── Top Channels ──
  {
    const ctx = document.getElementById('chart-channels').getContext('2d');
    const top10 = DATA.topChannels.slice(0,10);
    CHARTS['chart-channels'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map(c => truncate(Array.isArray(c.name) ? c.name[0] : c.name, 20)),
        datasets: [{
          data: top10.map(c => c.messageCount),
          backgroundColor: blurple + '99',
          borderColor: blurple,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.x)} messages` } } },
        scales: {
          x: { grid: { color: '#2e314055' }, ticks: { callback: v => fmtNum(v) } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  // ── Top DMs ──
  {
    const ctx = document.getElementById('chart-dms').getContext('2d');
    const top10 = DATA.topDMs.slice(0,10);
    CHARTS['chart-dms'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map(d => truncate(d.user_tag || 'Unknown', 20)),
        datasets: [{
          data: top10.map(d => d.messageCount),
          backgroundColor: purple + '99',
          borderColor: purple,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.x)} messages` } } },
        scales: {
          x: { grid: { color: '#2e314055' }, ticks: { callback: v => fmtNum(v) } },
          y: { grid: { display: false } }
        }
      }
    });
  }
}

function destroyCharts() {
  Object.values(CHARTS).forEach(c => c.destroy());
  CHARTS = {};
}

// ══════════════════════════════════════════════════════════════════════════
// 7. FUN STUFF
// ══════════════════════════════════════════════════════════════════════════
function renderFunStuff() {
  renderEmojiLeaderboard();
  renderWordCloud();
  renderHabits();
  renderRecords();
  renderEnergyCard();
  renderCursedStats();
  renderCustomEmojisChart();
  renderGuildsChart();
  renderBehaviorStats();
  renderLinks();
}

// ── Emoji leaderboard ────────────────────────────────────────────────────
function renderEmojiLeaderboard() {
  const el = document.getElementById('emoji-leaderboard');
  const top10 = DATA.topEmojis.slice(0, 10);
  if (!top10.length) { el.innerHTML = '<p class="text-discord-muted text-sm">No emoji data.</p>'; return; }

  const max = top10[0].count;
  el.innerHTML = top10.map((e, i) => `
    <div class="emoji-row">
      <span class="emoji-rank">#${i+1}</span>
      <span class="emoji-char">${e.emoji}</span>
      <div class="emoji-bar-wrap">
        <div class="emoji-bar" style="width:${Math.round((e.count/max)*100)}%"></div>
      </div>
      <span class="emoji-count">${e.count}</span>
    </div>
  `).join('');
}

// ── Word cloud ───────────────────────────────────────────────────────────
function renderWordCloud() {
  const wc = document.getElementById('word-cloud');
  const ws = document.getElementById('word-stats');

  const words = DATA.favoriteWords.slice(0, 40);
  if (!words.length) { wc.innerHTML = '<p class="text-discord-muted text-sm">No word data.</p>'; return; }

  const maxCount = words[0].count;
  const colors = ['#5865F2','#9b59b6','#eb459e','#57f287','#fee75c','#5cb8e4'];

  wc.innerHTML = words.map((w, i) => {
    const scale = 0.6 + (w.count / maxCount) * 0.9;
    const color = colors[i % colors.length];
    const size = Math.round(10 + (w.count / maxCount) * 14);
    return `<span class="word-tag" style="background:${color}22;color:${color};border:1px solid ${color}44;font-size:${size}px"
      title="${w.count} uses">${w.word}</span>`;
  }).join('');

  ws.innerHTML = `
    <div class="stat-row"><span class="sr-label">Most used word</span><span class="sr-value">${words[0].word}</span></div>
    <div class="stat-row"><span class="sr-label">Total unique words tracked</span><span class="sr-value">${fmtNum(DATA.favoriteWords.length)}</span></div>
    <div class="stat-row"><span class="sr-label">Avg words per message</span><span class="sr-value">~${DATA.avgWordsPerMsg}</span></div>
  `;
}

// ── Chatting habits ───────────────────────────────────────────────────────
function renderHabits() {
  const D = DATA;
  const el = document.getElementById('habits-stats');
  const weekendLabel = D.weekendPct >= 50 ? '🏖️ Mostly weekends' : '💼 Mostly weekdays';
  el.innerHTML = `
    <div class="stat-row"><span class="sr-label">Night messages (10pm–4am)</span><span class="sr-value">${D.nightPct}%</span></div>
    <div class="stat-row"><span class="sr-label">Most active weekday</span><span class="sr-value">${D.peakDayLabel}</span></div>
    <div class="stat-row"><span class="sr-label">Weekend vs weekday</span><span class="sr-value">${weekendLabel}</span></div>
    <div class="stat-row"><span class="sr-label">Weekend activity share</span><span class="sr-value">${D.weekendPct}% weekend</span></div>
    <div class="stat-row"><span class="sr-label">Peak month</span><span class="sr-value">${D.peakMonthLabel}</span></div>
    <div class="stat-row"><span class="sr-label">Avg chars per message</span><span class="sr-value">${D.avgCharsPerMsg}</span></div>
  `;
}

// ── Records ───────────────────────────────────────────────────────────────
function renderRecords() {
  const D = DATA;
  const el = document.getElementById('records-stats');

  const topChName = D.topChannel ? truncate(Array.isArray(D.topChannel.name) ? D.topChannel.name[0] : D.topChannel.name, 25) : '—';
  const topDMName = D.topDM ? D.topDM.user_tag : '—';

  const longest = D.longestMsg.sentence ? `"${truncate(D.longestMsg.sentence, 60)}"` : '—';

  el.innerHTML = `
    <div class="record-row"><span class="record-icon">🏆</span><div class="record-content"><div class="rc-label">Most messages in one channel</div><div class="rc-value">${fmtNum(D.topChannel?.messageCount || 0)} in ${topChName}</div></div></div>
    <div class="record-row"><span class="record-icon">💌</span><div class="record-content"><div class="rc-label">Top DM partner</div><div class="rc-value">${fmtNum(D.topDM?.messageCount || 0)} messages with ${topDMName}</div></div></div>
    <div class="record-row"><span class="record-icon">📜</span><div class="record-content"><div class="rc-label">Longest sample message</div><div class="rc-value">${longest}</div></div></div>
    <div class="record-row"><span class="record-icon">💬</span><div class="record-content"><div class="rc-label">Total channels chatted in</div><div class="rc-value">${fmtNum(D.topChannels.length)} channels</div></div></div>
    <div class="record-row"><span class="record-icon">👥</span><div class="record-content"><div class="rc-label">Total DM conversations</div><div class="rc-value">${fmtNum(D.topDMs.length)} DMs</div></div></div>
    <div class="record-row"><span class="record-icon">🎮</span><div class="record-content"><div class="rc-label">Servers joined</div><div class="rc-value">${D.stats.guildJoined || 0} total joins</div></div></div>
  `;
}

// ── Energy card ───────────────────────────────────────────────────────────
function renderEnergyCard() {
  const e = DATA.typingEnergy;
  const el = document.getElementById('energy-card');
  el.innerHTML = `
    <div class="energy-tier" style="background:${e.bg};border-color:${e.border};color:${e.color}">
      <div style="font-size:2.5rem;margin-bottom:.5rem">${e.icon}</div>
      <h4>${e.tier}</h4>
      <p style="color:${e.color}99">Based on your overall messaging activity</p>
      <div class="energy-formula">📊 ${e.formula}</div>
    </div>
  `;
}

// ── Cursed stats ──────────────────────────────────────────────────────────
function renderCursedStats() {
  const el = document.getElementById('cursed-stats');
  const top = DATA.topCursed.slice(0, 8);
  if (!top.length) { el.innerHTML = '<p class="text-discord-muted text-sm">You\'re apparently an angel. 😇</p>'; return; }
  const max = top[0].count;
  el.innerHTML = top.map((w, i) => `
    <div class="emoji-row">
      <span class="emoji-rank">#${i+1}</span>
      <span style="font-size:.85rem;font-weight:700;color:#ed4245;min-width:90px;flex-shrink:0">${w.word}</span>
      <div class="emoji-bar-wrap"><div class="emoji-bar" style="background:linear-gradient(90deg,#ed4245,#eb459e);width:${Math.round((w.count/max)*100)}%"></div></div>
      <span class="emoji-count">${w.count}</span>
    </div>
  `).join('');
}

// ── Custom emojis chart ───────────────────────────────────────────────────
function renderCustomEmojisChart() {
  const ctx = document.getElementById('chart-custom-emojis').getContext('2d');
  const top10 = DATA.topCustomEmojis.slice(0,10);
  if (!top10.length) return;

  const labels = top10.map(e => {
    const m = e.emoji.match(/:([\w_]+):/);
    return m ? m[1].replace(/_/g,' ').slice(0,18) : e.emoji.slice(0,18);
  });

  CHARTS['chart-custom-emojis'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: top10.map(e => e.count),
        backgroundColor: '#eb459e88',
        borderColor: '#eb459e',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: c => ` ${c.parsed.y} uses` } } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#2e314055' } }
      }
    }
  });
}

// ── Guilds chart ──────────────────────────────────────────────────────────
function renderGuildsChart() {
  const ctx = document.getElementById('chart-guilds').getContext('2d');
  const top = DATA.topGuilds.slice(0,10);
  if (!top.length) return;

  const guildColors = ['#5865F2','#9b59b6','#eb459e','#57f287','#fee75c','#5cb8e4','#f97316','#10b981','#f43f5e','#6366f1'];

  CHARTS['chart-guilds'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(g => truncate(g.guildName || (Array.isArray(g.name) ? g.name[0] : g.name), 20)),
      datasets: [{
        data: top.map(g => g.messageCount),
        backgroundColor: top.map((_, i) => guildColors[i % guildColors.length] + '99'),
        borderColor: top.map((_, i) => guildColors[i % guildColors.length]),
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.x)} messages` } } },
      scales: {
        x: { grid: { color: '#2e314055' }, ticks: { callback: v => fmtNum(v) } },
        y: { grid: { display: false } }
      }
    }
  });
}

// ── Behavior stats ────────────────────────────────────────────────────────
function renderBehaviorStats() {
  const s = DATA.stats;
  const items = [
    { val: fmtNum(s.sendMessage || 0),         lbl: 'Messages Sent (tracked)' },
    { val: fmtNum(s.messageEdited || 0),       lbl: 'Messages Edited' },
    { val: fmtNum(s.addReaction || 0),         lbl: 'Reactions Added' },
    { val: fmtNum(s.replyStarted || 0),        lbl: 'Replies Started' },
    { val: fmtNum(s.slashCommandUsed || 0),    lbl: 'Slash Commands Used' },
    { val: fmtNum(s.searchOpened || 0),        lbl: 'Searches Made' },
    { val: fmtNum(s.keyboardShortcutUsed || 0),lbl: 'Keyboard Shortcuts' },
    { val: fmtNum(s.appCrashed || 0),          lbl: 'App Crashes 💀' },
  ];
  const el = document.getElementById('behavior-stats');
  el.innerHTML = items.map(i => `
    <div class="behavior-stat">
      <div class="bs-val">${i.val}</div>
      <div class="bs-lbl">${i.lbl}</div>
    </div>
  `).join('');
}

// ── Links ─────────────────────────────────────────────────────────────────
function renderLinks() {
  const el = document.getElementById('links-list');
  const links = DATA.topLinks.slice(0, 8);
  if (!links.length) { el.innerHTML = '<p class="text-discord-muted text-sm">No link data.</p>'; return; }
  el.innerHTML = links.map((l, i) => `
    <div class="stat-row">
      <span class="sr-label">#${i+1} ${truncate(l.word, 50)}</span>
      <span class="sr-value">${l.count}×</span>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════════════════════
// 8. FILTERS
// ══════════════════════════════════════════════════════════════════════════
function renderFilters() {
  const D = DATA;

  // Populate year options
  const yearSel = document.getElementById('filter-year');
  D.yearly.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y.year;
    opt.textContent = y.year;
    yearSel.appendChild(opt);
  });

  // Populate month options
  const monthSel = document.getElementById('filter-month');
  D.MONTHS.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m;
    monthSel.appendChild(opt);
  });

  // Event listeners
  ['filter-year','filter-month','filter-type'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
  document.getElementById('reset-filters-btn').addEventListener('click', resetFilters);
}

function applyFilters() {
  FILTERS.year  = document.getElementById('filter-year').value;
  FILTERS.month = document.getElementById('filter-month').value;
  FILTERS.type  = document.getElementById('filter-type').value;

  const active = FILTERS.year !== 'all' || FILTERS.month !== 'all' || FILTERS.type !== 'all';
  document.getElementById('active-filter-badge').classList.toggle('hidden', !active);
  document.getElementById('reset-filters-btn').classList.toggle('hidden', !active);

  // For this dataset structure, full per-day granularity isn't available for most stats.
  // We update what we can — charts with index-based data, and show a filtered note.
  updateChartsForFilter();
}

function resetFilters() {
  FILTERS = { year: 'all', month: 'all', type: 'all' };
  document.getElementById('filter-year').value  = 'all';
  document.getElementById('filter-month').value = 'all';
  document.getElementById('filter-type').value  = 'all';
  document.getElementById('active-filter-badge').classList.add('hidden');
  document.getElementById('reset-filters-btn').classList.add('hidden');
  updateChartsForFilter();
}

function updateChartsForFilter() {
  const D = DATA;
  const blurple = '#5865F2';
  const fuchsia = '#eb459e';
  const purple = '#9b59b6';

  // When year is selected, highlight that year in yearly chart
  if (CHARTS['chart-yearly'] && FILTERS.year !== 'all') {
    const yr = parseInt(FILTERS.year);
    CHARTS['chart-yearly'].data.datasets[0].pointBackgroundColor = D.yearly.map(y => y.year === yr ? '#fee75c' : fuchsia);
    CHARTS['chart-yearly'].data.datasets[0].pointRadius = D.yearly.map(y => y.year === yr ? 10 : 5);
    CHARTS['chart-yearly'].update();
  } else if (CHARTS['chart-yearly']) {
    CHARTS['chart-yearly'].data.datasets[0].pointBackgroundColor = fuchsia;
    CHARTS['chart-yearly'].data.datasets[0].pointRadius = 5;
    CHARTS['chart-yearly'].update();
  }

  // When month selected, highlight in monthly chart
  if (CHARTS['chart-monthly'] && FILTERS.month !== 'all') {
    const mi = parseInt(FILTERS.month);
    CHARTS['chart-monthly'].data.datasets[0].backgroundColor = D.monthly.map((_,i) => i === mi ? '#fee75c' : blurple + '88');
    CHARTS['chart-monthly'].update();
  } else if (CHARTS['chart-monthly']) {
    const peakIdx = D.peakMonth;
    CHARTS['chart-monthly'].data.datasets[0].backgroundColor = D.monthly.map((_,i) => i === peakIdx ? fuchsia : blurple + '88');
    CHARTS['chart-monthly'].update();
  }

  // Filter DMs/Channels chart based on type
  if (FILTERS.type === 'dms') {
    if (CHARTS['chart-channels']) {
      CHARTS['chart-channels'].data.datasets[0].backgroundColor = blurple + '33';
      CHARTS['chart-channels'].update();
    }
  } else if (FILTERS.type === 'channels') {
    if (CHARTS['chart-dms']) {
      CHARTS['chart-dms'].data.datasets[0].backgroundColor = purple + '33';
      CHARTS['chart-dms'].update();
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 9. WRAPPED STORY MODE
// ══════════════════════════════════════════════════════════════════════════
function setupWrapped() {
  document.getElementById('wrapped-btn').addEventListener('click', openWrapped);
  document.getElementById('wrapped-close').addEventListener('click', closeWrapped);
  document.getElementById('wrapped-restart').addEventListener('click', () => goToSlide(0));
  document.getElementById('wrapped-next').addEventListener('click', () => goToSlide(wrappedSlideIndex + 1));
  document.getElementById('wrapped-prev').addEventListener('click', () => goToSlide(wrappedSlideIndex - 1));
  document.getElementById('wrapped-export').addEventListener('click', exportSlide);

  // Close on backdrop click
  document.getElementById('wrapped-bg').addEventListener('click', closeWrapped);

  // Keyboard
  document.addEventListener('keydown', e => {
    if (!document.getElementById('wrapped-modal').classList.contains('hidden')) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goToSlide(wrappedSlideIndex + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToSlide(wrappedSlideIndex - 1); }
      if (e.key === 'Escape') closeWrapped();
    }
  });
}

function buildSlides() {
  const D = DATA;
  const totalWords = D.totalWords;
  const topEmoji = D.topEmojis[0]?.emoji || '❓';
  const topWord = D.favoriteWords[0]?.word || '—';

  const slides = [
    // 0 — Intro
    {
      bg: 'linear-gradient(135deg, #0e0f13 0%, #1a1c50 100%)',
      html: `
        <div class="slide-emoji">🎉</div>
        <div class="slide-title">${D.username}'s</div>
        <div class="slide-number" style="font-size:2.5rem">Discord<br>Wrapped</div>
        <div class="slide-subtitle">Let's take a look at your time on Discord. Ready?</div>
      `
    },
    // 1 — Total messages
    {
      bg: 'linear-gradient(135deg, #1a0e30 0%, #5865F2 100%)',
      html: `
        <div class="slide-title">You sent</div>
        <div class="slide-number">${fmtNum(D.totalMessages)}</div>
        <div class="slide-title">messages</div>
        <div class="slide-subtitle">${D.totalMessages > 500000 ? 'Your keyboard has suffered immensely.' : D.totalMessages > 100000 ? 'That\'s a lot of words.' : 'Every message counts.'}</div>
      `
    },
    // 2 — Total words
    {
      bg: 'linear-gradient(135deg, #0e1a30 0%, #9b59b6 100%)',
      html: `
        <div class="slide-title">You typed</div>
        <div class="slide-number">${fmtNum(totalWords)}</div>
        <div class="slide-title">words</div>
        <div class="slide-subtitle">That's ${totalWords > 80000 ? 'more than a full novel.' : totalWords > 30000 ? 'a short story worth of text.' : 'more than you think.'}</div>
      `
    },
    // 3 — Peak hour
    {
      bg: 'linear-gradient(135deg, #1a0e1a 0%, #eb459e 100%)',
      html: `
        <div class="slide-emoji">🕐</div>
        <div class="slide-title">Your peak hour</div>
        <div class="slide-number">${D.peakHourLabel}</div>
        <div class="slide-subtitle">${D.peakHour >= 22 || D.peakHour <= 4 ? 'The night calls, and you answer.' : D.peakHour <= 9 ? 'Morning person! Respect.' : 'Prime Discord hours.'}</div>
      `
    },
    // 4 — Most active day
    {
      bg: 'linear-gradient(135deg, #0e1a0e 0%, #57f287 30%, #5865F2 100%)',
      html: `
        <div class="slide-emoji">📅</div>
        <div class="slide-title">Your most active day</div>
        <div class="slide-number" style="font-size:3.5rem">${D.peakDayLabel}</div>
        <div class="slide-subtitle">The rest of the week was just warming up.</div>
      `
    },
    // 5 — Top emoji
    {
      bg: 'linear-gradient(135deg, #1a1a0e 0%, #fee75c 50%, #eb459e 100%)',
      html: `
        <div class="slide-title">Your most-used emoji</div>
        <div style="font-size:5rem;margin:1rem 0">${topEmoji}</div>
        <div class="slide-subtitle">Used ${D.topEmojis[0]?.count || 0} times. It just feels right, doesn't it?</div>
      `
    },
    // 6 — Top word
    {
      bg: 'linear-gradient(135deg, #0e1a1a 0%, #5cb8e4 100%)',
      html: `
        <div class="slide-title">Your favorite word</div>
        <div class="slide-number" style="font-size:3rem;word-break:break-all">${topWord}</div>
        <div class="slide-subtitle">You used it ${D.favoriteWords[0]?.count || 0} times. You really had something to express.</div>
      `
    },
    // 7 — Personality
    {
      bg: `linear-gradient(135deg, #0e0f13 0%, ${D.personality.color}44 100%)`,
      html: `
        <div class="slide-emoji">${D.personality.icon}</div>
        <div class="slide-title">You are</div>
        <div class="slide-number" style="font-size:2rem;color:${D.personality.color}">${D.personality.title}</div>
        <div class="slide-subtitle">${D.personality.desc}</div>
      `
    },
    // 8 — Typing energy
    {
      bg: `linear-gradient(135deg, #0e0f13 0%, ${DATA.typingEnergy.color}44 100%)`,
      html: `
        <div class="slide-emoji">${DATA.typingEnergy.icon}</div>
        <div class="slide-title">Typing energy level</div>
        <div class="slide-number" style="font-size:2rem;color:${DATA.typingEnergy.color}">${DATA.typingEnergy.tier}</div>
        <div class="slide-subtitle">${DATA.typingEnergy.formula}</div>
      `
    },
    // 9 — Final summary
    {
      bg: 'linear-gradient(135deg, #0e0f13, #5865F2 50%, #eb459e)',
      html: `
        <div class="slide-emoji">✨</div>
        <div class="slide-number" style="font-size:2.2rem">That's a wrap,<br>${D.username}!</div>
        <div class="slide-subtitle">
          ${fmtNum(D.totalMessages)} messages · ${fmtNum(totalWords)} words<br>
          ${D.peakDayLabel}s at ${D.peakHourLabel} · ${D.typingEnergy.tier}
        </div>
        <div style="margin-top:1.5rem;font-size:.8rem;color:rgba(255,255,255,.5)">Discord Wrapped — your story, your stats</div>
      `
    }
  ];
  return slides;
}

let wrappedSlides = [];

function openWrapped() {
  wrappedSlides = buildSlides();
  const container = document.getElementById('wrapped-slides');
  container.innerHTML = '';

  wrappedSlides.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'wrapped-slide' + (i === 0 ? ' active' : '');
    div.style.background = s.bg;
    div.innerHTML = s.html;
    container.appendChild(div);
  });

  // Build dots
  const dotsEl = document.getElementById('wrapped-dots');
  dotsEl.innerHTML = wrappedSlides.map((_, i) =>
    `<div class="wrapped-dot${i===0?' active':''}" data-idx="${i}"></div>`
  ).join('');
  dotsEl.querySelectorAll('.wrapped-dot').forEach(d => {
    d.addEventListener('click', () => goToSlide(parseInt(d.dataset.idx)));
  });

  wrappedSlideIndex = 0;
  document.getElementById('wrapped-modal').classList.remove('hidden');
}

function closeWrapped() {
  document.getElementById('wrapped-modal').classList.add('hidden');
}

function goToSlide(idx) {
  const slides = document.querySelectorAll('.wrapped-slide');
  if (!slides.length) return;
  idx = Math.max(0, Math.min(idx, slides.length - 1));

  slides[wrappedSlideIndex].classList.remove('active');
  slides[wrappedSlideIndex].classList.add('exit');
  setTimeout(() => slides[wrappedSlideIndex]?.classList.remove('exit'), 400);

  wrappedSlideIndex = idx;
  slides[wrappedSlideIndex].classList.add('active');

  // Update dots
  document.querySelectorAll('.wrapped-dot').forEach((d, i) => {
    d.classList.toggle('active', i === wrappedSlideIndex);
  });
}

function exportSlide() {
  const slideEl = document.querySelectorAll('.wrapped-slide')[wrappedSlideIndex];
  if (!slideEl || typeof html2canvas === 'undefined') {
    alert('Export requires html2canvas. Please ensure the page is fully loaded.');
    return;
  }
  html2canvas(slideEl, { backgroundColor: null, scale: 2 }).then(canvas => {
    const a = document.createElement('a');
    a.download = `discord-wrapped-${DATA.username}-slide${wrappedSlideIndex + 1}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });
}

// ══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════
function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fmtHour(h) {
  if (h === 0)  return '12 AM';
  if (h < 12)   return h + ' AM';
  if (h === 12) return '12 PM';
  return (h - 12) + ' PM';
}

function truncate(str, max) {
  if (!str) return '';
  str = String(str);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function formatDateNice(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) + ' — ';
}
