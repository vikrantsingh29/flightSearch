const ROUTES = {
  EK: {
    name: 'Emirates',
    hub: 'DXB',
    hubCity: 'Dubai',
    color: '#d4a843',
    legs: [
      { from: 'BLR', to: 'DXB', flightNum: 'EK565', depTime: '10:25', arrTime: '13:00', dur: '4h05m' },
      { from: 'DXB', to: 'FRA', flightNum: 'EK047', depTime: '14:05', arrTime: '19:20', dur: '8h15m' }
    ],
    official: {
      statusUrl: 'https://www.emirates.com/us/english/manage-booking/flight-status/',
      updatesUrl: 'https://www.emirates.com/us/english/help/travel-updates/',
      airportUrl: 'https://www.frankfurt-airport.com/en/flights-and-transfer/arrivals.html/',
      statusHint: 'Emirates is sourced from the official airline data flow in local mode and from published snapshots on GitHub Pages.',
      strategyHint: 'Use the Emirates card first, then open the airline page if you want the full public status view.'
    }
  },
  QR: {
    name: 'Qatar Airways',
    hub: 'DOH',
    hubCity: 'Doha',
    color: '#8b1a2a',
    legs: [
      { from: 'BLR', to: 'DOH', flightNum: 'QR573', depTime: '09:25', arrTime: '11:30', dur: '4h35m' },
      { from: 'DOH', to: 'FRA', flightNum: 'QR71', depTime: '14:00', arrTime: '20:55', dur: '7h55m' }
    ],
    official: {
      statusUrl: 'https://fs.qatarairways.com/flightstatus/search',
      updatesUrl: 'https://www.qatarairways.com/en-am/travel-alerts.html',
      airportUrl: 'https://www.frankfurt-airport.com/en/flights-and-transfer/arrivals.html/',
      statusHint: 'Qatar Airways is sourced from the official public status flow in local mode and from published snapshots on GitHub Pages when the airline publishes a result.',
      strategyHint: 'Use the QR card first, then open the Qatar status page or travel alerts when the public result is missing for your date.'
    }
  },
  GF: {
    name: 'Gulf Air',
    hub: 'BAH',
    hubCity: 'Bahrain',
    color: '#c2002f',
    legs: [
      { from: 'BLR', to: 'BAH', flightNum: 'GF209', depTime: '05:45', arrTime: '08:00', dur: '4h15m' },
      { from: 'BAH', to: 'FRA', flightNum: 'GF004', depTime: '10:00', arrTime: '14:20', dur: '6h20m' }
    ],
    official: {
      statusUrl: 'https://www.gulfair.com/flying-with-us/before-you-travel/flight-status',
      updatesUrl: 'https://www.gulfair.com/en/',
      airportUrl: 'https://www.frankfurt-airport.com/en/flights-and-transfer/arrivals.html/',
      statusHint: 'Gulf Air exposes a public flight-status form on its website.',
      strategyHint: 'Use Gulf Air flight status for both legs, then verify the Frankfurt arrival board for GF004.'
    }
  },
  AI: {
    name: 'Air India',
    hub: 'DEL',
    hubCity: 'Delhi',
    color: '#e05a11',
    legs: [
      { from: 'BLR', to: 'DEL', flightNum: 'AI503', depTime: '06:00', arrTime: '09:10', dur: '3h10m' },
      { from: 'DEL', to: 'FRA', flightNum: 'AI121', depTime: '14:10', arrTime: '18:30', dur: '9h20m' }
    ],
    official: {
      statusUrl: 'https://www.airindia.com/in/en/manage/flight-status.html',
      updatesUrl: 'https://www.airindia.com/in/en/middle-east-travel-updates.html',
      airportUrl: 'https://www.frankfurt-airport.com/en/flights-and-transfer/arrivals.html/',
      statusHint: 'Air India exposes status only in a narrow date window, so the airline page is the source to check near departure.',
      strategyHint: 'Outside the small public window, use network updates and then re-check the official status page when the date gets closer.'
    }
  }
};

const MIN_LAYOVER = { EK: 120, QR: 90, GF: 90, AI: 150 };
const LOCAL_TRACKER_BASE_URL = 'http://127.0.0.1:8787';
const TRACKER_MODE =
  window.TRACKER_MODE || (window.location.hostname.endsWith('github.io') ? 'static-pages' : 'local-helper');
const STATIC_DATA_BASE = window.TRACKER_DATA_BASE || './data';
const TRACKER_PAGES_URL = window.TRACKER_PAGES_URL || 'https://vikrantsingh29.github.io/flightSearch/';
const NO_CHANCE_LAYOVER_MINUTES = 60;
const RISKY_LAYOVER_MINUTES = 120;
const AIRPORT_META = {
  BLR: { city: 'Bengaluru', fixed: true },
  DXB: { city: 'Dubai', fixed: false },
  DOH: { city: 'Doha', fixed: false },
  BAH: { city: 'Bahrain', fixed: false },
  DEL: { city: 'Delhi', fixed: false },
  FRA: { city: 'Frankfurt', fixed: true }
};
const EXPERIENCE_TONE_COLORS = {
  healthy: '#00e676',
  risky: '#ffd740',
  blocked: '#ff4444',
  manual: '#8deaff',
  pending: '#5c7094'
};
let helperAutomatedCodes = ['EK', 'QR'];
let helperManualCodes = ['GF', 'AI'];

let selectedAirline = 'all';
let selectedDate = null;
let dates = [];
let currentData = null;
let activeFetchToken = 0;
let pendingAirlineScroll = null;
let routeResizeFrame = null;
const experienceState = {
  initialized: false,
  resizeBound: false,
  hoverCode: null,
  nodePositions: {},
  svg: null,
  routeRecords: [],
  airportData: [],
  width: 0,
  height: 0
};

function generateDates() {
  const list = [];
  const today = new Date();

  for (let i = 3; i >= 1; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    list.push({ date, past: true });
  }

  for (let i = 0; i <= 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    list.push({ date, past: false });
  }

  return list;
}

function getSelectedDateIndex() {
  if (selectedDate !== null && dates[selectedDate]) return selectedDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIdx = dates.findIndex(item => item.date.toDateString() === today.toDateString());
  return todayIdx >= 0 ? todayIdx : 0;
}

function getDateMode(date) {
  const selected = new Date(date);
  selected.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selected.getTime() < today.getTime()) return 'past';
  if (selected.getTime() > today.getTime()) return 'future';
  return 'today';
}

function formatApiDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function buildBookingUrl(code, date) {
  const apiDate = formatApiDate(date);

  if (code === 'QR') {
    const params = new URLSearchParams({
      widget: 'QR',
      searchType: 'F',
      addTaxToFare: 'Y',
      minPurTime: '0',
      selLang: 'en',
      tripType: 'O',
      fromStation: 'BLR',
      toStation: 'FRA',
      departing: apiDate,
      bookingClass: 'E',
      adults: '1',
      children: '0',
      infants: '0',
      ofw: '0',
      teenager: '0',
      flexibleDate: 'off',
      allowRedemption: 'N'
    });
    return `https://www.qatarairways.com/app/booking/flight-selection?${params.toString()}`;
  }

  return null;
}

function updateLastUpdated(label) {
  document.getElementById('lastUpdated').textContent =
    `Updated: ${new Date().toLocaleTimeString()} · ${label}`;
}

