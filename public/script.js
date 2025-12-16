// ==========================================
// 1. FIREBASE CONFIGURATION (CDN VERSION)
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyAnv3KrMkmFir1-FLaqIGSOb6r_LQbXMOk",
    authDomain: "smartcropai-b5333.firebaseapp.com",
    projectId: "smartcropai-b5333",
    storageBucket: "smartcropai-b5333.firebasestorage.app",
    messagingSenderId: "1043033583492",
    appId: "1:1043033583492:web:ac148075c6ad95eec537d1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null; 

// ==========================================
// 2. DATA & CONSTANTS
// ==========================================
const CROP_LIST = [
    "Rice", "Wheat", "Maize (Corn)", "Potato", "Tomato", "Onion", "Soybean", 
    "Cotton", "Sugarcane", "Barley", "Sorghum", "Millet", "Groundnut", "Mustard",
    "Sunflower", "Chickpea", "Lentil", "Peas", "Kidney Beans", "Eggplant (Brinjal)",
    "Chili Pepper", "Okra", "Cabbage", "Cauliflower", "Spinach", "Lettuce", "Cucumber",
    "Pumpkin", "Watermelon", "Muskmelon", "Carrot", "Radish", "Beetroot", "Ginger",
    "Turmeric", "Garlic", "Coriander", "Banana", "Mango", "Papaya", "Guava", 
    "Lemon", "Orange", "Apple", "Grapes", "Strawberry", "Tea", "Coffee", "Coconut",
    "Rubber", "Jute", "Vanilla", "Dragon Fruit", "Avocado", "Quinoa", "Chia Seeds"
];

const AMAZON_DOMAINS = {
    'IN': 'amazon.in',   // India
    'US': 'amazon.com',  // USA
    'GB': 'amazon.co.uk',// UK
    'JP': 'amazon.co.jp',// Japan
    'DE': 'amazon.de',   // Germany
    'FR': 'amazon.fr',   // France
    'CA': 'amazon.ca',   // Canada
    'AU': 'amazon.com.au'// Australia
};

const AQI_MAP = { 
    1: { label: "Good", class: "aqi-good" }, 
    2: { label: "Fair", class: "aqi-fair" }, 
    3: { label: "Moderate", class: "aqi-moderate" }, 
    4: { label: "Poor", class: "aqi-poor" }, 
    5: { label: "Very Poor", class: "aqi-very-poor" } 
};

let currentCropMapData = { country: "", world: "" };

// ==========================================
// 3. HELPERS
// ==========================================
function formatText(text) {
    if (!text) return "N/A";
    return String(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function cleanTipText(t) {
    if (!t) return "No specific tip.";
    let raw = t;
    if (typeof t === 'object') {
        raw = t.tip_details || t.text || t.tip || Object.values(t).join(': ');
    }
    return formatText(String(raw));
}

function toTitleCase(s) { return s ? s.replace(/\b\w/g, l => l.toUpperCase()) : ""; }
function formatTime(u, o) { const d = new Date((u+o)*1000); return d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }); }
function getCardinalDirection(a) { return ['N','NE','E','SE','S','SW','W','NW'][Math.round(a/45)%8]; }

// ==========================================
// 4. INITIALIZATION & AUTH
// ==========================================
window.onload = function() {
    // Theme Check
    const savedTheme = localStorage.getItem('theme') || 'dark-mode';
    if(savedTheme === 'light-mode') document.body.classList.add('light-mode');
    updateThemeIcon();

    // Auth Listener
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            updateUIForLogin(user);
            loadUserData(user.uid);
        } else {
            currentUser = null;
            updateUIForLogout();
            
            // Load local preferences if no user
            const localCity = localStorage.getItem('user_city');
            if(localCity) {
                updateTopBarLocation(localCity);
                getWeather(localCity);
                updateHomeWeatherPreview(localCity);
            } else {
                updateTopBarLocation("Unknown");
            }
        }
    });

    setupAutocomplete();
    injectQuickWeatherModal();

    // Global Click Listener
    document.addEventListener('click', e => {
        if (!e.target.closest('.nav-user') && !e.target.closest('.sidebar-footer')) {
            document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show'));
        }
        if (!e.target.closest('.search-container-styled')) {
            const box = document.getElementById('suggestions-box');
            if(box) box.style.display = 'none';
        }
    });
};

