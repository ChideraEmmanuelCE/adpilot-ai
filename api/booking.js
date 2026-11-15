const TZ = "Africa/Lagos";
const OWNER_EMAIL = process.env.BOOKING_OWNER_EMAIL || "chideraemmanuelokpala@gmail.com";
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";
const DURATION = 30;
const OPEN_MINUTES = 8 * 60 + 30;
const CLOSE_MINUTES = 18 * 60;

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
function configured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && !Number.isNaN(Date.parse(value + "T12:00:00+01:00"));
}
function weekday(date) {
  return new Date(date + "T12:00:00+01:00").getDay();
}
function localIso(date, time) { return date + "T" + time + ":00+01:00"; }
function makeSlots(date, busy) {
  const slots = [];
  for (let minute = OPEN_MINUTES; minute + DURATION <= CLOSE_MINUTES; minute += DURATION) {
    const hh = String(Math.floor(minute / 60)).padStart(2, "0");
    const mm = String(minute % 60).padStart(2, "0");
    const time = hh + ":" + mm;
    const start = new Date(localIso(date, time));
    const end = new Date(start.getTime() + DURATION * 60000);
    const overlaps = busy.some(period => new Date(period.start) < end && new Date(period.end) > start);
    const past = start.getTime() <= Date.now();
    slots.push({ time, label: new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ }).format(start), available: !overlaps && !past });
  }
  return slots;
}
async function googleToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Google Calendar authorisation failed. Check the Google OAuth credentials and refresh token.");
  return data.access_token;
}
async function googleRequest(path, token, options = {}) {
  const response = await fetch("https://www.googleapis.com/calendar/v3" + path, {
    ...options,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error && data.error.message ? data.error.message : "Google Calendar request failed.";
    throw new Error(message);
  }
  return data;
}
async function getBusy(date, token) {
  const timeMin = localIso(date, "00:00");
  const timeMax = localIso(date, "23:59");
  const data = await googleRequest("/freeBusy", token, {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, timeZone: TZ, items: [{ id: CALENDAR_ID }] })
  });
  const calendars = data.calendars || {};
  const entry = calendars[CALENDAR_ID] || calendars.primary || {};
  if (entry.errors && entry.errors.length) throw new Error("Google Calendar could not check this calendar's availability.");
  return entry.busy || [];
}
async function createZoomMeeting(startIso, name, email, topic) {
  if (!process.env.ZOOM_ACCOUNT_ID || !process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET) {
    throw new Error("Zoom booking is not connected yet. Please choose Google Meet or try again later.");
  }
  const basic = Buffer.from(process.env.ZOOM_CLIENT_ID + ":" + process.env.ZOOM_CLIENT_SECRET).toString("base64");
  const tokenResponse = await fetch("https://zoom.us/oauth/token?grant_type=account_credentials&account_id=" + encodeURIComponent(process.env.ZOOM_ACCOUNT_ID), {
    method: "POST", headers: { Authorization: "Basic " + basic }
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error("Zoom authorisation failed. Check the Server-to-Server OAuth app.");
  const start = new Date(startIso);
  const meetingResponse = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: "Bearer " + tokenData.access_token, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "Northline meeting — " + name,
      type: 2,
      start_time: start.toISOString(),
      duration: DURATION,
      timezone: TZ,
      agenda: [topic, "Booked by: " + name, "Email: " + email].filter(Boolean).join("\n"),
      settings: { join_before_host: false, waiting_room: true, approval_type: 2 }
    })
  });
  const meeting = await meetingResponse.json();
  if (!meetingResponse.ok || !meeting.join_url) throw new Error("Zoom could not create the meeting.");
  return { id: meeting.id, url: meeting.join_url };
}
async function sendOwnerEmail(booking, meetingUrl) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return false;
  const start = new Date(localIso(booking.date, booking.time));
  const when = new Intl.DateTimeFormat("en-NG", { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(start) + " (Lagos time)";
  const text = [
    "A new Northline meeting has been booked.",
    "",
    "Name: " + booking.name,
    "Email: " + booking.email,
    "Phone: " + (booking.phone || "Not provided"),
    "Company: " + (booking.company || "Not provided"),
    "Method: " + booking.method,
    "When: " + when,
    "Topic: " + (booking.topic || "Not provided"),
    "Meeting link: " + (meetingUrl || "WhatsApp call — manually initiate at the scheduled time")
  ].join("\n");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "Northline Bookings <bookings@resend.dev>",
      to: [OWNER_EMAIL],
      reply_to: booking.email,
      subject: "New meeting booking — " + booking.name,
      text
    })
  });
  return response.ok;
}
async function sendOwnerWhatsApp(booking, meetingUrl) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = process.env.OWNER_WHATSAPP_NUMBER;
  const template = process.env.WHATSAPP_BOOKING_TEMPLATE;
  if (!token || !phoneId || !recipient || !template) return false;
  const start = new Date(localIso(booking.date, booking.time));
  const when = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(start);
  const parameters = [booking.name, booking.email, when, booking.method, meetingUrl || "WhatsApp call"];
  const response = await fetch("https://graph.facebook.com/" + (process.env.WHATSAPP_GRAPH_VERSION || "v23.0") + "/" + phoneId + "/messages", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: { name: template, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" }, components: [{ type: "body", parameters: parameters.map(text => ({ type: "text", text: String(text).slice(0, 900) })) }] }
    })
  });
  return response.ok;
}
async function handler(req, res) {
  if (req.method === "GET" && req.query.action === "availability") {
    const date = req.query.date;
    if (!validDate(date)) return reply(res, 400, { error: "Choose a valid date." });
    if (!configured()) return reply(res, 503, { error: "The booking calendar is not connected yet. Please contact us by email to arrange a meeting." });
    if (weekday(date) === 0 || weekday(date) === 6) return reply(res, 200, { slots: [], timeZone: TZ, durationMinutes: DURATION });
    try {
      const token = await googleToken();
      const busy = await getBusy(date, token);
      return reply(res, 200, { slots: makeSlots(date, busy), timeZone: TZ, durationMinutes: DURATION });
    } catch (error) {
      console.error("booking availability:", error.message);
      return reply(res, 502, { error: "We could not read the booking calendar. Please try again shortly." });
    }
  }
  if (req.method !== "POST") return reply(res, 405, { error: "Method not allowed." });
  if (!configured()) return reply(res, 503, { error: "Online booking is not activated yet. Please contact us to arrange a meeting." });
  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return reply(res, 400, { error: "Invalid booking request." }); } }
  if (body.website) return reply(res, 200, { message: "Thank you. Your request has been received." });
  const { date, time, method, name, email, phone = "", company = "", topic = "" } = body;
  if (!validDate(date) || weekday(date) === 0 || weekday(date) === 6) return reply(res, 400, { error: "Choose a weekday date." });
  if (!/^\d{2}:\d{2}$/.test(time || "")) return reply(res, 400, { error: "Choose an available time." });
  const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  if (minute < OPEN_MINUTES || minute + DURATION > CLOSE_MINUTES || minute % 30 !== 0 || !["google_meet", "zoom", "whatsapp"].includes(method)) return reply(res, 400, { error: "That time or meeting method is not available." });
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 100 || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return reply(res, 400, { error: "Enter your name and a valid email address." });
  if (method === "whatsapp" && (typeof phone !== "string" || phone.replace(/\D/g, "").length < 8)) return reply(res, 400, { error: "Enter a WhatsApp number with its country code." });
  if ([phone, company, topic].some(v => typeof v !== "string" || v.length > 1500)) return reply(res, 400, { error: "One of the booking fields is too long." });
  const startIso = localIso(date, time);
  const endIso = new Date(new Date(startIso).getTime() + DURATION * 60000).toISOString();
  let zoom = null;
  let event = null;
  try {
    const token = await googleToken();
    const busy = await getBusy(date, token);
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (start.getTime() <= Date.now() || busy.some(p => new Date(p.start) < end && new Date(p.end) > start)) {
      return reply(res, 409, { error: "That slot has just become unavailable. Please choose another time." });
    }
    if (method === "zoom") zoom = await createZoomMeeting(startIso, name.trim(), email.trim(), topic.trim());
    const description = [
      "Northline introductory meeting.",
      "Meeting method: " + method,
      "Name: " + name.trim(),
      "Email: " + email.trim(),
      "Phone: " + (phone || "Not provided"),
      "Company: " + (company || "Not provided"),
      "Discussion: " + (topic || "Not provided"),
      method === "whatsapp" ? "WhatsApp voice call. The host will manually initiate the call at the agreed time." : (zoom ? "Zoom: " + zoom.url : "Google Meet")
    ].join("\n");
    const eventBody = {
      summary: "Northline meeting — " + name.trim(),
      description,
      start: { dateTime: startIso, timeZone: TZ },
      end: { dateTime: endIso, timeZone: TZ },
      attendees: [{ email: email.trim(), displayName: name.trim() }],
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      guestsCanSeeGuests: false,
      reminders: { useDefault: true }
    };
    if (method === "google_meet") eventBody.conferenceData = { createRequest: { requestId: "northline-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10), conferenceSolutionKey: { type: "hangoutsMeet" } } };
    if (zoom) eventBody.location = zoom.url;
    if (method === "whatsapp") eventBody.location = "WhatsApp voice call — " + phone;
    event = await googleRequest("/calendars/" + encodeURIComponent(CALENDAR_ID) + "/events?sendUpdates=all" + (method === "google_meet" ? "&conferenceDataVersion=1" : ""), token, { method: "POST", body: JSON.stringify(eventBody) });
    let meetingUrl = zoom ? zoom.url : "";
    if (method === "google_meet") {
      for (let attempt = 0; attempt < 3 && !meetingUrl; attempt++) {
        const current = attempt === 0 ? event : await googleRequest("/calendars/" + encodeURIComponent(CALENDAR_ID) + "/events/" + encodeURIComponent(event.id), token);
        const points = current.conferenceData && current.conferenceData.entryPoints || [];
        meetingUrl = (points.find(p => p.entryPointType === "video") || {}).uri || current.hangoutLink || "";
        if (!meetingUrl && attempt < 2) await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }
    const booking = { date, time, method: method === "google_meet" ? "Google Meet" : method === "zoom" ? "Zoom" : "WhatsApp call", name: name.trim(), email: email.trim(), phone, company, topic };
    const [emailSent, whatsappSent] = await Promise.all([
      sendOwnerEmail(booking, meetingUrl).catch(error => { console.error("booking email:", error.message); return false; }),
      sendOwnerWhatsApp(booking, meetingUrl).catch(error => { console.error("booking WhatsApp:", error.message); return false; })
    ]);
    return reply(res, 200, {
      message: method === "whatsapp" ? "Your time is reserved. The WhatsApp voice call will be initiated manually at the agreed time." : "Your meeting is confirmed. A calendar invitation has been sent to your email.",
      meetingUrl,
      notifications: { email: emailSent, whatsapp: whatsappSent },
      calendarEventId: event.id
    });
  } catch (error) {
    console.error("booking create:", error.message);
    if (event && event.id) {
      try { const token = await googleToken(); await googleRequest("/calendars/" + encodeURIComponent(CALENDAR_ID) + "/events/" + encodeURIComponent(event.id), token, { method: "DELETE" }); } catch (cleanupError) { console.error("booking rollback:", cleanupError.message); }
    }
    return reply(res, 502, { error: error.message.includes("Zoom") ? error.message : "We could not complete the booking. No confirmation has been sent. Please try another slot." });
  }
}
module.exports = handler;