function formatAirlineList(codes) {
  const names = codes
    .map(code => ROUTES[code]?.name || code)
    .filter(Boolean);

  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function isLocallyAutomated(code) {
  return helperAutomatedCodes.includes(code);
}

function isStaticPagesMode() {
  return TRACKER_MODE === 'static-pages';
}

function getStrategyOverviewText() {
  const automatedText = helperAutomatedCodes.length
    ? isStaticPagesMode()
      ? `${formatAirlineList(helperAutomatedCodes)} ${helperAutomatedCodes.length === 1 ? 'is' : 'are'} published here as GitHub Pages snapshots from official airline sources.`
      : `${formatAirlineList(helperAutomatedCodes)} ${helperAutomatedCodes.length === 1 ? 'is' : 'are'} automated locally from official airline sources.`
    : isStaticPagesMode()
      ? 'No airline snapshots are published right now.'
      : 'No airlines are automated locally right now.';
  const manualText = helperManualCodes.length
    ? ` ${formatAirlineList(helperManualCodes)} ${helperManualCodes.length === 1 ? 'still uses' : 'still use'} the official click-through pages below.`
    : '';

  return `${automatedText}${manualText}`;
}

function updateLastUpdated(label, timestamp = null) {
  const value = timestamp ? new Date(timestamp) : new Date();
  const safeValue = Number.isNaN(value.getTime()) ? new Date() : value;

  document.getElementById('lastUpdated').textContent =
    `Updated: ${safeValue.toLocaleString()} · ${label}`;
}

function getLoadingMessage() {
  if (isStaticPagesMode()) {
    return 'Loading the latest published GitHub Pages snapshot for Emirates and Qatar Airways, then preparing manual-source cards for the remaining airlines.';
  }

  return 'Checking the localhost helper for Emirates and Qatar Airways, then preparing manual-source cards for the remaining airlines.';
}

function getResultLabel(payload, selectedDateObj) {
  if (isStaticPagesMode()) {
    return `Published snapshot · ${formatDisplayDate(selectedDateObj)}`;
  }

  return `Official source · ${formatDisplayDate(selectedDateObj)}`;
}

function getVisibleAirlineCodes() {
  return selectedAirline === 'all' ? Object.keys(ROUTES) : [selectedAirline];
}

function getSelectedDateObject() {
  return dates[getSelectedDateIndex()]?.date || new Date();
}

function clearApiErrors() {
  document.querySelectorAll('.api-banner').forEach(el => el.remove());
}

function showApiBanner(title, body, tone = 'warning') {
  const existing = document.querySelector('.api-banner');
  if (existing) existing.remove();

  const note = document.createElement('div');
  const palette = tone === 'info'
    ? {
        background: 'rgba(0,212,255,0.08)',
        border: 'rgba(0,212,255,0.35)',
        color: '#8deaff'
      }
    : {
        background: 'rgba(255,215,64,0.08)',
        border: 'rgba(255,215,64,0.35)',
        color: '#ffd740'
      };

  note.className = 'api-banner';
  note.style.cssText = `background:${palette.background};border:1px solid ${palette.border};border-radius:12px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:${palette.color};line-height:1.7;`;
  note.innerHTML = `<strong>${title}:</strong> ${body}`;

  const results = document.getElementById('results');
  results.parentNode.insertBefore(note, results);
}

function renderStateBox(title, message, icon = '✈️', clearErrors = false, label = 'Waiting') {
  if (clearErrors) clearApiErrors();
  currentData = null;
  document.getElementById('summaryBar').innerHTML = '';
  document.getElementById('results').innerHTML = `
    <div class="state-box">
      <div style="font-size:48px; margin-bottom:16px;">${icon}</div>
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `;
  updateLastUpdated(label);
  animateStagedElements();
  scrollToPendingAirline();
  syncInteractiveExperience();
}

function buildStrategyCards(codes = getVisibleAirlineCodes()) {
  const selectedDateObj = getSelectedDateObject();
  const dateMode = getDateMode(selectedDateObj);

  return codes.map(code => {
    const route = ROUTES[code];
    const official = route.official || {};
    const bookingUrl = buildBookingUrl(code, selectedDateObj);
    const timingNote = dateMode === 'future'
      ? bookingUrl
        ? 'Use the airline booking page for future schedule and fare visibility, then re-check the public status tool closer to departure.'
        : 'Use the airline schedule and travel-alert pages now, then re-check the public status tool closer to departure.'
      : dateMode === 'past'
        ? 'Past results may disappear from public airline tools, so keep booking emails and airport records as backup.'
        : 'Check the airline status page first, then confirm the last leg against Frankfurt arrivals.';

    return `
      <div class="strategy-card staged-card" data-airline="${code}">
        <h4>${route.name}</h4>
        <div class="meta">${route.legs[0].flightNum} · ${route.legs[1].flightNum} · via ${route.hub}</div>
        <p>${official.statusHint || ''}</p>
        <ul class="strategy-list">
          <li>${official.strategyHint || ''}</li>
          <li>${timingNote}</li>
          <li>Selected date: ${formatDisplayDate(selectedDateObj)}</li>
        </ul>
        <div class="strategy-actions">
          <a class="strategy-link" href="${official.statusUrl || '#'}" target="_blank" rel="noopener noreferrer">Open airline status</a>
          ${bookingUrl ? `<a class="strategy-link alt" href="${bookingUrl}" target="_blank" rel="noopener noreferrer">Open booking fares</a>` : ''}
          <a class="strategy-link alt" href="${official.updatesUrl || '#'}" target="_blank" rel="noopener noreferrer">Open travel updates</a>
          <a class="strategy-link" href="${official.airportUrl || '#'}" target="_blank" rel="noopener noreferrer">Open FRA arrivals</a>
        </div>
      </div>
    `;
  }).join('');
}

function renderLocalHelperState(clearErrors = false, reason = '') {
  renderOfficialStrategy(
    'Local Helper Required',
    `Run <code>npm start</code> in this folder to enable ${formatAirlineList(helperAutomatedCodes)} automation from the airlines' official public sources.${reason ? `<br><br><strong>Last helper error:</strong> ${reason}` : ''}`,
    'Local helper offline',
    clearErrors
  );
}

function renderStaticSnapshotState(clearErrors = false, reason = '') {
  renderOfficialStrategy(
    'Published Snapshot Unavailable',
    `This GitHub Pages build shows published snapshots generated from the official-source scraper.${reason ? `<br><br><strong>Last snapshot error:</strong> ${reason}` : ''}<br><br>Try the live version at <a href="${TRACKER_PAGES_URL}" target="_blank" rel="noopener noreferrer">${TRACKER_PAGES_URL}</a> after the next deployment, or run <code>npm start</code> locally for live helper mode.`,
    'Published snapshot unavailable',
    clearErrors
  );
}

function renderOfficialStrategy(title, message, label = 'Official-source plan', clearErrors = false, codes = getVisibleAirlineCodes()) {
  if (clearErrors) clearApiErrors();
  currentData = null;
  document.getElementById('summaryBar').innerHTML = '';

  document.getElementById('results').innerHTML = `
    <div class="state-box">
      <div style="font-size:48px; margin-bottom:16px;">🧭</div>
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
    <div class="strategy-overview">${getStrategyOverviewText()}</div>
    <div class="strategy-grid">${buildStrategyCards(codes)}</div>
  `;

  updateLastUpdated(label);
  animateStagedElements();
  scrollToPendingAirline();
  syncInteractiveExperience();
}

function renderDateStrip() {
  const strip = document.getElementById('dateStrip');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  strip.innerHTML = dates.map((item, index) => {
    const date = item.date;
    const isToday = date.toDateString() === today.toDateString();
    const isTarget = (date.getDate() === 4 || date.getDate() === 5) && date.getMonth() === 3;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return `
      <div class="date-pill ${isToday ? 'today' : ''} ${isTarget ? 'target' : ''} ${selectedDate === index ? 'active' : ''}"
        onclick="selectDate(${index})" title="${isTarget ? 'Your target travel date' : ''}">
        <div class="day">${days[date.getDay()]}</div>
        <div class="num">${date.getDate()}</div>
        <div class="month">${months[date.getMonth()]}</div>
        ${isTarget ? '<div style="font-size:9px;color:#ff6b35;font-weight:700;">TARGET</div>' : ''}
      </div>
    `;
  }).join('');
}

function selectDate(index) {
  selectedDate = index;
  renderDateStrip();
  clearApiErrors();
  syncInteractiveExperience();
  fetchData();
}

function setAirline(code) {
  selectedAirline = code;
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.airline === code);
  });
  syncInteractiveExperience();
  fetchData();
}

function clockToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function diffClock(start, end) {
  const startMinutes = clockToMinutes(start);
  const endMinutes = clockToMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;

  let diff = endMinutes - startMinutes;
  if (diff < 0) diff += 1440;
  return diff;
}

function formatDurationValue(value, fallback) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return fallback;
  return `${Number(match[1])}h${match[2]}m`;
}

function getLegMeta(routeLeg, data, prefix, defaultArrivalLabel, allowRouteFallback = true) {
  const fallback = allowRouteFallback
    ? routeLeg
    : { flightNum: 'Unavailable', depTime: '--', arrTime: '--', dur: '--' };

  return {
    flightNumber: data?.[`${prefix}FlightNumber`] || fallback.flightNum,
    depTime: data?.[`${prefix}DepDisplay`] || data?.[`${prefix}ScheduledDep`] || fallback.depTime,
    depLabel: data?.[`${prefix}DepLabel`] || 'Departure',
    arrTime: data?.[`${prefix}ArrDisplay`] || data?.[`${prefix}ScheduledArr`] || fallback.arrTime,
    arrLabel: data?.[`${prefix}ArrLabel`] || defaultArrivalLabel,
    duration: formatDurationValue(data?.[`${prefix}Duration`], fallback.dur)
  };
}

function calcLayover(routeCode, data) {
  const fallback = { EK: 635, QR: 150, GF: 120, AI: 300 };
  let scheduled = data?.layoverScheduledMinutes;

  if (scheduled === null || scheduled === undefined) {
    const scheduledFromLive = diffClock(data?.leg1ScheduledArr, data?.leg2ScheduledDep);
    scheduled = scheduledFromLive !== null ? scheduledFromLive : fallback[routeCode];
  }

  let actual = data?.layoverActualMinutes;
  if (actual === null || actual === undefined) {
    actual = Math.max(scheduled - (data?.leg1Delay || 0), 0);
    const predictedArrival = data?.leg1ArrActual || data?.leg1EstimatedArr || data?.leg1ScheduledArr;
    const predictedDeparture = data?.leg2DepActual || data?.leg2EstimatedDep || data?.leg2ScheduledDep;
    const actualFromLive = diffClock(predictedArrival, predictedDeparture);
    if (actualFromLive !== null) actual = actualFromLive;
  }

  const min = data?.minimumLayoverMinutes ?? MIN_LAYOVER[routeCode];
  const basis = actual ?? scheduled ?? 0;
  const ok = typeof data?.connectionPossible === 'boolean' ? data.connectionPossible : basis >= min;

  return { scheduled, actual, min, ok };
}

function getUnavailableMessage(code, record) {
  const route = ROUTES[code];
  const selectedDateText = formatDisplayDate(getSelectedDateObject());
  const possessiveName = route.name.endsWith('s') ? `${route.name}'` : `${route.name}'s`;

  if (isLocallyAutomated(code)) {
    const detail = record?.error || `${route.name} did not publish a usable public result for ${selectedDateText}.`;
    if (isStaticPagesMode()) {
      return `The published snapshot did not include a usable ${route.name} result for ${selectedDateText}. ${detail}`;
    }
    return `The local helper reached ${possessiveName} official public source, but it did not return a usable result for ${selectedDateText}. ${detail}`;
  }

  return `${route.name} still uses manual official-source checks for ${selectedDateText}. Open the airline and airport pages below.`;
}

function getMissingAutomationSummary(codes, data) {
  const automatedUnavailable = codes.filter(code => isLocallyAutomated(code) && !data[code]?.isLive);
  const manualOnly = codes.filter(code => !isLocallyAutomated(code));
  const parts = [];

  if (automatedUnavailable.length) {
    const details = automatedUnavailable
      .map(code => `${ROUTES[code].name}: ${data[code]?.error || 'no public result published'}`)
      .join(' | ');
    parts.push(`${formatAirlineList(automatedUnavailable)} did not publish a usable public result for this date. ${details}`);
  }

  if (manualOnly.length) {
    parts.push(`${formatAirlineList(manualOnly)} ${manualOnly.length === 1 ? 'still uses' : 'still use'} manual official-source checks.`);
  }

  return parts.join(' ');
}

function formatStatusBadge(status, delay, emptyLabel = 'UNKNOWN') {
  const safeStatus = status || 'unknown';
  const baseLabel = safeStatus === 'unknown'
    ? emptyLabel
    : safeStatus.replace('-', ' ').toUpperCase();
  const delayLabel = delay > 0 ? ` +${delay}m` : '';

  return {
    className: ['on-time', 'delayed', 'cancelled', 'scheduled'].includes(safeStatus) ? safeStatus : 'unknown',
    label: `${baseLabel}${delayLabel}`
  };
}

