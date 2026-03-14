const firebaseConfig = {
  apiKey: "AIzaSyDqU6HHGHAO3nrEwMQ0WEMMCtQeikMhgUw",
  authDomain: "the-lumistar-web.firebaseapp.com",
  databaseURL: "https://the-lumistar-web-default-rtdb.firebaseio.com/",
  projectId: "the-lumistar-web",
  storageBucket: "the-lumistar-web.firebasestorage.app",
  messagingSenderId: "343793935025",
  appId: "1:343793935025:web:fd92cd889c72f8ebb17890"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ২. ঘড়ি আপডেট
function updateClocks() {
    const clock1 = document.getElementById('clock1');
    if (!clock1) return;
    const now = new Date();
    const timeString = now.toLocaleString('en-US', { 
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
    });
    clock1.innerText = timeString;
}

// ৩. পাবলিশ ফাংশন
// ছবির প্রিভিউ এবং ক্যান্সেল করার জন্য গ্লোবাল লজিক
const fileInput = document.getElementById('fileInput');

if (fileInput) {
    fileInput.onchange = function() {
        const file = this.files[0];
        if (file) {
            const cancelImg = document.getElementById('cancelImg');
            if (cancelImg) cancelImg.style.display = 'inline-block';
        }
    };
}

function clearFile() {
    const fileInput = document.getElementById('fileInput');
    if(fileInput) fileInput.value = "";
    document.getElementById('cancelImg').style.display = 'none';
}

function publish() {
    const t = document.getElementById('tInput').value.trim();
    const iLink = document.getElementById('iInput').value.trim();
    const c = document.getElementById('cInput').value.trim();
    const fileInput = document.getElementById('fileInput');

    if (!t || !c) {
        alert("Headline and details are required!");
        return;
    }

    // ছবি যদি গ্যালারি থেকে থাকে
    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = new Image();
            img.src = e.target.result;
            img.onload = function() {
                // ছবি বড় হলে রিসাইজ করা (Max Width 800px)
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const max_size = 800;

                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // কোয়ালিটি ০.৭ করে ডেটাবেজে পাঠানো (সাইজ অনেক কমে যাবে)
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                saveToFirebase(t, compressedBase64, c);
            };
        };
        reader.readAsDataURL(file);
    } else {
        saveToFirebase(t, iLink || "", c);
    }
}

function saveToFirebase(title, imgSource, content) {
    db.ref('news_portal').push({
        title: title,
        img: imgSource,
        content: content,
        date: new Date().toLocaleDateString('en-GB'),
        timestamp: Date.now()
    }).then(() => {
        alert("News Published Successfully!");
        document.getElementById('tInput').value = "";
        document.getElementById('iInput').value = "";
        document.getElementById('cInput').value = "";
        // fileInput variable-er bodole direct ID use koro
        const fInput = document.getElementById('fileInput');
        if(fInput) fInput.value = "";
    }).catch(err => console.error("Firebase Error:", err));
}

