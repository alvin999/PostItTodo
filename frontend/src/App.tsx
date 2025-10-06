import React, { useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './App.css'

// ========================================
// 類型定義
// ========================================

/**
 * 待辦事項資料結構
 * @property id - 唯一識別碼
 * @property title - 待辦事項標題
 * @property completed - 是否已完成
 * @property order - 排序順序 (數字越小越靠前)
 */
interface Todo {
  id: number;
  title: string;
  completed: boolean;
  order: number;
}

// ========================================
// 常數
// ========================================

/**
 * API 基礎 URL
 * - 生產環境 (PROD): 使用相對路徑,由後端統一處理
 * - 開發環境: 連接到 localhost:8000
 */
const API_URL = import.meta.env.PROD ? '' : 'http://localhost:8000';

// ========================================
// 自定義 Hooks
// ========================================

/**
 * 管理待辦事項的所有 API 操作
 * 
 * 功能包含:
 * - 取得所有待辦事項 (GET)
 * - 新增待辦事項 (POST)
 * - 更新待辦事項 (PUT/PATCH)
 * - 刪除待辦事項 (DELETE)
 * - 重新排序 (POST)
 * 
 * @returns {object} API 操作方法和狀態
 */
function useTodoAPI() {
  // 待辦事項列表
  const [todos, setTodos] = useState<Todo[]>([]);
  
  // 載入中狀態 (用於顯示載入指示器)
  const [loading, setLoading] = useState(false);
  
  // 錯誤訊息 (用於顯示錯誤提示)
  const [error, setError] = useState('');

  /**
   * 從後端取得所有待辦事項
   * 使用 useCallback 避免不必要的函式重建
   */
  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/todos/`);
      
      if (!res.ok) throw new Error('無法取得待辦事項');
      
      const data = await res.json();
      setTodos(data);
      setError('');
    } catch (err) {
      // 統一的錯誤處理
      setError(err instanceof Error ? err.message : '發生錯誤');
      console.error('fetchTodos error:', err);
    } finally {
      // 無論成功或失敗都要關閉載入狀態
      setLoading(false);
    }
  }, []);

  /**
   * 新增待辦事項
   * 
   * @param title - 待辦事項標題
   * @returns {boolean} 是否新增成功
   */
  const addTodo = useCallback(async (title: string) => {
    // 驗證輸入不可為空
    if (!title.trim()) {
      setError('請輸入待辦事項內容');
      return false;
    }
    
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/todos/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() })
      });
      
      if (!res.ok) throw new Error('新增失敗');
      
      // 取得新增的待辦事項 (包含後端生成的 id)
      const newTodo = await res.json();
      
      // 更新本地狀態
      setTodos(prev => [...prev, newTodo]);
      setError('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤');
      console.error('addTodo error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 更新待辦事項
   * 
   * 支援兩種更新方式:
   * 1. 只切換完成狀態 → 使用 PATCH /todos/{id}/toggle
   * 2. 更新標題或其他欄位 → 使用 PUT /todos/{id}
   * 
   * @param id - 待辦事項 ID
   * @param updates - 要更新的欄位 (title 或 completed)
   * @returns {boolean} 是否更新成功
   */
  const updateTodo = useCallback(async (id: number, updates: Partial<Pick<Todo, 'title' | 'completed'>>) => {
    try {
      // 判斷使用哪個 API 端點
      const isToggleOnly = updates.completed !== undefined && Object.keys(updates).length === 1;
      const endpoint = isToggleOnly 
        ? `${API_URL}/todos/${id}/toggle`
        : `${API_URL}/todos/${id}`;
      
      const method = isToggleOnly ? 'PATCH' : 'PUT';
      
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        // toggle 端點不需要 body
        body: method === 'PUT' ? JSON.stringify(updates) : undefined
      });
      
      if (!res.ok) throw new Error('更新失敗');
      
      // 取得更新後的完整資料
      const updatedTodo = await res.json();
      
      // 更新本地狀態中對應的項目
      setTodos(prev => prev.map(todo => todo.id === id ? updatedTodo : todo));
      setError('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤');
      console.error('updateTodo error:', err);
      return false;
    }
  }, []);

  /**
   * 刪除待辦事項
   * 
   * @param id - 待辦事項 ID
   * @returns {boolean} 是否刪除成功
   */
  const deleteTodo = useCallback(async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      
      // 從本地狀態移除該項目
      setTodos(prev => prev.filter(todo => todo.id !== id));
      setError('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤');
      console.error('deleteTodo error:', err);
      return false;
    }
  }, []);

  /**
   * 重新排序待辦事項
   * 
   * 使用樂觀更新策略:
   * 1. 先更新本地 UI (使用者立即看到變化)
   * 2. 同步到後端
   * 3. 如果失敗,重新從後端取得資料
   * 
   * @param newOrder - 新的待辦事項順序
   */
  const reorderTodos = useCallback(async (newOrder: Todo[]) => {
    // 樂觀更新: 先更新 UI
    setTodos(newOrder);
    
    try {
      // 提取所有 ID 的順序
      const todoIds = newOrder.map(todo => todo.id);
      
      const res = await fetch(`${API_URL}/todos/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todo_ids: todoIds })
      });
      
      if (!res.ok) throw new Error('更新順序失敗');
      
      // 使用後端回傳的資料更新 (確保一致性)
      const updatedTodos = await res.json();
      setTodos(updatedTodos);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤');
      console.error('reorderTodos error:', err);
      
      // 失敗時重新取得資料,確保 UI 和後端一致
      await fetchTodos();
    }
  }, [fetchTodos]);

  return {
    todos,
    loading,
    error,
    setError,
    fetchTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    reorderTodos
  };
}

