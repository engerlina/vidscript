require('dotenv').config();
const { clerkMiddleware, requireAuth, getAuth, clerkClient } = require('@clerk/express');
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getSubtitles } = require('youtube-captions-scraper');
const youtubeSubtitles = require('@suejon/youtube-subtitles');
const youtubeTranscript = require('youtube-transcript');
const youtubeCaptionExtractor = require('youtube-caption-extractor');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const cron = require('node-cron');
const { exec } = require('child_process');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const OpenAI = require('openai');

// Check if required environment variables are available
console.log(`[STARTUP] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[STARTUP] YouTube API Key available: ${!!process.env.YOUTUBE_API_KEY}`);
console.log(`[STARTUP] Clerk Publishable Key available: ${!!process.env.CLERK_PUBLISHABLE_KEY}`);
console.log(`[STARTUP] Database URL available: ${!!process.env.DATABASE_URL}`);

const app = express();

// Use the new clerkMiddleware instead of ClerkExpressWithAuth
app.use(clerkMiddleware());

app.use((req, res, next) => {
  if (req.headers.host === 'vidscript.co') {
    return res.redirect(301, 'https://www.vidscript.co' + req.url);
  }
  next();
});

// Middleware to ensure the publishable key is available to all views
app.use((req, res, next) => {
  // Get the publishable key from environment variables
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim();
  
  // Make the key available to all views
  res.locals.clerkPublishableKey = publishableKey;
  next();
});

const port = process.env.PORT || 3000;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const languageMap = require('./languageMap');

// Configure PostgreSQL client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Ensure the transcriptions table exists
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        user_identifier TEXT NOT NULL,
        request_datetime TIMESTAMP NOT NULL,
        transcript_filename TEXT NOT NULL
      )
    `);
    console.log('[STARTUP] Ensured transcriptions table exists');
  } catch (error) {
    console.error('[STARTUP] Error ensuring transcriptions table exists:', error.message);
  }
})();

// Middleware for session handling using PostgreSQL
const sessionConfig = {
  store: new pgSession({
    pool: pool, // Connection pool
    tableName: 'session', // Use another table-name than the default "session" one
    createTableIfMissing: true, // Create the session table if it doesn't exist
  }),
  secret: process.env.SESSION_SECRET || 'default-secret',
  resave: true, // Ensure session is saved on every request
  saveUninitialized: true, // Ensure session is created for all users
  cookie: {
    secure: process.env.NODE_ENV === 'production', // use secure cookies in production
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    httpOnly: true // Prevent client-side JS from reading the cookie
  }
};

// Configure cookies for production
if (process.env.NODE_ENV === 'production') {
  // In production, allow cross-site cookies with SameSite=None
  sessionConfig.cookie.sameSite = 'none';
  
  // Set domain if provided, otherwise don't set it at all
  if (process.env.COOKIE_DOMAIN) {
    sessionConfig.cookie.domain = process.env.COOKIE_DOMAIN;
  }
  
  console.log(`[STARTUP] Production session configuration: ${JSON.stringify(sessionConfig.cookie)}`);
} else {
  // In development, use lax SameSite
  sessionConfig.cookie.sameSite = 'lax';
  console.log(`[STARTUP] Development session configuration: ${JSON.stringify(sessionConfig.cookie)}`);
}

app.use(session(sessionConfig));

// Initialize session usage count
app.use((req, res, next) => {
  if (req.session.usageCount === undefined) {
    req.session.usageCount = 0;
    // Force session save to ensure the count is initialized immediately
    req.session.save(err => {
      if (err) {
        console.error('[ERROR] Failed to save session after initializing usage count:', err);
      } else {
        console.log(`[INFO] Session initialized with usage count: ${req.session.usageCount}`);
      }
      next();
    });
  } else {
    next();
  }
});

app.get(
  '/user/email',
  requireAuth(),
  async (req, res) => {
    try {
      const { userId } = getAuth(req);
      const user = await clerkClient.users.getUser(userId);
      const email = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId).emailAddress;
      res.json({ email });
    } catch (error) {
      res.status(500).send('An error occurred: ' + error.message);
    }
  }
);

// Updated rate limits
const FREE_USER_MAX_USES_PER_DAY = 3;
const LOGGED_IN_USER_MAX_USES_PER_DAY = 10;
const TRANSCRIPTS_FOLDER = path.join(__dirname, 'transcripts');

// Configure CORS to only allow requests from your domain
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    // But for browser requests, only allow from your domain
    const allowedOrigins = [
      'https://www.vidscript.co',
      'https://vidscript.co',
      'https://staging.vidscript.co'
    ];
    
    // In development, allow localhost
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push('http://localhost:3000');
      allowedOrigins.push(undefined); // Allow requests with no origin in development
    }
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`[SECURITY] Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for requests from your own domain
    const referer = req.get('Referer');
    if (referer) {
      const refererUrl = new URL(referer);
      return refererUrl.hostname === 'www.vidscript.co' || 
             refererUrl.hostname === 'vidscript.co' ||
             (process.env.NODE_ENV !== 'production' && refererUrl.hostname === 'localhost');
    }
    return false;
  }
});

