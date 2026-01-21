import React, { useState } from 'react';
import { Upload, Mic, Film, Globe, Loader2, PlayCircle, Download, Trash2, CheckCircle, AlertCircle, Play } from 'lucide-react';
import VideoPlayer from './components/VideoPlayer';
import { fileToBase64 } from './utils/audioUtils';
import { translateVideoContent, generateSpeech, previewVoiceModel } from './services/geminiService';
import { AppState, DubbingConfig, VOICES, BatchItem, ItemStatus, VOICE_SAMPLES } from './types';

function App() {
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [processingError, setProcessingError] = useState('');
  
  // Voice Preview State
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  
  const [config, setConfig] = useState<DubbingConfig>({
    targetLanguage: 'pt-BR', 
    voiceName: 'Kore'
  });

  const handleFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      // Explicitly type file as File to avoid inference errors
      const newItems: BatchItem[] = Array.from(files).map((file: File) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        videoUrl: URL.createObjectURL(file),
        status: ItemStatus.PENDING
      }));
      
      setBatchItems(prev => [...prev, ...newItems]);
      // Select first item if none selected
      if (!selectedItemId && newItems.length > 0) {
        setSelectedItemId(newItems[0].id);
      }
    }
  };

  const removeBatchItem = (id: string) => {
    setBatchItems(prev => prev.filter(item => item.id !== id));
    if (selectedItemId === id) {
      setSelectedItemId(null);
    }
  };

  const processItem = async (item: BatchItem): Promise<BatchItem> => {
    try {
        // Update status to processing steps
        const updateStatus = (status: ItemStatus) => {
             setBatchItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i));
        };

        updateStatus(ItemStatus.UPLOADING);
        const base64Video = await fileToBase64(item.file);

        updateStatus(ItemStatus.TRANSLATING);
        const translatedText = await translateVideoContent(base64Video, item.file.type, config.targetLanguage);

        updateStatus(ItemStatus.GENERATING_AUDIO);
        const audioUrl = await generateSpeech(translatedText, config.voiceName);

        updateStatus(ItemStatus.COMPLETED);
        return {
            ...item,
            status: ItemStatus.COMPLETED,
            result: {
                translatedText,
                audioUrl
            }
        };

    } catch (e: any) {
        console.error(e);
        return {
            ...item,
            status: ItemStatus.ERROR,
            error: e.message || "Unknown error"
        };
    }
  };

  const handleProcessBatch = async () => {
    setIsProcessingBatch(true);
    setProcessingError('');

    // Process sequentially to avoid rate limits
    for (const item of batchItems) {
        if (item.status === ItemStatus.COMPLETED) continue; // Skip done
        
        // Mark as current processing (visual logic handled by status updates inside processItem)
        const resultItem = await processItem(item);
        
        // Update state with result
        setBatchItems(prev => prev.map(i => i.id === item.id ? resultItem : i));
    }

    setIsProcessingBatch(false);
  };

  const handlePreviewVoice = async (voice: string) => {
      if (previewingVoice) return;
      try {
          setPreviewingVoice(voice);
          const text = VOICE_SAMPLES[config.targetLanguage];
          const url = await previewVoiceModel(text, voice);
          const audio = new Audio(url);
          audio.onended = () => setPreviewingVoice(null);
          await audio.play();
      } catch (e) {
          console.error("Preview failed", e);
          setPreviewingVoice(null);
      }
  };

  const selectedItem = batchItems.find(i => i.id === selectedItemId);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-8 h-8 text-blue-500" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Gemini 视频配音助手
            </h1>
          </div>
          <div className="text-xs text-slate-500 border border-slate-800 px-3 py-1 rounded-full hidden sm:block">
            Powered by Gemini 2.5 Flash & TTS
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 grid lg:grid-cols-12 gap-8">
        
        {/* Left Column: Config & Batch List */}
        <div className="lg:col-span-4 space-y-6">
            
            {/* Uploader */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Upload className="w-5 h-5 text-blue-400" />
                    添加视频 (Add Videos)
                </h3>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-600 rounded-xl cursor-pointer hover:bg-slate-800 hover:border-blue-500 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-400 mb-2 transition-colors" />
                        <p className="text-sm text-slate-400 text-center">点击或拖拽上传视频 <br/> (Batch Support)</p>
                    </div>
                    <input type="file" className="hidden" multiple accept="video/mp4,video/webm,video/quicktime" onChange={handleFilesChange} />
                </label>
            </div>

            {/* Config */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-emerald-400" />
                    配音设置 (Settings)
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">目标语言 (Target Language)</label>
                    <select 
                      value={config.targetLanguage}
                      onChange={(e) => setConfig({...config, targetLanguage: e.target.value as any})}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      disabled={isProcessingBatch}
                    >
                      <option value="pt-BR">巴西葡萄牙语 (Portuguese BR)</option>
                      <option value="es-419">拉美西班牙语 (Spanish LatAm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">声音模型 (Voice Model)</label>
                    <div className="grid grid-cols-2 gap-2">
                      {VOICES[config.targetLanguage].map(voice => (
                        <div key={voice} className="relative group">
                            <button
                            onClick={() => setConfig({...config, voiceName: voice})}
                            disabled={isProcessingBatch}
                            className={`
                                w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left
                                ${config.voiceName === voice 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-slate-900 text-slate-400 hover:bg-slate-700'}
                            `}
                            >
                            {voice}
                            </button>
                            {/* Preview Button */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); handlePreviewVoice(voice); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10"
                                title="Preview Voice"
                            >
                                {previewingVoice === voice ? <Loader2 className="w-3 h-3 animate-spin"/> : <Play className="w-3 h-3" />}
                            </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
            </div>

            {/* Batch List */}
            {batchItems.length > 0 && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden flex flex-col max-h-[400px]">
                    <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-200">处理列表 ({batchItems.length})</h3>
                        <button 
                            onClick={handleProcessBatch}
                            disabled={isProcessingBatch || batchItems.every(i => i.status === ItemStatus.COMPLETED)}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                            {isProcessingBatch ? <Loader2 className="w-4 h-4 animate-spin"/> : <Mic className="w-4 h-4"/>}
                            {isProcessingBatch ? "处理中..." : "开始批量生成"}
                        </button>
                    </div>
                    <div className="overflow-y-auto p-2 space-y-2">
                        {batchItems.map((item) => (
                            <div 
                                key={item.id}
                                onClick={() => setSelectedItemId(item.id)}
                                className={`
                                    p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3
                                    ${selectedItemId === item.id ? 'bg-blue-500/10 border-blue-500/50' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}
                                `}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className={`w-2 h-2 rounded-full shrink-0 
                                        ${item.status === ItemStatus.COMPLETED ? 'bg-emerald-500' : 
                                          item.status === ItemStatus.ERROR ? 'bg-red-500' : 
                                          item.status !== ItemStatus.PENDING ? 'bg-yellow-500 animate-pulse' : 'bg-slate-600'}
                                    `} />
                                    <div className="truncate">
                                        <p className="text-sm font-medium text-slate-200 truncate">{item.file.name}</p>
                                        <p className="text-xs text-slate-500">
                                            {item.status === ItemStatus.PENDING && "等待中 (Pending)"}
                                            {item.status === ItemStatus.UPLOADING && "上传中 (Uploading)"}
                                            {item.status === ItemStatus.TRANSLATING && "翻译中 (Translating)"}
                                            {item.status === ItemStatus.GENERATING_AUDIO && "合成语音中 (TTS)"}
                                            {item.status === ItemStatus.COMPLETED && "完成 (Done)"}
                                            {item.status === ItemStatus.ERROR && "失败 (Error)"}
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); removeBatchItem(item.id); }}
                                    className="text-slate-500 hover:text-red-400 p-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* Right Column: Player & Results */}
        <div className="lg:col-span-8">
            {selectedItem ? (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-slate-800 rounded-2xl p-1 border border-slate-700">
                         <VideoPlayer 
                            videoUrl={selectedItem.videoUrl} 
                            audioUrl={selectedItem.result?.audioUrl || null} 
                            fileName={selectedItem.file.name}
                        />
                    </div>
                    
                    {/* Transcript / Result Area */}
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
                            <h4 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">翻译文本 (Transcript)</h4>
                            <div className="h-48 overflow-y-auto text-slate-300 text-sm leading-relaxed p-3 bg-slate-900 rounded-lg border border-slate-800">
                                {selectedItem.result?.translatedText ? (
                                    selectedItem.result.translatedText
                                ) : (
                                    <span className="text-slate-600 italic">等待生成... (Waiting for generation)</span>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
                            <h4 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">状态详情 (Status)</h4>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${selectedItem.status === ItemStatus.COMPLETED ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                                        <CheckCircle className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">处理状态</p>
                                        <p className="text-xs text-slate-500">{selectedItem.status}</p>
                                    </div>
                                </div>
                                
                                {selectedItem.error && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-400 text-xs">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        {selectedItem.error}
                                    </div>
                                )}

                                {selectedItem.status === ItemStatus.COMPLETED && (
                                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-xs">
                                        提示：如果音频与视频时长不一致，播放器会自动调整播放速度以保持同步。点击“合成并下载视频”可保存此同步结果。
                                        <br/>
                                        (Note: Playback speed is auto-adjusted for sync. Use 'Synthesize & Download' to save.)
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-800/20">
                    <Film className="w-16 h-16 opacity-20 mb-4" />
                    <p className="text-lg">请在左侧上传或选择一个视频</p>
                    <p className="text-sm opacity-60">Select a video from the list to preview</p>
                </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default App;