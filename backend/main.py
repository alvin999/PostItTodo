# backend/main.py
import os
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import Todo, get_db, Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI()

# CORS 設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== Pydantic 模型 ==========
class TodoCreate(BaseModel):
    title: str

class TodoUpdate(BaseModel):
    title: str | None = None
    completed: bool | None = None

class TodoResponse(BaseModel):
    id: int
    title: str
    completed: bool
    order: int
    
    class Config:
        from_attributes = True

class ReorderRequest(BaseModel):
    todo_ids: list[int]

# ========== API 端點 (必須在靜態檔案之前定義!) ==========

@app.get("/api/health")
def health_check():
    """健康檢查"""
    return {
        "status": "ok",
        "mode": "Docker" if os.getenv("DOCKER_ENV") == "true" else "Development"
    }

@app.get("/todos/", response_model=list[TodoResponse])
def get_todos(db: Session = Depends(get_db)):
    """取得所有待辦事項"""
    return db.query(Todo).order_by(Todo.order).all()

@app.post("/todos/", response_model=TodoResponse, status_code=201)
def create_todo(todo: TodoCreate, db: Session = Depends(get_db)):
    """新增待辦事項"""
    max_order = db.query(Todo).count()
    new_todo = Todo(title=todo.title, completed=False, order=max_order)
    db.add(new_todo)
    db.commit()
    db.refresh(new_todo)
    return new_todo

@app.put("/todos/{todo_id}", response_model=TodoResponse)
def update_todo(todo_id: int, todo_update: TodoUpdate, db: Session = Depends(get_db)):
    """更新待辦事項"""
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="找不到該待辦事項")
    
    if todo_update.title is not None:
        todo.title = todo_update.title
    if todo_update.completed is not None:
        todo.completed = todo_update.completed
    
    db.commit()
    db.refresh(todo)
    return todo

@app.patch("/todos/{todo_id}/toggle", response_model=TodoResponse)
def toggle_todo(todo_id: int, db: Session = Depends(get_db)):
    """切換完成狀態"""
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="找不到該待辦事項")
    
    todo.completed = not todo.completed
    db.commit()
    db.refresh(todo)
    return todo

@app.delete("/todos/{todo_id}", status_code=204)
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    """刪除待辦事項"""
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="找不到該待辦事項")
    
    db.delete(todo)
    db.commit()
    return None

@app.post("/todos/reorder", response_model=list[TodoResponse])
def reorder_todos(reorder: ReorderRequest, db: Session = Depends(get_db)):
    """重新排序"""
    try:
        for index, todo_id in enumerate(reorder.todo_ids):
            todo = db.query(Todo).filter(Todo.id == todo_id).first()
            if todo:
                todo.order = index
        
        db.commit()
        return db.query(Todo).order_by(Todo.order).all()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ========== 靜態檔案設定 (必須在 API 路由之後!) ==========
IS_DOCKER = os.getenv("DOCKER_ENV", "false").lower() == "true"

if IS_DOCKER:
    STATIC_DIR = Path("/app/static")
    
    if STATIC_DIR.exists():
        # 掛載靜態資源 (CSS, JS, 圖片等)
        app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")
        
        print("✅ Docker 模式:前端靜態檔案已掛載")
        
        # 🔥 重要:這個必須放在最後,作為 catch-all 路由
        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            """
            處理 SPA 路由
            所有未匹配到的路徑都回傳 index.html
            """
            # 檢查是否為靜態檔案
            file_path = STATIC_DIR / full_path
            if file_path.is_file():
                return FileResponse(file_path)
            
            # 其他所有路徑回傳 index.html (SPA 路由)
            index_path = STATIC_DIR / "index.html"
            if index_path.exists():
                return FileResponse(index_path)
            
            raise HTTPException(status_code=404, detail="Not found")
    else:
        print(f"⚠️  警告:靜態檔案目錄不存在: {STATIC_DIR}")
else:
    print("✅ 開發模式:使用 CORS 連接前端")