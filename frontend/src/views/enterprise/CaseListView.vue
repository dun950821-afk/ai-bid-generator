<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>企业项目案例</span>
          <div>
            <el-input
              v-model="keyword"
              placeholder="搜索项目/甲方"
              clearable
              style="width: 200px; margin-right: 8px"
              @change="load"
            />
            <el-button type="primary" @click="openDialog()">新增案例</el-button>
          </div>
        </div>
      </template>

      <el-table :data="cases" v-loading="loading" stripe>
        <el-table-column prop="project_name" label="项目名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="client_name" label="甲方名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="period_text" label="起止年月" width="140" />
        <el-table-column label="实施金额(万元)" width="120">
          <template #default="{ row }">{{ row.amount_text || '-' }}</template>
        </el-table-column>
        <el-table-column prop="client_contact" label="证明人" min-width="120" show-overflow-tooltip />
        <el-table-column prop="scope" label="项目范围" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && !cases.length" description="暂无案例, 点击右上角新增" />
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑案例' : '新增案例'" width="640px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="项目名称" required>
          <el-input v-model="form.project_name" placeholder="如: XX银行安全众测服务项目" />
        </el-form-item>
        <el-form-item label="甲方名称">
          <el-input v-model="form.client_name" placeholder="如: 常熟农村商业银行股份有限公司" />
        </el-form-item>
        <el-form-item label="证明人">
          <el-input v-model="form.client_contact" placeholder="姓名、职务、联系电话" />
        </el-form-item>
        <el-form-item label="实施金额(万元)">
          <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 200px" />
        </el-form-item>
        <el-form-item label="开始年月">
          <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width: 200px" />
        </el-form-item>
        <el-form-item label="结束年月">
          <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" style="width: 200px" />
        </el-form-item>
        <el-form-item label="项目范围概述">
          <el-input v-model="form.scope" type="textarea" :rows="3" placeholder="项目范围、服务内容概述" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createCase,
  deleteCase,
  getCaseList,
  updateCase,
  type CompanyCase,
} from '@/api/enterprise'

const loading = ref(false)
const saving = ref(false)
const cases = ref<CompanyCase[]>([])
const keyword = ref('')
const dialogVisible = ref(false)

const emptyForm = () => ({
  id: 0,
  project_name: '',
  client_name: '',
  client_contact: '',
  amount: null as number | null,
  start_date: null as string | null,
  end_date: null as string | null,
  scope: '',
  remark: '',
})

const form = reactive(emptyForm())

async function load() {
  loading.value = true
  try {
    const { data } = await getCaseList({ keyword: keyword.value || undefined })
    cases.value = data
  } catch (e) {
    ElMessage.error('加载案例失败')
  } finally {
    loading.value = false
  }
}

function openDialog(row?: CompanyCase) {
  Object.assign(form, emptyForm(), row ? {
    id: row.id,
    project_name: row.project_name,
    client_name: row.client_name,
    client_contact: row.client_contact,
    amount: row.amount,
    start_date: row.start_date,
    end_date: row.end_date,
    scope: row.scope,
    remark: row.remark,
  } : {})
  dialogVisible.value = true
}

async function save() {
  if (!form.project_name) {
    ElMessage.warning('请填写项目名称')
    return
  }
  saving.value = true
  try {
    const payload = {
      project_name: form.project_name,
      client_name: form.client_name,
      client_contact: form.client_contact,
      amount: form.amount,
      start_date: form.start_date,
      end_date: form.end_date,
      scope: form.scope,
      remark: form.remark,
    }
    if (form.id) {
      await updateCase(form.id, payload)
    } else {
      await createCase(payload)
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    load()
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: CompanyCase) {
  try {
    await ElMessageBox.confirm(`确认删除案例「${row.project_name}」?`, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteCase(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    ElMessage.error('删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
