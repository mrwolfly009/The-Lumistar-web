// --- Lumistar Authentication System v2 ---

// SHA-256 hashes of the secret codes (not the codes themselves)
const ADMIN_CODE_HASH  = "42cee7a78483609536483f7ccf6f393425e5f0305b7050903ca6d523e20d276d";
const JUNIOR_CODE_HASH = "0db78dbffd6a901db82e5fd73ef315d1fa4f82190fd183f38813e3d4e609d4fb";

// Can Admin delete any journalist's news? (true / false)
const ADMIN_CAN_DELETE_ALL = true;

// ---------- Helpers ----------
async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Firebase keys cannot contain . # $ [ ] /
function makeKey(name) {
    return name.replace(/[.#$\[\]\/]/g, '_');
}

// ---------- Main login / register ----------
async function handleAuth(type) {
    if (!window.crypto || !window.crypto.subtle) {
        alert("Ei browser-e secure login kaj korbe na. Link ta https:// diye kholo.");
        return;
    }

    const db = firebase.database();

    const nameInput = document.getElementById('uName');
    const passInput = document.getElementById('uPass');
    const secretCodeInput = document.getElementById('uSecretCode');
    const jRadio = document.getElementById('jRadio');

    if (!nameInput) return;

    const rawName = nameInput.value.trim();
    const key = makeKey(rawName);
    const pass = passInput ? passInput.value : "";
    const code = secretCodeInput ? secretCodeInput.value.trim() : "";
    const isJournalist = jRadio ? jRadio.checked : false;

    if (!rawName) {
        alert("Oi! Name toh likho agey.");
        return;
    }
    if (isJournalist && !pass) {
        alert("Journalist-er jonno Password dite hobe.");
        return;
    }

    try {
        if (type === 'register') {
            await registerUser(db, key, rawName, pass, code, isJournalist);
        } else if (type === 'login') {
            await loginUser(db, key, rawName, pass, isJournalist);
        }
    } catch (err) {
        console.error("Auth Error:", err);
        alert("Database Error! Rules check koro.");
    }
}

// ---------- Registration ----------
async function registerUser(db, key, rawName, pass, code, isJournalist) {
    const newUser = {
        name: rawName,
        role: 'viewer',
        journalistRole: '',
        joinedAt: Date.now()
    };

    if (isJournalist) {
        if (pass.length < 6) {
            alert("Password kompokkhe 6 okkhor hote hobe.");
            return;
        }

        const codeHash = await sha256(code);
        if (codeHash === ADMIN_CODE_HASH) {
            newUser.journalistRole = 'admin';
        } else if (codeHash === JUNIOR_CODE_HASH) {
            newUser.journalistRole = 'junior';
        } else {
            alert("❌ Vul Secret Journalist Code! Apni journalist hishabe register korte parben na.");
            return;
        }

        newUser.role = 'journalist';
        newUser.salt = makeSalt();
        newUser.passwordHash = await sha256(newUser.salt + ':' + pass);
    }

    // Transaction: only create if the name is not taken
    const result = await db.ref('users/' + key).transaction(current => {
        return current === null ? newUser : undefined;
    });

    if (result.committed) {
        alert("Registration Successful! Ebar LOGIN-e click koro.");
    } else {
        alert("Eii nam-e agei account ache! Login koro.");
    }
}

// ---------- Login ----------
async function loginUser(db, key, rawName, pass, isJournalist) {
    const snapshot = await db.ref('users/' + key).once('value');
    const userData = snapshot.val();

    if (!userData) {
        alert("User khunje paoa jayni! Agey Register koro.");
        return;
    }

    const expectedRole = isJournalist ? 'journalist' : 'viewer';
    if (userData.role !== expectedRole) {
        alert("Password ba Role vul hoyeche!");
        return;
    }

    if (userData.role === 'journalist') {
        let ok = false;

        if (userData.passwordHash) {
            ok = (await sha256(userData.salt + ':' + pass)) === userData.passwordHash;
        } else if (userData.password !== undefined) {
            // Old account with plain-text password: check, then upgrade to hash
            ok = (userData.password === pass);
            if (ok) {
                const salt = makeSalt();
                await db.ref('users/' + key).update({
                    salt: salt,
                    passwordHash: await sha256(salt + ':' + pass),
                    password: null
                });
            }
        }

        if (!ok) {
            alert("Password ba Role vul hoyeche!");
            return;
        }
    }

    // Save session
    try {
        localStorage.setItem('currentUser', userData.name || rawName);
        localStorage.setItem('currentUserKey', key);
        localStorage.setItem('userRole', userData.role);
        if (userData.role === 'journalist') {
            localStorage.setItem('journalistRole', userData.journalistRole || 'junior');
        } else {
            localStorage.removeItem('journalistRole');
        }
    } catch (e) {
        alert("Browser storage kaj korche na. Private mode bondho kore abar chesta koro.");
        return;
    }

    window.location.replace(userData.role === 'journalist' ? "journalist.html" : "viewer.html");
}

// ---------- Session helpers ----------
function getSession() {
    try {
        return {
            user: localStorage.getItem('currentUser'),
            key: localStorage.getItem('currentUserKey'),
            role: localStorage.getItem('userRole'),
            journalistRole: localStorage.getItem('journalistRole')
        };
    } catch (e) {
        return { user: null, key: null, role: null, journalistRole: null };
    }
}

// Call at the top of a page: requireLogin(['journalist']) or requireLogin()
function requireLogin(allowedRoles) {
    const s = getSession();
    const roleOk = !allowedRoles || allowedRoles.includes(s.role);
    if (!s.user || !s.role || !roleOk) {
        window.location.replace("login.html");
        return false;
    }
    return true;
}

function isAdmin() {
    const s = getSession();
    return s.role === 'journalist' && s.journalistRole === 'admin';
}

// Can the current user delete a news item written by authorKey?
function canDeleteNews(authorKey) {
    const s = getSession();
    if (s.role !== 'journalist') return false;
    if (ADMIN_CAN_DELETE_ALL && s.journalistRole === 'admin') return true;
    if (!authorKey) return false;
    return authorKey === s.key;
}

// ---------- Logout ----------
function logout() {
    if (confirm("Are you sure?")) {
        try {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('currentUserKey');
            localStorage.removeItem('userRole');
            localStorage.removeItem('journalistRole');
        } catch (e) {}
        window.location.replace("login.html");
    }
}