/* --- REPLACE window.getWeather IN SCRIPT.JS --- */
window.getWeather = async function(city) {
    const resultBox = document.getElementById('weatherResult');
    
    // 1. Check for valid city
    if (!city || city === "Unknown") {
        resultBox.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa;">Please set your location in Profile.</div>`;
        return;
    }

    try {
        const res = await fetch(`/weather?city=${encodeURIComponent(city)}`);
        const data = await res.json();

        // 2. ERROR CHECK
        if (data.error) {
            resultBox.innerHTML = `<div style="text-align:center; color:#ff6b6b; padding:20px;">Error: ${data.error}</div>`;
            return;
        }

        // 3. Save Country for Market
        if (data.sys && data.sys.country) localStorage.setItem('user_country', data.sys.country);

        // 4. Extract Data
        const temp = Math.round(data.main.temp);
        const desc = toTitleCase(data.weather[0].description);
        const hum = data.main.humidity;
        const windS = data.wind.speed;
        const windD = data.wind.deg;
        const windDirStr = getCardinalDirection(windD);
        const aqiVal = data.aqi_index || 1; 
        const aqiInfo = AQI_MAP[aqiVal] || { label: "Good", class: "aqi-good" };

        // 5. Render Main Weather Widget (Bento Grid)
        resultBox.innerHTML = `
            <div class="weather-hero">
                <div style="font-size:1.5rem; color:var(--accent-color);">${data.name}, ${data.sys.country}</div>
                <div class="hero-temp">${temp}°</div>
                <div class="hero-desc">${desc}</div>
                <div class="hero-hl">H: ${Math.round(data.main.temp_max)}° L: ${Math.round(data.main.temp_min)}°</div>
            </div>
            <div class="weather-bento-grid">
                <div class="bento-card"><div class="bento-title"><i class="fa-solid fa-temperature-half icon-yellow"></i> RealFeel®</div><div class="bento-value">${Math.round(data.main.feels_like)}°</div></div>
                <div class="bento-card"><div class="bento-title"><i class="fa-solid fa-wind icon-blue"></i> Wind</div><div class="bento-value">${windS} <small>m/s</small></div><div class="bento-sub">${windDirStr} (${windD}°)</div></div>
                <div class="bento-card"><div class="bento-title"><i class="fa-solid fa-droplet icon-blue"></i> Humidity</div><div class="bento-value">${hum}%</div></div>
                <div class="bento-card ${aqiInfo.class}"><div class="bento-title"><i class="fa-solid fa-lungs icon-green"></i> AQI</div><div class="bento-value">${aqiVal} <small>${aqiInfo.label}</small></div></div>
                <div class="bento-card"><div class="bento-title"><i class="fa-regular fa-eye icon-purple"></i> Visibility</div><div class="bento-value">${(data.visibility/1000).toFixed(1)} km</div></div>
                <div class="bento-card"><div class="bento-title"><i class="fa-solid fa-gauge icon-red"></i> Pressure</div><div class="bento-value">${data.main.pressure} hPa</div></div>
            </div>`;
        
        // 6. FIX: Render Hover Popup (Compass + Humidity)
        const popup = document.getElementById('hover-weather-details');
        if(popup) {
            // We use an SVG arrow rotated by CSS
            const arrowSVG = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="transform: rotate(${windD}deg); transition: transform 0.5s;"><path d="M12 2L4.5 20.29C4.24 20.89 4.81 21.5 5.4 21.2L12 18l6.6 3.2c.59.29 1.16-.32.9-.92L12 2z" fill="#a8ffb8"/></svg>`;
            
            popup.innerHTML = `
                <div class="mini-header">${data.name}</div>
                <div class="mini-row"><span>Current</span> <span class="mini-val" style="color:var(--accent-color);">${temp}°C</span></div>
                <div class="mini-row"><span>Condition</span> <span class="mini-val">${desc}</span></div>
                <div class="mini-row"><span>Humidity</span> <span class="mini-val">${hum}%</span></div>
                
                <div class="compass-container">
                    <div class="compass-dial" style="border: 2px solid rgba(255,255,255,0.2); border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center;">
                        ${arrowSVG}
                    </div>
                    <div class="wind-detail">
                        <div class="wind-speed-big" style="font-weight:bold; font-size:1.1rem;">${windS} <small style="font-size:0.7rem; font-weight:400; color:#aaa;">m/s</small></div>
                        <div class="wind-dir-text" style="font-size:0.8rem; color:#a8ffb8;">${windDirStr}</div>
                    </div>
                </div>`;
        }
    } catch(e) { 
        console.error(e);
        resultBox.innerHTML = `<div style="text-align:center; color:#ff6b6b; padding:20px;">Weather unavailable. Check API Key.</div>`; 
    }
}

// ==========================================
// 6. CROP DATABASE (Fixed: No Auto-Search)
// ==========================================
function setupAutocomplete() {
    const input = document.getElementById('crop-db-search');
    const box = document.getElementById('suggestions-box');

    if (!input || !box) return;

    input.addEventListener('input', function() {
        const val = this.value.toLowerCase();
        box.innerHTML = '';
        if (!val) { box.style.display = 'none'; return; }

        const matches = CROP_LIST.filter(c => c.toLowerCase().includes(val));
        
        if (matches.length > 0) {
            matches.slice(0, 6).forEach(crop => { 
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `<i class="fa-solid fa-leaf"></i> ${crop}`;
                // FIXED: Just fill input, do NOT auto search
                div.onclick = () => { input.value = crop; box.style.display = 'none'; };
                box.appendChild(div);
            });
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
        }
    });

    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { box.style.display = 'none'; searchCropDB(); }
    });
}

window.loadCropRecommendations = async function() {
    const city = localStorage.getItem('user_city');
    const list = document.getElementById('rec-list');
    
    // Check for missing city
    if (!city || city === "Unknown") {
        document.getElementById('rec-city-name').innerText = "Unknown Location";
        list.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa; grid-column: span 2;">
            <i class="fa-solid fa-location-dot" style="margin-bottom:10px; font-size: 1.5rem;"></i><br>
            Please set your location in Profile to see recommendations.
        </div>`;
        return;
    }

    document.getElementById('rec-city-name').innerText = city;
    list.innerHTML = '<span class="placeholder-text"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing local soil & weather...</span>';
    
    try {
        const wRes = await fetch(`/weather?city=${encodeURIComponent(city)}`);
        const wData = await wRes.json();
        
        const res = await fetch('/recommend-crops', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ city: city, weather: { temp: wData.main.temp, humidity: wData.main.humidity } })
        });
        
        const data = await res.json();
        
        if (data.recommendations && data.recommendations.length > 0) {
            let html = '';
            data.recommendations.forEach(crop => {
                let badgeColor = crop.difficulty === 'Easy' ? '#4CAF50' : (crop.difficulty === 'Medium' ? '#FFC107' : '#F44336');
                html += `
                <div class="rec-card" onclick="document.getElementById('crop-db-search').value='${crop.name}';">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>${crop.name}</strong>
                        <span style="font-size:0.7rem; background:${badgeColor}; color:#000; padding:2px 6px; border-radius:4px;">${crop.difficulty}</span>
                    </div>
                    <p style="font-size:0.85rem; color:#ccc; margin-top:5px;">${crop.reason}</p>
                </div>`;
            });
            list.innerHTML = html;
        } else {
            list.innerHTML = `<span class="placeholder-text">No specific recommendations found.</span>`;
        }
    } catch (e) { 
        list.innerHTML = `<span class="error-msg" style="color:#ff6b6b">Could not load recommendations. Check connection.</span>`; 
    }
}

