require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Sequelize, DataTypes } = require('sequelize');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Database Setup (SQLite)
// On Render, we must use /tmp for a writable filesystem in the free tier
const dbPath = fs.existsSync('/tmp') 
  ? '/tmp/database.sqlite' 
  : path.join(__dirname, 'database.sqlite');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false
});

// Model Definition
const Datasheet = sequelize.define('Datasheet', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

// Sync Database
sequelize.sync()
  .then(() => console.log('Database synced successfully'))
  .catch(err => console.error('Error syncing database:', err));

// Temp storage for Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = fs.existsSync('/tmp') ? '/tmp' : path.join(__dirname, 'temp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// API Endpoints

// Upload endpoint
app.post('/api/datasheets', upload.single('file'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !req.file) {
      return res.status(400).json({ error: 'Missing name or file' });
    }

    // Upload the temp file to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'datasheets',
      resource_type: 'auto'
    });

    // Create database entry
    const datasheet = await Datasheet.create({
      name,
      url: result.secure_url,
      filename: result.public_id
    });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json({ success: true, datasheet });
  } catch (error) {
    console.error('Upload error:', error);
    // Cleanup on error if file exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List endpoint
app.get('/api/datasheets', async (req, res) => {
  try {
    const datasheets = await Datasheet.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(datasheets);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the frontend (workspace root)
app.use(express.static(path.join(__dirname, '..')));

// Default route to serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'mpmc_frontend.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
