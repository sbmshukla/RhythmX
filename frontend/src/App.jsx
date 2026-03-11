import { useState, useEffect, useRef } from 'react';
import PlaylistManager from './components/PlaylistManager';
import MiniPlayer from './components/MiniPlayer';
import { api } from './services/api';
import { dataTracker } from './services/dataTracker';

function App() {
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null);

  // Player state
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Advanced settings
  const [playbackMode, setPlaybackMode] = useState('SEQUENCE');
  const [volume, setVolume] = useState(1.0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const isPopout = window.location.search.includes('popout=true');

  const [dataUsage, setDataUsage] = useState({});

  useEffect(() => {
    setDataUsage(dataTracker.getUsage());
    const handleUsageUpdate = () => setDataUsage(dataTracker.getUsage());
    window.addEventListener('dataUsageUpdated', handleUsageUpdate);
    return () => window.removeEventListener('dataUsageUpdated', handleUsageUpdate);
  }, []);

  useEffect(() => {
    if (isPopout) {
      document.title = "SmartPlayer - Mini";
    }

    // Initial sync
    const stored = localStorage.getItem('player_state');
    if (stored) {
      const state = JSON.parse(stored);
      setQueue(state.queue || []);
      setCurrentIndex(state.currentIndex || 0);
      setIsPlaying(state.isPlaying || false);
      setPlaybackMode(state.playbackMode || 'SEQUENCE');
      setVolume(state.volume !== undefined ? state.volume : 1.0);
      setPlaybackSpeed(state.playbackSpeed || 1.0);
      if (!isPopout) {
        setShowPlayer(state.showPlayer || false);
      } else {
        setShowPlayer(true);
      }
    }

    const handleStorage = (e) => {
      if (e.key === 'player_state' && e.newValue) {
        const state = JSON.parse(e.newValue);
        setQueue(state.queue);
        setCurrentIndex(state.currentIndex);
        setIsPlaying(state.isPlaying);
        setPlaybackMode(state.playbackMode || 'SEQUENCE');
        setVolume(state.volume !== undefined ? state.volume : 1.0);
        setPlaybackSpeed(state.playbackSpeed || 1.0);
        if (!isPopout) setShowPlayer(state.showPlayer);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isPopout]);

  const handleStateChange = (newQueue, newIndex, newPlaying, newShow) => {
    setQueue(newQueue);
    setCurrentIndex(newIndex);
    setIsPlaying(newPlaying);
    setShowPlayer(isPopout ? true : newShow);

    // Save everything using the current version of the advanced settings state variables
    // We capture settings from state since this is only called on song/play/queue updates
    localStorage.setItem('player_state', JSON.stringify({
      queue: newQueue,
      currentIndex: newIndex,
      isPlaying: newPlaying,
      showPlayer: isPopout ? false : newShow,
      playbackMode: playbackMode,
      volume: volume,
      playbackSpeed: playbackSpeed
    }));
  };

  const handleSettingsChange = (mode, vol, speed) => {
    setPlaybackMode(mode);
    setVolume(vol);
    setPlaybackSpeed(speed);

    localStorage.setItem('player_state', JSON.stringify({
      queue,
      currentIndex,
      isPlaying,
      showPlayer: isPopout ? false : showPlayer,
      playbackMode: mode,
      volume: vol,
      playbackSpeed: speed
    }));
  };

  const playSong = (songsList, index) => {
    const isMobile = window.innerWidth <= 768;

    // Save state first. If mobile, we want showPlayer to be true so it renders inline
    handleStateChange(songsList, index, true, isMobile);

    if (!isMobile) {
      // Open popout instantly on larger screens
      window.open(window.location.origin + '?popout=true', 'SmartPlayer_Popout', 'width=380,height=650,menubar=0,toolbar=0,location=0,status=0,resizable=1');
    }
  };

  // If we are in the popout window, only render the player!
  if (isPopout) {
    return (
      <div style={{ background: 'var(--bg-darker)', minHeight: '100vh', width: '100vw' }}>
        {showPlayer && queue.length > 0 ? (
          <MiniPlayer
            queue={queue}
            currentIndex={currentIndex}
            isPlaying={isPlaying}
            onStateChange={handleStateChange}
            isPopout={true}
            playbackMode={playbackMode}
            volume={volume}
            playbackSpeed={playbackSpeed}
            onSettingsChange={handleSettingsChange}
          />
        ) : (
          <div style={{ color: 'white', padding: '20px', textAlign: 'center' }}>No active queue. Play a song from the main window!</div>
        )}
      </div>
    );
  }

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    try {
      const data = await api.getPlaylists();
      setPlaylists(data);
      if (data.length > 0 && !activePlaylist) {
        setActivePlaylist(data[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreatePlaylist = async () => {
    const name = prompt("Enter playlist name:");
    if (name) {
      const newPlaylist = await api.createPlaylist(name);
      setPlaylists([...playlists, newPlaylist]);
      setActivePlaylist(newPlaylist);
    }
  };

  const handleImportFolder = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Filter audio files
    const audioFiles = Array.from(files).filter(file => file.type.startsWith('audio/'));
    if (audioFiles.length === 0) {
      alert("No audio files found in the selected folder.");
      e.target.value = null;
      return;
    }

    const folderName = files[0].webkitRelativePath.split('/')[0] || "Imported Folder";
    const name = prompt(`Found ${audioFiles.length} audio files. Enter playlist name:`, folderName);

    if (name) {
      setIsImporting(true);
      try {
        const newPlaylist = await api.createPlaylist(name);

        let importedSongs = [];
        for (const file of audioFiles) {
          const songId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
          await api.saveOfflineAudio(songId, file);

          const offlineSong = {
            id: songId,
            playlist_id: newPlaylist.id,
            title: file.name.replace(/\.[^/.]+$/, ""), // remove extension for title
            url: "offline",
            status: "ready",
            progress: 100,
            audio_path: `offline:${songId}`,
            thumbnail: null,
            isOffline: true,
            duration: 0 // Will be calculated on playback usually
          };
          importedSongs.push(offlineSong);
        }

        // Add to local storage at once or one by one
        let existingSongs = await api.getSongs(newPlaylist.id);
        existingSongs = [...existingSongs, ...importedSongs];
        localStorage.setItem(`songs_${newPlaylist.id}`, JSON.stringify(existingSongs));

        setPlaylists([...playlists, newPlaylist]);
        setActivePlaylist(newPlaylist);
        alert(`Successfully imported ${importedSongs.length} songs!`);
      } catch (err) {
        console.error("Failed to import folder", err);
        alert("Encountered an error while importing.");
      } finally {
        setIsImporting(false);
      }
    }
    e.target.value = null; // reset input
  };

  const handleDeletePlaylist = async (e, id) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this playlist?")) {
      await api.deletePlaylist(id);
      const updatedPlaylists = playlists.filter(p => p.id !== id);
      setPlaylists(updatedPlaylists);
      if (activePlaylist?.id === id) {
        setActivePlaylist(updatedPlaylists.length > 0 ? updatedPlaylists[0] : null);
      }
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar glass-panel">
        <h2 className="text-gradient" style={{ fontSize: '1.5rem', marginBottom: '10px' }}>
          SHUBH S.
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button className="glass-button primary" onClick={handleCreatePlaylist} style={{ width: '100%', justifyContent: 'center' }}>
            + NEW PLAYLIST
          </button>
          <label className="glass-button" style={{ width: '100%', cursor: 'pointer', justifyContent: 'center' }}>
            {isImporting ? '⏳ IMPORTING...' : 'Import Folder'}
            <input
              type="file"
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={handleImportFolder}
              style={{ display: 'none' }}
              disabled={isImporting}
            />
          </label>
        </div>

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Your Libary
          </h3>
          {playlists.map(p => (
            <div
              key={p.id}
              onClick={() => setActivePlaylist(p)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: activePlaylist?.id === p.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                transition: 'background 0.2s'
              }}
            >
              <span>{p.name}</span>
              <button
                onClick={(e) => handleDeletePlaylist(e, p.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Delete Playlist"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              </button>
            </div>
          ))}
          {playlists.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              No playlists found. Create one!
            </div>
          )}
        </div>

        <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Data Usage By Site
          </h3>
          {Object.entries(dataUsage).length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              No data usage recorded yet.
            </div>
          ) : (
            Object.entries(dataUsage).map(([site, bytes]) => (
              <div
                key={site}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 14px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  fontSize: '0.9rem'
                }}
              >
                <span style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }} title={site}>{site}</span>
                <span style={{ color: 'var(--primary-accent)', fontWeight: 'bold' }}>{dataTracker.formatBytes(bytes)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area: Center Panel */}
      <div className="center-panel glass-panel">
        {activePlaylist ? (
          <PlaylistManager
            playlist={activePlaylist}
            onPlay={playSong}
            currentPlayingId={queue[currentIndex]?.id}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--primary-accent)', opacity: 0.5 }}>SELECT A PLAYLIST</h2>
          </div>
        )}
      </div>

      {/* Floating Mini Player */}
      {showPlayer && queue.length > 0 && (
        <MiniPlayer
          queue={queue}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          onStateChange={handleStateChange}
          isPopout={false}
          playbackMode={playbackMode}
          volume={volume}
          playbackSpeed={playbackSpeed}
          onSettingsChange={handleSettingsChange}
        />
      )}
    </div>
  );
}

export default App;
