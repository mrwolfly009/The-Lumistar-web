// --- Lumistar Authentication System (Updated with Secret Code) ---

// ফাংশনের বাইরে ডাটাবেজ ভেরিয়েবল রাখা অনেক সময় এরর দেয়, 
// তাই আমরা ফাংশনের ভেতরে এটি কল করবো।

// আপনার সিক্রেট জার্নালিস্ট কোড (প্রয়োজনে এটি পরিবর্তন করে নিতে পারেন)
const VALID_SECRET_CODE = "###8080990033###"; 

function handleAuth(type) {
    // ১. ডাটাবেজ কানেকশন নিশ্চিত করা
    const db = firebase.database();
    
    const nameInput = document.getElementById('uName');
    const passInput = document.getElementById('uPass');
    const secretCodeInput = document.getElementById('uSecretCode');
    const jRadio = document.getElementById('jRadio');

    if (!nameInput) return;

    // নাম থেকে ডট (.) বাদ দেওয়া (Firebase ডট সাপোর্ট করে না কি হিসেবে)
    const rawName = nameInput.value.trim();
    const name = rawName.replace(/\./g, '_'); 
    
    const pass = passInput ? passInput.value : "";
    const enteredSecretCode = secretCodeInput ? secretCodeInput.value.trim() : "";
    const isJournalist = jRadio ? jRadio.checked : false;
    const role = isJournalist ? 'journalist' : 'viewer';

    if (!name) {
        alert("Oi! Name toh likho agey.");
        return;
    }

    // --- REGISTRATION LOGIC ---
    if (type === 'register') {
        // যদি জার্নালিস্ট হিসেবে রেজিস্টার করতে চায়, তবে সিক্রেট কোড চেক করতে হবে
        if (isJournalist) {
            if (enteredSecretCode !== VALID_SECRET_CODE) {
                alert("❌ Vul Secret Journalist Code! Apni journalist hishabe register korte parben na.");
                return;
            }
        }

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

            // যদি ডেটাবেজের রোল এবং ইউজারের সিলেক্ট করা রোল মিলে যায়
            if (userData.password === pass && userData.role === role) {
                
                // অতিরিক্ত সুরক্ষা: লগইন করার সময়ও কেউ যদি জার্নালিস্ট হিসেবে ঢুকতে চায়, সে হ্যাক করে ঢুকতে পারবে না যদি ডাটাবেজে তার রোল 'journalist' না থাকে।
                if (isJournalist && userData.role !== 'journalist') {
                    alert("Apnar ei account-ti journalist role-er noy!");
                    return;
                }

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
    const secretCodeArea = document.getElementById('secretCodeArea');
    
    if (passArea) passArea.style.display = show ? 'block' : 'none';
    if (secretCodeArea) secretCodeArea.style.display = show ? 'block' : 'none';
}