window.searchCropDB = async function(query = null) {
    const term = query || document.getElementById('crop-db-search').value;
    if (!term) return alert("Enter a crop name!");
    
    document.getElementById('crop-recommendations').style.display = 'none';
    document.getElementById('crop-detail-view').style.display = 'block';
    
    document.getElementById('cd-name').innerText = "Analyzing " + term + "...";
    document.getElementById('cd-score-val').innerText = "--";
    document.getElementById('cd-score-circle').className = "score-circle"; 
    document.getElementById('cd-tips').innerHTML = ""; 
    document.getElementById('map-display-area').innerHTML = "Loading region data...";
    
    const city = localStorage.getItem('user_city') || "Unknown";
    
    try {
        const wRes = await fetch(`/weather?city=${encodeURIComponent(city)}`);
        const wData = await wRes.json();
        
        const res = await fetch('/crop-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ crop: term, city: city, weather: { temp: wData.main.temp, humidity: wData.main.humidity } })
        });
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const info = data.basic_info || {};
        const eco = data.economics || {};
        const suit = data.suitability || {};
        const reg = data.regions || {};

        document.getElementById('cd-name').innerText = term;
        document.getElementById('cd-sci').innerText = info.scientific_name || "N/A";
        document.getElementById('cd-profit').innerText = `${eco.profit_potential || "Medium"} (${eco.market_demand || "Stable"} Demand)`;
        document.getElementById('cd-duration').innerText = info.duration || "N/A";

        const tips = data.farming_tips || [];
        document.getElementById('cd-tips').innerHTML = tips.map(t => `<li>${cleanTipText(t)}</li>`).join('');
        
        let score = parseInt(String(suit.score || 50).replace(/\D/g, '')) || 50;
        document.getElementById('cd-score-val').innerText = score;
        
        const circle = document.getElementById('cd-score-circle');
        circle.className = "score-circle"; 
        if (score >= 70) { circle.classList.add('green'); document.getElementById('cd-analysis').style.borderLeftColor = '#4CAF50'; }
        else if (score >= 40) { circle.classList.add('yellow'); document.getElementById('cd-analysis').style.borderLeftColor = '#FFC107'; }
        else { circle.classList.add('red'); document.getElementById('cd-analysis').style.borderLeftColor = '#F44336'; }
        
        document.getElementById('cd-analysis').innerHTML = formatText(suit.analysis || "Analysis unavailable.");
        
        // FIX: Save Region Data Correctly
        currentCropMapData = {
            country: reg.country_growth_areas || "No data available for this country.",
            world: reg.global_growth_areas || "No global data available."
        };
        switchMap('country'); 

    } catch (e) {
        alert("Search Failed: " + e.message);
        closeCropDetail();
    }
}