function renderResults(data) {
  currentData = data;
  const results = document.getElementById('results');
  const visibleCodes = getVisibleAirlineCodes();
  const liveCodes = visibleCodes.filter(code => data[code]?.isLive);

  if (!liveCodes.length) {
    const title = selectedAirline === 'all'
      ? 'Official Checks Needed'
      : isLocallyAutomated(selectedAirline)
        ? `${ROUTES[selectedAirline].name} Public Result Unavailable`
        : `${ROUTES[selectedAirline].name} Needs Manual Checking`;
    const message = selectedAirline === 'all'
      ? getMissingAutomationSummary(visibleCodes, data)
      : getUnavailableMessage(selectedAirline, data[selectedAirline]);
    renderOfficialStrategy(title, message, 'Official-source plan', false, visibleCodes);
    return;
  }

  let feasible = 0;
  let risky = 0;
  let blocked = 0;
  let html = '';

  liveCodes.forEach(code => {
    const route = ROUTES[code];
    const live = data[code];
    const layover = calcLayover(code, live);
    const leg1 = getLegMeta(route.legs[0], live, 'leg1', route.hub);
    const leg2 = getLegMeta(route.legs[1], live, 'leg2', 'Arrival', !live.leg2Missing);
    const leg1Badge = formatStatusBadge(live.leg1Status, live.leg1Delay);
    const leg2Badge = formatStatusBadge(
      live.leg2Missing ? 'unknown' : live.leg2Status,
      live.leg2Delay,
      live.leg2Missing ? 'NO RESULT' : 'UNKNOWN'
    );

    let cardClass = 'feasible';
    let verdict = '<span class="verdict go">OK</span>';
    const layoverMinutes =
      layover.actual !== null && layover.actual !== undefined ? layover.actual : layover.scheduled;

    if (live.leg1Status === 'cancelled' || live.leg2Status === 'cancelled') {
      cardClass = 'not-feasible';
      verdict = '<span class="verdict no">CANCELLED</span>';
      blocked++;
    } else if (live.connectionPossible === false) {
      cardClass = 'not-feasible';
      verdict = '<span class="verdict no">NO CONNECTION</span>';
      blocked++;
    } else if (layoverMinutes !== null && layoverMinutes < NO_CHANCE_LAYOVER_MINUTES) {
      cardClass = 'not-feasible';
      verdict = '<span class="verdict no">NO CHANCE</span>';
      blocked++;
    } else if (layoverMinutes !== null && layoverMinutes <= RISKY_LAYOVER_MINUTES) {
      cardClass = 'risky';
      verdict = '<span class="verdict caution">RISKY</span>';
      risky++;
    } else {
      feasible++;
    }

    const layoverClass = layoverMinutes !== null && layoverMinutes > RISKY_LAYOVER_MINUTES
      ? 'enough'
      : layoverMinutes !== null && layoverMinutes >= NO_CHANCE_LAYOVER_MINUTES
        ? 'tight'
        : 'miss';
    const layoverLabel = layoverClass === 'enough'
      ? 'Comfortable'
      : layoverClass === 'tight'
        ? 'Risky'
        : 'No chance';
    const layoverValue = live.leg2Missing || layover.actual === null ? '--' : `${layover.actual}m`;
    const layoverDetail = live.connectionPossible === false && live.connectionReason
      ? live.connectionReason
      : `layover at ${route.hub} · <60m: No chance · 60-120m: Risky · ${layoverLabel}`;

    html += `
      <div class="journey-card ${cardClass} staged-card" data-airline="${code}">
        <div class="journey-top">
          <div style="display:flex;align-items:center;gap:10px;width:100%;">
            <div style="width:36px;height:36px;border-radius:9px;background:${route.color}22;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:${route.color};font-family:'Space Mono',monospace;flex-shrink:0;">${code}</div>
            <div>
              <div style="font-weight:800;font-size:15px;">${route.name}</div>
              <div style="font-size:11px;color:var(--muted);font-family:'Space Mono',monospace;">via ${route.hub} · ${route.hubCity}</div>
            </div>
            <div style="margin-left:auto;">${verdict}</div>
          </div>
        </div>

        ${route.warning ? `<div style="margin:0 16px 12px;padding:10px 14px;background:rgba(255,68,68,0.12);border:1px solid rgba(255,68,68,0.4);border-radius:10px;font-size:12px;color:#ff8888;line-height:1.6;">${route.warning}</div>` : ''}

        <div style="padding:0 24px 12px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <div class="flight-seg">
            <div class="iata">${route.legs[0].from}</div>
            <div class="time">${leg1.depTime}</div>
            <div class="date-small">${leg1.depLabel}</div>
          </div>
          <div class="arrow-zone">
            <div class="flight-number">${leg1.flightNumber}</div>
            <div class="arrow-line"><hr><span class="plane-icon">✈</span><hr></div>
            <div class="duration">${leg1.duration}</div>
          </div>
          <div class="flight-seg" style="text-align:right;">
            <div class="iata">${route.legs[0].to}</div>
            <div class="time">${leg1.arrTime}</div>
            <div class="date-small">${leg1.arrLabel}</div>
          </div>
          <div style="margin-left:auto;">
            <span class="status-badge ${leg1Badge.className}">${leg1Badge.label}</span>
          </div>
        </div>

        <div style="padding:0 24px 12px; display:flex; align-items:center; gap:8px; border-top:1px dashed var(--border); padding-top:12px; flex-wrap:wrap;">
          <div class="flight-seg">
            <div class="iata">${route.legs[1].from}</div>
            <div class="time">${leg2.depTime}</div>
            <div class="date-small">${leg2.depLabel}</div>
          </div>
          <div class="arrow-zone">
            <div class="flight-number">${leg2.flightNumber}</div>
            <div class="arrow-line"><hr><span class="plane-icon">✈</span><hr></div>
            <div class="duration">${leg2.duration}</div>
          </div>
          <div class="flight-seg" style="text-align:right;">
            <div class="iata">${route.legs[1].to}</div>
            <div class="time">${leg2.arrTime}</div>
            <div class="date-small">${leg2.arrLabel}</div>
          </div>
          <div style="margin-left:auto;">
            <span class="status-badge ${leg2Badge.className}">${leg2Badge.label}</span>
          </div>
        </div>

        <div class="journey-bottom">
          <div class="layover-info">
            <span class="layover-icon">↻</span>
            <span class="layover-time ${layoverClass}">${layoverValue}</span>
            <span class="layover-label">${layoverDetail}</span>
          </div>
          <div class="delay-info">${live.notes?.join(' · ') || 'Official source data'}</div>
        </div>
      </div>
    `;
  });

  const manualCodes = visibleCodes.filter(code => !data[code]?.isLive);
  if (manualCodes.length) {
    html += `
      <div class="strategy-overview">
        ${getMissingAutomationSummary(manualCodes, data)}
      </div>
      <div class="strategy-grid">${buildStrategyCards(manualCodes)}</div>
    `;
  }

  results.innerHTML = html;

  document.getElementById('summaryBar').innerHTML = `
    <div class="summary-chip staged-metric"><div><div class="val" data-target="${feasible}" style="color:var(--green)">0</div><div class="lbl">Feasible</div></div></div>
    <div class="summary-chip staged-metric"><div><div class="val" data-target="${risky}" style="color:var(--yellow)">0</div><div class="lbl">Risky</div></div></div>
    <div class="summary-chip staged-metric"><div><div class="val" data-target="${blocked}" style="color:var(--red)">0</div><div class="lbl">Cancelled/Miss</div></div></div>
    <div class="summary-chip staged-metric"><div><div class="val" data-target="${liveCodes.length}" style="color:var(--accent)">0</div><div class="lbl">Routes checked</div></div></div>
  `;

  animateStagedElements();
  scrollToPendingAirline();
  syncInteractiveExperience();
}

function getRouteOutcome(code, liveRecord) {
  const layover = calcLayover(code, liveRecord || {});
  const layoverMinutes =
    layover.actual !== null && layover.actual !== undefined ? layover.actual : layover.scheduled;

  if (!liveRecord?.isLive) {
    return {
      tone: isLocallyAutomated(code) ? 'pending' : 'manual',
      label: isLocallyAutomated(code) ? 'Awaiting result' : 'Manual check',
      layoverMinutes
    };
  }

  if (liveRecord.leg1Status === 'cancelled' || liveRecord.leg2Status === 'cancelled') {
    return { tone: 'blocked', label: 'Cancelled', layoverMinutes };
  }

  if (liveRecord.connectionPossible === false) {
    return { tone: 'blocked', label: 'No connection', layoverMinutes };
  }

  if (layoverMinutes !== null && layoverMinutes < NO_CHANCE_LAYOVER_MINUTES) {
    return { tone: 'blocked', label: 'No chance', layoverMinutes };
  }

  if (layoverMinutes !== null && layoverMinutes <= RISKY_LAYOVER_MINUTES) {
    return { tone: 'risky', label: 'Risky', layoverMinutes };
  }

  return { tone: 'healthy', label: 'Feasible', layoverMinutes };
}

