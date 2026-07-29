const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// إعداد CORS الشامل لتفادي أي حظر من المتصفح (CORS Error)
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

// كلمة المرور ودالة الحماية
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "tatooine2026"; 

// Middleware للتأكد من وجود التوكن عند التعديل أو الحذف أو الإضافة
const requireAuth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === "admin-auth-secret-token") {
        next();
    } else {
        res.status(401).json({ error: "غير مصرح لك للقيام بهذه العملية! يرجى تسجيل الدخول أولاً." });
    }
};

// مخطط الشريحة / المستند (Document Schema)
const DocumentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true },
    status: { type: String, default: 'مقبول' },
    urgent: { type: Boolean, default: false },
    fileUrl: { type: String, default: '' },
    date: { type: Date, default: Date.now }
});

const Document = mongoose.model('Document', DocumentSchema);

// --- المسارات (Routes) ---

// 1. مسار تسجيل الدخول للأدمن
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: "admin-auth-secret-token" });
    }
    res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
});

// 2. جلب جميع المستندات (متاح للجميع)
app.get('/api/documents', async (req, res) => {
    try {
        const documents = await Document.find().sort({ date: -1 });
        res.json(documents);
    } catch (err) {
        res.status(500).json({ error: "خطأ في جلب البيانات من السيرفر" });
    }
});

// 3. إضافة مستند جديد (محمي)
app.post('/api/documents', requireAuth, async (req, res) => {
    try {
        const newDoc = new Document(req.body);
        const savedDoc = await newDoc.save();
        res.status(201).json(savedDoc);
    } catch (err) {
        res.status(400).json({ error: "فشل في إضافة المستند" });
    }
});

// 4. تعديل مستند (محمي)
app.put('/api/documents/:id', requireAuth, async (req, res) => {
    try {
        const updatedDoc = await Document.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedDoc);
    } catch (err) {
        res.status(400).json({ error: "فشل في تعديل المستند" });
    }
});

// 5. حذف مستند (محمي)
app.delete('/api/documents/:id', requireAuth, async (req, res) => {
    try {
        await Document.findByIdAndDelete(req.params.id);
        res.json({ message: "تم حذف المستند بنجاح" });
    } catch (err) {
        res.status(400).json({ error: "فشل في حذف المستند" });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});