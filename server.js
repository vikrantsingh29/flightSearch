const fs = require('fs');
const http = require('http');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const HTML_FILE = path.join(__dirname, 'flight-tracker-fixed.html');
const APP_JS_FILE = path.join(__dirname, 'tracker-app.js');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/146.0.0.0 Safari/537.36';

const EMIRATES_SERVICE_URL = 'https://www.emirates.com/service/flight-status';
const EMIRATES_REFERER_BASE =
  'https://www.emirates.com/us/english/manage-booking/flight-status/results/';

const QATAR_SEARCH_URL = 'https://fs.qatarairways.com/flightstatus/search';
const QATAR_STATUS_URL =
  'https://qoreservices.qatarairways.com/fltstatus-services/flight/getStatus';

const TRACKED_ROUTES = {
  EK: {
    name: 'Emirates',
    source: 'Emirates official flight status',
    minLayover: 120,
    legs: [
      { origin: 'BLR', destination: 'DXB', flightNumber: 'EK565' },
      { origin: 'DXB', destination: 'FRA', flightNumber: 'EK047' }
    ]
  },
  QR: {
    name: 'Qatar Airways',
    source: 'Qatar Airways official flight status',
    minLayover: 90,
    legs: [
      { origin: 'BLR', destination: 'DOH', preferredFlightNumbers: ['573'] },
      { origin: 'DOH', destination: 'FRA', preferredFlightNumbers: ['071', '067', '069'] }
    ]
  }
};

