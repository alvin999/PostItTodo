# backend/test_db.py
from database import engine, SessionLocal, Todo, Base
from sqlalchemy import inspect

print("=" * 50)
print("測試資料庫連接")
print("=" * 50)

try:
    # 測試連接
    with engine.connect() as connection:
        print("✅ 資料庫連接成功")
    
    # 檢查資料表
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"\n資料表列表: {tables}")
    
    if 'todos' in tables:
        columns = inspector.get_columns('todos')
        print(f"\ntodos 資料表欄位:")
        for col in columns:
            print(f"  - {col['name']}: {col['type']}")
    
    # 測試查詢
    db = SessionLocal()
    try:
        count = db.query(Todo).count()
        print(f"\n✅ 目前有 {count} 筆待辦事項")
        
        # 顯示所有資料
        todos = db.query(Todo).all()
        for todo in todos:
            print(f"  ID: {todo.id}, Title: {todo.title}, Order: {todo.order}")
    finally:
        db.close()
    
    print("\n" + "=" * 50)
    print("資料庫測試完成!")
    print("=" * 50)

except Exception as e:
    print(f"\n❌ 錯誤: {e}")
    import traceback
    traceback.print_exc()