const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

// إعداد CORS الشامل
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 📁 إعداد Multer للتخزين المؤقت المحلي مؤقتاً قبل تحويله لـ Base64
const upload = multer({ dest: 'uploads/' });

// الاتصال بقاعدة البيانات MongoDB
const uri = process.env.MONGODB_URI;

mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
}).then(() => {
    console.log('✅ متصل بقاعدة بيانات MongoDB بنجاح');
}).catch(err => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "tatooine2026"; 

// 1. مخطط المستندات (Documents Schema)
const DocumentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    department: { type: String, required: true },
    category: { type: String },
    status: { type: String, default: 'مقبول' },
    file_url: { type: String, default: '' },
    file_data: { type: String, default: '' },
    file_name: { type: String, default: '' },
    file_type: { type: String, default: '' },
    due_date: { type: String },
    date: { type: Date, default: Date.now }
});
const Document = mongoose.model('Document', DocumentSchema);

// 2. مخطط الإجراءات المزمعة والتذكيرات (Actions Schema) - مضاف إليه علامة حالة الإرسال `email_sent`
const ActionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    action_title: { type: String },
    department: { type: String, required: true },
    remind_date: { type: String }, // صيغة التاريخ المتوقعة من الواجهة مثال: "2026-08-20T11:26"
    email: { type: String },
    phone: { type: String },
    email_sent: { type: Boolean, default: false }, // لتتبع هل تم إرسال الإيميل أم لا
    date: { type: Date, default: Date.now }
});
const Action = mongoose.model('Action', ActionSchema);

// ⏰ نظام الجدولة (Cron Job) المعدل ليتوافق مع التوقيت المحلي لتونس وتجنب فارق السيرفر (UTC)
cron.schedule('* * * * *', async () => {
    try {
        const now = Date.now(); // الوقت الحالي بالمللي ثانية
        const pendingActions = await Action.find({ email: { $exists: true, $ne: "" }, email_sent: false });

        for (const action of pendingActions) {
            if (!action.remind_date) continue;

            // ضبط التوقيت المحلي بإضافة فارق تونس (+01:00) لتحويله بشكل صحيح على سيرفرات UTC
            const localDateStr = action.remind_date.replace(' ', 'T') + '+01:00';
            const remindTime = new Date(localDateStr).getTime();
            
            // طباعة سجلات الفحص لمعرفة حالة الوقت المتبقي للإرسال
            console.log(`⏳ فحص الإجراء ${action._id} | وقت التذكير المحلي: ${action.remind_date} | باقي للإرسال: ${Math.floor((remindTime - now) / 1000)} ثانية`);

            if (isNaN(remindTime)) continue;

            // إذا حان الوقت أو تجاوزه
            if (now >= remindTime) {
                const emailData = {
                    sender: { name: "Tataouine Platform", email: process.env.EMAIL_USER || "no-reply@tataouine.com" },
                    to: [{ email: action.email }],
                    subject: `تنبيه إجراء مزمع: ${action.title || action.action_title || 'بدون عنوان'}`,
                    htmlContent: `
                        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; background: #f8fafc; border-radius: 8px;">
                            <h2 style="color: #1e293b;">⏰ حان موعد التذكير بالإجراء المزمع</h2>
                            <p><strong>عنوان الإجراء:</strong> ${action.title || action.action_title}</p>
                            <p><strong>الجهة / القسم:</strong> ${action.department}</p>
                            <p><strong>وقت التذكير المحدد:</strong> ${action.remind_date}</p>
                            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                            <p style="color: #64748b; font-size: 0.85rem;">تم إرسال هذا التنبيه تلقائياً في موعده عبر نظام الجدولة.</p>
                        </div>
                    `
                };

                try {
                    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'api-key': process.env.BREVO_API_KEY,
                            'content-type': 'application/json'
                        },
                        body: JSON.stringify(emailData)
                    });
                    const data = await response.json();
                    console.log(`✅ تم إرسال تذكير الإجراء (${action._id}) في موعده بنجاح:`, data);

                    // تحديث الحالة حتى لا يتم إرساله مرة أخرى
                    action.email_sent = true;
                    await action.save();
                } catch (emailErr) {
                    console.error(`❌ خطأ في إرسال البريد المجدول للإجراء (${action._id}):`, emailErr);
                }
            }
        }
    } catch (err) {
        console.error("❌ خطأ في فحص جدول التذكيرات:", err);
    }
});

