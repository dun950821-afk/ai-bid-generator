"""进度管理：ProgressCallback（写 AsyncTask）+ ProgressTracker（并行内存聚合）。

并行抽取时 worker 线程不直接写库：只更新内存 ProgressTracker（加锁），
orchestrator 的 reporter 线程定期读取快照并唯一地写 DB。
"""

import logging
import threading

logger = logging.getLogger(__name__)


class ProgressCallback:
    """进度回调管理器，避免过度频繁写库。

    只有当 progress 变化 >= 5% 或 current_step 变化时才保存。
    支持区间映射：当作为解析流水线一段时，传入 offset/range 把 0-100 映射到
    [offset, offset+range] 区间（如 extract 段映射到 65-100）。
    线程安全：加锁保护读-判定-写临界区。
    """

    def __init__(self, task, progress_offset: int = 0, progress_range: int = 100):
        self.task = task
        self.progress_offset = min(100, max(0, progress_offset))
        self.progress_range = min(100 - self.progress_offset, max(0, progress_range))
        self.last_progress = task.progress
        self.last_step = task.current_step
        self._lock = threading.Lock()

    def _map_progress(self, progress: int) -> int:
        """把子任务的 0-100 映射到 [offset, offset+range]。"""
        progress = min(100, max(0, progress))
        return min(100, self.progress_offset + int(progress * self.progress_range / 100))

    def __call__(self, progress: int, step: str):
        """更新进度。"""
        mapped = self._map_progress(progress)

        with self._lock:
            # 检查是否需要保存
            progress_changed = abs(mapped - self.last_progress) >= 5
            step_changed = step != self.last_step

            if not (progress_changed or step_changed):
                return

            self.task.progress = mapped
            self.task.current_step = step
            self.task.save(update_fields=["progress", "current_step"])
            self.last_progress = mapped
            self.last_step = step

        logger.debug(
            "Task %s progress: %d%% - %s",
            self.task.id,
            mapped,
            step,
        )


class ProgressTracker:
    """并行抽取进度聚合（内存态，线程安全）。

    worker 线程 mark_started/mark_finished；orchestrator 的 reporter 线程
    定期 snapshot() 后经 ProgressCallback 写库。
    """

    def __init__(self, total: int):
        self.total = max(1, total)
        self._lock = threading.Lock()
        self._completed = 0
        self._failed = 0
        self._current_steps: dict[str, str] = {}
        self._done = False

    def mark_started(self, extraction_type: str):
        with self._lock:
            self._current_steps[extraction_type] = "抽取中"

    def mark_finished(self, extraction_type: str, ok: bool, message: str = ""):
        with self._lock:
            self._current_steps.pop(extraction_type, None)
            if ok:
                self._completed += 1
            else:
                self._failed += 1

    def snapshot(self) -> dict:
        """返回 {completed, failed, step, done}，reporter 用。"""
        with self._lock:
            done_count = self._completed + self._failed
            return {
                "completed": self._completed,
                "failed": self._failed,
                "done": self._done or done_count >= self.total,
                "step": self._current_step_locked(done_count),
            }

    def mark_done(self):
        with self._lock:
            self._done = True

    def _current_step_locked(self, done_count: int) -> str:
        """生成进度文案：如「并行抽取 3/6 个场景」。"""
        if done_count >= self.total:
            if self._failed:
                return f"并行抽取完成，成功 {self._completed}/{self.total}，失败 {self._failed} 个场景"
            return f"并行抽取完成，共 {self._completed} 个场景"
        return f"并行抽取 {self._completed + self._failed}/{self.total} 个场景"
