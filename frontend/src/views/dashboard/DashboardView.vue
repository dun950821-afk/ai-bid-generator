<template>
  <div class="dashboard">
    <div class="hero">
      <h1>工作台</h1>
      <p>从招标文件上传、AI 解析、章节生成到导出，全流程管理投标项目。</p>
    </div>

    <div class="cards">
      <el-card v-for="item in stats" :key="item.label" shadow="never" class="stat-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
const stats = [
  { label: '进行中项目', value: 0 },
  { label: '待解析文件', value: 0 },
  { label: '待处理任务', value: 0 },
  { label: '已导出标书', value: 0 },
]
</script>

<style scoped>
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
.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}
.stat-card {
  border-radius: 18px;
}
.stat-card span {
  color: var(--app-text-secondary);
}
.stat-card strong {
  display: block;
  margin-top: 10px;
  font-size: 30px;
}
</style>