// Apply rate limiting to all requests
app.use(apiLimiter);

// Generate a unique token for each session
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  
  // Force session save to ensure the token is persisted immediately
  req.session.save(err => {
    if (err) {
      console.error('[SECURITY] Error saving session:', err);
    }
    next();
  });
});

// Middleware to validate requests to protected endpoints
const validateRequest = (req, res, next) => {
  // Check if the request is coming from our own frontend
  const referer = req.get('Referer');
  const csrfToken = req.get('X-CSRF-Token');
  const userAgent = req.get('User-Agent') || '';
  
  // Log the request details for debugging
  console.log(`[SECURITY] Request to ${req.method} ${req.path}`);
  console.log(`[SECURITY] Referer: ${referer || 'none'}`);
  console.log(`[SECURITY] User-Agent: ${userAgent}`);
  console.log(`[SECURITY] CSRF Token: ${csrfToken ? (csrfToken.substring(0, 5) + '...') : 'missing'}`);
  console.log(`[SECURITY] Session Token: ${req.session.csrfToken ? (req.session.csrfToken.substring(0, 5) + '...') : 'missing'}`);
  console.log(`[SECURITY] Request body:`, JSON.stringify(req.body).substring(0, 100) + '...');
  
  // In production, block direct API calls (curl, postman, etc.)
  if (process.env.NODE_ENV === 'production') {
    const isDirect = userAgent.includes('curl') || 
                    userAgent.includes('Postman') || 
                    userAgent.includes('python-requests') ||
                    userAgent.includes('wget') ||
                    !referer;
                    
    if (isDirect) {
      console.log('[SECURITY] Blocked direct API call in production');
      return res.status(403).json({ error: 'Forbidden - Direct API access not allowed' });
    }
  } else {
    // Skip validation in development for easier testing if it's a direct curl/postman request
    if (userAgent.includes('curl') || userAgent.includes('Postman') || !referer) {
      console.log('[SECURITY] Allowing direct API request in development mode');
      return next();
    }
  }
  
  // Validate referer
  if (!referer) {
    console.log('[SECURITY] Blocked request with no referer');
    return res.status(403).json({ error: 'Forbidden - Invalid request origin' });
  }
  
  try {
    const refererUrl = new URL(referer);
    const validDomains = ['www.vidscript.co', 'vidscript.co'];
    
    // Allow localhost in development
    if (process.env.NODE_ENV !== 'production') {
      validDomains.push('localhost');
    }
    
    if (!validDomains.some(domain => refererUrl.hostname === domain || refererUrl.hostname.endsWith('.' + domain))) {
      console.log(`[SECURITY] Blocked request from invalid referer: ${referer}`);
      return res.status(403).json({ error: 'Forbidden - Invalid request origin' });
    }
    
    // Validate CSRF token
    if (!csrfToken || csrfToken !== req.session.csrfToken) {
      console.log(`[SECURITY] CSRF token mismatch. Request token: ${csrfToken}, Session token: ${req.session.csrfToken}`);
      
      // Temporarily allow requests in production even with invalid CSRF token
      // This is for debugging purposes and should be removed once the issue is fixed
      if (process.env.NODE_ENV === 'production') {
        console.log('[SECURITY] Allowing request in production despite CSRF token mismatch (temporary debug measure)');
        return next();
      }
      
      return res.status(403).json({ error: 'Forbidden - Invalid security token' });
    }
    
    next();
  } catch (error) {
    console.error(`[SECURITY] Error validating request: ${error.message}`);
    return res.status(403).json({ error: 'Forbidden - Invalid request' });
  }
};

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

