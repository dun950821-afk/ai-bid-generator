<template>
  <div class="project-list">
    <div class="hero">
      <h1>项目管理</h1>
      <p>统一查看与管理参与的投标项目，按项目分配成员与权限。</p>
    </div>

    <el-card shadow="never" class="placeholder">
      <el-empty description="项目列表将由 projects 模块在后续阶段实现" />
    </el-card>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.project-list {
  display: grid;
  gap: 18px;
}
.hero {
  padding: 28px;
  background: linear-gradient(135deg, #ffffff, #eef4ff);
  border: 1px solid var(--app-border);
  border-radius: 24px;
}
.hero h1 {
  margin: 0 0 8px;
}
.hero p {
  margin: 0;
  color: var(--app-text-secondary);
}
.placeholder {
  border-radius: 18px;
}
</style>