/**
 * 管理編輯模式的狀態
 * 
 * 編輯流程:
 * 1. 點擊編輯按鈕 → startEdit
 * 2. 修改文字 → setEditText
 * 3. 儲存或取消 → saveEdit / cancelEdit
 * 
 * @returns {object} 編輯狀態和操作方法
 */
function useEditMode() {
  // 目前正在編輯的待辦事項 ID (null 表示沒有在編輯)
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // 編輯中的文字內容
  const [editText, setEditText] = useState('');

  /**
   * 開始編輯待辦事項
   * 
   * @param todo - 要編輯的待辦事項
   */
  const startEdit = useCallback((todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.title);
  }, []);

  /**
   * 取消編輯
   * 清除編輯狀態,不儲存變更
   */
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  return {
    editingId,
    editText,
    setEditText,
    startEdit,
    cancelEdit
  };
}

// ========================================
// 子元件
// ========================================

/**
 * 可拖曳的待辦事項卡片元件
 * 
 * 功能:
 * - 顯示待辦事項內容
 * - 支援拖曳排序 (透過左側手柄)
 * - 點擊卡片切換完成狀態
 * - 編輯和刪除操作 (右上角按鈕)
 * - 編輯模式 (雙欄位輸入)
 * 
 * @param props - 元件屬性
 */
