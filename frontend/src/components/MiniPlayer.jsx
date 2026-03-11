import React, { useState, useEffect, useRef } from 'react';
import { api, API_BASE } from '../services/api';

const MiniPlayer = ({ queue, currentIndex, isPlaying, onStateChange, isPopout, playbackMode = 'SEQUENCE', volume = 1.0, playbackSpeed = 1.0, onSettingsChange }) => {
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(100);
    const [position, setPosition] = useState({ x: window.innerWidth - 380, y: window.innerHeight - 200 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const currentSong = queue[currentIndex];
    // Convert DB audio path to absolute URL point to Fast API backend
    // In a real app the base URL config would be environmental
    const audioUrl = currentSong ? `${API_BASE}${currentSong.audio_path}` : '';
    const audioRef = useRef(null);

    // Offline loading logic via IndexedDB
    const [blobUrl, setBlobUrl] = useState('');
    useEffect(() => {
        if (currentSong?.isOffline) {
            // extract UUID from offline:ID
            const id = currentSong.audio_path.split(':')[1];
            api.getOfflineAudio(id).then(blob => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    setBlobUrl(url);
                }
            });
        } else {
            setBlobUrl(audioUrl);
        }
    }, [currentSong, audioUrl]);

    // Player Audio handling
    useEffect(() => {
        if (audioRef.current && blobUrl) {
            audioRef.current.volume = volume;
            audioRef.current.playbackRate = playbackSpeed;
            if (isPlaying) {
                audioRef.current.play().catch(e => console.error("Play error:", e));
            } else {
                audioRef.current.pause();
            }
        }
    }, [blobUrl, isPlaying, volume, playbackSpeed]);

    useEffect(() => {
        // Play next song auto implementation based on mode
        const audio = audioRef.current;
        if (audio) {
            const handleEnded = () => {
                if (playbackMode === 'LOOP_ONE') {
                    audio.currentTime = 0;
                    audio.play().catch(e => console.error(e));
                } else if (playbackMode === 'SHUFFLE') {
                    const nextIndex = Math.floor(Math.random() * queue.length);
                    onStateChange(queue, nextIndex, true, !isPopout);
                } else if (playbackMode === 'LOOP_ALL') {
                    const nextIndex = (currentIndex + 1) % queue.length;
                    onStateChange(queue, nextIndex, true, !isPopout);
                } else {
                    if (currentIndex < queue.length - 1) {
                        onStateChange(queue, currentIndex + 1, true, !isPopout);
                    } else {
                        onStateChange(queue, currentIndex, false, !isPopout);
                    }
                }
            };
            const handleTimeUpdate = () => {
                setProgress(audio.currentTime);
                if (audio.duration && !isNaN(audio.duration)) {
                    setDuration(audio.duration);
                }
            };

            audio.addEventListener('ended', handleEnded);
            audio.addEventListener('timeupdate', handleTimeUpdate);

            return () => {
                audio.removeEventListener('ended', handleEnded);
                audio.removeEventListener('timeupdate', handleTimeUpdate);
            }
        }
    }, [currentIndex, queue, playbackMode, onStateChange, isPopout]);

    const playNext = () => {
        if (playbackMode === 'SHUFFLE') {
            const nextIndex = Math.floor(Math.random() * queue.length);
            onStateChange(queue, nextIndex, true, !isPopout);
        } else {
            const nextIndex = (currentIndex + 1) % queue.length;
            if (currentIndex < queue.length - 1 || playbackMode === 'LOOP_ALL') {
                onStateChange(queue, nextIndex, true, !isPopout);
            }
        }
    };

    const playPrev = () => {
        if (progress > 3 && audioRef.current) {
            audioRef.current.currentTime = 0;
            return;
        }
        if (playbackMode === 'SHUFFLE') {
            const prevIndex = Math.floor(Math.random() * queue.length);
            onStateChange(queue, prevIndex, true, !isPopout);
        } else {
            const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
            if (currentIndex > 0 || playbackMode === 'LOOP_ALL') {
                onStateChange(queue, prevIndex, true, !isPopout);
            }
        }
    };

    const handlePopout = () => {
        window.open(window.location.origin + '?popout=true', 'SmartPlayer_Popout', 'width=380,height=300,menubar=0,toolbar=0,location=0,status=0,resizable=1');
        onStateChange(queue, currentIndex, isPlaying, false); // close floating one
    };

    const handleSeek = (e) => {
        const val = parseFloat(e.target.value);
        setProgress(val);
        if (audioRef.current) {
            audioRef.current.currentTime = val;
        }
    };

    // Draggable window logic
    const handlePointerDown = (e) => {
        // Only drag on header
        if (e.target.closest('.player-controls') || e.target.closest('input')) return;
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
        e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            });
        }
    };

    const handlePointerUp = (e) => {
        setIsDragging(false);
        e.target.releasePointerCapture(e.pointerId);
    };

    if (!currentSong) return null;

    // Helper functions for formatting time
    const formatTime = (time) => {
        if (isNaN(time)) return '00:00';
        const m = Math.floor(time / 60);
        const s = Math.floor(time % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const isMobileEmbedded = !isPopout && window.innerWidth <= 768;

    if (isPopout || isMobileEmbedded) {
        return (
            <div className={`popout-container ${isMobileEmbedded ? 'mobile-embedded-player' : ''}`}>
                <audio ref={audioRef} src={blobUrl} preload="auto" />

                {/* Close Button for Mobile Embedded Mode */}
                {isMobileEmbedded && (
                    <button
                        onClick={() => onStateChange(queue, currentIndex, isPlaying, false)}
                        style={{
                            position: 'absolute',
                            top: '20px',
                            right: '20px',
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            color: '#fff',
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 100
                        }}
                        title="Minimize Player"
                    >
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                )}

                {/* Central Artwork with Concentric Rings */}
                <div className="artwork-section">
                    <div className="ring ring-1"></div>
                    <div className="ring ring-2"></div>
                    <div className="ring ring-3"></div>
                    <div className="ring ring-4"></div>
                    <div className="artwork-image" style={{ backgroundImage: `url("${currentSong.thumbnail || '/bg-music-icon.png'}")` }}></div>
                </div>

                {/* Song Info */}
                <div className="song-info">
                    <h2>{currentSong.title || 'Unknown Title'}</h2>
                </div>

                {/* Custom Waveform Progress */}
                <div className="progress-section">
                    <span className="time">{formatTime(progress)}</span>
                    <div className="waveform-container">
                        <input
                            type="range"
                            className="waveform-slider"
                            min="0"
                            max={duration}
                            value={progress}
                            onChange={handleSeek}
                            style={{ '--progress': `${(progress / duration) * 100}%` }}
                        />
                        <div className="waveform-bars">
                            {[...Array(30)].map((_, i) => (
                                <div key={i} className="wf-bar" style={{ height: `${20 + Math.random() * 80}%`, transition: 'background 0.1s' }} />
                            ))}
                        </div>
                    </div>
                    <span className="time">{formatTime(duration)}</span>
                </div>

                {/* Controls */}
                <div className="popout-controls">
                    <button className="icon-btn heart" title="Like">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    </button>

                    <button className="icon-btn" onClick={playPrev} title="Previous">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                    </button>

                    <button className="play-btn-large" onClick={() => onStateChange(queue, currentIndex, !isPlaying, !isPopout)} title={isPlaying ? "Pause" : "Play"}>
                        {isPlaying ? (
                            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        )}
                    </button>

                    <button className="icon-btn" onClick={playNext} title="Next">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                    </button>

                    <button
                        className={`icon-btn ${playbackMode !== 'SEQUENCE' ? 'active' : ''}`}
                        onClick={() => {
                            const modes = ['SEQUENCE', 'SHUFFLE', 'LOOP_ALL', 'LOOP_ONE'];
                            const next = modes[(modes.indexOf(playbackMode) + 1) % modes.length];
                            if (onSettingsChange) onSettingsChange(next, volume, playbackSpeed);
                        }}
                        title="Toggle Mode"
                    >
                        {playbackMode === 'SHUFFLE' ? (
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                        ) : playbackMode === 'LOOP_ONE' ? (
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path><text x="10" y="16" fontSize="10" strokeWidth="1">1</text></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    // Mini floating player view
};

export default MiniPlayer;
