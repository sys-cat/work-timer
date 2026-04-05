import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import type { Workplace } from "../types";

interface Props {
  workplaces: Workplace[];
  onChanged: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

export default function SettingsPanel({ workplaces, onChanged, onRefresh }: Props) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#2563eb");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [recalcMessage, setRecalcMessage] = useState("");
  const [dumpYear, setDumpYear] = useState(new Date().getFullYear());
  const [dumpMessage, setDumpMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () =>
    withLoading(async () => {
      if (!newName.trim()) return;
      await api.addWorkplace(newName.trim(), newColor);
      setNewName("");
      setNewColor("#2563eb");
      await onChanged();
    });

  const handleEditStart = (w: Workplace) => {
    setEditId(w.id);
    setEditName(w.name);
    setEditColor(w.color);
  };

  const handleEditSave = () =>
    withLoading(async () => {
      if (editId === null || !editName.trim()) return;
      await api.updateWorkplace(editId, editName.trim(), editColor);
      setEditId(null);
      await onChanged();
    });

  const handleDeleteConfirm = () =>
    withLoading(async () => {
      if (confirmDeleteId === null) return;
      await api.deleteWorkplace(confirmDeleteId);
      setConfirmDeleteId(null);
      await onChanged();
    });

  const handleMove = (index: number, direction: -1 | 1) =>
    withLoading(async () => {
      const newOrder = [...workplaces];
      const target = index + direction;
      if (target < 0 || target >= newOrder.length) return;
      [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
      await api.reorderWorkplaces(newOrder.map((w) => w.id));
      await onChanged();
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--danger-light)",
            color: "var(--danger)",
            borderRadius: "var(--radius)",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            style={{ background: "none", color: "var(--danger)", padding: "2px 8px", fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 勤務先リスト */}
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>勤務先</h2>

        {workplaces.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            勤務先が登録されていません
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {workplaces.map((w, i) => (
              <div
                key={w.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: "var(--bg)",
                  borderRadius: "var(--radius)",
                }}
              >
                {/* 並び替えボタン */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button
                    onClick={() => handleMove(i, -1)}
                    disabled={i === 0 || loading}
                    style={{
                      padding: "1px 6px",
                      fontSize: 10,
                      color: i === 0 ? "var(--text-tertiary)" : "var(--text-secondary)",
                      background: "transparent",
                    }}
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMove(i, 1)}
                    disabled={i === workplaces.length - 1 || loading}
                    style={{
                      padding: "1px 6px",
                      fontSize: 10,
                      color:
                        i === workplaces.length - 1
                          ? "var(--text-tertiary)"
                          : "var(--text-secondary)",
                      background: "transparent",
                    }}
                  >
                    ▼
                  </button>
                </div>

                {editId === w.id ? (
                  // 編集フォーム
                  <>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      style={{ width: 32, height: 28, padding: 2, border: "1px solid var(--border)", borderRadius: 4 }}
                    />
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ flex: 1, fontSize: 13 }}
                      onKeyDown={(e) => e.key === "Enter" && handleEditSave()}
                    />
                    <button className="btn-primary" onClick={handleEditSave} disabled={loading} style={{ padding: "4px 12px", fontSize: 12 }}>
                      保存
                    </button>
                    <button className="btn-ghost" onClick={() => setEditId(null)} style={{ padding: "4px 12px", fontSize: 12 }}>
                      キャンセル
                    </button>
                  </>
                ) : confirmDeleteId === w.id ? (
                  // 削除確認
                  <>
                    <span style={{ flex: 1, fontSize: 13, color: "var(--danger)" }}>
                      「{w.name}」を削除しますか？紐付きの勤務記録は未設定になります。
                    </span>
                    <button
                      className="btn-danger"
                      onClick={handleDeleteConfirm}
                      disabled={loading}
                      style={{ padding: "4px 12px", fontSize: 12 }}
                    >
                      削除する
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ padding: "4px 12px", fontSize: 12 }}
                    >
                      キャンセル
                    </button>
                  </>
                ) : (
                  // 通常表示
                  <>
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: w.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, fontSize: 13 }}>{w.name}</span>
                    <button
                      onClick={() => handleEditStart(w)}
                      style={{ padding: "4px 10px", fontSize: 12, color: "var(--text-secondary)", background: "transparent" }}
                    >
                      編集
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(w.id)}
                      disabled={loading}
                      style={{ padding: "4px 10px", fontSize: 12, color: "var(--danger)", background: "transparent" }}
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 追加フォーム */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            style={{ width: 36, height: 32, padding: 2, border: "1px solid var(--border)", borderRadius: 4, flexShrink: 0 }}
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="勤務先名（例：会社A、副業B）"
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button
            className="btn-primary"
            onClick={handleAdd}
            disabled={loading || !newName.trim()}
            style={{ padding: "8px 16px", fontSize: 13, flexShrink: 0 }}
          >
            追加
          </button>
        </div>
      </div>

      {/* 年次ダンプ */}
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>年次ダンプ</h2>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
          指定した年の全勤務データをJSONファイルに出力します。
        </p>
        {dumpMessage && (
          <div style={{
            padding: "8px 12px", marginBottom: 10,
            background: "var(--success-light)", color: "var(--success)",
            borderRadius: "var(--radius)", fontSize: 13,
          }}>
            {dumpMessage}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            value={dumpYear}
            onChange={(e) => setDumpYear(Number(e.target.value))}
            style={{ width: 90, fontSize: 13 }}
            min={2000}
            max={2099}
          />
          <button
            className="btn-ghost"
            disabled={loading}
            onClick={() =>
              withLoading(async () => {
                setDumpMessage("");
                const filePath = await save({
                  defaultPath: `work_timer_dump_${dumpYear}.json`,
                  filters: [{ name: "JSON", extensions: ["json"] }],
                });
                if (!filePath) return;
                const result = await api.dumpYearly(dumpYear, filePath);
                setDumpMessage(`${dumpYear}年のデータをダンプしました: ${result}`);
              })
            }
            style={{ padding: "8px 16px", fontSize: 13 }}
          >
            ダンプを実行
          </button>
        </div>
      </div>

      {/* 勤務時間の再計算 */}
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>勤務時間の再計算</h2>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
          開始・終了時刻から duration_minutes を再計算します。日またぎ補正が適用されていない古いデータの修正に使用してください。
        </p>
        {recalcMessage && (
          <div style={{
            padding: "8px 12px", marginBottom: 10,
            background: "var(--success-light)", color: "var(--success)",
            borderRadius: "var(--radius)", fontSize: 13,
          }}>
            {recalcMessage}
          </div>
        )}
        <button
          className="btn-ghost"
          disabled={loading}
          onClick={() =>
            withLoading(async () => {
              setRecalcMessage("");
              const count = await api.recalculateDurations();
              setRecalcMessage(
                count > 0
                  ? `${count} 件のエントリを更新しました。`
                  : "更新対象のエントリはありませんでした。"
              );
              if (count > 0) await onRefresh();
            })
          }
          style={{ padding: "8px 16px", fontSize: 13 }}
        >
          再計算を実行
        </button>
      </div>
    </div>
  );
}