const MANUAL_AIRLINES = ['GF', 'AI'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let qatarCookieCache = {
  value: null,
  expiresAt: 0
};

function getAutomatedAirlines() {
  return Object.keys(TRACKED_ROUTES);
}

function createError(statusCode, code, message, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.extra = extra;
  return error;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendJs(res, statusCode, source) {
  res.writeHead(statusCode, { 'Content-Type': 'application/javascript; charset=utf-8' });
  res.end(source);
}

function parseDateParts(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!match) {
    throw createError(400, 'invalid_date', 'Expected date in YYYY-MM-DD format.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw createError(400, 'invalid_date', 'The provided date is not valid.');
  }

  return { year, month, day, date };
}

function formatEmiratesLongDate(dateStr) {
  const { date } = parseDateParts(dateStr);
  return `${LONG_DAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
}

function formatEmiratesUrl(route, dateStr) {
  const params = new URLSearchParams({
    origin: route.origin,
    destination: route.destination,
    date: dateStr,
    'date-input0': formatEmiratesLongDate(dateStr)
  });
  return `${EMIRATES_REFERER_BASE}?${params.toString()}`;
}

function normalizeFlightNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || '0';
}

function extractClockFromIso(value) {
  const match = /T(\d{2}:\d{2})/.exec(value || '');
  return match ? match[1] : null;
}

function extractTrailingClock(value) {
  const match = /(\d{2}:\d{2})$/.exec(value || '');
  return match ? match[1] : null;
}

function parseIsoMs(value) {
  const ms = Date.parse(value || '');
  return Number.isNaN(ms) ? null : ms;
}

function parseQatarUtcMs(value) {
  const ms = Date.parse(value ? `${value} UTC` : '');
  return Number.isNaN(ms) ? null : ms;
}

function diffPositiveMinutesMs(scheduledMs, actualOrEstimatedMs) {
  if (scheduledMs === null || actualOrEstimatedMs === null) {
    return 0;
  }
  return Math.max(0, Math.round((actualOrEstimatedMs - scheduledMs) / 60000));
}

function signedMinutesBetweenMs(startMs, endMs) {
  if (startMs === null || endMs === null) {
    return null;
  }
  return Math.round((endMs - startMs) / 60000);
}

function selectTimestamp(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

function formatDuration(durationMinutes) {
  if (durationMinutes === null || durationMinutes === undefined) {
    return null;
  }
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}m`;
}

function buildDisplayTime(actual, estimated, scheduled, noun) {
  if (actual) {
    return { time: actual, label: `Actual ${noun}` };
  }
  if (estimated && estimated !== scheduled) {
    return { time: estimated, label: `Estimated ${noun}` };
  }
  if (scheduled) {
    return { time: scheduled, label: `Scheduled ${noun}` };
  }
  return { time: null, label: noun[0].toUpperCase() + noun.slice(1) };
}

function mapEmiratesStatusCodeToText(statusCode) {
  const code = String(statusCode || '').toUpperCase();
  const labels = {
    ARVD: 'Arrived',
    CNLD: 'Cancelled',
    DEPT: 'Departed',
    ENRT: 'In flight',
    PDEP: 'Scheduled'
  };
  return labels[code] || code || 'Unknown';
}

function mapEmiratesStatus(statusCode, delayMinutes) {
  const code = String(statusCode || '').toUpperCase();

  if (code === 'CNLD') return 'cancelled';
  if (['ARVD', 'ENRT', 'DEPT'].includes(code)) {
    return delayMinutes > 0 ? 'delayed' : 'on-time';
  }
  if (['PDEP', 'SCHD'].includes(code)) {
    return delayMinutes > 0 ? 'delayed' : 'scheduled';
  }
  return delayMinutes > 0 ? 'delayed' : 'unknown';
}

function mapQatarStatus(rawCode, rawStatus, delayMinutes) {
  const code = String(rawCode || '').toUpperCase();
  const status = String(rawStatus || '').toUpperCase();

  if (code.includes('CNLD') || status.includes('CANCEL')) return 'cancelled';
  if (code.includes('ARVD') || status.includes('ARRIVED')) {
    return delayMinutes > 0 ? 'delayed' : 'on-time';
  }
  if (code.includes('DEPT') || status.includes('DEPART')) {
    return delayMinutes > 0 ? 'delayed' : 'on-time';
  }
  if (code.includes('PDEP') || status.includes('SCHEDULED')) {
    return delayMinutes > 0 ? 'delayed' : 'scheduled';
  }
  return delayMinutes > 0 ? 'delayed' : 'unknown';
}

function normalizeEmiratesLeg(result, leg, route, requestedDate) {
  const scheduledDepartureMs = parseIsoMs(leg.departureTime?.schedule);
  const estimatedDepartureMs = parseIsoMs(leg.departureTime?.estimated);
  const actualDepartureMs = parseIsoMs(leg.departureTime?.actual);
  const scheduledArrivalMs = parseIsoMs(leg.arrivalTime?.schedule);
  const estimatedArrivalMs = parseIsoMs(leg.arrivalTime?.estimated);
  const actualArrivalMs = parseIsoMs(leg.arrivalTime?.actual);

  const scheduledDeparture = extractClockFromIso(leg.departureTime?.schedule);
  const estimatedDeparture = extractClockFromIso(leg.departureTime?.estimated);
  const actualDeparture = extractClockFromIso(leg.departureTime?.actual);
  const scheduledArrival = extractClockFromIso(leg.arrivalTime?.schedule);
  const estimatedArrival = extractClockFromIso(leg.arrivalTime?.estimated);
  const actualArrival = extractClockFromIso(leg.arrivalTime?.actual);

  const departureDisplay = buildDisplayTime(actualDeparture, estimatedDeparture, scheduledDeparture, 'departure');
  const arrivalDisplay = buildDisplayTime(actualArrival, estimatedArrival, scheduledArrival, 'arrival');

  const departureDelay = diffPositiveMinutesMs(
    scheduledDepartureMs,
    selectTimestamp(actualDepartureMs, estimatedDepartureMs)
  );
  const arrivalDelay = diffPositiveMinutesMs(
    scheduledArrivalMs,
    selectTimestamp(actualArrivalMs, estimatedArrivalMs)
  );
  const delayMinutes = Math.max(departureDelay, arrivalDelay);

  return {
    requestedDate,
    resolvedDate: result.flightDate,
    flightNumber: route.flightNumber,
    rawStatusCode: String(leg.statusCode || '').toUpperCase(),
    rawStatus: mapEmiratesStatusCodeToText(leg.statusCode),
    status: mapEmiratesStatus(leg.statusCode, delayMinutes),
    delayMinutes,
    departureDelay,
    arrivalDelay,
    scheduledDeparture,
    estimatedDeparture,
    actualDeparture,
    scheduledArrival,
    estimatedArrival,
    actualArrival,
    scheduledDepartureMs,
    estimatedDepartureMs,
    actualDepartureMs,
    scheduledArrivalMs,
    estimatedArrivalMs,
    actualArrivalMs,
    departureDisplay: departureDisplay.time,
    departureLabel: departureDisplay.label,
    arrivalDisplay: arrivalDisplay.time,
    arrivalLabel: arrivalDisplay.label,
    duration: leg.totalTravelDuration || null,
    timeLeft: leg.travelDurationLeft || null,
    origin: leg.originActualAirportCode || leg.originPlannedAirportCode || route.origin,
    destination:
      leg.destinationActualAirportCode || leg.destinationPlannedAirportCode || route.destination,
    sourceUrl: formatEmiratesUrl(route, requestedDate)
  };
}

function normalizeQatarFlight(flight) {
  const flightNumberDigits = String(
    flight?.carrier?.flightNumber || flight?.carrier?.mktFlightNumber || flight?.flightNumber || ''
  ).padStart(3, '0');

  const scheduledDepartureMs = parseQatarUtcMs(flight?.departureDateScheduledUTC);
  const estimatedDepartureMs = parseQatarUtcMs(flight?.departureDateEstimatedUTC);
  const actualDepartureMs = parseQatarUtcMs(flight?.departureDateActualUTC);
  const scheduledArrivalMs = parseQatarUtcMs(flight?.arrivalDateScheduledUTC);
  const estimatedArrivalMs = parseQatarUtcMs(flight?.arrivalDateEstimatedUTC);
  const actualArrivalMs = parseQatarUtcMs(flight?.arrivalDateActualUTC);

  const scheduledDeparture = extractTrailingClock(flight?.departureDateScheduled);
  const estimatedDeparture = extractTrailingClock(flight?.departureDateEstimated);
  const actualDeparture = extractTrailingClock(flight?.departureDateActual);
  const scheduledArrival = extractTrailingClock(flight?.arrivalDateScheduled);
  const estimatedArrival = extractTrailingClock(flight?.arrivalDateEstimated);
  const actualArrival = extractTrailingClock(flight?.arrivalDateActual);

  const departureDisplay = buildDisplayTime(actualDeparture, estimatedDeparture, scheduledDeparture, 'departure');
  const arrivalDisplay = buildDisplayTime(actualArrival, estimatedArrival, scheduledArrival, 'arrival');

  const departureDelay = diffPositiveMinutesMs(
    scheduledDepartureMs,
    selectTimestamp(actualDepartureMs, estimatedDepartureMs)
  );
  const arrivalDelay = diffPositiveMinutesMs(
    scheduledArrivalMs,
    selectTimestamp(actualArrivalMs, estimatedArrivalMs)
  );
  const delayMinutes = Math.max(departureDelay, arrivalDelay);
  const durationMinutes = signedMinutesBetweenMs(scheduledDepartureMs, scheduledArrivalMs);

  return {
    flightNumber: `QR${flightNumberDigits}`,
    rawStatusCode: String(flight?.fsInfo?.opsStatusCode || flight?.flightStatus || '').toUpperCase(),
    rawStatus: String(flight?.flightStatus || 'Unknown'),
    status: mapQatarStatus(flight?.fsInfo?.opsStatusCode, flight?.flightStatus, delayMinutes),
    delayMinutes,
    departureDelay,
    arrivalDelay,
    scheduledDeparture,
    estimatedDeparture,
    actualDeparture,
    scheduledArrival,
    estimatedArrival,
    actualArrival,
    scheduledDepartureMs,
    estimatedDepartureMs,
    actualDepartureMs,
    scheduledArrivalMs,
    estimatedArrivalMs,
    actualArrivalMs,
    departureDisplay: departureDisplay.time,
    departureLabel: departureDisplay.label,
    arrivalDisplay: arrivalDisplay.time,
    arrivalLabel: arrivalDisplay.label,
    duration: durationMinutes === null ? null : formatDuration(durationMinutes),
    timeLeft: null,
    origin: flight?.departureStation?.airportCode || null,
    destination: flight?.arrivalStation?.airportCode || null,
    sourceUrl: QATAR_SEARCH_URL
  };
}

function buildConnectionMetrics(leg1, leg2, minLayover, overrides = {}) {
  const scheduledRaw = leg2
    ? signedMinutesBetweenMs(leg1.scheduledArrivalMs, leg2.scheduledDepartureMs)
    : null;
  const actualRaw = leg2
    ? signedMinutesBetweenMs(
        selectTimestamp(leg1.actualArrivalMs, leg1.estimatedArrivalMs, leg1.scheduledArrivalMs),
        selectTimestamp(leg2.actualDepartureMs, leg2.estimatedDepartureMs, leg2.scheduledDepartureMs)
      )
    : null;

  let connectionPossible = overrides.connectionPossible;
  if (connectionPossible === undefined) {
    if (!leg2) {
      connectionPossible = false;
    } else if (leg1.status === 'cancelled' || leg2.status === 'cancelled') {
      connectionPossible = false;
    } else {
      const basis = actualRaw ?? scheduledRaw;
      connectionPossible = basis !== null ? basis >= minLayover : false;
    }
  }

  return {
    scheduledMinutes: scheduledRaw === null ? null : Math.max(scheduledRaw, 0),
    actualMinutes:
      actualRaw === null
        ? scheduledRaw === null
          ? 0
          : Math.max(scheduledRaw, 0)
        : Math.max(actualRaw, 0),
    minimumLayoverMinutes: minLayover,
    connectionPossible: Boolean(connectionPossible),
    reason: overrides.reason || null
  };
}

function buildJourneyPayload(route, dateStr, leg1, leg2, connection, extraNotes = []) {
  return {
    isLive: true,
    source: route.source,
    requestedDate: dateStr,
    resolvedDate: leg1.resolvedDate || dateStr,
    leg1FlightNumber: leg1.flightNumber,
    leg1Status: leg1.status,
    leg1Delay: leg1.arrivalDelay,
    leg1DepActual: leg1.actualDeparture || leg1.estimatedDeparture || null,
    leg1ArrActual: leg1.actualArrival || leg1.estimatedArrival || null,
    leg1ScheduledDep: leg1.scheduledDeparture,
    leg1ScheduledArr: leg1.scheduledArrival,
    leg1EstimatedDep: leg1.estimatedDeparture,
    leg1EstimatedArr: leg1.estimatedArrival,
    leg1DepDisplay: leg1.departureDisplay,
    leg1ArrDisplay: leg1.arrivalDisplay,
    leg1DepLabel: leg1.departureLabel,
    leg1ArrLabel: leg1.arrivalLabel,
    leg1Duration: leg1.duration,
    leg1TimeLeft: leg1.timeLeft,
    leg1RawStatus: leg1.rawStatus,
    leg1RawStatusCode: leg1.rawStatusCode,
    leg1SourceUrl: leg1.sourceUrl,
    leg1Missing: false,
    leg2FlightNumber: leg2 ? leg2.flightNumber : 'No connection',
    leg2Status: leg2 ? leg2.status : 'unknown',
    leg2Delay: leg2 ? leg2.arrivalDelay : 0,
    leg2DepActual: leg2 ? leg2.actualDeparture || leg2.estimatedDeparture || null : null,
    leg2ArrActual: leg2 ? leg2.actualArrival || leg2.estimatedArrival || null : null,
    leg2ScheduledDep: leg2 ? leg2.scheduledDeparture : null,
    leg2ScheduledArr: leg2 ? leg2.scheduledArrival : null,
    leg2EstimatedDep: leg2 ? leg2.estimatedDeparture : null,
    leg2EstimatedArr: leg2 ? leg2.estimatedArrival : null,
    leg2DepDisplay: leg2 ? leg2.departureDisplay : null,
    leg2ArrDisplay: leg2 ? leg2.arrivalDisplay : null,
    leg2DepLabel: leg2 ? leg2.departureLabel : 'No departure',
    leg2ArrLabel: leg2 ? leg2.arrivalLabel : 'No arrival',
    leg2Duration: leg2 ? leg2.duration : null,
    leg2TimeLeft: leg2 ? leg2.timeLeft : null,
    leg2RawStatus: leg2 ? leg2.rawStatus : 'No viable onward flight published',
    leg2RawStatusCode: leg2 ? leg2.rawStatusCode : null,
    leg2SourceUrl: leg2 ? leg2.sourceUrl : route.sourceUrl || null,
    leg2Missing: !leg2,
    layoverScheduledMinutes: connection.scheduledMinutes,
    layoverActualMinutes: connection.actualMinutes,
    minimumLayoverMinutes: connection.minimumLayoverMinutes,
    connectionPossible: connection.connectionPossible,
    connectionReason: connection.reason,
    notes: [
      `${leg1.flightNumber}: ${leg1.rawStatus}`,
      leg2 ? `${leg2.flightNumber}: ${leg2.rawStatus}` : 'No onward connection published',
      ...extraNotes
    ].filter(Boolean)
  };
}

async function fetchJson(url, referer) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: referer,
      'User-Agent': USER_AGENT
    }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    throw createError(502, 'invalid_source_response', 'The official source returned non-JSON data.', {
      url
    });
  }

  if (!response.ok) {
    throw createError(
      502,
      'official_source_error',
      `The official source request failed with status ${response.status}.`,
      { url, responseStatus: response.status, payload }
    );
  }

  return payload;
}

