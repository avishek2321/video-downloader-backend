const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const ytdl = require('ytdl-core');
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
        console.log('Analyzing URL with ytdl-core:', url);
        
        const info = await ytdl.getInfo(url);

        // Extract and deduplicate unique resolutions
        const seenResolutions = new Set();
        const formats = (info.formats || [])
            .filter(f => f.qualityLabel && f.url)
            .map(f => {
                let label = f.qualityLabel;
                if (label.includes('2160p')) label = '4K';
                else if (label.includes('1440p')) label = '2K';
                
                return {
                    format_id: f.itag,
                    ext: 'mp4',
                    resolution: label,
                    quality: label,
                    height: f.height || 0,
                    filesize: f.contentLength ? (parseInt(f.contentLength) / (1024 * 1024)).toFixed(2) + ' MB' : 'Size Unknown',
                    url: f.url,
                    note: f.hasAudio ? 'Video + Audio' : 'Video Only'
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
            title: info.videoDetails.title || 'Untitled Media',
            thumbnail: info.videoDetails.thumbnails && info.videoDetails.thumbnails.length > 0 ? info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url : 'https://via.placeholder.com/640x360?text=No+Thumbnail',
            duration: new Date(parseInt(info.videoDetails.lengthSeconds) * 1000).toISOString().substr(11, 8),
            source: 'YouTube',
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


