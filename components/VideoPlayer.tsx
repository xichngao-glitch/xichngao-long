import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, RefreshCw, Video as VideoIcon } from 'lucide-react';

interface VideoPlayerProps {
  videoUrl: string;
  audioUrl: string | null;
  fileName: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, audioUrl, fileName }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRates, setPlaybackRates] = useState({ video: 1.0, audio: 1.0 });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);

  // Sync Logic: Calculate durations and adjust rates
  useEffect(() => {
    const syncDurations = () => {
      const video = videoRef.current;
      const audio = audioRef.current;

      if (video && audio && audioUrl) {
        // We need both to have metadata loaded
        if (video.duration && audio.duration && video.duration !== Infinity && audio.duration !== Infinity) {
          const vDur = video.duration;
          const aDur = audio.duration;
          
          let newRates = { video: 1.0, audio: 1.0 };

          if (aDur > vDur) {
            // Audio is longer: Speed up Audio to match Video
            // Rate = Audio / Video (e.g., 20s / 10s = 2.0x speed)
            newRates.audio = aDur / vDur;
            newRates.video = 1.0;
            console.log(`Audio longer. Speeding up Audio by ${newRates.audio.toFixed(2)}x`);
          } else {
            // Video is longer (or audio is shorter): Speed up Video to match Audio
            // Rate = Video / Audio (e.g., 20s / 10s = 2.0x speed)
            newRates.video = vDur / aDur;
            newRates.audio = 1.0;
            console.log(`Audio shorter. Speeding up Video by ${newRates.video.toFixed(2)}x`);
          }

          setPlaybackRates(newRates);
          if (video) video.playbackRate = newRates.video;
          if (audio) audio.playbackRate = newRates.audio;
          
          // Mute original video by default when dubbed audio is ready
          video.muted = true;
          setIsMuted(true);
        }
      } else if (video) {
         // Reset if no audio
         video.playbackRate = 1.0;
      }
    };

    const video = videoRef.current;
    const audio = audioRef.current;

    if (video) {
      video.addEventListener('loadedmetadata', syncDurations);
    }
    if (audio) {
      audio.addEventListener('loadedmetadata', syncDurations);
    }

    // Try immediate sync if already loaded
    syncDurations();

    return () => {
      video?.removeEventListener('loadedmetadata', syncDurations);
      audio?.removeEventListener('loadedmetadata', syncDurations);
    };
  }, [videoUrl, audioUrl]);

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      if (audioRef.current) audioRef.current.pause();
    } else {
      videoRef.current.play();
      if (audioRef.current) audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      setDuration(dur);
      if (dur > 0) setProgress((current / dur) * 100);

      // Force strict sync for preview
      if (audioRef.current && audioUrl) {
         // Because rates are different, we can't just match timestamps 1:1. 
         // We must match percentage progress.
         // But browsers handle playbackRate natively, so play() on both should keep them relatively aligned.
         // Re-sync if drift is huge only.
         const videoPercent = current / dur;
         const audioPercent = audioRef.current.currentTime / audioRef.current.duration;
         
         if (Math.abs(videoPercent - audioPercent) > 0.05) {
            // Sync audio to video percentage
            if(isFinite(audioRef.current.duration)) {
                audioRef.current.currentTime = videoPercent * audioRef.current.duration;
            }
         }
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoRef.current) {
      const pct = parseFloat(e.target.value);
      const seekTime = (pct / 100) * videoRef.current.duration;
      videoRef.current.currentTime = seekTime;
      
      if (audioRef.current && isFinite(audioRef.current.duration)) {
        audioRef.current.currentTime = (pct / 100) * audioRef.current.duration;
      }
      setProgress(pct);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    if(audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  /**
   * Records the synchronized video and audio to a file
   */
  const handleDownloadVideo = async () => {
    if (!videoRef.current || !audioRef.current || !audioUrl) return;

    setIsRecording(true);
    setIsPlaying(false);
    
    // Pause everything first
    videoRef.current.pause();
    audioRef.current.pause();
    videoRef.current.currentTime = 0;
    audioRef.current.currentTime = 0;

    const canvas = canvasRef.current;
    if(!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;
    
    // Setup Canvas stream
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const canvasStream = canvas.captureStream(30); // 30 FPS

    // Setup Audio Stream
    const audioContext = new AudioContext();
    const dest = audioContext.createMediaStreamDestination();
    
    // Create source from the Audio Element is tricky due to CORS/Cross-origin.
    // Instead, we will fetch the audio blob and decode it to play in AudioContext for recording.
    const audioResponse = await fetch(audioUrl);
    const audioArrayBuffer = await audioResponse.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer);
    
    const audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(dest);
    
    // Apply playback rate to audio source
    audioSource.playbackRate.value = playbackRates.audio;

    // Combine streams
    const combinedTracks = [
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ];
    const combinedStream = new MediaStream(combinedTracks);
    
    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/webm;codecs=vp9,opus'
    });
    
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dubbed_${fileName}.webm`;
      a.click();
      
      setIsRecording(false);
      audioContext.close();
      // Reset player
      video.currentTime = 0;
      if (audioRef.current) audioRef.current.currentTime = 0;
    };

    // Animation Loop for Drawing Video to Canvas
    let animationId: number;
    const drawFrame = () => {
       if (ctx && video) {
         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
       }
       if (mediaRecorder.state === 'recording') {
         animationId = requestAnimationFrame(drawFrame);
       }
    };

    // Start Recording
    mediaRecorder.start();
    audioSource.start(0);
    video.play();
    video.playbackRate = playbackRates.video; // Ensure video plays at calculated speed
    drawFrame();

    // Determine duration based on which one controls the length (the slowed down one defines real time, 
    // but here we accelerated to match. The duration is simply the video.duration / video.rate)
    const recordingDurationSec = video.duration / playbackRates.video;

    // Stop logic
    const startTime = Date.now();
    const checkEnd = setInterval(() => {
       const elapsed = (Date.now() - startTime) / 1000;
       setRecordingProgress((elapsed / recordingDurationSec) * 100);

       if (elapsed >= recordingDurationSec) {
          clearInterval(checkEnd);
          cancelAnimationFrame(animationId);
          mediaRecorder.stop();
          audioSource.stop();
          video.pause();
       }
    }, 100);
  };

  return (
    <div className="w-full bg-slate-800 rounded-xl overflow-hidden shadow-2xl border border-slate-700">
      <div className="relative aspect-video bg-black group">
        <video
          ref={videoRef}
          src={videoUrl}
          className={`w-full h-full object-contain ${isRecording ? 'opacity-50' : 'opacity-100'}`}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleVideoEnded}
          onClick={isRecording ? undefined : togglePlay}
          crossOrigin="anonymous"
        />
        {/* Hidden Canvas for Recording */}
        <canvas ref={canvasRef} className="hidden" />

        {audioUrl && (
          <audio ref={audioRef} src={audioUrl} preload="auto" />
        )}

        {/* Overlay Controls */}
        {!isRecording && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <button 
              onClick={togglePlay}
              className="pointer-events-auto p-4 bg-white/10 backdrop-blur-sm rounded-full hover:bg-white/20 transition-all transform hover:scale-105"
            >
              {isPlaying ? (
                <Pause className="w-12 h-12 text-white fill-white" />
              ) : (
                <Play className="w-12 h-12 text-white fill-white ml-2" />
              )}
            </button>
          </div>
        )}

        {/* Recording Overlay */}
        {isRecording && (
          <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center text-white">
            <RefreshCw className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
            <h3 className="text-xl font-bold">正在合成视频 (Synthesizing)...</h3>
            <p className="text-slate-400 text-sm mt-2">请勿关闭窗口 / Do not close</p>
            <div className="w-64 h-2 bg-slate-700 rounded-full mt-4 overflow-hidden">
               <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${Math.min(recordingProgress, 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="p-4 space-y-4 bg-slate-900 border-t border-slate-700">
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={handleSeek}
          disabled={isRecording}
          className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 disabled:opacity-50"
        />
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-slate-300">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button onClick={togglePlay} disabled={isRecording} className="hover:text-white transition-colors disabled:opacity-50">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-400">
                {audioUrl ? "配音模式 (Dubbing Mode)" : "原声模式 (Original)"}
                </span>
                {audioUrl && (
                    <span className="text-[10px] text-emerald-400">
                        Sync: {playbackRates.video !== 1 ? `Video ${playbackRates.video.toFixed(2)}x` : `Audio ${playbackRates.audio.toFixed(2)}x`}
                    </span>
                )}
            </div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-end">
            <button onClick={toggleMute} disabled={isRecording} className="hover:text-white transition-colors flex items-center gap-2 text-xs uppercase tracking-wider font-semibold disabled:opacity-50">
              {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
              <span className="hidden sm:inline">原视频音量 (Original Vol)</span>
            </button>
            
            {audioUrl && (
              <div className="flex gap-2">
                 <a 
                    href={audioUrl} 
                    download={`audio_only_${fileName}.wav`}
                    className={`flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium transition-colors ${isRecording ? 'opacity-50 pointer-events-none' : ''}`}
                 >
                    <Download className="w-4 h-4" />
                    下载音频
                 </a>
                 <button 
                    onClick={handleDownloadVideo}
                    disabled={isRecording}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    <VideoIcon className="w-4 h-4" />
                    合成并下载视频
                 </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;