async function fetchEmiratesRoute(route, dateStr) {
  const serviceUrl = new URL(EMIRATES_SERVICE_URL);
  serviceUrl.searchParams.set('departureDate', dateStr);
  serviceUrl.searchParams.set('origin', route.origin);
  serviceUrl.searchParams.set('destination', route.destination);

  const payload = await fetchJson(serviceUrl.toString(), formatEmiratesUrl(route, dateStr));
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const targetFlightNumber = normalizeFlightNumber(route.flightNumber);

  const matched = results.find(result => {
    if (normalizeFlightNumber(result.flightNumber) !== targetFlightNumber) {
      return false;
    }

    if (result.flightDate !== dateStr) {
      return false;
    }

    return Array.isArray(result.flightRoute) && result.flightRoute.some(leg => {
      const origin = leg.originActualAirportCode || leg.originPlannedAirportCode;
      const destination = leg.destinationActualAirportCode || leg.destinationPlannedAirportCode;
      return origin === route.origin && destination === route.destination;
    });
  });

  if (!matched) {
    throw createError(
      404,
      'tracked_flights_missing',
      'The Emirates official source did not include the tracked flight for the requested date.',
      {
        requestedDate: dateStr,
        route,
        availableFlights: results.map(result => ({
          flightNumber: `EK${String(result.flightNumber || '').padStart(4, '0')}`,
          flightDate: result.flightDate
        }))
      }
    );
  }

  const leg = matched.flightRoute.find(item => {
    const origin = item.originActualAirportCode || item.originPlannedAirportCode;
    const destination = item.destinationActualAirportCode || item.destinationPlannedAirportCode;
    return origin === route.origin && destination === route.destination;
  });

  if (!leg) {
    throw createError(
      404,
      'tracked_leg_missing',
      'The Emirates official source returned the flight but not the requested route leg.',
      {
        requestedDate: dateStr,
        route,
        flightNumber: matched.flightNumber
      }
    );
  }

  return normalizeEmiratesLeg(matched, leg, route, dateStr);
}

