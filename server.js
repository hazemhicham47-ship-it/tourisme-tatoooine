const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// إعداد CORS الشامل
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// الاتصال بقاعدة البيانات MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ متصل بقاعدة بيانات MongoDB بنجاح'))
    .catch(err => console.error('❌ خطأ في الاتصال بـ MongoDB:', err));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "tatooine2026"; 

// 1. مخطط المستندات (Documents Schema)
const DocumentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    department: { type: String, required: true }, // تم تعديلها لتوافق الواجهة
    category: { type: String },
    status: { type: String, default: 'مقبول' },
    file_url: { type: String, default: '' },
    due_date: { type: String },
    date: { type: Date, default: Date.now }
});
const Document = mongoose.model('Document', DocumentSchema);

// 2. مخطط الإجراءات المزمعة والتذكيرات (Actions Schema)
const ActionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    action_title: { type: String },
    department: { type: String, required: true },
    remind_date: { type: String },
    email: { type: String },
    phone: { type: String },
    date: { type: Date, default: Date.now }
});
const Action = mongoose.model('Action', ActionSchema);

// --- المسارات (Routes) ---

// مسار تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: "admin-auth-secret-token" });
    }
    res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
});

// --- مسارات المستندات ---
app.get('/api/documents', async (req, res) => {
    try {
        const docs = await Document.find().sort({ date: -1 });
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: "خطأ في جلب المستندات" });
    }
});

app.post('/api/documents', async (req, res) => {
    try {
        const newDoc = new Document(req.body);
        const saved = await newDoc.save();
        res.status(201).json(saved);
    } catch (err) {
        res.status(400).json({ error: "فشل في إضافة المستند" });
    }
});

app.put('/api/documents/:id', async (req, res) => {
    try {
        const updated = await Document.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: "فشل في تعديل المستند" });
    }
});

app.delete('/api/documents/:id', async (req, res) => {
    try {
        await Document.findByIdAndDelete(req.params.id);
        res.json({ message: "تم الحذف بنجاح" });
    } catch (err) {
        res.status(400).json({ error: "فشل في الحذف" });
    }
});

// --- مسارات الإجراءات المزمعة والتذكيرات ---
app.get('/api/actions', async (req, res) => {
    try {
        const actions = await Action.find().sort({ date: -1 });
        res.json(actions);
    } catch (err) {
        res.status(500).json({ error: "خطأ في جلب الإجراءات" });
    }
});

app.post('/api/actions', async (req, res) => {
    try {
        const newAction = new Action(req.body);
        const saved = await newAction.save();
        res.status(201).json(saved);
    } catch (err) {
        res.status(400).json({ error: "فشل في إضافة الإجراء" });
    }
});

app.put('/api/actions/:id', async (projectReq, res) => {
    try {
        const updated = await Action.findByIdAndUpdate(projectReq.params.id, projectReq.body, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: "فشل في تعديل الإجراء" });
    }
});

app.delete('/api/actions/:id', async (req, res) => {
    try {
        await Action.findByIdAndDelete(req.params.id);
        res.json({ message: "تم حذف الإجراء بنجاح" });
    } catch (err) {
        res.status(400).json({ error: "فشل في حذف الإجراء" });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});
