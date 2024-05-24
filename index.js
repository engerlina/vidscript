const express = require('express');
const fs = require('fs');
const path = require('path');
const { getSubtitles } = require('youtube-captions-scraper');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const session = require('express-session');
const cron = require('node-cron');
const { exec } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: '1f7f3c2d8e6c4b5a9d3c1e7f8b6a5d4csd433235gff',
  resave: false,
  saveUninitialized: true
}));

const MAX_USES_PER_DAY = 100; // Set the maximum number of uses per day
const TRANSCRIPTS_FOLDER = 'transcripts';

// Create the transcripts folder if it doesn't exist
if (!fs.existsSync(TRANSCRIPTS_FOLDER)) {
  fs.mkdirSync(TRANSCRIPTS_FOLDER);
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const getYouTubeVideoId = (url) => {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const matches = url.match(regex);
  return matches ? matches[1] : null;
};

app.post('/transcribe', async (req, res) => {
  const youtubeUrl = req.body.url;
  const videoId = getYouTubeVideoId(youtubeUrl);

  if (!videoId) {
    console.error('Invalid video ID');
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  // Check the user's usage count
  if (!req.session.usageCount) {
    req.session.usageCount = 0;
  }

  if (req.session.usageCount >= MAX_USES_PER_DAY) {
    return res.status(429).json({ error: 'Daily usage limit reached' });
  }

  try {
    const transcript = await getSubtitles({ videoID: videoId });

    // Generate unique filenames using user ID and timestamp
    const userID = req.session.id;
    const timestamp = Date.now();
    const txtFilename = `transcript_${userID}_${timestamp}.txt`;
    const csvFilename = `transcript_${userID}_${timestamp}.csv`;

    // Save the transcript to a TXT file
    const txtFilePath = path.join(TRANSCRIPTS_FOLDER, txtFilename);
    const transcriptText = transcript.map(entry => entry.text).join('\n');
    fs.writeFileSync(txtFilePath, transcriptText);

    // Save the transcript to a CSV file
    const csvWriter = createCsvWriter({
      path: path.join(TRANSCRIPTS_FOLDER, csvFilename),
      header: [
        { id: 'start', title: 'Start' },
        { id: 'dur', title: 'Duration' },
        { id: 'text', title: 'Text' }
      ]
    });
    await csvWriter.writeRecords(transcript);

    // Increment the user's usage count
    req.session.usageCount++;

    res.json({ transcript, txtFilename, csvFilename });
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while fetching the transcript.' });
  }
});

app.get('/download-txt/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(TRANSCRIPTS_FOLDER, filename);
  res.download(filePath, filename);
});

app.get('/download-csv/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(TRANSCRIPTS_FOLDER, filename);
  res.download(filePath, filename);
});

// Scheduler: Run deleteOldTranscripts.js every hour
cron.schedule('0 * * * *', () => {
  console.log('Running deleteOldTranscripts.js script');

  exec('node deleteOldTranscripts.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing script: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Script stderr: ${stderr}`);
      return;
    }
    console.log(`Script output: ${stdout}`);
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