async function getQatarCookieHeader(forceRefresh = false) {
  if (!forceRefresh && qatarCookieCache.value && qatarCookieCache.expiresAt > Date.now()) {
    return qatarCookieCache.value;
  }

  const response = await fetch(QATAR_SEARCH_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    throw createError(
      502,
      'official_source_error',
      `Qatar Airways bootstrap request failed with status ${response.status}.`,
      { url: QATAR_SEARCH_URL, responseStatus: response.status }
    );
  }

  const getSetCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const cookieHeader = getSetCookie.map(value => value.split(';')[0]).join('; ');
  if (!cookieHeader) {
    throw createError(
      502,
      'missing_qatar_cookie',
      'Qatar Airways did not return the session cookies needed for status lookups.'
    );
  }

  qatarCookieCache = {
    value: cookieHeader,
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  return cookieHeader;
}

async function fetchQatarStatus(body, forceRefresh = false) {
  const cookieHeader = await getQatarCookieHeader(forceRefresh);
  const response = await fetch(QATAR_STATUS_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Origin: 'https://fs.qatarairways.com',
      Referer: 'https://fs.qatarairways.com/',
      Cookie: cookieHeader,
      'Sec-CH-UA': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"',
      'User-Agent': USER_AGENT
    },
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!contentType.includes('application/json')) {
    if (!forceRefresh) {
      qatarCookieCache = { value: null, expiresAt: 0 };
      return fetchQatarStatus(body, true);
    }
    throw createError(
      502,
      'qatar_waf_block',
      'Qatar Airways rejected the server-side status lookup.',
      { url: QATAR_STATUS_URL, bodyPreview: text.slice(0, 200) }
    );
  }

  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw createError(
      502,
      'invalid_source_response',
      'Qatar Airways returned invalid JSON.',
      { url: QATAR_STATUS_URL }
    );
  }

  if (!response.ok) {
    throw createError(
      502,
      'official_source_error',
      `Qatar Airways status request failed with status ${response.status}.`,
      { url: QATAR_STATUS_URL, responseStatus: response.status, payload }
    );
  }

  if (payload?.captchaRequired) {
    throw createError(
      502,
      'qatar_captcha_required',
      'Qatar Airways requested a captcha for this status lookup.'
    );
  }

  return payload;
}

