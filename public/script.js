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

// Helper to capitalize first letter of every word
function toTitleCase(str) {
    if (!str) return "";
    return str.replace(/\b\w/g, l => l.toUpperCase());
}
function formatTime(u, o) { const d = new Date((u+o)*1000); return d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }); }
function getCardinalDirection(a) { return ['N','NE','E','SE','S','SW','W','NW'][Math.round(a/45)%8]; }

// ==========================================
// 4. INITIALIZATION & AUTH
// ==========================================
window.onload = function() {
    
    // --- ADD THESE 3 LINES ---
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }
    updateThemeIcon();
    // -------------------------

    // ... rest of your existing onload code ...
};
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


/* --- REPLACE YOUR EXISTING window.getWeather FUNCTION WITH THIS --- */
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

        // 3. Save Country (for Market feature)
        if (data.sys && data.sys.country) localStorage.setItem('user_country', data.sys.country);

        // 4. Extract Basic Weather Data
        const temp = Math.round(data.main.temp);
        const desc = toTitleCase(data.weather[0].description);
        const hum = data.main.humidity;
        const windS = data.wind.speed;
        const windD = data.wind.deg;
        const windDirStr = getCardinalDirection(windD);
        
        // ===============================================
        // 5. NEW AQI LOGIC (0-500 CPCB Scale)
        // ===============================================
        const aqiVal = data.aqi_val || 0; // Get the precise number (e.g. 142)
        
        let aqiInfo = { label: "Good", color: "#4CAF50" }; // Default Green

        if (aqiVal <= 50) { 
            aqiInfo = { label: "Good", color: "#4CAF50" }; // Green
        } else if (aqiVal <= 100) { 
            aqiInfo = { label: "Satisfactory", color: "#A4C639" }; // Light Green
        } else if (aqiVal <= 200) { 
            aqiInfo = { label: "Moderate", color: "#FFC107" }; // Yellow
        } else if (aqiVal <= 300) { 
            aqiInfo = { label: "Poor", color: "#FF9800" }; // Orange
        } else if (aqiVal <= 400) { 
            aqiInfo = { label: "Very Poor", color: "#F44336" }; // Red
        } else { 
            aqiInfo = { label: "Severe", color: "#8B0000" }; // Dark Red
        }

        // ===============================================
        // 6. RENDER THE WIDGET (With new AQI Card)
        // ===============================================
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
                
                <div class="bento-card" style="border-left: 4px solid ${aqiInfo.color};">
                    <div class="bento-title"><i class="fa-solid fa-lungs" style="color:${aqiInfo.color}"></i> AQI</div>
                    <div class="bento-value">${aqiVal} <small style="color:${aqiInfo.color}; font-size:0.6em;">${aqiInfo.label}</small></div>
                </div>

                <div class="bento-card"><div class="bento-title"><i class="fa-regular fa-eye icon-purple"></i> Visibility</div><div class="bento-value">${(data.visibility/1000).toFixed(1)} km</div></div>
                <div class="bento-card"><div class="bento-title"><i class="fa-solid fa-gauge icon-red"></i> Pressure</div><div class="bento-value">${data.main.pressure} hPa</div></div>
            </div>`;
        
        // 7. Render Hover Popup (Compass)
        const popup = document.getElementById('hover-weather-details');
        if(popup) {
            const arrowSVG = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="transform: rotate(${windD}deg); transition: transform 0.5s;"><path d="M12 2L4.5 20.29C4.24 20.89 4.81 21.5 5.4 21.2L12 18l6.6 3.2c.59.29 1.16-.32.9-.92L12 2z" fill="#a8ffb8"/></svg>`;
            popup.innerHTML = `
                <div class="mini-header">${data.name}</div>
                <div class="mini-row"><span>Current</span> <span class="mini-val" style="color:var(--accent-color);">${temp}°C</span></div>
                <div class="mini-row"><span>Condition</span> <span class="mini-val">${desc}</span></div>
                <div class="mini-row"><span>Humidity</span> <span class="mini-val">${hum}%</span></div>
                <div class="compass-container">
                    <div class="compass-dial" style="border: 2px solid rgba(255,255,255,0.2); border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center;">${arrowSVG}</div>
                    <div class="wind-detail">
                        <div class="wind-speed-big" style="font-weight:bold; font-size:1.1rem;">${windS} <small style="font-size:0.7rem; font-weight:400; color:#aaa;">m/s</small></div>
                        <div class="wind-dir-text" style="font-size:0.8rem; color:#a8ffb8;">${windDirStr}</div>
                    </div>
                </div>`;
        }
    } catch(e) { 
        console.error(e);
        resultBox.innerHTML = `<div style="text-align:center; color:#ff6b6b; padding:20px;">Weather unavailable.</div>`; 
    }
}