app.get('/clerk-test', (req, res) => {
  res.render('clerk-test', { url: req.protocol + '://' + req.get('host') + req.originalUrl });
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
    return [];
  }
};

const getTranscriptAndSave = async (videoId, selectedLanguage, identifier, isLoggedIn) => {
  try {
    console.log(`[DEBUG] Getting subtitles for video ID: ${videoId}, language: ${selectedLanguage}`);
    let subtitles;
    
    try {
      // First attempt with youtube-captions-scraper
      subtitles = await getSubtitles({ videoID: videoId, lang: selectedLanguage });
      console.log(`[DEBUG] Subtitles retrieved successfully with youtube-captions-scraper, entries: ${subtitles.length}`);
    } catch (primaryError) {
      console.error(`[ERROR] Primary subtitle method failed: ${primaryError.message}`);
      
      // Fallback to @suejon/youtube-subtitles
      console.log(`[DEBUG] Trying fallback method with @suejon/youtube-subtitles`);
      try {
        const result = await youtubeSubtitles.getSubtitles(videoId, selectedLanguage);
        
        // Convert to the same format as youtube-captions-scraper
        subtitles = result.map(item => ({
          start: item.start,
          dur: item.duration,
          text: item.text
        }));
        
        console.log(`[DEBUG] Subtitles retrieved successfully with fallback method, entries: ${subtitles.length}`);
      } catch (fallbackError) {
        console.error(`[ERROR] Fallback subtitle method also failed: ${fallbackError.message}`);
        
        // Second fallback to youtube-transcript
        console.log(`[DEBUG] Trying second fallback method with youtube-transcript`);
        try {
          const result = await youtubeTranscript.fetchTranscript(videoId);
          
          // Convert to the same format as youtube-captions-scraper
          subtitles = result.map(item => ({
            start: item.offset / 1000, // Convert ms to seconds
            dur: item.duration / 1000, // Convert ms to seconds
            text: item.text
          }));
          
          console.log(`[DEBUG] Subtitles retrieved successfully with second fallback method, entries: ${subtitles.length}`);
        } catch (secondFallbackError) {
          console.error(`[ERROR] Second fallback subtitle method also failed: ${secondFallbackError.message}`);
          
          // Third fallback to youtube-caption-extractor
          console.log(`[DEBUG] Trying third fallback method with youtube-caption-extractor`);
          try {
            const result = await youtubeCaptionExtractor.extract(videoId, { language: selectedLanguage });
            
            // Convert to the same format as youtube-captions-scraper
            subtitles = result.map(item => ({
              start: item.start,
              dur: item.duration || 2, // Default duration if not provided
              text: item.text
            }));
            
            console.log(`[DEBUG] Subtitles retrieved successfully with third fallback method, entries: ${subtitles.length}`);
          } catch (thirdFallbackError) {
            console.error(`[ERROR] Third fallback subtitle method also failed: ${thirdFallbackError.message}`);
            throw new Error(`All subtitle retrieval methods failed. Primary error: ${primaryError.message}, First fallback error: ${fallbackError.message}, Second fallback error: ${secondFallbackError.message}, Third fallback error: ${thirdFallbackError.message}`);
          }
        }
      }
    }
    
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
    console.log(`[DEBUG] CSV file saved: ${csvFilename}`);

    const txtFilename = `transcript_${isLoggedIn ? 'user_' + identifier : identifier}_${videoId}_${selectedLanguage}.txt`;
    const txtFilePath = path.join(TRANSCRIPTS_FOLDER, txtFilename);
    const subtitlesText = subtitles.map(entry => entry.text).join('\n');
    fs.writeFileSync(txtFilePath, subtitlesText);
    console.log(`[DEBUG] TXT file saved: ${txtFilename}`);

    return { txtFilename, csvFilename, subtitlesText };
  } catch (error) {
    console.error(`[ERROR] getTranscriptAndSave error: ${error.message}`);
    console.error(`[ERROR] Stack trace: ${error.stack}`);
    throw error;
  }
};

// Test route to verify authentication
app.get('/test-auth', requireAuth(), (req, res) => {
  const auth = getAuth(req);
  res.json({ auth });
});