async function fetchQatarRoute(route, dateStr) {
  const payload = await fetchQatarStatus({
    departureStation: route.origin,
    arrivalStation: route.destination,
    scheduledDate: dateStr,
    appLocale: 'en'
  });

  const errorNames = Array.isArray(payload?.errorObject)
    ? payload.errorObject.map(item => item.errorName)
    : [];

  if (errorNames.includes('FS_NOT_FOUND')) {
    return [];
  }

  return Array.isArray(payload?.flights) ? payload.flights.map(normalizeQatarFlight) : [];
}

function chooseQatarLeg1(candidates, preferredFlightNumbers) {
  const preferred = candidates.find(candidate =>
    preferredFlightNumbers.includes(normalizeFlightNumber(candidate.flightNumber))
  );
  if (preferred) {
    return preferred;
  }

  return [...candidates].sort((a, b) => {
    const aMs = a.scheduledDepartureMs ?? Number.MAX_SAFE_INTEGER;
    const bMs = b.scheduledDepartureMs ?? Number.MAX_SAFE_INTEGER;
    return aMs - bMs;
  })[0] || null;
}

function describeQatarCandidates(candidates) {
  return candidates.map(candidate => `${candidate.flightNumber} ${candidate.rawStatus}`).join(', ');
}

function chooseQatarLeg2(candidates, leg1, minLayover) {
  const sorted = [...candidates].sort((a, b) => {
    const aMs = a.scheduledDepartureMs ?? Number.MAX_SAFE_INTEGER;
    const bMs = b.scheduledDepartureMs ?? Number.MAX_SAFE_INTEGER;
    return aMs - bMs;
  });

  const predictedArrivalMs = selectTimestamp(
    leg1.actualArrivalMs,
    leg1.estimatedArrivalMs,
    leg1.scheduledArrivalMs
  );

  if (predictedArrivalMs === null) {
    return {
      selected: sorted[0] || null,
      connectionPossible: false,
      reason: 'Qatar Airways did not expose the Doha arrival time needed to calculate the connection.',
      extraNotes: sorted.length
        ? [`Available DOH-FRA results: ${describeQatarCandidates(sorted)}`]
        : []
    };
  }

  const afterArrival = sorted.filter(candidate => {
    return (candidate.scheduledDepartureMs ?? Number.MAX_SAFE_INTEGER) >= predictedArrivalMs;
  });

  const preferredPool = afterArrival.filter(candidate => candidate.status !== 'cancelled');
  const pool = preferredPool.length ? preferredPool : afterArrival;

  if (!pool.length) {
    return {
      selected: null,
      connectionPossible: false,
      reason: `No DOH-FRA departure is published after ${leg1.flightNumber} arrives in Doha.`,
      extraNotes: sorted.length
        ? [`Available DOH-FRA results: ${describeQatarCandidates(sorted)}`]
        : ['No DOH-FRA route results were returned for this date.']
    };
  }

  const viable = pool.filter(candidate => {
    const departureMs = selectTimestamp(
      candidate.actualDepartureMs,
      candidate.estimatedDepartureMs,
      candidate.scheduledDepartureMs
    );
    return departureMs !== null && departureMs - predictedArrivalMs >= minLayover * 60000;
  });

  if (viable.length) {
    return {
      selected: viable[0],
      connectionPossible: viable[0].status !== 'cancelled',
      reason:
        viable[0].status === 'cancelled'
          ? `${viable[0].flightNumber} is published as the best connection, but it is cancelled.`
          : null,
      extraNotes: []
    };
  }

  const selected = pool[0];
  return {
    selected,
    connectionPossible: false,
    reason:
      selected.status === 'cancelled'
        ? `${selected.flightNumber} is the first published DOH-FRA option after arrival, but it is cancelled.`
        : `${selected.flightNumber} leaves before the ${minLayover}m minimum connection at DOH.`,
    extraNotes: []
  };
}

