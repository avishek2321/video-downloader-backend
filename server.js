const express = require("express"); 
const cors = require("cors"); 
const ytdl = require("ytdl-core"); 

const app = express(); 
app.use(cors()); 

app.get("/api/download", async (req, res) => { 
  try { 
    const url = req.query.url; 

    if (!ytdl.validateURL(url)) { 
      return res.status(400).json({ error: "Invalid video URL" }); 
    } 

    const info = await ytdl.getInfo(url); 

    res.json({ 
      title: info.videoDetails.title, 
      thumbnail: info.videoDetails.thumbnails[0].url, 
      formats: info.formats 
    }); 

  } catch (err) { 
    res.status(500).json({ error: "Download failed" }); 
  } 
}); 

app.get("/", (req, res) => { 
  res.send("Backend running"); 
}); 

const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => console.log("Server running"));
