const express = require('express');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
const uploadsDir = '/tmp/uploads';
const outputsDir = '/tmp/outputs';

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir);
}

app.post('/convert', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const startTime = Date.now();
    
    const fileId = uuidv4();
    const mp4Path = path.join(uploadsDir, `${fileId}.mp4`);
    const mp3Path = path.join(outputsDir, `${fileId}.mp3`);
    
    // Start timing the download
    const downloadStartTime = Date.now();
    
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(mp4Path);
    
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    const downloadTime = (Date.now() - downloadStartTime) / 1000;
    console.log(`File downloaded successfully to: ${mp4Path} in ${downloadTime} seconds`);
    
    const conversionStartTime = Date.now();
    
    await new Promise((resolve, reject) => {
      ffmpeg(mp4Path)
        .output(mp3Path)
        .noVideo()
        .audioCodec('libmp3lame')
        .on('end', () => {
          console.log('Conversion finished');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error during conversion:', err);
          reject(err);
        })
        .run();
    });
    

    const conversionTime = (Date.now() - conversionStartTime) / 1000; // in seconds
    
    const totalProcessingTime = (Date.now() - startTime) / 1000; // in seconds
    
    const mp4Size = fs.statSync(mp4Path).size;
    const mp3Size = fs.statSync(mp3Path).size;
    
    res.status(200).json({
      success: true,
      message: 'Conversion successful',
      mp3File: `/download/${fileId}.mp3`,
      timing: {
        downloadTime: `${downloadTime.toFixed(2)} seconds`,
        conversionTime: `${conversionTime.toFixed(2)} seconds`,
        totalProcessingTime: `${totalProcessingTime.toFixed(2)} seconds`
      },
      fileInfo: {
        originalSize: `${(mp4Size / (1024 * 1024)).toFixed(2)} MB`,
        convertedSize: `${(mp3Size / (1024 * 1024)).toFixed(2)} MB`,
        compressionRatio: `${((1 - (mp3Size / mp4Size)) * 100).toFixed(2)}%`
      },
      fileId: fileId
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Conversion failed', details: error.message });
  }
});


app.get('/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(outputsDir, filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.post('/cleanup', (req, res) => {
  try {
    const { fileId } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }
    
    const mp4Path = path.join(uploadsDir, `${fileId}.mp4`);
    const mp3Path = path.join(outputsDir, `${fileId}.mp3`);
    
    if (fs.existsSync(mp4Path)) {
      fs.unlinkSync(mp4Path);
    }
    
    if (fs.existsSync(mp3Path)) {
      fs.unlinkSync(mp3Path);
    }
    
    res.status(200).json({ success: true, message: 'Files cleaned up successfully' });
    
  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});