async function scrapeEmiratesJourney(dateStr) {
  const route = TRACKED_ROUTES.EK;
  const [leg1, leg2] = await Promise.all([
    fetchEmiratesRoute(route.legs[0], dateStr),
    fetchEmiratesRoute(route.legs[1], dateStr)
  ]);

  const connection = buildConnectionMetrics(leg1, leg2, route.minLayover);
  return buildJourneyPayload(route, dateStr, leg1, leg2, connection);
}

async function scrapeQatarJourney(dateStr) {
  const route = TRACKED_ROUTES.QR;
  const [leg1Candidates, leg2Candidates] = await Promise.all([
    fetchQatarRoute({ origin: 'BLR', destination: 'DOH' }, dateStr),
    fetchQatarRoute({ origin: 'DOH', destination: 'FRA' }, dateStr)
  ]);

  if (!leg1Candidates.length) {
    throw createError(
      404,
      'tracked_flights_missing',
      'Qatar Airways did not publish BLR-DOH flight-status results for the requested date.',
      { requestedDate: dateStr }
    );
  }

  const leg1 = chooseQatarLeg1(leg1Candidates, route.legs[0].preferredFlightNumbers);
  const leg2Selection = chooseQatarLeg2(leg2Candidates, leg1, route.minLayover);
  const connection = buildConnectionMetrics(leg1, leg2Selection.selected, route.minLayover, {
    connectionPossible: leg2Selection.connectionPossible,
    reason: leg2Selection.reason
  });

  return buildJourneyPayload(
    route,
    dateStr,
    leg1,
    leg2Selection.selected,
    connection,
    leg2Selection.extraNotes
  );
}

