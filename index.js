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

    // Save the transcript to a TXT file
    const txtFilePath = 'public/transcript.txt';
    const transcriptText = transcript.map(entry => entry.text).join('\n');
    fs.writeFileSync(txtFilePath, transcriptText);

    // Save the transcript to a CSV file
    const csvWriter = createCsvWriter({
      path: 'public/transcript.csv',
      header: [
        { id: 'start', title: 'Start' },
        { id: 'dur', title: 'Duration' },
        { id: 'text', title: 'Text' }
      ]
    });
    await csvWriter.writeRecords(transcript);

    res.json({ transcript });
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while fetching the transcript.' });
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