import { GoogleGenAI, Modality } from "@google/genai";
import { decodeBase64, decodeAudioData, audioBufferToWavUrl } from '../utils/audioUtils';

// Initialize Gemini Client
const getAiClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing in environment variables.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Step 1: Translate Video Content
 */
export const translateVideoContent = async (
  base64Video: string,
  mimeType: string,
  targetLanguage: 'pt-BR' | 'es-419'
): Promise<string> => {
  const ai = getAiClient();
  
  const languageName = targetLanguage === 'pt-BR' ? 'Brazilian Portuguese' : 'Latin American Spanish';
  
  const prompt = `
    Analyze the audio in this video file. 
    The audio might be in English or Spanish.
    Your task is to:
    1. Listen to the speech.
    2. Translate the spoken content into ${languageName}.
    3. Return ONLY the translated text as a continuous script suitable for dubbing.
    Do not include speaker labels, timestamps, or markdown formatting like ** or *. Just the raw text to be spoken.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Video,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    });

    const text = response.text;
    if (!text) throw new Error("Translation failed / 翻译失败");
    return text;

  } catch (error) {
    console.error("Translation Error:", error);
    throw error;
  }
};

/**
 * Step 2: Generate Speech from Text
 */
export const generateSpeech = async (
  text: string,
  voiceName: string = 'Kore'
): Promise<string> => {
  const ai = getAiClient();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio returned / 未返回音频数据");
    }

    // Decode and convert to WAV URL
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const audioBytes = decodeBase64(base64Audio);
    const audioBuffer = await decodeAudioData(audioBytes, audioContext);
    const wavUrl = audioBufferToWavUrl(audioBuffer);
    
    await audioContext.close();

    return wavUrl;

  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};

/**
 * Preview a specific voice model
 */
export const previewVoiceModel = async (
  text: string,
  voiceName: string
): Promise<string> => {
  return generateSpeech(text, voiceName);
};