// ==========================================
// 6. CROP DATABASE (Fixed: No Auto-Search)
// ==========================================
function setupAutocomplete() {
    const input = document.getElementById('crop-db-search');
    const box = document.getElementById('suggestions-box');

    // Debug check
    if (!input) { console.warn("Autocomplete: 'crop-db-search' input not found."); return; }
    if (!box) { console.warn("Autocomplete: 'suggestions-box' div not found."); return; }

    input.addEventListener('input', function() {
        const val = this.value.toLowerCase();
        box.innerHTML = '';
        
        if (!val) { 
            box.style.display = 'none'; 
            return; 
        }

        const matches = CROP_LIST.filter(c => c.toLowerCase().includes(val));
        
        if (matches.length > 0) {
            matches.slice(0, 6).forEach(crop => { 
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `<i class="fa-solid fa-leaf"></i> ${crop}`;
                div.onclick = () => { 
                    input.value = crop; 
                    box.style.display = 'none'; 
                    // Optional: Auto-search when clicked
                    // searchCropDB(); 
                };
                box.appendChild(div);
            });
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
        }
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!input.contains(e.target) && !box.contains(e.target)) {
            box.style.display = 'none';
        }
    });

    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { 
            box.style.display = 'none'; 
            searchCropDB(); 
        }
    });
}

/* --- REPLACE window.loadCropRecommendations IN SCRIPT.JS --- */
window.loadCropRecommendations = async function() {
    const list = document.getElementById('rec-list');
    
    // 1. Get raw city from storage
    const rawCity = localStorage.getItem('user_city');
    
    // 2. CHECK: If no location is set
    if (!rawCity || rawCity === "Unknown" || rawCity === "null") {
        if(list) list.innerHTML = `
            <div style="text-align:center; padding:20px; color:#aaa; grid-column: span 2;">
                <i class="fa-solid fa-location-dot" style="margin-bottom:10px; font-size: 1.5rem;"></i><br>
                Location not found.<br>
                <span style="font-size:0.9rem; color:#a8ffb8;">Please update your profile location.</span>
            </div>`;
        return;
    }

    // 3. FIX: Capitalize the city name immediately (e.g. "delhi" -> "Delhi")
    const city = toTitleCase(rawCity);

    // 4. Show "Working" status with Capitalized City
    if(list) {
        list.innerHTML = `
            <div style="grid-column: span 2; text-align: center; padding: 20px; color: #ccc;">
                <i class="fa-solid fa-spinner fa-spin" style="margin-right: 10px;"></i> 
                Analyzing soil & weather for <b>${city}</b>...
            </div>`;
    }
    
    try {
        // 5. Fetch Weather First (Required for the AI)
        const wRes = await fetch(`/weather?city=${encodeURIComponent(rawCity)}`);
        const wData = await wRes.json();
        
        if (!wData.main) throw new Error("Weather data missing");

        // 6. Ask AI for Recommendations
        const res = await fetch('/recommend-crops', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                city: city, 
                weather: { temp: wData.main.temp, humidity: wData.main.humidity } 
            })
        });
        
        const data = await res.json();
        
        // 7. Render the Results
        if (data.recommendations && data.recommendations.length > 0) {
            let html = '';
            data.recommendations.forEach(crop => {
                // Determine badge color based on difficulty
                let badgeColor = '#4CAF50'; // Green (Easy)
                if (crop.difficulty === 'Medium') badgeColor = '#FFC107'; // Yellow
                if (crop.difficulty === 'Hard') badgeColor = '#F44336'; // Red

                html += `
                <div class="rec-card" style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); transition: transform 0.2s;" 
                     onclick="document.getElementById('crop-db-search').value='${crop.name}'; searchCropDB();">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 5px;">
                        <strong style="font-size: 1.1rem; color: #a8ffb8;">${crop.name}</strong>
                        <span style="font-size:0.7rem; background:${badgeColor}; color:#000; padding:2px 8px; border-radius:10px; font-weight: bold; height: fit-content;">${crop.difficulty}</span>
                    </div>
                    <p style="font-size:0.85rem; color:#ddd; line-height: 1.4;">${crop.reason}</p>
                </div>`;
            });
            list.innerHTML = html;
        } else {
            // Fallback if AI returns empty list
            list.innerHTML = `<span class="placeholder-text">No specific data found for ${city}. Try searching manually.</span>`;
        }

    } catch (e) { 
        console.error("Recommendation Error:", e);
        // 8. ERROR STATE
        if(list) {
            list.innerHTML = `
                <div style="color:#ff6b6b; text-align:center; grid-column: span 2;">
                    <i class="fa-solid fa-triangle-exclamation"></i><br>
                    Could not load recommendations.<br>
                    <small>${e.message}</small>
                </div>`; 
        }
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
            
            // FIX: Removed <br><br>. Now using CSS margins for perfect spacing.
            text = text.replace(regex, `<div class="analysis-header">${header}</div>`);
        });

        // 3. Clean up any double newlines the AI might have sent at the start
        text = text.trim();

        resultBox.innerHTML = text;

