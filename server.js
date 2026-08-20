const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Brevo = require('@getbrevo/brevo');
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

// 1. مخطط المستندات (Documents Schema) - مضاف إليه بيانات الملف الحلال لـ Base64
const DocumentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    department: { type: String, required: true },
    category: { type: String },
    status: { type: String, default: 'مقبول' },
    file_url: { type: String, default: '' },
    file_data: { type: String, default: '' }, // تخزين محتوى الملف Base64
    file_name: { type: String, default: '' }, // اسم الملف الأصلي
    file_type: { type: String, default: '' }, // نوع الملف (MimeType)
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

// ✉️ إعداد خدمة إرسال البريد الإلكتروني عبر Brevo API (تم ضبطها بالطريقة الصحيحة المتوافقة مع الإصدار الحديث)
const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

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

// مسار لجلب وعرض الملف المخزن كـ Base64
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
            // قراءة الملف المؤقت وتحويله إلى Base64 لتجنب أي مشاكل خارجية
            const fileBuffer = fs.readFileSync(req.file.path);
            docData.file_data = fileBuffer.toString('base64');
            docData.file_name = req.file.originalname;
            docData.file_type = req.file.mimetype;
            docData.file_url = `/api/documents/file/TEMP_ID`; // سيتم تحديثه بعد الحفظ أو استخدامه

            // حذف الملف المؤقت من السيرفر المحلي
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }

        const newDoc = new Document(docData);
        const saved = await newDoc.save();

        // تحديث رابط الـ file_url ليشير إلى معرف المستند الحقيقي في قاعدة البيانات
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

app.post('/api/actions', async (req, res) => {
    try {
        const newAction = new Action(req.body);
        const saved = await newAction.save();

        // إرسال الإيميل تلقائياً عبر Brevo API عند توفر بريد إلكتروني
        if (req.body.email) {
            const sendSmtpEmail = new Brevo.SendSmtpEmail();
            sendSmtpEmail.subject = `تنبيه إجراء مزمع: ${req.body.title || req.body.action_title || 'بدون عنوان'}`;
            sendSmtpEmail.htmlContent = `
                <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; background: #f8fafc; border-radius: 8px;">
                    <h2 style="color: #1e293b;">⏰ تذكير بإجراء مزمع جديد</h2>
                    <p><strong>عنوان الإجراء:</strong> ${req.body.title || req.body.action_title}</p>
                    <p><strong>الجهة / القسم:</strong> ${req.body.department}</p>
                    <p><strong>وقت التذكير المحدد:</strong> ${req.body.remind_date}</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                    <p style="color: #64748b; font-size: 0.85rem;">تم إرسال هذا التنبيه تلقائياً عبر لوحة التحكم.</p>
                </div>
            `;
            sendSmtpEmail.sender = { name: "Tataouine Platform", email: process.env.EMAIL_USER || "no-reply@tataouine.com" };
            sendSmtpEmail.to = [{ email: req.body.email }];

            apiInstance.sendTransacEmail(sendSmtpEmail).then((data) => {
                console.log("✅ تم إرسال البريد بنجاح عبر Brevo API:", data);
            }).catch((error) => {
                console.error("❌ خطأ في إرسال البريد عبر Brevo:", error);
            });
        }

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