// Route to fetch user details
app.get('/user-details', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await clerkClient.users.getUser(userId);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error retrieving user details' });
  }
});

// Helper function to get a persistent identifier for the user
const getPersistentIdentifier = (req) => {
  const auth = getAuth(req);
  const isLoggedIn = !!auth?.userId;
  
  if (isLoggedIn) {
    try {
      return `user_${auth.userId}`;
    } catch (error) {
      // Fall back to IP + user agent if we can't get the user ID
    }
  }
  
  // For non-logged in users or if getting user ID fails, use IP + user agent hash
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Create a simple hash of the IP and user agent
  const hash = crypto.createHash('md5').update(`${ip}_${userAgent}`).digest('hex');
  
  return `anon_${hash}`;
};

// Transcribe route
app.post('/transcribe', validateRequest, async (req, res) => {
  const youtubeUrl = req.body.url;
  const videoId = getYouTubeVideoId(youtubeUrl);

  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  const auth = getAuth(req);
  const isLoggedIn = !!auth?.userId;
  const persistentId = getPersistentIdentifier(req);
  let identifier = persistentId;
  let userIdentifier = persistentId;

  console.log(`[DEBUG] Using persistent identifier: ${persistentId}`);

  if (isLoggedIn) {
    try {
      const userId = auth.userId;
      const user = await clerkClient.users.getUser(userId);
      const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
      if (primaryEmail) {
        userIdentifier = primaryEmail.emailAddress;
        identifier = userIdentifier;
      }
    } catch (error) {
      // Fallback to using persistent ID as identifier
      console.error(`[ERROR] Failed to get user email: ${error.message}`);
      identifier = persistentId;
      userIdentifier = persistentId;
    }
  }

  // Check usage limits based on authentication status
  if (isLoggedIn) {
    // For logged-in users
    try {
      const result = await pool.query(
        'SELECT COUNT(*) FROM transcriptions WHERE user_identifier = $1 AND request_datetime > NOW() - INTERVAL \'1 day\'',
        [userIdentifier]
      );
      const usageCount = parseInt(result.rows[0].count);
      
      if (usageCount >= LOGGED_IN_USER_MAX_USES_PER_DAY) {
        return res.status(429).json({ 
          error: `Daily maximum of ${LOGGED_IN_USER_MAX_USES_PER_DAY} uses reached. Please try again tomorrow.` 
        });
      }
      
      console.log(`[INFO] Logged-in user ${userIdentifier} has used ${usageCount}/${LOGGED_IN_USER_MAX_USES_PER_DAY} requests today`);
    } catch (error) {
      console.error(`[ERROR] Failed to check usage for logged-in user: ${error.message}`);
      // Continue with the request if we can't check the database
    }
  } else {
    // For free users, check the database instead of relying solely on the session
    try {
      const result = await pool.query(
        'SELECT COUNT(*) FROM transcriptions WHERE user_identifier = $1 AND request_datetime > NOW() - INTERVAL \'1 day\'',
        [userIdentifier]
      );
      const usageCount = parseInt(result.rows[0].count);
      
      // Update the session with the correct count from the database
      req.session.usageCount = usageCount;
      
      if (usageCount >= FREE_USER_MAX_USES_PER_DAY) {
        return res.status(429).json({ 
          error: `Daily maximum of ${FREE_USER_MAX_USES_PER_DAY} uses for free accounts. Please sign up for more uses (${LOGGED_IN_USER_MAX_USES_PER_DAY} per day).` 
        });
      }
      
      console.log(`[INFO] Free user has used ${usageCount}/${FREE_USER_MAX_USES_PER_DAY} requests today (from database)`);
    } catch (error) {
      console.error(`[ERROR] Failed to check usage from database: ${error.message}`);
      
      // Fall back to session-based counting if database check fails
      if (req.session.usageCount >= FREE_USER_MAX_USES_PER_DAY) {
        return res.status(429).json({ 
          error: `Daily maximum of ${FREE_USER_MAX_USES_PER_DAY} uses for free accounts. Please sign up for more uses (${LOGGED_IN_USER_MAX_USES_PER_DAY} per day).` 
        });
      }
      
      console.log(`[INFO] Free user has used ${req.session.usageCount}/${FREE_USER_MAX_USES_PER_DAY} requests today (from session)`);
    }
  }

  try {
    console.log(`[DEBUG] Fetching available languages for video ID: ${videoId}`);
    const availableLanguages = await getAvailableLanguages(videoId);
    console.log(`[DEBUG] Available languages: ${JSON.stringify(availableLanguages)}`);

    if (availableLanguages.length === 0) {
      return res.status(404).json({ error: 'No captions found for the video' });
    }

    if (availableLanguages.length === 1) {
      const selectedLanguage = availableLanguages[0].code;
      console.log(`[DEBUG] Selected language: ${selectedLanguage}`);
      
      try {
        const { txtFilename, csvFilename, subtitlesText } = await getTranscriptAndSave(videoId, selectedLanguage, identifier, isLoggedIn);
        console.log(`[DEBUG] Transcript saved successfully: ${txtFilename}`);

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
      } catch (transcriptError) {
        console.error(`[ERROR] Failed to get transcript: ${transcriptError.message}`);
        console.error(`[ERROR] Stack trace: ${transcriptError.stack}`);
        res.status(500).json({ error: `An error occurred while fetching the subtitles: ${transcriptError.message}` });
      }
    } else {
      res.json({ languageCodes: availableLanguages, savedTranscripts: [] });
    }
  } catch (error) {
    console.error(`[ERROR] Transcribe endpoint error: ${error.message}`);
    console.error(`[ERROR] Stack trace: ${error.stack}`);
    res.status(500).json({ error: 'An error occurred while fetching the subtitles.' });
  }
});

