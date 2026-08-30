const REDCOURT_BASE_URL = process.env.REDCOURT_API_BASE_URL || "https://redcourt-ui21.vercel.app";
const requestWindows = new Map();

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function basicAuthorization() {
  const username = process.env.REDCOURT_API_USERNAME;
  const password = process.env.REDCOURT_API_PASSWORD;
  if (!username || !password) return null;
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function redcourtFetch(endpoint, options = {}) {
  const authorization = basicAuthorization();
  if (!authorization) throw new Error("BOOKING_NOT_CONFIGURED");
  return fetch(`${REDCOURT_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: authorization,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
}

function manilaTimestamp(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour - 8, minute);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

async function availability(date, time, durationMinutes) {
  const startsAt = manilaTimestamp(date, time);
  const endsAt = startsAt + durationMinutes * 60_000;
  const dayStart = manilaTimestamp(date, "00:00");
  const dayEnd = dayStart + 24 * 60 * 60_000;
  const [deskResponse, reservationsResponse] = await Promise.all([
    redcourtFetch("/api/front-desk"),
    redcourtFetch(`/api/reservations?from=${dayStart}&to=${dayEnd}&limit=1000`),
  ]);
  if (!deskResponse.ok || !reservationsResponse.ok) throw new Error("UPSTREAM_UNAVAILABLE");

  const desk = await deskResponse.json();
  const reservations = await reservationsResponse.json();
  const activeReservations = Array.isArray(reservations)
    ? reservations.filter((item) => item.status !== "cancelled" && item.status !== "canceled")
    : [];

  const courts = (desk.courts || []).map((court) => {
    const conflict = activeReservations.some((reservation) =>
      String(reservation.courtId) === String(court.id) &&
      Number(reservation.startsAt) < endsAt &&
      Number(reservation.endsAt) > startsAt
    );
    return {
      id: String(court.id),
      name: court.name || `Court ${court.number || court.id}`,
      number: court.number || null,
      available: !court.maintenance && !conflict,
    };
  });

  return { startsAt, endsAt, courts };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new Error("BODY_TOO_LARGE");
  }
  return body ? JSON.parse(body) : {};
}

function rateLimited(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const key = forwarded || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (requestWindows.get(key) || []).filter((stamp) => now - stamp < 60_000);
  recent.push(now);
  requestWindows.set(key, recent);
  return recent.length > 5;
}

module.exports = async function customerBooking(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const allowedOrigin = process.env.BOOKING_ALLOWED_ORIGIN;
  const origin = req.headers.origin;
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return sendJson(res, 403, { error: "Booking requests are not accepted from this website." });
  }

  try {
    if (!basicAuthorization()) {
      return sendJson(res, 503, { error: "Online booking is being configured. Please call REDCOURT for assistance." });
    }

    if (req.method === "GET") {
      const requestUrl = new URL(req.url, "http://localhost");
      const date = requestUrl.searchParams.get("date");
      const time = requestUrl.searchParams.get("time");
      const duration = Number(requestUrl.searchParams.get("duration") || 60);
      if (!isDate(date) || !isTime(time) || ![60, 90, 120, 180].includes(duration)) {
        return sendJson(res, 400, { error: "Choose a valid date, time, and duration." });
      }
      const result = await availability(date, time, duration);
      return sendJson(res, 200, { courts: result.courts });
    }

    if (req.method === "POST") {
      if (rateLimited(req)) return sendJson(res, 429, { error: "Too many booking attempts. Please wait a minute and try again." });
      const body = await readBody(req);
      if (body.website) return sendJson(res, 200, { ok: true });

      const customerName = String(body.customerName || "").trim().slice(0, 100);
      const contact = String(body.contact || "").trim().slice(0, 100);
      const notes = String(body.notes || "").trim().slice(0, 500);
      const date = String(body.date || "");
      const time = String(body.time || "");
      const duration = Number(body.duration);
      const courtId = String(body.courtId || "");
      const playerCount = Number(body.playerCount);

      if (customerName.length < 2 || contact.length < 5 || !isDate(date) || !isTime(time) ||
          ![60, 90, 120, 180].includes(duration) || !courtId ||
          !Number.isInteger(playerCount) || playerCount < 1 || playerCount > 20) {
        return sendJson(res, 400, { error: "Complete all required booking details." });
      }

      const opening = manilaTimestamp(date, "07:00");
      const closing = manilaTimestamp(date, "23:00");
      const result = await availability(date, time, duration);
      if (result.startsAt < opening || result.endsAt > closing) {
        return sendJson(res, 400, { error: "Online bookings are available from 7:00 AM to 11:00 PM." });
      }
      const selectedCourt = result.courts.find((court) => court.id === courtId);
      if (!selectedCourt?.available) return sendJson(res, 409, { error: "That court is no longer available. Please select another court." });

      const payload = {
        customerName,
        contact,
        date,
        startTime: time,
        endTime: new Date(result.endsAt + 8 * 60 * 60_000).toISOString().slice(11, 16),
        startsAt: result.startsAt,
        endsAt: result.endsAt,
        courtId,
        playerCount,
        reservationType: "court",
        notes: notes ? `[Website booking] ${notes}` : "Website booking",
        paymentMethod: "unpaid",
        paymentStatus: "unpaid",
        totalFeeCentavos: 0,
        paidAmountCentavos: 0,
        status: "pending",
        source: "website",
      };

      const response = await redcourtFetch("/api/reservations", { method: "POST", body: JSON.stringify(payload) });
      const created = await response.json().catch(() => ({}));
      if (!response.ok) return sendJson(res, response.status === 409 ? 409 : 502, { error: created.error || "REDCOURT could not receive the booking request." });
      return sendJson(res, 201, { ok: true, reservationId: created.id || null });
    }

    res.setHeader("Allow", "GET, POST, OPTIONS");
    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    const message = error?.message === "BOOKING_NOT_CONFIGURED"
      ? "Online booking is being configured. Please call REDCOURT for assistance."
      : "The booking service is temporarily unavailable. Please call REDCOURT or try again shortly.";
    return sendJson(res, 503, { error: message });
  }
};
