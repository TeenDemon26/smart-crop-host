require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } 
});

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash"];

function extractJSON(text) {
    try {
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstOpen = cleaned.indexOf('{');
        const lastClose = cleaned.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1) {
            cleaned = cleaned.substring(firstOpen, lastClose + 1);
        }
        return JSON.parse(cleaned);
    } catch (e) { return null; }
}

async function callGemini(promptText, imagePart = null) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key missing");
    const contents = [{ parts: [{ text: promptText }, ...(imagePart ? [imagePart] : [])] }];
    for (const model of MODELS) {
        try {
            console.log(`🤖 Requesting ${model}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await axios.post(url, { contents });
            return response.data.candidates[0].content.parts[0].text;
        } catch (error) { console.warn(`⚠️ ${model} failed. Trying next...`); }
    }
    throw new Error("All AI models are busy.");
}

// --- HELPER: FULL CPCB AQI (Includes CO, NO2, O3, PM2.5, PM10) ---
function calculateCPCBAQI(c) {
    // Linear Interpolation Formula
    const getSubIndex = (val, bps) => {
        for (const bp of bps) {
            if (val >= bp.lo && val <= bp.hi) {
                return Math.round(((bp.i_hi - bp.i_lo) / (bp.hi - bp.lo)) * (val - bp.lo) + bp.i_lo);
            }
        }
        // If value exceeds max defined range, cap at 500
        return val > bps[bps.length-1].hi ? 500 : 0;
    };

    // 1. PM2.5 (Fine Particulate Matter)
    const pm25 = getSubIndex(c.pm2_5, [
        { lo: 0, hi: 30, i_lo: 0, i_hi: 50 }, { lo: 31, hi: 60, i_lo: 51, i_hi: 100 },
        { lo: 61, hi: 90, i_lo: 101, i_hi: 200 }, { lo: 91, hi: 120, i_lo: 201, i_hi: 300 },
        { lo: 121, hi: 250, i_lo: 301, i_hi: 400 }, { lo: 251, hi: 9999, i_lo: 401, i_hi: 500 }
    ]);

    // 2. PM10 (Coarse Particulate Matter)
    const pm10 = getSubIndex(c.pm10, [
        { lo: 0, hi: 50, i_lo: 0, i_hi: 50 }, { lo: 51, hi: 100, i_lo: 51, i_hi: 100 },
        { lo: 101, hi: 250, i_lo: 101, i_hi: 200 }, { lo: 251, hi: 350, i_lo: 201, i_hi: 300 },
        { lo: 351, hi: 430, i_lo: 301, i_hi: 400 }, { lo: 431, hi: 9999, i_lo: 401, i_hi: 500 }
    ]);

    // 3. NO2 (Nitrogen Dioxide)
    const no2 = getSubIndex(c.no2, [
        { lo: 0, hi: 40, i_lo: 0, i_hi: 50 }, { lo: 41, hi: 80, i_lo: 51, i_hi: 100 },
        { lo: 81, hi: 180, i_lo: 101, i_hi: 200 }, { lo: 181, hi: 280, i_lo: 201, i_hi: 300 },
        { lo: 281, hi: 400, i_lo: 301, i_hi: 400 }, { lo: 401, hi: 9999, i_lo: 401, i_hi: 500 }
    ]);

    // 4. Ozone (O3)
    const o3 = getSubIndex(c.o3, [
        { lo: 0, hi: 50, i_lo: 0, i_hi: 50 }, { lo: 51, hi: 100, i_lo: 51, i_hi: 100 },
        { lo: 101, hi: 168, i_lo: 101, i_hi: 200 }, { lo: 169, hi: 208, i_lo: 201, i_hi: 300 },
        { lo: 209, hi: 748, i_lo: 301, i_hi: 400 }, { lo: 749, hi: 9999, i_lo: 401, i_hi: 500 }
    ]);

    // 5. Carbon Monoxide (CO) - IMPORTANT: OpenWeather sends µg/m3, CPCB uses mg/m3
    // We divide by 1000 to convert units
    const coVal = c.co / 1000; 
    const co = getSubIndex(coVal, [
        { lo: 0, hi: 1.0, i_lo: 0, i_hi: 50 }, { lo: 1.1, hi: 2.0, i_lo: 51, i_hi: 100 },
        { lo: 2.1, hi: 10, i_lo: 101, i_hi: 200 }, { lo: 10.1, hi: 17, i_lo: 201, i_hi: 300 },
        { lo: 17.1, hi: 34, i_lo: 301, i_hi: 400 }, { lo: 34.1, hi: 9999, i_lo: 401, i_hi: 500 }
    ]);

    // 6. SO2 (Sulfur Dioxide)
    const so2 = getSubIndex(c.so2, [
        { lo: 0, hi: 40, i_lo: 0, i_hi: 50 }, { lo: 41, hi: 80, i_lo: 51, i_hi: 100 },
        { lo: 81, hi: 380, i_lo: 101, i_hi: 200 }, { lo: 381, hi: 800, i_lo: 201, i_hi: 300 },
        { lo: 801, hi: 1600, i_lo: 301, i_hi: 400 }, { lo: 1601, hi: 9999, i_lo: 401, i_hi: 500 }
    ]);

    // The official AQI is the MAXIMUM of all individual pollutants
    return Math.max(pm25, pm10, no2, o3, co, so2);
}

// 1. WEATHER API ROUTE
app.get('/weather', async (req, res) => {
    try {
        const { city } = req.query;
        const apiKey = process.env.WEATHER_API_KEY;

        const wRes = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
        const wData = wRes.data;

        const { lat, lon } = wData.coord;
        const aqiRes = await axios.get(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`);
        
        const components = aqiRes.data.list[0].components;
        
        // Calculate robust AQI
        const realAQI = calculateCPCBAQI(components);

        wData.aqi_val = realAQI; 
        wData.aqi_components = components;

        res.json(wData);
    } catch (e) { 
        console.error("Weather/AQI Error:", e.message);
        res.status(500).json({ error: "Fetch failed" }); 
    }
});