app.get('/transcribe/:videoId/:lang', validateRequest, async (req, res) => {
  const videoId = req.params.videoId;
  const selectedLanguage = req.params.lang;
  const auth = getAuth(req);
  const isLoggedIn = !!auth?.userId;
  let identifier = req.sessionID;
  let userIdentifier = req.sessionID;

  if (isLoggedIn) {
    try {
      const userId = auth.userId;
      const user = await clerkClient.users.getUser(userId);
      const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
      if (primaryEmail) {
        userIdentifier = primaryEmail.emailAddress;
        identifier = userIdentifier;
      }
    } catch (error) {
      // Fallback to using req.sessionID as identifier
      identifier = req.sessionID;
      userIdentifier = req.sessionID;
    }
  }

  // Check usage limits based on authentication status
  if (isLoggedIn) {
    // For logged-in users
    try {
      const result = await pool.query(
        'SELECT COUNT(*) FROM transcriptions WHERE user_identifier = $1 AND request_datetime > NOW() - INTERVAL \'1 day\'',
        [userIdentifier]
      );
      const usageCount = parseInt(result.rows[0].count);
      
      if (usageCount >= LOGGED_IN_USER_MAX_USES_PER_DAY) {
        return res.status(429).json({ 
          error: `Daily maximum of ${LOGGED_IN_USER_MAX_USES_PER_DAY} uses reached. Please try again tomorrow.` 
        });
      }
      
      console.log(`[INFO] Logged-in user ${userIdentifier} has used ${usageCount}/${LOGGED_IN_USER_MAX_USES_PER_DAY} requests today`);
    } catch (error) {
      console.error(`[ERROR] Failed to check usage for logged-in user: ${error.message}`);
      // Continue with the request if we can't check the database
    }
  } else {
    // For free users
    if (req.session.usageCount >= FREE_USER_MAX_USES_PER_DAY) {
      return res.status(429).json({ 
        error: `Daily maximum of ${FREE_USER_MAX_USES_PER_DAY} uses for free accounts. Please sign up for more uses (${LOGGED_IN_USER_MAX_USES_PER_DAY} per day).` 
      });
    }
    
    console.log(`[INFO] Free user has used ${req.session.usageCount}/${FREE_USER_MAX_USES_PER_DAY} requests today`);
  }

  try {
    const { txtFilename, csvFilename, subtitlesText } = await getTranscriptAndSave(videoId, selectedLanguage, identifier, isLoggedIn);

    // Store the transcription details in the database
    const transcriptFilename = path.parse(txtFilename).name;
    await pool.query(
      'INSERT INTO transcriptions (url, user_identifier, request_datetime, transcript_filename) VALUES ($1, $2, $3, $4)',
      [`https://www.youtube.com/watch?v=${videoId}`, userIdentifier, new Date(), transcriptFilename]
    );

    res.json({
      languageCodes: [{ code: selectedLanguage, name: getLanguageName(selectedLanguage) }],
      savedTranscripts: [{ languageCode: selectedLanguage, txtFilename, csvFilename, subtitlesText }]
    });
  } catch (error) {
    console.error(`[ERROR] GET transcribe endpoint error: ${error.message}`);
    console.error(`[ERROR] Stack trace: ${error.stack}`);
    res.status(500).json({ error: 'An error occurred while fetching the subtitles.' });
  }
});