// ৪. রেন্ডার ফাংশন
function render() {
    const feed = document.getElementById('newsFeed');
    if (!feed) return;

    // Reliability বাড়াতে href.toLowerCase ব্যবহার করা হয়েছে
    const isJournalistPage = window.location.href.toLowerCase().indexOf('journalist') > -1;

    console.log("Fetching news from Firebase...");

    db.ref('news_portal').on('value', (snapshot) => {
        const data = snapshot.val();
        console.log("Data received:", data); // এই লাইনটি কনসোলে চেক করবেন
        
        const list = [];
        for (let key in data) {
            list.unshift({ id: key, ...data[key] });
        }

        feed.innerHTML = '';
        if (list.length === 0) {
            feed.innerHTML = '<p style="text-align:center; padding: 20px;">No news published yet.</p>';
            return;
        }

        list.forEach(item => {
            const art = document.createElement('article');
            art.className = 'news-item';
            
            const delBtn = isJournalistPage ? `<button onclick="del('${item.id}')" style="background:none; border:1px solid #000; cursor:pointer; font-weight:bold;">[X]</button>` : '';

            let firstLetter = item.content.charAt(0);
            let restOfContent = item.content.slice(1);
            const banglaKar = /^[\u09BE-\u09CC\u09D7]/; 
            if (restOfContent.length > 0 && banglaKar.test(restOfContent.charAt(0))) {
                firstLetter += restOfContent.charAt(0);
                restOfContent = restOfContent.slice(1);
            }

            art.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-family:serif; text-transform: uppercase;">${item.title}</h2>
                    ${delBtn}
                </div>
                <p style="text-align:right; font-size:0.8rem; margin:5px 0; font-style: italic;">Pub: ${item.date}</p>
                ${item.img ? `<img src="${item.img}" style="width:100%; border:1px solid #000; margin:10px 0;">` : ''}
                <p style="text-align:justify; line-height:1.6; font-size: 1.05rem;">
                    <span class="drop-cap">${firstLetter}</span>${restOfContent}
                </p>
            `;
            feed.appendChild(art);
        });
    });
}

function del(id) {
    if (confirm("Delete this article?")) {
        db.ref('news_portal').child(id).remove();
    }
}
// ১. ব্রেকিং নিউজ আপডেট করার ফাংশন (Journalist এর জন্য)
function updateBreaking() {
    const text = document.getElementById('breakingInput').value.trim();
    if (!text) {
        alert("Oi! Breaking news text kothay?");
        return;
    }

    db.ref('breakingNews').set({
        text: text,
        timestamp: Date.now()
    }).then(() => {
        alert("Breaking News Updated!");
        document.getElementById('breakingInput').value = "";
    });
}

// ২. ডাটাবেজ থেকে ব্রেকিং নিউজ রিয়েল-টাইমে শোনা (সব পেজের জন্য)
// script.js এর শেষে এটি যোগ করুন (যদি আগে না করে থাকেন)
function listenBreaking() {
    const marquee = document.querySelector('.breaking-news-container marquee');
    if (!marquee) return;

    // Firebase database থেকে breakingNews নোডটি চেক করা
    db.ref('breakingNews').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.text) {
            marquee.innerText = `*** ${data.text.toUpperCase()} ***`;
        } else {
            marquee.innerText = "*** THE LUMISTAR: আহামরি সব আজাইরা News এখন আপনার চোখের সামনে  ***";
        }
    });
}

// পেজ লোড হওয়ার সময় লিসেনার চালু করা
window.addEventListener('load', listenBreaking);

// ৩. উইন্ডো লোড হওয়ার সময় এই লিসেনার চালু করা
const originalOnload = window.onload;
window.onload = function() {
    console.log("App Started...");
    render();
    setInterval(updateClocks, 1000);
    if (originalOnload) originalOnload();
    listenBreaking();
};

const myKey = "e9fa5ff4c995f29c349050bf3b4f3bc6"; // Tomar Dhaka key-ta eikhane boshalom
const myCity = "Dhaka";

async function getTheWeather() {
    const tempElement = document.getElementById('temp');
    const condElement = document.getElementById('condition');
    const iconFont = document.getElementById('weather-icon-font'); // ID ta check koro

    if (!tempElement) return;

    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${myCity}&appid=${myKey}&units=metric`);
        
if (res.ok) {
            const weatherData = await res.json();
            console.log("Weather data received successfully!");

            // Temperature ar Condition update
            tempElement.innerText = Math.round(weatherData.main.temp) + "°C";
            condElement.innerText = weatherData.weather[0].main.toUpperCase();

            // PENCIL ART ICON LOGIC (Eikhane thikmoto boshao)
            const conditionCode = weatherData.weather[0].icon;
            let iconClass = "fa-solid fa-cloud"; // Default

            if (conditionCode.startsWith('01')) iconClass = "fa-solid fa-sun"; 
            if (conditionCode.startsWith('02')) iconClass = "fa-solid fa-cloud-sun"; 
            if (conditionCode.startsWith('03')) iconClass = "fa-solid fa-cloud"; 
            if (conditionCode.startsWith('04')) iconClass = "fa-solid fa-cloud"; 
            if (conditionCode.startsWith('09')) iconClass = "fa-solid fa-cloud-showers-heavy"; 
            if (conditionCode.startsWith('10')) iconClass = "fa-solid fa-cloud-sun-rain"; 
            if (conditionCode.startsWith('11')) iconClass = "fa-solid fa-cloud-bolt"; 
            if (conditionCode.startsWith('13')) iconClass = "fa-solid fa-snowflake"; 
            if (conditionCode.startsWith('50')) iconClass = "fa-solid fa-smog"; 

if (iconFont) {
    iconFont.className = iconClass;
    iconFont.style.display = "inline-flex";
    
    // Icon-ke ekdom black korar jonno nichei color set koro
    iconFont.style.color = "#000"; 
    
    // Agger filter gulo muche dao jate shudhu black thake
    iconFont.style.filter = "none"; 
}

}
    } catch (err) {
        console.log("Weather error:", err);
    }
}

getTheWeather();
