# Product Requirements Document (PRD)
## ระบบ Personal Finance Dashboard — "WealthLens"

**Version:** 1.0.0  
**Last Updated:** 2026-05-06  
**Author:** Tom  
**Status:** 🟡 In Planning

---

## 1. Vision & Problem Statement

### The Problem
ปัจจุบัน Tom บันทึกข้อมูลการเงินส่วนตัวไว้ใน Google Sheets แยกตามปี (2023–2026) โดยมีโครงสร้างที่ซับซ้อนและต้องอัปเดตด้วยตัวเองทุกเดือน ซึ่งทำให้เกิดปัญหาหลักสามประการ:

1. **Fragmented Data** — ข้อมูลกระจายอยู่หลายไฟล์ ไม่มี single source of truth
2. **No Real-time Insight** — ต้องเปิดหลาย sheet เพื่อเปรียบเทียบ ไม่เห็น trend ได้ทันที
3. **Manual & Error-prone** — การกรอกข้อมูลด้วยมือทำให้เกิดความผิดพลาดได้ง่าย

### The Vision
สร้าง **Personal Finance Dashboard** ที่สวยงาม ใช้งานง่าย และฉลาดพอที่จะบอก Tom ได้ว่า "เดือนนี้เงินไปไหน และปีนี้เราอยู่ที่ไหน" — โดยไม่ต้องเปิด spreadsheet เลย

---

## 2. Target User

**Primary User:** Tom (1 คน — Personal Finance Tool)

**User Profile จากข้อมูลจริง:**
- มีรายได้จาก 3 แหล่ง: เงินเดือน + โบนัส + ค่า Commission (คอม)
- ค่าใช้จ่ายประจำที่ track ได้ชัดเจน: บ้าน, รถยนต์, Net AIS, Net 3BB, Netflix, ค่าไฟ, หวย, บัตรเครดิต, หอพัก
- มีการลงทุน: กองทุนสำรองเลี้ยงชีพ, ลงทุน Dime (ปี 2026)
- มีการออมเป้าหมาย: ออมเที่ยว (ปี 2026)
- Track ทุกปีตั้งแต่ 2023 ถึงปัจจุบัน (2026)
- ค่าใช้จ่ายใหม่ปี 2025: ChatGPT | ปี 2026: Claude AI

---

## 3. Core Data Model (จากข้อมูลจริง)

### รายได้ (Income)
| Field | ประเภท | คำอธิบาย |
|-------|--------|----------|
| เงินเดือน | Fixed Monthly | ฐานเงินเดือน ปรับขึ้นจาก 70k → 75k → 80k |
| โบนัส | Variable | รับปีละ 2–3 ครั้ง ส่วนใหญ่ มี.ค., มิ.ย., ก.ย., ธ.ค. |
| คอม | Variable | Commission จากการขาย/งาน ผันผวนมาก |

### การหัก (Deductions)
| Field | ประเภท | คำอธิบาย |
|-------|--------|----------|
| ภาษี | Auto-calculated | หักจากรายได้รวม |
| ประกันสังคม | Fixed | 750 บาท/เดือน |
| กองทุนสำรองเลี้ยงชีพ | Fixed % | ~2,100–2,400 บาท/เดือน |
| อื่นๆ (กยศ) | Variable | กู้ยืม กยศ ผ่อนชำระ |
| ลงทุน Dime | Investment | เพิ่มปี 2026 |

### ค่าใช้จ่าย (Expenses)
| หมวด | รายการ | ลักษณะ |
|------|--------|--------|
| ที่อยู่อาศัย | บ้าน, หอพัก | ค่าเช่า/ค่างวด |
| ยานพาหนะ | รถยนต์, ภาษีรถ, เข้าศูนย์ | ผ่อน + บำรุงรักษา |
| Utilities | Net AIS, Net 3BB, ค่าไฟบ้าน | ค่าสาธารณูปโภค |
| Subscription | Netflix, ChatGPT, Claude AI, Apple Watch | Digital subscriptions |
| การเงิน | บัตรเครดิต | ยอดชำระ |
| บันเทิง | หวย | ความบันเทิง |
| ออม | ออมเที่ยว | Savings goal |
| อื่นๆ | อื่นๆ | รายจ่ายที่ไม่ได้จัดหมวด |