window.switchMap = function(type) {
    const area = document.getElementById('map-display-area');
    const btns = document.querySelectorAll('.map-btn');
    btns.forEach(b => b.classList.remove('active'));
    Array.from(btns).find(b => b.innerText.toLowerCase() === type).classList.add('active');
    
    const content = currentCropMapData[type];
    area.innerHTML = `
    <div style="padding:20px; text-align:left;">
        <strong style="color:#a8ffb8; display:block; margin-bottom:10px;">${type.toUpperCase()} REGIONS:</strong>
        <p style="color:#ddd; line-height:1.6;">${formatText(content)}</p>
    </div>`;
}

// ==========================================
// 7. CROP DOCTOR (Formatted & Clean)
// ==========================================
window.analyzeCrop = async function() {
    const i = document.getElementById('imageInput');
    if (!i.files[0]) return alert("Select an image first!");

    const l = localStorage.getItem('user_city') || "Unknown";
    const resultBox = document.getElementById('analysisResult');
    
    resultBox.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa;">
        <i class="fa-solid fa-spinner fa-spin"></i> Analyzing plant health...
    </div>`;

    const f = new FormData();
    f.append('image', i.files[0]);
    f.append('location', l);

    try {
        const r = await fetch('/analyze', { method: 'POST', body: f });
        const d = await r.json();
        
        let text = d.result;

        // 1. Clean Bold Markers
        text = text.replace(/\*\*/g, ''); 

        // 2. Format Headers (Diagnosis, Prevention, etc.)
        const headers = ["DIAGNOSIS:", "CAUSES:", "TREATMENT:", "PREVENTION:", "SYMPTOMS:"];
        headers.forEach(header => {
            const regex = new RegExp(header, "gi");
            text = text.replace(regex, `<br><br><div class="analysis-header" style="color:#a8ffb8; font-weight:bold; border-bottom:1px solid rgba(255,255,255,0.1); margin-bottom:5px;">${header}</div>`);
        });

        if (text.trim().startsWith('<br>')) text = text.replace('<br><br>', '');

        resultBox.innerHTML = text;

        if (currentUser) {
            db.collection('users').doc(currentUser.uid).collection('history').add({
                timestamp: new Date(),
                location: l,
                result: d.result
            });
        }
    } catch (e) {
        console.error(e);
        resultBox.innerText = "Analysis failed. Please try again.";
    }
}

// ==========================================
// 8. FERTILIZER (With Unit Conversion)
// ==========================================
window.calculateFertilizer = function() {
    const n = parseFloat(document.getElementById('n-percent').value);
    const t = parseFloat(document.getElementById('target-n-rate').value);
    let area = parseFloat(document.getElementById('area-size').value);
    const unit = document.getElementById('area-unit').value;

    if (n && t && area) {
        if (unit === 'ha') area = area * 10000;
        else if (unit === 'acre') area = area * 4046.86;

        const result = ((area / 100) * (t / (n / 100))).toFixed(2);
        document.getElementById('result').innerText = `Total Fertilizer Needed: ${result} kg`;
    } else {
        document.getElementById('result').innerText = "Please fill in all fields.";
    }
}

// ==========================================
// 9. SMART MARKET (Location Aware)
// ==========================================
window.checkEnterMarket = function(e) { if (e.key === "Enter") searchAmazon(); }

window.searchAmazon = async function() {
    const query = document.getElementById('market-search').value;
    if (!query) return alert("Please enter a product name.");

    const resultsDiv = document.getElementById('market-results');
    const loadingDiv = document.getElementById('market-loading');
    
    resultsDiv.innerHTML = '';
    loadingDiv.style.display = 'block';

    const city = localStorage.getItem('user_city') || "Unknown Location";
    const countryCode = localStorage.getItem('user_country') || "US";
    
    try {
        const res = await fetch('/market-recommendations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, location: city })
        });
        
        const data = await res.json();
        loadingDiv.style.display = 'none';

        if(data.products && data.products.length > 0) {
            data.products.forEach(prod => {
                const domain = AMAZON_DOMAINS[countryCode] || 'amazon.com';
                const searchUrl = `https://www.${domain}/s?k=${encodeURIComponent(prod.name)}`;
                
                const card = document.createElement('div');
                card.className = 'product-card';
                card.onclick = () => window.open(searchUrl, '_blank');
                card.innerHTML = `<div class="prod-name">${prod.name}</div><div class="prod-price">${prod.price}</div><div class="prod-reason">${prod.reason}</div><div class="amazon-link-hint"><i class="fa-brands fa-amazon"></i> Buy on ${domain}</div>`;
                resultsDiv.appendChild(card);
            });
        } else {
            throw new Error("No AI results");
        }
    } catch (e) {
        loadingDiv.style.display = 'none';
        const domain = AMAZON_DOMAINS[countryCode] || 'amazon.com';
        window.open(`https://www.${domain}/s?k=${encodeURIComponent(query)}`, '_blank');
    }
}