// --- المسارات (Routes) ---

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
        console.error("❌ خطأ في جلب المستندات:", err);
        res.status(500).json({ error: "خطأ في جلب المستندات" });
    }
});

app.get('/api/documents/file/:id', async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!doc || !doc.file_data) {
            return res.status(404).send("الملف غير موجود");
        }

        const buffer = Buffer.from(doc.file_data, 'base64');
        res.setHeader('Content-Type', doc.file_type || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${doc.file_name || 'document'}"`);
        res.send(buffer);
    } catch (err) {
        console.error("❌ خطأ في عرض الملف:", err);
        res.status(500).send("خطأ في عرض الملف");
    }
});

app.post('/api/documents', upload.single('file'), async (req, res) => {
    try {
        const docData = { ...req.body };
        
        if (req.file) {
            const fileBuffer = fs.readFileSync(req.file.path);
            docData.file_data = fileBuffer.toString('base64');
            docData.file_name = req.file.originalname;
            docData.file_type = req.file.mimetype;
            docData.file_url = `/api/documents/file/TEMP_ID`;

            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }

        const newDoc = new Document(docData);
        const saved = await newDoc.save();

        if (req.file) {
            saved.file_url = `/api/documents/file/${saved._id}`;
            await saved.save();
        }

        res.status(201).json(saved);
    } catch (err) {
        console.error("❌ تفاصيل خطأ رفع المستند:", err);
        res.status(400).json({ error: "فشل في إضافة المستند", details: err.message });
    }
});

app.put('/api/documents/:id', upload.single('file'), async (req, res) => {
    try {
        const updateData = { ...req.body };
        
        if (req.file) {
            const fileBuffer = fs.readFileSync(req.file.path);
            updateData.file_data = fileBuffer.toString('base64');
            updateData.file_name = req.file.originalname;
            updateData.file_type = req.file.mimetype;
            updateData.file_url = `/api/documents/file/${req.params.id}`;

            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }

        const updated = await Document.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updated);
    } catch (err) {
        console.error("❌ تفاصيل خطأ تعديل المستند:", err);
        res.status(400).json({ error: "فشل في تعديل المستند", details: err.message });
    }
});

app.delete('/api/documents/:id', async (req, res) => {
    try {
        await Document.findByIdAndDelete(req.params.id);
        res.json({ message: "تم الحذف بنجاح" });
    } catch (err) {
        console.error("❌ خطأ في الحذف:", err);
        res.status(400).json({ error: "فشل في الحذف" });
    }
});

app.get('/api/actions', async (req, res) => {
    try {
        const actions = await Action.find().sort({ date: -1 });
        res.json(actions);
    } catch (err) {
        console.error("❌ خطأ في جلب الإجراءات:", err);
        res.status(500).json({ error: "خطأ في جلب الإجراءات" });
    }
});

// الحفظ فقط دون إرسال فوري
app.post('/api/actions', async (req, res) => {
    try {
        const actionData = { ...req.body, email_sent: false };
        const newAction = new Action(actionData);
        const saved = await newAction.save();

        console.log("✅ تم حفظ الإجراء وجدولته للتذكير في الوقت المحدد:", saved.remind_date);
        res.status(201).json(saved);
    } catch (err) {
        console.error("❌ خطأ في إضافة الإجراء:", err);
        res.status(400).json({ error: "فشل في إضافة الإجراء", details: err.message });
    }
});

app.put('/api/actions/:id', async (req, res) => {
    try {
        const updated = await Action.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) {
        console.error("❌ خطأ في تعديل الإجراء:", err);
        res.status(400).json({ error: "فشل في تعديل الإجراء" });
    }
});

app.delete('/api/actions/:id', async (req, res) => {
    try {
        await Action.findByIdAndDelete(req.params.id);
        res.json({ message: "تم حذف الإجراء بنجاح" });
    } catch (err) {
        console.error("❌ خطأ في حذف الإجراء:", err);
        res.status(400).json({ error: "فشل في حذف الإجراء" });
    }
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});