const getLanguageName = (code) => {
  return languageMap[code] || code;
};

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

// Add a unified download endpoint
app.get('/download', (req, res) => {
  const filename = req.query.file;
  
  if (!filename) {
    return res.status(400).json({ error: 'No filename provided' });
  }
  
  // Basic security check to prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    console.log(`[SECURITY] Blocked suspicious download request for file: ${filename}`);
    return res.status(403).json({ error: 'Invalid filename' });
  }
  
  const filePath = path.join(TRANSCRIPTS_FOLDER, filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.log(`[ERROR] File not found for download: ${filePath}`);
    return res.status(404).json({ error: 'File not found' });
  }
  
  console.log(`[INFO] Downloading file: ${filename}`);
  res.download(filePath, filename);
});

cron.schedule('0 * * * *', () => {
  exec('node deleteOldTranscripts.js', (error, stdout, stderr) => {
    if (error) {
      return;
    }
    if (stderr) {
      return;
    }
  });
});

// Schedule a task to reset session usage counts at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running midnight task to reset session usage counts');
  
  try {
    // Clear old sessions from the database (older than 1 day)
    const result = await pool.query(
      "DELETE FROM \"session\" WHERE expire < NOW()"
    );
    console.log(`[CRON] Cleared ${result.rowCount} expired sessions`);
  } catch (error) {
    console.error(`[CRON] Error clearing expired sessions: ${error.message}`);
  }
  
  console.log('[CRON] Midnight task completed');
});

app.get('/modal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modal.html'));
});

// Add a new endpoint to get the current usage count
app.get('/usage-count', async (req, res) => {
  try {
    console.log(`[DEBUG] Session ID in usage-count: ${req.sessionID}`);
    console.log(`[DEBUG] Session object in usage-count:`, {
      usageCount: req.session.usageCount,
      cookie: req.session.cookie
    });
    
    const auth = getAuth(req);
    const isLoggedIn = !!auth?.userId;
    const persistentId = getPersistentIdentifier(req);
    let userIdentifier = persistentId;

    console.log(`[DEBUG] Using persistent identifier for usage count: ${persistentId}`);

    if (isLoggedIn) {
      try {
        const userId = auth.userId;
        const user = await clerkClient.users.getUser(userId);
        const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
        if (primaryEmail) {
          userIdentifier = primaryEmail.emailAddress;
        }
        
        const result = await pool.query(
          'SELECT COUNT(*) FROM transcriptions WHERE user_identifier = $1 AND request_datetime > NOW() - INTERVAL \'1 day\'',
          [userIdentifier]
        );
        const usageCount = parseInt(result.rows[0].count);
        
        console.log(`[INFO] Logged-in user ${userIdentifier} has used ${usageCount}/${LOGGED_IN_USER_MAX_USES_PER_DAY} requests today`);
        
        res.json({
          isLoggedIn: true,
          usageCount: usageCount,
          maxUsageCount: LOGGED_IN_USER_MAX_USES_PER_DAY,
          remainingUses: LOGGED_IN_USER_MAX_USES_PER_DAY - usageCount
        });
      } catch (error) {
        console.error(`[ERROR] Failed to get usage count for logged-in user: ${error.message}`);
        // Still return a valid JSON response even on error
        res.status(500).json({ 
          error: 'Failed to get usage count for logged-in user',
          isLoggedIn: true,
          usageCount: 0,
          maxUsageCount: LOGGED_IN_USER_MAX_USES_PER_DAY,
          remainingUses: LOGGED_IN_USER_MAX_USES_PER_DAY
        });
      }
    } else {
      // For free users, use the database count instead of session
      try {
        const result = await pool.query(
          'SELECT COUNT(*) FROM transcriptions WHERE user_identifier = $1 AND request_datetime > NOW() - INTERVAL \'1 day\'',
          [userIdentifier]
        );
        const usageCount = parseInt(result.rows[0].count);
        
        // Update the session with the correct count from the database
        req.session.usageCount = usageCount;
        
        console.log(`[INFO] Free user ${userIdentifier} has used ${usageCount}/${FREE_USER_MAX_USES_PER_DAY} requests today (from database)`);
        
        // Force session save to ensure we're returning the most up-to-date count
        await new Promise((resolve) => {
          req.session.save(err => {
            if (err) {
              console.error('[ERROR] Failed to save session in usage-count endpoint:', err);
            }
            resolve();
          });
        });
        
        res.json({
          isLoggedIn: false,
          usageCount: usageCount,
          maxUsageCount: FREE_USER_MAX_USES_PER_DAY,
          remainingUses: FREE_USER_MAX_USES_PER_DAY - usageCount
        });
      } catch (error) {
        console.error(`[ERROR] Failed to get usage count from database: ${error.message}`);
        
        // Fall back to session-based counting if database check fails
        const usageCount = req.session.usageCount || 0;
        
        console.log(`[INFO] Free user has used ${usageCount}/${FREE_USER_MAX_USES_PER_DAY} requests today (from session fallback)`);
        
        res.json({
          isLoggedIn: false,
          usageCount: usageCount,
          maxUsageCount: FREE_USER_MAX_USES_PER_DAY,
          remainingUses: FREE_USER_MAX_USES_PER_DAY - usageCount
        });
      }
    }
  } catch (error) {
    // Catch-all error handler to ensure we always return JSON
    console.error(`[ERROR] Unexpected error in usage-count endpoint: ${error.message}`);
    res.status(500).json({ 
      error: 'An unexpected error occurred',
      isLoggedIn: false,
      usageCount: 0,
      maxUsageCount: FREE_USER_MAX_USES_PER_DAY,
      remainingUses: FREE_USER_MAX_USES_PER_DAY
    });
  }
});

