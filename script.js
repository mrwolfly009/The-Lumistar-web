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
const currentUser = localStorage.getItem('currentUser') || 'Anonymous';

// Global memory cache to store fixed order between reloads
let sortedNewsKeys = []; 

// 1. Clock Update
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

// 2. Publish function & Image handling
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

    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = new Image();
            img.src = e.target.result;
            img.onload = function() {
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
        const fInput = document.getElementById('fileInput');
        if(fInput) fInput.value = "";
    }).catch(err => console.error("Firebase Error:", err));
}

// 3. Main Render Function (Strict 24h & Reload-only Ranking)
function render() {
    const feed = document.getElementById('newsFeed');
    if (!feed) return;

    const isJournalistPage = window.location.href.toLowerCase().indexOf('journalist') > -1;

    db.ref('news_portal').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            feed.innerHTML = '<p style="text-align:center; padding: 20px;">No news published yet.</p>';
            sortedNewsKeys = [];
            return;
        }

        const newsMap = {};
        const currentList = [];

        for (let key in data) {
            const itemData = data[key];
            
            let upCount = 0;
            let downCount = 0;
            if (itemData.votes) {
                Object.values(itemData.votes).forEach(v => {
                    if (v === 'up') upCount++;
                    if (v === 'down') downCount++;
                });
            }

            const newsItem = { 
                id: key, 
                ...itemData,
                upVotes: upCount,
                downVotes: downCount
            };

            newsMap[key] = newsItem;
            currentList.push(newsItem);
        }

        // --- SORTING LOGIC (Only runs on initial page load / refresh) ---
        if (sortedNewsKeys.length === 0 || currentList.length !== sortedNewsKeys.length) {
            const ONE_DAY = 24 * 60 * 60 * 1000; // 24 Hours in milliseconds
            const now = Date.now();

            currentList.sort((a, b) => {
                const timeA = a.timestamp || 0;
                const timeB = b.timestamp || 0;
                
                const isNewA = (now - timeA) < ONE_DAY;
                const isNewB = (now - timeB) < ONE_DAY;

                // Rule 1: Duitai 24 ghontar modhe hole latest ta age ashbe
                if (isNewA && isNewB) {
                    return timeB - timeA;
                }
                // Rule 2: Ekta 24h er modhe ebong arekta puraton hole, 24h er notun news top-e thakbe
                if (isNewA && !isNewB) return -1;
                if (!isNewA && isNewB) return 1;

                // Rule 3: Duitai 24h er besi puraton hole Upvotes onujayi sort hobe
                if (b.upVotes !== a.upVotes) {
                    return b.upVotes - a.upVotes;
                }

                return timeB - timeA;
            });

            sortedNewsKeys = currentList.map(item => item.id);
        }

        // --- RENDER ITEMS IN FIXED ORDER ---
        feed.innerHTML = '';

        sortedNewsKeys.forEach(id => {
            const item = newsMap[id];
            if (!item) return;

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

            const commentsObj = item.comments || {};
            const commentsList = Object.keys(commentsObj).map(commentId => ({
                id: commentId,
                ...commentsObj[commentId]
            }));

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

                <!-- Voting & Comment Icon Row -->
                <div style="display: flex; align-items: center; gap: 10px; margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 10px;">
                    <button onclick="voteNews('${item.id}', 'up')" 
                            style="background: #e0f2fe; border: 1px solid #0284c7; color: #0284c7; padding: 6px 14px; cursor: pointer; border-radius: 4px; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                        ▲ <span>${item.upVotes}</span>
                    </button>
                    
                    <button onclick="voteNews('${item.id}', 'down')" 
                            style="background: #ffe4e6; border: 1px solid #e11d48; color: #e11d48; padding: 6px 14px; cursor: pointer; border-radius: 4px; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                        ▼ <span>${item.downVotes}</span>
                    </button>

                    <button onclick="toggleCommentSection('${item.id}')" 
                            style="background: #fdfbf7; border: 1px solid #000; color: #000; padding: 6px 14px; cursor: pointer; border-radius: 4px; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-comment"></i> <span>${commentsList.length}</span>
                    </button>
                </div>

                <!-- Retro Style Comment Section -->
                <div id="comment-box-${item.id}" style="margin-top: 15px; background: #fdfbf7; padding: 12px; border: 1px solid #000; box-shadow: 2px 2px 0px rgba(0,0,0,0.8); display: none;">
                    <h4 style="margin: 0 0 10px 0; font-size: 0.85rem; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; font-family: serif;">
                        <i class="fa-solid fa-comment" style="margin-right: 5px;"></i> COMMENTS (${commentsList.length})
                    </h4>
                    
                    <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                        <input type="text" id="comment-input-${item.id}" placeholder="Write a comment as ${currentUser}..." 
                               style="flex: 1; padding: 6px; border: 1px solid #000; background: #fff; font-size: 0.85rem;">
                        <button onclick="addComment('${item.id}')" 
                                style="background: #000; color: #fff; border: 1px solid #000; padding: 6px 12px; cursor: pointer; font-size: 0.8rem; font-weight: bold; text-transform: uppercase;">
                            SEND
                        </button>
                    </div>

                    <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                        ${commentsList.length === 0 ? '<p style="font-size:0.8rem; font-style:italic; color:#555; margin:5px 0;">No comments yet. Be the first one!</p>' : ''}
                        ${commentsList.map(c => {
                            const repliesObj = c.replies || {};
                            const repliesList = Object.values(repliesObj);
                            return `
                                <div style="background: #fff; border: 1px solid #000; padding: 8px;">
                                    <div style="display:flex; justify-content:space-between;">
                                        <strong style="font-size: 0.8rem; color: #000; font-family: serif;">${c.author}:</strong>
                                    </div>
                                    <p style="font-size: 0.85rem; color: #222; margin: 4px 0;">${c.text}</p>
                                    
                                    <div style="margin-left: 15px; margin-top: 6px; display: flex; flex-direction: column; gap: 4px; border-left: 2px solid #ccc; padding-left: 8px;">
                                        ${repliesList.map(r => `
                                            <div style="background: #f9f9f9; border: 1px solid #ddd; padding: 4px 6px;">
                                                <strong style="font-size: 0.75rem; color: #333;">${r.author}:</strong>
                                                <span style="font-size: 0.8rem; color: #444;">${r.text}</span>
                                            </div>
                                        `).join('')}
                                    </div>

                                    <div style="display: flex; gap: 4px; margin-top: 6px;">
                                        <input type="text" id="reply-input-${c.id}" placeholder="Reply to ${c.author}..." 
                                               style="flex: 1; padding: 4px; border: 1px solid #000; background: #fff; font-size: 0.75rem;">
                                        <button onclick="addReply('${item.id}', '${c.id}')" 
                                                style="background: #000; color: #fff; border: 1px solid #000; padding: 4px 8px; cursor: pointer; font-size: 0.7rem; font-weight: bold; text-transform: uppercase;">
                                            REPLY
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
            feed.appendChild(art);
        });
    });
}

// 4. Toggle Comment Section
function toggleCommentSection(newsId) {
    const box = document.getElementById(`comment-box-${newsId}`);
    if (box) {
        if (box.style.display === 'none' || box.style.display === '') {
            box.style.display = 'block';
            box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            box.style.display = 'none';
        }
    }
}

// 5. Vote Action Function
function voteNews(newsId, type) {
    if (!currentUser || currentUser === 'Anonymous') {
        alert("Vote dite prothome login koro!");
        return;
    }

    const voteRef = db.ref(`news_portal/${newsId}/votes/${currentUser}`);

    voteRef.once('value', (snapshot) => {
        const currentVote = snapshot.val();
        if (currentVote === type) {
            voteRef.remove(); 
        } else {
            voteRef.set(type); 
        }
    });
}

// 6. Add Main Comment
function addComment(newsId) {
    const inputField = document.getElementById(`comment-input-${newsId}`);
    if (!inputField) return;

    const commentText = inputField.value.trim();
    if (!commentText) {
        alert("Khali comment kora jabe na!");
        return;
    }

    const commentData = {
        author: currentUser,
        text: commentText,
        timestamp: Date.now()
    };

    db.ref(`news_portal/${newsId}/comments`).push(commentData)
        .then(() => {
            inputField.value = '';
        })
        .catch(err => {
            console.error("Comment error:", err);
            alert("Comment add korte problem hoyeche!");
        });
}

// 7. Add Reply
function addReply(newsId, commentId) {
    const inputField = document.getElementById(`reply-input-${commentId}`);
    if (!inputField) return;

    const replyText = inputField.value.trim();
    if (!replyText) {
        alert("Khali reply kora jabe na!");
        return;
    }

    const replyData = {
        author: currentUser,
        text: replyText,
        timestamp: Date.now()
    };

    db.ref(`news_portal/${newsId}/comments/${commentId}/replies`).push(replyData)
        .then(() => {
            inputField.value = '';
        })
        .catch(err => {
            console.error("Reply error:", err);
            alert("Reply add korte problem hoyeche!");
        });
}

function del(id) {
    if (confirm("Delete this article?")) {
        db.ref('news_portal').child(id).remove();
    }
}

// 8. Breaking News Update
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

// 9. Breaking News Listener
function listenBreaking() {
    const marquee = document.querySelector('.breaking-news-container marquee');
    if (!marquee) return;

    db.ref('breakingNews').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.text) {
            marquee.innerText = `*** ${data.text.toUpperCase()} ***`;
        } else {
            marquee.innerText = "*** THE LUMISTAR: আহামরি সব আজাইরা News এখন আপনার চোখের সামনে  ***";
        }
    });
}

const originalOnload = window.onload;
window.onload = function() {
    console.log("App Started...");
    render();
    setInterval(updateClocks, 1000);
    if (originalOnload) originalOnload();
    listenBreaking();
};

const myKey = "e9fa5ff4c995f29c349050bf3b4f3bc6"; 
const myCity = "Dhaka";

async function getTheWeather() {
    const tempElement = document.getElementById('temp');
    const condElement = document.getElementById('condition');
    const iconFont = document.getElementById('weather-icon-font');

    if (!tempElement) return;

    try {
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${myCity}&appid=${myKey}&units=metric`);
        
        if (res.ok) {
            const weatherData = await res.json();
            tempElement.innerText = Math.round(weatherData.main.temp) + "°C";
            condElement.innerText = weatherData.weather[0].main.toUpperCase();

            const conditionCode = weatherData.weather[0].icon; 
            const isNight = conditionCode.endsWith('n'); 
            let iconClass = "fa-solid fa-cloud"; 

            if (conditionCode.startsWith('01')) {
                iconClass = isNight ? "fa-solid fa-moon" : "fa-solid fa-sun";
            } else if (conditionCode.startsWith('02')) {
                iconClass = isNight ? "fa-solid fa-cloud-moon" : "fa-solid fa-cloud-sun";
            } else if (conditionCode.startsWith('03') || conditionCode.startsWith('04')) {
                iconClass = "fa-solid fa-cloud";
            } else if (conditionCode.startsWith('09') || conditionCode.startsWith('10')) {
                iconClass = isNight ? "fa-solid fa-cloud-moon-rain" : "fa-solid fa-cloud-sun-rain";
            } else if (conditionCode.startsWith('11')) {
                iconClass = "fa-solid fa-cloud-bolt";
            } 
            
            if (iconFont) {
                iconFont.className = iconClass;
                iconFont.style.display = "inline-flex";
                iconFont.style.color = "#000"; 
                iconFont.style.filter = "none"; 
            }
        }
    } catch (err) {
        console.log("Weather error:", err);
    }
}
getTheWeather();
