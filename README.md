# 🎓 Azota AI Assistant — Smart Screen Capture & Study Solver

Tiện ích mở rộng Chrome (Manifest V3) hỗ trợ học tập, giải bài tập và thẩm định đáp án thông minh bằng AI đa phương thức (**Google Gemini** & **OpenAI-Compatible**).

---

## 🌟 Tính Năng Nổi Bật

### 1. 📸 Chụp Cuộn Màn Hình Thông Minh (Native Scroll Capture)
* Sử dụng trực tiếp API Chrome Native (`chrome.tabs.captureVisibleTab`) kết hợp thuật toán ghép ảnh `OffscreenCanvas`.
* Hỗ trợ chụp linh hoạt: **1/3 trang web** (mặc định), **Toàn trang (Full Page)** hoặc **Khung nhìn hiện tại**.
* Tự động ẩn các thanh điều hướng cố định (Sticky/Fixed headers) khi cuộn để không che mất nội dung đề bài.
* Hoạt động mượt mà ngay cả trong chế độ toàn màn hình (**Fullscreen**).

### 2. 🤖 Tích Hợp Đa Mô Hình AI (Multi-Provider Engine)
* **Google Gemini AI:** Hỗ trợ các dòng mô hình Flash mới nhất (`Gemini 3.7 Flash`, `Gemini 3.6 Flash`, `Gemini 3.5 Flash`) với cấu hình nhiệt độ tối ưu (`temperature: 0.1`) và cơ chế chuỗi tư duy (Chain-of-Thought).
* **OpenAI-Compatible API:** Hỗ trợ kết nối với `ChatGPT 5.6`, `ChatGPT 5.5 Turbo`, `Claude Opus 4.8`, `o3-mini` hoặc bất kỳ proxy/endpoint tương thích nào (OpenRouter, OneAPI, NewAPI, Groq, Ollama...).
* **Bộ Nén Ảnh Thông Minh:** Tự động tối ưu hóa kích thước ảnh chụp trước khi gửi, giúp tăng tốc độ phản hồi gấp 10 lần và tiết kiệm token.

### 3. 🔄 Xoay Vòng Nhiều API Key & Quản Lý Độc Lập
* Cho phép nhập danh sách nhiều API Key (mỗi dòng 1 key).
* Tự động chuyển sang key dự phòng khi gặp giới hạn tốc độ (Rate Limit 429) hoặc hết hạn mức.
* Phân tách lưu trữ độc lập giữa API Key của Gemini và OpenAI Compatible.

### 4. 🔍 Tính Năng Soát Bài Độc Lập (Double Check)
* Gửi lại ảnh chụp đề bài gốc + lời giải ban đầu lên mô hình AI thứ hai để thẩm định chéo.
* Phát hiện bẫy đề thi, kiểm tra lại từng bước tính và xác nhận kết quả cuối cùng với độ tin cậy cao nhất.

### 5. 🖥️ Bảng Nổi Tiện Ích (Closed Shadow DOM Floating HUD)
* Hiển thị lời giải ngay trên màn hình mà không cần chuyển tab.
* Sử dụng **Closed Shadow DOM** giúp cách ly style 100%, không xung đột và không bị can thiệp bởi mã nguồn của trang web.
* Hỗ trợ kéo thả di chuyển vị trí, thu nhỏ/mở rộng và nút copy lời giải nhanh chóng.

### 6. 📊 Bộ Đếm Token Trực Quan
* Thống kê chi tiết số lượng Token đã tiêu thụ (Prompt vs Output) và số lượt gọi API thành công theo thời gian thực.

---

## 🚀 Hướng Dẫn Cài Đặt (Chrome Extension)

1. Tải về hoặc clone repository này về máy tính:
   ```bash
   git clone https://github.com/Minhdepdai/azota_assistant.git
   ```
2. Mở trình duyệt Chrome / Edge / Brave và truy cập vào:
   ```text
   chrome://extensions
   ```
3. Bật **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải.
4. Bấm vào nút **Tải tiện ích đã giải nén (Load unpacked)** $\rightarrow$ Chọn thư mục `capture-demo`.
5. Tiện ích **Azota AI Assistant** sẽ xuất hiện trên thanh công cụ của trình duyệt!

---

## 📖 Hướng Dẫn Sử Dụng

1. **Thiết lập API Key:**
   - Bấm vào icon tiện ích $\rightarrow$ chọn **Cài đặt**.
   - Chọn nhà cung cấp (**Google Gemini** hoặc **OpenAI Compatible**).
   - Nhập API Key của bạn $\rightarrow$ Bấm **Kiểm tra kết nối** $\rightarrow$ Bấm **Lưu cấu hình**.

2. **Chụp bài & Xem lời giải:**
   - Mở bài tập hoặc trang web cần giải.
   - Nhấn phím tắt **`Alt + S`** (hoặc click vào nút tròn 📷 ở góc phải màn hình).
   - Bảng nổi sẽ hiển thị và AI sẽ trả về lời giải chi tiết trong 1–2 giây.

3. **Soát bài (Double Check):**
   - Click nút **`🔍 Soát bài (Double Check)`** ngay dưới phần đáp án để AI kiểm tra lại đề bài và xác nhận kết quả.

---

## 🛠️ Cấu Trúc Thư Mục

```text
├── capture-demo/              # Mã nguồn chính của Extension (Manifest V3)
│   ├── manifest.json          # Cấu hình tiện ích
│   ├── background.js          # Service Worker xử lý chụp ảnh & gọi API
│   ├── content.js             # Script nhúng trang web & Floating HUD
│   ├── popup.html / popup.js  # Giao diện Popup extension
│   ├── options.html / options.js # Trang cài đặt API & Double Check
│   └── icons/                 # Bộ biểu tượng ứng dụng
├── .gitignore
└── README.md                  # Tài liệu hướng dẫn
```

---

## 📄 Giấy Phép & Tuyên Bố Miễn Trừ Trách Nhiệm

Dự án được phát triển nhằm mục đích **nghiên cứu, hỗ trợ học tập, rèn luyện kỹ năng tự học và đối chiếu kiến thức**. Người dùng vui lòng tuân thủ quy chế thi và điều khoản sử dụng của các nền tảng giáo dục liên quan.