// ==========================================
// 10. GENERAL UI & LOCATION
// ==========================================
function formatUsername(name) { if(!name) return "User"; let f = name.trim(); return f.length > 30 ? f.substring(0, 30) + "..." : f; }
window.syncAvatarLetter = function() { const i = document.getElementById('edit-display-name').value; document.getElementById('edit-avatar-preview').innerText = i ? i.trim().charAt(0).toUpperCase() : "U"; }
function updateUIForLogin(user) { document.querySelector('.nav-user').classList.add('logged-in'); let rawName = user.displayName; if(!rawName && user.email) rawName = user.email.split('@')[0]; const finalName = formatUsername(rawName); document.getElementById('user-name-top').innerText = finalName; document.getElementById('user-name-side').innerText = finalName; document.getElementById('edit-display-name').value = finalName; const initial = finalName.charAt(0).toUpperCase(); document.getElementById('user-avatar-top').innerText = initial; document.getElementById('user-avatar-side').innerText = initial; document.getElementById('edit-avatar-preview').innerText = initial; document.getElementById('user-name-top').style.display='block'; document.getElementById('sidebar-login-btn').style.display='none'; document.getElementById('sidebar-user-section').style.display='block'; }
function updateUIForLogout() { document.querySelector('.nav-user').classList.remove('logged-in'); document.getElementById('user-name-top').style.display = 'none'; document.getElementById('sidebar-user-section').style.display = 'none'; document.getElementById('sidebar-login-btn').style.display = 'flex'; }
async function loadUserData(uid) { try { const doc = await db.collection('users').doc(uid).get(); if (doc.exists) { const data = doc.data(); if(data.displayName) { currentUser.displayName = data.displayName; updateUIForLogin(currentUser); } if (data.savedCity) { localStorage.setItem('user_city', data.savedCity); updateTopBarLocation(data.savedCity); getWeather(data.savedCity); document.getElementById('edit-city').value = data.savedCity; } } } catch (err) {} }

