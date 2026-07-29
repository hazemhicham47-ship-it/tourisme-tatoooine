const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
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

// إعداد مرسل البريد الإلكتروني عبر SMTP الصريح على المنفذ 587 لتجاوز قيود IPv6 على Render
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    },
    tls: {
        rejectUnauthorized: false
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
    remind_date: { type: String },
    email: { type: String },
    phone: { type: String },
    sent: { type: Boolean, default: false },
    date: { type: Date, default: Date.now }
});
const Action = mongoose.model('Action', ActionSchema);

// --- نظام التنبيهات المجدولة بمقارنة الأوقات الرقمية الدقيقة (Africa/Tunis) ---
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        const localTimeStr = now.toLocaleString('en-US', { timeZone: 'Africa/Tunis' });
        const currentDate = new Date(localTimeStr);

        console.log(`⏰ [فحص دوري] الوقت المحلي للسيرفر: ${currentDate.toISOString().slice(0, 16).replace('T', ' ')}`);

        const unSentActions = await Action.find({ sent: { $ne: true } });
        let pendingCount = 0;

        for (let action of unSentActions) {
            if (!action.remind_date) continue;

            const remindDateObj = new Date(action.remind_date.replace(' ', 'T'));

            if (remindDateObj.getTime() <= currentDate.getTime()) {
                pendingCount++;
                console.log(`🚀 بدء معالجة الإجراء المستحق: ${action.title || action.action_title} (المحدد: ${action.remind_date})`);

                if (action.email) {
                    const emailsList = action.email.split(',').map(e => e.trim());
                    let allSentSuccessfully = true;

                    for (let recipientEmail of emailsList) {
                        try {
                            const mailOptions = {
                                from: `"مشروع تطاوين السياحي" <${process.env.EMAIL_USER}>`,
                                to: recipientEmail,
                                subject: `⏰ تذكير بإجراء: ${action.title || action.action_title}`,
                                text: `مرحباً،\n\nهذا تذكير بموعد الإجراء لقسم: ${action.department}\nالعنوان: ${action.title || action.action_title}\nالموعد المحدد: ${action.remind_date}\n\nنظام الإدارة - مشروع تطاوين السياحي.`
                            };

                            await transporter.sendMail(mailOptions);
                            console.log(`📧 تم إرسال الإيميل بنجاح عبر SMTP إلى: ${recipientEmail}`);
                        } catch (mailErr) {
                            console.error(`❌ خطأ دقيق في إرسال البريد إلى ${recipientEmail}:`, mailErr.message);
                            allSentSuccessfully = false;
                        }
                    }

                    if (allSentSuccessfully) {
                        await Action.findByIdAndUpdate(action._id, { sent: true });
                        console.log(`✅ تم تحديث حالة الإجراء بنجاح إلى (sent: true) وتم قفله نهائياً.`);
                    } else {
                        console.log(`⚠️ لم يتم تغيير حالة الإجراء نظراً لفشل إرسال بعض الإيميلات.`);
                    }
                }
            }
        }

        console.log(`🔍 عدد الإجراءات المستحقة المكتشفة الفعلي: ${pendingCount}`);

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
        let formattedRemindDate = req.body.remind_date;
        
        if (formattedRemindDate) {
            formattedRemindDate = formattedRemindDate.replace(' ', 'T').substring(0, 16);
        }

        console.log(`📥 تم استقبال إجراء جديد بوقت تذكير: ${formattedRemindDate}`);

        const newAction = new Action({ 
            ...req.body, 
            remind_date: formattedRemindDate,
            sent: false 
        });
        
        const saved = await newAction.save();
        res.status(201).json(saved);
    } catch (err) {
        console.error('❌ فشل في حفظ الإجراء:', err);
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