### ยอดสรุป (Summary)
- **Net.** = รายรับทั้งหมด - รวมหัก (take-home จากเงินเดือน)
- **Net. All** = Net. + Commission ทั้งหมด
- **จ่าย** = รวมค่าใช้จ่ายจริงที่จ่ายออก
- **เหลือจริง** = Net. All - จ่าย
- **Kept** = เงินที่ออม/เก็บจริงๆ
- **G** = เป้าหมายการออม

---

## 4. Features & Scope

### Phase 1 — MVP (Core Dashboard)
| Feature | คำอธิบาย | Priority |
|---------|----------|----------|
| F01 | Dashboard Overview — ภาพรวมการเงินปีปัจจุบัน | P0 |
| F02 | Monthly Income & Deduction Entry — กรอกรายได้/หักรายเดือน | P0 |
| F03 | Monthly Expense Tracking — บันทึกค่าใช้จ่ายรายเดือน | P0 |
| F04 | Income vs Expense Chart — กราฟเปรียบเทียบ | P0 |
| F05 | Year Summary — สรุปยอดรวมทั้งปี | P0 |

### Phase 2 — Enhanced Analytics
| Feature | คำอธิบาย | Priority |
|---------|----------|----------|
| F06 | Multi-year Comparison — เปรียบเทียบข้ามปี 2023–2026 | P1 |
| F07 | Expense Category Breakdown — Pie chart ค่าใช้จ่ายตามหมวด | P1 |
| F08 | Savings Goal Tracker — ติดตาม Kept vs Target | P1 |
| F09 | Trend Analysis — แนวโน้มรายได้และค่าใช้จ่าย | P1 |
| F10 | Data Import from Historical — นำเข้าข้อมูลปี 2023–2026 | P1 |

### Phase 3 — Intelligence Layer
| Feature | คำอธิบาย | Priority |
|---------|----------|----------|
| F11 | Expense Anomaly Alert — แจ้งเตือนค่าใช้จ่ายผิดปกติ | P2 |
| F12 | Monthly Budget Forecast — คาดการณ์ยอดเดือนหน้า | P2 |
| F13 | Subscription Manager — จัดการ subscriptions ทั้งหมด | P2 |
| F14 | Export Report (PDF/Excel) — ส่งออกรายงาน | P2 |

---

## 5. Non-functional Requirements

| ด้าน | ความต้องการ |
|------|------------|
| Performance | Load ภายใน 2 วินาที, รองรับข้อมูล 4+ ปี |
| Data Persistence | LocalStorage + Export/Import JSON backup |
| Responsive | Desktop-first, Mobile-friendly |
| Offline | ทำงานได้โดยไม่ต้องต่ออินเทอร์เน็ต |
| Data Privacy | ข้อมูลอยู่บน browser เท่านั้น ไม่ส่งออก server |

---

## 6. Success Metrics

- Tom สามารถดูสถานะการเงินได้ภายใน 10 วินาที
- ลดเวลาในการ update ข้อมูลเหลือ < 5 นาที/เดือน
- มีข้อมูลทุกปีตั้งแต่ 2023–ปัจจุบันในที่เดียว
- สามารถตอบคำถาม "เดือนนี้เหลือเงินเท่าไหร่" ได้ทันที

---

## 7. Out of Scope (v1.0)

- ระบบ Multi-user / Family sharing
- Bank API Integration (Open Banking)
- Mobile App (iOS/Android)
- AI-powered Financial Advice
- Investment Portfolio Tracking (นอกจาก Dime ที่มีอยู่)
