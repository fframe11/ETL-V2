-- Mock source database for the SDOQAP /ingest/rdbms integration test.
-- 20 rows: 14 normal, 2 with NULLs, 1 exact duplicate business key, 3 out-of-range.
-- row_id is the source table's surrogate primary key; the business key (student_id) is
-- deliberately NOT unique so the duplicate row can exist.
CREATE TABLE student_scores (
    row_id       SERIAL PRIMARY KEY,
    student_id   VARCHAR(10),
    name         VARCHAR(100),
    course       VARCHAR(50),
    semester     VARCHAR(10),
    score        NUMERIC(5,1),
    study_hours  NUMERIC(5,1)
);

INSERT INTO student_scores (student_id, name, course, semester, score, study_hours) VALUES
-- 14 normal rows
('S001', 'Somchai Jaidee',    'Data Structures',   '2025-1', 85.5, 12.0),
('S002', 'Malee Srisuk',      'Databases',         '2025-1', 92.0, 15.5),
('S003', 'Anan Thongdee',     'Algorithms',        '2025-1', 78.0,  9.0),
('S004', 'Pimchanok Rattana', 'Data Structures',   '2025-2', 66.5,  7.5),
('S005', 'Kittipong Suwan',   'Operating Systems', '2025-2', 71.0, 10.0),
('S006', 'Nattaya Phromma',   'Databases',         '2025-2', 88.0, 14.0),
('S007', 'Wichai Boonmee',    'Networks',          '2025-1', 59.0,  5.0),
('S008', 'Suda Kaewmanee',    'Algorithms',        '2025-2', 95.5, 18.0),
('S009', 'Preecha Chaiyo',    'Networks',          '2025-2', 73.5,  8.5),
('S010', 'Orawan Sukjai',     'Operating Systems', '2025-1', 81.0, 11.0),
('S011', 'Tanawat Meesuk',    'Data Structures',   '2025-1', 90.0, 16.0),
('S012', 'Jiraporn Daeng',    'Databases',         '2025-1', 64.0,  6.0),
('S013', 'Surachai Lertwit',  'Algorithms',        '2025-1', 77.5, 10.5),
('S014', 'Kanokwan Phan',     'Networks',          '2025-1', 69.0,  7.0),
-- 2 rows with NULLs
('S015', 'Piyapong Intha',    'Databases',         '2025-2', NULL, 9.0),
('S016', NULL,                'Algorithms',        '2025-2', 74.0, NULL),
-- 1 exact duplicate of S003 (same business key and values)
('S003', 'Anan Thongdee',     'Algorithms',        '2025-1', 78.0,  9.0),
-- 3 out-of-range rows (score must be 0-100, study_hours must be 0-168)
('S018', 'Rungrote Saeng',    'Data Structures',   '2025-2', 150.0, 12.0),
('S019', 'Alisa Phongsri',    'Networks',          '2025-1',  -5.0,  8.0),
('S020', 'Chaiwat Noi',       'Databases',         '2025-2',  80.0, 999.0);
