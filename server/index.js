require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

    const fileName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const fileBuffer = fs.readFileSync(req.file.path);

    // 1. Upload File to Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('datasheets')
      .upload(fileName, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (storageError) {
      return res.status(500).json({ error: `Storage failed: ${storageError.message}` });
    }

    // 2. Get Public URL
    const { data: publicData } = supabase.storage
      .from('datasheets')
      .getPublicUrl(fileName);

    // 3. Save to Permanent Database Table
    const { data: dbData, error: dbError } = await supabase
      .from('datasheets')
      .insert([
        { name, url: publicData.publicUrl, filename: fileName }
      ]);

    if (dbError) {
      return res.status(500).json({ error: `Database failed: ${dbError.message}` });
    }

    // Clean up temp file
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.json({ success: true });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

// List endpoint
app.get('/api/datasheets', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('datasheets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: `Fetch failed: ${error.message}` });
    }

    res.json(data);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the frontend
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'mpmc_frontend.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