window.toggleProfileDropdown = function(location) { if (!currentUser) return toggleAuthModal(); document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show')); if (location === 'top') document.getElementById('top-dropdown').classList.add('show'); else document.getElementById('side-dropdown').classList.add('show'); event.stopPropagation(); }
window.openEditProfile = function() { if (!currentUser) return; document.getElementById('edit-profile-drawer').classList.add('open'); document.getElementById('drawer-overlay').style.display = 'block'; document.getElementById('edit-display-name').value = currentUser.displayName || ""; document.getElementById('edit-email').value = currentUser.email; }
window.closeEditProfile = function() { document.getElementById('edit-profile-drawer').classList.remove('open'); document.getElementById('drawer-overlay').style.display = 'none'; }
window.saveProfileChanges = async function() { const newName = document.getElementById('edit-display-name').value.trim(); const city = document.getElementById('edit-city').value.trim(); if(!newName) return alert("Name required"); const btn = document.querySelector('#edit-profile-drawer .action-btn'); const oldText = btn.innerText; btn.innerText = "Saving..."; try { await currentUser.updateProfile({ displayName: newName }); const updateData = { displayName: newName }; if(city) updateData.savedCity = city; await db.collection('users').doc(currentUser.uid).set(updateData, { merge: true }); updateUIForLogin(currentUser); if(city) { localStorage.setItem('user_city', city); updateTopBarLocation(city); getWeather(city); } closeEditProfile(); } catch (e) { alert(e.message); } finally { btn.innerText = oldText; } }

window.toggleSubmenu = function(menuId, parentEl) { const submenu = document.getElementById(menuId); if (window.getComputedStyle(submenu).display !== 'none') { submenu.style.display = 'none'; parentEl.classList.remove('open'); } else { submenu.style.display = 'block'; parentEl.classList.add('open'); } }
window.toggleSidebar = function() { document.getElementById('sidebar').classList.toggle('active'); }
/* --- REPLACE window.showSection IN SCRIPT.JS --- */
window.showSection = function(id) {
    // 1. Hide all sections
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active-section'));
    
    // 2. Show selected section
    const target = document.getElementById(id);
    if(target) target.classList.add('active-section');
    
    // 3. Close Sidebar on mobile
    document.getElementById('sidebar').classList.remove('active');
    
    // 4. Handle Submenu Logic
    const cropParent = document.getElementById('link-crop-parent');
    const cropMenu = document.getElementById('crop-submenu');

    // IF we are opening ANY Crop Tool (DB or Calendar), keep menu open
    if(id === 'crop-db-section' || id === 'calendar-section') {
        cropParent.classList.add('open'); 
        cropMenu.style.display = 'block';

        // Trigger specific loaders
        if (id === 'crop-db-section' && localStorage.getItem('user_city')) {
            loadCropRecommendations();
        }
        if (id === 'calendar-section') {
            loadCropCalendar();
        }
    } else {
        // Close menu if going elsewhere
        cropParent.classList.remove('open'); 
        cropMenu.style.display = 'none';
    }
}

window.getDeviceLocation = function() {
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    const btn = document.querySelector('.geo-btn'); const oldIcon = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; 
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const res = await fetch('/reverse-geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude }) });
            const data = await res.json();
            if (data.city) {
                document.getElementById('edit-city').value = data.city;
                if(data.country) localStorage.setItem('user_country', data.country);
                alert(`Found: ${data.city}`);
            }
        } catch (e) { alert("Could not find city."); } finally { btn.innerHTML = oldIcon; }
    }, () => { alert("Permission denied."); btn.innerHTML = oldIcon; });
}

window.toggleLocationPopup = function() { const p = document.getElementById('location-popup'); p.style.display = (p.style.display === 'flex') ? 'none' : 'flex'; }
window.updateTopBarLocation = function(c) { document.getElementById('top-location-text').innerText = c; }
window.checkEnter = function(e) { if (e.key === "Enter") updateLocationFromPopup(); }
window.checkEnterHome = function(e) { if (e.key === "Enter") handleHomeSearch(); }
window.updateLocationFromPopup = function() { let c = document.getElementById('popupCityInput').value; if (c) { c = toTitleCase(c); localStorage.setItem('user_city', c); updateTopBarLocation(c); getWeather(c); toggleLocationPopup(); if (currentUser) db.collection('users').doc(currentUser.uid).set({ savedCity: c }, { merge: true }); } }
window.handleHomeSearch = function() { let c = document.getElementById('homeSearchInput').value; if (c) { c = toTitleCase(c); localStorage.setItem('user_city', c); updateTopBarLocation(c); getWeather(c); if (currentUser) db.collection('users').doc(currentUser.uid).set({ savedCity: c }, { merge: true }); } }