// Add a route to get the CSRF token
app.get('/csrf-token', (req, res) => {
  // Ensure the token exists
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    
    // Force session save to ensure the token is persisted immediately
    req.session.save(err => {
      if (err) {
        console.error('[SECURITY] Error saving session:', err);
        return res.status(500).json({ error: 'Failed to generate security token' });
      }
      console.log('[SECURITY] New CSRF token generated and saved to session');
      res.json({ csrfToken: req.session.csrfToken });
    });
  } else {
    console.log('[SECURITY] Existing CSRF token retrieved from session');
    res.json({ csrfToken: req.session.csrfToken });
  }
});

// Add a debug route to check session status
app.get('/debug-session', (req, res) => {
  const sessionInfo = {
    hasSession: !!req.session,
    sessionID: req.sessionID,
    hasCsrfToken: !!req.session.csrfToken,
    csrfTokenLength: req.session.csrfToken ? req.session.csrfToken.length : 0,
    cookieSettings: {
      secure: req.session.cookie.secure,
      maxAge: req.session.cookie.maxAge,
      sameSite: req.session.cookie.sameSite,
      domain: req.session.cookie.domain || 'not set'
    }
  };
  
  console.log('[DEBUG] Session info:', sessionInfo);
  res.json(sessionInfo);
});

// Add a detailed session debug endpoint
app.get('/debug-session-detailed', (req, res) => {
  console.log('[DEBUG] Detailed session debug endpoint called');
  console.log(`[DEBUG] Session ID: ${req.sessionID}`);
  console.log('[DEBUG] Session data:', {
    usageCount: req.session.usageCount,
    cookie: req.session.cookie
  });
  
  res.json({
    sessionID: req.sessionID,
    usageCount: req.session.usageCount || 0,
    cookie: {
      maxAge: req.session.cookie.maxAge,
      expires: req.session.cookie.expires,
      secure: req.session.cookie.secure,
      httpOnly: req.session.cookie.httpOnly,
      domain: req.session.cookie.domain,
      sameSite: req.session.cookie.sameSite
    }
  });
});

// Add an endpoint to get the usage limits
app.get('/usage-limits', (req, res) => {
  res.json({
    freeUserLimit: FREE_USER_MAX_USES_PER_DAY,
    loggedInUserLimit: LOGGED_IN_USER_MAX_USES_PER_DAY
  });
});

