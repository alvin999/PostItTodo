# backend/init_db.py
from database import engine, Base, SessionLocal, Todo

print("正在初始化資料庫...")

# 刪除舊資料表並重建
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

print("資料表建立完成!")

# 新增測試資料
db = SessionLocal()
try:
    test_todos = [
        Todo(title="學習 FastAPI", completed=False),
        Todo(title="建立 React 前端", completed=False),
        Todo(title="整合前後端", completed=True),
    ]
    
    for todo in test_todos:
        db.add(todo)
    
    db.commit()
    print(f"成功新增 {len(test_todos)} 筆測試資料!")
    
    # 驗證資料
    all_todos = db.query(Todo).all()
    print(f"\n目前資料庫中有 {len(all_todos)} 筆待辦事項:")
    for todo in all_todos:
        status = "✅" if todo.completed else "⬜"
        print(f"  {status} [{todo.id}] {todo.title}")
        
except Exception as e:
    print(f"錯誤: {e}")
    db.rollback()
finally:
    db.close()

print("\n資料庫初始化完成!")
