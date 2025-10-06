# -------------------------------
# 前端建置階段 (React + Vite)
# -------------------------------
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# 複製 package 檔案
COPY frontend/package*.json ./

# 安裝依賴
RUN npm ci --silent

# 複製前端原始碼
COPY frontend/ ./

# 建置前端
RUN npm run build

# -------------------------------
# 後端階段 (FastAPI + Python)
# -------------------------------
FROM python:3.12-slim

# 設定環境變數
ENV PYTHONUNBUFFERED=1 \
    DOCKER_ENV=true \
    PYTHONDONTWRITEBYTECODE=1

# 安裝系統依賴
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    sqlite3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 設定工作目錄
WORKDIR /app

# 安裝 Python 依賴
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 複製後端程式碼
COPY backend/ ./backend/

# 複製前端建置結果
COPY --from=frontend-build /app/frontend/dist ./static/

# 🔥 重要:建立資料目錄並設定權限
RUN mkdir -p /app/backend/data && \
    chmod 777 /app/backend/data

# 切換到後端目錄
WORKDIR /app/backend

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

# 暴露端口
EXPOSE 8000

# 啟動命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]