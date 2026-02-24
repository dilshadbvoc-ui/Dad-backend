"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContent = void 0;
const apiResponse_1 = require("../utils/apiResponse");
const openai_1 = __importDefault(require("openai"));
const logger_1 = require("../utils/logger");
const axios_1 = __importDefault(require("axios"));
// Lazy initialization of OpenAI to prevent startup errors if key is missing
const getOpenAI = () => {
    if (process.env.OPENAI_API_KEY) {
        return new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return null;
};
// Free AI generation using Google Gemini API
const generateWithGemini = async (prompt, systemPrompt) => {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBxqVHthLqJQqLqLqLqLqLqLqLqLqLqLqL'; // Free tier key
    try {
        const response = await axios_1.default.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            contents: [{
                    parts: [{
                            text: `${systemPrompt}\n\n${prompt}`
                        }]
                }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 500,
            }
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!generatedText) {
            throw new Error('No content generated');
        }
        return generatedText;
    }
    catch (error) {
        console.error('Gemini API Error:', error.response?.data || error.message);
        throw error;
    }
};
const generateContent = async (req, res) => {
    const { topic, type, tone } = req.body;
    const user = req.user;
    try {
        if (!topic || !type) {
            return apiResponse_1.ResponseHandler.validationError(res, 'Topic and type are required');
        }
        // Allow super admins without organization
        if (!user.organisationId && user.role !== 'super_admin') {
            return res.status(403).json({
                message: 'User must belong to an organization to use AI features',
                code: 'NO_ORGANISATION'
            });
        }
        const openai = getOpenAI();
        // Prepare prompts
        let systemPrompt = '';
        let userPrompt = '';
        switch (type) {
            case 'email':
                systemPrompt = `You are an expert marketing copywriter. Write a professional email. Tone: ${tone || 'professional'}.`;
                userPrompt = `Write an email about: ${topic}`;
                break;
            case 'social':
                systemPrompt = `You are a social media manager. Write an engaging post with hashtags. Tone: ${tone || 'witty'}.`;
                userPrompt = `Write a social media post about: ${topic}`;
                break;
            case 'blog':
                systemPrompt = `You are a content strategist. Write a blog post outline and intro. Tone: ${tone || 'informative'}.`;
                userPrompt = `Write a blog post about: ${topic}`;
                break;
            default:
                systemPrompt = `You are a helpful assistant.`;
                userPrompt = topic;
        }
        let generatedText;
        let usedProvider = 'mock';
        // Try OpenAI first if available
        if (openai) {
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    max_tokens: 500
                });
                generatedText = completion.choices[0].message.content || '';
                usedProvider = 'openai';
            }
            catch (openaiError) {
                console.error('OpenAI failed, trying Gemini:', openaiError);
                // Fallback to Gemini
                generatedText = await generateWithGemini(userPrompt, systemPrompt);
                usedProvider = 'gemini';
            }
        }
        else {
            // Try Gemini as free alternative
            try {
                generatedText = await generateWithGemini(userPrompt, systemPrompt);
                usedProvider = 'gemini';
            }
            catch (geminiError) {
                // Final fallback to mock
                logger_1.logger.info('Both OpenAI and Gemini unavailable, returning mock response', 'AI_GENERATION', user?.id);
                const mockResponses = {
                    email: `Subject: ${topic}\n\nDear Client,\n\nWe are excited to share updates regarding ${topic}. Our team has been working hard to deliver the best results for you.\n\nBest regards,\nThe Team\n\n[MOCK GENERATION - Configure OPENAI_API_KEY or GEMINI_API_KEY for real AI]`,
                    social: `🚀 Exciting news about ${topic}! We're exploring new ways to help you succeed. #Growth #Innovation #${topic.split(' ')[0]} \n\n[MOCK GENERATION]`,
                    blog: `Title: The Future of ${topic}\n\nIn today's rapidly evolving landscape, understanding ${topic} is more important than ever. Here are three key takeaways to keep in mind...\n\n[MOCK GENERATION]`
                };
                generatedText = mockResponses[type] || mockResponses['email'];
                usedProvider = 'mock';
            }
        }
        logger_1.logger.info(`AI Content generated successfully using ${usedProvider}`, 'AI_GENERATION', user?.id, user?.organisationId, { type, topic });
        return apiResponse_1.ResponseHandler.success(res, {
            content: generatedText,
            isMock: usedProvider === 'mock',
            provider: usedProvider
        }, `Content generated successfully (${usedProvider})`);
    }
    catch (error) {
        logger_1.logger.error('AI Generation Failed', error, 'AI_GENERATION', user?.id);
        return apiResponse_1.ResponseHandler.serverError(res, 'Failed to generate content');
    }
};
exports.generateContent = generateContent;
//# sourceMappingURL=aiController.js.map