function TodoCard({ 
  todo,
  isEditing,
  editText,
  onEditTextChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggle,
  onDelete
}: {
  todo: Todo;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  // @dnd-kit 提供的拖曳功能
  const {
    attributes,   // 拖曳手柄的 ARIA 屬性
    listeners,    // 拖曳手柄的事件監聽器
    setNodeRef,   // 設定可拖曳元素的 ref
    transform,    // 拖曳時的位移變換
    transition,   // 動畫過渡效果
    isDragging,   // 是否正在拖曳中
  } = useSortable({ id: todo.id.toString() });

  // 拖曳時的樣式
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 200ms ease',
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 100 : 1,
    boxShadow: isDragging 
      ? '0 8px 16px rgba(0,0,0,0.3)'  // 拖曳時較深的陰影
      : '0 2px 4px rgba(0,0,0,0.1)',  // 正常狀態的陰影
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  /**
   * 處理編輯模式的鍵盤快捷鍵
   * - Enter: 儲存
   * - Esc: 取消
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSaveEdit();
    } else if (e.key === 'Escape') {
      onCancelEdit();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`post-it-note ${todo.completed ? 'completed' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      {isEditing ? (
        // ===== 編輯模式 =====
        <div className="edit-mode">
          <textarea
            value={editText}
            onChange={(e) => onEditTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="edit-textarea"
            autoFocus
          />
          <div className="edit-buttons">
            <button className="btn-save" onClick={onSaveEdit}>
              ✓ 儲存
            </button>
            <button className="btn-cancel" onClick={onCancelEdit}>
              ✕ 取消
            </button>
          </div>
        </div>
      ) : (
        // ===== 顯示模式 =====
        <>
          {/* 拖曳手柄 (左側) */}
          <div 
            className="drag-handle" 
            {...attributes}  // 加入無障礙屬性
            {...listeners}   // 加入拖曳事件監聽
            title="拖曳調整順序"
          >
            ⋮⋮
          </div>
          
          {/* 操作按鈕 (右上角) */}
          <div className="todo-actions-top">
            <button 
              className="btn-icon btn-edit" 
              onClick={(e) => { 
                e.stopPropagation();  // 防止觸發卡片的 onClick (切換完成)
                onStartEdit(); 
              }}
              title="編輯"
            >
              ✎
            </button>
            <button 
              className="btn-icon btn-delete" 
              onClick={(e) => { 
                e.stopPropagation();  // 防止觸發卡片的 onClick (切換完成)
                onDelete(); 
              }}
              title="刪除"
            >
              ✕
            </button>
          </div>
          
          {/* 內容區域 (點擊切換完成狀態) */}
          <div 
            className="todo-content" 
            onClick={onToggle}
            style={{ cursor: 'pointer' }}
            title={todo.completed ? '點擊標記未完成' : '點擊標記完成'}
          >
            <p className="todo-text">{todo.title}</p>
            {todo.completed && <div className="completed-badge">✓ 已完成</div>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 新增待辦事項的輸入區元件
 * 
 * 功能:
 * - 多行文字輸入
 * - Enter 快捷鍵新增
 * - Shift+Enter 換行
 * - 載入中狀態顯示
 * 
 * @param props - 元件屬性
 */
function TodoInput({ 
  value, 
  onChange, 
  onSubmit, 
  disabled 
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  /**
   * 處理鍵盤快捷鍵
   * Enter (不按 Shift) → 提交
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="input-area">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="輸入待辦事項 (Enter 新增，Shift+Enter 換行)"
        rows={4}
        disabled={disabled}
      />
      <button onClick={onSubmit} disabled={disabled}>
        {disabled ? '處理中...' : '新增'}
      </button>
    </div>
  );
}

// ========================================
// 主元件
// ========================================

/**
 * 待辦事項應用主元件
 * 
 * 功能總覽:
 * - 顯示待辦事項列表
 * - 新增、編輯、刪除待辦事項
 * - 點擊切換完成狀態
 * - 拖曳調整順序
 * - 錯誤提示和載入狀態
 * 
 * 架構:
 * - useTodoAPI: 管理所有 API 操作
 * - useEditMode: 管理編輯狀態
 * - TodoCard: 顯示單個待辦事項
 * - TodoInput: 新增輸入介面
 */
function App() {
  // 新增待辦事項的輸入內容
  const [newTodo, setNewTodo] = useState('');
  
  // API 操作和狀態
  const {
    todos,          // 待辦事項列表
    loading,        // 載入中狀態
    error,          // 錯誤訊息
    setError,       // 設定錯誤訊息
    fetchTodos,     // 取得所有待辦事項
    addTodo,        // 新增待辦事項
    updateTodo,     // 更新待辦事項
    deleteTodo,     // 刪除待辦事項
    reorderTodos    // 重新排序
  } = useTodoAPI();

  // 編輯模式狀態
  const {
    editingId,      // 正在編輯的 ID
    editText,       // 編輯中的文字
    setEditText,    // 設定編輯文字
    startEdit,      // 開始編輯
    cancelEdit      // 取消編輯
  } = useEditMode();

  /**
   * 設定拖曳感應器
   * 
   * - MouseSensor: 滑鼠拖曳 (需移動 8px 才啟動,避免誤觸)
   * - TouchSensor: 觸控拖曳 (延遲 150ms,避免與滾動衝突)
   * - KeyboardSensor: 鍵盤操作 (無障礙支援)
   */
  const sensors = useSensors(
    useSensor(MouseSensor, { 
      activationConstraint: { distance: 8 } 
    }),
    useSensor(TouchSensor, { 
      activationConstraint: { delay: 150, tolerance: 5 } 
    }),
    useSensor(KeyboardSensor, { 
      coordinateGetter: sortableKeyboardCoordinates 
    })
  );

  /**
   * 元件載入時取得待辦事項
   */
  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  /**
   * 處理新增待辦事項
   * 成功後清空輸入欄位
   */
  const handleAddTodo = async () => {
    const success = await addTodo(newTodo);
    if (success) setNewTodo('');
  };

  /**
   * 處理儲存編輯
   * 
   * @param id - 待辦事項 ID
   */
  const handleSaveEdit = async (id: number) => {
    // 驗證輸入不可為空
    if (!editText.trim()) {
      setError('內容不可為空');
      return;
    }
    
    const success = await updateTodo(id, { title: editText });
    if (success) cancelEdit();
  };

  /**
   * 處理切換完成狀態
   * 
   * @param id - 待辦事項 ID
   */
  const handleToggle = async (id: number) => {
    // 傳入 completed: true,實際狀態由後端 toggle 端點切換
    await updateTodo(id, { completed: true });
  };

  /**
   * 處理刪除待辦事項
   * 顯示確認對話框避免誤刪
   * 
   * @param id - 待辦事項 ID
   */
  const handleDelete = async (id: number) => {
    if (!window.confirm('確定要刪除這個待辦事項嗎?')) return;
    await deleteTodo(id);
  };

  /**
   * 處理拖曳結束事件
   * 
   * 流程:
   * 1. 取得拖曳的來源和目標位置
   * 2. 計算新的順序
   * 3. 更新本地狀態和後端
   * 
   * @param event - 拖曳結束事件
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    // 如果沒有有效的目標位置,或拖曳到原位,則不處理
    if (!over || active.id === over.id) return;

    // 找到來源和目標的索引
    const oldIndex = todos.findIndex(todo => todo.id.toString() === active.id);
    const newIndex = todos.findIndex(todo => todo.id.toString() === over.id);
    
    // 使用 @dnd-kit 的 arrayMove 計算新順序
    const newOrder = arrayMove(todos, oldIndex, newIndex);
    
    // 更新順序 (樂觀更新 + 後端同步)
    reorderTodos(newOrder);
  };

  return (
    <div className="app-container">
      {/* 標題 */}
      <div className="header-container">
        <h1>我的待辦事項</h1>
      </div>

      {/* 錯誤訊息 */}
      {error && <div className="error-message">{error}</div>}

      {/* 新增輸入區 */}
      <TodoInput
        value={newTodo}
        onChange={setNewTodo}
        onSubmit={handleAddTodo}
        disabled={loading}
      />

      {/* 載入指示器 */}
      {loading && <p className="loading-text">載入中...</p>}
      
      {/* 拖曳提示 (只在有待辦事項時顯示) */}
      {!loading && todos.length > 0 && (
        <p className="drag-hint">💡 提示：按住左側的 ⋮⋮ 圖示可拖曳調整順序</p>
      )}

      {/* 待辦事項列表 (支援拖曳排序) */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={todos.map(todo => todo.id.toString())}
          strategy={rectSortingStrategy}
        >
          <div className="todos-grid">
            {todos.map(todo => (
              <TodoCard
                key={todo.id}
                todo={todo}
                isEditing={editingId === todo.id}
                editText={editText}
                onEditTextChange={setEditText}
                onStartEdit={() => startEdit(todo)}
                onSaveEdit={() => handleSaveEdit(todo.id)}
                onCancelEdit={cancelEdit}
                onToggle={() => handleToggle(todo.id)}
                onDelete={() => handleDelete(todo.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* 空狀態提示 */}
      {!loading && todos.length === 0 && (
        <div className="empty-state">
          <p>還沒有待辦事項，開始新增一個吧! 📝</p>
        </div>
      )}
    </div>
  );
}

export default App;