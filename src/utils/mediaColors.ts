export const MediaAccentColors: Record<string, string> = {
    youtube: '#ff0000',
    spotify: '#1DB954',
    applemusic: '#FA243C',
    soundcloud: '#FF5500',
    twitch: '#9146FF',
    netflix: '#E50914',
};

export const defaultMediaAccent = '#ff8c00';

// if else looks very stupid so just change it to a more efficient way to map
export function getAccentColorFromURL(url?: string): string {
    if (!url) return defaultMediaAccent;

    try {
        const host = new URL(url).hostname.toLocaleLowerCase();
        if (host.includes('youtube.com') || host.includes('youtu.be')) {
            return MediaAccentColors.youtube ?? defaultMediaAccent;
        }

        if (host.includes('spotify.com')) {
            return MediaAccentColors.spotify ?? defaultMediaAccent;
        }
        if (host.includes('music.apple.com') || host.includes('apple.com')) {
            return MediaAccentColors.applemusic ?? defaultMediaAccent;
        }
        if (host.includes('soundcloud.com')) {
            return MediaAccentColors.soundcloud ?? defaultMediaAccent;
        }
        if (host.includes('twitch.tv')) {
            return MediaAccentColors.twitch ?? defaultMediaAccent;
        }
    } catch {
        return defaultMediaAccent;
    }

    return defaultMediaAccent;
}