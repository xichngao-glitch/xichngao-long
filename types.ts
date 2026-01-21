export enum AppState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  ERROR = 'ERROR'
}

export enum ItemStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  TRANSLATING = 'TRANSLATING',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface BatchItem {
  id: string;
  file: File;
  videoUrl: string; // Object URL for preview
  status: ItemStatus;
  result?: ProcessedResult;
  error?: string;
  progress?: number;
}

export interface DubbingConfig {
  targetLanguage: 'pt-BR' | 'es-419'; 
  voiceName: string;
}

export const VOICES = {
  'pt-BR': ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'],
  'es-419': ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']
};

export const VOICE_SAMPLES = {
  'pt-BR': "Olá, este é um exemplo da minha voz.",
  'es-419': "Hola, este es un ejemplo de mi voz."
};

export interface ProcessedResult {
  originalTranscript?: string;
  translatedText?: string;
  audioUrl?: string;
}