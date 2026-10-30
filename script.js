// ===== The Lumistar - script.js (v3) =====
// NOTE: auth.js must be loaded BEFORE this file.

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

function lumiStorageGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
}

const currentUser = lumiStorageGet('currentUser') || 'Anonymous';
const journalistRole = lumiStorageGet('journalistRole') || 'junior';
const lumiRole = lumiStorageGet('userRole') || '';
const lumiUserKey = lumiStorageGet('currentUserKey') || currentUser.replace(/[.#$\[\]\/]/g, '_');

const LUMI_LIMITS = { title: 200, content: 10000, comment: 500, reply: 300, breaking: 200, byline: 40 };

// Global memory cache to store fixed order between reloads
let sortedNewsKeys = [];

// ---------- Safety helpers ----------
function escapeHtml(str) {
    const s = (str === null || str === undefined) ? '' : String(str);
    return s.replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
}

function safeImageUrl(url) {
    const u = String(url || '').trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(u)) return u;
    return '';
}

function setBtn(btn, text, disabled) {
    if (!btn) return;
    btn.innerText = text;
    btn.disabled = disabled;
}

// Resize + compress an image file, then call onDone(base64)
function compressImage(file, onDone, onFail) {
    const name = ((file && file.name) || '').toLowerCase();
    const looksLikeImage = file && (/^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/.test(name));
    if (!looksLikeImage) {
        onFail('file type: ' + ((file && file.type) || 'unknown'));
        return;
    }

    function drawAndFinish(img) {
        let out = '';
        try {
            const maxSize = 700;
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;
            if (!width || !height) { onFail('empty image'); return; }

            if (width > height) {
                if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
            } else {
                if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';            // white background for PNG
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            out = canvas.toDataURL('image/jpeg', 0.6);
        } catch (err) {
            onFail('canvas error');
            return;
        }
        onDone(out);
    }

    function viaFileReader() {
        const reader = new FileReader();
        reader.onerror = function () { onFail('file read error'); };
        reader.onload = function (e) {
            const img = new Image();
            img.onerror = function () { onFail('image decode error'); };
            img.onload = function () { drawAndFinish(img); };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Try object URL first (light on phone memory), fall back to FileReader
    let objUrl = null;
    try { objUrl = URL.createObjectURL(file); } catch (e) { objUrl = null; }

    if (objUrl) {
        const img = new Image();
        img.onload = function () { URL.revokeObjectURL(objUrl); drawAndFinish(img); };
        img.onerror = function () { URL.revokeObjectURL(objUrl); viaFileReader(); };
        img.src = objUrl;
    } else {
        viaFileReader();
    }
}

// 1. Clock Update
function updateClocks() {
    const clock1 = document.getElementById('clock1');
    if (!clock1) return;
    const now = new Date();
    clock1.innerText = now.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
}

// 2. Publish news
const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.onchange = function () {
        if (this.files[0]) {
            const cancelImg = document.getElementById('cancelImg');
            if (cancelImg) cancelImg.style.display = 'inline-block';
        }
    };
}

function clearFile() {
    const f = document.getElementById('fileInput');
    if (f) f.value = "";
    const cancelImg = document.getElementById('cancelImg');
    if (cancelImg) cancelImg.style.display = 'none';
}

function publish() {
    if (lumiRole !== 'journalist') {
        alert("❌ Shudhu journalist-ra news publish korte pare!");
        return;
    }

    const t = document.getElementById('tInput').value.trim();
    const iLink = document.getElementById('iInput').value.trim();
    const c = document.getElementById('cInput').value.trim();
    const f = document.getElementById('fileInput');
    const nameInput = document.getElementById('reporterInput');
    const hideCheck = document.getElementById('hideNameCheck');

    if (!t || !c) {
        alert("Headline and details are required!");
        return;
    }
    if (t.length > LUMI_LIMITS.title || c.length > LUMI_LIMITS.content) {
        alert("Headline ba details onek boro hoye geche!");
        return;
    }

    // Byline: hidden -> no name | typed name | login name
    let byline = currentUser;
    if (hideCheck && hideCheck.checked) {
        byline = '';
    } else if (nameInput && nameInput.value.trim()) {
        byline = nameInput.value.trim();
    }
    if (byline.length > LUMI_LIMITS.byline) {
        alert("Reporter-er nam " + LUMI_LIMITS.byline + " okkhorer moddhe rakho!");
        return;
    }

    const publishBtn = document.querySelector('button[onclick="publish()"]');
    const originalText = publishBtn ? publishBtn.innerText : "PUBLISH NEWS";
    setBtn(publishBtn, "PUBLISHING...", true);

    if (f && f.files && f.files[0]) {
        compressImage(f.files[0], function (base64) {
            saveToFirebase(byline, t, base64, c, publishBtn, originalText);
        }, function (reason) {
            alert("Image-ta porte pari ni (" + reason + "). Abar select koro ba image chhara publish koro.");
            setBtn(publishBtn, originalText, false);
        });
    } else {
        saveToFirebase(byline, t, safeImageUrl(iLink), c, publishBtn, originalText);
    }
}

function saveToFirebase(reporter, title, imgSource, content, btnElement, originalText) {
    db.ref('news_portal').push({
        reporter: reporter,          // name shown on the page ('' = hidden)
        authorKey: lumiUserKey,      // real writer, used for delete protection
        authorName: currentUser,
        title: title,
        img: imgSource,
        content: content,
        date: new Date().toLocaleDateString('en-GB'),
        timestamp: Date.now()
    }).then(function () {
        alert("News Published Successfully!");
        document.getElementById('tInput').value = "";
        document.getElementById('iInput').value = "";
        document.getElementById('cInput').value = "";
        clearFile();
        setBtn(btnElement, originalText, false);
    }).catch(function (err) {
        console.error("Firebase Error:", err);
        alert("Publish korte somossa hoyeche. Abar chesta korun!");
        setBtn(btnElement, originalText, false);
    });
}

// --- ADS UPLOAD (Admin Only) ---
const adFileInput = document.getElementById('adFileInput');
if (adFileInput) {
    adFileInput.onchange = function () {
        if (this.files[0]) {
            const cancelAdImg = document.getElementById('cancelAdImg');
            if (cancelAdImg) cancelAdImg.style.display = 'inline-block';
        }
    };
}

function clearAdFile() {
    const f = document.getElementById('adFileInput');
    if (f) f.value = "";
    const cancelAdImg = document.getElementById('cancelAdImg');
    if (cancelAdImg) cancelAdImg.style.display = 'none';
}

function publishAd() {
    if (typeof isAdmin !== 'function' || !isAdmin()) {
        alert("❌ Apnar ad upload korar permission nei! Shudhu Admin parbe.");
        return;
    }

    const title = document.getElementById('adTitleInput').value.trim();
    const link = document.getElementById('adImageInput').value.trim();
    const f = document.getElementById('adFileInput');

    if ((!f || !f.files[0]) && !link) {
        alert("Please provide an image URL or upload an ad image!");
        return;
    }

    const uploadBtn = document.querySelector('button[onclick="publishAd()"]');
    const originalText = uploadBtn ? uploadBtn.innerText : "UPLOAD AD";
    setBtn(uploadBtn, "UPLOADING AD...", true);

    if (f && f.files && f.files[0]) {
        compressImage(f.files[0], function (base64) {
            saveAdToFirebase(title, base64, uploadBtn, originalText);
        }, function (reason) {
            alert("Ad image-ta porte pari ni (" + reason + "). Onno image dao.");
            setBtn(uploadBtn, originalText, false);
        });
    } else {
        const safeLink = safeImageUrl(link);
        if (!safeLink) {
            alert("Image link ta https:// diye shuru hote hobe!");
            setBtn(uploadBtn, originalText, false);
            return;
        }
        saveAdToFirebase(title, safeLink, uploadBtn, originalText);
    }
}

function saveAdToFirebase(title, imgSrc, btnElement, originalText) {
    db.ref('portal_ads').push({
        title: title,
        img: imgSrc,
        timestamp: Date.now()
    }).then(function () {
        alert("Ad Uploaded Successfully!");
        document.getElementById('adTitleInput').value = "";
        document.getElementById('adImageInput').value = "";
        clearAdFile();
        setBtn(btnElement, originalText, false);
    }).catch(function (err) {
        console.error("Ad Upload Error:", err);
        alert("Ad upload korte somossa hoyeche!");
        setBtn(btnElement, originalText, false);
    });
}

// Ads rotation and countdown (one timer only)
const AD_SECONDS = 15;
let adsList = [];
let currentAdIndex = 0;
let adTimer = null;
let adTimeLeft = AD_SECONDS;

function updateAdCountdown() {
    const counterElem = document.getElementById('adCountdown');
    if (counterElem) counterElem.innerText = adTimeLeft + 's';
}

function initAdsRotation() {
    const bannerContainer = document.getElementById('adBannerContainer');
    if (!bannerContainer) return;

    db.ref('portal_ads').on('value', function (snapshot) {
        const data = snapshot.val();
        adsList = data ? Object.values(data) : [];

        if (adTimer) { clearInterval(adTimer); adTimer = null; }

        if (adsList.length === 0) {
            bannerContainer.style.display = 'none';
            return;
        }

        if (currentAdIndex >= adsList.length) currentAdIndex = 0;
        bannerContainer.style.display = 'block';
        showCurrentAd();

        if (adsList.length > 1) {
            adTimer = setInterval(function () {
                adTimeLeft--;
                if (adTimeLeft <= 0) {
                    currentAdIndex = (currentAdIndex + 1) % adsList.length;
                    showCurrentAd();
                } else {
                    updateAdCountdown();
                }
            }, 1000);
        }
    });
}

function showCurrentAd() {
    const wrapper = document.getElementById('adContentWrapper');
    if (!wrapper || adsList.length === 0) return;

    adTimeLeft = AD_SECONDS;
    updateAdCountdown();

    const ad = adsList[currentAdIndex] || {};
    const adImg = safeImageUrl(ad.img);

    wrapper.innerHTML = `
        ${adImg ? `<img src="${escapeHtml(adImg)}" style="width: 100%; max-height: 350px; object-fit: cover; border: 1px solid #000; margin-bottom: 5px;">` : ''}
        ${ad.title ? `<p style="font-size:0.85rem; font-family:serif; margin:0; font-style:italic;">$ --- sponsored by ${escapeHtml(ad.title)} --- (ads)</p>` : ''}
    `;
}

// 3. Who can delete a news item?
function canDelete(item) {
    if (lumiRole !== 'journalist') return false;
    if (item.authorKey) return canDeleteNews(item.authorKey);        // from auth.js
    // Old posts without authorKey: Admin (if allowed) or same name
    if (ADMIN_CAN_DELETE_ALL && isAdmin()) return true;
    return item.reporter === currentUser;
}

// Keep open comment boxes + typed text when the feed refreshes
function captureUiState() {
    const openBoxes = [];
    const inputs = {};
    document.querySelectorAll('#newsFeed [id^="comment-box-"]').forEach(function (box) {
        if (box.style.display === 'block') openBoxes.push(box.id);
    });
    document.querySelectorAll('#newsFeed input[type="text"]').forEach(function (inp) {
        if (inp.id && inp.value) inputs[inp.id] = inp.value;
    });
    const active = document.activeElement && document.activeElement.id ? document.activeElement.id : '';
    return { openBoxes: openBoxes, inputs: inputs, active: active };
}

function restoreUiState(state) {
    state.openBoxes.forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
    });
    Object.keys(state.inputs).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.value = state.inputs[id];
    });
    if (state.active) {
        const el = document.getElementById(state.active);
        if (el && el.focus) el.focus();
    }
}

