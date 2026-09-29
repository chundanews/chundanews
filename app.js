const ADMIN_UID = 'q9yvlsTLBtYgdii6QQjTeGkb4rv2';

    const UPLOAD_WORKER_URL = 'https://chunda-image-upload.ashokvvaishn.workers.dev';

    async function uploadToImgBB(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                try {
                    if (!auth.currentUser) {
                        reject(new Error('Admin login zaroori hai upload ke liye'));
                        return;
                    }
                    const idToken = await auth.currentUser.getIdToken();

                    const base64Data = reader.result.split(',')[1];
                    const formData = new FormData();
                    formData.append("image", base64Data);

                    const response = await fetch(UPLOAD_WORKER_URL, {
                        method: "POST",
                        headers: { "Authorization": "Bearer " + idToken },
                        body: formData
                    });

                    const result = await response.json();
                    if (result && result.success && result.data && result.data.url) {
                        resolve(result.data.url);
                    } else {
                        reject(new Error(result.error?.message || result.error || "Upload failed"));
                    }
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (error) => reject(error);
        });
    }

    function escapeHTML(str) {
        if (!str && str !== 0) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    }

    function sanitizeUrlRaw(url) {
        if (!url) return '';
        const trimmed = String(url).trim();
        if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('data:image/')) {
            return trimmed;
        }
        return '';
    }

    function sanitizeUrl(url) {
        const safe = sanitizeUrlRaw(url);
        return safe || '';
    }

    function sanitizeNewsHtml(html) {
        if (!html) return '';
        if (window.DOMPurify) {
            return DOMPurify.sanitize(String(html), {
                ALLOWED_TAGS: ['p','br','strong','b','em','i','u','ul','ol','li','h2','h3','blockquote','a'],
                ALLOWED_ATTR: ['href','target','rel'],
                FORBID_ATTR: ['style','class','id','onclick','onerror','onload']
            });
        }
        return escapeHTML(String(html)).replace(/\n/g, '<br>');
    }

    function htmlToPlainText(html) {
        const div = document.createElement('div');
        div.innerHTML = sanitizeNewsHtml(html);
        return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
    }

    function timestampToMillis(value) {
        if (!value) return 0;
        if (typeof value === 'number') return value;
        if (typeof value.toMillis === 'function') return value.toMillis();
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function normalizeDoc(doc) {
        const data = doc.data() || {};
        return {
            id: doc.id,
            ...data,
            createdAt: timestampToMillis(data.createdAt) || timestampToMillis(data.timestamp),
            timestamp: timestampToMillis(data.timestamp) || timestampToMillis(data.createdAt)
        };
    }

    function safeNewsId(id) {
        return String(id || '').trim();
    }

    function loadAnalytics() {
        if (window.__cknAnalyticsLoaded) return;
        window.__cknAnalyticsLoaded = true;
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=G-N7CHP0LVYX';
        document.head.appendChild(script);
        window.dataLayer = window.dataLayer || [];
        window.gtag = function(){ window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', 'G-N7CHP0LVYX', { anonymize_ip: true });
    }

    function checkCookieConsent() {
        if (localStorage.getItem("ckn_cookies_accepted") !== "true") {
            setTimeout(() => {
                const banner = document.getElementById('cookie-consent-banner');
                if (banner) banner.style.display = 'block';
            }, 1000);
        }
    }

    function acceptCookies() {
        localStorage.setItem("ckn_cookies_accepted", "true");
        loadAnalytics();
        const banner = document.getElementById('cookie-consent-banner');
        if (banner) banner.style.display = 'none';
    }

    const firebaseConfig = {
        apiKey: "AIzaSyBbfgRnpUo4BYquhX2sBAyok2WX3fsfnMM",
        authDomain: "chunda-news.firebaseapp.com",
        projectId: "chunda-news",
        storageBucket: "chunda-news.firebasestorage.app",
        messagingSenderId: "872760222820",
        appId: "1:872760222820:web:5e316ef1eb27d5a7046b71",
        measurementId: "G-N7CHP0LVYX"
    };

    firebase.initializeApp(firebaseConfig);

    // App Check is disabled to avoid token verification issues
    const ENABLE_APP_CHECK = false;
    const RECAPTCHA_SITE_KEY = '6LclU7AtAAAAANtGTXOZ3Ob0Z5uJmFS3pLMbrmD2';

    let appCheckReady = Promise.resolve();

    function initFirebaseAppCheck() {
        if (!ENABLE_APP_CHECK) return Promise.resolve();
        try {
            const provider = new firebase.appCheck.ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY);
            const appCheck = firebase.appCheck();
            appCheck.activate(provider, true);
            return Promise.resolve();
        } catch (err) {
            console.warn("App Check:", err);
            return Promise.resolve();
        }
    }

    if (ENABLE_APP_CHECK) {
        appCheckReady = new Promise(resolve => {
            const start = () => {
                try {
                    if (typeof grecaptcha !== 'undefined' && grecaptcha.enterprise) {
                        grecaptcha.enterprise.ready(() => {
                            initFirebaseAppCheck().finally(resolve);
                        });
                    } else {
                        initFirebaseAppCheck().finally(resolve);
                    }
                } catch (e) {
                    resolve();
                }
            };
            if (document.readyState === 'loading') {
                window.addEventListener('load', start, { once: true });
            } else {
                start();
            }
        });
    }

    const db = firebase.firestore();
    const auth = firebase.auth();

    try {
        db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    } catch (e) {}

    let messaging = null;
    async function getMessagingSafe() {
        if (messaging) return messaging;
        try {
            if (!firebase.messaging || typeof firebase.messaging.isSupported !== 'function') return null;
            const supported = await firebase.messaging.isSupported();
            if (!supported) return null;
            messaging = firebase.messaging();
            return messaging;
        } catch (err) {
            console.warn('Messaging disabled:', err);
            return null;
        }
    }

    let isAdminLoggedIn = false;
    let newsList = [];
    let currentCategory = 'all';
    let leadNewsItem = null;

    async function fetchLiveWeather() {
        const weatherElement = document.getElementById('live-weather-display');
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=24.5858&longitude=73.7125&current=temperature_2m,weather_code&timezone=Asia%2FKolkata';
        const labels = {0:'साफ मौसम',1:'मुख्यतः साफ',2:'आंशिक बादल',3:'बादल',45:'कोहरा',48:'कोहरा',51:'हल्की बूंदाबांदी',53:'बूंदाबांदी',55:'बूंदाबांदी',61:'हल्की बारिश',63:'बारिश',65:'तेज़ बारिश',80:'बारिश की बौछार',81:'बारिश की बौछार',82:'तेज़ बौछार',95:'गरज के साथ बारिश',96:'ओलावृष्टि संभव',99:'ओलावृष्टि संभव'};
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error('Weather request failed');
            const data = await response.json();
            const temp = Math.round(data.current.temperature_2m);
            const description = labels[data.current.weather_code] || 'मौसम उपलब्ध';
            if (weatherElement) weatherElement.innerHTML = `<i class="fa-solid fa-cloud-sun text-amber-400 mr-1"></i> उदयपुर: ${temp}°C (${escapeHTML(description)})`;
        } catch (error) {
            if (weatherElement) weatherElement.innerHTML = '<i class="fa-solid fa-cloud-sun text-amber-400 mr-1"></i> उदयपुर: मौसम उपलब्ध नहीं';
        }
    }

    function toggleDarkMode() {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    }
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.classList.add('dark');
    }

    function openPortalModal(id) {
        const m = document.getElementById(id);
        if (m) { m.style.display = 'flex'; document.body.style.overflow = 'hidden'; m.setAttribute('aria-hidden', 'false'); }
    }

    function closePortalModal(id) {
        const m = document.getElementById(id);
        if (m) { m.style.display = 'none'; m.setAttribute('aria-hidden', 'true'); }
        if (!document.querySelector('.portal-modal[style*="display: flex"]')) document.body.style.overflow = '';
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModal = Array.from(document.querySelectorAll('.portal-modal')).find(m => getComputedStyle(m).display === 'flex');
            if (openModal) closePortalModal(openModal.id);
        }
    });

    window.onscroll = function() {
        let winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        let height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        let scrolled = (height > 0) ? (winScroll / height) * 100 : 0;
        document.getElementById("scroll-progress").style.width = scrolled + "%";
    };

    function updateLivePanchang() {
        const d = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('live-panchang').innerHTML = `<i class="fa-regular fa-calendar-days text-red-500 mr-1"></i> ${escapeHTML(d.toLocaleDateString('hi-IN', options))}`;
    }
    updateLivePanchang();

    function startAiVoiceBulletin() {
        if (!('speechSynthesis' in window)) {
            alert("आपके ब्राउज़र में AI वॉइस सपोर्ट उपलब्ध नहीं है।");
            return;
        }
        window.speechSynthesis.cancel();
        let speechText = "चूंडा क्षेत्र न्यूज़ पर आज की मुख्य सुर्खियां। ";
        if (leadNewsItem) speechText += "प्रमुख समाचार: " + leadNewsItem.title + "। ";
        const headlines = newsList.slice(0, 4).map(n => n.title).join("। ");
        speechText += headlines ? ("अन्य मुख्य खबरें: " + headlines) : "अन्य खबरें लोड हो रही हैं।";

        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = 'hi-IN';
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
    }

    function startReporterVoiceInput() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("वॉइस टाइपिंग केवल Chrome/Edge ब्राउज़र में समर्थित है।");
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'hi-IN';
        recognition.start();
        recognition.onresult = function(event) {
            document.getElementById('news-reporter').value = event.results[0][0].transcript;
        };
    }

    function copyNewsLink(id) {
        const safeId = safeNewsId(id);
        const shareLink = `${window.location.origin}/article.html?id=${encodeURIComponent(safeId)}`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareLink).then(() => {
                alert("📋 खबर का लिंक सफलतापूर्वक कॉपी हो गया!");
            }).catch(() => fallbackCopyText(shareLink));
        } else {
            fallbackCopyText(shareLink);
        }
    }

    function fallbackCopyText(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            alert("📋 खबर का लिंक कॉपी हो गया!");
        } catch (err) {
            alert("लिंक कॉपी करने में असमर्थ।");
        }
        document.body.removeChild(textArea);
    }

    function openReaderModal(id) {
        const safeId = safeNewsId(id);
        if (!safeId) return;
        window.location.href = `article.html?id=${encodeURIComponent(safeId)}`;
    }

    function renderNews(list) {
        const container = document.getElementById('news-container');
        const safeList = Array.isArray(list) ? list.filter(item => item && typeof item === 'object') : [];
        const countEl = document.getElementById('news-count');
        if (countEl) countEl.textContent = `${safeList.length} खबरें`;

        if (!container) return;
        if (!safeList.length) {
            container.innerHTML = `<div class="col-span-full text-center py-12 text-gray-500 bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-800">इस श्रेणी या दिनांक में कोई खबर उपलब्ध नहीं है।</div>`;
            return;
        }

        container.innerHTML = safeList.map(item => {
            try {
                const id = String(item.id || '').trim();
                if (!id) return '';

                const title = String(item.title || 'बिना शीर्षक');
                const category = String(item.category || 'सामान्य');
                const date = String(item.date || 'आज');
                const rawImg = Array.isArray(item.images) && item.images.length
                    ? item.images[0]
                    : (item.image || '');
                let displayImg = 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800';
                try { displayImg = sanitizeUrl(rawImg) || displayImg; } catch (e) {}

                let plainText = '';
                try {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = sanitizeNewsHtml(String(item.content || ''));
                    plainText = tempDiv.textContent || tempDiv.innerText || '';
                } catch (e) {
                    plainText = String(item.content || '').replace(/<[^>]*>/g, ' ');
                }

                const safeId = escapeHTML(id);
                return `
                <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col justify-between group">
                    <div>
                        <div class="aspect-video w-full bg-gray-100 dark:bg-gray-800 overflow-hidden relative">
                            <img src="${displayImg}" width="400" height="225" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500 cursor-pointer" onclick="openReaderModal('${safeId}')" onerror="this.src='https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800'">
                            <span class="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow uppercase tracking-wide">
                                ${escapeHTML(category)}
                            </span>
                        </div>
                        <div class="p-5">
                            <div class="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 mb-2 font-medium">
                                <i class="fa-regular fa-clock text-red-500"></i> <span>${escapeHTML(date)}</span>
                                <span>•</span>
                                <span class="text-red-600 font-bold">CKN Desk</span>
                            </div>
                            <h3 class="font-bold text-base text-gray-900 dark:text-white line-clamp-2 group-hover:text-red-600 transition cursor-pointer leading-snug" onclick="openReaderModal('${safeId}')">
                                ${escapeHTML(title)}
                            </h3>
                            <p class="text-xs text-gray-600 dark:text-gray-400 mt-2.5 line-clamp-2 leading-relaxed">${escapeHTML(plainText)}</p>
                        </div>
                    </div>
                    <div class="px-5 pb-5 pt-0">
                        <div class="flex justify-between items-center text-xs pt-3 border-t border-gray-100 dark:border-gray-800">
                            <button onclick="openReaderModal('${safeId}')" class="text-red-600 hover:text-red-700 font-bold flex items-center gap-1">
                                विस्तार से पढ़ें <i class="fa-solid fa-arrow-right text-[10px]"></i>
                            </button>
                            <div class="flex gap-2.5">
                                <button onclick="copyNewsLink('${safeId}')" class="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:text-red-600 transition" title="लिंक कॉपी करें">
                                    <i class="fa-solid fa-copy"></i>
                                </button>
                                <button onclick="shareWhatsAppWithImage('${safeId}')" class="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 hover:bg-emerald-100 transition" title="व्हाट्सएप पर शेयर करें">
                                    <i class="fa-solid fa-share-nodes"></i>
                                </button>
                            </div>
                        </div>
                        ${isAdminLoggedIn ? `
                            <div class="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                                <button onclick="editNewsPost('${safeId}')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-[11px] font-semibold flex-1 transition">एडिट</button>
                                <button onclick="deleteNewsPost('${safeId}')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-[11px] font-semibold flex-1 transition">डिलीट</button>
                            </div>
                        ` : ''}
                    </div>
                </div>`;
            } catch (itemErr) {
                console.warn('Skipping malformed news item:', itemErr, item);
                return '';
            }
        }).join('');
    }

    function setLeadStory(item) {
        if (!item || typeof item !== 'object') return;
        try {
            leadNewsItem = item;
            document.getElementById('lead-news-section').classList.remove('hidden');
            document.getElementById('lead-title').innerText = String(item.title || '');
            document.getElementById('lead-category').innerText = String(item.category || 'प्रमुख');
            document.getElementById('lead-reporter').innerText = String(item.reporter || 'विशेष संवाददाता');
            document.getElementById('lead-date').innerText = String(item.date || 'आज');

            const tempDiv = document.createElement('div');
            try { tempDiv.innerHTML = sanitizeNewsHtml(String(item.content || '')); }
            catch (e) { tempDiv.textContent = String(item.content || ''); }
            document.getElementById('lead-excerpt').innerText = tempDiv.textContent || tempDiv.innerText || '';

            const rawLeadImg = Array.isArray(item.images) && item.images.length ? item.images[0] : (item.image || '');
            let leadImg = 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800';
            try { leadImg = sanitizeUrl(rawLeadImg) || leadImg; } catch (e) {}
            document.getElementById('lead-image').src = leadImg;
            document.getElementById('lead-read-btn').onclick = () => openReaderModal(item.id);
            document.getElementById('lead-copy-btn').onclick = () => copyNewsLink(item.id);
            document.getElementById('lead-share-btn').onclick = () => shareWhatsAppWithImage(item.id);
        } catch (err) {
            console.warn('Lead story render skipped:', err);
        }
    }

    function openLeadModal() {
        if (leadNewsItem) openReaderModal(leadNewsItem.id);
    }

    async function shareWhatsAppWithImage(id) {
        const item = (leadNewsItem && leadNewsItem.id === id) ? leadNewsItem : newsList.find(n => n.id === id);
        if (!item) return;

        const shareTitle = `📰 *${item.title}*`;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = sanitizeNewsHtml(item.content || '');
        const cleanContent = tempDiv.textContent || tempDiv.innerText || '';
        const shareExcerpt = cleanContent ? (cleanContent.length > 100 ? cleanContent.substring(0, 100) + '...' : cleanContent) : '';
        
        const newsUrl = `${window.location.origin}/article.html?id=${encodeURIComponent(id)}`;
        const rawImg = (Array.isArray(item.images) && item.images.length > 0) ? item.images[0] : (item.image || '');
        const imageUrl = sanitizeUrl(rawImg);

        const shareText = `${shareTitle}\n\n${shareExcerpt ? shareExcerpt + '\n\n' : ''}${imageUrl ? '📸 *फोटो देखें:*\n' + imageUrl + '\n\n' : ''}🎙️ *रिपोर्टर:* ${item.reporter || 'विशेष संवाददाता'}\n\n🔗 *पूरी खबर पढ़ने के लिए क्लिक करें:*\n${newsUrl}`;

        if (navigator.share) {
            try {
                let shareData = { title: item.title, text: shareText, url: newsUrl };
                if (imageUrl) {
                    try {
                        const response = await fetch(imageUrl);
                        const blob = await response.blob();
                        const file = new File([blob], 'news-image.jpg', { type: blob.type });
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            shareData.files = [file];
                        }
                    } catch (imgErr) {}
                }
                await navigator.share(shareData);
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
            }
        }

        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, '_blank');
    }

    function filterNews(cat) {
        currentCategory = cat;
        document.getElementById('news-calendar-picker').value = '';
        document.getElementById('current-category-title').innerHTML = `<span class="w-3 h-3 bg-red-600 rounded-sm"></span> ${cat === 'all' ? 'ताज़ा समाचार फीड' : escapeHTML(cat)}`;
        if (cat === 'all') {
            renderNews(newsList);
        } else {
            renderNews(newsList.filter(n => n.category === cat));
        }
    }

    function filterNewsByDate(selectedDateStr) {
        if (!selectedDateStr) return;
        const [selYear, selMonth, selDay] = selectedDateStr.split('-').map(Number);

        const filtered = newsList.filter(item => {
            if (!item.createdAt) return false;
            const itemDate = new Date(item.createdAt);
            return itemDate.getFullYear() === selYear &&
                   (itemDate.getMonth() + 1) === selMonth &&
                   itemDate.getDate() === selDay;
        });

        const targetDateObj = new Date(selYear, selMonth - 1, selDay);
        const formattedTargetDate = targetDateObj.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' });

        document.getElementById('current-category-title').innerHTML = `<span class="w-3 h-3 bg-red-600 rounded-sm"></span> दिनांक: ${escapeHTML(formattedTargetDate)}`;
        renderNews(filtered);
    }

    function resetCalendarFilter() {
        document.getElementById('news-calendar-picker').value = '';
        filterNews(currentCategory);
    }

    function handleLiveSearch() {
        const q = document.getElementById('search-input').value.toLowerCase().trim();
        if (!q) { filterNews(currentCategory); return; }
        const filtered = newsList.filter(n => (n.title && n.title.toLowerCase().includes(q)) || (n.content && n.content.toLowerCase().includes(q)));
        renderNews(filtered);
    }

    function resetPostModalState() {
        ['news-title', 'news-image', 'news-image-files', 'edit-doc-id'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const editor = document.getElementById('news-content-editor');
        if (editor) editor.innerHTML = '';
        document.getElementById('news-reporter').value = 'विशेष संवाददाता';
        document.getElementById('news-category').value = 'चुनाव अपडेट';
        document.getElementById('news-breaking').checked = false;
        document.getElementById('news-lead').checked = false;
        const submitBtn = document.getElementById('submit-btn');
        submitBtn.disabled = false;
        submitBtn.innerText = 'पोस्ट करें';
    }

    function triggerOpenNewPostModal() { 
        resetPostModalState();
        document.getElementById('post-modal-title').innerText = "नई खबर पोस्ट करें";
        openPortalModal('post-modal'); 
    }
    
    function triggerOpenJobModal() { openPortalModal('job-modal'); }
    function triggerOpenElectionModal() { openPortalModal('election-modal'); }
    function openPanchayatHub(){openPortalModal('panchayat-hub-modal');const i=document.getElementById('panchayat-search');if(i)setTimeout(()=>i.focus(),50);}
    
    function searchPanchayatInfo(){
        const q=(document.getElementById('panchayat-search')?.value||'').trim().toLowerCase(),
              o=document.getElementById('panchayat-search-results');
        if(!o)return;
        if(q.length<2){
            o.innerHTML='<p class="text-center text-xs text-gray-400 py-6">कम से कम 2 अक्षर लिखें।</p>';
            return;
        }
        const d=(window.cknPanchayatElections||[]).filter(v=>[v.district,v.panchayatSamiti,v.gramPanchayat,v.village,v.reservation,v.wards,v.notes].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0,12);
        const results=(window.cknPanchayatResults||[]).filter(v=>[v.district,v.gramPanchayat,v.village,v.ward,v.post,v.winner,v.candidates].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0,20);
        
        if(results.length){
            o.innerHTML=(d.length?o.innerHTML:'')+'<h4 class="font-black text-sm mt-4 mb-2">📊 चुनाव परिणाम</h4>'+results.map(v=>`<article class="p-4 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 mb-2"><h4 class="font-black text-sm">${escapeHTML(v.village)}</h4><p class="text-[10px] text-gray-500">${escapeHTML(v.gramPanchayat)} • वार्ड ${escapeHTML(v.ward)} •${escapeHTML(v.post)}</p><div class="mt-2 space-y-1">${(Array.isArray(v.candidates)?v.candidates.map((x,i)=>`<div class="flex justify-between text-xs ${((v.status==='published'||v.status==='verified')&&i===0?'font-black':'')}"><span>${i===0?'🏆 ':''}${escapeHTML(x.name)}</span><span>${escapeHTML(String(x.votes))} वोट</span></div>`).join('') : escapeHTML(v.candidates||'उपलब्ध नहीं'))}</div><p class="text-xs mt-1"><b>स्थिति:</b> ${v.status==='published'?'प्रकाशित':v.status==='verified'?'सत्यापित':'लंबित'}</p>${(v.sourceUrl?`<a class="inline-block mt-2 text-[10px] font-bold text-blue-600" href="${sanitizeUrl(v.sourceUrl)}" target="_blank" rel="noopener noreferrer">स्रोत →</a>`:'')}</article>`).join('');
        } else if(!d.length){
            o.innerHTML='<div class="p-4 text-center text-xs text-gray-500 border rounded-lg">इस नाम से अभी कोई जानकारी प्रकाशित नहीं है।</div>';
            return;
        }
        o.innerHTML=d.map(v=>`<article class="p-4 rounded-xl border mb-2"><h4 class="font-black text-sm">${escapeHTML(v.village)}</h4><p class="text-[10px] text-gray-500">${escapeHTML(v.gramPanchayat)} • ${escapeHTML(v.panchayatSamiti)} •${escapeHTML(v.district)}</p><p class="text-xs mt-2"><b>सरपंच आरक्षण:</b> ${escapeHTML(v.reservation||'उपलब्ध नहीं')}</p><p class="text-xs mt-1"><b>वार्ड जानकारी:</b> ${escapeHTML(v.wards||'उपलब्ध नहीं')}</p>${(v.sourceUrl?`<a class="inline-block mt-2 text-[10px] font-bold text-blue-600" href="${sanitizeUrl(v.sourceUrl)}" target="_blank" rel="noopener noreferrer">आधिकारिक स्रोत →</a>`:'')}${(v.notes?`<p class="text-[10px] mt-2 text-gray-500">${escapeHTML(v.notes)}</p>`:'')}</article>`).join('');
    }

    function triggerOpenPanchayatAdminModal(){openPortalModal('panchayat-admin-modal');}
    function loadResultEntryOptions(level){const all=window.cknPanchayatElections||[];const d=document.getElementById('pr-district'),ps=document.getElementById('pr-ps'),gp=document.getElementById('pr-gp'),v=document.getElementById('pr-village');let rows=all;if(level==='district'){ps.value='';gp.value='';v.value='';}if(d.value)rows=rows.filter(x=>String(x.district||'')===d.value);const psVals=[...new Set(rows.map(x=>x.panchayatSamiti).filter(Boolean))].sort();ps.innerHTML='<option value="">पंचायत समिति चुनें</option>'+psVals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');if(level!=='district'&&ps.value)rows=rows.filter(x=>String(x.panchayatSamiti||'')===ps.value);const gpVals=[...new Set(rows.map(x=>x.gramPanchayat).filter(Boolean))].sort();gp.innerHTML='<option value="">ग्राम पंचायत चुनें</option>'+gpVals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');if(level!=='district'&&level!=='ps'&&gp.value)rows=rows.filter(x=>String(x.gramPanchayat||'')===gp.value);const vVals=[...new Set(rows.map(x=>x.village).filter(Boolean))].sort();v.innerHTML='<option value="">गांव चुनें</option>'+vVals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');}
    function triggerOpenPanchayatResultModal(){openPortalModal('panchayat-result-modal');loadResultEntryOptions('district');}
    async function savePanchayatResult(e){e.preventDefault();if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID){alert('एडमिन लॉगिन आवश्यक है।');return;}const b=document.getElementById('pr-save');b.disabled=true;b.innerText='सेव हो रहा है...';try{const rawCandidates=document.getElementById('pr-candidates-list').value.trim();const parsedCandidates=rawCandidates.split(',').map(x=>{const a=x.split(/\s*[—-]\s*/);return {name:(a[0]||'').trim(),votes:Number(a[1]||0)};}).filter(x=>x.name);if(!parsedCandidates.length)throw new Error('कम से कम एक उम्मीदवार दर्ज करें।');if(parsedCandidates.some(x=>!Number.isFinite(x.votes)||x.votes<0))throw new Error('वोट संख्या 0 या उससे अधिक होनी चाहिए।');parsedCandidates.sort((a,b)=>b.votes-a.votes);const d={district:document.getElementById('pr-district').value.trim(),panchayatSamiti:document.getElementById('pr-ps').value.trim(),gramPanchayat:document.getElementById('pr-gp').value.trim(),village:document.getElementById('pr-village').value.trim(),ward:document.getElementById('pr-ward').value.trim(),post:document.getElementById('pr-post').value.trim(),status:document.getElementById('pr-status').value,verifiedAt:document.getElementById('pr-status').value==='verified'||document.getElementById('pr-status').value==='published'?firebase.firestore.FieldValue.serverTimestamp():null,verifiedBy:document.getElementById('pr-status').value==='verified'||document.getElementById('pr-status').value==='published'?auth.currentUser.uid:null,candidates:parsedCandidates, winner:parsedCandidates[0].name,winnerVotes:parsedCandidates[0].votes,notes:document.getElementById('pr-candidates').value.trim(),sourceUrl:document.getElementById('pr-source').value.trim(),createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};if([d.district,d.panchayatSamiti,d.gramPanchayat,d.village,d.ward,d.post,d.candidates].some(v=>!v||v.length>500))throw new Error('परिणाम की जानकारी जांचें।');const dup=await db.collection('panchayat_results').where('district','==',d.district).limit(1000).get();const duplicate=dup.docs.some(x=>{const v=x.data()||{};return String(v.gramPanchayat||'')===d.gramPanchayat&&String(v.village||'')===d.village&&String(v.ward||'')===d.ward&&String(v.post||'')===d.post;});if(duplicate)throw new Error('इस गांव/वार्ड/पद का परिणाम पहले से दर्ज है। पहले पुराने परिणाम को अपडेट करें।');if(d.sourceUrl&&!d.sourceUrl.startsWith('https://'))throw new Error('स्रोत लिंक HTTPS होना चाहिए।');await db.collection('panchayat_results').add(d);e.target.reset();closePortalModal('panchayat-result-modal');loadPanchayatResults();alert('परिणाम सेव हो गया।');}catch(x){alert('परिणाम सेव नहीं हो सका: '+x.message);}finally{b.disabled=false;b.innerText='सेव करें';}}
    function loadPanchayatResults(){const isAdminUser=!!auth.currentUser&&auth.currentUser.uid===ADMIN_UID;const q=isAdminUser?db.collection('panchayat_results').limit(1000):db.collection('panchayat_results').where('status','==','published').limit(1000);q.get().then(s=>{const rows=s.docs.map(d=>({id:d.id,...normalizeDoc(d)}));window.cknPanchayatResultsAdmin=isAdminUser?rows:[];window.cknPanchayatResults=rows;updatePanchayatCascade('district');applyPanchayatURLFilters();renderPanchayatDashboard();}).catch(()=>{window.cknPanchayatResults=[];window.cknPanchayatResultsAdmin=[];renderPanchayatDashboard();});}
    async function deletePanchayatResult(id){if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID){alert('एडमिन लॉगिन आवश्यक है।');return;}if(!confirm('क्या आप यह चुनाव परिणाम स्थायी रूप से हटाना चाहते हैं?'))return;try{await db.collection('panchayat_results').doc(id).delete();loadPanchayatResults();alert('परिणाम हट गया।');}catch(e){alert('डिलीट नहीं हो सका: '+e.message);}}
    function openPanchayatResultManager(){renderPanchayatResultManager();openPortalModal('panchayat-result-manager-modal');}
