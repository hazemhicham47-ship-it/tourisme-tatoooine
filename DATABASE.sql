-- مسح الجدول القديم إن وجد
DROP TABLE IF EXISTS documents CASCADE;

-- إعادة إنشاء الجدول من جديد
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    department VARCHAR(100) NOT NULL,
    file_url TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'قيد الدراسة',
    due_date DATE NOT NULL,
    alert_date DATE GENERATED ALWAYS AS (due_date - INTERVAL '5 days') STORED
);

-- إدراج البيانات التجريبية
INSERT INTO documents (title, department, file_url, status, due_date) 
VALUES 
('مطلب الموافقة المبدئية', 'ديوان السياحة', 'https://example.com/file1.pdf', 'منجز', '2026-08-10'),
('كراس شروط السلامة', 'الحماية المدنية', 'https://example.com/file2.pdf', 'قيد الدراسة', '2026-08-01'),
('التقرير المالي والادبي', 'الجمعية', 'https://example.com/file3.pdf', 'مطلوب عاجلاً', '2026-08-02');