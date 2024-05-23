const express = require('express');
const fs = require('fs');
const { getSubtitles } = require('youtube-captions-scraper');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/transcribe', async (req, res) => {
  const youtubeUrl = req.body.url;
  const videoId = youtubeUrl.split('v=')[1];

  try {
    const transcript = await getSubtitles({ videoID: videoId });
    res.json({ transcript });
  } catch (error) {
    if (error.message === 'Could not find captions for video') {
      res.status(404).json({ error: 'No captions found for the specified video.' });
    } else {
      console.error(`An error occurred: ${error.message}`);
      res.status(500).json({ error: 'An error occurred while fetching the transcript.' });
    }
  }
});

app.get('/download-txt', (req, res) => {
  const filePath = __dirname + '/public/transcript.txt';
  res.download(filePath, 'transcript.txt');
});

app.get('/download-csv', (req, res) => {
  const filePath = __dirname + '/public/transcript.csv';
  res.download(filePath, 'transcript.csv');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});