function renderPanchayatResultManager(){const all=window.cknPanchayatResultsAdmin||[];const stats=document.getElementById('pr-admin-stats');if(stats){const count=s=>all.filter(v=>v.status===s).length;stats.innerHTML='<div class="rounded-xl border p-2 text-center"><b class="text-lg">'+all.length+'</b><div class="text-[10px] text-gray-500">कुल परिणाम</div></div><div class="rounded-xl border p-2 text-center"><b class="text-lg">'+count('pending')+'</b><div class="text-[10px] text-gray-500">लंबित</div></div><div class="rounded-xl border p-2 text-center"><b class="text-lg">'+count('verified')+'</b><div class="text-[10px] text-gray-500">सत्यापित</div></div><div class="rounded-xl border p-2 text-center"><b class="text-lg">'+count('published')+'</b><div class="text-[10px] text-gray-500">प्रकाशित</div></div>';}const q=(document.getElementById('pr-edit-search')?.value||'').toLowerCase();const status=document.getElementById('pr-edit-status')?.value||'';const district=document.getElementById('pr-edit-district')?.value||'';const panchayat=document.getElementById('pr-edit-panchayat')?.value||'';const post=document.getElementById('pr-edit-post')?.value||'';const ds=document.getElementById('pr-edit-district');const ps=document.getElementById('pr-edit-panchayat');const os=document.getElementById('pr-edit-post');if(ds){const vals=[...new Set(all.map(v=>v.district).filter(Boolean))].sort();const cur=ds.value;ds.innerHTML='<option value="">सभी जिले</option>'+vals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');ds.value=vals.includes(cur)?cur:'';}if(ps){const vals=[...new Set(all.filter(v=>!district||v.district===district).map(v=>v.gramPanchayat).filter(Boolean))].sort();const cur=ps.value;ps.innerHTML='<option value="">सभी पंचायतें</option>'+vals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');ps.value=vals.includes(cur)?cur:'';}if(os){const vals=[...new Set(all.map(v=>v.post).filter(Boolean))].sort();const cur=os.value;os.innerHTML='<option value="">सभी पद</option>'+vals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');os.value=vals.includes(cur)?cur:'';}const list=document.getElementById('pr-edit-list');if(!list)return;const filtered=all.filter(v=>(!status||v.status===status)&&(!district||v.district===district)&&(!panchayat||v.gramPanchayat===panchayat)&&(!post||v.post===post)&&[v.district,v.panchayatSamiti,v.gramPanchayat,v.village,v.ward,v.post,v.status].join(' ').toLowerCase().includes(q));const size=Number(document.getElementById('pr-edit-page-size')?.value||25);const page=Math.max(1,Number(window.cknPanchayatAdminPage||1));const pages=Math.max(1,Math.ceil(filtered.length/size));window.cknPanchayatAdminPage=Math.min(page,pages);const rows=filtered.slice((window.cknPanchayatAdminPage-1)*size,window.cknPanchayatAdminPage*size);list.innerHTML=rows.length?rows.map(v=>{const st=v.status==='published'?'प्रकाशित':v.status==='verified'?'सत्यापित':'लंबित';const badge=v.status==='published'?'bg-green-100 text-green-700':v.status==='verified'?'bg-blue-100 text-blue-700':'bg-yellow-100 text-yellow-700';return '<div class="border rounded-xl p-3"><div class="flex items-start gap-2"><button onclick="editPanchayatResult(\''+v.id+'\')" class="flex-1 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded"><b class="text-sm">'+escapeHTML(v.village||'')+'</b><div class="text-[10px] text-gray-500">'+escapeHTML(v.gramPanchayat||'')+' • वार्ड '+escapeHTML(v.ward||'')+' • '+escapeHTML(v.post||'')+'</div><div class="text-xs mt-1">🏆 '+escapeHTML(v.winner||'लंबित')+(v.winnerVotes!==undefined?' — '+escapeHTML(String(v.winnerVotes))+' वोट':'')+'</div></button><button onclick="deletePanchayatResult(\''+v.id+'\')" class="px-2 py-1 text-xs rounded bg-red-600 text-white">🗑️</button></div><div class="flex items-center justify-between mt-2"><span class="text-[10px] font-bold px-2 py-1 rounded '+badge+'">'+st+'</span><div class="flex gap-1"><button onclick="setPanchayatResultStatus(\''+v.id+'\',\'pending\')" class="px-2 py-1 text-[10px] rounded border">लंबित</button><button onclick="setPanchayatResultStatus(\''+v.id+'\',\'verified\')" class="px-2 py-1 text-[10px] rounded border">सत्यापित</button><button onclick="setPanchayatResultStatus(\''+v.id+'\',\'published\')" class="px-2 py-1 text-[10px] rounded bg-green-600 text-white">प्रकाशित</button></div></div></div>';}).join(''):'<p class="text-xs text-gray-500">कोई परिणाम नहीं मिला।</p>';}
async function setPanchayatResultStatus(id,status){const v=(window.cknPanchayatResultsAdmin||[]).find(x=>x.id===id);if(!v||v.status===status)return;if(!confirm('स्थिति को '+(status==='published'?'प्रकाशित':status==='verified'?'सत्यापित':'लंबित')+' करना है?'))return;const upd={status:status,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:auth.currentUser.uid};if(status==='verified'||status==='published'){upd.verifiedAt= v.verifiedAt || firebase.firestore.FieldValue.serverTimestamp();upd.verifiedBy=v.verifiedBy||auth.currentUser.uid;}else{upd.verifiedAt=null;upd.verifiedBy=null;}try{await db.collection('panchayat_results').doc(id).update(upd);loadPanchayatResults();alert('स्थिति अपडेट हो गई।');}catch(e){alert('स्थिति अपडेट नहीं हो सकी: '+e.message);}}
async function editPanchayatResult(id){const v=(window.cknPanchayatResultsAdmin||[]).find(x=>x.id===id);if(!v)return;const candidates=Array.isArray(v.candidates)?v.candidates.map(x=>x.name+' — '+x.votes).join(', '):(v.candidates||'');const n=prompt('उम्मीदवार: नाम — वोट\nउदाहरण: मोहन लाल — 420, राम लाल — 315',candidates);if(n===null)return;const arr=n.split(',').map(x=>{const a=x.split(/\s*[—-]\s*/);return{name:(a[0]||'').trim(),votes:Number(a[1]||0)}}).filter(x=>x.name);if(!arr.length){alert('उम्मीदवार जानकारी सही भरें।');return;}arr.sort((a,b)=>b.votes-a.votes);const verified=confirm('क्या परिणाम को सत्यापित करके प्रकाशित करना है? OK = सत्यापित/प्रकाशित, Cancel = लंबित');const upd={candidates:arr,status:verified?'published':'pending',verifiedAt:verified?firebase.firestore.FieldValue.serverTimestamp():null,verifiedBy:verified?auth.currentUser.uid:null,winner:arr[0].name,winnerVotes:arr[0].votes,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:auth.currentUser.uid};try{await db.collection('panchayat_results').doc(id).update(upd);loadPanchayatResults();alert('परिणाम अपडेट हो गया।');}catch(e){alert('अपडेट नहीं हो सका: '+e.message);}}
    function applyPanchayatURLFilters(){const p=new URLSearchParams(window.location.search);const map={district:'pr-filter-district',ps:'pr-filter-ps',gp:'pr-filter-gp',village:'pr-filter-village',ward:'pr-filter-ward'};Object.entries(map).forEach(([k,id])=>{const el=document.getElementById(id);const val=p.get(k);if(el&&val){el.value=val;}});if(p.toString()){setTimeout(()=>{updatePanchayatCascade('district');},0);}}
function setPanchayatPageMeta(v){if(!v)return;const place=[v.village,v.gramPanchayat,v.panchayatSamiti,v.district].filter(Boolean).join(' - ');const title=(v.village||v.gramPanchayat||'पंचायत')+' पंचायत चुनाव परिणाम '+(v.post?'| '+v.post:'')+' | CHUNDA KSHETRA NEWS';const desc=(v.winner?'विजेता: '+v.winner+(v.winnerVotes!==undefined?' — '+v.winnerVotes+' वोट':' कलाकार')+' — '+(v.winnerVotes!==undefined?v.winnerVotes+' वोट। ':'। '):'पंचायत चुनाव परिणाम। ')+place+' की सत्यापित जानकारी CHUNDA KSHETRA NEWS पर।';document.title=title;const md=document.getElementById('meta-description');if(md)md.content=desc;const ogt=document.getElementById('og-title');if(ogt)ogt.content=title;const ogd=document.getElementById('og-description');if(ogd)ogd.content=desc;const canon=document.getElementById('canonical-link');if(canon)canon.href=window.location.href;const schema=document.getElementById('panchayat-seo-schema');if(schema)schema.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Article','headline':title,'description':desc,'dateModified':v.updatedAt&&v.updatedAt.toDate?v.updatedAt.toDate().toISOString():new Date().toISOString(),'mainEntityOfPage':window.location.href,'author':{'@type':'Organization','name':'CHUNDA KSHETRA NEWS'},'publisher':{'@type':'Organization','name':'CHUNDA KSHETRA NEWS','url':'https://chundanewslive.in/'},'about':{'@type':'Place','name':place}});}
function showPanchayatResultDetail(id){const v=(window.cknPanchayatResults||[]).find(x=>x.id===id);if(!v)return;setPanchayatPageMeta(v);const el=document.getElementById('panchayat-result-detail');el.innerHTML='<h3 class="text-lg font-black">📊 '+escapeHTML(v.village||'')+' — '+escapeHTML(v.post||'')+'</h3><p class="text-xs text-gray-500 mt-1">'+escapeHTML(v.district||'')+' • '+escapeHTML(v.gramPanchayat||'')+(v.panchayatSamiti?' • '+escapeHTML(v.panchayatSamiti):'')+' • वार्ड '+escapeHTML(v.ward||'')+'</p><div class="mt-4 p-3 rounded-xl bg-green-50 dark:bg-green-950/20"><b>🏆 विजेता:</b> '+escapeHTML(v.winner||'परिणाम लंबित')+(v.winnerVotes?' — '+escapeHTML(String(v.winnerVotes))+' वोट':'')+'</div><h4 class="font-bold mt-4 mb-2">उम्मीदवारों का वोट विवरण</h4><div class="space-y-1">'+(Array.isArray(v.candidates)?v.candidates.map((x,i)=>'<div class="flex justify-between border-b py-2 text-sm"><span>'+(v.status==='declared'&&i===0?'🏆 ':'')+escapeHTML(x.name)+'</span><b>'+escapeHTML(String(x.votes))+'</b></div>').join(''):escapeHTML(String(v.candidates||'उपलब्ध नहीं')))+'</div><p class="text-xs mt-3"><b>स्थिति:</b> '+(v.status==='published'?'प्रकाशित':v.status==='verified'?'सत्यापित':'लंबित')+'</p>'+(v.notes?'<p class="text-xs mt-2"><b>नोट:</b> '+escapeHTML(v.notes)+'</p>':'')+(v.sourceUrl?'<a class="inline-block mt-3 text-xs font-bold text-blue-600" href="'+sanitizeUrl(v.sourceUrl)+'" target="_blank" rel="noopener noreferrer">आधिकारिक स्रोत →</a>':'');openPortalModal('panchayat-result-detail-modal');}
    function updatePanchayatCascade(level){const all=window.cknPanchayatResults||[];const d=document.getElementById('pr-filter-district'),ps=document.getElementById('pr-filter-ps'),gp=document.getElementById('pr-filter-gp'),v=document.getElementById('pr-filter-village'),w=document.getElementById('pr-filter-ward');let rows=all;if(level==='district'){ps.value='';gp.value='';v.value='';w.value='';}if(d.value)rows=rows.filter(x=>String(x.district||'')===d.value);const psVals=[...new Set(rows.map(x=>x.panchayatSamiti).filter(Boolean))].sort();ps.innerHTML='<option value="">सभी पंचायत समितियां</option>'+psVals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');if(level!=='district'&&ps.value)rows=rows.filter(x=>String(x.panchayatSamiti||'')===ps.value);const gpVals=[...new Set(rows.map(x=>x.gramPanchayat).filter(Boolean))].sort();gp.innerHTML='<option value="">सभी ग्राम पंचायतें</option>'+gpVals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');if(level!=='district'&&level!=='ps'&&gp.value)rows=rows.filter(x=>String(x.gramPanchayat||'')===gp.value);const vVals=[...new Set(rows.map(x=>x.village).filter(Boolean))].sort();v.innerHTML='<option value="">सभी गांव</option>'+vVals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');if(level==='village'||level==='gp')rows=rows.filter(x=>!v.value||String(x.village||'')===v.value);const wVals=[...new Set(rows.map(x=>x.ward).filter(Boolean))].sort();w.innerHTML='<option value="">सभी वार्ड</option>'+wVals.map(x=>'<option>'+escapeHTML(x)+'</option>').join('');renderPanchayatDashboard();}
    function updatePanchayatSEO(rows,f){const parts=[];if(f.district)parts.push(f.district);if(f.ps)parts.push(f.ps);if(f.gp)parts.push(f.gp);if(f.village)parts.push(f.village);const title=parts.length?'पंचायत चुनाव परिणाम: '+parts.join(' - ')+' | CHUNDA KSHETRA NEWS':'पंचायत चुनाव परिणाम | CHUNDA KSHETRA NEWS';const desc=parts.length?'देखें '+parts.join(' - ')+' के पंचायत चुनाव परिणाम, विजेता, वोट और सत्यापित जानकारी।':'राजस्थान के पंचायत चुनाव परिणाम, गांव, ग्राम पंचायत और वार्ड के अनुसार सत्यापित जानकारी।';document.title=title;const md=document.getElementById('meta-description');if(md)md.setAttribute('content',desc);const ogt=document.getElementById('og-title');if(ogt)ogt.setAttribute('content',title);const ogd=document.getElementById('og-description');if(ogd)ogd.setAttribute('content',desc);const canon=document.getElementById('canonical-link');const url=new URL(window.location.href);['district','ps','gp','village','ward'].forEach(k=>url.searchParams.delete(k));Object.entries(f).forEach(([k,v])=>{if(v)url.searchParams.set(k,v)});if(canon)canon.setAttribute('href',url.toString());const schema=document.getElementById('panchayat-seo-schema');if(schema)schema.textContent=JSON.stringify({'@context':'https://schema.org','@type':'ItemList','name':title,'description':desc,'url':url.toString(),'numberOfItems':rows.length,'itemListElement':rows.slice(0,100).map((v,i)=>({'@type':'ListItem','position':i+1,'name':(v.village||'')+' - '+(v.post||'')+' - '+(v.winner||'परिणाम'),'url':window.location.origin+window.location.pathname+'?district='+encodeURIComponent(v.district||'')+'&ps='+encodeURIComponent(v.panchayatSamiti||'')+'&gp='+encodeURIComponent(v.gramPanchayat||'')+'&village='+encodeURIComponent(v.village||'')+'&ward='+encodeURIComponent(v.ward||'')}))});}
function renderPanchayatDashboard(){const list=document.getElementById('panchayat-dashboard-list');if(!list)return;const f={district:(document.getElementById('pr-filter-district')||{}).value?.trim().toLowerCase()||'',ps:(document.getElementById('pr-filter-ps')||{}).value?.trim().toLowerCase()||'',gp:(document.getElementById('pr-filter-gp')||{}).value?.trim().toLowerCase()||'',village:(document.getElementById('pr-filter-village')||{}).value?.trim().toLowerCase()||'',ward:(document.getElementById('pr-filter-ward')||{}).value?.trim().toLowerCase()||''};const rows=(window.cknPanchayatResults||[]).filter(v=>(!f.district||String(v.district||'').toLowerCase().includes(f.district))&&(!f.ps||String(v.panchayatSamiti||'').toLowerCase().includes(f.ps))&&(!f.gp||String(v.gramPanchayat||'').toLowerCase().includes(f.gp))&&(!f.village||String(v.village||'').toLowerCase().includes(f.village))&&(!f.ward||String(v.ward||'').toLowerCase().includes(f.ward))).sort((a,b)=>String(a.district).localeCompare(String(b.district),'hi'));document.getElementById('pr-count').textContent=rows.length+' परिणाम';updatePanchayatSEO(rows,f);list.innerHTML=rows.length?rows.map(v=>{const href='?district='+encodeURIComponent(v.district||'')+'&ps='+encodeURIComponent(v.panchayatSamiti||'')+'&gp='+encodeURIComponent(v.gramPanchayat||'')+'&village='+encodeURIComponent(v.village||'')+'&ward='+encodeURIComponent(v.ward||'');return '<article class="border dark:border-gray-800 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-gray-800"><a href="'+href+'" class="block" onclick="event.stopPropagation();showPanchayatResultDetail(\''+v.id+'\');return false;"><div class="flex justify-between gap-2"><div><b class="text-sm">'+escapeHTML(v.village||'')+'</b><div class="text-[10px] text-gray-500">'+escapeHTML(v.district||'')+' • '+escapeHTML(v.panchayatSamiti||'')+' • '+escapeHTML(v.gramPanchayat||'')+' • वार्ड '+escapeHTML(v.ward||'')+' • '+escapeHTML(v.post||'')+'</div></div><span class="text-[10px] font-bold text-green-600">प्रकाशित</span></div><div class="mt-2">🏆 '+escapeHTML(v.winner||'परिणाम लंबित')+(v.winnerVotes!==undefined?' — '+escapeHTML(String(v.winnerVotes))+' वोट':'')+'<div class="text-[10px] font-bold text-green-600 mt-2">✓ CHUNDA KSHETRA NEWS द्वारा सत्यापित</div></div></a></article>';}).join(''):'<p class="text-xs text-gray-500">अभी कोई परिणाम उपलब्ध नहीं है।';}
    async function savePanchayatElection(e){e.preventDefault();if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID){alert('एडमिन लॉगिन आवश्यक है।');return;}const b=document.getElementById('pe-save');b.disabled=true;b.innerText='सेव हो रहा है...';try{const d={district:document.getElementById('pe-district').value.trim(),panchayatSamiti:document.getElementById('pe-ps').value.trim(),gramPanchayat:document.getElementById('pe-gp').value.trim(),village:document.getElementById('pe-village').value.trim(),reservation:document.getElementById('pe-reservation').value.trim(),wards:document.getElementById('pe-wards').value.trim(),sourceUrl:document.getElementById('pe-source').value.trim(),notes:document.getElementById('pe-notes').value.trim(),createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};if([d.district,d.panchayatSamiti,d.gramPanchayat,d.village].some(v=>v.length<2||v.length>150))throw new Error('जिला/पंचायत/गांव की जानकारी जांचें।');if(d.sourceUrl&&!d.sourceUrl.startsWith('https://'))throw new Error('स्रोत लिंक HTTPS होना चाहिए।');await db.collection('panchayat_elections').add(d);e.target.reset();closePortalModal('panchayat-admin-modal');loadPanchayatElectionData(true);alert('जानकारी सेव हो गई।');}catch(x){alert('सेव नहीं हो सकी: '+x.message);}finally{b.disabled=false;b.innerText='सेव करें';}}
    function loadPanchayatElectionData(){db.collection('panchayat_elections').limit(500).get().then(s=>{window.cknPanchayatElections=s.docs.map(d=>({id:d.id,...normalizeDoc(d)}));}).catch(()=>{window.cknPanchayatElections=[];});}

    function triggerOpenScoreModal() { openPortalModal('score-modal'); }
    
    function triggerOpenReportsModal() { 
        openPortalModal('reports-modal'); 
        db.collection('citizen_reports').get().then(snapshot => {
            localStorage.setItem('admin_seen_reports_count', snapshot.size.toString());
            const badge = document.getElementById('citizen-reports-badge');
            if (badge) badge.classList.add('hidden');
        });
        loadCitizenReportsList();
    }

    function loadCitizenReportsList() {
        const reportsList = document.getElementById('reports-list');
        reportsList.innerHTML = '<p class="text-center text-gray-400 py-6">रिपोर्टें लोड हो रही हैं...</p>';

        db.collection('citizen_reports').get().then(snapshot => {
            if (!snapshot.empty) {
                const reportDocs = snapshot.docs.slice().sort((a,b) => {
                    const da = a.data(), dbb = b.data();
                    return (timestampToMillis(dbb.createdAt) || timestampToMillis(dbb.timestamp)) - (timestampToMillis(da.createdAt) || timestampToMillis(da.timestamp));
                });
                reportsList.innerHTML = reportDocs.map(doc => {
                    const report = doc.data();
                    const reportId = escapeHTML(doc.id);
                    return `
                        <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded border dark:border-gray-700 flex flex-col gap-2">
                            <div class="flex justify-between items-center font-bold">
                                <span>${escapeHTML(report.name)} (${escapeHTML(report.location || report.area || '')})</span>
                                <span class="text-[10px] text-gray-500">${escapeHTML(report.date || '')}</span>
                            </div>
                            <p class="text-red-600 font-mono">${escapeHTML(report.phone || '')}</p>
                            <p class="text-gray-700 dark:text-gray-300">${escapeHTML(report.details || report.msg || '')}</p>
                            <div class="flex justify-end pt-1">
                                <button onclick="deleteCitizenReport('${reportId}')" class="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-3 py-1 rounded">
                                    🗑️ यह रिपोर्ट डिलीट करें
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                reportsList.innerHTML = '<p class="text-center text-gray-400 py-6">कोई नई रिपोर्ट प्राप्त नहीं हुई है।</p>';
            }
        }).catch(err => {
            reportsList.innerHTML = '<p class="text-center text-red-500 py-6">रिपोर्ट देखने के लिए एडमिन लॉगिन आवश्यक है।</p>';
        });
    }

    async function deleteCitizenReport(id) {
        if (!confirm('क्या आप इस नागरिक रिपोर्ट को हमेशा के लिए हटाना चाहते हैं?')) return;
        try {
            await db.collection('citizen_reports').doc(id).delete();
            alert("नागरिक रिपोर्ट सफलतापूर्वक हटा दी गई!");
            loadCitizenReportsList();
        } catch (err) {
            alert("रिपोर्ट हटाने में समस्या: " + err.message);
        }
    }

    async function handleNewsSubmit(e) {
        e.preventDefault();
        if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID) { 
            alert('एडमिन लॉगिन आवश्यक है। कृपया दोबारा लॉगिन करें।'); 
            return; 
        }
        const submitBtn = document.getElementById('submit-btn');
        const editDocId = safeNewsId(document.getElementById('edit-doc-id').value);
        submitBtn.disabled = true;
        try {
            submitBtn.innerText = 'तैयारी हो रही है...';
            const title = document.getElementById('news-title').value.trim();
            const category = document.getElementById('news-category').value;
            const reporter = document.getElementById('news-reporter').value.trim() || 'विशेष संवाददाता';
            const content = sanitizeNewsHtml(document.getElementById('news-content-editor').innerHTML.trim());
            const manualUrlInput = document.getElementById('news-image').value.trim();
            const imageFileInput = document.getElementById('news-image-files');

            let imageUrls = [];

            if (manualUrlInput) {
                const urls = manualUrlInput.split(',').map(u => u.trim()).filter(u => u);
                for (let u of urls) {
                    if (sanitizeUrlRaw(u)) imageUrls.push(u);
                }
            }

            if (imageFileInput && imageFileInput.files && imageFileInput.files.length > 0) {
                const totalFiles = imageFileInput.files.length;
                for (let i = 0; i < totalFiles; i++) {
                    submitBtn.innerText = `फोटो अपलोड हो रही है (${i + 1}/${totalFiles})...`;
                    try {
                        const uploadedUrl = await uploadToImgBB(imageFileInput.files[i]);
                        if (uploadedUrl) imageUrls.push(uploadedUrl);
                    } catch (imgErr) {
                        console.warn("ImgBB upload failed for file:", imgErr);
                    }
                }
            }

            if (title.length < 5 || title.length > 220) throw new Error('हेडलाइन 5 से 220 अक्षरों के बीच होनी चाहिए।');
            if (reporter.length > 100) throw new Error('रिपोर्टर नाम बहुत लंबा है।');
            if (htmlToPlainText(content).length < 20 || htmlToPlainText(content).length > 20000) throw new Error('समाचार विवरण 20 से 20,000 अक्षरों के बीच होना चाहिए।');

            submitBtn.innerText = 'समाचार सेव हो रहा है...';
            
            if (imageUrls.length === 0) {
                imageUrls.push("https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800");
            }

            const existing = editDocId ? newsList.find(n => n.id === editDocId) : null;
            
            const newItem = {
                title, 
                category, 
                reporter, 
                content,
                isBreaking: document.getElementById('news-breaking').checked,
                isLead: document.getElementById('news-lead').checked,
                date: new Date().toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                views: existing ? Number(existing.views || 0) : 0,
                image: imageUrls[0], 
                images: imageUrls 
            };

            if (editDocId) {
                await db.collection('news_posts').doc(editDocId).update(newItem);
                alert('खबर सफलतापूर्वक अपडेट हो गई!');
            } else {
                newItem.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('news_posts').add(newItem);
                alert('समाचार सफलतापूर्वक पोस्ट कर दिया गया!');
            }
            localStorage.removeItem('ckn_news_time');
            resetPostModalState(); 
            closePortalModal('post-modal');
            loadNewsWithTTL(true);
        } catch (err) {
            alert('समाचार सेव नहीं हो सका: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = editDocId ? 'अपडेट करें' : 'पोस्ट करें';
        }
    }

    async function handleElectionSubmit(e) {
        e.preventDefault();
        if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID) { alert('एडमिन लॉगिन आवश्यक है।'); return; }
        const submitBtn = document.getElementById('elec-submit-btn');
        submitBtn.disabled = true; 
        submitBtn.innerText = 'अपलोड हो रहा है...';
        try {
            const title = document.getElementById('elec-title').value.trim();
            const subtitle = document.getElementById('elec-subtitle').value.trim() || 'चुनाव अधिसूचना / सूची';
            const linkVal = sanitizeUrlRaw(document.getElementById('elec-link').value.trim());
            if (title.length < 3 || title.length > 220) throw new Error('दस्तावेज़ नाम अमान्य है।');
            if (!linkVal) throw new Error('दस्तावेज़ लिंक केवल मान्य HTTPS होना चाहिए।');
            await db.collection('election_docs').add({ title, subtitle, link: linkVal, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            alert('चुनाव दस्तावेज़ लिंक जोड़ दिया गया!');
            e.target.reset(); 
            closePortalModal('election-modal');
            loadWidgetData(true);
        } catch (err) {
            alert('दस्तावेज़ सेव नहीं हो सका: ' + err.message);
        } finally { 
            submitBtn.disabled = false; 
            submitBtn.innerText = 'अपलोड करें'; 
        }
    }

    async function deleteElectionDoc(id) {
        if (!confirm('क्या आप इस चुनाव दस्तावेज़ को हटाना चाहते हैं?')) return;
        try {
            await db.collection('election_docs').doc(id).delete();
            alert("दस्तावेज़ हटा दिया गया!");
            loadWidgetData(true);
        } catch (err) {
            alert("हटाने में समस्या: " + err.message);
        }
    }

    function editNewsPost(id) {
        resetPostModalState();
        const n = newsList.find(x => x.id === id);
        if (!n) return;
        
        document.getElementById('post-modal-title').innerText = "खबर एडिट करें";
        document.getElementById('edit-doc-id').value = n.id;
        document.getElementById('news-title').value = n.title || '';
        document.getElementById('news-category').value = n.category || 'चुनाव अपडेट';
        document.getElementById('news-reporter').value = n.reporter || 'विशेष संवाददाता';
        document.getElementById('news-content-editor').innerHTML = sanitizeNewsHtml(n.content || '');
        document.getElementById('news-breaking').checked = !!n.isBreaking;
        document.getElementById('news-lead').checked = !!n.isLead;
        
        let imgVal = '';
        if (Array.isArray(n.images) && n.images.length > 0) {
            imgVal = n.images.join(', ');
        } else if (n.image) {
            imgVal = n.image;
        }
        document.getElementById('news-image').value = imgVal;
        
        document.getElementById('submit-btn').innerText = 'अपडेट करें';
        openPortalModal('post-modal');
    }

    async function deleteNewsPost(id) {
        if (!confirm('क्या आप सचमुच इस खबर को हटाना चाहते हैं?')) return;
        try {
            await db.collection('news_posts').doc(id).delete();
            alert("खबर हटा दी गई!");
            loadNewsWithTTL(true);
        } catch (err) {
            alert("खबर हटाने में समस्या: " + err.message);
        }
    }

    async function handleJobSubmit(e) {
        e.preventDefault();
        if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID) { alert('एडमिन लॉगिन आवश्यक है।'); return; }
        const title = document.getElementById('job-title').value.trim();
        const posts = document.getElementById('job-posts').value.trim() || 'विस्तृत विज्ञापन देखें';
        const lastDate = document.getElementById('job-last-date').value.trim();
        const link = sanitizeUrlRaw(document.getElementById('job-link').value.trim()) || '#';
        if (title.length < 3 || title.length > 220) { alert('भर्ती शीर्षक जाँचें।'); return; }
        try {
            await db.collection('job_alerts').add({ title, posts, lastDate, link, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            alert('भर्ती अलर्ट जोड़ दिया गया!'); 
            e.target.reset(); 
            closePortalModal('job-modal');
            loadWidgetData(true);
        } catch (err) { 
            alert('भर्ती अलर्ट सेव नहीं हो सका।'); 
        }
    }

    async function handleScoreSubmit(e) {
        e.preventDefault();
        if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID) { alert('एडमिन लॉगिन आवश्यक है। समय समाप्त।'); return; }
        const title = document.getElementById('score-title').value.trim();
        const score = document.getElementById('score-detail').value.trim();
        const status = document.getElementById('score-status').value.trim();
        if ([title, score, status].some(v => v.length < 2 || v.length > 300)) { alert('स्कोर जानकारी अमान्य है।'); return; }
        try {
            await db.collection('live_score').doc('current').set({ title, score, status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            alert('स्कोर सफलतापूर्वक अपडेट हो गया!'); 
            e.target.reset(); 
            closePortalModal('score-modal');
            loadScore();
        } catch (err) { 
            alert('स्कोर अपडेट नहीं हो सका।'); 
        }
    }

    async function handleCitizenSubmit(e) {
        e.preventDefault();
        if (document.getElementById('citizen-hp').value) return;
        const lastSubmitted = localStorage.getItem('last_report_time');
        const now = Date.now(), cooldownPeriod = 5 * 60 * 1000;
        if (lastSubmitted && (now - parseInt(lastSubmitted, 10)) < cooldownPeriod) {
            const remainingMinutes = Math.ceil((cooldownPeriod - (now - parseInt(lastSubmitted, 10))) / 60000);
            alert(`कृपया प्रतीक्षा करें! आप अगली सूचना ${remainingMinutes} मिनट बाद ही भेज सकते हैं।`); return;
        }
        const name = document.getElementById('citizen-name').value.trim();
        const phone = document.getElementById('citizen-phone').value.trim();
        const location = document.getElementById('citizen-area').value.trim();
        const details = document.getElementById('citizen-msg').value.trim();
        if (name.length < 2 || location.length < 2 || details.length < 10) {
            alert('कृपया सभी फील्ड सही भरें।'); return;
        }
        const submitBtn = document.getElementById('citizen-submit-btn'); 
        submitBtn.disabled = true; 
        submitBtn.innerText = 'भेजा जा रहा है...';
        try {
            await db.collection('citizen_reports').add({ 
                name, phone, location, details, 
                date: new Date().toLocaleDateString('hi-IN'), 
                createdAt: firebase.firestore.FieldValue.serverTimestamp() 
            });
            localStorage.setItem('last_report_time', now.toString());
            alert('धन्यवाद! आपकी सूचना संपादक को भेज दी गई है।'); 
            e.target.reset(); 
            closePortalModal('citizen-modal');
        } catch (err) { 
            alert('रिपोर्ट भेजने में समस्या आई।'); 
        } finally { 
            submitBtn.disabled = false; 
            submitBtn.innerText = 'भेजें'; 
        }
    }

    async function handleAdminLogin(e) {
        e.preventDefault();
        const email = document.getElementById('admin-email').value.trim();
        const pass = document.getElementById('admin-pass').value;
        const loginBtn = document.getElementById('login-submit-btn');
        loginBtn.disabled = true;
        loginBtn.innerText = 'लॉगिन हो रहा है...';

        try {
            const userCred = await auth.signInWithEmailAndPassword(email, pass);
            if (userCred.user.uid !== ADMIN_UID) {
                await auth.signOut();
                throw new Error('अनधिकृत खाता।');
            }
            onAdminSuccess(userCred.user.email);
            alert("एडमिन लॉगिन सफल!");
        } catch (error) {
            alert("लॉगिन असफल: " + error.message);
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerText = 'लॉगिन';
        }
    }

    function onAdminSuccess(email) {
        isAdminLoggedIn = true;
        document.getElementById('admin-user-email').innerText = email;
        document.getElementById('admin-action-bar').style.display = 'flex';
        closePortalModal('admin-modal');
        renderNews(newsList);
    }

    async function logoutAdmin() {
        await auth.signOut();
        isAdminLoggedIn = false;
        document.getElementById('admin-action-bar').style.display = 'none';
        renderNews(newsList);
    }

    const TTL = 5 * 60 * 1000;

    function safeStoreNews(list) {
        try {
            const lightweightList = list.map(item => ({
                id: item.id,
                title: item.title,
                category: item.category,
                reporter: item.reporter,
                date: item.date,
                isBreaking: item.isBreaking,
                isLead: item.isLead,
                image: item.image || item.images?.[0] || '',
                images: item.images || [],
                content: (item.content || '').slice(0, 1500),
                _isTruncated: (item.content || '').length > 1500,
                createdAt: item.createdAt
            }));
            localStorage.setItem('cached_news_list', JSON.stringify(lightweightList));
            localStorage.setItem('ckn_news_time', Date.now().toString());
        } catch (e) {
            localStorage.removeItem('cached_news_list');
            localStorage.removeItem('ckn_news_time');
        }
    }

    function updateBreakingTicker(list) {
        try {
            const safeList = Array.isArray(list) ? list : [];
            const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
            const breaking = safeList.filter(n => n && n.isBreaking && (!n.createdAt || Number(n.createdAt) >= twentyFourHoursAgo));
            const tickerEl = document.getElementById('breaking-ticker');
            if (!tickerEl) return;
            tickerEl.innerText = breaking.length
                ? breaking.map(b => '🔴 ' + String(b.title || '')).join('    ✦    ')
                : 'चूंडा क्षेत्र न्यूज़ पर आपका स्वागत है — निष्पक्ष, सटीक और क्षेत्रीय आवाज़...';
        } catch (err) {
            console.warn('Breaking ticker skipped:', err);
        }
    }

    function firestoreRestValue(value) {
        if (!value || typeof value !== 'object') return value;
        if ('stringValue' in value) return value.stringValue;
        if ('integerValue' in value) return Number(value.integerValue);
        if ('doubleValue' in value) return Number(value.doubleValue);
        if ('booleanValue' in value) return value.booleanValue;
        if ('timestampValue' in value) return value.timestampValue;
        if ('nullValue' in value) return null;
        if ('referenceValue' in value) return value.referenceValue;
        if ('geoPointValue' in value) return value.geoPointValue;
        if ('bytesValue' in value) return value.bytesValue;
        if ('arrayValue' in value) return (value.arrayValue.values || []).map(firestoreRestValue);
        if ('mapValue' in value) return Object.fromEntries(
            Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, firestoreRestValue(v)])
        );
        return value;
    }

    async function loadNewsViaRest() {
        const url = 'https://firestore.googleapis.com/v1/projects/chunda-news/databases/(default)/documents/news_posts?pageSize=300&key=' + encodeURIComponent(firebaseConfig.apiKey);
        const headers = {};
        if (ENABLE_APP_CHECK) {
            try {
                const tokenResult = await firebase.appCheck().getToken(false);
                if (tokenResult && tokenResult.token) {
                    headers['X-Firebase-AppCheck'] = tokenResult.token;
                }
            } catch (appCheckErr) {
                console.warn('App Check token unavailable for REST read:', appCheckErr);
            }
        }
        const response = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
        if (!response.ok) throw new Error('Firestore REST HTTP ' + response.status);
        const payload = await response.json();
        return (payload.documents || []).map(doc => ({
            id: doc.name.split('/').pop(),
            ...Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, firestoreRestValue(v)]))
        })).map(item => ({
            ...item,
            createdAt: timestampToMillis(item.createdAt) || timestampToMillis(item.timestamp),
            timestamp: timestampToMillis(item.timestamp) || timestampToMillis(item.createdAt)
        })).sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
    }

    async function loadNewsWithTTL(forceRefresh = false) {
        try { await appCheckReady; } catch (e) {}
        const cached = localStorage.getItem('cached_news_list');

        if (cached) {
            try {
                const cachedList = JSON.parse(cached);
                if (Array.isArray(cachedList) && cachedList.length) {
                    newsList = cachedList;
                    const lead = newsList.find(n => n.isLead) || newsList[0];
                    if (lead) setLeadStory(lead);
                    updateBreakingTicker(newsList);
                    renderNews(newsList);
                }
            } catch (e) {
                localStorage.removeItem('cached_news_list');
                localStorage.removeItem('ckn_news_time');
            }
        }

        if (!ENABLE_APP_CHECK) {
            try {
                const restList = await loadNewsViaRest();
                if (restList.length) {
                newsList = restList;
                safeStoreNews(restList);
                const lead = restList.find(n => n.isLead) || restList[0];
                if (lead) setLeadStory(lead);
                updateBreakingTicker(restList);
                renderNews(restList);
                return;
                }
            } catch (restErr) {
                console.warn('News REST-first read failed:', restErr);
            }
        }

        try {
            let snapshot;
            try {
                snapshot = await db.collection('news_posts').orderBy('createdAt', 'desc').limit(300).get({ source: 'server' });
            } catch (orderedErr) {
                console.warn('Ordered news query failed, using compatibility fallback:', orderedErr);
                snapshot = await db.collection('news_posts').limit(1000).get({ source: 'server' });
            }

            const fetchedList = snapshot.docs
                .map(doc => normalizeDoc(doc))
                .filter(item => item && item.id)
                .sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));

            if (fetchedList.length) {
                newsList = fetchedList;
                safeStoreNews(fetchedList);
                const lead = fetchedList.find(n => n.isLead) || fetchedList[0];
                if (lead) setLeadStory(lead);
                updateBreakingTicker(fetchedList);
                renderNews(fetchedList);
                return;
            }

            if (!newsList.length) renderNews([]);
        } catch (err) {
            console.error('News SDK read failed:', err);
            if (!newsList.length) {
                renderNews([]);
                const count = document.getElementById('news-count');
                if (count) count.textContent = 'खबरें लोड नहीं हो सकीं';
                const container = document.getElementById('news-container');
                if (container) {
                    container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500 bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-800"><b>समाचार अभी लोड नहीं हो सके।</b><div class="text-xs mt-2">कृपया पेज रीफ्रेश करें।</div></div>';
                }
            }
        }
    }

    function loadWidgetData(forceRefresh = false) {
        const cachedJobs = localStorage.getItem('ckn_cached_jobs');
        const cachedElec = localStorage.getItem('ckn_cached_elec');
        const lastWidgetTime = parseInt(localStorage.getItem('ckn_widget_time') || '0', 10);
        const now = Date.now();

        if (cachedJobs) renderJobsHTML(JSON.parse(cachedJobs));
        if (cachedElec) renderElecHTML(JSON.parse(cachedElec));

        if (forceRefresh || !cachedJobs || (now - lastWidgetTime) > TTL) {
            db.collection('job_alerts').limit(5).get().then(snapshot => {
                let jobs = snapshot.docs.map(doc => normalizeDoc(doc));
                jobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                try { localStorage.setItem('ckn_cached_jobs', JSON.stringify(jobs)); } catch(e) {}
                renderJobsHTML(jobs);
            }).catch(() => {});

            db.collection('election_docs').limit(5).get().then(snapshot => {
                let docs = snapshot.docs.map(doc => normalizeDoc(doc));
                docs.sort((a, b) => (b.createdAt || 0) - (b.createdAt || 0));
                try {
                    localStorage.setItem('ckn_cached_elec', JSON.stringify(docs));
                    localStorage.setItem('ckn_widget_time', now.toString());
                } catch(e) {}
                renderElecHTML(docs);
            }).catch(() => {});
        }
    }

    function renderJobsHTML(jobs) {
        const jobContainer = document.getElementById('job-alerts-list');
        if (!jobs || !jobs.length) {
            jobContainer.innerHTML = '<p class="text-center text-xs text-gray-400 py-4">कोई सक्रिय फॉर्म नहीं है।</p>';
            return;
        }
        jobContainer.innerHTML = jobs.slice(0, 5).map(job => `
            <div class="p-2.5 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-800">
                <b class="text-gray-900 dark:text-white text-xs">${escapeHTML(job.title)}</b>
                <div class="flex justify-between items-center text-[10px] text-gray-500 mt-1">
                    <span>${escapeHTML(job.posts || '')}</span>
                    <span class="text-red-500 font-semibold">अंतिम तिथि: ${escapeHTML(job.lastDate)}</span>
                </div>
                <a href="${sanitizeUrl(job.link || '#')}" target="_blank" rel="noopener noreferrer" class="block text-center mt-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 py-1 rounded text-[10px] font-bold">विवरण देखें / फॉर्म भरें</a>
            </div>
        `).join('');
    }

    function renderElecHTML(docs) {
        const elecContainer = document.getElementById('election-widget-list');
        if (!docs || !docs.length) {
            elecContainer.innerHTML = '<p class="text-center text-xs text-gray-400 py-4">दस्तावेज़ उपलब्ध नहीं हैं।</p>';
            return;
        }
        elecContainer.innerHTML = docs.map(doc => `
            <div class="p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-900 mb-2">
                <p class="font-bold text-amber-900 dark:text-amber-200">📄 ${escapeHTML(doc.title)}</p>
                <p class="text-[11px] text-gray-600 dark:text-gray-300 mt-1">${escapeHTML(doc.subtitle || '')}</p>
                <div class="flex gap-2 mt-2">
                    <a href="${sanitizeUrl(doc.link)}" target="_blank" rel="noopener noreferrer" class="flex-1 text-center bg-amber-600 hover:bg-amber-700 text-white py-1 rounded font-bold text-[11px]">दस्तावेज़ देखें</a>
                    ${isAdminLoggedIn ? `<button onclick="deleteElectionDoc('${doc.id}')" class="bg-red-600 text-white px-2 py-1 rounded text-[10px]">डिलीट</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    function loadScore() {
        db.collection('live_score').doc('current').get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('match-title').innerText = data.title || '';
                document.getElementById('match-score').innerText = data.score || '';
                document.getElementById('match-status').innerText = data.status || '';
            }
        }).catch(() => {});
    }

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const pwaBtn = document.getElementById('pwa-install-btn');
        if (pwaBtn) pwaBtn.style.display = 'inline-flex';
    });

    function triggerPwaInstall() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((res) => {
                if (res.outcome === 'accepted') document.getElementById('pwa-install-btn').style.display = 'none';
                deferredPrompt = null;
            });
        }
    }

    async function enablePushNotifications() {
        const safeMessaging = await getMessagingSafe();
        if (!('Notification' in window) || !safeMessaging) {
            alert("यह डिवाइस वेब पुश नोटिफिकेशन सपोर्ट नहीं करता।");
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                await navigator.serviceWorker.ready;
                const token = await messaging.getToken({
                    vapidKey: "BIs4iab2gPUGk3EQu8xD6KVU4d0a81aa2VRQdZ61n9N5_uIseC8ob6yAlQQyrsiIIINBmNOKvO8Dq6x4R8Zu9kA",
                    serviceWorkerRegistration: registration
                });
                if (token) {
                    await db.collection('fcm_subscribers').doc(token).set({
                        token: token,
                        platform: navigator.userAgent,
                        subscribedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    alert("🔔 समाचार नोटिफिकेशन सफलतापूर्वक चालू हो गए हैं!");
                }
            }
        } catch (err) {
            alert("नोटिफिकेशन शुरू करने में समस्या: " + err.message);
        }
    }

    window.addEventListener('error', (event) => {
        console.error('CKN runtime error:', event.error || event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
        console.error('CKN unhandled rejection:', event.reason);
    });

    window.addEventListener('DOMContentLoaded', () => {
        loadNewsWithTTL().catch(err => console.error('News startup failed:', err));

        try { fetchLiveWeather().catch(() => {}); } catch (e) {}
        try { if (localStorage.getItem('ckn_cookies_accepted') === 'true') loadAnalytics(); } catch (e) {}
        try { checkCookieConsent(); } catch (e) {}

        try {
            auth.onAuthStateChanged(async user => {
                try {
                    if (user && user.uid === ADMIN_UID) {
                        onAdminSuccess(user.email);
                    } else if (user) {
                        await auth.signOut().catch(() => {});
                    }
                } catch (e) {
                    console.error('Auth state error:', e);
                }
            });
        } catch (e) {
            console.error('Auth listener error:', e);
        }

        try { loadWidgetData(); } catch (e) { console.error('Widget load error:', e); }
        try { loadPanchayatElectionData(); } catch (e) { console.error('Election widget error:', e); }
        try { loadScore(); } catch (e) { console.error('Score load error:', e); }
    });

    window.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
            e.preventDefault();
            openPortalModal('admin-modal');
        }
    });
