export const TRACKER_KEY = 'data_usage_tracker';

export const dataTracker = {
    getUsage() {
        const stored = localStorage.getItem(TRACKER_KEY);
        return stored ? JSON.parse(stored) : {};
    },

    addUsage(url, bytes) {
        if (!url || url === 'offline') return;
        try {
            let domain = 'Other';
            if (url.startsWith('http')) {
                const hostname = new URL(url).hostname;
                domain = hostname.replace('www.', '');
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                domain = 'youtube.com';
            } else {
                domain = 'Search/Other';
            }
            const usage = this.getUsage();
            usage[domain] = (usage[domain] || 0) + bytes;
            localStorage.setItem(TRACKER_KEY, JSON.stringify(usage));
            window.dispatchEvent(new Event('dataUsageUpdated'));
        } catch (e) {
            console.error('Invalid URL for tracking:', url);
        }
    },

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};