function getOutcomeToneColor(tone, fallbackColor = EXPERIENCE_TONE_COLORS.pending) {
  return EXPERIENCE_TONE_COLORS[tone] || fallbackColor;
}

function getStageActiveCode() {
  return experienceState.hoverCode || (selectedAirline !== 'all' ? selectedAirline : null);
}

function getBarLayoverValue(record) {
  const value = record.outcome?.layoverMinutes;
  if (value !== null && value !== undefined) {
    return Math.max(0, value);
  }

  return MIN_LAYOVER[record.code] || 90;
}

function buildExperienceRecords() {
  const selectedDateLabel = formatDisplayDate(getSelectedDateObject());

  return Object.keys(ROUTES).map((code, index) => {
    const route = ROUTES[code];
    const live = currentData?.[code] || null;
    const outcome = getRouteOutcome(code, live);
    const coverage = live?.isLive
      ? 'Live official feed'
      : isLocallyAutomated(code)
        ? isStaticPagesMode()
          ? 'Snapshot or public result missing'
          : 'Waiting for a public result'
        : 'Manual official-source links';
    const delayPeak = Math.max(live?.leg1Delay || 0, live?.leg2Delay || 0);

    return {
      code,
      index,
      route,
      live,
      outcome,
      selectedDateLabel,
      coverage,
      visible: selectedAirline === 'all' || selectedAirline === code,
      delayPeak,
      note:
        live?.notes?.join(' / ') ||
        route.official?.strategyHint ||
        route.official?.statusHint ||
        'Open the official airline page for the full source view.'
    };
  });
}

function getDefaultAirportPositions(width, height) {
  if (width < 560) {
    return {
      BLR: { x: width * 0.16, y: height * 0.55 },
      DXB: { x: width * 0.42, y: height * 0.18 },
      DOH: { x: width * 0.58, y: height * 0.36 },
      BAH: { x: width * 0.42, y: height * 0.66 },
      DEL: { x: width * 0.58, y: height * 0.84 },
      FRA: { x: width * 0.84, y: height * 0.55 }
    };
  }

  return {
    BLR: { x: width * 0.11, y: height * 0.54 },
    DXB: { x: width * 0.44, y: height * 0.18 },
    DOH: { x: width * 0.53, y: height * 0.34 },
    BAH: { x: width * 0.47, y: height * 0.67 },
    DEL: { x: width * 0.6, y: height * 0.82 },
    FRA: { x: width * 0.89, y: height * 0.54 }
  };
}

function clampExperienceNodePosition(code, defaults, width, height) {
  const base = defaults[code];
  const source = AIRPORT_META[code]?.fixed ? base : experienceState.nodePositions[code] || base;
  const padding = 26;

  return {
    x: Math.min(width - padding, Math.max(padding, source.x)),
    y: Math.min(height - padding, Math.max(padding, source.y))
  };
}

function initializeExperienceScene() {
  if (experienceState.initialized) return;

  experienceState.initialized = true;

  if (!experienceState.resizeBound) {
    window.addEventListener('resize', () => {
      if (routeResizeFrame) {
        window.cancelAnimationFrame(routeResizeFrame);
      }

      routeResizeFrame = window.requestAnimationFrame(() => {
        renderRouteExperience();
        renderLayoverPulse();
      });
    });
    experienceState.resizeBound = true;
  }
}

function resetExperienceLayout() {
  experienceState.nodePositions = {};
  hideRouteTooltip();
  renderRouteExperience();
  renderLayoverPulse();
  updateExperienceCopy();
  applyExperienceFocusState();
}

function updateDomRouteFocus(code) {
  document.querySelectorAll('.journey-card[data-airline], .strategy-card[data-airline], .tab[data-airline]')
    .forEach(element => {
      element.classList.toggle('route-focused', Boolean(code) && element.dataset.airline === code);
    });
}

function applyExperienceFocusState() {
  const activeCode = getStageActiveCode();

  document.querySelectorAll('.route-group, .chart-bar').forEach(element => {
    const code = element.getAttribute('data-airline');
    element.classList.toggle('is-active', Boolean(activeCode) && code === activeCode);
    element.classList.toggle('is-dimmed', Boolean(activeCode) && code !== activeCode);
  });

  updateDomRouteFocus(activeCode);
}

function updateExperienceCopy() {
  const records = buildExperienceRecords();
  const activeCode = getStageActiveCode();
  const focusRecord = records.find(record => record.code === activeCode) || null;
  const liveCount = records.filter(record => record.live?.isLive).length;
  const counts = records.reduce((acc, record) => {
    if (record.outcome.tone === 'healthy') acc.healthy += 1;
    if (record.outcome.tone === 'risky') acc.risky += 1;
    if (record.outcome.tone === 'blocked') acc.blocked += 1;
    return acc;
  }, { healthy: 0, risky: 0, blocked: 0 });
  const focusEl = document.getElementById('experienceFocus');
  const coverageEl = document.getElementById('experienceCoverage');
  const riskMixEl = document.getElementById('experienceRiskMix');
  const narrativeEl = document.getElementById('experienceNarrative');
  const statusEl = document.getElementById('stageStatus');
  const badgeEl = document.getElementById('stageBadge');
  const guideEl = document.getElementById('interactionGuide');
  const tagsEl = document.getElementById('interactionTags');

  if (!focusEl || !coverageEl || !riskMixEl || !narrativeEl || !statusEl || !badgeEl || !guideEl || !tagsEl) {
    return;
  }

  if (focusRecord) {
    const layoverLabel = focusRecord.outcome.layoverMinutes !== null && focusRecord.outcome.layoverMinutes !== undefined
      ? `${focusRecord.outcome.layoverMinutes}m layover`
      : 'layover pending';
    const delayLabel = focusRecord.live?.isLive
      ? focusRecord.delayPeak > 0
        ? `${focusRecord.delayPeak}m peak delay`
        : 'No major delays'
      : focusRecord.coverage;

    focusEl.textContent = `${focusRecord.route.name} (${focusRecord.code})`;
    narrativeEl.textContent =
      `${focusRecord.route.name} via ${focusRecord.route.hub} on ${focusRecord.selectedDateLabel}: ` +
      `${focusRecord.outcome.label.toLowerCase()} with ${layoverLabel}. ${focusRecord.note}`;
    statusEl.textContent = `${focusRecord.route.name}: ${focusRecord.outcome.label} and ${layoverLabel}.`;
    badgeEl.textContent = `${focusRecord.route.legs[0].flightNum} / ${focusRecord.route.legs[1].flightNum} | ${delayLabel}`;
    guideEl.textContent = focusRecord.live?.isLive
      ? `Click this corridor to filter the cards below, or drag ${focusRecord.route.hub} to reshape the scene while keeping the same live data.`
      : `No live result is published for this route right now. Click to focus the airline and use the official links in the cards below.`;
    tagsEl.innerHTML = `
      <span>${focusRecord.outcome.label}</span>
      <span>${layoverLabel}</span>
      <span>${focusRecord.coverage}</span>
    `;
  } else {
    focusEl.textContent = selectedAirline === 'all' ? 'All airlines' : ROUTES[selectedAirline].name;
    narrativeEl.textContent =
      `Tracking ${records.length} corridors for ${formatDisplayDate(getSelectedDateObject())}. ` +
      `${liveCount} route${liveCount === 1 ? '' : 's'} currently has live official data; hover any path for status and connection pressure.`;
    statusEl.textContent = liveCount
      ? 'Live view ready: hover any corridor or click to focus an airline.'
      : 'Hover a path to inspect timing pressure.';
    badgeEl.textContent = `Visible routes: ${getVisibleAirlineCodes().length} | Live feeds: ${liveCount}`;
    guideEl.textContent =
      'The map and chart stay linked to the airline tabs below. Hover for detail, drag hubs to reshape the lanes, and click a corridor to filter the dashboard.';
    tagsEl.innerHTML = `
      <span>${liveCount} live</span>
      <span>${counts.healthy} feasible</span>
      <span>${counts.risky} tight</span>
      <span>${counts.blocked} blocked</span>
    `;
  }

  coverageEl.textContent = `${liveCount}/${records.length} live official feeds`;
  riskMixEl.textContent = `${counts.healthy} feasible, ${counts.risky} tight, ${counts.blocked} blocked`;
}

