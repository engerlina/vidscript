require('dotenv').config();
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getSubtitles } = require('youtube-captions-scraper');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const cron = require('node-cron');
const { exec } = require('child_process');
const { ClerkExpressWithAuth, users } = require('@clerk/clerk-sdk-node');


require('dotenv').config();

const app = express();

// Use the ClerkExpressWithAuth middleware for lax authentication
app.use(ClerkExpressWithAuth({ secretKey: process.env.CLERK_SECRET_KEY }));
app.use(ClerkExpressRequireAuth({ secretKey: process.env.CLERK_SECRET_KEY }));

app.use((req, res, next) => {
  if (req.headers.host === 'vidscript.co') {
    return res.redirect(301, 'https://www.vidscript.co' + req.url);
  }
  next();
});

const port = process.env.PORT || 3000;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const languageMap = require('./languageMap');

// Configure PostgreSQL client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware for session handling using PostgreSQL
app.use(session({
  store: new pgSession({
    pool: pool, // Connection pool
    tableName: 'session', // Use another table-name than the default "session" one
  }),
  secret: process.env.SESSION_SECRET || 'default-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // use secure cookies in production
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

const clerkMiddleware = ClerkExpressWithAuth({
  publicKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});

app.use((req, res, next) => {
  res.locals.clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  next();
});

app.get(
  '/user/email',
  ClerkExpressRequireAuth(),
  async (req, res) => {
    try {
      const user = req.auth.user;
      const email = user.email_addresses.find(e => e.id === user.primary_email_address_id).email;
      res.json({ email });
    } catch (error) {
      res.status(500).send('An error occurred: ' + error.message);
    }
  }
);

const MAX_USES_PER_DAY = 100;
const TRANSCRIPTS_FOLDER = path.join(__dirname, 'transcripts');

const cors = require('cors');
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

if (!fs.existsSync(TRANSCRIPTS_FOLDER)) {
  fs.mkdirSync(TRANSCRIPTS_FOLDER);
}

app.get('/', (req, res) => {
  res.render('index', { url: req.protocol + '://' + req.get('host') + req.originalUrl });
});

app.get('/privacy-policy', (req, res) => {
  res.render('privacy-policy', { url: req.protocol + '://' + req.get('host') + req.originalUrl });
});

app.get('/terms-of-service', (req, res) => {
  res.render('terms-of-service', { url: req.protocol + '://' + req.get('host') + req.originalUrl });
});

app.get('/test', (req, res) => {
  res.render('test', { url: req.protocol + '://' + req.get('host') + req.originalUrl });
});

const getYouTubeVideoId = (url) => {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const matches = url.match(regex);
  return matches ? matches[1] : null;
};

const getAvailableLanguages = async (videoId) => {
  try {
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/captions`, {
      params: {
        part: 'snippet',
        videoId: videoId,
        key: YOUTUBE_API_KEY
      }
    });

    const captions = response.data.items;
    const availableLanguages = captions.map(caption => {
      const lang = caption.snippet.language;
      return {
        code: lang,
        name: languageMap[lang] || lang
      };
    });

    return availableLanguages;
  } catch (error) {
    console.error(`An error occurred while fetching available languages: ${error.message}`);
    return [];
  }
};

const getTranscriptAndSave = async (videoId, selectedLanguage, identifier, isLoggedIn) => {
  try {
    const subtitles = await getSubtitles({ videoID: videoId, lang: selectedLanguage });
    const csvFilename = `transcript_${isLoggedIn ? 'user_' + identifier : identifier}_${videoId}_${selectedLanguage}.csv`;
    const csvWriter = createCsvWriter({
      path: path.join(TRANSCRIPTS_FOLDER, csvFilename),
      header: [
        { id: 'start', title: 'Start' },
        { id: 'dur', title: 'Duration' },
        { id: 'text', title: 'Text' }
      ]
    });
    await csvWriter.writeRecords(subtitles);

    const txtFilename = `transcript_${isLoggedIn ? 'user_' + identifier : identifier}_${videoId}_${selectedLanguage}.txt`;
    const txtFilePath = path.join(TRANSCRIPTS_FOLDER, txtFilename);
    const subtitlesText = subtitles.map(entry => entry.text).join('\n');
    fs.writeFileSync(txtFilePath, subtitlesText);

    console.log(`Subtitles saved to ${csvFilename} and ${txtFilename}`);
    return { txtFilename, csvFilename, subtitlesText };
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    throw error;
  }
};

// Test route to verify authentication
app.get('/test-auth', ClerkExpressRequireAuth(), (req, res) => {
  console.log('Request auth object:', req.auth);
  res.json({ auth: req.auth });
});

// Route to fetch user details
app.get('/user-details', ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const user = await clerkClient.users.getUser(userId);
    res.json(user);
  } catch (error) {
    console.error('Error retrieving user details:', error);
    res.status(500).json({ error: 'Error retrieving user details' });
  }
});

// Transcribe route
app.post('/transcribe', ClerkExpressRequireAuth(), async (req, res) => {
  const youtubeUrl = req.body.url;
  const videoId = getYouTubeVideoId(youtubeUrl);

  if (!videoId) {
    console.error('Invalid video ID');
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  console.log('Request auth object:', req.auth);

  const isLoggedIn = !!req.auth?.userId;
  let identifier = req.sessionID;
  let userIdentifier = req.sessionID;

  if (isLoggedIn) {
    try {
      console.log('User is logged in. Fetching user details...');
      const userId = req.auth.userId;
      const user = await clerkClient.users.getUser(userId);
      console.log('User details:', user);
      const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
      console.log('Primary email:', primaryEmail);
      if (primaryEmail) {
        userIdentifier = primaryEmail.emailAddress;
        identifier = userIdentifier;
        console.log('User identifier set to:', userIdentifier);
      } else {
        console.log('Primary email not found');
      }
    } catch (error) {
      console.error('An error occurred while retrieving user email:', error);
      // Fallback to using req.sessionID as identifier
      identifier = req.sessionID;
      userIdentifier = req.sessionID;
    }
  } else {
    console.log('User is not logged in');
  }

  if (!isLoggedIn && req.session.usageCount >= MAX_USES_PER_DAY) {
    return res.status(429).json({ error: 'Daily maximum of 100 uses, please Sign up for unlimited uses' });
  }

  try {
    const availableLanguages = await getAvailableLanguages(videoId);
    console.log('Available languages:', availableLanguages);

    if (availableLanguages.length === 0) {
      console.log(`No captions found for video: ${videoId}`);
      return res.status(404).json({ error: 'No captions found for the video' });
    }

    if (availableLanguages.length === 1) {
      const selectedLanguage = availableLanguages[0].code;
      const { txtFilename, csvFilename, subtitlesText } = await getTranscriptAndSave(videoId, selectedLanguage, identifier);

      if (!isLoggedIn) {
        req.session.usageCount++;
      }

      // Store the transcription details in the database
      const transcriptFilename = path.parse(txtFilename).name;
      await pool.query(
        'INSERT INTO transcriptions (url, user_identifier, request_datetime, transcript_filename) VALUES ($1, $2, $3, $4)',
        [youtubeUrl, userIdentifier, new Date(), transcriptFilename]
      );

      res.json({
        languageCodes: availableLanguages,
        savedTranscripts: [{ languageCode: selectedLanguage, txtFilename, csvFilename, subtitlesText }]
      });
    } else {
      res.json({ languageCodes: availableLanguages, savedTranscripts: [] });
    }
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while fetching the subtitles.' });
  }
});

app.get('/transcribe/:videoId/:lang', clerkMiddleware, async (req, res) => {
  const videoId = req.params.videoId;
  const selectedLanguage = req.params.lang;
  const isLoggedIn = !!req.auth.userId;
  const identifier = isLoggedIn ? req.auth.userId : req.sessionID;

  try {
    const { txtFilename, csvFilename, subtitlesText } = await getTranscriptAndSave(videoId, selectedLanguage, identifier, isLoggedIn);

    if (!isLoggedIn) {
      req.session.usageCount++;
    }

    res.json({
      languageCodes: [{ code: selectedLanguage, name: getLanguageName(selectedLanguage) }],
      savedTranscripts: [{ languageCode: selectedLanguage, txtFilename, csvFilename, subtitlesText }]
    });
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while fetching the subtitles.' });
  }
});

const getLanguageName = (code) => {
  return languageMap[code] || code;
};

app.get('/download-txt/:filename', clerkMiddleware, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(TRANSCRIPTS_FOLDER, filename);
  res.download(filePath, filename);
});

app.get('/download-csv/:filename', clerkMiddleware, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(TRANSCRIPTS_FOLDER, filename);
  res.download(filePath, filename);
});

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

app.get('/modal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modal.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
