const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ متصل بقاعدة بيانات MongoDB بنجاح'))
    .catch(err => console.error('❌ خطأ في الاتصال بـ MongoDB:', err));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "tatooine2026"; 

// إعداد خدمة الإرسال عبر البريد الإلكتروني (Nodemailer)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// مخططات البيانات
const DocumentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    department: { type: String, required: true },
    category: { type: String },
    status: { type: String, default: 'مقبول' },
    file_url: { type: String, default: '' },
    due_date: { type: String },
    date: { type: Date, default: Date.now }
});
const Document = mongoose.model('Document', DocumentSchema);

const ActionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    action_title: { type: String },
    department: { type: String, required: true },
    remind_date: { type: String }, // صيغة: YYYY-MM-DDTHH:mm
    email: { type: String },
    phone: { type: String },
    sent: { type: Boolean, default: false },
    date: { type: Date, default: Date.now }
});
const Action = mongoose.model('Action', ActionSchema);

// --- نظام التنبيهات المجدولة (مع طباعة الفحص الدوري في الـ Logs) ---
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const currentFormatted = `${year}-${month}-${day}T${hours}:${minutes}`;

        // طباعة الوقت الحالي للسيرفر للتأكد من أن الـ Cron يعمل كل دقيقة
        console.log(`⏰ [فحص دوري] وقت السيرفر: ${currentFormatted}`);

        // البحث عن الإجراءات المستحقة
        const pendingActions = await Action.find({ 
            remind_date: { $lte: currentFormatted }, 
            sent: { $ne: true }
        });

        console.log(`🔍 عدد الإجراءات المستحقة المكتشفة: ${pendingActions.length}`);

        for (let action of pendingActions) {
            console.log(`🚀 بدء معالجة الإجراء: ${action.title || action.action_title} للإيميلات: ${action.email}`);

            if (action.email) {
                const emailsList = action.email.split(',').map(e => e.trim());

                for (let recipientEmail of emailsList) {
                    try {
                        await transporter.sendMail({
                            from: process.env.EMAIL_USER,
                            to: recipientEmail,
                            subject: `⏰ تذكير بإجراء: ${action.title || action.action_title}`,
                            text: `مرحباً،\n\nهذا تذكير بموعد الإجراء لقسم: ${action.department}\nالعنوان: ${action.title || action.action_title}\nالموعد المحدد: ${action.remind_date}\n\nمشروع تطاوين السياحي.`
                        });
                        console.log(`📧 تم إرسال الإيميل بنجاح إلى: ${recipientEmail}`);
                    } catch (mailErr) {
                        console.error(`❌ خطأ في إرسال الإيميل إلى ${recipientEmail}:`, mailErr);
                    }
                }

                // تحديث حالة الإجراء ليصبح مُرسلاً ولا يتكرر
                action.sent = true;
                await action.save();
                console.log(`✅ تم تحديث حالة الإجراء بنجاح إلى (sent: true)`);
            }
        }
    } catch (err) {
        console.error('❌ خطأ في نظام التنبيهات المجدولة:', err);
    }
});

// --- المسارات الأساسية ---
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: "admin-auth-secret-token" });
    }
    res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
});

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

app.delete('/api/documents/:id', async (req, res) => {
    try {
        await Document.findByIdAndDelete(req.params.id);
        res.json({ message: "تم الحذف بنجاح" });
    } catch (err) {
        res.status(400).json({ error: "فشل في الحذف" });
    }
});

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
        const newAction = new Action({ ...req.body, sent: false });
        const saved = await newAction.save();
        res.status(201).json(saved);
    } catch (err) {
        res.status(400).json({ error: "فشل في إضافة الإجراء" });
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});