function buildRouteTooltipMarkup(record) {
  const layoverLabel = record.outcome.layoverMinutes !== null && record.outcome.layoverMinutes !== undefined
    ? `${record.outcome.layoverMinutes}m`
    : 'Pending';
  const statusToneColor = getOutcomeToneColor(record.outcome.tone, record.route.color);

  return `
    <span class="eyebrow" style="color:${statusToneColor}">${record.route.name}</span>
    <strong>${record.code} via ${record.route.hub}</strong>
    <p>${record.outcome.label} on ${record.selectedDateLabel}. ${record.coverage}.</p>
    <div class="meta">${record.route.legs[0].flightNum} / ${record.route.legs[1].flightNum} | ${layoverLabel} layover</div>
  `;
}

function showRouteTooltip(event, record) {
  const tooltip = document.getElementById('routeTooltip');
  const stage = document.getElementById('routeStageSurface');

  if (!tooltip || !stage || !window.d3) return;

  tooltip.innerHTML = buildRouteTooltipMarkup(record);
  tooltip.hidden = false;

  const [pointerX, pointerY] = window.d3.pointer(event, stage);
  const maxLeft = stage.clientWidth - tooltip.offsetWidth - 12;
  const maxTop = stage.clientHeight - tooltip.offsetHeight - 12;

  tooltip.style.left = `${Math.max(12, Math.min(maxLeft, pointerX + 16))}px`;
  tooltip.style.top = `${Math.max(12, Math.min(maxTop, pointerY + 16))}px`;
}

function hideRouteTooltip() {
  const tooltip = document.getElementById('routeTooltip');
  if (!tooltip) return;
  tooltip.hidden = true;
}

function handleExperienceRouteClick(code) {
  if (selectedAirline === code) {
    pendingAirlineScroll = null;
    setAirline('all');
    return;
  }

  pendingAirlineScroll = code;
  setAirline(code);
}

function updateRouteExperienceGeometry(restartTokens = false) {
  if (!window.d3 || !experienceState.svg) return;

  const d3 = window.d3;
  const routeLine = d3.line()
    .x(point => point.x)
    .y(point => point.y)
    .curve(d3.curveCatmullRom.alpha(0.72));
  const airportLookup = Object.fromEntries(
    experienceState.airportData.map(airport => [airport.code, airport])
  );

  experienceState.routeRecords.forEach(record => {
    const laneOffset = (record.index - ((experienceState.routeRecords.length - 1) / 2)) * 24;
    const start = {
      x: airportLookup.BLR.x,
      y: airportLookup.BLR.y + laneOffset * 0.32
    };
    const hub = airportLookup[record.route.hub];
    const end = {
      x: airportLookup.FRA.x,
      y: airportLookup.FRA.y + laneOffset * 0.32
    };

    record.pathPoints = [
      start,
      { x: start.x + (hub.x - start.x) * 0.42, y: start.y + laneOffset * 1.15 },
      { x: hub.x - 12, y: hub.y - laneOffset * 0.12 },
      { x: hub.x + 12, y: hub.y + laneOffset * 0.12 },
      { x: end.x - (end.x - hub.x) * 0.42, y: end.y + laneOffset * 1.15 },
      end
    ];
    record.labelPoint = { x: hub.x, y: hub.y - 52 };
  });

  experienceState.svg.selectAll('g.route-group').each(function(record) {
    const group = d3.select(this);
    const toneColor = getOutcomeToneColor(record.outcome.tone, record.route.color);
    const pathValue = routeLine(record.pathPoints);

    group.select('path.route-glow')
      .attr('d', pathValue)
      .attr('stroke', toneColor);
    group.select('path.route-track')
      .attr('d', pathValue)
      .attr('stroke', record.route.color);
    group.select('path.route-dash').attr('d', pathValue);
    group.select('path.route-hitbox').attr('d', pathValue);
    group.select('circle.route-token')
      .attr('fill', toneColor)
      .attr('stroke', 'rgba(255,255,255,0.65)')
      .attr('stroke-width', 1.2);
    group.select('g.route-label')
      .attr('transform', `translate(${record.labelPoint.x},${record.labelPoint.y})`);
    group.select('text.route-label-text').text(`${record.code} | ${record.route.hub}`);
    group.select('text.route-label-sub').text(record.outcome.label);
  });

  experienceState.svg.selectAll('g.airport-node')
    .attr('transform', airport => `translate(${airport.x},${airport.y})`)
    .each(function(airport) {
      const group = d3.select(this);
      group.select('circle.airport-ring').attr('r', airport.fixed ? 26 : 22);
      group.select('circle.airport-pulse')
        .attr('r', airport.fixed ? 16 : 14)
        .attr('stroke', airport.fixed ? 'rgba(0,212,255,0.18)' : 'rgba(255,255,255,0.16)');
      group.select('circle.airport-core')
        .attr('r', airport.fixed ? 11 : 9)
        .attr('fill', airport.fixed ? '#00d4ff' : '#131c2e');
    });

  if (restartTokens) {
    restartRouteTokenAnimations();
  }
}

function restartRouteTokenAnimations() {
  if (!window.d3 || !experienceState.svg) return;

  const d3 = window.d3;

  experienceState.svg.selectAll('g.route-group').each(function(record, index) {
    const group = d3.select(this);
    const path = group.select('path.route-track').node();
    const token = group.select('circle.route-token');

    if (!path || !token.node()) return;

    const totalLength = path.getTotalLength();
    const startPoint = path.getPointAtLength(0);
    const duration = 5200 + index * 850;

    token.interrupt();
    token.attr('transform', `translate(${startPoint.x},${startPoint.y})`);

    const repeat = () => {
      token.transition()
        .duration(duration)
        .ease(d3.easeLinear)
        .attrTween('transform', () => t => {
          const point = path.getPointAtLength(totalLength * t);
          return `translate(${point.x},${point.y})`;
        })
        .on('end', repeat);
    };

    repeat();
  });
}

