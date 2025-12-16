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

// --- CONFIG: MODEL PRIORITY ---
const MODELS = [
    "gemini-2.5-flash",      // Smartest
    "gemini-2.5-flash-lite", // Fast
    "gemini-1.5-flash"       // Backup
];

// --- HELPER: SURGICAL JSON EXTRACTOR ---
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

    const contents = [{
        parts: [{ text: promptText }, ...(imagePart ? [imagePart] : [])]
    }];
    
    for (const model of MODELS) {
        try {
            console.log(`🤖 Requesting ${model}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await axios.post(url, { contents });
            return response.data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.warn(`⚠️ ${model} failed. Trying next...`);
        }
    }
    throw new Error("All AI models are busy.");
}

// 1. WEATHER
app.get('/weather', async (req, res) => {
    try {
        const { city } = req.query;
        const apiKey = process.env.WEATHER_API_KEY;
        const w = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
        res.json(w.data);
    } catch (e) { res.status(500).json({ error: "Weather fetch failed" }); }
});

// 2. CROP INFO SEARCH (Sanitized)
app.post('/crop-info', async (req, res) => {
    try {
        const { crop, city, weather } = req.body;
        const prompt = `Analyze growing "${crop}" in ${city} (Weather: ${weather.temp}°C, ${weather.humidity}% humidity).
        Return valid JSON:
        {
            "basic_info": { "scientific_name": "string", "duration": "string" },
            "economics": { "profit_potential": "High/Medium/Low", "market_demand": "High/Medium/Low" },
            "farming_tips": ["Tip 1 string", "Tip 2 string", "Tip 3 string"],
            "regions": { "country_growth_areas": "string", "global_growth_areas": "string" },
            "suitability": { "score": 85, "label": "High", "analysis": "string" }
        }`;
        
        const text = await callGemini(prompt);
        let json = extractJSON(text);
        if (!json) throw new Error("AI returned unreadable data.");

        // SANITIZER: Force tips to strings and score to number
        if (json.farming_tips) {
            json.farming_tips = json.farming_tips.map(t => typeof t === 'object' ? Object.values(t).join('. ') : t);
        }
        if (json.suitability) {
            json.suitability.score = parseInt(String(json.suitability.score).replace(/\D/g, '')) || 50;
        }
        res.json(json);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. RECOMMENDATIONS
app.post('/recommend-crops', async (req, res) => {
    try {
        const { city, weather } = req.body;
        const prompt = `Suggest 4 best crops for ${city} (Temp:${weather.temp}°C). Return JSON array: [{"name":"", "reason":"", "difficulty":""}]`;
        const text = await callGemini(prompt);
        
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = cleaned.indexOf('['); const end = cleaned.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
            res.json({ recommendations: JSON.parse(cleaned.substring(start, end + 1)) });
        } else {
            throw new Error("Invalid Array");
        }
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
// REPLACE THE EXISTING /generate-plan ROUTE
app.post('/generate-plan', async (req, res) => {
    try {
        const { crop, area, unit, city } = req.body;
        
        // --- NEW: STRICT PROMPT ENGINEERING ---
        const prompt = `
        Act as a serious agricultural economist and Mandi expert in ${city}, India.
        A farmer wants to grow "${crop}" on ${area} ${unit}.
        
        CRITICAL RULES FOR PRICING:
        1. YOU MUST USE THE "WHOLESALE / MANDI PRICE" (Farm-gate price). 
        2. DO NOT use Retail/Supermarket prices.
        3. For Sugarcane, specifically use the FRP (Fair and Remunerative Price) which is approx ₹3000-3500 per TON (approx ₹3-3.5 per kg). 
        4. For Grains/Vegetables, use the bulk APMC wholesale rate.
        
        Estimate the following:
        1. Current Wholesale Price per kg (Numeric only. E.g., for Sugarcane write 3.5, NOT 40).
        2. Estimated Wholesale Price per kg at harvest (Numeric only).
        3. Estimated Yield (in kg). (Be realistic: Sugarcane ~40,000 kg/acre).
        4. Total Water Requirement (in Liters). (Sugarcane is water intensive).
        5. Suitability Score (0-100).
        6. Estimated Cost of Cultivation (Numeric only).
        7. Duration (days).
        
        Return ONLY valid JSON:
        {
            "current_price": 3.5,
            "future_price": 3.8,
            "yield_val": "100000 kg", 
            "water_val": "15000000 L",
            "suitability_score": 85,
            "suitability_reason": "Good climate.",
            "est_cost": 150000,
            "duration_days": 365
        }`;

        const text = await callGemini(prompt);
        const json = extractJSON(text);
        
        if (!json) throw new Error("Failed to generate plan");
        
        // Clean numbers
        json.current_price = parseFloat(String(json.current_price).replace(/[^0-9.]/g, '')) || 0;
        json.future_price = parseFloat(String(json.future_price).replace(/[^0-9.]/g, '')) || 0;
        json.est_cost = parseFloat(String(json.est_cost).replace(/[^0-9.]/g, '')) || 0;
        
        res.json(json);
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: e.message }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));