// ... (rest of the function) ...

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

/* --- REPLACE window.calculateFertilizer IN SCRIPT.JS --- */
window.calculateFertilizer = async function() {
    const btn = document.querySelector('.calc-btn');
    const resultBox = document.getElementById('result');
    
    // 1. Get Values
    const n = parseFloat(document.getElementById('n-percent').value) || 0;
    const p = parseFloat(document.getElementById('p-percent').value) || 0;
    const k = parseFloat(document.getElementById('k-percent').value) || 0;
    const t = parseFloat(document.getElementById('target-n-rate').value);
    let area = parseFloat(document.getElementById('area-size').value);
    const unit = document.getElementById('area-unit').value;
    
    // Capitalize City Name Immediately
    let city = localStorage.getItem('user_city') || "India";
    city = toTitleCase(city); 

    // 2. Validate Inputs
    if (!n || !t || !area) {
        resultBox.innerHTML = `<span style="color:#ff6b6b">Please fill in N%, Target N, and Area.</span>`;
        return;
    }

    // 3. INSTANT MATH (Does not wait for AI)
    if (unit === 'ha') area = area * 10000;
    else if (unit === 'acre') area = area * 4046.86;

    const finalQty = ((area / 100) * (t / (n / 100))).toFixed(2);
    
    // 4. Render Quantity IMMEDIATELY (UX Speed Boost)
    // We show the quantity first, and a "Loading..." spinner for the price below it.
    resultBox.innerHTML = `
        <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; margin-top: 20px; border: 1px solid rgba(255,255,255,0.1);">
            
            <div style="margin-bottom: 15px;">
                <div style="font-size: 0.9rem; color: #ccc; text-transform: uppercase; letter-spacing: 1px;">Fertilizer Needed</div>
                <div style="font-size: 2.2rem; font-weight: bold; color: #fff; margin: 5px 0;">${finalQty} <span style="font-size:1rem; color:#888;">kg</span></div>
            </div>

            <div id="cost-loader-area" style="padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div style="font-size: 0.9rem; color: #888;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="color:#a8ffb8; margin-right:5px;"></i> 
                    Checking current rates in ${city}...
                </div>
            </div>
        </div>
    `;

    // 5. Fetch Price in Background
    try {
        const res = await fetch('/fertilizer-price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ n, p, k, city }) // Sending city to server
        });
        
        const data = await res.json();
        
        if (data.error) throw new Error("Price fetch failed");

        const price = data.price_per_kg;
        const totalCost = (finalQty * price).toFixed(0); 
        
        // Format Money (e.g. ₹ 1,200)
        const fmtCost = Number(totalCost).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

        // 6. Update the "Loading" area with the Real Price
        const costArea = document.getElementById('cost-loader-area');
        if (costArea) {
            costArea.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div style="text-align:left;">
                        <div style="font-size: 0.85rem; color: #aaa;">Est. Cost (${city} Rates)</div>
                        <div style="font-size: 0.8rem; color: #666; margin-top:2px;">Likely: ${data.name} @ ₹${price}/kg</div>
                    </div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: #a8ffb8;">${fmtCost}</div>
                </div>
            `;
        }

    } catch (e) {
        console.error(e);
        const costArea = document.getElementById('cost-loader-area');
        if (costArea) {
            costArea.innerHTML = `<div style="font-size: 0.8rem; color: #ff6b6b;">Could not fetch live market rates.</div>`;
        }
    }
}
// ==========================================
// 9. SMART MARKET (Location Aware)
// ==========================================
window.checkEnterMarket = function(e) { if (e.key === "Enter") searchAmazon(); }

// ==========================================
// 10. GENERAL UI & LOCATION
// ==========================================
function formatUsername(name) { if(!name) return "User"; let f = name.trim(); return f.length > 30 ? f.substring(0, 30) + "..." : f; }
window.syncAvatarLetter = function() { const i = document.getElementById('edit-display-name').value; document.getElementById('edit-avatar-preview').innerText = i ? i.trim().charAt(0).toUpperCase() : "U"; }
function updateUIForLogin(user) { document.querySelector('.nav-user').classList.add('logged-in'); let rawName = user.displayName; if(!rawName && user.email) rawName = user.email.split('@')[0]; const finalName = formatUsername(rawName); document.getElementById('user-name-top').innerText = finalName; document.getElementById('user-name-side').innerText = finalName; document.getElementById('edit-display-name').value = finalName; const initial = finalName.charAt(0).toUpperCase(); document.getElementById('user-avatar-top').innerText = initial; document.getElementById('user-avatar-side').innerText = initial; document.getElementById('edit-avatar-preview').innerText = initial; document.getElementById('user-name-top').style.display='block'; document.getElementById('sidebar-login-btn').style.display='none'; document.getElementById('sidebar-user-section').style.display='block'; }
function updateUIForLogout() { document.querySelector('.nav-user').classList.remove('logged-in'); document.getElementById('user-name-top').style.display = 'none'; document.getElementById('sidebar-user-section').style.display = 'none'; document.getElementById('sidebar-login-btn').style.display = 'flex'; }
async function loadUserData(uid) { 
    try { 
        const doc = await db.collection('users').doc(uid).get(); 
        if (doc.exists) { 
            const data = doc.data(); 
            
            // 1. Update Name
            if(data.displayName) { 
                currentUser.displayName = data.displayName; 
                updateUIForLogin(currentUser); 
            } 
            
            // 2. Update Location & Weather
            if (data.savedCity) { 
                localStorage.setItem('user_city', data.savedCity); 
                updateTopBarLocation(data.savedCity); 
                
                // Fetch Main Weather
                getWeather(data.savedCity); 
                
                // --- FIX: Update the Home Dashboard Card too! ---
                updateHomeWeatherPreview(data.savedCity);
                
                document.getElementById('edit-city').value = data.savedCity; 
            } 
        } 
    } catch (err) { console.error(err); } 
}

window.toggleProfileDropdown = function(location) { if (!currentUser) return toggleAuthModal(); document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show')); if (location === 'top') document.getElementById('top-dropdown').classList.add('show'); else document.getElementById('side-dropdown').classList.add('show'); event.stopPropagation(); }
window.openEditProfile = function() { if (!currentUser) return; document.getElementById('edit-profile-drawer').classList.add('open'); document.getElementById('drawer-overlay').style.display = 'block'; document.getElementById('edit-display-name').value = currentUser.displayName || ""; document.getElementById('edit-email').value = currentUser.email; }
window.closeEditProfile = function() { document.getElementById('edit-profile-drawer').classList.remove('open'); document.getElementById('drawer-overlay').style.display = 'none'; }
/* --- REPLACE window.saveProfileChanges IN SCRIPT.JS --- */
window.saveProfileChanges = async function() { 
    const newName = document.getElementById('edit-display-name').value.trim(); 
    let city = document.getElementById('edit-city').value.trim(); 
    
    // Capitalize City (Fix from before)
    city = toTitleCase(city);

    if(!newName) return alert("Name required"); 

    const btn = document.querySelector('#edit-profile-drawer .action-btn'); 
    const oldText = btn.innerText; 
    btn.innerText = "Saving..."; 

    try { 
        await currentUser.updateProfile({ displayName: newName }); 
        
        const updateData = { displayName: newName }; 
        if(city) {
            updateData.savedCity = city; 
            localStorage.setItem('user_city', city); // Save immediately
        }
        
        // Save to Firebase
        await db.collection('users').doc(currentUser.uid).set(updateData, { merge: true }); 
        
        // --- THE FIX: RELOAD PAGE AUTOMATICALLY ---
        // This forces the whole app to restart with the new city data
        window.location.reload(); 

    } catch (e) { 
        alert(e.message); 
        btn.innerText = oldText; 
    } 
}

window.toggleSubmenu = function(menuId, parentEl) { const submenu = document.getElementById(menuId); if (window.getComputedStyle(submenu).display !== 'none') { submenu.style.display = 'none'; parentEl.classList.remove('open'); } else { submenu.style.display = 'block'; parentEl.classList.add('open'); } }
window.toggleSidebar = function() { document.getElementById('sidebar').classList.toggle('active'); }
window.showSection = function(id) {
    // 1. Hide all sections
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active-section'));
    
    // 2. Show selected section
    const target = document.getElementById(id);
    if(target) target.classList.add('active-section');
    
    // 3. Close Sidebar on mobile
    const sb = document.getElementById('sidebar');
    if(sb) sb.classList.remove('active');
    
    // 4. Handle Submenu Logic
    const cropParent = document.getElementById('link-crop-parent');
    const cropMenu = document.getElementById('crop-submenu');

    if(id === 'crop-db-section' || id === 'calendar-section') {
        if(cropParent) cropParent.classList.add('open'); 
        if(cropMenu) cropMenu.style.display = 'block';

        // --- FIXED: Always try to load recommendations ---
        if (id === 'crop-db-section') {
            console.log("Triggering Crop Recommendations...");
            loadCropRecommendations(); 
        }
        if (id === 'calendar-section') {
            loadCropCalendar();
        }
    } else {
        if(cropParent) cropParent.classList.remove('open'); 
        if(cropMenu) cropMenu.style.display = 'none';
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
/* --- REPLACE window.updateLocationFromPopup IN SCRIPT.JS --- */
window.updateLocationFromPopup = function() { 
    let c = document.getElementById('popupCityInput').value.trim(); 
    
    if (c) { 
        c = toTitleCase(c); // Capitalize
        
        // 1. Save to Storage
        localStorage.setItem('user_city', c); 
        
        // 2. Save to Database (if logged in)
        if (currentUser) {
            db.collection('users').doc(currentUser.uid).set({ savedCity: c }, { merge: true })
                .then(() => {
                    // Reload after DB save
                    window.location.reload();
                });
        } else {
            // Reload immediately if guest
            window.location.reload();
        }
    } 
}
/* --- REPLACE window.handleHomeSearch IN SCRIPT.JS --- */
window.handleHomeSearch = async function() {
    const input = document.getElementById('homeSearchInput');
    const city = input.value.trim();
    
    if (!city) {
        alert("Please enter a city name first.");
        return;
    }

    const modal = document.getElementById('quick-weather-modal');
    const content = document.getElementById('quick-weather-content');

    if (!modal || !content) return;

    // Show Loading
    modal.style.display = 'flex';
    content.innerHTML = '<div style="padding:15px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem; color:#a8ffb8;"></i><br><small>Checking...</small></div>';

    try {
        const res = await fetch(`/weather?city=${encodeURIComponent(city)}`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        const temp = Math.round(data.main.temp);
        const desc = data.weather[0].description.replace(/\b\w/g, l => l.toUpperCase());
        const condition = data.weather[0].main.toLowerCase();

        // --- UPDATED: SMALLER ICONS (2.5rem) ---
        let iconHTML = '';
        const iconSize = "2.5rem"; // Much smaller
        
        if (condition.includes('clear')) {
            iconHTML = `<i class="fa-solid fa-sun" style="font-size: ${iconSize}; color: #FBC02D; filter: drop-shadow(0 0 8px rgba(251, 192, 45, 0.6));"></i>`;
        } 
        else if (condition.includes('cloud')) {
            iconHTML = `<i class="fa-solid fa-cloud" style="font-size: ${iconSize}; color: #B0BEC5; filter: drop-shadow(0 0 5px rgba(255,255,255,0.3));"></i>`;
        } 
        else if (condition.includes('rain') || condition.includes('drizzle')) {
            iconHTML = `<i class="fa-solid fa-cloud-showers-heavy" style="font-size: ${iconSize}; color: #4FC3F7; filter: drop-shadow(0 0 5px rgba(79, 195, 247, 0.4));"></i>`;
        } 
        else if (condition.includes('thunder')) {
            iconHTML = `<i class="fa-solid fa-bolt" style="font-size: ${iconSize}; color: #FFEB3B; filter: drop-shadow(0 0 5px rgba(126, 87, 194, 0.8));"></i>`;
        } 
        else if (condition.includes('snow')) {
            iconHTML = `<i class="fa-regular fa-snowflake" style="font-size: ${iconSize}; color: #E1F5FE; filter: drop-shadow(0 0 5px rgba(255,255,255,0.6));"></i>`;
        } 
        else {
            iconHTML = `<i class="fa-solid fa-smog" style="font-size: ${iconSize}; color: #90A4AE;"></i>`;
        }

        // --- COMPACT LAYOUT ---
        content.innerHTML = `
            <div style="text-align:center; padding: 5px;">
                <h3 style="margin:0; color: white; font-size: 1.2rem;">${data.name}, <span style="color:#888; font-size:1rem;">${data.sys.country}</span></h3>
                
                <div style="display:flex; align-items:center; justify-content:center; gap: 15px; margin: 15px 0;">
                    ${iconHTML}
                    <div style="text-align:left;">
                        <div style="font-size: 2.2rem; font-weight: bold; color: #a8ffb8; line-height: 1;">${temp}°</div>
                        <div style="font-size: 0.9rem; color: #ccc;">${desc}</div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px;">
                        <i class="fa-solid fa-wind" style="color: #4fc3f7; font-size: 0.9rem;"></i> <span style="font-size:0.9rem; font-weight:bold;">${data.wind.speed}</span> <small>m/s</small>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px;">
                        <i class="fa-solid fa-droplet" style="color: #4fc3f7; font-size: 0.9rem;"></i> <span style="font-size:0.9rem; font-weight:bold;">${data.main.humidity}</span> <small>%</small>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px;">
                        <i class="fa-solid fa-gauge" style="color: #ff6b6b; font-size: 0.9rem;"></i> <span style="font-size:0.9rem; font-weight:bold;">${data.main.pressure}</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px;">
                        <i class="fa-solid fa-temperature-half" style="color: #fbc02d; font-size: 0.9rem;"></i> <span style="font-size:0.9rem; font-weight:bold;">${Math.round(data.main.feels_like)}°</span>
                    </div>
                </div>
            </div>
        `;
        
        input.value = '';

    } catch (e) {
        content.innerHTML = `<div style="color:#ff6b6b; padding:15px; font-size:0.9rem;">City not found.</div>`;
    }
}
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
/* --- FINAL FIXED AMAZON SEARCH --- */
function searchAmazon() {
    // 1. Look for the NEW ID
    const inputElement = document.getElementById('amazon-search-box');

    // 2. Debugging Check
    if (!inputElement) {
        alert("Error: The script cannot find 'amazon-search-box'. Did you save the index.html file?");
        return;
    }

    // 3. Get text and open link
    const query = inputElement.value;
    if (query) {
        // Opens Amazon India search
        window.open(`https://www.amazon.in/s?k=${encodeURIComponent(query)}`, '_blank');
    } else {
        alert("Please type a product name first!");
    }
}

// Ensure the Enter key also works with the new function
function handleEnter(event) {
    if (event.key === 'Enter') searchAmazon();
}
/* --- FIX FOR MISSING WEATHER FUNCTIONS --- */
function injectQuickWeatherModal() {
    // The HTML is already in your index.html, so this helper 
    // just ensures it is hidden by default to prevent issues.
    const modal = document.getElementById('quick-weather-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function closeQuickWeather() {
    const modal = document.getElementById('quick-weather-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Make sure the HTML buttons can see these functions
window.injectQuickWeatherModal = injectQuickWeatherModal;
window.closeQuickWeather = closeQuickWeather;
window.closeCropDetail = function() {
    document.getElementById('crop-detail-view').style.display = 'none';
    document.getElementById('crop-recommendations').style.display = 'block';
    document.getElementById('crop-db-search').value = ''; // Clear search
}
/* --- DARK MODE LOGIC --- */
window.toggleTheme = function() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon();
}

function updateThemeIcon() {
    const btn = document.getElementById('theme-toggle');
    const isDark = document.body.classList.contains('dark-mode');
    if(btn) {
        // Moon for Light Mode, Sun for Dark Mode
        btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }
}