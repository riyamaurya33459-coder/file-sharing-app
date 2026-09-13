const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });


// ✅ POST /upload - Handle multiple file uploads
router.post('/upload', upload.array('files', 10), async (req, res) => {
  try {
    const { visibility, accessCode, uploadedBy } = req.body;
    const uploadedFiles = [];

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    for (const file of req.files) {
      const fileDoc = new File({
        filename: file.originalname,
        filePath: file.filename,
        uploadedBy,
        visibility,
        password: visibility === 'private' ? accessCode : null,
        code: visibility === 'private' ? uuidv4().slice(0, 6) : null,
        mimetype: file.mimetype,
      });

      await fileDoc.save();
      uploadedFiles.push(fileDoc);
    }

    res.status(201).json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});


// ✅ GET /user/:userId - Get all files uploaded by user
router.get('/user/:userId', async (req, res) => {
  try {
    const files = await File.find({ uploadedBy: req.params.userId }).sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user files' });
  }
});


// ✅ PUT /:id - Update file info (visibility, access code)
router.put('/:id', async (req, res) => {
  try {
    const { visibility, accessCode } = req.body;

    const updated = await File.findByIdAndUpdate(
      req.params.id,
      {
        visibility,
        password: visibility === 'private' ? accessCode : null,
        code: visibility === 'private' ? uuidv4().slice(0, 6) : null,
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: 'File not found' });

    res.json({ message: 'File updated', file: updated });
  } catch (err) {
    res.status(500).json({ message: 'Update failed', error: err.message });
  }
});


// ✅ DELETE /:id - Delete file from DB and disk
router.delete('/:id', async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });

    // Delete from disk
    const filePath = path.join(__dirname, '..', 'uploads', file.filePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await file.deleteOne();

    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed', error: err.message });
  }
});

// GET all public files
router.get('/public', async (req, res) => {
  try {
    const files = await File.find({ visibility: 'public' }).populate('uploadedBy', 'name email').sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch public files' });
  }
});

router.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.filename);
  
  // Check if file exists
  if (fs.existsSync(filePath)) {
    res.download(filePath); // this sets headers for force download
  } else {
    res.status(404).json({ message: 'File not found' });
  }
});

router.get('/private/:code', async (req, res) => {
  const file = await File.findOne({ code: req.params.code, visibility: 'private' });
  if (!file) return res.status(404).json({ message: 'Invalid code or file not found' });
  res.json(file);
});

router.post('/verify', async (req, res) => {
  const { code, password } = req.body;
  const file = await File.findOne({ code, visibility: 'private' });

  if (!file) return res.status(404).json({ message: 'File not found' });
  if (file.password !== password) return res.status(401).json({ message: 'Incorrect password' });

  res.json({ success: true });
});


module.exports = router;
