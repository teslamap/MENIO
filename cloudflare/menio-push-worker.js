/**
 * MENIO Push sender for Cloudflare Workers.
 *
 * Required Worker Secret:
 *   FIREBASE_SERVICE_ACCOUNT = complete Firebase service-account JSON
 *
 * Only an authenticated Firebase user who owns the restaurant for the order
 * can send the "order ready" notification.
 */
const PROJECT_ID = "menio-8de8f";
const FIREBASE_API_KEY = "AIzaSyDghOTPxpYXBGijyZMJTL3SxTazB881YMo";
const ALLOWED_ORIGIN = "https://teslamap.github.io";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const IDENTITY_LOOKUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore";

let cachedAccessToken = "";
let cachedAccessTokenUntil = 0;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function reply(request, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(request.headers.get("Origin") || "") }
  });
}
function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function encodeJson(value) {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}
function pemToArrayBuffer(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
async function getGoogleAccessToken(serviceAccount) {
  if (cachedAccessToken && Date.now() < cachedAccessTokenUntil) return cachedAccessToken;
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const claim = encodeJson({
    iss: serviceAccount.client_email,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  });
  const unsigned = header + "." + claim;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + base64url(new Uint8Array(signature));
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Google OAuth token request failed");
  cachedAccessToken = data.access_token;
  cachedAccessTokenUntil = Date.now() + Math.max(60, Number(data.expires_in || 3600) - 120) * 1000;
  return cachedAccessToken;
}
async function firebaseUserFromIdToken(idToken) {
  const response = await fetch(IDENTITY_LOOKUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  const data = await response.json();
  if (!response.ok || !data.users?.[0]?.localId || data.users[0].disabled) return null;
  return data.users[0];
}
async function firestoreDocument(accessToken, path) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const response = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
  if (response.status === 404) return null;
  const data = await response.json();
  if (!response.ok) throw new Error("Could not read the required Firestore document");
  return data;
}
function field(document, name) {
  return document?.fields?.[name]?.stringValue ?? "";
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request.headers.get("Origin") || "") });
    if (request.method !== "POST") return reply(request, { error: "Use POST." }, 405);
    if (request.headers.get("Origin") !== ALLOWED_ORIGIN) return reply(request, { error: "Origin not allowed." }, 403);

    try {
      if (!env.FIREBASE_SERVICE_ACCOUNT) return reply(request, { error: "Worker secret FIREBASE_SERVICE_ACCOUNT is missing." }, 500);
      const body = await request.json();
      const idToken = typeof body.idToken === "string" ? body.idToken : "";
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      if (!idToken || !/^[A-Za-z0-9_-]{10,200}$/.test(orderId)) return reply(request, { error: "Missing or invalid idToken/orderId." }, 400);

      const user = await firebaseUserFromIdToken(idToken);
      if (!user) return reply(request, { error: "Firebase sign-in is invalid or expired." }, 401);

      let serviceAccount;
      try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); }
      catch { return reply(request, { error: "FIREBASE_SERVICE_ACCOUNT must contain valid JSON." }, 500); }
      if (serviceAccount.project_id !== PROJECT_ID || !serviceAccount.client_email || !serviceAccount.private_key) {
        return reply(request, { error: "Firebase service-account JSON is for the wrong project or incomplete." }, 500);
      }
      const accessToken = await getGoogleAccessToken(serviceAccount);
      const order = await firestoreDocument(accessToken, "orders/" + encodeURIComponent(orderId));
      if (!order) return reply(request, { error: "Order not found." }, 404);

      const slug = field(order, "restaurantSlug");
      const owner = slug ? await firestoreDocument(accessToken, "restaurantOwners/" + encodeURIComponent(slug)) : null;
      if (!owner || field(owner, "ownerUid") !== user.localId) return reply(request, { error: "You do not own this restaurant." }, 403);
      if (field(order, "status") !== "completed") return reply(request, { error: "Order is not marked completed." }, 409);
      const customerToken = field(order, "customerPushToken");
      if (!customerToken) return reply(request, { error: "No customer Push token is saved for this order." }, 409);

      const tableNumber = order.fields?.tableNumber?.integerValue || "—";
      const restaurant = await firestoreDocument(accessToken, "restaurants/" + encodeURIComponent(slug));
      const restaurantName = field(restaurant, "name") || "MENIO";
      const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: customerToken,
            data: {
              title: restaurantName + " — შეკვეთა მზადაა!",
              body: "მაგიდა №" + tableNumber + " — შენი შეკვეთა მზადაა ასაღებად.",
              orderId,
              url: "/MENIO/v2/menu.html?restaurant=" + encodeURIComponent(slug) + "&table=" + encodeURIComponent(String(tableNumber))
            },
            android: { priority: "high" }
          }
        })
      });
      const fcmData = await fcmResponse.json();
      if (!fcmResponse.ok) {
        const code = fcmData?.error?.details?.[0]?.errorCode || fcmData?.error?.status || "FCM_ERROR";
        return reply(request, { error: "FCM could not send the notification.", code }, 502);
      }
      return reply(request, { ok: true });
    } catch (error) {
      console.error("MENIO Push error:", error?.message || error);
      return reply(request, { error: "MENIO Push failed. Check Worker logs." }, 500);
    }
  }
};
