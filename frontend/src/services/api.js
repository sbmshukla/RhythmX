const API_BASE = "https://rhythmx-ufoe.onrender.com";

// --- IndexedDB for Offline Audio Storage ---
const DB_NAME = "SmartPlayerDB";
const STORE_NAME = "offline_audio";

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveBlob = async (key, blob) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getBlob = async (key) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(tx.error);
  });
};

// --- Local Storage Helpers ---
const loadPlaylists = () => {
  const stored = localStorage.getItem('playlists');
  return stored ? JSON.parse(stored) : [];
};

const savePlaylists = (playlists) => {
  localStorage.setItem('playlists', JSON.stringify(playlists));
};

export const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const api = {
  // Offline Storage Exposure
  async saveOfflineAudio(id, fileBlob) {
    await saveBlob(id, fileBlob);
  },

  async getOfflineAudio(id) {
    return await getBlob(id);
  },

  // Local Storage Management
  async getPlaylists() {
    return loadPlaylists();
  },

  async createPlaylist(name) {
    const playlists = loadPlaylists();
    const newPlaylist = {
      id: generateId(),
      name: name,
      created_at: new Date().toISOString()
    };
    playlists.push(newPlaylist);
    savePlaylists(playlists);
    return newPlaylist;
  },

  async getSongs(playlistId) {
    const stored = localStorage.getItem(`songs_${playlistId}`);
    return stored ? JSON.parse(stored) : [];
  },

  async addSongToLocal(playlistId, song) {
    const songs = await this.getSongs(playlistId);
    songs.push(song);
    localStorage.setItem(`songs_${playlistId}`, JSON.stringify(songs));
  },

  async deletePlaylist(id) {
    let playlists = loadPlaylists();
    playlists = playlists.filter(p => p.id !== id);
    savePlaylists(playlists);
    localStorage.removeItem(`songs_${id}`);
  },

  async removeSong(playlistId, songId) {
    let songs = await this.getSongs(playlistId);
    songs = songs.filter(s => s.id !== songId);
    localStorage.setItem(`songs_${playlistId}`, JSON.stringify(songs));
  },

  // Backend Interaction with User's Custom API
  async convertVideo(url, playlistId) {
    // 1. Create a dummy queued song immediately for optimistic UI
    const songId = generateId();
    const queuedSong = {
      id: songId,
      playlist_id: playlistId,
      title: url,
      url: url,
      status: "converting", // Using converting since the backend blocks until done
      progress: 0,
      audio_path: null,
      thumbnail: null
    };
    await this.addSongToLocal(playlistId, queuedSong);

    // 2. Call the real synchronous API
    try {
      const res = await fetch(`${API_BASE}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      if (!res.ok) {
        throw new Error("Conversion failed");
      }

      const data = await res.json();

      // 3. Update the song with the successfully returned data
      const songs = await this.getSongs(playlistId);
      const songIndex = songs.findIndex(s => s.id === songId);
      if (songIndex > -1) {
        songs[songIndex] = {
          ...songs[songIndex],
          title: data.title || data.file,
          status: "ready",
          progress: 100,
          audio_path: data.download_url
        };
        localStorage.setItem(`songs_${playlistId}`, JSON.stringify(songs));
      }
      return data;

    } catch (e) {
      // 4. Handle failure
      const songs = await this.getSongs(playlistId);
      const songIndex = songs.findIndex(s => s.id === songId);
      if (songIndex > -1) {
        songs[songIndex].status = "failed";
        localStorage.setItem(`songs_${playlistId}`, JSON.stringify(songs));
      }
      throw e;
    }
  }
};
