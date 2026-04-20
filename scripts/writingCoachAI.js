(function (global) {

const GEMINI_MODEL = 'gemini-2.5-flash';
const GENAI_CDN = 'https://cdn.jsdelivr.net/npm/@google/genai@latest/+esm';
const API_KEY_STORAGE = 'gemini_api_key'; // shared with speaking app

class WritingCoachAI {
    constructor() {
        this.apiKey = null;
        this.genai = null;
        this._quotaWarned = false;
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem(API_KEY_STORAGE, key);
    }

    loadApiKey() {
        const saved = localStorage.getItem(API_KEY_STORAGE);
        if (saved) { this.apiKey = saved; return true; }
        return false;
    }

    hasApiKey() { return !!this.apiKey || this.loadApiKey(); }

    async getGenAI() {
        if (this.genai) return this.genai;
        if (!this.hasApiKey()) throw new Error('No Gemini API key configured');
        const { GoogleGenAI } = await import(GENAI_CDN);
        this.genai = new GoogleGenAI({ apiKey: this.apiKey });
        return this.genai;
    }

    async callGemini(prompt, { temperature = 0.7, maxTokens = 8192, photos = [] } = {}) {
        const ai = await this.getGenAI();
        const contents = [];
        photos.forEach(p => {
            contents.push({ inlineData: { data: p.base64, mimeType: p.mimeType } });
        });
        contents.push(prompt);
        try {
            const response = await ai.models.generateContent({
                model: GEMINI_MODEL, contents,
                config: { temperature, maxOutputTokens: maxTokens }
            });
            const text = response.text;
            if (!text) throw new Error('Empty response');
            return text;
        } catch (err) {
            if (this.isQuotaError(err)) this.handleQuotaExceeded();
            throw err;
        }
    }

    isQuotaError(err) {
        const m = (err && err.message || '').toLowerCase();
        return m.includes('429') || m.includes('quota') || m.includes('rate limit');
    }

    handleQuotaExceeded() {
        if (this._quotaWarned) return;
        this._quotaWarned = true;
        let banner = document.getElementById('quotaBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'quotaBanner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#d97706;color:white;padding:10px 16px;text-align:center;font-size:0.875rem;';
            document.body.appendChild(banner);
        }
        banner.textContent = 'Gemini AI quota exceeded — please try again after midnight PT when quota resets.';
    }

    async transcribe(photos) {
        const prompt = WritingUtils.buildOcrPrompt();
        return this.callGemini(prompt, { temperature: 0.1, maxTokens: 4096, photos });
    }

    async gradeTask1(params) {
        const prompt = WritingUtils.buildT1Prompt(params);
        return this.callGemini(prompt, { temperature: 0.1, maxTokens: 4096 });
    }

    async gradeTask2(params) {
        const prompt = WritingUtils.buildT2Prompt(params);
        return this.callGemini(prompt, { temperature: 0.1, maxTokens: 4096 });
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { WritingCoachAI };
else global.writingCoachAI = new WritingCoachAI();

})(typeof window !== 'undefined' ? window : globalThis);