async function scrapeAirlineJourney(code, dateStr) {
  if (code === 'EK') return scrapeEmiratesJourney(dateStr);
  if (code === 'QR') return scrapeQatarJourney(dateStr);
  throw createError(400, 'unsupported_airline', `No automated local scraper is implemented for ${code}.`);
}

async function buildTrackerPayload(dateStr, airline = 'all') {
  const filter = (airline || 'all').toUpperCase();
  const automatedAirlines = getAutomatedAirlines();
  const payload = {
    ok: true,
    date: dateStr,
    source: 'local-official-scraper',
    automatedAirlines,
    manualAirlines: MANUAL_AIRLINES,
    airlines: {}
  };

  const requestedAutomated =
    filter === 'ALL' ? automatedAirlines : automatedAirlines.filter(code => code === filter);
  const requestedManual =
    filter === 'ALL' ? MANUAL_AIRLINES : MANUAL_AIRLINES.filter(code => code === filter);

  if (!requestedAutomated.length && !requestedManual.length) {
    payload.ok = false;
    payload.message = `No automated or manual route is configured for ${filter}.`;
    return payload;
  }

  for (const code of requestedAutomated) {
    try {
      payload.airlines[code] = await scrapeAirlineJourney(code, dateStr);
    } catch (error) {
      if (filter === code) {
        payload.ok = false;
        payload.message = error.message;
      }
      payload.airlines[code] = {
        isLive: false,
        error: error.message,
        code: error.code || 'unexpected_error',
        source: TRACKED_ROUTES[code].source
      };
    }
  }

  for (const code of requestedManual) {
    payload.airlines[code] = {
      isLive: false,
      unsupported: true,
      error: `No free automated local scraper is implemented for ${code} yet.`
    };
  }

  return payload;
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'flight-tracker-local-scraper',
      automatedAirlines: getAutomatedAirlines(),
      manualAirlines: MANUAL_AIRLINES,
      mode: 'official-json'
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/tracker') {
    try {
      const date = url.searchParams.get('date');
      if (!date) {
        throw createError(400, 'missing_date', 'The date query parameter is required.');
      }

      parseDateParts(date);
      const airline = url.searchParams.get('airline') || 'all';
      const payload = await buildTrackerPayload(date, airline);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, error.statusCode || 500, {
        ok: false,
        code: error.code || 'unexpected_error',
        message: error.message || 'Unexpected local scraper error.',
        ...error.extra
      });
    }
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/flight-tracker-fixed.html')) {
    try {
      const html = fs.readFileSync(HTML_FILE, 'utf8');
      sendHtml(res, 200, html);
    } catch (error) {
      sendHtml(res, 500, '<h1>Could not load flight-tracker-fixed.html</h1>');
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/tracker-app.js') {
    try {
      const source = fs.readFileSync(APP_JS_FILE, 'utf8');
      sendJs(res, 200, source);
    } catch (error) {
      sendJs(res, 500, 'console.error("Could not load tracker-app.js");');
    }
    return;
  }

  sendJson(res, 404, {
    ok: false,
    code: 'not_found',
    message: 'Route not found.'
  });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    sendJson(res, 500, {
      ok: false,
      code: error.code || 'unexpected_error',
      message: error.message || 'Unexpected server error.'
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Local scraper listening on http://${HOST}:${PORT}`);
});