// Add a route to reset usage count (for testing)
app.post('/reset-usage', validateRequest, async (req, res) => {
  try {
    const auth = getAuth(req);
    const isLoggedIn = !!auth?.userId;
    const persistentId = getPersistentIdentifier(req);
    let userIdentifier = persistentId;

    console.log(`[DEBUG] Using persistent identifier for reset usage: ${persistentId}`);

    if (isLoggedIn) {
      try {
        const userId = auth.userId;
        const user = await clerkClient.users.getUser(userId);
        const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
        if (primaryEmail) {
          userIdentifier = primaryEmail.emailAddress;
        }
      } catch (error) {
        // Fallback to using persistent ID as identifier
        console.error(`[ERROR] Failed to get user email: ${error.message}`);
        userIdentifier = persistentId;
      }
    }
    
    // Delete all transcriptions for this user from the last day
    await pool.query(
      'DELETE FROM transcriptions WHERE user_identifier = $1 AND request_datetime > NOW() - INTERVAL \'1 day\'',
      [userIdentifier]
    );
    
    // Also reset the session count for good measure
    req.session.usageCount = 0;
    await new Promise((resolve) => {
      req.session.save(err => {
        if (err) {
          console.error('[ERROR] Failed to save session after resetting usage count:', err);
        }
        resolve();
      });
    });
    
    console.log(`[DEBUG] Usage count reset to 0 for user ${userIdentifier}`);
    res.json({ success: true, message: 'Usage count reset to 0' });
  } catch (error) {
    console.error(`[ERROR] Failed to reset usage count: ${error.message}`);
    res.status(500).json({ error: 'Failed to reset usage count' });
  }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Add route for generating summary
app.post('/generate-summary', validateRequest, async (req, res) => {
  try {
    console.log('[AI] Generate summary request received');
    const { transcript, length, focus } = req.body;
    
    if (!transcript || transcript.trim() === '') {
      console.error('[AI] No transcript provided for summary');
      return res.status(400).json({ error: 'No transcript provided' });
    }
    
    console.log(`[AI] Generating summary with length: ${length}, focus: ${focus || 'main points'}`);
    console.log(`[AI] Transcript length: ${transcript.length} characters`);
    
    const prompt = `Output should be in Markdown format. Summarise this transcript into [${length} words] with a focus on ${focus || 'the main points'}\n\n${transcript}`;
    
    console.log('[AI] Sending request to OpenAI');
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          "role": "user",
          "content": prompt
        }
      ],
      response_format: { type: "text" },
      temperature: 1,
      max_tokens: 2048,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    });

    console.log('[AI] Summary generated successfully');
    res.json({ output: response.choices[0].message.content });
  } catch (error) {
    console.error('[AI] Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Add route for repurposing content
app.post('/generate-repurpose', validateRequest, async (req, res) => {
  try {
    console.log('[AI] Generate repurpose request received');
    const { transcript, purpose, tone } = req.body;
    
    if (!transcript || transcript.trim() === '') {
      console.error('[AI] No transcript provided for repurpose');
      return res.status(400).json({ error: 'No transcript provided' });
    }
    
    let maxLength;
    switch (purpose) {
      case 'tweet':
        maxLength = '180 characters';
        break;
      case 'linkedin':
        maxLength = '2000 characters';
        break;
      case 'blog':
        maxLength = '500 words';
        break;
      default:
        maxLength = '4000 characters';
    }
    
    console.log(`[AI] Repurposing content for: ${purpose}, tone: ${tone}, max length: ${maxLength}`);
    console.log(`[AI] Transcript length: ${transcript.length} characters`);
    
    const prompt = `Output should be in Markdown format. Repurpose this transcript into a ${purpose} (maximum ${maxLength}) using a ${tone} tone of voice:\n\n${transcript}`;
    
    console.log('[AI] Sending request to OpenAI');
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          "role": "user",
          "content": prompt
        }
      ],
      response_format: { type: "text" },
      temperature: 1,
      max_tokens: 2048,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    });

    console.log('[AI] Repurpose content generated successfully');
    res.json({ output: response.choices[0].message.content });
  } catch (error) {
    console.error('[AI] Error repurposing content:', error);
    res.status(500).json({ error: 'Failed to repurpose content' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
