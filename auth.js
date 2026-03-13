// --- Lumistar Authentication System (Fixed) ---

// ফাংশনের বাইরে ডাটাবেজ ভেরিয়েবল রাখা অনেক সময় এরর দেয়, 
// তাই আমরা ফাংশনের ভেতরে এটি কল করবো।

function handleAuth(type) {
    // ১. ডাটাবেজ কানেকশন নিশ্চিত করা
    const db = firebase.database();
    
    const nameInput = document.getElementById('uName');
    const passInput = document.getElementById('uPass');
    const jRadio = document.getElementById('jRadio');

    if (!nameInput) return;

    // নাম থেকে ডট (.) বাদ দেওয়া (Firebase ডট সাপোর্ট করে না কি হিসেবে)
    const rawName = nameInput.value.trim();
    const name = rawName.replace(/\./g, '_'); 
    
    const pass = passInput ? passInput.value : "";
    const isJournalist = jRadio ? jRadio.checked : false;
    const role = isJournalist ? 'journalist' : 'viewer';

    if (!name) {
        alert("Oi! Name toh likho agey.");
        return;
    }

    console.log("Attempting " + type + " for: " + name);

// --- REGISTRATION LOGIC ---
    if (type === 'register') {
        db.ref('users/' + name).once('value', (snapshot) => {
            if (snapshot.exists()) {
                alert("Eii nam-e agei account ache! Login koro.");
            } else {
                db.ref('users/' + name).set({
                    password: pass,
                    role: role,
                    joinedAt: Date.now()
                }).then(() => {
                    alert("Registration Successful! Ebar LOGIN-e click koro.");
                }).catch(err => {
                    console.error("Reg Error:", err);
                    alert("Database Error! Rules check koro.");
                });
            }
        });
    } 
    
// --- LOGIN LOGIC ---
    else if (type === 'login') {
        db.ref('users/' + name).once('value', (snapshot) => {
            const userData = snapshot.val();
            
            if (!userData) {
                alert("User khunje paoa jayni! Agey Register koro.");
                return;
            }

            if (userData.password === pass && userData.role === role) {
                localStorage.setItem('currentUser', rawName);
                localStorage.setItem('userRole', role);
                
                // গিটহাবের জন্য পাথ সেফ রিডাইরেক্ট
                if (role === 'journalist') {
                    window.location.replace("journalist.html");
                } else {
                    window.location.replace("viewer.html");
                }
            } else {
                alert("Password ba Role vul hoyeche!");
            }
        });
    }
}

// Logout Function
function logout() {
    if (confirm("Are you sure?")) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userRole');
        window.location.replace("login.html");
    }
}

function togglePass(show) {
    const passArea = document.getElementById('passArea');
    if (passArea) passArea.style.display = show ? 'block' : 'none';
}