// 2. CROP INFO
app.post('/crop-info', async (req, res) => {
    try {
        const { crop, city, weather } = req.body;
        const prompt = `Analyze growing "${crop}" in ${city} (Weather: ${weather.temp}°C, ${weather.humidity}% humidity). Return JSON: { "basic_info": { "scientific_name": "string", "duration": "string" }, "economics": { "profit_potential": "High/Medium/Low", "market_demand": "High/Medium/Low" }, "farming_tips": ["Tip 1", "Tip 2"], "regions": { "country_growth_areas": "string", "global_growth_areas": "string" }, "suitability": { "score": 85, "label": "High", "analysis": "string" } }`;
        const text = await callGemini(prompt);
        let json = extractJSON(text);
        if (!json) throw new Error("AI Error");
        if (json.farming_tips) json.farming_tips = json.farming_tips.map(t => typeof t === 'object' ? Object.values(t).join('. ') : t);
        if (json.suitability) json.suitability.score = parseInt(String(json.suitability.score).replace(/\D/g, '')) || 50;
        res.json(json);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. RECOMMENDATIONS
app.post('/recommend-crops', async (req, res) => {
    try {
        const { city, weather } = req.body;
        const prompt = `Suggest 4 best crops for ${city} (Temp:${weather.temp}°C). Return JSON array: [{"name":"", "reason":"", "difficulty":"Easy/Medium/Hard"}]`;
        const text = await callGemini(prompt);
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = cleaned.indexOf('['); const end = cleaned.lastIndexOf(']');
        if (start !== -1 && end !== -1) res.json({ recommendations: JSON.parse(cleaned.substring(start, end + 1)) });
        else throw new Error("Invalid Array");
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. IMAGE ANALYSIS
app.post('/analyze', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file" });
        const base64 = req.file.buffer.toString('base64');
        const prompt = `Analyze crop image. Format: DIAGNOSIS:..., CAUSES:..., TREATMENT:..., PREVENTION:...`;
        const imagePart = { inline_data: { mime_type: req.file.mimetype, data: base64 } };
        const result = await callGemini(prompt, imagePart);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. GENERATE PLAN
app.post('/generate-plan', async (req, res) => {
    try {
        const { crop, area, unit, city } = req.body;
        const prompt = `Act as agricultural economist in ${city}, India. Crop: ${crop}, Area: ${area} ${unit}. Use Wholesale Mandi Price. Return JSON: { "current_price": 3.5, "future_price": 3.8, "yield_val": "100000 kg", "water_val": "15000000 L", "suitability_score": 85, "suitability_reason": "text", "est_cost": 150000, "duration_days": 365 }`;
        const text = await callGemini(prompt);
        const json = extractJSON(text);
        if (!json) throw new Error("Plan Error");
        json.current_price = parseFloat(String(json.current_price).replace(/[^0-9.]/g, '')) || 0;
        json.future_price = parseFloat(String(json.future_price).replace(/[^0-9.]/g, '')) || 0;
        json.est_cost = parseFloat(String(json.est_cost).replace(/[^0-9.]/g, '')) || 0;
        res.json(json);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// --- ADD THIS TO SERVER.JS (ANYWHERE BEFORE app.listen) ---

app.post('/fertilizer-price', async (req, res) => {
    try {
        const { n, p, k, city } = req.body;
        
        const prompt = `
        Act as an Indian agricultural expert. 
        Identify the most likely fertilizer based on this NPK content: N-${n} P-${p} K-${k}.
        (Examples: 46-0-0 is Urea, 18-46-0 is DAP, 0-0-60 is MOP).
        
        Estimate the current *Farmer's Retail Price* per KG in ${city}, India.
        (Note: Use official subsidized rates if applicable, e.g., Urea is approx ₹6/kg).
        
        Return ONLY valid JSON:
        {
            "name": "Urea",
            "price_per_kg": 6
        }`;

        const text = await callGemini(prompt);
        const json = extractJSON(text);
        
        if (!json) throw new Error("Could not find price");
        
        // Clean the number just in case
        json.price_per_kg = parseFloat(String(json.price_per_kg).replace(/[^0-9.]/g, '')) || 0;
        
        res.json(json);
    } catch (e) {
        console.error("Price Fetch Error:", e);
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));