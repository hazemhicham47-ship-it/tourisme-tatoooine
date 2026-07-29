// server.js المحدث للعمل مع MongoDB
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config(); // تحميل متغيرات البيئة

const app = express();
const PORT = process.env.PORT || 3000;

// 1. الإعدادات (Middleware)
app.use(cors());
app.use(express.json()); // للسماح بقراءة بيانات JSON في الطلبات

// 2. الاتصال بقاعدة البيانات MongoDB
// سنحصل على الرابط من متغيرات البيئة للحماية
const MONGODB_URI = process.env.MONGODB_URI; 

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ متصل بقاعدة بيانات MongoDB بنجاح'))
  .catch(err => console.error('❌ خطأ في الاتصال بـ MongoDB:', err));

// 3. تعريف "الهياكل" (Schemas & Models) للبيانات
// هذا يحدد شكل البيانات في قاعدة البيانات

// هيكل الوثائق
const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  status: { type: String, default: 'قيد الانتظار' }, // قيد الانتظار، مقبول، مرفوض
  date: { type: Date, default: Date.now }
});
const Document = mongoose.model('Document', documentSchema);

// هيكل الإجراءات
const actionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  type: { type: String, default: 'info' }, // info, warning, success
  date: { type: Date, default: Date.now }
});
const Action = mongoose.model('Action', actionSchema);


// 4. مسارات الـ API (Routes) - عمليات CRUD كاملة

// --- أ. مسارات الوثائق (Documents) ---

// 1. جلب جميع الوثائق (READ)
app.get('/api/documents', async (req, res) => {
  try {
    const documents = await Document.find().sort({ date: -1 }); // جلبها مرتبة بالأحدث
    res.json(documents);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الوثائق', error: err.message });
  }
});

// 2. إضافة وثيقة جديدة (CREATE)
app.post('/api/documents', async (req, res) => {
  const doc = new Document({
    title: req.body.title,
    description: req.body.description,
    status: req.body.status
  });

  try {
    const newDoc = await doc.save();
    res.status(201).json(newDoc);
  } catch (err) {
    res.status(400).json({ message: 'خطأ في إضافة الوثيقة', error: err.message });
  }
});

// 3. تعديل وثيقة موجودة (UPDATE)
app.put('/api/documents/:id', async (req, res) => {
  try {
    const updatedDoc = await Document.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true } // لإعادة الوثيقة بعد التعديل
    );
    if (!updatedDoc) return res.status(404).json({ message: 'الوثيقة غير موجودة' });
    res.json(updatedDoc);
  } catch (err) {
    res.status(400).json({ message: 'خطأ في تعديل الوثيقة', error: err.message });
  }
});

// 4. حذف وثيقة (DELETE)
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const deletedDoc = await Document.findByIdAndDelete(req.params.id);
    if (!deletedDoc) return res.status(404).json({ message: 'الوثيقة غير موجودة' });
    res.json({ message: 'تم حذف الوثيقة بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في حذف الوثيقة', error: err.message });
  }
});


// --- ب. مسارات الإجراءات (Actions) ---

// 1. جلب جميع الإجراءات (READ)
app.get('/api/actions', async (req, res) => {
  try {
    const actions = await Action.find().sort({ date: -1 });
    res.json(actions);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في جلب الإجراءات', error: err.message });
  }
});

// 2. إضافة إجراء جديد (CREATE)
app.post('/api/actions', async (req, res) => {
  const action = new Action({
    text: req.body.text,
    type: req.body.type
  });

  try {
    const newAction = await action.save();
    res.status(201).json(newAction);
  } catch (err) {
    res.status(400).json({ message: 'خطأ في إضافة الإجراء', error: err.message });
  }
});

// (يمكنك إضافة مسارات التعديل والحذف للإجراءات هنا بنفس الطريقة إذا احتجتها لاحقاً)


// 5. تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});