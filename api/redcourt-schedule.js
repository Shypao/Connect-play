const REDCOURT_BASE_URL = process.env.REDCOURT_API_BASE_URL || "https://redcourt-ui21.vercel.app";

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=20, stale-while-revalidate=60");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function basicAuthorization() {
  const username = process.env.REDCOURT_API_USERNAME;
  const password = process.env.REDCOURT_API_PASSWORD;
  if (!username || !password) return null;
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function redcourtFetch(endpoint) {
  const authorization = basicAuthorization();
  if (!authorization) throw new Error("SCHEDULE_NOT_CONFIGURED");
  return fetch(`${REDCOURT_BASE_URL}${endpoint}`, {
    headers: { Authorization: authorization, Accept: "application/json" },
    cache: "no-store",
  });
}

function validTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

module.exports = async function redcourtSchedule(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const from = validTimestamp(requestUrl.searchParams.get("from"));
    const to = validTimestamp(requestUrl.searchParams.get("to"));
    const maximumRange = 38 * 24 * 60 * 60_000;
    if (!from || !to || to <= from || to - from > maximumRange) {
      return sendJson(res, 400, { error: "Choose a valid schedule range of 38 days or less." });
    }

    const [deskResponse, reservationsResponse] = await Promise.all([
      redcourtFetch("/api/front-desk"),
      redcourtFetch(`/api/reservations?from=${from}&to=${to}&limit=1000`),
    ]);
    if (!deskResponse.ok || !reservationsResponse.ok) {
      throw new Error("UPSTREAM_UNAVAILABLE");
    }

    const desk = await deskResponse.json();
    const source = await reservationsResponse.json();
    const courts = Array.isArray(desk.courts) ? desk.courts.map((court) => ({
      id: String(court.id),
      number: Number(court.number) || null,
      name: String(court.name || `Court ${court.number || court.id}`),
      maintenance: Boolean(court.maintenance),
    })) : [];

    const publicReservations = Array.isArray(source) ? source
      .filter((item) => !["cancelled", "canceled", "no_show"].includes(String(item.status || "").toLowerCase()))
      .map((item) => ({
        id: String(item.id),
        courtId: String(item.courtId),
        startsAt: Number(item.startsAt),
        endsAt: Number(item.endsAt),
        status: String(item.status || "reserved").toLowerCase(),
        type: String(item.reservationType || "court").toLowerCase(),
      }))
      .filter((item) => Number.isFinite(item.startsAt) && Number.isFinite(item.endsAt)) : [];

    return sendJson(res, 200, {
      generatedAt: Date.now(),
      range: { from, to },
      courts,
      reservations: publicReservations,
    });
  } catch (error) {
    const message = error?.message === "SCHEDULE_NOT_CONFIGURED"
      ? "The live REDCOURT schedule connection is not configured."
      : "The live REDCOURT schedule is temporarily unavailable.";
    return sendJson(res, 503, { error: message });
  }
};