function renderRouteExperience() {
  if (!window.d3) return;

  const stage = document.getElementById('routeStageSurface');
  const svgElement = document.getElementById('routeExperience');

  if (!stage || !svgElement) return;

  initializeExperienceScene();

  const d3 = window.d3;
  const width = Math.max(stage.clientWidth, 320);
  const height = Math.max(stage.clientHeight, 280);
  const defaults = getDefaultAirportPositions(width, height);
  const airportCodes = ['BLR', ...Object.values(ROUTES).map(route => route.hub), 'FRA']
    .filter((code, index, array) => array.indexOf(code) === index);

  experienceState.width = width;
  experienceState.height = height;
  experienceState.routeRecords = buildExperienceRecords();
  experienceState.airportData = airportCodes.map(code => {
    const position = clampExperienceNodePosition(code, defaults, width, height);
    experienceState.nodePositions[code] = position;

    return {
      code,
      city: AIRPORT_META[code]?.city || code,
      fixed: AIRPORT_META[code]?.fixed || false,
      x: position.x,
      y: position.y
    };
  });

  experienceState.svg = d3.select(svgElement)
    .attr('viewBox', `0 0 ${width} ${height}`);
  experienceState.svg.selectAll('*').remove();

  experienceState.svg.append('g')
    .attr('class', 'ambient-layer')
    .selectAll('path.route-grid-line')
    .data([height * 0.24, height * 0.5, height * 0.76])
    .join('path')
    .attr('class', 'route-grid-line')
    .attr('d', y => `M 24 ${y} Q ${width / 2} ${y - 18} ${width - 24} ${y}`);

  experienceState.svg.append('g')
    .attr('class', 'orbit-layer')
    .selectAll('circle.route-orbit')
    .data([
      { x: defaults.BLR.x, y: defaults.BLR.y, r: 52 },
      { x: defaults.FRA.x, y: defaults.FRA.y, r: 56 }
    ])
    .join('circle')
    .attr('class', 'route-orbit')
    .attr('cx', orbit => orbit.x)
    .attr('cy', orbit => orbit.y)
    .attr('r', orbit => orbit.r);

  const routeGroups = experienceState.svg.append('g')
    .attr('class', 'route-layer')
    .selectAll('g.route-group')
    .data(experienceState.routeRecords, record => record.code)
    .join('g')
    .attr('class', 'route-group')
    .attr('data-airline', record => record.code)
    .on('mouseenter', (event, record) => {
      experienceState.hoverCode = record.code;
      showRouteTooltip(event, record);
      updateExperienceCopy();
      applyExperienceFocusState();
    })
    .on('mousemove', (event, record) => {
      showRouteTooltip(event, record);
    })
    .on('mouseleave', () => {
      experienceState.hoverCode = null;
      hideRouteTooltip();
      updateExperienceCopy();
      applyExperienceFocusState();
    })
    .on('click', (event, record) => {
      event.preventDefault();
      handleExperienceRouteClick(record.code);
    });

  routeGroups.append('path').attr('class', 'route-glow');
  routeGroups.append('path').attr('class', 'route-track');
  routeGroups.append('path').attr('class', 'route-dash');
  routeGroups.append('path').attr('class', 'route-hitbox');
  routeGroups.append('circle').attr('class', 'route-token').attr('r', 5);

  const routeLabels = routeGroups.append('g').attr('class', 'route-label');
  routeLabels.append('rect')
    .attr('class', 'route-label-badge')
    .attr('x', -50)
    .attr('y', -22)
    .attr('width', 100)
    .attr('height', 44)
    .attr('rx', 16)
    .attr('ry', 16);
  routeLabels.append('text')
    .attr('class', 'route-label-text')
    .attr('x', 0)
    .attr('y', -4);
  routeLabels.append('text')
    .attr('class', 'route-label-sub')
    .attr('x', 0)
    .attr('y', 12);

  const nodeGroups = experienceState.svg.append('g')
    .attr('class', 'airport-layer')
    .selectAll('g.airport-node')
    .data(experienceState.airportData, airport => airport.code)
    .join('g')
    .attr('class', airport => `airport-node${airport.fixed ? ' fixed' : ''}`);

  nodeGroups.append('circle').attr('class', 'airport-ring');
  nodeGroups.append('circle').attr('class', 'airport-pulse');
  nodeGroups.append('circle').attr('class', 'airport-core');
  nodeGroups.append('text')
    .attr('class', 'airport-code')
    .attr('y', 4)
    .text(airport => airport.code);
  nodeGroups.append('text')
    .attr('class', 'airport-city')
    .attr('y', 26)
    .text(airport => airport.city);

  nodeGroups.call(
    d3.drag()
      .on('start', function(event, airport) {
        if (airport.fixed) return;
        d3.select(this).raise();
      })
      .on('drag', (event, airport) => {
        if (airport.fixed) return;

        airport.x = Math.min(width - 26, Math.max(26, event.x));
        airport.y = Math.min(height - 26, Math.max(26, event.y));
        experienceState.nodePositions[airport.code] = { x: airport.x, y: airport.y };
        updateRouteExperienceGeometry();
      })
      .on('end', () => {
        updateExperienceCopy();
        applyExperienceFocusState();
      })
  );

  updateRouteExperienceGeometry(true);
  applyExperienceFocusState();
}

function renderLayoverPulse() {
  if (!window.d3) return;

  const svgElement = document.getElementById('layoverPulse');
  if (!svgElement) return;

  const d3 = window.d3;
  const width = Math.max(svgElement.parentElement.clientWidth - 32, 240);
  const height = Math.max(svgElement.clientHeight || 150, 150);
  const records = buildExperienceRecords();
  const margin = { top: 14, right: 10, bottom: 26, left: 28 };
  const x = d3.scaleBand()
    .domain(records.map(record => record.code))
    .range([margin.left, width - margin.right])
    .padding(0.34);
  const y = d3.scaleLinear()
    .domain([0, Math.max(d3.max(records, record => getBarLayoverValue(record)) || 0, 220)])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const thresholds = [60, 120, 180].filter(value => value <= y.domain()[1]);

  const svg = d3.select(svgElement)
    .attr('viewBox', `0 0 ${width} ${height}`);
  svg.selectAll('*').remove();

  svg.append('g')
    .attr('class', 'chart-grid')
    .selectAll('line')
    .data(thresholds)
    .join('line')
    .attr('x1', margin.left)
    .attr('x2', width - margin.right)
    .attr('y1', value => y(value))
    .attr('y2', value => y(value));

  svg.append('g')
    .attr('class', 'chart-axis')
    .selectAll('text')
    .data(thresholds)
    .join('text')
    .attr('x', 6)
    .attr('y', value => y(value) + 4)
    .text(value => `${value}m`);

  const bars = svg.append('g')
    .selectAll('g.chart-bar')
    .data(records, record => record.code)
    .join('g')
    .attr('class', 'chart-bar')
    .attr('data-airline', record => record.code)
    .on('mouseenter', (event, record) => {
      experienceState.hoverCode = record.code;
      updateExperienceCopy();
      applyExperienceFocusState();
    })
    .on('mouseleave', () => {
      experienceState.hoverCode = null;
      updateExperienceCopy();
      applyExperienceFocusState();
    })
    .on('click', (event, record) => {
      event.preventDefault();
      handleExperienceRouteClick(record.code);
    });

  bars.append('rect').attr('class', 'chart-bar-fill');
  bars.append('text').attr('class', 'chart-bar-value');
  bars.append('text').attr('class', 'chart-bar-state');

  bars.select('rect.chart-bar-fill')
    .attr('x', record => x(record.code))
    .attr('width', x.bandwidth())
    .attr('rx', 14)
    .attr('ry', 14)
    .attr('fill', record => getOutcomeToneColor(record.outcome.tone, record.route.color))
    .attr('opacity', record => record.live?.isLive ? 0.86 : 0.58)
    .attr('y', y(0))
    .attr('height', 0)
    .transition()
    .duration(700)
    .delay((record, index) => index * 80)
    .ease(d3.easeCubicOut)
    .attr('y', record => y(getBarLayoverValue(record)))
    .attr('height', record => y(0) - y(getBarLayoverValue(record)));

  bars.select('text.chart-bar-value')
    .attr('x', record => x(record.code) + (x.bandwidth() / 2))
    .attr('y', record => y(getBarLayoverValue(record)) - 8)
    .text(record => {
      if (record.live?.isLive) return `${getBarLayoverValue(record)}m`;
      return record.outcome.tone === 'manual' ? 'manual' : 'pending';
    });

  bars.select('text.chart-bar-state')
    .attr('x', record => x(record.code) + (x.bandwidth() / 2))
    .attr('y', height - 8)
    .text(record => record.code);

  applyExperienceFocusState();
}

