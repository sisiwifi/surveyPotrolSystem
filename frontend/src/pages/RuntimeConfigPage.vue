<template>
  <section class="runtime-config-page">
    <BreadcrumbHeader
      :show-back="true"
      :crumbs="headerCrumbs"
      @back="goBack"
    />

    <Transition name="page-message">
      <p
        v-if="floatingMessage.visible"
        class="floating-message"
        :class="floatingMessage.type === 'error' ? 'floating-message--error' : 'floating-message--success'"
      >
        {{ floatingMessage.text }}
      </p>
    </Transition>

    <div class="runtime-config-page__scroller">
      <LoadingSpinner v-if="loading" />

      <div v-else class="runtime-config-page__stack">
        <section class="runtime-config-card">
          <div class="runtime-config-card__intro">
            <div>
              <h2 class="runtime-config-card__title">项目运行时配置</h2>
              <p class="runtime-config-card__desc">这里编辑的是启动器和后端共同读取的冷启动配置。保存后不会热更新，需重启项目才会生效。</p>
            </div>
            <span class="runtime-config-card__path">{{ configPath || '未找到配置文件路径' }}</span>
          </div>

          <label class="runtime-config-toggle">
            <input v-model="embeddedPostgresEnabled" type="checkbox">
            <span>启用项目内置 PostgreSQL 运行时</span>
          </label>

          <div class="runtime-config-grid">
            <label class="runtime-config-field">
              <span class="runtime-config-field__label">后端 Host</span>
              <input v-model.trim="backendHostDraft" class="runtime-config-input" type="text" autocomplete="off">
            </label>

            <label class="runtime-config-field">
              <span class="runtime-config-field__label">后端端口</span>
              <input v-model.trim="backendPortDraft" class="runtime-config-input" type="number" min="1" max="65535">
            </label>

            <label class="runtime-config-field">
              <span class="runtime-config-field__label">数据库 Host</span>
              <input v-model.trim="postgresHostDraft" class="runtime-config-input" type="text" autocomplete="off">
            </label>

            <label class="runtime-config-field">
              <span class="runtime-config-field__label">数据库端口</span>
              <input v-model.trim="postgresPortDraft" class="runtime-config-input" type="number" min="1" max="65535">
            </label>

            <label class="runtime-config-field">
              <span class="runtime-config-field__label">数据库用户</span>
              <input v-model.trim="postgresUserDraft" class="runtime-config-input" type="text" autocomplete="off">
            </label>

            <label class="runtime-config-field">
              <span class="runtime-config-field__label">数据库密码</span>
              <input v-model="postgresPasswordDraft" class="runtime-config-input" type="password" autocomplete="new-password">
            </label>

            <label class="runtime-config-field">
              <span class="runtime-config-field__label">业务库名</span>
              <input v-model.trim="postgresDbNameDraft" class="runtime-config-input" type="text" autocomplete="off">
            </label>

            <label class="runtime-config-field">
              <span class="runtime-config-field__label">管理库名</span>
              <input v-model.trim="postgresAdminDbNameDraft" class="runtime-config-input" type="text" autocomplete="off">
            </label>

            <label class="runtime-config-field runtime-config-field--full">
              <span class="runtime-config-field__label">运行时目录</span>
              <input v-model.trim="postgresRuntimeDirDraft" class="runtime-config-input" type="text" autocomplete="off">
            </label>

            <label class="runtime-config-field runtime-config-field--full">
              <span class="runtime-config-field__label">二进制目录</span>
              <input v-model.trim="postgresBinDirDraft" class="runtime-config-input" type="text" autocomplete="off">
            </label>

            <label class="runtime-config-field runtime-config-field--full">
              <span class="runtime-config-field__label">Cluster 数据目录</span>
              <input v-model.trim="postgresClusterDirDraft" class="runtime-config-input" type="text" autocomplete="off">
            </label>

            <label class="runtime-config-field runtime-config-field--full">
              <span class="runtime-config-field__label">日志文件</span>
              <input v-model.trim="postgresLogFileDraft" class="runtime-config-input" type="text" autocomplete="off">
            </label>
          </div>

          <div class="runtime-config-resolved">
            <p class="runtime-config-resolved__title">解析后的绝对路径</p>
            <div class="runtime-config-resolved__item">
              <span class="runtime-config-resolved__label">运行时目录</span>
              <span class="runtime-config-resolved__value">{{ resolvedPostgresRuntimeDir || '未解析' }}</span>
            </div>
            <div class="runtime-config-resolved__item">
              <span class="runtime-config-resolved__label">二进制目录</span>
              <span class="runtime-config-resolved__value">{{ resolvedPostgresBinDir || '未解析' }}</span>
            </div>
            <div class="runtime-config-resolved__item">
              <span class="runtime-config-resolved__label">Cluster 目录</span>
              <span class="runtime-config-resolved__value">{{ resolvedPostgresClusterDir || '未解析' }}</span>
            </div>
            <div class="runtime-config-resolved__item">
              <span class="runtime-config-resolved__label">日志文件</span>
              <span class="runtime-config-resolved__value">{{ resolvedPostgresLogFile || '未解析' }}</span>
            </div>
          </div>

          <p class="runtime-config-note">保存后请重新执行启动脚本。嵌入式 PostgreSQL 二进制当前应放在二进制目录下，至少包含 pg_ctl.exe 和 initdb.exe。</p>

          <p v-if="validationError" class="runtime-config-error">{{ validationError }}</p>
          <p v-else-if="errorMessage" class="runtime-config-error">{{ errorMessage }}</p>

          <div class="runtime-config-actions">
            <button class="runtime-config-button runtime-config-button--secondary" type="button" :disabled="saving" @click="fetchCurrentConfig">
              重新加载
            </button>
            <button class="runtime-config-button runtime-config-button--primary" type="button" :disabled="saving || Boolean(validationError)" @click="saveCurrentConfig">
              {{ saving ? '保存中…' : '保存运行时配置' }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script>
import BreadcrumbHeader from '../components/BreadcrumbHeader.vue'
import LoadingSpinner from '../components/LoadingSpinner.vue'
import { fetchRuntimeConfig, saveRuntimeConfig } from '../utils/runtimeConfig'

function toErrorMessage(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export default {
  name: 'RuntimeConfigPage',
  components: {
    BreadcrumbHeader,
    LoadingSpinner,
  },
  data() {
    return {
      loading: false,
      saving: false,
      errorMessage: '',
      configPath: '',
      embeddedPostgresEnabled: true,
      backendHostDraft: '127.0.0.1',
      backendPortDraft: '8000',
      postgresHostDraft: '127.0.0.1',
      postgresPortDraft: '5432',
      postgresUserDraft: 'postgres',
      postgresPasswordDraft: 'postgres123',
      postgresDbNameDraft: 'survey_potrol_system',
      postgresAdminDbNameDraft: 'postgres',
      postgresRuntimeDirDraft: 'runtime/postgresql',
      postgresBinDirDraft: 'runtime/postgresql/bin',
      postgresClusterDirDraft: 'data/postgresql/cluster',
      postgresLogFileDraft: 'data/postgresql/log/postgresql.log',
      resolvedPostgresRuntimeDir: '',
      resolvedPostgresBinDir: '',
      resolvedPostgresClusterDir: '',
      resolvedPostgresLogFile: '',
      floatingMessage: {
        visible: false,
        type: 'success',
        text: '',
      },
      floatingMessageTimer: null,
    }
  },
  computed: {
    headerCrumbs() {
      return [
        { label: '设置', title: '设置', to: '/settings' },
        { label: '运行时配置', title: '运行时配置', current: true },
      ]
    },
    parsedBackendPort() {
      const value = Number.parseInt(String(this.backendPortDraft ?? '').trim(), 10)
      return Number.isFinite(value) ? value : null
    },
    parsedPostgresPort() {
      const value = Number.parseInt(String(this.postgresPortDraft ?? '').trim(), 10)
      return Number.isFinite(value) ? value : null
    },
    validationError() {
      if (!String(this.backendHostDraft || '').trim()) return '后端 Host 不能为空。'
      if (this.parsedBackendPort === null || this.parsedBackendPort < 1 || this.parsedBackendPort > 65535) {
        return '后端端口必须在 1 到 65535 之间。'
      }
      if (!String(this.postgresHostDraft || '').trim()) return '数据库 Host 不能为空。'
      if (this.parsedPostgresPort === null || this.parsedPostgresPort < 1 || this.parsedPostgresPort > 65535) {
        return '数据库端口必须在 1 到 65535 之间。'
      }
      if (!String(this.postgresUserDraft || '').trim()) return '数据库用户不能为空。'
      if (!String(this.postgresPasswordDraft || '').trim()) return '数据库密码不能为空。'
      if (!String(this.postgresDbNameDraft || '').trim()) return '业务库名不能为空。'
      if (!String(this.postgresAdminDbNameDraft || '').trim()) return '管理库名不能为空。'
      if (!String(this.postgresRuntimeDirDraft || '').trim()) return '运行时目录不能为空。'
      if (!String(this.postgresBinDirDraft || '').trim()) return '二进制目录不能为空。'
      if (!String(this.postgresClusterDirDraft || '').trim()) return 'Cluster 目录不能为空。'
      if (!String(this.postgresLogFileDraft || '').trim()) return '日志文件不能为空。'
      return ''
    },
  },
  created() {
    this.fetchCurrentConfig()
  },
  beforeUnmount() {
    if (this.floatingMessageTimer) {
      clearTimeout(this.floatingMessageTimer)
      this.floatingMessageTimer = null
    }
  },
  methods: {
    goBack() {
      this.$router.push('/settings')
    },
    applyDrafts(config) {
      this.configPath = config.configPath || ''
      this.embeddedPostgresEnabled = Boolean(config.embeddedPostgresEnabled)
      this.backendHostDraft = String(config.backendHost || '127.0.0.1')
      this.backendPortDraft = String(config.backendPort || 8000)
      this.postgresHostDraft = String(config.postgresHost || '127.0.0.1')
      this.postgresPortDraft = String(config.postgresPort || 5432)
      this.postgresUserDraft = String(config.postgresUser || 'postgres')
      this.postgresPasswordDraft = String(config.postgresPassword || 'postgres123')
      this.postgresDbNameDraft = String(config.postgresDbName || 'survey_potrol_system')
      this.postgresAdminDbNameDraft = String(config.postgresAdminDbName || 'postgres')
      this.postgresRuntimeDirDraft = String(config.postgresRuntimeDir || 'runtime/postgresql')
      this.postgresBinDirDraft = String(config.postgresBinDir || 'runtime/postgresql/bin')
      this.postgresClusterDirDraft = String(config.postgresClusterDir || 'data/postgresql/cluster')
      this.postgresLogFileDraft = String(config.postgresLogFile || 'data/postgresql/log/postgresql.log')
      this.resolvedPostgresRuntimeDir = config.resolvedPostgresRuntimeDir || ''
      this.resolvedPostgresBinDir = config.resolvedPostgresBinDir || ''
      this.resolvedPostgresClusterDir = config.resolvedPostgresClusterDir || ''
      this.resolvedPostgresLogFile = config.resolvedPostgresLogFile || ''
    },
    showFloatingMessage(type, text) {
      if (this.floatingMessageTimer) {
        clearTimeout(this.floatingMessageTimer)
        this.floatingMessageTimer = null
      }

      this.floatingMessage = {
        visible: true,
        type,
        text,
      }

      this.floatingMessageTimer = setTimeout(() => {
        this.floatingMessage.visible = false
      }, 2600)
    },
    async fetchCurrentConfig() {
      this.loading = true
      this.errorMessage = ''
      try {
        const config = await fetchRuntimeConfig()
        this.applyDrafts(config)
      } catch (err) {
        this.errorMessage = `加载运行时配置失败：${toErrorMessage(err)}`
      } finally {
        this.loading = false
      }
    },
    async saveCurrentConfig() {
      if (this.validationError) {
        this.errorMessage = this.validationError
        return
      }

      this.saving = true
      this.errorMessage = ''
      try {
        const saved = await saveRuntimeConfig({
          backendHost: this.backendHostDraft,
          backendPort: this.parsedBackendPort,
          embeddedPostgresEnabled: this.embeddedPostgresEnabled,
          postgresHost: this.postgresHostDraft,
          postgresPort: this.parsedPostgresPort,
          postgresUser: this.postgresUserDraft,
          postgresPassword: this.postgresPasswordDraft,
          postgresDbName: this.postgresDbNameDraft,
          postgresAdminDbName: this.postgresAdminDbNameDraft,
          postgresRuntimeDir: this.postgresRuntimeDirDraft,
          postgresBinDir: this.postgresBinDirDraft,
          postgresClusterDir: this.postgresClusterDirDraft,
          postgresLogFile: this.postgresLogFileDraft,
        })
        this.applyDrafts(saved)
        this.showFloatingMessage('success', '运行时配置已保存，重启项目后生效。')
      } catch (err) {
        this.errorMessage = `保存运行时配置失败：${toErrorMessage(err)}`
        this.showFloatingMessage('error', this.errorMessage)
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style scoped>
.runtime-config-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.floating-message {
  position: fixed;
  top: 1.25rem;
  right: 1.25rem;
  z-index: 50;
  padding: 0.6rem 0.9rem;
  border-radius: 0.9rem;
  border: 1px solid transparent;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
  font-size: 0.88rem;
}

.floating-message--success {
  background: #ecfdf5;
  border-color: #86efac;
  color: #166534;
}

.floating-message--error {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #b91c1c;
}

.runtime-config-page__stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.runtime-config-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid #e2e8f0;
  border-radius: 1.25rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
}

.runtime-config-card__intro {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.9rem;
}

.runtime-config-card__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
}

.runtime-config-card__desc {
  margin: 0.35rem 0 0;
  color: #64748b;
  line-height: 1.65;
  font-size: 0.9rem;
}

.runtime-config-card__path {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  font-size: 0.76rem;
  word-break: break-all;
}

.runtime-config-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: #0f172a;
  font-weight: 700;
}

.runtime-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.runtime-config-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.runtime-config-field--full {
  grid-column: 1 / -1;
}

.runtime-config-field__label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
}

.runtime-config-input {
  min-height: 42px;
  padding: 0.72rem 0.85rem;
  border-radius: 0.9rem;
  border: 1px solid #cbd5e1;
  background: rgba(255, 255, 255, 0.98);
  color: #0f172a;
  font-size: 0.92rem;
}

.runtime-config-input:focus {
  outline: none;
  border-color: #0f766e;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.12);
}

.runtime-config-resolved {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.runtime-config-resolved__title {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 800;
  color: #334155;
}

.runtime-config-resolved__item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.runtime-config-resolved__label {
  font-size: 0.74rem;
  font-weight: 700;
  color: #64748b;
}

.runtime-config-resolved__value {
  font-size: 0.82rem;
  color: #0f172a;
  word-break: break-all;
}

.runtime-config-note {
  margin: 0;
  font-size: 0.83rem;
  line-height: 1.7;
  color: #475569;
}

.runtime-config-error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.83rem;
}

.runtime-config-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.runtime-config-button {
  min-height: 42px;
  padding: 0.7rem 1rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
}

.runtime-config-button--secondary {
  background: #ffffff;
  border-color: #cbd5e1;
  color: #334155;
}

.runtime-config-button--primary {
  background: linear-gradient(135deg, #0f766e, #0f766e 35%, #10b981);
  color: #ffffff;
}

.runtime-config-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 800px) {
  .runtime-config-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .runtime-config-actions {
    flex-direction: column;
  }

  .runtime-config-button {
    width: 100%;
  }
}
</style>