window.toggleTheme = function() { document.body.classList.toggle('light-mode'); localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light-mode' : 'dark-mode'); updateThemeIcon(); }
function updateThemeIcon() { const btn = document.getElementById('theme-toggle'); if(btn) btn.innerHTML = document.body.classList.contains('light-mode') ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>'; }
window.switchDoctorTab = function(t) { document.getElementById('doctor-view-new').style.display=t==='new'?'block':'none'; document.getElementById('doctor-view-history').style.display=t==='history'?'block':'none'; document.getElementById('tab-new').classList.toggle('active-tab',t==='new'); document.getElementById('tab-history').classList.toggle('active-tab',t==='history'); }
window.loadHistory = async function() { window.switchDoctorTab('history'); const l=document.getElementById('history-list'); if(!currentUser)return l.innerHTML='Login required'; l.innerHTML='Fetching...'; try{const s=await db.collection('users').doc(currentUser.uid).collection('history').orderBy('timestamp','desc').get(); l.innerHTML=s.empty?"No history":s.docs.map(d=>`<div class="history-card"><div>${new Date(d.data().timestamp.seconds*1000).toLocaleDateString()}</div><small>${d.data().result.substring(0,50)}...</small></div>`).join(''); }catch(e){l.innerHTML='Error loading history.';} }
window.resetDoctor=function(){document.getElementById('imageInput').value="";document.getElementById('preview-container').style.display='none';document.getElementById('analysisResult').innerHTML="";document.querySelector('#doctor-section .glass-card').classList.remove('diagnosis-mode');}
document.getElementById('imageInput').addEventListener('change',function(){if(this.files[0]){const r=new FileReader();r.onload=e=>{document.getElementById('imagePreview').src=e.target.result;document.getElementById('preview-container').style.display='block'};r.readAsDataURL(this.files[0]);}});
let isLoginMode = true;
window.toggleAuthModal = function() { const m=document.getElementById('auth-modal'); m.style.display=(m.style.display==='flex')?'none':'flex'; document.getElementById('auth-error').style.display='none'; }
window.switchAuthMode = function() { isLoginMode=!isLoginMode; document.getElementById('auth-title').innerText=isLoginMode?'Welcome Farmer':'Create Account'; document.getElementById('auth-action-btn').innerText=isLoginMode?'Log In':'Sign Up'; document.getElementById('auth-switch-text').innerText=isLoginMode?"Don't have an account?":"Already have an account?"; document.getElementById('auth-toggle-link').innerText=isLoginMode?"Sign Up":"Log In"; }
window.handleAuth = async function() { const e=document.getElementById('auth-email').value, p=document.getElementById('auth-pass').value; if(!e||!p){document.getElementById('auth-error').innerText="Fill all fields";document.getElementById('auth-error').style.display='block';return;} try{if(isLoginMode)await auth.signInWithEmailAndPassword(e,p);else{const c=await auth.createUserWithEmailAndPassword(e,p);await db.collection('users').doc(c.user.uid).set({email:e,createdAt:new Date(),savedCity:localStorage.getItem('user_city')||""});}toggleAuthModal();}catch(x){document.getElementById('auth-error').innerText=x.message;document.getElementById('auth-error').style.display='block';} }
window.logoutUser = async function() { await auth.signOut(); document.querySelectorAll('.dropdown-menu').forEach(el=>el.classList.remove('show')); showSection('home-section'); }
// ==========================================
// 11. CROP CALENDAR & PROFIT PLANNER
// ==========================================

/* --- REPLACE window.addCropPlan IN SCRIPT.JS --- */
window.addCropPlan = async function() {
    console.log("Generate Plan Clicked"); // Debug check

    if (!currentUser) return alert("Please login to save your farm plan.");
    
    // 1. Gather Inputs
    const crop = document.getElementById('plan-crop').value;
    const areaVal = document.getElementById('plan-area').value;
    const unit = document.getElementById('plan-unit').value;
    const city = localStorage.getItem('user_city') || "Unknown";

    if (!crop || !areaVal) return alert("Please enter a Crop Name and Area Size.");
    
    const area = parseFloat(areaVal);

    // UI Loading State
    const btn = document.getElementById('btn-add-plan');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI Calculating...';
    btn.disabled = true;

    try {
        console.log("Sending to AI:", { crop, area, unit, city });

        // 2. Get AI Analysis
        const res = await fetch('/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ crop, area, unit, city })
        });
        
        const data = await res.json();
        
        if(data.error) throw new Error(data.error);

        // 3. Calculate Financials
        // Strip non-numeric characters from AI string (e.g., "1500 kg" -> 1500)
        const yieldNum = parseFloat(String(data.yield_val).replace(/[^0-9.]/g, '')) || 0;
        
        const grossRevenue = yieldNum * data.future_price;
        const profit = grossRevenue - data.est_cost;
        
        // 4. Save to Firebase
        const planData = {
            crop, area, unit, city,
            createdAt: new Date(),
            yield: data.yield_val,
            water: data.water_val,
            suitability: data.suitability_score,
            reason: data.suitability_reason,
            duration: data.duration_days,
            cost: data.est_cost,
            revenue: grossRevenue,
            profit: profit,
            priceNow: data.current_price,
            priceLater: data.future_price
        };

        await db.collection('users').doc(currentUser.uid).collection('calendar').add(planData);
        
        alert(`Plan Generated! AI projects price rising from ${data.current_price} to ${data.future_price}.`);
        loadCropCalendar(); // Refresh the list below
        
        // Clear inputs
        document.getElementById('plan-crop').value = '';
        document.getElementById('plan-area').value = '';

    } catch (e) {
        console.error("Plan Error:", e);
        alert("Error creating plan: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
/* --- FIX 3: INDIAN NUMBERING SYSTEM --- */
window.loadCropCalendar = async function() {
    const list = document.getElementById('calendar-list');
    
    if (!currentUser) {
        list.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa;">Login to view your plans.</div>`;
        return;
    }

    try {
        const snap = await db.collection('users').doc(currentUser.uid).collection('calendar').orderBy('createdAt', 'desc').get();
        
        if (snap.empty) {
            list.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa;">No active plans. Add one above!</div>`;
            return;
        }

        // Helper for Indian Currency Formatting (₹ 1,50,000)
        const formatMoney = (amount) => {
            return Number(amount).toLocaleString('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
            });
        };

        let html = '';
        snap.forEach(doc => {
            const d = doc.data();
            const badgeClass = d.suitability >= 80 ? 'badge-high' : (d.suitability >= 50 ? 'badge-med' : 'badge-low');
            
            html += `
            <div class="plan-card">
                <button class="delete-plan-btn" onclick="deletePlan('${doc.id}')"><i class="fa-solid fa-trash"></i></button>
                <div class="plan-header">
                    <div class="plan-title">${d.crop} <small style="color:#888; font-size:0.8rem;">(${d.area} ${d.unit})</small></div>
                    <span class="plan-badge ${badgeClass}">${d.suitability}% Match</span>
                </div>
                
                <div class="plan-stats">
                    <div>
                        <div class="stat-row">Yield: <b>${d.yield_val || d.yield}</b></div>
                        <div class="stat-row">Time: <b>~${d.duration_days || d.duration} days</b></div>
                        <div class="stat-row" style="color:#a8ffb8; margin-top:5px;">
                            Price Trend: <b style="font-size:0.85rem;">${d.priceNow} ➝ ${d.priceLater}</b>
                        </div>
                    </div>
                    <div>
                        <div class="stat-row">Cost: <b>${formatMoney(d.est_cost || d.cost)}</b></div>
                        <div class="stat-row">Rev: <b>${formatMoney(d.revenue)}</b></div>
                    </div>
                </div>

                <div class="profit-section">
                    <div style="font-size:0.8rem; color:#ccc;">Projected Net Profit</div>
                    <div class="profit-val">${d.profit > 0 ? '+' : ''}${formatMoney(d.profit)}</div>
                </div>
            </div>`;
        });
        list.innerHTML = html;

    } catch (e) {
        console.error(e);
        list.innerHTML = `<div style="color:#ff6b6b">Error loading calendar.</div>`;
    }
}

window.deletePlan = async function(id) {
    if(confirm("Delete this plan?")) {
        await db.collection('users').doc(currentUser.uid).collection('calendar').doc(id).delete();
        loadCropCalendar();
    }
}
/* --- FIX: DASHBOARD WEATHER PREVIEW --- */
async function updateHomeWeatherPreview(city) {
    const previewEl = document.getElementById('home-weather-preview');
    if (!previewEl) return;

    if (!city || city === "Unknown") {
        previewEl.innerHTML = "Set Location";
        return;
    }

    try {
        const res = await fetch(`/weather?city=${encodeURIComponent(city)}`);
        const data = await res.json();
        
        if (data.error) throw new Error();

        // Update the card with temp and condition
        const temp = Math.round(data.main.temp);
        const desc = toTitleCase(data.weather[0].main); // Short description (e.g. "Rain")
        previewEl.innerHTML = `<b>${temp}°C</b> - ${desc}`;
        
    } catch (e) {
        previewEl.innerHTML = "Unavailable";
    }
}