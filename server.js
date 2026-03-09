const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const ytdl = require('ytdl-core');
const youtubedl = require('yt-dlp-exec');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper function to convert Shorts URL to Watch URL
const convertShortsToWatch = (url) => {
    if (url.includes("youtube.com/shorts/")) {
        const id = url.split("/shorts/")[1].split("?")[0];
        return `https://www.youtube.com/watch?v=${id}`;
    }
    return url;
};

// API route for media analysis
app.post('/api/download', async (req, res) => {
    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Video URL required' });
    }

    url = convertShortsToWatch(url);

    try {
        console.log('Analyzing URL with yt-dlp-exec:', url);
        
        // Use yt-dlp-exec for ALL analysis as it supports 1080p, 2K, 4K and is more stable
        const data = await youtubedl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:https://www.google.com/',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            ]
        });

        // Extract and deduplicate unique resolutions
        const seenResolutions = new Set();
        const formats = (data.formats || [])
            .filter(f => f.height && f.url) // Include all heights, we'll handle audio during download
            .map(f => {
                let label = f.format_note || (f.height ? f.height + "p" : "Video");
                if (label.includes('2160p')) label = '4K';
                else if (label.includes('1440p')) label = '2K';
                else if (label.includes('p')) label = label.split('p')[0] + 'p';
                
                return {
                    format_id: f.format_id,
                    ext: f.ext || 'mp4',
                    resolution: label,
                    quality: label,
                    height: f.height || 0,
                    filesize: f.filesize ? (f.filesize / (1024 * 1024)).toFixed(2) + ' MB' : (f.filesize_approx ? (f.filesize_approx / (1024 * 1024)).toFixed(2) + ' MB' : 'Size Unknown'),
                    url: f.url,
                    note: 'Video + Audio' // We promise audio because we'll merge it in the download route
                };
            })
            .filter(f => {
                if (seenResolutions.has(f.resolution)) return false;
                seenResolutions.add(f.resolution);
                return true;
            })
            .sort((a, b) => b.height - a.height);

        if (formats.length === 0) {
            return res.status(400).json({ error: "No downloadable formats found." });
        }

        const result = {
            title: data.title || 'Untitled Media',
            thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1].url : 'https://via.placeholder.com/640x360?text=No+Thumbnail'),
            duration: data.duration_string || (data.duration ? new Date(data.duration * 1000).toISOString().substr(11, 8) : 'N/A'),
            source: data.extractor_key || 'Video',
            formats: formats.slice(0, 20),
            original_url: url
        };

        console.log('Successfully analyzed media:', result.title);
        return res.json(result);

    } catch (error) {
        console.error('Analysis Error:', error.message);
        res.status(400).json({ 
            error: "Unable to analyze this video link. Make sure the video is public." 
        });
    }
});

// GET route for /api/download - Handles the actual file stream with quality selection
app.get('/api/download', async (req, res) => {
    const { url, itag } = req.query;

    if (!url) {
        return res.status(400).send("Video URL missing");
    }

    try {
        console.log('Processing download request for itag:', itag);
        
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { 
            quality: itag 
        });

        if (!format) {
            throw new Error("No suitable format found.");
        }

        res.setHeader(
            "Content-Disposition",
            "attachment; filename=video.mp4"
        );

        ytdl(url, { format }).pipe(res);

    } catch (error) {
        console.error('Download error:', error.message);
        if (!res.headersSent) {
            res.status(500).json({
                error: "Download failed"
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


