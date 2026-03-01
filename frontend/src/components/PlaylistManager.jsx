import React, { useState, useEffect } from 'react';
import { api, generateId } from '../services/api';

const PlaylistManager = ({ playlist, onPlay, currentPlayingId }) => {
    const [songs, setSongs] = useState([]);
    const [urlInput, setUrlInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);

    useEffect(() => {
        if (playlist) {
            fetchSongs();
        }
    }, [playlist]);

    // Handle cross-tab or external localstorage changes if needed
    useEffect(() => {
        const handleStorage = () => {
            fetchSongs();
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [playlist]);

    const fetchSongs = async () => {
        try {
            const data = await api.getSongs(playlist.id);
            setSongs(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleLocalFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        try {
            const songId = generateId();
            await api.saveOfflineAudio(songId, file);

            const offlineSong = {
                id: songId,
                playlist_id: playlist.id,
                title: file.name,
                url: "offline",
                status: "ready",
                progress: 100,
                audio_path: `offline:${songId}`,
                thumbnail: null,
                isOffline: true
            };

            await api.addSongToLocal(playlist.id, offlineSong);
            fetchSongs();
        } catch (err) {
            console.error("Failed to add local file", err);
            alert("Failed to save local file.");
        } finally {
            setLoading(false);
            e.target.value = null; // reset input
        }
    };

    const downloadMP3 = async (song) => {
        try {
            const API_BASE = "https://rhythmx-ufoe.onrender.com";
            const res = await fetch(`${API_BASE}${song.audio_path}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${song.title || 'audio'}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Download failed", e);
            alert("Error downloading MP3...");
        }
    };

    const handleAddLink = async (e) => {
        e.preventDefault();
        if (!urlInput) return;
        setLoading(true);

        // Add instantly refreshes to show 'converting' status
        const currentUrl = urlInput;
        setUrlInput("");

        // Optimistic refresh
        setTimeout(() => {
            fetchSongs();
        }, 100);

        try {
            await api.convertVideo(currentUrl, playlist.id);
            // Refresh again once fully done
            fetchSongs();
        } catch (e) {
            console.error("Failed to add link", e);
            alert("Failed to convert video.");
            fetchSongs(); // clear optimistic progress on error
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'queued': return 'var(--status-queued)';
            case 'downloading': return 'var(--status-downloading)';
            case 'converting': return 'var(--status-converting)';
            case 'ready': return 'var(--status-ready)';
            case 'failed': return 'var(--status-failed)';
            default: return 'var(--text-secondary)';
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleDragStart = (e, index) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragEnter = (e, index) => {
        if (draggedItemIndex === null || draggedItemIndex === index) return;
        const newSongs = [...songs];
        const draggedItem = newSongs[draggedItemIndex];
        newSongs.splice(draggedItemIndex, 1);
        newSongs.splice(index, 0, draggedItem);
        setDraggedItemIndex(index);
        setSongs(newSongs);

        // Save persistently so reordering survives refresh
        localStorage.setItem(`songs_${playlist.id}`, JSON.stringify(newSongs));
    };

    const handleDragEnd = () => {
        setDraggedItemIndex(null);
    };

    const handleRemoveSong = async (e, songId) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to remove this song from the playlist?")) {
            await api.removeSong(playlist.id, songId);
            fetchSongs(); // Refresh the list
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(244, 228, 193, 0.1)', paddingBottom: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }} className="text-gradient">
                        {playlist.name}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {songs.length} Track{songs.length !== 1 && 's'}
                    </p>
                </div>
            </div>

            {/* Add New Song Form */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <form onSubmit={handleAddLink} style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '300px' }}>
                    <input
                        type="url"
                        className="glass-input"
                        placeholder="Paste YouTube or Video link here..."
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        required
                    />
                    <button type="submit" className="glass-button primary" disabled={loading} style={{ whiteSpace: 'nowrap' }}>
                        {loading ? 'Adding...' : '+ Add Video'}
                    </button>
                </form>

                <label className="glass-button" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {loading ? 'Processing...' : '📁 Add Local File'}
                    <input type="file" accept="audio/*" onChange={handleLocalFileUpload} style={{ display: 'none' }} disabled={loading} />
                </label>
            </div>

            {/* Song List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '8px' }}>

                {songs.length === 0 && (
                    <div style={{ textAlign: 'center', margin: '40px 0', color: 'var(--text-secondary)' }}>
                        <p>Your playlist is empty.</p>
                        <p>Paste a video link above to add some music!</p>
                    </div>
                )}

                {songs.map((song, index) => {
                    const isReady = song.status === 'ready';
                    const isPlaying = song.id === currentPlayingId;

                    return (
                        <div
                            key={song.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragEnter={(e) => handleDragEnter(e, index)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => e.preventDefault()}
                            className={`song-card ${isPlaying ? 'playing' : ''}`}
                            style={{
                                opacity: draggedItemIndex === index ? 0.4 : 1
                            }}
                        >
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(244, 228, 193, 0.1)' }}>
                                {song.thumbnail ? (
                                    <img src={song.thumbnail} alt={song.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <img src="/bg-music-icon.jpg.png" alt="Music Icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isPlaying ? 'var(--primary-accent)' : '#fff' }}>
                                    {song.title || song.url}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                    <span style={{
                                        display: 'inline-block',
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: getStatusColor(song.status)
                                    }} />
                                    <span style={{ textTransform: 'capitalize' }}>
                                        {song.status} {song.progress > 0 && song.progress < 100 ? `(${song.progress}%)` : ''}
                                    </span>
                                </div>
                            </div>

                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                {formatDuration(song.duration)}
                            </div>

                            {isReady && (
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        onClick={(e) => handleRemoveSong(e, song.id)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-secondary)',
                                            cursor: 'pointer',
                                            fontSize: '1.2rem',
                                            padding: '8px'
                                        }}
                                        title="Remove Song"
                                    >
                                        🗑️
                                    </button>
                                    {!song.isOffline && (
                                        <button
                                            className="glass-button"
                                            onClick={() => downloadMP3(song)}
                                            style={{ padding: '10px', fontSize: '1.2rem', borderRadius: '50%', width: '42px', height: '42px' }}
                                            title="Download Audio"
                                        >
                                            💾
                                        </button>
                                    )}
                                    <button
                                        className={isPlaying ? "glass-button active" : "glass-button primary"}
                                        onClick={() => onPlay(songs.filter(s => s.status === 'ready'), songs.filter(s => s.status === 'ready').findIndex(s => s.id === song.id))}
                                        style={{ padding: '8px 24px', fontSize: '0.95rem', borderRadius: '12px' }}
                                    >
                                        {isPlaying ? 'ACTIVE' : 'PLAY'}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PlaylistManager;