// 4. Main Render Function
function render() {
    const feed = document.getElementById('newsFeed');
    if (!feed) return;

    const isJournalistPage = !!document.getElementById('tInput');

    db.ref('news_portal').on('value', function (snapshot) {
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
                Object.values(itemData.votes).forEach(function (v) {
                    if (v === 'up') upCount++;
                    if (v === 'down') downCount++;
                });
            }

            const newsItem = Object.assign({ id: key }, itemData, { upVotes: upCount, downVotes: downCount });
            newsMap[key] = newsItem;
            currentList.push(newsItem);
        }

        // Re-sort only when the set of news changed
        const sameKeys = sortedNewsKeys.length === currentList.length &&
            sortedNewsKeys.every(function (k) { return !!newsMap[k]; });

        if (!sameKeys) {
            const ONE_DAY = 24 * 60 * 60 * 1000;
            const now = Date.now();

            currentList.sort(function (a, b) {
                const timeA = a.timestamp || 0;
                const timeB = b.timestamp || 0;
                const isNewA = (now - timeA) < ONE_DAY;
                const isNewB = (now - timeB) < ONE_DAY;

                if (isNewA && isNewB) return timeB - timeA;
                if (isNewA && !isNewB) return -1;
                if (!isNewA && isNewB) return 1;
                if (b.upVotes !== a.upVotes) return b.upVotes - a.upVotes;
                return timeB - timeA;
            });

            sortedNewsKeys = currentList.map(function (item) { return item.id; });
        }

        const uiState = captureUiState();
        feed.innerHTML = '';

        sortedNewsKeys.forEach(function (id) {
            const item = newsMap[id];
            if (!item) return;

            const safeId = escapeHtml(item.id);
            const art = document.createElement('article');
            art.className = 'news-item';

            // Delete button (own posts only; Admin can delete all)
            let delBtn = '';
            if (isJournalistPage) {
                if (canDelete(item)) {
                    delBtn = `<button onclick="del('${safeId}')" style="background:none; border:1px solid #000; cursor:pointer; font-weight:bold; color:red;">[X]</button>`;
                } else {
                    delBtn = `<span style="font-size:0.7rem; font-style:italic; color:#666;">(Protected)</span>`;
                }
            }

            // Drop cap
            const content = String(item.content || '');
            let firstLetter = content.charAt(0);
            let restOfContent = content.slice(1);
            const banglaKar = /^[\u09BE-\u09CC\u09D7]/;
            if (restOfContent.length > 0 && banglaKar.test(restOfContent.charAt(0))) {
                firstLetter += restOfContent.charAt(0);
                restOfContent = restOfContent.slice(1);
            }
            const restHtml = escapeHtml(restOfContent).replace(/\n/g, '<br>');

            const imgSrc = safeImageUrl(item.img);
            const reporterHtml = item.reporter
                ? `<div style="text-align: right; font-size: 0.8rem; font-style: italic; font-weight: bold; margin-top: 10px;">-- Reported by ${escapeHtml(item.reporter)}</div>`
                : '';

            const commentsObj = item.comments || {};
            const commentsList = Object.keys(commentsObj).map(function (commentId) {
                return Object.assign({ id: commentId }, commentsObj[commentId]);
            });

            art.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-family:serif; text-transform: uppercase;">${escapeHtml(item.title)}</h2>
                    ${delBtn}
                </div>
                <p style="text-align:right; font-size:0.8rem; margin:5px 0; font-style: italic;">Pub: ${escapeHtml(item.date || '')}</p>
                ${imgSrc ? `<img src="${escapeHtml(imgSrc)}" loading="lazy" style="width:100%; border:1px solid #000; margin:10px 0;">` : ''}
                <p style="text-align:justify; line-height:1.6; font-size: 1.05rem;">
                    <span class="drop-cap">${escapeHtml(firstLetter)}</span>${restHtml}
                </p>
                ${reporterHtml}

                <div style="display: flex; align-items: center; gap: 10px; margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 10px;">
                    <button onclick="voteNews('${safeId}', 'up')" style="background: #e0f2fe; border: 1px solid #0284c7; color: #0284c7; padding: 6px 14px; cursor: pointer; border-radius: 4px; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                        ▲ <span>${item.upVotes}</span>
                    </button>
                    <button onclick="voteNews('${safeId}', 'down')" style="background: #ffe4e6; border: 1px solid #e11d48; color: #e11d48; padding: 6px 14px; cursor: pointer; border-radius: 4px; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                        ▼ <span>${item.downVotes}</span>
                    </button>
                    <button onclick="toggleCommentSection('${safeId}')" style="background: #fdfbf7; border: 1px solid #000; color: #000; padding: 6px 14px; cursor: pointer; border-radius: 4px; font-weight: bold; display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-comment"></i> <span>${commentsList.length}</span>
                    </button>
                </div>

                <div id="comment-box-${safeId}" style="margin-top: 15px; background: #fdfbf7; padding: 12px; border: 1px solid #000; box-shadow: 2px 2px 0px rgba(0,0,0,0.8); display: none;">
                    <h4 style="margin: 0 0 10px 0; font-size: 0.85rem; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 5px; font-family: serif;">
                        <i class="fa-solid fa-comment" style="margin-right: 5px;"></i> COMMENTS (${commentsList.length})
                    </h4>

                    <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                        <input type="text" id="comment-input-${safeId}" maxlength="${LUMI_LIMITS.comment}" placeholder="Write a comment as ${escapeHtml(currentUser)}..." style="flex: 1; padding: 6px; border: 1px solid #000; background: #fff; font-size: 0.85rem;">
                        <button onclick="addComment('${safeId}')" style="background: #000; color: #fff; border: 1px solid #000; padding: 6px 12px; cursor: pointer; font-size: 0.8rem; font-weight: bold; text-transform: uppercase;">SEND</button>
                    </div>

                    <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                        ${commentsList.length === 0 ? '<p style="font-size:0.8rem; font-style:italic; color:#555; margin:5px 0;">No comments yet. Be the first one!</p>' : ''}
                        ${commentsList.map(function (c) {
                            const safeCid = escapeHtml(c.id);
                            const repliesList = Object.values(c.replies || {});
                            return `
                                <div style="background: #fff; border: 1px solid #000; padding: 8px;">
                                    <strong style="font-size: 0.8rem; color: #000; font-family: serif;">${escapeHtml(c.author)}:</strong>
                                    <p style="font-size: 0.85rem; color: #222; margin: 4px 0;">${escapeHtml(c.text)}</p>

                                    <div style="margin-left: 15px; margin-top: 6px; display: flex; flex-direction: column; gap: 4px; border-left: 2px solid #ccc; padding-left: 8px;">
                                        ${repliesList.map(function (r) {
                                            return `
                                            <div style="background: #f9f9f9; border: 1px solid #ddd; padding: 4px 6px;">
                                                <strong style="font-size: 0.75rem; color: #333;">${escapeHtml(r.author)}:</strong>
                                                <span style="font-size: 0.8rem; color: #444;">${escapeHtml(r.text)}</span>
                                            </div>`;
                                        }).join('')}
                                    </div>

                                    <div style="display: flex; gap: 4px; margin-top: 6px;">
                                        <input type="text" id="reply-input-${safeCid}" maxlength="${LUMI_LIMITS.reply}" placeholder="Reply to ${escapeHtml(c.author)}..." style="flex: 1; padding: 4px; border: 1px solid #000; background: #fff; font-size: 0.75rem;">
                                        <button onclick="addReply('${safeId}', '${safeCid}')" style="background: #000; color: #fff; border: 1px solid #000; padding: 4px 8px; cursor: pointer; font-size: 0.7rem; font-weight: bold; text-transform: uppercase;">REPLY</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
            feed.appendChild(art);
        });

        restoreUiState(uiState);
    });
}

function toggleCommentSection(newsId) {
    const box = document.getElementById('comment-box-' + newsId);
    if (!box) return;
    if (box.style.display === 'none' || box.style.display === '') {
        box.style.display = 'block';
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        box.style.display = 'none';
    }
}

function voteNews(newsId, type) {
    if (!currentUser || currentUser === 'Anonymous' || !lumiUserKey) {
        alert("Vote dite prothome login koro!");
        return;
    }

    const voteRef = db.ref('news_portal/' + newsId + '/votes/' + lumiUserKey);

    voteRef.once('value').then(function (snapshot) {
        if (snapshot.val() === type) {
            return voteRef.remove();
        }
        return voteRef.set(type);
    }).catch(function (err) {
        console.error("Vote error:", err);
        alert("Vote korte somossa hoyeche!");
    });
}

function addComment(newsId) {
    const inputField = document.getElementById('comment-input-' + newsId);
    if (!inputField) return;

    if (!currentUser || currentUser === 'Anonymous') {
        alert("Comment korte prothome login koro!");
        return;
    }

    const commentText = inputField.value.trim();
    if (!commentText) {
        alert("Khali comment kora jabe na!");
        return;
    }
    if (commentText.length > LUMI_LIMITS.comment) {
        alert("Comment onek boro!");
        return;
    }

    db.ref('news_portal/' + newsId + '/comments').push({
        author: currentUser,
        text: commentText,
        timestamp: Date.now()
    }).then(function () {
        inputField.value = '';
    }).catch(function (err) {
        console.error("Comment error:", err);
        alert("Comment korte somossa hoyeche!");
    });
}

function addReply(newsId, commentId) {
    const inputField = document.getElementById('reply-input-' + commentId);
    if (!inputField) return;

    if (!currentUser || currentUser === 'Anonymous') {
        alert("Reply korte prothome login koro!");
        return;
    }

    const replyText = inputField.value.trim();
    if (!replyText) {
        alert("Khali reply kora jabe na!");
        return;
    }
    if (replyText.length > LUMI_LIMITS.reply) {
        alert("Reply onek boro!");
        return;
    }

    db.ref('news_portal/' + newsId + '/comments/' + commentId + '/replies').push({
        author: currentUser,
        text: replyText,
        timestamp: Date.now()
    }).then(function () {
        inputField.value = '';
    }).catch(function (err) {
        console.error("Reply error:", err);
        alert("Reply korte somossa hoyeche!");
    });
}

// Protected Delete: own posts only (Admin can delete all)
function del(id) {
    db.ref('news_portal/' + id).once('value').then(function (snapshot) {
        const post = snapshot.val();
        if (!post) return;

        if (!canDelete(post)) {
            alert("❌ Apni onno journalist-er post delete korte parben na!");
            return;
        }

        if (confirm("Are you sure you want to delete this article?")) {
            return db.ref('news_portal/' + id).remove();
        }
    }).catch(function (err) {
        console.error("Delete error:", err);
        alert("Delete korte somossa hoyeche!");
    });
}

// Breaking News Update (Admin Only)
function updateBreaking() {
    if (typeof isAdmin !== 'function' || !isAdmin()) {
        alert("❌ Apnar breaking news update korar permission nei! Shudhu Admin parbe.");
        return;
    }

    const text = document.getElementById('breakingInput').value.trim();
    if (!text) {
        alert("Oi! Breaking news text kothay?");
        return;
    }
    if (text.length > LUMI_LIMITS.breaking) {
        alert("Breaking news onek boro!");
        return;
    }

    db.ref('breakingNews').set({
        text: text,
        timestamp: Date.now()
    }).then(function () {
        alert("Breaking News Updated!");
        document.getElementById('breakingInput').value = "";
    }).catch(function (err) {
        console.error("Breaking error:", err);
        alert("Breaking news update korte somossa hoyeche!");
    });
}

function listenBreaking() {
    const marquee = document.querySelector('.breaking-news-container marquee');
    if (!marquee) return;

    db.ref('breakingNews').on('value', function (snapshot) {
        const data = snapshot.val();
        if (data && data.text) {
            marquee.innerText = '*** ' + String(data.text).toUpperCase() + ' ***';
        } else {
            marquee.innerText = "*** THE LUMISTAR: আহামরি সব আজাইরা News এখন আপনার চোখের সামনে  ***";
        }
    });
}

// 5. Weather
const WEATHER_API_KEY = "e9fa5ff4c995f29c349050bf3b4f3bc6";
const WEATHER_CITY = "Dhaka";
const WEATHER_ICONS = {
    Clear: 'fa-sun',
    Clouds: 'fa-cloud',
    Rain: 'fa-cloud-rain',
    Drizzle: 'fa-cloud-rain',
    Thunderstorm: 'fa-bolt',
    Snow: 'fa-snowflake',
    Mist: 'fa-smog',
    Haze: 'fa-smog',
    Fog: 'fa-smog',
    Smoke: 'fa-smog',
    Dust: 'fa-smog'
};

async function getTheWeather() {
    const tempElement = document.getElementById('temp');
    const condElement = document.getElementById('condition');
    const iconFont = document.getElementById('weather-icon-font');

    if (!tempElement) return;

    try {
        const res = await fetch('https://api.openweathermap.org/data/2.5/weather?q=' + WEATHER_CITY + '&appid=' + WEATHER_API_KEY + '&units=metric');
        if (!res.ok) return;

        const weatherData = await res.json();
        const main = (weatherData.weather && weatherData.weather[0] && weatherData.weather[0].main) || '';

        tempElement.innerText = Math.round(weatherData.main.temp) + "°C";
        if (condElement) condElement.innerText = main.toUpperCase();
        if (iconFont) iconFont.className = 'fa-solid ' + (WEATHER_ICONS[main] || 'fa-cloud');
    } catch (err) {
        console.log("Weather error:", err);
    }
}

// 6. Start everything
const originalOnload = window.onload;
window.onload = function () {
    console.log("App Started...");
    render();
    initAdsRotation();
    updateClocks();
    setInterval(updateClocks, 1000);
    listenBreaking();
    getTheWeather();
    setInterval(getTheWeather, 30 * 60 * 1000);
    if (originalOnload) originalOnload();
};
