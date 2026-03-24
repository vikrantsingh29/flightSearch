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
let helperAutomatedCodes = ['EK', 'QR'];
let helperManualCodes = ['GF', 'AI'];

let selectedAirline = 'all';
let selectedDate = null;
let dates = [];
let currentData = null;
let activeFetchToken = 0;

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
      <div class="strategy-card">
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
  fetchData();
}

function setAirline(code) {
  selectedAirline = code;
  document.querySelectorAll('.tab').forEach((tab, index) => {
    tab.classList.remove('active');
    if ((['all', 'EK', 'QR', 'GF', 'AI'][index]) === code) {
      tab.classList.add('active');
    }
  });
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
    } else if (
      (layoverMinutes !== null && layoverMinutes <= RISKY_LAYOVER_MINUTES) ||
      (live.leg1Status === 'delayed' && live.leg1Delay > 60)
    ) {
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
      <div class="journey-card ${cardClass}">
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
    <div class="summary-chip"><div><div class="val" style="color:var(--green)">${feasible}</div><div class="lbl">Feasible</div></div></div>
    <div class="summary-chip"><div><div class="val" style="color:var(--yellow)">${risky}</div><div class="lbl">Risky</div></div></div>
    <div class="summary-chip"><div><div class="val" style="color:var(--red)">${blocked}</div><div class="lbl">Cancelled/Miss</div></div></div>
    <div class="summary-chip"><div><div class="val" style="color:var(--accent)">${liveCodes.length}</div><div class="lbl">Routes checked</div></div></div>
  `;
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
  fetchData();
};
