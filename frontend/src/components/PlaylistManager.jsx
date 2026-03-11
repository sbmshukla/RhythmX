import React, { useState, useEffect } from 'react';
import { api, generateId, API_BASE } from '../services/api';
import { dataTracker } from '../services/dataTracker';

const PlaylistManager = ({ playlist, onPlay, currentPlayingId }) => {
    const [songs, setSongs] = useState([]);
    const [urlInput, setUrlInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);
    const [selectedSongs, setSelectedSongs] = useState(new Set());
    const [downloadedSongs, setDownloadedSongs] = useState(() => {
        const saved = localStorage.getItem('downloaded_songs');
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });

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

            const res = await fetch(`${API_BASE}${song.audio_path}`);
            const blob = await res.blob();
            dataTracker.addUsage(song.url, blob.size);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            const ext = song.audio_path ? song.audio_path.split('.').pop() : 'mp3';
            a.download = `${song.title || 'audio'}.${ext}`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            const newDownloaded = new Set(downloadedSongs);
            newDownloaded.add(song.id);
            setDownloadedSongs(newDownloaded);
            localStorage.setItem('downloaded_songs', JSON.stringify([...newDownloaded]));
        } catch (e) {
            console.error("Download failed", e);
            alert("Error downloading audio...");
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

    const handleCopyLink = async (e, url) => {
        e.stopPropagation();
        if (url === 'offline') {
            alert("This is a local file, no link to copy.");
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            alert("Link copied to clipboard!");
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    };

    const handleRemoveSong = async (e, songId) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to remove this song from the playlist?")) {
            await api.removeSong(playlist.id, songId);
            setSelectedSongs(prev => {
                const newSet = new Set(prev);
                newSet.delete(songId);
                return newSet;
            });
            fetchSongs(); // Refresh the list
        }
    };

    const handleRemoveSelected = async () => {
        if (selectedSongs.size === 0) return;
        if (confirm(`Are you sure you want to remove ${selectedSongs.size} selected song(s)?`)) {
            // Filter locally first to avoid race conditions with multiple async reads
            let currentSongs = await api.getSongs(playlist.id);
            currentSongs = currentSongs.filter(s => !selectedSongs.has(s.id));
            localStorage.setItem(`songs_${playlist.id}`, JSON.stringify(currentSongs));

            setSelectedSongs(new Set());
            fetchSongs();
        }
    };

    const toggleSelection = (songId) => {
        const newSelected = new Set(selectedSongs);
        if (newSelected.has(songId)) {
            newSelected.delete(songId);
        } else {
            newSelected.add(songId);
        }
        setSelectedSongs(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedSongs.size === songs.length && songs.length > 0) {
            setSelectedSongs(new Set());
        } else {
            setSelectedSongs(new Set(songs.map(s => s.id)));
        }
    };

    const handleDownloadAll = async () => {
        const readySongs = songs.filter(s => s.status === 'ready' && !s.isOffline);
        if (readySongs.length === 0) {
            alert("No ready online songs available to download.");
            return;
        }

        if (!confirm(`Are you sure you want to download all ${readySongs.length} ready track(s) in this playlist?`)) {
            return;
        }

        try {
            // Ask user for a directory to save all files
            const dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });

            let newDownloaded = new Set(downloadedSongs);

            for (const song of readySongs) {
                try {
                    const res = await fetch(`${API_BASE}${song.audio_path}`);
                    const blob = await res.blob();
                    dataTracker.addUsage(song.url, blob.size);

                    // Create a file in the selected directory
                    const ext = song.audio_path ? song.audio_path.split('.').pop() : 'mp3';
                    const safeTitle = (song.title || 'audio').replace(/[\/\?<>\\:\*\|"]/g, ''); // sanitize filename
                    const fileHandle = await dirHandle.getFileHandle(`${safeTitle}.${ext}`, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();

                    newDownloaded.add(song.id);
                } catch (songErr) {
                    console.error(`Failed to download ${song.title}:`, songErr);
                }
            }

            setDownloadedSongs(newDownloaded);
            localStorage.setItem('downloaded_songs', JSON.stringify([...newDownloaded]));
            alert("All downloads completed successfully!");

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Directory selection or download failed:", err);
                alert("Failed to save files. Your browser may not support this feature or permission was denied.");
            }
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(244, 228, 193, 0.1)', paddingBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }} className="text-gradient">
                            {playlist.name}
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            {songs.length} Track{songs.length !== 1 && 's'}
                        </p>
                    </div>
                    {selectedSongs.size > 0 && (
                        <button
                            className="glass-button"
                            onClick={handleRemoveSelected}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.9rem', color: '#ff8a80', borderColor: '#ff8a80' }}
                            title={`Delete ${selectedSongs.size} selected tracks`}
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            Delete Selected ({selectedSongs.size})
                        </button>
                    )}
                    {songs.some(s => s.status === 'ready' && !s.isOffline) && (
                        <button
                            className="glass-button primary"
                            onClick={handleDownloadAll}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.9rem' }}
                            title="Download all ready tracks"
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Download All
                        </button>
                    )}
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

                {songs.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px 8px 8px', gap: '12px' }}>
                        <input
                            type="checkbox"
                            checked={songs.length > 0 && selectedSongs.size === songs.length}
                            onChange={toggleSelectAll}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            title="Select All"
                        />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Select All</span>
                    </div>
                )}

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
                                opacity: draggedItemIndex === index ? 0.4 : 1,
                                background: selectedSongs.has(song.id) ? 'rgba(244, 228, 193, 0.05)' : undefined
                            }}
                        >
                            <div className="drag-handle" style={{ cursor: 'grab', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', marginRight: '4px' }} title="Drag to reorder">
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="8" y1="6" x2="21" y2="6"></line>
                                    <line x1="8" y1="12" x2="21" y2="12"></line>
                                    <line x1="8" y1="18" x2="21" y2="18"></line>
                                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                                </svg>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedSongs.has(song.id)}
                                    onChange={() => toggleSelection(song.id)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px', color: 'var(--text-secondary)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                {index + 1}
                            </div>

                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(244, 228, 193, 0.1)' }}>
                                {song.thumbnail ? (
                                    <img src={song.thumbnail} alt={song.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <img src="/bg-music-icon.png" alt="Music Icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

                            <div style={{ display: 'flex', gap: '12px' }}>
                                {(isReady || song.status === 'failed') && (
                                    <>
                                        <button
                                            onClick={(e) => handleCopyLink(e, song.url)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                fontSize: '1.2rem',
                                                padding: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            title="Copy Original Link"
                                        >
                                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                        </button>
                                        <button
                                            onClick={(e) => handleRemoveSong(e, song.id)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                fontSize: '1.2rem',
                                                padding: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            title="Remove Song"
                                        >
                                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                        </button>
                                    </>
                                )}
                                {isReady && !song.isOffline && (
                                    <button
                                        className="glass-button"
                                        onClick={() => downloadMP3(song)}
                                        style={{
                                            padding: '10px',
                                            fontSize: '1.2rem',
                                            borderRadius: '50%',
                                            width: '42px',
                                            height: '42px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            ...(downloadedSongs.has(song.id) ? { color: '#ff8a80', borderColor: '#ff8a80', background: 'rgba(255, 138, 128, 0.1)' } : {})
                                        }}
                                        title={downloadedSongs.has(song.id) ? "Downloaded" : "Download Audio"}
                                    >
                                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    </button>
                                )}
                                {isReady && (
                                    <button
                                        className={isPlaying ? "glass-button active" : "glass-button primary"}
                                        onClick={() => onPlay(songs.filter(s => s.status === 'ready'), songs.filter(s => s.status === 'ready').findIndex(s => s.id === song.id))}
                                        style={{ padding: '8px 24px', fontSize: '0.95rem', borderRadius: '12px' }}
                                    >
                                        {isPlaying ? 'ACTIVE' : 'PLAY'}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PlaylistManager;
