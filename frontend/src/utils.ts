
export const getSourceUrl = (path: string): string | null => {
    try {
        const filename = path.split('/').pop();
        if (!filename) return null;

        // Remove extension and extra suffixes (like _sticker_X or _overlay)
        // Format: UUID_STATUSID_PHOTOID.jpg or UUID_STATUSID_PHOTOID.jpg_sticker_X.png
        // Split by _ and find the numeric parts

        // Strategy: First remove common suffixes if present
        let cleanName = filename;
        if (cleanName.includes('.jpg_sticker_')) {
            cleanName = cleanName.split('.jpg_sticker_')[0];
        } else if (cleanName.includes('_overlay')) {
            cleanName = cleanName.split('_overlay')[0];
        } else {
            cleanName = cleanName.split('.')[0];
        }

        const parts = cleanName.split('_');

        // Robustness: Look for two consecutive large numbers at the end
        // UUIDs can have parts, but StatusID is usually long (19 digits)

        // Let's try to find the statusID and photoID from the end
        // Last part: photoId (usually 1, 2, 3, 4)
        // Second last: statusId (long number)

        if (parts.length >= 2) {
            const photoId = parts[parts.length - 1];
            const statusId = parts[parts.length - 2];

            if (/^\d+$/.test(statusId) && /^\d+$/.test(photoId)) {
                return `https://x.com/SemantiClub/status/${statusId}/photo/${photoId}`;
            }
        }
    } catch (e) {
        console.error("Error parsing source URL", e);
    }
    return null;
};
