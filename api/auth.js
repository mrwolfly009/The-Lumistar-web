const crypto = require("crypto");
const admin = require("firebase-admin");

const ALLOWED_ORIGINS = new Set([
  "https://the-lumistar.vercel.app",
  "https://mrwolfly009.github.io"
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function send(res, status, body) {
  return res.status(status).json(body);
}

function getAdmin() {
  if (admin.apps.length) return admin;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!raw || !databaseURL) {
    throw new Error("Firebase server environment variables are missing.");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid service-account JSON.");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL
  });
  return admin;
}

function cleanUsername(value) {
  return String(value || "").trim().replace(/[.#$[\]/]/g, "_").slice(0, 40);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hashPassword(salt, password) {
  return crypto.createHash("sha256").update(`${salt}:${password}`, "utf8").digest("hex");
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 128;
}

async function makeToken(firebaseAdmin, key, username, userData) {
  const uid = `lumi_${key}`;
  const role = userData.role === "journalist" ? "journalist" : "viewer";
  const journalistRole = role === "journalist"
    ? (userData.journalistRole === "admin" ? "admin" : "junior")
    : "";

  let userRecord;
  try {
    userRecord = await firebaseAdmin.auth().getUser(uid);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    userRecord = await firebaseAdmin.auth().createUser({
      uid,
      displayName: String(userData.name || username).slice(0, 80),
      disabled: false
    });
  }

  await firebaseAdmin.auth().setCustomUserClaims(userRecord.uid, {
    role,
    journalistRole,
    userKey: key,
    username: String(userData.name || username).slice(0, 80)
  });

  return firebaseAdmin.auth().createCustomToken(userRecord.uid);
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { ok: false, message: "Method not allowed." });

  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return send(res, 403, { ok: false, message: "Origin not allowed." });
  }

  try {
    const firebaseAdmin = getAdmin();
    const body = req.body || {};
    const action = String(body.action || "");
    const username = String(body.username || "").trim();
    const key = cleanUsername(username);
    const password = body.password;
    const requestedRole = body.role === "journalist" ? "journalist" : "viewer";

    if (!username || !key || username.length > 40 || !validPassword(password)) {
      return send(res, 400, {
        ok: false,
        message: "Enter a username (up to 40 characters) and a password of at least 6 characters."
      });
    }

    const userRef = firebaseAdmin.database().ref(`users/${key}`);

    if (action === "register") {
      const existing = await userRef.once("value");
      if (existing.exists()) {
        return send(res, 409, { ok: false, message: "This username is already registered." });
      }

      let journalistRole = "";
      if (requestedRole === "journalist") {
        const suppliedCode = String(body.secretCode || "");
        const adminCode = process.env.ADMIN_INVITE_CODE || "";
        const juniorCode = process.env.JUNIOR_INVITE_CODE || "";

        if (adminCode && safeEqual(suppliedCode, adminCode)) {
          journalistRole = "admin";
        } else if (juniorCode && safeEqual(suppliedCode, juniorCode)) {
          journalistRole = "junior";
        } else {
          return send(res, 403, { ok: false, message: "The journalist invitation code is incorrect." });
        }
      }

      const salt = crypto.randomBytes(16).toString("hex");
      const record = {
        name: username,
        role: requestedRole,
        journalistRole,
        joinedAt: new Date().toISOString(),
        salt,
        passwordHash: hashPassword(salt, password)
      };

      // A transaction prevents two registrations from claiming the same username.
      const result = await userRef.transaction(current => current === null ? record : undefined);
      if (!result.committed) {
        return send(res, 409, { ok: false, message: "This username is already registered." });
      }

      const customToken = await makeToken(firebaseAdmin, key, username, record);
      return send(res, 200, { ok: true, customToken, role: requestedRole, journalistRole });
    }

    if (action === "login") {
      const snapshot = await userRef.once("value");
      if (!snapshot.exists()) {
        return send(res, 401, { ok: false, message: "Username or password is incorrect." });
      }

      const userData = snapshot.val() || {};
      const storedRole = userData.role === "journalist" ? "journalist" : "viewer";

      if (storedRole !== requestedRole) {
        return send(res, 403, { ok: false, message: "Choose the account type used when registering." });
      }

      let passwordOK = false;
      if (userData.salt && userData.passwordHash) {
        passwordOK = safeEqual(hashPassword(userData.salt, password), userData.passwordHash);
      } else if (typeof userData.password === "string") {
        // Legacy plaintext accounts are upgraded immediately after a successful login.
        passwordOK = safeEqual(userData.password, password);
        if (passwordOK) {
          const salt = crypto.randomBytes(16).toString("hex");
          await userRef.update({
            salt,
            passwordHash: hashPassword(salt, password),
            password: null
          });
          userData.salt = salt;
          userData.passwordHash = hashPassword(salt, password);
          delete userData.password;
        }
      }

      if (!passwordOK) {
        return send(res, 401, { ok: false, message: "Username or password is incorrect." });
      }

      const customToken = await makeToken(firebaseAdmin, key, username, userData);
      return send(res, 200, {
        ok: true,
        customToken,
        role: storedRole,
        journalistRole: storedRole === "journalist" ? (userData.journalistRole || "junior") : ""
      });
    }

    return send(res, 400, { ok: false, message: "Unknown authentication action." });
  } catch (error) {
    // Detailed server errors stay in Vercel logs, not in the public response.
    console.error("Lumistar auth API error:", error);
    return send(res, 500, {
      ok: false,
      message: "Server setup error. Check the Vercel environment variables and function logs."
    });
  }
};