function animateSummaryCounters() {
  const valueNodes = document.querySelectorAll('.summary-chip .val[data-target]');

  if (!valueNodes.length) return;

  if (!window.d3) {
    valueNodes.forEach(node => {
      node.textContent = node.dataset.target || '0';
    });
    return;
  }

  const d3 = window.d3;

  valueNodes.forEach(node => {
    const target = Number(node.dataset.target || 0);
    const current = Number(node.textContent || 0);

    d3.select(node)
      .interrupt()
      .transition()
      .duration(850)
      .ease(d3.easeCubicOut)
      .tween('text', () => {
        const interpolate = d3.interpolateNumber(current, target);
        return progress => {
          node.textContent = String(Math.round(interpolate(progress)));
        };
      });
  });
}

function animateStagedElements() {
  const stagedElements = document.querySelectorAll('.staged-card, .staged-metric');

  stagedElements.forEach((element, index) => {
    element.classList.remove('is-visible');
    element.style.setProperty('--stagger-delay', `${index * 55}ms`);
  });

  window.requestAnimationFrame(() => {
    stagedElements.forEach(element => {
      element.classList.add('is-visible');
    });
    animateSummaryCounters();
  });
}

function scrollToPendingAirline() {
  if (!pendingAirlineScroll) return;

  const target = document.querySelector(
    `.journey-card[data-airline="${pendingAirlineScroll}"], .strategy-card[data-airline="${pendingAirlineScroll}"]`
  );

  if (!target) return;

  pendingAirlineScroll = null;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function syncInteractiveExperience() {
  if (window.d3) {
    renderRouteExperience();
    renderLayoverPulse();
  }

  updateExperienceCopy();
  applyExperienceFocusState();
}

async function fetchLocalTrackerPayload(date, airline) {
  const url = new URL(`${LOCAL_TRACKER_BASE_URL}/api/tracker`);
  url.searchParams.set('date', formatApiDate(date));
  if (airline && airline !== 'all') {
    url.searchParams.set('airline', airline);
  }

  let response;
  try {
    response = await fetch(url.toString());
  } catch (error) {
    throw new Error(`Could not reach ${LOCAL_TRACKER_BASE_URL}. Run <code>npm start</code> in this folder and reload.`);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error('The local helper returned a non-JSON response.');
  }

  if (!response.ok) {
    throw new Error(payload?.message || `Local helper failed with status ${response.status}.`);
  }

  return payload;
}

async function fetchStaticTrackerPayload(date) {
  const url = new URL(`${STATIC_DATA_BASE}/${formatApiDate(date)}.json`, window.location.href);

  let response;
  try {
    response = await fetch(url.toString(), { cache: 'no-store' });
  } catch (error) {
    throw new Error(`Could not load the published snapshot from ${url.toString()}.`);
  }

  if (!response.ok) {
    throw new Error(`No published snapshot is available for ${formatDisplayDate(date)} yet.`);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error('The published snapshot returned invalid JSON.');
  }

  return payload;
}

async function fetchData() {
  const fetchToken = ++activeFetchToken;
  const button = document.getElementById('refreshBtn');
  button.classList.add('loading');
  clearApiErrors();

  const selectedDateObj = getSelectedDateObject();

  try {
    document.getElementById('results').innerHTML = `
      <div class="state-box">
        <div class="spinner"></div>
        <h3>Fetching official flight data...</h3>
        <p>${getLoadingMessage()}</p>
      </div>
    `;

    const payload = isStaticPagesMode()
      ? await fetchStaticTrackerPayload(selectedDateObj)
      : await fetchLocalTrackerPayload(selectedDateObj, selectedAirline);
    if (fetchToken !== activeFetchToken) return;

    helperAutomatedCodes = Array.isArray(payload.automatedAirlines) && payload.automatedAirlines.length
      ? payload.automatedAirlines
      : helperAutomatedCodes;
    helperManualCodes = Array.isArray(payload.manualAirlines)
      ? payload.manualAirlines
      : helperManualCodes;

    const data = payload.airlines || {};
    const manualCodes = getVisibleAirlineCodes().filter(code => !data[code]?.isLive);
    const automatedUnavailable = getVisibleAirlineCodes().filter(
      code => isLocallyAutomated(code) && !data[code]?.isLive
    );

    if (selectedAirline === 'all' && (manualCodes.length || automatedUnavailable.length)) {
      showApiBanner(
        'Automation Coverage',
        `${getStrategyOverviewText()}${automatedUnavailable.length ? ` ${formatAirlineList(automatedUnavailable)} did not publish a usable public result for the selected date.` : ''}`,
        'info'
      );
    } else if (selectedAirline !== 'all' && automatedUnavailable.includes(selectedAirline)) {
      showApiBanner(
        'Public Result Missing',
        getUnavailableMessage(selectedAirline, data[selectedAirline]),
        'warning'
      );
    }

    renderResults(data);
    updateLastUpdated(
      getResultLabel(payload, selectedDateObj),
      payload.snapshotGeneratedAt || payload.generatedAt || null
    );
  } catch (error) {
    if (fetchToken !== activeFetchToken) return;
    if (isStaticPagesMode()) {
      renderStaticSnapshotState(true, error?.message || 'Unexpected published snapshot error.');
    } else {
      renderLocalHelperState(true, error?.message || 'Unexpected local helper error.');
    }
  } finally {
    button.classList.remove('loading');
  }
}

window.onload = () => {
  dates = generateDates();
  selectedDate = getSelectedDateIndex();
  renderDateStrip();
  syncInteractiveExperience();
  fetchData();
};
