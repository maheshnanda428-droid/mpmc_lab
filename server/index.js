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
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'database.sqlite'),
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

// Cloudinary Storage Configuration for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'datasheets',
    resource_type: 'image',
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const cleanName = file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
      return `${uniqueSuffix}-${cleanName}`; // No .pdf here, Cloudinary adds it via 'format' or 'image' type
    },
    format: 'pdf', // Explicitly set format to pdf for the 'image' resource type
  },
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

    // req.file.path will be the Cloudinary URL
    const url = req.file.path;
    const datasheet = await Datasheet.create({
      name,
      url,
      filename: req.file.filename // Cloudinary's public_id or filename
    });

    res.json({ success: true, datasheet });
  } catch (error) {
    console.error('Upload error:', error);
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
